import { z } from 'zod';
export declare const AgentStep: z.ZodEnum<{
    failed: "failed";
    draft: "draft";
    upload: "upload";
    scope: "scope";
    price: "price";
    saved: "saved";
}>;
export type AgentStep = z.infer<typeof AgentStep>;
export declare const JobType: z.ZodEnum<{
    other: "other";
    adu: "adu";
    service_upgrade: "service_upgrade";
    remodel: "remodel";
    small_job: "small_job";
    ev_charger: "ev_charger";
}>;
export type JobType = z.infer<typeof JobType>;
export declare const PlanExtractionSchema: z.ZodObject<{
    squareFootage: z.ZodNullable<z.ZodNumber>;
    projectDescription: z.ZodString;
    detectedItems: z.ZodObject<{
        outlets: z.ZodNullable<z.ZodNumber>;
        switches: z.ZodNullable<z.ZodNumber>;
        lightFixtures: z.ZodNullable<z.ZodNumber>;
        recessedLights: z.ZodNullable<z.ZodNumber>;
        ceilingFans: z.ZodNullable<z.ZodNumber>;
        smokeDetectors: z.ZodNullable<z.ZodNumber>;
        carbonMonoxideDetectors: z.ZodNullable<z.ZodNumber>;
        exhaustFans: z.ZodNullable<z.ZodNumber>;
        electricWaterHeater: z.ZodBoolean;
        electricStove: z.ZodBoolean;
        washerDryer: z.ZodBoolean;
        dishwasher: z.ZodBoolean;
        microwave: z.ZodBoolean;
        mainPanelAmps: z.ZodNullable<z.ZodNumber>;
        subPanelAmps: z.ZodNullable<z.ZodNumber>;
        subPanelSpaces: z.ZodNullable<z.ZodNumber>;
        solarPanels: z.ZodBoolean;
        evCharger: z.ZodBoolean;
        trenchingRequired: z.ZodBoolean;
        trenchingFeet: z.ZodNullable<z.ZodNumber>;
        ownerSuppliesFixtures: z.ZodNullable<z.ZodBoolean>;
    }, z.core.$strip>;
    parserNotes: z.ZodNullable<z.ZodString>;
    confidence: z.ZodEnum<{
        high: "high";
        medium: "medium";
        low: "low";
    }>;
    legendItems: z.ZodOptional<z.ZodObject<{
        vacancySensors: z.ZodNullable<z.ZodNumber>;
        fluorescentFixtures: z.ZodNullable<z.ZodNumber>;
        wallMountedFixtures: z.ZodNullable<z.ZodNumber>;
        indoorAirVentFans: z.ZodNullable<z.ZodNumber>;
        gfciOutlets: z.ZodNullable<z.ZodNumber>;
        afciCircuits: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PlanExtraction = z.infer<typeof PlanExtractionSchema>;
export declare const ElectricalScopeSchema: z.ZodObject<{
    squareFootage: z.ZodNumber;
    jobType: z.ZodEnum<{
        other: "other";
        adu: "adu";
        service_upgrade: "service_upgrade";
        remodel: "remodel";
        small_job: "small_job";
        ev_charger: "ev_charger";
    }>;
    projectTitle: z.ZodString;
    outlets: z.ZodNumber;
    switches: z.ZodNumber;
    lightFixtures: z.ZodNumber;
    recessedLights: z.ZodNumber;
    ceilingFans: z.ZodNumber;
    dedicatedCircuits: z.ZodNumber;
    smokeCoDetectors: z.ZodNumber;
    exhaustFans: z.ZodNumber;
    subPanelAmps: z.ZodNullable<z.ZodNumber>;
    subPanelSpaces: z.ZodNullable<z.ZodNumber>;
    mainPanelUpgrade: z.ZodBoolean;
    mainPanelAmps: z.ZodNullable<z.ZodNumber>;
    solarPanels: z.ZodBoolean;
    evCharger: z.ZodBoolean;
    trenchingFeet: z.ZodNumber;
    ownerSuppliesFixtures: z.ZodBoolean;
    exclusions: z.ZodArray<z.ZodString>;
    assumptions: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ElectricalScope = z.infer<typeof ElectricalScopeSchema>;
export declare const LineItemSchema: z.ZodObject<{
    id: z.ZodString;
    category: z.ZodEnum<{
        minimum: "minimum";
        panel: "panel";
        wiring: "wiring";
        devices: "devices";
        lighting: "lighting";
        appliance: "appliance";
        trenching: "trenching";
        special: "special";
        labor: "labor";
    }>;
    description: z.ZodString;
    quantity: z.ZodNumber;
    unitPrice: z.ZodNumber;
    total: z.ZodNumber;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type LineItem = z.infer<typeof LineItemSchema>;
export declare const PricedEstimateSchema: z.ZodObject<{
    lineItems: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodEnum<{
            minimum: "minimum";
            panel: "panel";
            wiring: "wiring";
            devices: "devices";
            lighting: "lighting";
            appliance: "appliance";
            trenching: "trenching";
            special: "special";
            labor: "labor";
        }>;
        description: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        total: z.ZodNumber;
        notes: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    subtotal: z.ZodNumber;
    tax: z.ZodNumber;
    total: z.ZodNumber;
    pricingNotes: z.ZodString;
    marketRangeLow: z.ZodNumber;
    marketRangeHigh: z.ZodNumber;
    competitivePosition: z.ZodEnum<{
        below: "below";
        competitive: "competitive";
        above: "above";
    }>;
}, z.core.$strip>;
export type PricedEstimate = z.infer<typeof PricedEstimateSchema>;
export declare const EstimateDraftSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodEnum<{
            minimum: "minimum";
            panel: "panel";
            wiring: "wiring";
            devices: "devices";
            lighting: "lighting";
            appliance: "appliance";
            trenching: "trenching";
            special: "special";
            labor: "labor";
        }>;
        description: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        total: z.ZodNumber;
        notes: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    subtotal: z.ZodNumber;
    tax: z.ZodNumber;
    total: z.ZodNumber;
    notes: z.ZodString;
    exclusions: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type EstimateDraft = z.infer<typeof EstimateDraftSchema>;
export declare const SmallJobInputSchema: z.ZodObject<{
    description: z.ZodString;
    answers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type SmallJobInput = z.infer<typeof SmallJobInputSchema>;
export declare const QuickEstimateResultSchema: z.ZodObject<{
    canProvidePrice: z.ZodBoolean;
    rangeLow: z.ZodNullable<z.ZodNumber>;
    rangeHigh: z.ZodNullable<z.ZodNumber>;
    minimumApplies: z.ZodBoolean;
    minimumAmount: z.ZodNumber;
    followUpQuestions: z.ZodArray<z.ZodString>;
    lineItems: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodEnum<{
            minimum: "minimum";
            panel: "panel";
            wiring: "wiring";
            devices: "devices";
            lighting: "lighting";
            appliance: "appliance";
            trenching: "trenching";
            special: "special";
            labor: "labor";
        }>;
        description: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        total: z.ZodNumber;
        notes: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    siteVisitRequired: z.ZodBoolean;
    siteVisitReason: z.ZodNullable<z.ZodString>;
    notes: z.ZodString;
}, z.core.$strip>;
export type QuickEstimateResult = z.infer<typeof QuickEstimateResultSchema>;
export declare const AgentSessionStateSchema: z.ZodObject<{
    sessionId: z.ZodString;
    userId: z.ZodString;
    jobType: z.ZodEnum<{
        other: "other";
        adu: "adu";
        service_upgrade: "service_upgrade";
        remodel: "remodel";
        small_job: "small_job";
        ev_charger: "ev_charger";
    }>;
    step: z.ZodEnum<{
        failed: "failed";
        draft: "draft";
        upload: "upload";
        scope: "scope";
        price: "price";
        saved: "saved";
    }>;
    fileName: z.ZodNullable<z.ZodString>;
    rawExtraction: z.ZodNullable<z.ZodObject<{
        squareFootage: z.ZodNullable<z.ZodNumber>;
        projectDescription: z.ZodString;
        detectedItems: z.ZodObject<{
            outlets: z.ZodNullable<z.ZodNumber>;
            switches: z.ZodNullable<z.ZodNumber>;
            lightFixtures: z.ZodNullable<z.ZodNumber>;
            recessedLights: z.ZodNullable<z.ZodNumber>;
            ceilingFans: z.ZodNullable<z.ZodNumber>;
            smokeDetectors: z.ZodNullable<z.ZodNumber>;
            carbonMonoxideDetectors: z.ZodNullable<z.ZodNumber>;
            exhaustFans: z.ZodNullable<z.ZodNumber>;
            electricWaterHeater: z.ZodBoolean;
            electricStove: z.ZodBoolean;
            washerDryer: z.ZodBoolean;
            dishwasher: z.ZodBoolean;
            microwave: z.ZodBoolean;
            mainPanelAmps: z.ZodNullable<z.ZodNumber>;
            subPanelAmps: z.ZodNullable<z.ZodNumber>;
            subPanelSpaces: z.ZodNullable<z.ZodNumber>;
            solarPanels: z.ZodBoolean;
            evCharger: z.ZodBoolean;
            trenchingRequired: z.ZodBoolean;
            trenchingFeet: z.ZodNullable<z.ZodNumber>;
            ownerSuppliesFixtures: z.ZodNullable<z.ZodBoolean>;
        }, z.core.$strip>;
        parserNotes: z.ZodNullable<z.ZodString>;
        confidence: z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>;
        legendItems: z.ZodOptional<z.ZodObject<{
            vacancySensors: z.ZodNullable<z.ZodNumber>;
            fluorescentFixtures: z.ZodNullable<z.ZodNumber>;
            wallMountedFixtures: z.ZodNullable<z.ZodNumber>;
            indoorAirVentFans: z.ZodNullable<z.ZodNumber>;
            gfciOutlets: z.ZodNullable<z.ZodNumber>;
            afciCircuits: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    scope: z.ZodNullable<z.ZodObject<{
        squareFootage: z.ZodNumber;
        jobType: z.ZodEnum<{
            other: "other";
            adu: "adu";
            service_upgrade: "service_upgrade";
            remodel: "remodel";
            small_job: "small_job";
            ev_charger: "ev_charger";
        }>;
        projectTitle: z.ZodString;
        outlets: z.ZodNumber;
        switches: z.ZodNumber;
        lightFixtures: z.ZodNumber;
        recessedLights: z.ZodNumber;
        ceilingFans: z.ZodNumber;
        dedicatedCircuits: z.ZodNumber;
        smokeCoDetectors: z.ZodNumber;
        exhaustFans: z.ZodNumber;
        subPanelAmps: z.ZodNullable<z.ZodNumber>;
        subPanelSpaces: z.ZodNullable<z.ZodNumber>;
        mainPanelUpgrade: z.ZodBoolean;
        mainPanelAmps: z.ZodNullable<z.ZodNumber>;
        solarPanels: z.ZodBoolean;
        evCharger: z.ZodBoolean;
        trenchingFeet: z.ZodNumber;
        ownerSuppliesFixtures: z.ZodBoolean;
        exclusions: z.ZodArray<z.ZodString>;
        assumptions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    lineItems: z.ZodNullable<z.ZodObject<{
        lineItems: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            category: z.ZodEnum<{
                minimum: "minimum";
                panel: "panel";
                wiring: "wiring";
                devices: "devices";
                lighting: "lighting";
                appliance: "appliance";
                trenching: "trenching";
                special: "special";
                labor: "labor";
            }>;
            description: z.ZodString;
            quantity: z.ZodNumber;
            unitPrice: z.ZodNumber;
            total: z.ZodNumber;
            notes: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        subtotal: z.ZodNumber;
        tax: z.ZodNumber;
        total: z.ZodNumber;
        pricingNotes: z.ZodString;
        marketRangeLow: z.ZodNumber;
        marketRangeHigh: z.ZodNumber;
        competitivePosition: z.ZodEnum<{
            below: "below";
            competitive: "competitive";
            above: "above";
        }>;
    }, z.core.$strip>>;
    draft: z.ZodNullable<z.ZodObject<{
        title: z.ZodString;
        description: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            category: z.ZodEnum<{
                minimum: "minimum";
                panel: "panel";
                wiring: "wiring";
                devices: "devices";
                lighting: "lighting";
                appliance: "appliance";
                trenching: "trenching";
                special: "special";
                labor: "labor";
            }>;
            description: z.ZodString;
            quantity: z.ZodNumber;
            unitPrice: z.ZodNumber;
            total: z.ZodNumber;
            notes: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        subtotal: z.ZodNumber;
        tax: z.ZodNumber;
        total: z.ZodNumber;
        notes: z.ZodString;
        exclusions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    savedEstimateId: z.ZodNullable<z.ZodString>;
    iterations: z.ZodObject<{
        parser: z.ZodNumber;
        scope: z.ZodNumber;
        price: z.ZodNumber;
        writer: z.ZodNumber;
    }, z.core.$strip>;
    error: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type AgentSessionState = z.infer<typeof AgentSessionStateSchema>;
export declare const MAX_AGENT_ITERATIONS = 5;
export declare const AnalyzeRequestSchema: z.ZodObject<{
    sessionId: z.ZodString;
    confirmedScope: z.ZodOptional<z.ZodObject<{
        squareFootage: z.ZodNumber;
        jobType: z.ZodEnum<{
            other: "other";
            adu: "adu";
            service_upgrade: "service_upgrade";
            remodel: "remodel";
            small_job: "small_job";
            ev_charger: "ev_charger";
        }>;
        projectTitle: z.ZodString;
        outlets: z.ZodNumber;
        switches: z.ZodNumber;
        lightFixtures: z.ZodNumber;
        recessedLights: z.ZodNumber;
        ceilingFans: z.ZodNumber;
        dedicatedCircuits: z.ZodNumber;
        smokeCoDetectors: z.ZodNumber;
        exhaustFans: z.ZodNumber;
        subPanelAmps: z.ZodNullable<z.ZodNumber>;
        subPanelSpaces: z.ZodNullable<z.ZodNumber>;
        mainPanelUpgrade: z.ZodBoolean;
        mainPanelAmps: z.ZodNullable<z.ZodNumber>;
        solarPanels: z.ZodBoolean;
        evCharger: z.ZodBoolean;
        trenchingFeet: z.ZodNumber;
        ownerSuppliesFixtures: z.ZodBoolean;
        exclusions: z.ZodArray<z.ZodString>;
        assumptions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const PriceRequestSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, z.core.$strip>;
export declare const DraftRequestSchema: z.ZodObject<{
    sessionId: z.ZodString;
    confirmedLineItems: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodEnum<{
            minimum: "minimum";
            panel: "panel";
            wiring: "wiring";
            devices: "devices";
            lighting: "lighting";
            appliance: "appliance";
            trenching: "trenching";
            special: "special";
            labor: "labor";
        }>;
        description: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        total: z.ZodNumber;
        notes: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const SaveRequestSchema: z.ZodObject<{
    sessionId: z.ZodString;
    clientId: z.ZodString;
    validUntilDays: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
//# sourceMappingURL=index.d.ts.map