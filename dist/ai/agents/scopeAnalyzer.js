"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScopeAnalyzerAgent = runScopeAnalyzerAgent;
const openai_1 = __importDefault(require("openai"));
const schemas_1 = require("../schemas");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = `You are a senior C10 licensed electrical contractor in Los Angeles.
Given raw electrical scope data extracted from construction plans, produce a clean, confirmed scope
that a field electrician can bid from. Apply current NEC and LAMC Title 26 code requirements.
Include standard code-required items even if not explicitly shown (AFCI breakers for bedrooms,
GFCI in bathrooms/kitchen/exterior, tamper-resistant receptacles throughout per NEC 406.12).
Return ONLY valid JSON — no markdown, no explanation.`;
async function runScopeAnalyzerAgent(extraction, iterationCount) {
    if (iterationCount >= schemas_1.MAX_AGENT_ITERATIONS) {
        throw new Error(`ScopeAnalyzerAgent exceeded max iterations (${schemas_1.MAX_AGENT_ITERATIONS})`);
    }
    const prompt = `Based on this raw extraction from electrical plans, produce a confirmed electrical scope.

RAW EXTRACTION:
${JSON.stringify(extraction, null, 2)}

Rules:
- If outlet count is null or 0, estimate based on NEC minimum spacing (one per 12 linear feet of wall) for the square footage
- Dedicated circuits: count one per heavy appliance (water heater, stove, W/D, dishwasher, microwave, AC unit)
- Smoke/CO detectors: per LAMC, minimum one per floor + one per bedroom
- Always include AFCI breakers for bedroom circuits and GFCI for wet locations
- If subPanel is mentioned, assume 100A minimum unless plans specify otherwise
- Generate a short professional exclusions list of items NOT included
- Generate a list of assumptions made

Return JSON with these exact fields:
{
  "squareFootage": number,
  "jobType": "adu" | "service_upgrade" | "remodel" | "small_job" | "ev_charger" | "other",
  "projectTitle": string,
  "outlets": number,
  "switches": number,
  "lightFixtures": number,
  "recessedLights": number,
  "ceilingFans": number,
  "dedicatedCircuits": number,
  "smokeCoDetectors": number,
  "exhaustFans": number,
  "subPanelAmps": number | null,
  "subPanelSpaces": number | null,
  "mainPanelUpgrade": boolean,
  "mainPanelAmps": number | null,
  "solarPanels": boolean,
  "evCharger": boolean,
  "trenchingFeet": number,
  "ownerSuppliesFixtures": boolean,
  "exclusions": string[],
  "assumptions": string[]
}`;
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    return schemas_1.ElectricalScopeSchema.parse(parsed);
}
//# sourceMappingURL=scopeAnalyzer.js.map