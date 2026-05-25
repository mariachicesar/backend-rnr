"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLinkedInDraftAgent = runLinkedInDraftAgent;
const openai_1 = __importDefault(require("openai"));
const b2bSchemas_1 = require("../schemas/b2bSchemas");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM_PROMPT = `You write minimal LinkedIn outreach for RnR Electrician.

Produce TWO drafts:

1) companyPageComment — A single genuine comment the RnR company page could leave on a prospect's post. Must reference a specific LA electrical detail (LAMC, LADBS, AB 1705, panel codes). NEVER sells or pitches.

2) ownerDM — A 2-3 sentence personal DM from the owner. Lead with one specific observation about their work. End with one low-key question or offer, not a call request.

HARD RULES:
- companyPageComment: 20–160 chars MAX. Concrete, no fluff.
- ownerDM: 40–280 chars MAX. Read like a text, not an email. No greetings, no sign-offs.
- Banned phrases: "I'd love to", "circle back", "synergy", "let's connect", "quick chat", "touch base", "reach out", "hope this finds you", any flattery.
- Voice: direct, technical, peer-to-peer. One human talking to another.

Return ONLY valid JSON.`;
async function runLinkedInDraftAgent(input, iterationCount) {
    if (iterationCount >= b2bSchemas_1.MAX_B2B_AGENT_ITERATIONS) {
        throw new Error(`LinkedInDraftAgent exceeded max iterations (${b2bSchemas_1.MAX_B2B_AGENT_ITERATIONS})`);
    }
    const userPrompt = `Draft LinkedIn outreach for this prospect.

Company: ${input.companyName}
Contact Name: ${input.contactName ?? 'unknown'}
City: ${input.city ?? 'Los Angeles area'}
Prospect Type: ${input.prospectType}

Research Profile:
${input.research.companyProfile}

Project Types: ${input.research.projectTypes.join(', ') || 'unknown'}
Pain Points: ${input.research.painPoints.join(' | ') || 'unknown'}
Hooks (use ONE of these): ${input.research.hooks.join(' | ') || 'none'}
License Age Signal: ${input.research.licenseAgeSignal}

Return JSON:
{
  "companyPageComment": string (20-200 chars),
  "ownerDM": string (40-400 chars),
  "commentRationale": string (max 300 chars — why this comment lands),
  "dmRationale": string (max 300 chars — why this DM lands)
}`;
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 700,
        response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    return b2bSchemas_1.LinkedInDraftOutputSchema.parse(parsed);
}
//# sourceMappingURL=linkedinDraftAgent.js.map