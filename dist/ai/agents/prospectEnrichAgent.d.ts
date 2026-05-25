import { EnrichmentOutput, ProspectType } from '../schemas/b2bSchemas';
export type EnrichmentInput = {
    companyName: string;
    city: string | null;
    prospectType: ProspectType;
    cslbClassification: string | null;
    licenseIssuedDate: Date | null;
    website: string | null;
};
export declare function runProspectEnrichAgent(input: EnrichmentInput, iterationCount: number): Promise<EnrichmentOutput>;
//# sourceMappingURL=prospectEnrichAgent.d.ts.map