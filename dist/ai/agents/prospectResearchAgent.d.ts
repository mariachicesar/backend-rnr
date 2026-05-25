import { ResearchOutput, ProspectType } from '../schemas/b2bSchemas';
export type ResearchInput = {
    companyName: string;
    website: string | null;
    cslbClassification: string | null;
    licenseIssuedDate: Date | null;
    city: string | null;
    prospectType: ProspectType;
};
export declare function runProspectResearchAgent(input: ResearchInput, iterationCount: number): Promise<ResearchOutput>;
//# sourceMappingURL=prospectResearchAgent.d.ts.map