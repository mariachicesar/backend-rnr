import { z } from 'zod';

// ─── Agent session step states ────────────────────────────────────────────────
export const AgentStep = z.enum(['upload', 'scope', 'price', 'draft', 'saved', 'failed']);
export type AgentStep = z.infer<typeof AgentStep>;

export const JobType = z.enum(['adu', 'service_upgrade', 'remodel', 'small_job', 'ev_charger', 'other']);
export type JobType = z.infer<typeof JobType>;

// ─── PlanParserAgent output ───────────────────────────────────────────────────
// Raw extraction from the PDF/image — not yet validated by user
export const PlanExtractionSchema = z.object({
  squareFootage: z.number().nullable(),
  projectDescription: z.string(),
  // Detected items from the plan
  detectedItems: z.object({
    outlets: z.number().nullable(),
    switches: z.number().nullable(),
    lightFixtures: z.number().nullable(),
    recessedLights: z.number().nullable(),
    ceilingFans: z.number().nullable(),
    smokeDetectors: z.number().nullable(),
    carbonMonoxideDetectors: z.number().nullable(),
    exhaustFans: z.number().nullable(),
    // Appliances
    electricWaterHeater: z.boolean(),
    electricStove: z.boolean(),
    washerDryer: z.boolean(),
    dishwasher: z.boolean(),
    microwave: z.boolean(),
    // Panels
    mainPanelAmps: z.number().nullable(),
    subPanelAmps: z.number().nullable(),
    subPanelSpaces: z.number().nullable(),
    // Special
    solarPanels: z.boolean(),
    evCharger: z.boolean(),
    // Trenching
    trenchingRequired: z.boolean(),
    trenchingFeet: z.number().nullable(),
    // Fixtures
    ownerSuppliesFixtures: z.boolean().nullable(),
  }),
  // Raw notes / warnings from the parser
  parserNotes: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  // Optional symbol-level counts found in electrical legends
  legendItems: z
    .object({
      vacancySensors: z.number().nullable(),
      fluorescentFixtures: z.number().nullable(),
      wallMountedFixtures: z.number().nullable(),
      indoorAirVentFans: z.number().nullable(),
      gfciOutlets: z.number().nullable(),
      afciCircuits: z.number().nullable(),
    })
    .optional(),
});
export type PlanExtraction = z.infer<typeof PlanExtractionSchema>;

// ─── ScopeAnalyzerAgent output ────────────────────────────────────────────────
// User-confirmed scope — this is the contract for the Price agent
export const ElectricalScopeSchema = z.object({
  squareFootage: z.number(),
  jobType: JobType,
  projectTitle: z.string(),
  // Counts
  outlets: z.number(),
  switches: z.number(),
  lightFixtures: z.number(),
  recessedLights: z.number(),
  ceilingFans: z.number(),
  dedicatedCircuits: z.number(), // appliances
  smokeCoDetectors: z.number(),
  exhaustFans: z.number(),
  // Panel work
  subPanelAmps: z.number().nullable(),
  subPanelSpaces: z.number().nullable(),
  mainPanelUpgrade: z.boolean(),
  mainPanelAmps: z.number().nullable(),
  // Special scopes
  solarPanels: z.boolean(),
  evCharger: z.boolean(),
  trenchingFeet: z.number(),
  // Finish
  ownerSuppliesFixtures: z.boolean(),
  // Metadata
  exclusions: z.array(z.string()),
  assumptions: z.array(z.string()),
});
export type ElectricalScope = z.infer<typeof ElectricalScopeSchema>;

// ─── PriceCalculatorAgent output ─────────────────────────────────────────────
export const LineItemSchema = z.object({
  id: z.string(),
  category: z.enum(['panel', 'wiring', 'devices', 'lighting', 'appliance', 'trenching', 'special', 'labor', 'minimum']),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
  notes: z.string().optional(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const PricedEstimateSchema = z.object({
  lineItems: z.array(LineItemSchema),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  // Market pricing rationale
  pricingNotes: z.string(),
  // Competitive range for this job type in LA market
  marketRangeLow: z.number(),
  marketRangeHigh: z.number(),
  competitivePosition: z.enum(['below', 'competitive', 'above']),
});
export type PricedEstimate = z.infer<typeof PricedEstimateSchema>;

// ─── EstimateWriterAgent output ───────────────────────────────────────────────
export const EstimateDraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  items: z.array(LineItemSchema),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  notes: z.string(),       // Includes assumptions + limitations paragraph
  exclusions: z.array(z.string()),
});
export type EstimateDraft = z.infer<typeof EstimateDraftSchema>;

// ─── QuickEstimate agent (small jobs) ────────────────────────────────────────
export const SmallJobInputSchema = z.object({
  description: z.string().min(5, 'Describe the job'),
  answers: z.record(z.string(), z.string()).optional(), // follow-up Q&A
});
export type SmallJobInput = z.infer<typeof SmallJobInputSchema>;

export const QuickEstimateResultSchema = z.object({
  canProvidePrice: z.boolean(),
  rangeLow: z.number().nullable(),
  rangeHigh: z.number().nullable(),
  minimumApplies: z.boolean(),
  minimumAmount: z.number(),
  followUpQuestions: z.array(z.string()),
  lineItems: z.array(LineItemSchema),
  siteVisitRequired: z.boolean(),
  siteVisitReason: z.string().nullable(),
  notes: z.string(),
});
export type QuickEstimateResult = z.infer<typeof QuickEstimateResultSchema>;

// ─── Orchestrator session state ───────────────────────────────────────────────
export const AgentSessionStateSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  jobType: JobType,
  step: AgentStep,
  fileName: z.string().nullable(),
  rawExtraction: PlanExtractionSchema.nullable(),
  scope: ElectricalScopeSchema.nullable(),
  lineItems: PricedEstimateSchema.nullable(),
  draft: EstimateDraftSchema.nullable(),
  savedEstimateId: z.string().nullable(),
  iterations: z.object({
    parser: z.number(),
    scope: z.number(),
    price: z.number(),
    writer: z.number(),
  }),
  error: z.string().nullable(),
});
export type AgentSessionState = z.infer<typeof AgentSessionStateSchema>;

// Max times any single agent may retry on failure per upload attempt
export const MAX_AGENT_ITERATIONS = 5;

// ─── API request/response shapes ─────────────────────────────────────────────
export const AnalyzeRequestSchema = z.object({
  sessionId: z.string(),
  confirmedScope: ElectricalScopeSchema.optional(),
});

export const PriceRequestSchema = z.object({
  sessionId: z.string(),
});

export const DraftRequestSchema = z.object({
  sessionId: z.string(),
  confirmedLineItems: z.array(LineItemSchema).optional(),
});

export const SaveRequestSchema = z.object({
  sessionId: z.string(),
  clientId: z.string(),
  validUntilDays: z.number().default(30),
});
