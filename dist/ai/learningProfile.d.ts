import { ElectricalScope, PlanExtraction } from './schemas';
export type LearningProfileSummary = {
    updatedAt: string;
    totalSamples: number;
    topFields: Array<{
        field: string;
        avgCorrection: number;
        avgAbsPctError: number;
        underCountRate: number;
        samples: number;
    }>;
};
export declare function recordScopeCorrection(rawExtraction: PlanExtraction | null, confirmedScope: ElectricalScope): void;
export declare function getLearningPromptHints(): string;
export declare function getLearningProfileSummary(): LearningProfileSummary;
//# sourceMappingURL=learningProfile.d.ts.map