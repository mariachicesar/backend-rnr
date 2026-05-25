import { DiscoveryConfig, EnrichmentOutput, ResearchOutput, LinkedInDraftOutput, ValueAssetOutput, OutreachOutput } from './schemas/b2bSchemas';
/**
 * Run discovery via the configured search source (CSLB or Google Places).
 * Creates a ProspectAgentRun row, deduplicates against existing prospects by
 * cslbLicense (CSLB) or companyName+city (Places), and bulk-inserts.
 */
export declare function orchestrateDiscovery(rawConfig: unknown): Promise<{
    runId: string;
    found: number;
    imported: number;
    skipped: number;
}>;
export declare function cancelDiscoveryRun(searchType?: DiscoveryConfig['searchType']): Promise<{
    cancelled: boolean;
    runId?: undefined;
} | {
    cancelled: boolean;
    runId: string;
}>;
export declare function orchestrateEnrich(prospectId: string): Promise<EnrichmentOutput>;
export declare function orchestrateResearch(prospectId: string): Promise<ResearchOutput>;
export declare function orchestrateLinkedIn(prospectId: string): Promise<LinkedInDraftOutput>;
export declare function orchestrateValueAsset(prospectId: string): Promise<ValueAssetOutput>;
export declare function orchestrateOutreach(prospectId: string): Promise<OutreachOutput>;
//# sourceMappingURL=prospectOrchestrator.d.ts.map