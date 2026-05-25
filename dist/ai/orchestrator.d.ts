import { AgentSessionState, PlanExtraction, ElectricalScope, PricedEstimate, EstimateDraft, LineItem } from './schemas';
export declare function orchestrateParsePlan(sessionId: string, userId: string, input: {
    text?: string;
    imageBase64?: string;
    mimeType?: string;
}): Promise<{
    state: AgentSessionState;
    extraction: PlanExtraction;
}>;
export declare function orchestrateAnalyzeScope(sessionId: string, userId: string, confirmedScope?: ElectricalScope, learningExtraction?: PlanExtraction | null): Promise<{
    state: AgentSessionState;
    scope: ElectricalScope;
}>;
export declare function orchestratePriceEstimate(sessionId: string, userId: string): Promise<{
    state: AgentSessionState;
    priced: PricedEstimate;
}>;
export declare function orchestrateWriteDraft(sessionId: string, userId: string, confirmedLineItems?: LineItem[]): Promise<{
    state: AgentSessionState;
    draft: EstimateDraft;
}>;
export declare function orchestrateSaveEstimate(sessionId: string, userId: string, clientId: string, validUntilDays?: number): Promise<{
    state: AgentSessionState;
    estimateId: string;
}>;
//# sourceMappingURL=orchestrator.d.ts.map