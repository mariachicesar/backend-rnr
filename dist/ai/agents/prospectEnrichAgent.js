"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProspectEnrichAgent = runProspectEnrichAgent;
const openai_1 = __importDefault(require("openai"));
const b2bSchemas_1 = require("../schemas/b2bSchemas");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = `You enrich B2B prospect records for RnR Electrician, a licensed C-10 electrical contractor in Los Angeles.

You will be given a company name, city, classification, and license info. Infer likely contact patterns and provide a priority score for outreach.

CRITICAL RULES:
- NEVER fabricate exact email addresses or phone numbers. Provide email FORMAT hints only (e.g., "firstname@companydomain.com").
- For contactName, only suggest a likely first name if the company name follows a "Firstname Lastname Construction" pattern, otherwise return null.
- linkedinUrl should be a PATTERN-BASED guess (e.g., "https://www.linkedin.com/company/company-name-slug"), not asserted as real.
- Hooks must be SPECIFIC to LA electrical work (LAMC Title 26, LADBS inspections, EV readiness AB 1705, panel upgrades for multi-unit) — not generic sales phrases.
- Confidence reflects how much real signal vs guessing.

Return ONLY valid JSON matching the schema. No markdown, no explanation.`;
async function runProspectEnrichAgent(input, iterationCount) {
    if (iterationCount >= b2bSchemas_1.MAX_B2B_AGENT_ITERATIONS) {
        throw new Error(`ProspectEnrichAgent exceeded max iterations (${b2bSchemas_1.MAX_B2B_AGENT_ITERATIONS})`);
    }
    const licenseAgeYears = input.licenseIssuedDate
        ? ((Date.now() - input.licenseIssuedDate.getTime()) / (365 * 24 * 3600 * 1000)).toFixed(1)
        : 'unknown';
    const userPrompt = `Enrich this prospect:

Company Name: ${input.companyName}
City: ${input.city ?? 'unknown'}
Prospect Type: ${input.prospectType}
CSLB Classification: ${input.cslbClassification ?? 'n/a'}
License Age (years): ${licenseAgeYears}
Website: ${input.website ?? 'unknown'}

Return JSON:
{
  "contactName": string | null,
  "emailHint": string | null,
  "linkedinUrl": string | null,
  "priority": "low" | "medium" | "high",
  "enrichmentSummary": string (2-3 sentences about company + outreach angle, max 800 chars),
  "hooks": string[] (2-4 SPECIFIC LA-electrical hooks, max 200 chars each),
  "confidence": "high" | "medium" | "low"
}`;
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    return b2bSchemas_1.EnrichmentOutputSchema.parse(parsed);
}
//# sourceMappingURL=prospectEnrichAgent.js.map