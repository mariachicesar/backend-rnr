"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEstimateWriterAgent = runEstimateWriterAgent;
const openai_1 = __importDefault(require("openai"));
const schemas_1 = require("../schemas");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = `You are a professional electrical contractor writing a client-facing estimate for RnR Electrical LLC in Los Angeles.
Write in clear, professional English. Be specific about what is included.
The exclusions list and assumptions paragraph protect the contractor legally and set proper client expectations.
Return ONLY valid JSON — no markdown, no explanation.`;
async function runEstimateWriterAgent(scope, priced, iterationCount) {
    if (iterationCount >= schemas_1.MAX_AGENT_ITERATIONS) {
        throw new Error(`EstimateWriterAgent exceeded max iterations (${schemas_1.MAX_AGENT_ITERATIONS})`);
    }
    const prompt = `Write a professional client-facing electrical estimate for RnR Electrical LLC.

SCOPE:
${JSON.stringify(scope, null, 2)}

PRICED LINE ITEMS:
${JSON.stringify(priced.lineItems, null, 2)}

TOTALS:
Subtotal: $${priced.subtotal}
Tax: $${priced.tax}
Total: $${priced.total}

SCOPE EXCLUSIONS (from scope analyzer):
${scope.exclusions.map((e) => `- ${e}`).join('\n')}

ASSUMPTIONS (from scope analyzer):
${scope.assumptions.map((a) => `- ${a}`).join('\n')}

Return JSON with these exact fields:
{
  "title": string (clear project title, e.g. "646 Sq Ft ADU — Full Electrical"),
  "description": string (2-3 sentence professional project description for the client),
  "items": [ ... same line items array, no changes to prices ... ],
  "subtotal": number,
  "tax": number,
  "total": number,
  "notes": string (professional paragraph covering: scope basis, standard materials included, what triggers a change order, code compliance statement),
  "exclusions": string[] (clean bullet-point list of what is NOT included)
}

The notes field must include this standard RnR language adapted for this job:
"This proposal is based on preliminary review of the provided plans. Final confirmation of existing service capacity will be completed prior to installation. In the event that service upgrades or panel modifications are required to meet code compliance, pricing will be adjusted accordingly. Bid includes standard builder-grade electrical materials including recessed LED lighting, standard white devices, AFCI/GFCI breakers, and load centers. Any upgrades beyond standard specification shall be billed as a change order."`;
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    // Always preserve the exact priced line items — don't let writer re-price
    parsed.items = priced.lineItems;
    parsed.subtotal = priced.subtotal;
    parsed.tax = priced.tax;
    parsed.total = priced.total;
    return schemas_1.EstimateDraftSchema.parse(parsed);
}
//# sourceMappingURL=estimateWriter.js.map