import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { SmallJobInput, QuickEstimateResultSchema, QuickEstimateResult } from '../schemas';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a C10 licensed electrician dispatcher for RnR Electrical LLC in Los Angeles.
A client has called or texted describing a small electrical job. Your job is to:
1. Determine if you have enough information to give a price range
2. If not, generate the 3-5 most important follow-up questions
3. If yes, provide a competitive price range for the Los Angeles market
4. Always apply the $350 service call minimum — this covers travel and up to 2 hours of labor

MINIMUM CHARGE POLICY: 
- $350 minimum for any job (covers first 2 hours + travel within LA)
- $125/hr after the first 2 hours
- This minimum applies even for simple replacements that take 30 minutes

LA MARKET RATES (2025):
- Light fixture replacement (existing power, easy access): $150–$250
- Light fixture replacement (needs new circuit): $350–$550
- New outlet (existing circuit nearby): $200–$350
- New outlet (new circuit required): $350–$550
- GFCI outlet replacement: $150–$200
- Panel breaker replacement: $200–$350
- Ceiling fan installation (existing outlet box): $200–$350
- Ceiling fan installation (new wiring needed): $400–$600
- EV charger installation: $900–$1,400
- Service call / troubleshooting (minimum): $350

KEY QUESTIONS TO DETERMINE SCOPE:
- Is this a replacement (existing power) or brand new location?
- Is there attic or crawl space access?
- What floor is the work on?
- How old is the home/panel?
- Does the panel have available breaker slots?
- Will the owner supply the fixture, or do we supply?

Return ONLY valid JSON — no markdown.`;

export async function runQuickEstimateAgent(
  input: SmallJobInput
): Promise<QuickEstimateResult> {
  const answersText = input.answers && Object.keys(input.answers).length > 0
    ? `\n\nFOLLOW-UP ANSWERS PROVIDED:\n${Object.entries(input.answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}`
    : '';

  const prompt = `A client described this job: "${input.description}"${answersText}

Based on this information, return JSON:
{
  "canProvidePrice": boolean,
  "rangeLow": number | null,
  "rangeHigh": number | null,
  "minimumApplies": boolean,
  "minimumAmount": 350,
  "followUpQuestions": string[],
  "lineItems": [
    {
      "id": "uuid",
      "category": "labor" | "minimum" | "devices" | "lighting" | "special",
      "description": string,
      "quantity": 1,
      "unitPrice": number,
      "total": number
    }
  ],
  "siteVisitRequired": boolean,
  "siteVisitReason": string | null,
  "notes": string
}

Rules:
- If canProvidePrice is false, followUpQuestions must have 2-5 questions
- If canProvidePrice is true, provide rangeLow and rangeHigh
- minimumApplies is always true unless job total clearly exceeds $350
- If siteVisitRequired is true, include a siteVisitReason and set canProvidePrice to false
- lineItems should reflect the estimated scope even if range is approximate
- All IDs must be unique UUID strings`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);

  // Ensure line item IDs
  if (parsed.lineItems) {
    parsed.lineItems = parsed.lineItems.map((item: any) => ({
      ...item,
      id: item.id && item.id.length > 5 ? item.id : uuidv4(),
    }));
  }

  // Always enforce minimum
  parsed.minimumAmount = 350;

  return QuickEstimateResultSchema.parse(parsed);
}
