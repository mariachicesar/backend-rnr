import { ValueAssetOutput, ResearchOutput, RecommendedAssetType, ProspectType } from '../schemas/b2bSchemas';
export type ValueAssetInput = {
    companyName: string;
    city: string | null;
    prospectType: ProspectType;
    research: ResearchOutput;
    overrideAssetType?: RecommendedAssetType;
};
export declare function runValueAssetAgent(input: ValueAssetInput, iterationCount: number): Promise<ValueAssetOutput>;
//# sourceMappingURL=valueAssetAgent.d.ts.map