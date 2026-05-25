"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaveRequestSchema = exports.DraftRequestSchema = exports.PriceRequestSchema = exports.AnalyzeRequestSchema = exports.MAX_AGENT_ITERATIONS = exports.AgentSessionStateSchema = exports.QuickEstimateResultSchema = exports.SmallJobInputSchema = exports.EstimateDraftSchema = exports.PricedEstimateSchema = exports.LineItemSchema = exports.ElectricalScopeSchema = exports.PlanExtractionSchema = exports.JobType = exports.AgentStep = void 0;
const zod_1 = require("zod");
// ─── Agent session step states ────────────────────────────────────────────────
exports.AgentStep = zod_1.z.enum(['upload', 'scope', 'price', 'draft', 'saved', 'failed']);
exports.JobType = zod_1.z.enum(['adu', 'service_upgrade', 'remodel', 'small_job', 'ev_charger', 'other']);
// ─── PlanParserAgent output ───────────────────────────────────────────────────
// Raw extraction from the PDF/image — not yet validated by user
exports.PlanExtractionSchema = zod_1.z.object({
    squareFootage: zod_1.z.number().nullable(),
    projectDescription: zod_1.z.string(),
    // Detected items from the plan
    detectedItems: zod_1.z.object({
        outlets: zod_1.z.number().nullable(),
        switches: zod_1.z.number().nullable(),
        lightFixtures: zod_1.z.number().nullable(),
        recessedLights: zod_1.z.number().nullable(),
        ceilingFans: zod_1.z.number().nullable(),
        smokeDetectors: zod_1.z.number().nullable(),
        carbonMonoxideDetectors: zod_1.z.number().nullable(),
        exhaustFans: zod_1.z.number().nullable(),
        // Appliances
        electricWaterHeater: zod_1.z.boolean(),
        electricStove: zod_1.z.boolean(),
        washerDryer: zod_1.z.boolean(),
        dishwasher: zod_1.z.boolean(),
        microwave: zod_1.z.boolean(),
        // Panels
        mainPanelAmps: zod_1.z.number().nullable(),
        subPanelAmps: zod_1.z.number().nullable(),
        subPanelSpaces: zod_1.z.number().nullable(),
        // Special
        solarPanels: zod_1.z.boolean(),
        evCharger: zod_1.z.boolean(),
        // Trenching
        trenchingRequired: zod_1.z.boolean(),
        trenchingFeet: zod_1.z.number().nullable(),
        // Fixtures
        ownerSuppliesFixtures: zod_1.z.boolean().nullable(),
    }),
    // Raw notes / warnings from the parser
    parserNotes: zod_1.z.string().nullable(),
    confidence: zod_1.z.enum(['high', 'medium', 'low']),
    // Optional symbol-level counts found in electrical legends
    legendItems: zod_1.z
        .object({
        vacancySensors: zod_1.z.number().nullable(),
        fluorescentFixtures: zod_1.z.number().nullable(),
        wallMountedFixtures: zod_1.z.number().nullable(),
        indoorAirVentFans: zod_1.z.number().nullable(),
        gfciOutlets: zod_1.z.number().nullable(),
        afciCircuits: zod_1.z.number().nullable(),
    })
        .optional(),
});
// ─── ScopeAnalyzerAgent output ────────────────────────────────────────────────
// User-confirmed scope — this is the contract for the Price agent
exports.ElectricalScopeSchema = zod_1.z.object({
    squareFootage: zod_1.z.number(),
    jobType: exports.JobType,
    projectTitle: zod_1.z.string(),
    // Counts
    outlets: zod_1.z.number(),
    switches: zod_1.z.number(),
    lightFixtures: zod_1.z.number(),
    recessedLights: zod_1.z.number(),
    ceilingFans: zod_1.z.number(),
    dedicatedCircuits: zod_1.z.number(), // appliances
    smokeCoDetectors: zod_1.z.number(),
    exhaustFans: zod_1.z.number(),
    // Panel work
    subPanelAmps: zod_1.z.number().nullable(),
    subPanelSpaces: zod_1.z.number().nullable(),
    mainPanelUpgrade: zod_1.z.boolean(),
    mainPanelAmps: zod_1.z.number().nullable(),
    // Special scopes
    solarPanels: zod_1.z.boolean(),
    evCharger: zod_1.z.boolean(),
    trenchingFeet: zod_1.z.number(),
    // Finish
    ownerSuppliesFixtures: zod_1.z.boolean(),
    // Metadata
    exclusions: zod_1.z.array(zod_1.z.string()),
    assumptions: zod_1.z.array(zod_1.z.string()),
});
// ─── PriceCalculatorAgent output ─────────────────────────────────────────────
exports.LineItemSchema = zod_1.z.object({
    id: zod_1.z.string(),
    category: zod_1.z.enum(['panel', 'wiring', 'devices', 'lighting', 'appliance', 'trenching', 'special', 'labor', 'minimum']),
    description: zod_1.z.string(),
    quantity: zod_1.z.number(),
    unitPrice: zod_1.z.number(),
    total: zod_1.z.number(),
    notes: zod_1.z.string().optional(),
});
exports.PricedEstimateSchema = zod_1.z.object({
    lineItems: zod_1.z.array(exports.LineItemSchema),
    subtotal: zod_1.z.number(),
    tax: zod_1.z.number(),
    total: zod_1.z.number(),
    // Market pricing rationale
    pricingNotes: zod_1.z.string(),
    // Competitive range for this job type in LA market
    marketRangeLow: zod_1.z.number(),
    marketRangeHigh: zod_1.z.number(),
    competitivePosition: zod_1.z.enum(['below', 'competitive', 'above']),
});
// ─── EstimateWriterAgent output ───────────────────────────────────────────────
exports.EstimateDraftSchema = zod_1.z.object({
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    items: zod_1.z.array(exports.LineItemSchema),
    subtotal: zod_1.z.number(),
    tax: zod_1.z.number(),
    total: zod_1.z.number(),
    notes: zod_1.z.string(), // Includes assumptions + limitations paragraph
    exclusions: zod_1.z.array(zod_1.z.string()),
});
// ─── QuickEstimate agent (small jobs) ────────────────────────────────────────
exports.SmallJobInputSchema = zod_1.z.object({
    description: zod_1.z.string().min(5, 'Describe the job'),
    answers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(), // follow-up Q&A
});
exports.QuickEstimateResultSchema = zod_1.z.object({
    canProvidePrice: zod_1.z.boolean(),
    rangeLow: zod_1.z.number().nullable(),
    rangeHigh: zod_1.z.number().nullable(),
    minimumApplies: zod_1.z.boolean(),
    minimumAmount: zod_1.z.number(),
    followUpQuestions: zod_1.z.array(zod_1.z.string()),
    lineItems: zod_1.z.array(exports.LineItemSchema),
    siteVisitRequired: zod_1.z.boolean(),
    siteVisitReason: zod_1.z.string().nullable(),
    notes: zod_1.z.string(),
});
// ─── Orchestrator session state ───────────────────────────────────────────────
exports.AgentSessionStateSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    userId: zod_1.z.string(),
    jobType: exports.JobType,
    step: exports.AgentStep,
    fileName: zod_1.z.string().nullable(),
    rawExtraction: exports.PlanExtractionSchema.nullable(),
    scope: exports.ElectricalScopeSchema.nullable(),
    lineItems: exports.PricedEstimateSchema.nullable(),
    draft: exports.EstimateDraftSchema.nullable(),
    savedEstimateId: zod_1.z.string().nullable(),
    iterations: zod_1.z.object({
        parser: zod_1.z.number(),
        scope: zod_1.z.number(),
        price: zod_1.z.number(),
        writer: zod_1.z.number(),
    }),
    error: zod_1.z.string().nullable(),
});
// Max times any single agent may retry on failure per upload attempt
exports.MAX_AGENT_ITERATIONS = 5;
// ─── API request/response shapes ─────────────────────────────────────────────
exports.AnalyzeRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    confirmedScope: exports.ElectricalScopeSchema.optional(),
});
exports.PriceRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
});
exports.DraftRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    confirmedLineItems: zod_1.z.array(exports.LineItemSchema).optional(),
});
exports.SaveRequestSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    clientId: zod_1.z.string(),
    validUntilDays: zod_1.z.number().default(30),
});
//# sourceMappingURL=index.js.map