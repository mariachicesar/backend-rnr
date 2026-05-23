import OpenAI from 'openai';
import {
  ValueAssetOutputSchema,
  ValueAssetOutput,
  MAX_B2B_AGENT_ITERATIONS,
  ResearchOutput,
  RecommendedAssetType,
  ProspectType,
} from '../schemas/b2bSchemas';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You produce short, practical reference sheets for RnR Electrician (C-10 contractor in LA) to share with contractors before any sales conversation.

Tone: peer-to-peer, technical, zero fluff. This is a useful reference, NOT a marketing piece.

Asset types:
- gc_checklist: "5 Electrical Items That Delay LA Inspections" — tight checklist, each item has a code citation (LAMC Title 26, NEC) or LADBS inspection note and a one-line fix.
- pm_compliance: "LA Landlord Electrical Quick-Reference" — AB 1705 EV readiness, CSED age signals, LADBS habitability triggers. Scannable, no fluff.
- dev_benchmark: "LA Electrical Cost Benchmarks" — per-unit ranges by project type (ADU, multi-unit rehab, new construction). Numbers only, no narrative.

HTML RULES:
- Self-contained <div> only — no <html>, no <head>, no <body>, no <script>, no <style> tags, no external CSS, no inline event handlers, no <iframe>.
- Use Tailwind utility classes only (text-*, mb-*, p-*, font-*, border-*, bg-*, rounded-*, list-*, grid-*, flex-*, gap-*).
- Brand color: text-primary or bg-primary for accents. Use sparingly.
- Headings: <h2> top, <h3> sub. Lists: <ul class="list-disc pl-5">.
- Length: 3-5 sections MAX. ~150-500 words rendered. Concise beats comprehensive.
- End with ONE plain sentence mentioning RnR Electrician — no sales language, no ask.
- NEVER include placeholder text like "{{company}}" — fill in actual values.

Return ONLY valid JSON. NEVER include markdown code fences.`;

export type ValueAssetInput = {
  companyName: string;
  city: string | null;
  prospectType: ProspectType;
  research: ResearchOutput;
  overrideAssetType?: RecommendedAssetType;
};

export async function runValueAssetAgent(
  input: ValueAssetInput,
  iterationCount: number
): Promise<ValueAssetOutput> {
  if (iterationCount >= MAX_B2B_AGENT_ITERATIONS) {
    throw new Error(`ValueAssetAgent exceeded max iterations (${MAX_B2B_AGENT_ITERATIONS})`);
  }

  const assetType = input.overrideAssetType ?? input.research.recommendedAssetType;
  const city = input.city ?? 'Los Angeles';

  const userPrompt = `Generate a value-first asset.

Target Company: ${input.companyName}
City: ${city}
Prospect Type: ${input.prospectType}
Asset Type: ${assetType}

Research Profile:
${input.research.companyProfile}

Their likely project types: ${input.research.projectTypes.join(', ') || 'general'}
Their pain points: ${input.research.painPoints.join(' | ') || 'general electrical sub coordination'}

Keep it short and useful. No sales language. One brief mention of RnR Electrician at the end, no ask.

Return JSON:
{
  "title": string (max 100 chars — plain, descriptive),
  "subtitle": string | null (max 160 chars — optional context, not a tagline),
  "htmlContent": string (self-contained <div> with Tailwind classes only, 150-500 words rendered),
  "assetType": "${assetType}",
  "callToAction": string (max 120 chars — one plain sentence, no ask, just availability)
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 2200,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);
  const validated = ValueAssetOutputSchema.parse(parsed);
  validated.htmlContent = sanitizeAssetHtml(validated.htmlContent);
  return validated;
}

/**
 * Defense-in-depth: strip dangerous HTML even though the model is instructed not to produce it.
 * The asset is later rendered in a sandboxed iframe in admin, but we still scrub here.
 */
function sanitizeAssetHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}
