import { z } from 'zod';
export declare const ProspectTypeSchema: z.ZodEnum<{
    developer: "developer";
    general_contractor: "general_contractor";
    builder: "builder";
    property_manager: "property_manager";
}>;
export type ProspectType = z.infer<typeof ProspectTypeSchema>;
export declare const ProspectStageSchema: z.ZodEnum<{
    discovered: "discovered";
    contacted: "contacted";
    responded: "responded";
    meeting: "meeting";
    proposal: "proposal";
    partner: "partner";
    not_interested: "not_interested";
}>;
export type ProspectStage = z.infer<typeof ProspectStageSchema>;
export declare const ProspectPrioritySchema: z.ZodEnum<{
    high: "high";
    medium: "medium";
    low: "low";
}>;
export type ProspectPriority = z.infer<typeof ProspectPrioritySchema>;
export declare const ProspectSourceSchema: z.ZodEnum<{
    manual: "manual";
    cslb_agent: "cslb_agent";
    google_places_agent: "google_places_agent";
    linkedin: "linkedin";
    referral: "referral";
}>;
export type ProspectSource = z.infer<typeof ProspectSourceSchema>;
export declare const SearchTypeSchema: z.ZodEnum<{
    cslb: "cslb";
    google_places: "google_places";
}>;
export type SearchType = z.infer<typeof SearchTypeSchema>;
export declare const LicenseAgeSchema: z.ZodEnum<{
    all: "all";
    new_90d: "new_90d";
    new_180d: "new_180d";
    new_365d: "new_365d";
}>;
export type LicenseAge = z.infer<typeof LicenseAgeSchema>;
export declare const CSLBRecordSchema: z.ZodObject<{
    LicenseNo: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>, z.ZodTransform<string, string | number>>>>;
    BusinessName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    BusinessType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    Classifications: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    PrimaryStatus: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    IssueDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ExpireDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    MailingAddress: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    City: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    State: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    ZIPCode: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>, z.ZodTransform<string, string | number>>>>;
    BusinessPhone: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>, z.ZodTransform<string, string | number>>>>;
}, z.core.$loose>;
export type CSLBRecord = z.infer<typeof CSLBRecordSchema>;
export declare const DiscoveryConfigSchema: z.ZodObject<{
    searchType: z.ZodEnum<{
        cslb: "cslb";
        google_places: "google_places";
    }>;
    tradeFilter: z.ZodOptional<z.ZodString>;
    cityFilter: z.ZodOptional<z.ZodString>;
    licenseAge: z.ZodOptional<z.ZodEnum<{
        all: "all";
        new_90d: "new_90d";
        new_180d: "new_180d";
        new_365d: "new_365d";
    }>>;
    maxResults: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type DiscoveryConfig = z.infer<typeof DiscoveryConfigSchema>;
export declare const EnrichmentOutputSchema: z.ZodObject<{
    contactName: z.ZodNullable<z.ZodString>;
    emailHint: z.ZodNullable<z.ZodString>;
    linkedinUrl: z.ZodNullable<z.ZodString>;
    priority: z.ZodEnum<{
        high: "high";
        medium: "medium";
        low: "low";
    }>;
    enrichmentSummary: z.ZodString;
    hooks: z.ZodArray<z.ZodString>;
    confidence: z.ZodEnum<{
        high: "high";
        medium: "medium";
        low: "low";
    }>;
}, z.core.$strip>;
export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>;
export declare const RecommendedAssetTypeSchema: z.ZodEnum<{
    gc_checklist: "gc_checklist";
    pm_compliance: "pm_compliance";
    dev_benchmark: "dev_benchmark";
}>;
export type RecommendedAssetType = z.infer<typeof RecommendedAssetTypeSchema>;
export declare const ResearchOutputSchema: z.ZodObject<{
    companyProfile: z.ZodString;
    projectTypes: z.ZodArray<z.ZodString>;
    painPoints: z.ZodArray<z.ZodString>;
    hooks: z.ZodArray<z.ZodString>;
    licenseAgeSignal: z.ZodEnum<{
        unknown: "unknown";
        new: "new";
        established: "established";
        veteran: "veteran";
    }>;
    recommendedAssetType: z.ZodEnum<{
        gc_checklist: "gc_checklist";
        pm_compliance: "pm_compliance";
        dev_benchmark: "dev_benchmark";
    }>;
}, z.core.$strip>;
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;
export declare const LinkedInDraftOutputSchema: z.ZodObject<{
    companyPageComment: z.ZodString;
    ownerDM: z.ZodString;
    commentRationale: z.ZodString;
    dmRationale: z.ZodString;
}, z.core.$strip>;
export type LinkedInDraftOutput = z.infer<typeof LinkedInDraftOutputSchema>;
export declare const ValueAssetOutputSchema: z.ZodObject<{
    title: z.ZodString;
    subtitle: z.ZodNullable<z.ZodString>;
    htmlContent: z.ZodString;
    assetType: z.ZodEnum<{
        gc_checklist: "gc_checklist";
        pm_compliance: "pm_compliance";
        dev_benchmark: "dev_benchmark";
    }>;
    callToAction: z.ZodString;
}, z.core.$strip>;
export type ValueAssetOutput = z.infer<typeof ValueAssetOutputSchema>;
export declare const OutreachOutputSchema: z.ZodObject<{
    callOpener: z.ZodString;
    linkedInDM: z.ZodString;
    emailSubject: z.ZodString;
    emailBody: z.ZodString;
    angle: z.ZodString;
}, z.core.$strip>;
export type OutreachOutput = z.infer<typeof OutreachOutputSchema>;
export declare const MAX_B2B_AGENT_ITERATIONS = 3;
export declare const WEBSITE_FETCH_TIMEOUT_MS = 10000;
export declare const WEBSITE_CONTENT_MAX_CHARS = 3000;
export declare const CSLB_FETCH_TIMEOUT_MS = 15000;
export declare const PLACES_FETCH_TIMEOUT_MS = 10000;
//# sourceMappingURL=b2bSchemas.d.ts.map