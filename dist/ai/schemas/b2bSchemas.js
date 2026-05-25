"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLACES_FETCH_TIMEOUT_MS = exports.CSLB_FETCH_TIMEOUT_MS = exports.WEBSITE_CONTENT_MAX_CHARS = exports.WEBSITE_FETCH_TIMEOUT_MS = exports.MAX_B2B_AGENT_ITERATIONS = exports.OutreachOutputSchema = exports.ValueAssetOutputSchema = exports.LinkedInDraftOutputSchema = exports.ResearchOutputSchema = exports.RecommendedAssetTypeSchema = exports.EnrichmentOutputSchema = exports.DiscoveryConfigSchema = exports.CSLBRecordSchema = exports.LicenseAgeSchema = exports.SearchTypeSchema = exports.ProspectSourceSchema = exports.ProspectPrioritySchema = exports.ProspectStageSchema = exports.ProspectTypeSchema = void 0;
const zod_1 = require("zod");
// ─── Enums ────────────────────────────────────────────────────────────────────
exports.ProspectTypeSchema = zod_1.z.enum([
    'general_contractor',
    'builder',
    'property_manager',
    'developer',
]);
exports.ProspectStageSchema = zod_1.z.enum([
    'discovered',
    'contacted',
    'responded',
    'meeting',
    'proposal',
    'partner',
    'not_interested',
]);
exports.ProspectPrioritySchema = zod_1.z.enum(['low', 'medium', 'high']);
exports.ProspectSourceSchema = zod_1.z.enum([
    'cslb_agent',
    'google_places_agent',
    'manual',
    'linkedin',
    'referral',
]);
exports.SearchTypeSchema = zod_1.z.enum(['cslb', 'google_places']);
exports.LicenseAgeSchema = zod_1.z.enum(['new_90d', 'new_180d', 'new_365d', 'all']);
// ─── CSLB raw record (from CA Open Data API) ─────────────────────────────────
// CSLB columns vary; coerce common types and allow nullish for unknown fields.
exports.CSLBRecordSchema = zod_1.z.object({
    LicenseNo: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).transform(String).nullish(),
    BusinessName: zod_1.z.string().nullish(),
    BusinessType: zod_1.z.string().nullish(),
    Classifications: zod_1.z.string().nullish(),
    PrimaryStatus: zod_1.z.string().nullish(),
    IssueDate: zod_1.z.string().nullish(),
    ExpireDate: zod_1.z.string().nullish(),
    MailingAddress: zod_1.z.string().nullish(),
    City: zod_1.z.string().nullish(),
    State: zod_1.z.string().nullish(),
    ZIPCode: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).transform(String).nullish(),
    BusinessPhone: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).transform(String).nullish(),
}).passthrough();
// ─── Discovery configs ───────────────────────────────────────────────────────
exports.DiscoveryConfigSchema = zod_1.z.object({
    searchType: exports.SearchTypeSchema,
    tradeFilter: zod_1.z.string().max(50).optional(), // 'B', 'A', 'general_contractor' etc.
    cityFilter: zod_1.z.string().max(100).optional(),
    licenseAge: exports.LicenseAgeSchema.optional(),
    maxResults: zod_1.z.number().int().min(1).max(200).default(100),
});
// ─── Enrichment output (Agent 3) ─────────────────────────────────────────────
exports.EnrichmentOutputSchema = zod_1.z.object({
    contactName: zod_1.z.string().max(255).nullable(),
    emailHint: zod_1.z.string().max(255).nullable(),
    linkedinUrl: zod_1.z.string().max(500).nullable(),
    priority: exports.ProspectPrioritySchema,
    enrichmentSummary: zod_1.z.string().max(800),
    hooks: zod_1.z.array(zod_1.z.string().max(200)).max(5),
    confidence: zod_1.z.enum(['high', 'medium', 'low']),
});
// ─── Research output (Agent 4a) ──────────────────────────────────────────────
exports.RecommendedAssetTypeSchema = zod_1.z.enum([
    'gc_checklist',
    'pm_compliance',
    'dev_benchmark',
]);
exports.ResearchOutputSchema = zod_1.z.object({
    companyProfile: zod_1.z.string().max(800),
    projectTypes: zod_1.z.array(zod_1.z.string().max(120)).max(8),
    painPoints: zod_1.z.array(zod_1.z.string().max(200)).max(6),
    hooks: zod_1.z.array(zod_1.z.string().max(250)).max(5),
    licenseAgeSignal: zod_1.z.enum(['new', 'established', 'veteran', 'unknown']),
    recommendedAssetType: exports.RecommendedAssetTypeSchema,
});
// ─── LinkedIn draft (Agent 4b) ───────────────────────────────────────────────
exports.LinkedInDraftOutputSchema = zod_1.z.object({
    companyPageComment: zod_1.z.string().min(20).max(200),
    ownerDM: zod_1.z.string().min(40).max(400),
    commentRationale: zod_1.z.string().max(300),
    dmRationale: zod_1.z.string().max(300),
});
// ─── Value Asset (Agent 4c) ──────────────────────────────────────────────────
exports.ValueAssetOutputSchema = zod_1.z.object({
    title: zod_1.z.string().max(160),
    subtitle: zod_1.z.string().max(220).nullable(),
    htmlContent: zod_1.z.string().min(200).max(12000),
    assetType: exports.RecommendedAssetTypeSchema,
    callToAction: zod_1.z.string().max(200),
});
// ─── Outreach messages (Agent 3 — replaces LinkedIn + Asset) ─────────────────
exports.OutreachOutputSchema = zod_1.z.object({
    callOpener: zod_1.z.string().max(400), // what to say on a cold call
    linkedInDM: zod_1.z.string().max(320), // LinkedIn direct message
    emailSubject: zod_1.z.string().max(100),
    emailBody: zod_1.z.string().max(600),
    angle: zod_1.z.string().max(300), // why this approach fits this prospect
});
// ─── Constants ───────────────────────────────────────────────────────────────
exports.MAX_B2B_AGENT_ITERATIONS = 3;
exports.WEBSITE_FETCH_TIMEOUT_MS = 10000;
exports.WEBSITE_CONTENT_MAX_CHARS = 3000;
exports.CSLB_FETCH_TIMEOUT_MS = 15000; // 15 seconds
exports.PLACES_FETCH_TIMEOUT_MS = 10000;
//# sourceMappingURL=b2bSchemas.js.map