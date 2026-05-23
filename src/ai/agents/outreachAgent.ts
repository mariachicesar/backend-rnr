import OpenAI from 'openai';
import { OutreachOutputSchema, OutreachOutput } from '../schemas/b2bSchemas';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generates short, natural outreach messages using only CSLB data.
 * No research or web scraping needed — works from license info alone.
 */

const SYSTEM_PROMPT = `You write short, natural outreach messages for RnR Electrician, a C-10 licensed electrical contractor in Los Angeles.

You have: the prospect's company name, CSLB license classification, city, and how long they've been licensed.
You do NOT have permit data, project history, or website info — don't invent any.

Produce 3 message variants for different channels. Each one is one contractor talking to another.

TONE:
- Direct and human. Like a text from someone you met at a job site.
- Not a pitch. Not a proposal. Just an intro and a door left open.
- Specific to their classification and location — not generic.

HARD RULES:
- No greetings ("Hi [name]", "Hello") and no sign-offs
- No: "I'd love to", "circle back", "synergy", "let's connect", "quick chat", "touch base", "hope this finds you", "reaching out because", "I came across your profile", or any flattery
- Never say you "looked them up" or "found them online"
- callOpener: what the RnR owner says in the first 10 seconds of a cold call. Conversational, not scripted-sounding. Under 300 chars.
- linkedInDM: reads like a text, not a business letter. Under 280 chars. No subject line.
- emailSubject: plain, not clickbait. Under 80 chars.
- emailBody: 3 sentences max. Who RnR is, why relevant to them specifically, one low-key offer. Under 400 chars.
- angle: one sentence explaining why this approach fits their specific situation (for internal reference only).

Return ONLY valid JSON.`;

export type OutreachInput = {
  companyName: string;
  city: string | null;
  classification: string | null;
  licenseIssuedYear: number | null;
  prospectType: 'general_contractor' | 'builder';
};

export async function runOutreachAgent(input: OutreachInput): Promise<OutreachOutput> {
  const city = input.city ?? 'the LA area';
  const classification = input.classification?.trim() ?? 'B';
  const yearsLicensed = input.licenseIssuedYear
    ? new Date().getFullYear() - input.licenseIssuedYear
    : null;
  const licenseContext = yearsLicensed != null
    ? yearsLicensed <= 2
      ? `licensed ${yearsLicensed <= 1 ? 'less than a year' : `about ${yearsLicensed} years`} ago (newer contractor, still building their sub network)`
      : `licensed for ${yearsLicensed} years (established, likely has subs but may have gaps)`
    : 'license age unknown';

  const userPrompt = `Write outreach messages for this prospect.

Company: ${input.companyName}
City: ${city}
CSLB Classification: ${classification}
License context: ${licenseContext}
Prospect type: ${input.prospectType === 'builder' ? 'Builder / developer (Class A)' : 'General contractor (Class B or specialty)'}

Generate messages that feel like one contractor talking to another — specific to their classification and city, not generic.

Return JSON:
{
  "callOpener": string (under 300 chars — first 10 seconds of a cold call, conversational),
  "linkedInDM": string (under 280 chars — reads like a text),
  "emailSubject": string (under 80 chars — plain, descriptive),
  "emailBody": string (under 400 chars — 3 sentences: who RnR is, why relevant, low-key offer),
  "angle": string (under 300 chars — internal note on why this angle fits this prospect)
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 600,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);
  return OutreachOutputSchema.parse(parsed);
}
