import { LinkedInDraftOutput, ResearchOutput, ProspectType } from '../schemas/b2bSchemas';
export type LinkedInDraftInput = {
    companyName: string;
    contactName: string | null;
    city: string | null;
    prospectType: ProspectType;
    research: ResearchOutput;
};
export declare function runLinkedInDraftAgent(input: LinkedInDraftInput, iterationCount: number): Promise<LinkedInDraftOutput>;
//# sourceMappingURL=linkedinDraftAgent.d.ts.map