import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────
export const ProspectTypeSchema = z.enum([
  'general_contractor',
  'builder',
  'property_manager',
  'developer',
]);
export type ProspectType = z.infer<typeof ProspectTypeSchema>;

export const ProspectStageSchema = z.enum([
  'discovered',
  'contacted',
  'responded',
  'meeting',
  'proposal',
  'partner',
  'not_interested',
]);
export type ProspectStage = z.infer<typeof ProspectStageSchema>;

export const ProspectPrioritySchema = z.enum(['low', 'medium', 'high']);
export type ProspectPriority = z.infer<typeof ProspectPrioritySchema>;

export const ProspectSourceSchema = z.enum([
  'cslb_agent',
  'google_places_agent',
  'manual',
  'linkedin',
  'referral',
]);
export type ProspectSource = z.infer<typeof ProspectSourceSchema>;

export const SearchTypeSchema = z.enum(['cslb', 'google_places']);
export type SearchType = z.infer<typeof SearchTypeSchema>;

export const LicenseAgeSchema = z.enum(['new_90d', 'new_180d', 'new_365d', 'all']);
export type LicenseAge = z.infer<typeof LicenseAgeSchema>;

// ─── CSLB raw record (from CA Open Data API) ─────────────────────────────────
// CSLB columns vary; coerce common types and allow nullish for unknown fields.
export const CSLBRecordSchema = z.object({
  LicenseNo: z.union([z.string(), z.number()]).transform(String).nullish(),
  BusinessName: z.string().nullish(),
  BusinessType: z.string().nullish(),
  Classifications: z.string().nullish(),
  PrimaryStatus: z.string().nullish(),
  IssueDate: z.string().nullish(),
  ExpireDate: z.string().nullish(),
  MailingAddress: z.string().nullish(),
  City: z.string().nullish(),
  State: z.string().nullish(),
  ZIPCode: z.union([z.string(), z.number()]).transform(String).nullish(),
  BusinessPhone: z.union([z.string(), z.number()]).transform(String).nullish(),
}).passthrough();
export type CSLBRecord = z.infer<typeof CSLBRecordSchema>;

// ─── Discovery configs ───────────────────────────────────────────────────────
export const DiscoveryConfigSchema = z.object({
  searchType: SearchTypeSchema,
  tradeFilter: z.string().max(50).optional(),    // 'B', 'A', 'general_contractor' etc.
  cityFilter: z.string().max(100).optional(),
  licenseAge: LicenseAgeSchema.optional(),
  maxResults: z.number().int().min(1).max(200).default(100),
});
export type DiscoveryConfig = z.infer<typeof DiscoveryConfigSchema>;

// ─── Enrichment output (Agent 3) ─────────────────────────────────────────────
export const EnrichmentOutputSchema = z.object({
  contactName: z.string().max(255).nullable(),
  emailHint: z.string().max(255).nullable(),
  linkedinUrl: z.string().max(500).nullable(),
  priority: ProspectPrioritySchema,
  enrichmentSummary: z.string().max(800),
  hooks: z.array(z.string().max(200)).max(5),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>;

// ─── Research output (Agent 4a) ──────────────────────────────────────────────
export const RecommendedAssetTypeSchema = z.enum([
  'gc_checklist',
  'pm_compliance',
  'dev_benchmark',
]);
export type RecommendedAssetType = z.infer<typeof RecommendedAssetTypeSchema>;

export const ResearchOutputSchema = z.object({
  companyProfile: z.string().max(800),
  projectTypes: z.array(z.string().max(120)).max(8),
  painPoints: z.array(z.string().max(200)).max(6),
  hooks: z.array(z.string().max(250)).max(5),
  licenseAgeSignal: z.enum(['new', 'established', 'veteran', 'unknown']),
  recommendedAssetType: RecommendedAssetTypeSchema,
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// ─── LinkedIn draft (Agent 4b) ───────────────────────────────────────────────
export const LinkedInDraftOutputSchema = z.object({
  companyPageComment: z.string().min(20).max(200),
  ownerDM: z.string().min(40).max(400),
  commentRationale: z.string().max(300),
  dmRationale: z.string().max(300),
});
export type LinkedInDraftOutput = z.infer<typeof LinkedInDraftOutputSchema>;

// ─── Value Asset (Agent 4c) ──────────────────────────────────────────────────
export const ValueAssetOutputSchema = z.object({
  title: z.string().max(160),
  subtitle: z.string().max(220).nullable(),
  htmlContent: z.string().min(200).max(12000),
  assetType: RecommendedAssetTypeSchema,
  callToAction: z.string().max(200),
});
export type ValueAssetOutput = z.infer<typeof ValueAssetOutputSchema>;

// ─── Outreach messages (Agent 3 — replaces LinkedIn + Asset) ─────────────────
export const OutreachOutputSchema = z.object({
  callOpener: z.string().max(400),   // what to say on a cold call
  linkedInDM: z.string().max(320),   // LinkedIn direct message
  emailSubject: z.string().max(100),
  emailBody: z.string().max(600),
  angle: z.string().max(300),        // why this approach fits this prospect
});
export type OutreachOutput = z.infer<typeof OutreachOutputSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────
export const MAX_B2B_AGENT_ITERATIONS = 3;
export const WEBSITE_FETCH_TIMEOUT_MS = 10_000;
export const WEBSITE_CONTENT_MAX_CHARS = 3_000;
export const CSLB_FETCH_TIMEOUT_MS = 15000; // 15 seconds
export const PLACES_FETCH_TIMEOUT_MS = 10_000;
