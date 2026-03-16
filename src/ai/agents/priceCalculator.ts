import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { ElectricalScope, PricedEstimateSchema, PricedEstimate, MAX_AGENT_ITERATIONS } from '../schemas';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Pricing anchors (real won bid + LA market rates) ─────────────────────────
// Source: RnR Electrical won ADU bid ($9,800 for 646sqft) + LA market research
const PRICING_CONTEXT = `
REAL WON BID ANCHOR (RnR Electrical — Los Angeles market, 2025):
- 646 sqft ADU, full electrical: $9,800 total
- Scope: 100A subpanel (20-24 space), wire circuits, lighting, fans, devices
- This was a competitive winning bid — price accordingly

LA MARKET UNIT RATES (2025, residential):
- 100A subpanel (20-24 space, installed): $1,800–$2,200
- 200A service upgrade (main panel): $3,500–$5,000
- Wire new circuit (rough + finish): $250–$400 each
- Outlet (receptacle, installed): $85–$120 each
- Switch (single pole, installed): $75–$100 each
- Recessed LED light (installed, standard): $95–$130 each
- Ceiling fan rough + finish (no fixture): $150–$200 each
- Exhaust fan (installed): $180–$250 each
- Smoke/CO detector (hardwired): $85–$120 each
- Dedicated circuit (240V appliance): $350–$600 each
- Trenching (open trench, per linear foot): $18–$30/ft
- EV charger (Level 2, 50A circuit): $900–$1,400
- Solar disconnect/interconnect: $800–$1,200

SMALL JOB MINIMUM: $350 (covers travel + up to 2 hours labor)

MARGIN GUIDANCE:
- Be competitive (not the cheapest, not the most expensive)
- Target 35-45% gross margin on material+labor combined
- For ADUs under $15k, keep pricing within 10-15% of the real won bid above
`;

const SYSTEM_PROMPT = `You are an expert electrical estimator for a C10 licensed contractor in Los Angeles.
Your job is to price a confirmed electrical scope using the provided market rates and real bid anchors.
Generate precise line items grouped by category. Round to nearest $50 on totals.
Return ONLY valid JSON — no markdown, no explanation.`;

function round50(n: number): number {
  return Math.round(n / 50) * 50;
}

function isSmallScope(scope: ElectricalScope): boolean {
  const deviceCount =
    scope.outlets +
    scope.switches +
    scope.lightFixtures +
    scope.recessedLights +
    scope.ceilingFans +
    scope.smokeCoDetectors +
    scope.exhaustFans;

  return (
    deviceCount <= 6 &&
    !scope.mainPanelUpgrade &&
    !scope.subPanelAmps &&
    !scope.evCharger &&
    !scope.solarPanels &&
    scope.dedicatedCircuits <= 1
  );
}

function estimateTargetSubtotal(scope: ElectricalScope): number {
  const smokeCo = scope.smokeCoDetectors;

  const panel =
    (scope.mainPanelUpgrade ? 4200 : 0) +
    (scope.subPanelAmps ? 2000 : 0);

  const wiringCircuitCount = Math.max(
    4,
    Math.ceil((scope.outlets + scope.switches + scope.lightFixtures + scope.recessedLights + scope.ceilingFans) / 5) +
      scope.dedicatedCircuits
  );
  const wiring = wiringCircuitCount * 300;

  const devices =
    scope.outlets * 95 +
    scope.switches * 85 +
    scope.lightFixtures * 95 +
    scope.recessedLights * 110 +
    scope.ceilingFans * 175 +
    smokeCo * 100 +
    scope.exhaustFans * 215;

  const applianceCircuits = scope.dedicatedCircuits * 450;
  const trenching = scope.trenchingFeet * 24;
  const special = (scope.evCharger ? 1100 : 0) + (scope.solarPanels ? 950 : 0);

  return panel + wiring + devices + applianceCircuits + trenching + special;
}

function calibrateEstimate(scope: ElectricalScope, parsed: any): any {
  if (!parsed || !Array.isArray(parsed.lineItems)) return parsed;

  // Job minimum only applies to very small service-call scopes.
  if (!isSmallScope(scope)) {
    parsed.lineItems = parsed.lineItems.filter((item: any) => {
      const desc = String(item.description ?? '').toLowerCase();
      const cat = String(item.category ?? '').toLowerCase();
      return !(cat === 'minimum' || desc.includes('minimum'));
    });
  }

  const target = estimateTargetSubtotal(scope);
  const rangeLow = round50(target * 0.9);
  const rangeHigh = round50(target * 1.15);

  // Guardrail: prevent runaway "wire circuits" quantity inflation.
  const maxWiringQty = Math.max(
    4,
    Math.ceil((scope.outlets + scope.switches + scope.lightFixtures + scope.recessedLights + scope.ceilingFans) / 4) +
      scope.dedicatedCircuits
  );

  parsed.lineItems = parsed.lineItems.map((item: any) => {
    const desc = String(item.description ?? '').toLowerCase();
    if (desc.includes('wire') && desc.includes('circuit') && typeof item.quantity === 'number' && item.quantity > maxWiringQty) {
      const qty = maxWiringQty;
      const unit = typeof item.unitPrice === 'number' ? item.unitPrice : 300;
      return { ...item, quantity: qty, total: round50(qty * unit) };
    }
    return item;
  });

  let subtotal = parsed.lineItems.reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);

  // Guardrail: scale whole estimate back into realistic band when AI overshoots.
  if (subtotal > rangeHigh * 1.05 || subtotal < rangeLow * 0.75) {
    const targetMid = round50((rangeLow + rangeHigh) / 2);
    const factor = targetMid > 0 && subtotal > 0 ? targetMid / subtotal : 1;

    parsed.lineItems = parsed.lineItems.map((item: any) => {
      const scaledUnit = round50((Number(item.unitPrice) || 0) * factor);
      const qty = Number(item.quantity) || 0;
      const total = round50(scaledUnit * qty);
      return { ...item, unitPrice: scaledUnit, total };
    });
    subtotal = parsed.lineItems.reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);
  }

  parsed.subtotal = round50(subtotal);
  parsed.tax = 0;
  parsed.total = parsed.subtotal;
  parsed.marketRangeLow = rangeLow;
  parsed.marketRangeHigh = rangeHigh;

  if (parsed.total < rangeLow) parsed.competitivePosition = 'below';
  else if (parsed.total > rangeHigh) parsed.competitivePosition = 'above';
  else parsed.competitivePosition = 'competitive';

  parsed.pricingNotes = `${parsed.pricingNotes ?? ''} Calibrated to scope-based LA target band (${rangeLow}-${rangeHigh}) to avoid circuit overcount inflation.`.trim();
  return parsed;
}

export async function runPriceCalculatorAgent(
  scope: ElectricalScope,
  iterationCount: number
): Promise<PricedEstimate> {
  if (iterationCount >= MAX_AGENT_ITERATIONS) {
    throw new Error(`PriceCalculatorAgent exceeded max iterations (${MAX_AGENT_ITERATIONS})`);
  }

  const prompt = `Price the following confirmed electrical scope.

${PRICING_CONTEXT}

CONFIRMED SCOPE:
${JSON.stringify(scope, null, 2)}

Return JSON with these exact fields:
{
  "lineItems": [
    {
      "id": "uuid-string",
      "category": "panel" | "wiring" | "devices" | "lighting" | "appliance" | "trenching" | "special" | "labor" | "minimum",
      "description": string,
      "quantity": number,
      "unitPrice": number,
      "total": number,
      "notes": string (optional)
    }
  ],
  "subtotal": number,
  "tax": number,
  "total": number,
  "pricingNotes": string,
  "marketRangeLow": number,
  "marketRangeHigh": number,
  "competitivePosition": "below" | "competitive" | "above"
}

Rules:
- tax is 0 (electrical labor is not taxed in CA; materials tax is typically absorbed)
- Generate one line item per meaningful scope category, not per individual device
- Keep the number of line items between 4 and 10 (match RnR's format)
- Only add "Job minimum charge" for true small service-call scopes (single/small task).
- For ADUs/full-plan estimates, do NOT include a minimum charge line item.
- All IDs must be unique strings`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);

  const calibrated = calibrateEstimate(scope, parsed);

  // Ensure all line items have UUIDs
  if (calibrated.lineItems) {
    calibrated.lineItems = calibrated.lineItems.map((item: any) => ({
      ...item,
      id: item.id && item.id.length > 5 ? item.id : uuidv4(),
    }));
  }

  return PricedEstimateSchema.parse(calibrated);
}
