import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PlanExtractionSchema, PlanExtraction, MAX_AGENT_ITERATIONS } from '../schemas';
import { getLearningPromptHints } from '../learningProfile';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

// PDFs larger than this go to Gemini (OpenAI Files API cap)
const OPENAI_PDF_LIMIT_BYTES = 32 * 1024 * 1024;

const SYSTEM_PROMPT = `You are a licensed C10 electrical estimator specializing in Los Angeles residential and ADU electrical work.
You will receive either extracted text from an architectural PDF plan set, or an image of a plan page.

Your job is to extract every electrical scope item visible in the plans.
Follow NEC (current edition) and Los Angeles electrical code (LAMC Title 26).
Title 24 energy compliance items (AFCI, GFCI, LED, vacancy sensors) are assumed included per code.

Return ONLY valid JSON matching the schema — no markdown, no explanation.`;

const MAX_TEXT_PROMPT_CHARS = 12000;
const ELECTRICAL_KEYWORDS = [
  'electrical',
  'panel',
  'service',
  'breaker',
  'outlet',
  'receptacle',
  'switch',
  'fixture',
  'lighting',
  'recessed',
  'afan',
  'ceiling fan',
  'smoke detector',
  'co detector',
  'gfci',
  'afci',
  'ev charger',
  'water heater',
  'range',
  'dishwasher',
  'microwave',
  'laundry',
  'subpanel',
  'load calc',
  'single line',
  'title 24',
  'plan legend',
  'symbol',
  'sheet e',
  'e0',
  'e1',
  'e2',
];

function splitPlanSections(raw: string): string[] {
  const formFeedSections = raw
    .split(/\f+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (formFeedSections.length > 1) return formFeedSections;

  return raw
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function scoreSection(section: string): number {
  const lower = section.toLowerCase();
  let score = 0;

  for (const keyword of ELECTRICAL_KEYWORDS) {
    if (lower.includes(keyword)) score += 3;
  }

  if (/\b(electrical|elec|sheet\s+e\d|panel\s+schedule|legend)\b/.test(lower)) score += 6;
  if (/\b(outlet|receptacle|switch|fixture|lighting|detector|fan)\b/.test(lower)) score += 4;
  if (/\b(general notes|building standards|structural notes)\b/.test(lower)) score -= 2;

  return score;
}

function buildFocusedPlanText(rawText: string, maxChars: number = MAX_TEXT_PROMPT_CHARS): string {
  const text = rawText.trim();
  if (text.length <= maxChars) return text;

  const sections = splitPlanSections(text);
  if (sections.length === 0) return text.slice(0, maxChars);

  const scored = sections.map((section, idx) => ({
    idx,
    section,
    score: scoreSection(section),
  }));

  const selected = new Set<number>();
  // Keep project metadata context from the first section.
  selected.add(0);

  // Keep the highest-signal electrical sections.
  for (const candidate of scored.sort((a, b) => b.score - a.score)) {
    if (selected.size >= 6) break;
    if (candidate.score <= 0) continue;
    selected.add(candidate.idx);
  }

  // Ensure we include the end of plan set where panel schedules are often located.
  selected.add(sections.length - 1);

  const ordered = Array.from(selected).sort((a, b) => a - b);
  let combined = '';

  for (const index of ordered) {
    const header = `\n\n--- SECTION ${index + 1} ---\n`;
    const nextChunk = `${header}${sections[index]}`;
    if ((combined + nextChunk).length > maxChars) break;
    combined += nextChunk;
  }

  if (!combined) {
    // Fall back to head+tail instead of only head when sectioning fails.
    const half = Math.floor(maxChars / 2);
    return `${text.slice(0, half)}\n\n...\n\n${text.slice(-half)}`;
  }

  return combined.trim();
}

function buildTextPrompt(text: string, learningHints: string): string {
  const focusedText = buildFocusedPlanText(text);
  return `You are a licensed C10 electrical estimator. Analyze the following extracted plan text.

${learningHints ? `LEARNING PROFILE:\n${learningHints}\n` : ''}

STEP 1 — FIND THE LEGEND
Look for any electrical symbol legend, key, or table in the text (often labeled "ELECTRICAL LEGEND", "SYMBOL KEY", or similar).
Note every symbol listed and what it represents.

STEP 2 — COUNT ITEMS
Using the legend as a guide, count every electrical item mentioned throughout the plan text.
Look for room-by-room schedules, panel schedules, lighting schedules, and fixture counts.
Where a count is explicitly stated (e.g. "(3) GFCI OUTLETS"), use that number.
If a legend exists, include every legend item with a count, even if count is 0.

STEP 3 — OUTPUT JSON
Return ONLY valid JSON with these exact fields (no markdown):
{
  "squareFootage": number | null,
  "projectDescription": string,
  "detectedItems": {
    "outlets": number | null,
    "switches": number | null,
    "lightFixtures": number | null,
    "recessedLights": number | null,
    "ceilingFans": number | null,
    "smokeDetectors": number | null,
    "carbonMonoxideDetectors": number | null,
    "exhaustFans": number | null,
    "electricWaterHeater": boolean,
    "electricStove": boolean,
    "washerDryer": boolean,
    "dishwasher": boolean,
    "microwave": boolean,
    "mainPanelAmps": number | null,
    "subPanelAmps": number | null,
    "subPanelSpaces": number | null,
    "solarPanels": boolean,
    "evCharger": boolean,
    "trenchingRequired": boolean,
    "trenchingFeet": number | null,
    "ownerSuppliesFixtures": boolean | null
  },
  "parserNotes": string | null,
  "confidence": "high" | "medium" | "low",
  "legendItems": {
    "vacancySensors": number | null,
    "fluorescentFixtures": number | null,
    "wallMountedFixtures": number | null,
    "indoorAirVentFans": number | null,
    "gfciOutlets": number | null,
    "afciCircuits": number | null
  }
}

Set confidence to "high" when counts come directly from schedules or explicit quantities.
Set "medium" when counts are inferred from the legend/room descriptions.
Set "low" when there is little electrical content in the text.
In parserNotes summarize which items were found and any assumptions made.

PLAN TEXT:
${focusedText}`;
}

function buildImagePrompt(learningHints: string): object[] {
  return [
    {
      type: 'text' as const,
      text: `You are a licensed C10 electrical estimator. Analyze this architectural plan image.

${learningHints ? `LEARNING PROFILE:\n${learningHints}\n` : ''}

STEP 1 — FIND THE LEGEND
Locate the electrical symbol legend or key on this sheet (it often appears in a corner box labeled
"ELECTRICAL LEGEND", "SYMBOL LEGEND", or "KEY"). List every symbol you see and what it represents
(e.g. circle with G = GFCI outlet, triangle = recessed light, square with X = exhaust fan, etc.).

STEP 1B — READ PAGE 1 SUMMARY IF PRESENT
If this sheet includes project summary/title information, capture the project name/address/square footage.
If not present on this sheet, keep squareFootage as null instead of guessing.

STEP 2 — COUNT EACH SYMBOL
Using the legend you identified, scan the ENTIRE floor plan and count every occurrence of each symbol.
Be thorough — look in every room, hallway, bathroom, kitchen, garage, and outdoor area.
Do NOT estimate — count each symbol mark individually.
For every symbol listed in the legend, provide a count (use 0 if not present).

STEP 3 — IDENTIFY OTHER ELECTRICAL SCOPE
Note any panel schedule, load calculation, or notes that indicate:
- Main or sub-panel amperage
- Distance/run between main panel and subpanel (if noted)
- EV charger circuit
- Solar/PV system
- Trenching or underground conduit
- Special appliance circuits (washer/dryer, dishwasher, range, microwave, water heater)
- HVAC/AC electrical load, disconnects, and dedicated circuits
- Symbols/notes for GFI/GFCI, smoke detector, carbon monoxide detector, single-pole switch, and light switch

STEP 3B — WIRE TAKEOFF NOTES (ESTIMATE)
In parserNotes, include a compact wire takeoff estimate using the counted symbols and visible run paths:
- 12/2 Romex for receptacle/outlet branch circuits (including GFI/GFCI receptacles)
- 14/2 Romex for lighting branches
- 14/3 Romex where 3-way switching is shown/likely
- 10/2 Romex for 30A loads (A/C unit, electric water heater, dryer, etc. when indicated)
If distance is visible from panel/subpanel to load areas, include estimated footage by wire type.
If exact distance is not measurable, clearly mark as estimated range.

STEP 4 — OUTPUT JSON
Return ONLY valid JSON with these exact fields (no markdown, no explanation):
{
  "squareFootage": number | null,
  "projectDescription": string,
  "detectedItems": {
    "outlets": number | null,
    "switches": number | null,
    "lightFixtures": number | null,
    "recessedLights": number | null,
    "ceilingFans": number | null,
    "smokeDetectors": number | null,
    "carbonMonoxideDetectors": number | null,
    "exhaustFans": number | null,
    "electricWaterHeater": boolean,
    "electricStove": boolean,
    "washerDryer": boolean,
    "dishwasher": boolean,
    "microwave": boolean,
    "mainPanelAmps": number | null,
    "subPanelAmps": number | null,
    "subPanelSpaces": number | null,
    "solarPanels": boolean,
    "evCharger": boolean,
    "trenchingRequired": boolean,
    "trenchingFeet": number | null,
    "ownerSuppliesFixtures": boolean | null
  },
  "parserNotes": string | null,
  "confidence": "high" | "medium" | "low",
  "legendItems": {
    "vacancySensors": number | null,
    "fluorescentFixtures": number | null,
    "wallMountedFixtures": number | null,
    "indoorAirVentFans": number | null,
    "gfciOutlets": number | null,
    "afciCircuits": number | null
  }
}

Set confidence to "high" when you found a legend and counted symbols directly.
Set "medium" when you identified items but the legend was missing or partial.
Set "low" when you could not find a legend and item counts are estimates.
In parserNotes, list the symbols you found in the legend and their counts, then include wire takeoff lines like:
"12/2: ~X ft, 14/2: ~Y ft, 14/3: ~Z ft, 10/2: ~W ft" and key assumptions.`,
    },
  ];
}

function extractCountFromNotes(notes: string | null | undefined, label: string): number | null {
  if (!notes) return null;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escaped}\\s*[:=]\\s*\\(?\\s*(\\d+)\\s*\\)?`, 'i'),
    new RegExp(`${escaped}\\s*\\(\\s*(\\d+)\\s*\\)`, 'i'),
    new RegExp(`(\\d+)\\s*${escaped}`, 'i'),
  ];
  for (const re of patterns) {
    const m = notes.match(re);
    if (m?.[1]) return Number(m[1]);
  }
  return null;
}

function reconcileCountsFromNotes(extraction: PlanExtraction): void {
  const notes = extraction.parserNotes;
  extraction.legendItems = extraction.legendItems ?? {
    vacancySensors: null,
    fluorescentFixtures: null,
    wallMountedFixtures: null,
    indoorAirVentFans: null,
    gfciOutlets: null,
    afciCircuits: null,
  };

  const bumpMax = (current: number | null, next: number | null): number | null => {
    if (typeof next !== 'number' || Number.isNaN(next)) return current;
    if (typeof current !== 'number' || Number.isNaN(current)) return next;
    return Math.max(current, next);
  };

  extraction.detectedItems.outlets = bumpMax(
    extraction.detectedItems.outlets,
    extractCountFromNotes(notes, 'outlets') ?? extractCountFromNotes(notes, 'receptacles')
  );
  extraction.detectedItems.switches = bumpMax(
    extraction.detectedItems.switches,
    extractCountFromNotes(notes, 'switches')
  );
  extraction.detectedItems.lightFixtures = bumpMax(
    extraction.detectedItems.lightFixtures,
    extractCountFromNotes(notes, 'light fixtures')
  );
  extraction.detectedItems.recessedLights = bumpMax(
    extraction.detectedItems.recessedLights,
    extractCountFromNotes(notes, 'recessed lights')
  );
  extraction.detectedItems.ceilingFans = bumpMax(
    extraction.detectedItems.ceilingFans,
    extractCountFromNotes(notes, 'ceiling fans')
  );
  extraction.detectedItems.smokeDetectors = bumpMax(
    extraction.detectedItems.smokeDetectors,
    extractCountFromNotes(notes, 'smoke detectors')
  );
  extraction.detectedItems.carbonMonoxideDetectors = bumpMax(
    extraction.detectedItems.carbonMonoxideDetectors,
    extractCountFromNotes(notes, 'carbon monoxide detectors')
  );
  extraction.detectedItems.exhaustFans = bumpMax(
    extraction.detectedItems.exhaustFans,
    extractCountFromNotes(notes, 'exhaust fans')
  );

  extraction.legendItems.vacancySensors = bumpMax(
    extraction.legendItems.vacancySensors,
    extractCountFromNotes(notes, 'vacancy sensor') ?? extractCountFromNotes(notes, 'vacancy sensors')
  );
  extraction.legendItems.fluorescentFixtures = bumpMax(
    extraction.legendItems.fluorescentFixtures,
    extractCountFromNotes(notes, 'fluorescent') ?? extractCountFromNotes(notes, 'fluorescent fixtures')
  );
  extraction.legendItems.wallMountedFixtures = bumpMax(
    extraction.legendItems.wallMountedFixtures,
    extractCountFromNotes(notes, 'wall mounted') ?? extractCountFromNotes(notes, 'wall-mounted fixtures')
  );
  extraction.legendItems.indoorAirVentFans = bumpMax(
    extraction.legendItems.indoorAirVentFans,
    extractCountFromNotes(notes, 'air vent') ?? extractCountFromNotes(notes, 'indoor air ventilation fan')
  );
  extraction.legendItems.gfciOutlets = bumpMax(
    extraction.legendItems.gfciOutlets,
    extractCountFromNotes(notes, 'gfci') ?? extractCountFromNotes(notes, 'gfi')
  );

  extraction.detectedItems.switches = bumpMax(
    extraction.detectedItems.switches,
    extraction.legendItems.vacancySensors
  );
  extraction.detectedItems.lightFixtures = bumpMax(
    extraction.detectedItems.lightFixtures,
    extraction.legendItems.fluorescentFixtures
  );
  extraction.detectedItems.lightFixtures = bumpMax(
    extraction.detectedItems.lightFixtures,
    extraction.legendItems.wallMountedFixtures
  );
  extraction.detectedItems.exhaustFans = bumpMax(
    extraction.detectedItems.exhaustFans,
    extraction.legendItems.indoorAirVentFans
  );
  extraction.detectedItems.outlets = bumpMax(
    extraction.detectedItems.outlets,
    extraction.legendItems.gfciOutlets
  );
}

// ─── Gemini helper — handles large PDFs (and images) natively ─────────────────
async function runWithGemini(data: Buffer, mimeType: string, learningHints: string): Promise<string> {
  const model = genai.getGenerativeModel({ model: 'gemini-1.5-pro' });
  const prompt = `You are a licensed C10 electrical estimator specializing in Los Angeles residential and ADU electrical work.

${learningHints ? `LEARNING PROFILE:\n${learningHints}\n` : ''}

STEP 1 — FIND THE LEGEND
Locate the electrical symbol legend or key on this document (often labeled "ELECTRICAL LEGEND", "SYMBOL LEGEND", or "KEY").
List every symbol and what it represents (e.g. circle with G = GFCI outlet, filled triangle = recessed light, fan symbol = ceiling/exhaust fan).

STEP 1B — PRIORITIZE PAGE 1 SUMMARY
When processing a full PDF, prioritize page 1 for project metadata (project title, address, square footage).
Use those values as canonical when available.

STEP 2 — COUNT EACH SYMBOL
Using the legend, scan the ENTIRE floor plan and count every occurrence of each symbol across all rooms, hallways, bathrooms, kitchen, garage, and outdoor areas.
Do NOT estimate — count each symbol mark individually.
For every legend symbol, include a count (0 if not present).

STEP 3 — IDENTIFY OTHER ELECTRICAL SCOPE
Note any panel schedule, single-line diagram, or notes indicating:
- Main or sub-panel amperage and spaces
- Distance/run length between main panel and subpanel (if explicitly noted)
- EV charger circuit
- Solar/PV system
- Trenching or underground conduit runs
- Special appliance circuits (washer/dryer, range, dishwasher, microwave, water heater)
- HVAC/AC unit circuits, disconnects, and electrical loads
- GFI/GFCI, smoke detector, carbon monoxide detector, single-pole switch, and light switch counts where shown

STEP 3B — WIRE TAKEOFF NOTES (ESTIMATE)
In parserNotes, include a compact wire takeoff estimate based on counted symbols and visible run paths:
- 12/2 Romex for outlets/receptacle circuits
- 14/2 Romex for lighting circuits
- 14/3 Romex for 3-way switching where applicable
- 10/2 Romex for 30A equipment loads (A/C, water heater, dryer, etc.)
If distances are marked on plan, use them. If not, provide estimated ranges and state assumptions.

STEP 4 — OUTPUT JSON
Return ONLY valid JSON exactly matching this schema — no markdown, no explanation:
{
  "squareFootage": number | null,
  "projectDescription": string,
  "detectedItems": {
    "outlets": number | null,
    "switches": number | null,
    "lightFixtures": number | null,
    "recessedLights": number | null,
    "ceilingFans": number | null,
    "smokeDetectors": number | null,
    "carbonMonoxideDetectors": number | null,
    "exhaustFans": number | null,
    "electricWaterHeater": boolean,
    "electricStove": boolean,
    "washerDryer": boolean,
    "dishwasher": boolean,
    "microwave": boolean,
    "mainPanelAmps": number | null,
    "subPanelAmps": number | null,
    "subPanelSpaces": number | null,
    "solarPanels": boolean,
    "evCharger": boolean,
    "trenchingRequired": boolean,
    "trenchingFeet": number | null,
    "ownerSuppliesFixtures": boolean | null
  },
  "parserNotes": string | null,
  "confidence": "high" | "medium" | "low",
  "legendItems": {
    "vacancySensors": number | null,
    "fluorescentFixtures": number | null,
    "wallMountedFixtures": number | null,
    "indoorAirVentFans": number | null,
    "gfciOutlets": number | null,
    "afciCircuits": number | null
  }
}

Set confidence to "high" when you found a legend and counted symbols directly.
Set "medium" when items were identified but legend was missing or partial.
Set "low" when no legend was found and counts are estimates.
In parserNotes, describe every symbol found in the legend and the count for each, plus the wire takeoff summary for 12/2, 14/2, 14/3, and 10/2.`;

  const result = await model.generateContent([
    { inlineData: { mimeType, data: data.toString('base64') } },
    { text: prompt },
  ]);
  return result.response.text();
}

export async function runPlanParserAgent(
  input: { text?: string; imageBase64?: string; mimeType?: string },
  iterationCount: number
): Promise<PlanExtraction> {
  if (iterationCount >= MAX_AGENT_ITERATIONS) {
    throw new Error(`PlanParserAgent exceeded max iterations (${MAX_AGENT_ITERATIONS})`);
  }

  let response: string;
  const learningHints = getLearningPromptHints();

  if (input.imageBase64 && input.mimeType) {
    if (input.mimeType === 'application/pdf') {
      const pdfBuffer = Buffer.from(input.imageBase64, 'base64');

      if (pdfBuffer.length > OPENAI_PDF_LIMIT_BYTES || !process.env.OPENAI_API_KEY) {
        // ── Large / fallback path: Gemini 1.5 Pro (handles PDFs up to 2 GB) ──
        response = await runWithGemini(pdfBuffer, 'application/pdf', learningHints);
      } else {
        // ── Small scanned PDF: OpenAI Files API ──────────────────────────────
        const uploadedFile = await openai.files.create({
          file: new File([pdfBuffer], 'plan.pdf', { type: 'application/pdf' }),
          purpose: 'user_data',
        });
        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  ...(buildImagePrompt(learningHints) as any[]),
                  { type: 'file', file: { file_id: uploadedFile.id } } as any,
                ],
              },
            ],
            temperature: 0,
            max_tokens: 2000,
          });
          response = completion.choices[0]?.message?.content ?? '{}';
        } finally {
          await openai.files.delete(uploadedFile.id).catch(() => {});
        }
      }
    } else {
      // Image file (JPEG, PNG, WebP) — send as base64 data URI
      const imageContent = buildImagePrompt(learningHints);
      imageContent.push({
        type: 'image_url' as const,
        // @ts-ignore
        image_url: {
          url: `data:${input.mimeType};base64,${input.imageBase64}`,
          detail: 'high',
        },
      } as any);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: imageContent as any },
        ],
        temperature: 0,
        max_tokens: 2000,
      });
      response = completion.choices[0]?.message?.content ?? '{}';
    }
  } else if (input.text) {
    // GPT-4o-mini for text-based PDF extraction (cheaper)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildTextPrompt(input.text, learningHints) },
      ],
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });
    response = completion.choices[0]?.message?.content ?? '{}';
  } else {
    throw new Error('PlanParserAgent: must provide either text or imageBase64');
  }

  // Strip markdown fences if present
  let cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // If the response isn't a JSON object, try to extract the first {...} block
  if (!cleaned.startsWith('{')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  // Detect model refusals / non-JSON responses (e.g. "I'm unable to...", "I cannot...")
  // Return a graceful low-confidence empty extraction so the user can fill in manually.
  if (!cleaned.startsWith('{')) {
    const refusalSnippet = response.slice(0, 200);
    return PlanExtractionSchema.parse({
      squareFootage: null,
      projectDescription: 'Unable to extract — please fill in manually',
      detectedItems: {
        outlets: null, switches: null, lightFixtures: null, recessedLights: null,
        ceilingFans: null, smokeDetectors: null, carbonMonoxideDetectors: null,
        exhaustFans: null, electricWaterHeater: false, electricStove: false,
        washerDryer: false, dishwasher: false, microwave: false,
        mainPanelAmps: null, subPanelAmps: null, subPanelSpaces: null,
        solarPanels: false, evCharger: false, trenchingRequired: false,
        trenchingFeet: null, ownerSuppliesFixtures: null,
      },
      parserNotes: `AI could not read this page: "${refusalSnippet}". Please fill in the scope fields manually.`,
      confidence: 'low',
      legendItems: {
        vacancySensors: null,
        fluorescentFixtures: null,
        wallMountedFixtures: null,
        indoorAirVentFans: null,
        gfciOutlets: null,
        afciCircuits: null,
      },
    });
  }

  const parsed = JSON.parse(cleaned);
  const extraction = PlanExtractionSchema.parse(parsed);
  extraction.legendItems = extraction.legendItems ?? {
    vacancySensors: null,
    fluorescentFixtures: null,
    wallMountedFixtures: null,
    indoorAirVentFans: null,
    gfciOutlets: null,
    afciCircuits: null,
  };

  // Roll legend-specific items into core counts so downstream pricing uses them.
  const li = extraction.legendItems;
  if (li) {
    const bump = (base: number | null, add: number | null | undefined): number | null => {
      if (typeof add !== 'number' || add <= 0) return base;
      return (base ?? 0) + add;
    };

    extraction.detectedItems.switches = bump(extraction.detectedItems.switches, li.vacancySensors);
    extraction.detectedItems.lightFixtures = bump(extraction.detectedItems.lightFixtures, li.fluorescentFixtures);
    extraction.detectedItems.lightFixtures = bump(extraction.detectedItems.lightFixtures, li.wallMountedFixtures);
    extraction.detectedItems.exhaustFans = bump(extraction.detectedItems.exhaustFans, li.indoorAirVentFans);

    if (typeof li.gfciOutlets === 'number' && li.gfciOutlets > (extraction.detectedItems.outlets ?? 0)) {
      extraction.detectedItems.outlets = li.gfciOutlets;
    }
  }

  // Reconcile symbol counts reported in parserNotes with JSON counts.
  reconcileCountsFromNotes(extraction);

  return extraction;
}
