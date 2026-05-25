"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrateDiscovery = orchestrateDiscovery;
exports.cancelDiscoveryRun = cancelDiscoveryRun;
exports.orchestrateEnrich = orchestrateEnrich;
exports.orchestrateResearch = orchestrateResearch;
exports.orchestrateLinkedIn = orchestrateLinkedIn;
exports.orchestrateValueAsset = orchestrateValueAsset;
exports.orchestrateOutreach = orchestrateOutreach;
const database_1 = __importDefault(require("../config/database"));
const cslbAgent_1 = require("./agents/cslbAgent");
const googlePlacesAgent_1 = require("./agents/googlePlacesAgent");
const prospectEnrichAgent_1 = require("./agents/prospectEnrichAgent");
const prospectResearchAgent_1 = require("./agents/prospectResearchAgent");
const linkedinDraftAgent_1 = require("./agents/linkedinDraftAgent");
const valueAssetAgent_1 = require("./agents/valueAssetAgent");
const outreachAgent_1 = require("./agents/outreachAgent");
const b2bSchemas_1 = require("./schemas/b2bSchemas");
// In-memory controllers for cancelling active discovery runs.
const discoveryControllers = new Map();
// ─── Discovery ────────────────────────────────────────────────────────────────
/**
 * Run discovery via the configured search source (CSLB or Google Places).
 * Creates a ProspectAgentRun row, deduplicates against existing prospects by
 * cslbLicense (CSLB) or companyName+city (Places), and bulk-inserts.
 */
async function orchestrateDiscovery(rawConfig) {
    const config = b2bSchemas_1.DiscoveryConfigSchema.parse(rawConfig);
    // Concurrency guard — refuse a second discovery of the same searchType while one is running.
    const inFlight = await database_1.default.prospectAgentRun.findFirst({
        where: { searchType: config.searchType, status: 'running' },
    });
    if (inFlight) {
        const err = new Error(`A ${config.searchType} discovery run is already in progress.`);
        err.statusCode = 409;
        throw err;
    }
    const run = await database_1.default.prospectAgentRun.create({
        data: {
            searchType: config.searchType,
            tradeFilter: config.tradeFilter ?? null,
            cityFilter: config.cityFilter ?? null,
            licenseAge: config.licenseAge ?? null,
            status: 'running',
        },
    });
    const controller = new AbortController();
    discoveryControllers.set(run.id, controller);
    try {
        let found = 0;
        let imported = 0;
        let skipped = 0;
        if (config.searchType === 'cslb') {
            const { prospects } = await (0, cslbAgent_1.runCSLBAgent)(config, controller.signal);
            found = prospects.length;
            const result = await persistCSLB(prospects);
            imported = result.imported;
            skipped = result.skipped;
        }
        else {
            const { prospects } = await (0, googlePlacesAgent_1.runGooglePlacesAgent)(config, controller.signal);
            found = prospects.length;
            const result = await persistPlaces(prospects);
            imported = result.imported;
            skipped = result.skipped;
        }
        await database_1.default.prospectAgentRun.update({
            where: { id: run.id },
            data: {
                status: 'completed',
                found,
                imported,
                skipped,
                resultSummary: `Found ${found}, imported ${imported}, skipped ${skipped} duplicates.`,
            },
        });
        return { runId: run.id, found, imported, skipped };
    }
    catch (err) {
        const isAbort = err?.name === 'AbortError';
        await database_1.default.prospectAgentRun.update({
            where: { id: run.id },
            data: {
                status: isAbort ? 'cancelled' : 'failed',
                errorMessage: err.message?.slice(0, 1000) ?? 'Unknown error',
            },
        });
        throw err;
    }
    finally {
        discoveryControllers.delete(run.id);
    }
}
async function cancelDiscoveryRun(searchType) {
    const run = await database_1.default.prospectAgentRun.findFirst({
        where: {
            status: 'running',
            ...(searchType ? { searchType } : {}),
        },
        orderBy: { createdAt: 'desc' },
    });
    if (!run) {
        return { cancelled: false };
    }
    const controller = discoveryControllers.get(run.id);
    if (controller)
        controller.abort();
    await database_1.default.prospectAgentRun.update({
        where: { id: run.id },
        data: {
            status: 'cancelled',
            errorMessage: 'Cancelled by user',
        },
    });
    discoveryControllers.delete(run.id);
    return { cancelled: true, runId: run.id };
}
async function persistCSLB(prospects) {
    let imported = 0;
    let skipped = 0;
    for (const p of prospects) {
        const existing = await database_1.default.b2BProspect.findUnique({ where: { cslbLicense: p.cslbLicense } });
        if (existing) {
            skipped += 1;
            continue;
        }
        const created = await database_1.default.b2BProspect.create({
            data: {
                companyName: p.companyName,
                phone: p.phone,
                address: p.address,
                city: p.city,
                state: p.state,
                zipCode: p.zipCode,
                prospectType: p.prospectType,
                cslbLicense: p.cslbLicense,
                cslbClassification: p.cslbClassification,
                cslbStatus: p.cslbStatus,
                licenseIssuedDate: p.licenseIssuedDate,
                licenseExpireDate: p.licenseExpireDate,
                source: p.source,
                sourceUrl: p.sourceUrl,
                stage: 'discovered',
                priority: 'medium',
            },
        });
        await database_1.default.prospectActivity.create({
            data: {
                prospectId: created.id,
                type: 'agent_discovery',
                title: 'Discovered via CSLB agent',
                body: `Imported from CA Open Data CSLB dataset. License: ${p.cslbLicense}`,
            },
        });
        imported += 1;
    }
    return { imported, skipped };
}
async function persistPlaces(prospects) {
    let imported = 0;
    let skipped = 0;
    for (const p of prospects) {
        // Dedupe by companyName + city (case-insensitive)
        const existing = await database_1.default.b2BProspect.findFirst({
            where: {
                companyName: { equals: p.companyName, mode: 'insensitive' },
                city: p.city ? { equals: p.city, mode: 'insensitive' } : undefined,
            },
        });
        if (existing) {
            skipped += 1;
            continue;
        }
        const created = await database_1.default.b2BProspect.create({
            data: {
                companyName: p.companyName,
                phone: p.phone,
                website: p.website,
                address: p.address,
                city: p.city,
                state: p.state,
                zipCode: p.zipCode,
                prospectType: p.prospectType,
                source: p.source,
                sourceUrl: p.sourceUrl,
                stage: 'discovered',
                priority: 'medium',
            },
        });
        await database_1.default.prospectActivity.create({
            data: {
                prospectId: created.id,
                type: 'agent_discovery',
                title: 'Discovered via Google Places agent',
                body: `Imported from Google Places. place_id: ${p.placeId}`,
            },
        });
        imported += 1;
    }
    return { imported, skipped };
}
// ─── Iteration tracker (in-memory, per-prospect) ─────────────────────────────
// Simple counter to enforce MAX_B2B_AGENT_ITERATIONS per prospect across a process lifetime.
const iterationMap = new Map();
function bumpIteration(prospectId, key) {
    const cur = iterationMap.get(prospectId) ?? { enrich: 0, research: 0, linkedin: 0, asset: 0 };
    const next = cur[key];
    cur[key] = next + 1;
    iterationMap.set(prospectId, cur);
    return next;
}
// ─── Enrichment ──────────────────────────────────────────────────────────────
async function orchestrateEnrich(prospectId) {
    const prospect = await database_1.default.b2BProspect.findUnique({ where: { id: prospectId } });
    if (!prospect)
        throw new Error('Prospect not found');
    const iterationCount = bumpIteration(prospectId, 'enrich');
    try {
        const output = await (0, prospectEnrichAgent_1.runProspectEnrichAgent)({
            companyName: prospect.companyName,
            city: prospect.city,
            prospectType: prospect.prospectType,
            cslbClassification: prospect.cslbClassification,
            licenseIssuedDate: prospect.licenseIssuedDate,
            website: prospect.website,
        }, iterationCount);
        await database_1.default.b2BProspect.update({
            where: { id: prospectId },
            data: {
                contactName: output.contactName ?? prospect.contactName,
                linkedinUrl: output.linkedinUrl ?? prospect.linkedinUrl,
                priority: output.priority,
                enrichmentSummary: output.enrichmentSummary,
            },
        });
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'research',
                title: 'Enrichment complete',
                body: output.enrichmentSummary,
                metadata: JSON.stringify({
                    emailHint: output.emailHint,
                    hooks: output.hooks,
                    confidence: output.confidence,
                }),
            },
        });
        return output;
    }
    catch (err) {
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'research',
                title: 'Enrichment failed',
                body: err.message?.slice(0, 500) ?? 'Unknown error',
            },
        });
        throw err;
    }
}
// ─── Research (Agent 4a) ─────────────────────────────────────────────────────
async function orchestrateResearch(prospectId) {
    const prospect = await database_1.default.b2BProspect.findUnique({ where: { id: prospectId } });
    if (!prospect)
        throw new Error('Prospect not found');
    const iterationCount = bumpIteration(prospectId, 'research');
    try {
        const output = await (0, prospectResearchAgent_1.runProspectResearchAgent)({
            companyName: prospect.companyName,
            website: prospect.website,
            cslbClassification: prospect.cslbClassification,
            licenseIssuedDate: prospect.licenseIssuedDate,
            city: prospect.city,
            prospectType: prospect.prospectType,
        }, iterationCount);
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'research',
                title: 'Research profile generated',
                body: output.companyProfile,
                metadata: JSON.stringify(output),
            },
        });
        return output;
    }
    catch (err) {
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'research',
                title: 'Research failed',
                body: err.message?.slice(0, 500) ?? 'Unknown error',
            },
        });
        throw err;
    }
}
// ─── Helper: latest research card for a prospect ─────────────────────────────
async function loadLatestResearch(prospectId) {
    const row = await database_1.default.prospectActivity.findFirst({
        where: { prospectId, type: 'research', title: 'Research profile generated' },
        orderBy: { createdAt: 'desc' },
    });
    if (!row?.metadata)
        return null;
    try {
        return JSON.parse(row.metadata);
    }
    catch {
        return null;
    }
}
// ─── LinkedIn drafts (Agent 4b) ──────────────────────────────────────────────
async function orchestrateLinkedIn(prospectId) {
    const prospect = await database_1.default.b2BProspect.findUnique({ where: { id: prospectId } });
    if (!prospect)
        throw new Error('Prospect not found');
    const research = await loadLatestResearch(prospectId);
    if (!research) {
        const err = new Error('Run Research agent first — no research profile available for this prospect.');
        err.statusCode = 400;
        throw err;
    }
    const iterationCount = bumpIteration(prospectId, 'linkedin');
    try {
        const output = await (0, linkedinDraftAgent_1.runLinkedInDraftAgent)({
            companyName: prospect.companyName,
            contactName: prospect.contactName,
            city: prospect.city,
            prospectType: prospect.prospectType,
            research,
        }, iterationCount);
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'linkedin_draft',
                title: 'LinkedIn drafts generated',
                body: `Company-page comment + owner DM ready for review.`,
                metadata: JSON.stringify(output),
            },
        });
        return output;
    }
    catch (err) {
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'linkedin_draft',
                title: 'LinkedIn draft failed',
                body: err.message?.slice(0, 500) ?? 'Unknown error',
            },
        });
        throw err;
    }
}
// ─── Value Asset (Agent 4c) ──────────────────────────────────────────────────
async function orchestrateValueAsset(prospectId) {
    const prospect = await database_1.default.b2BProspect.findUnique({ where: { id: prospectId } });
    if (!prospect)
        throw new Error('Prospect not found');
    const research = await loadLatestResearch(prospectId);
    if (!research) {
        const err = new Error('Run Research agent first — no research profile available for this prospect.');
        err.statusCode = 400;
        throw err;
    }
    const iterationCount = bumpIteration(prospectId, 'asset');
    try {
        const output = await (0, valueAssetAgent_1.runValueAssetAgent)({
            companyName: prospect.companyName,
            city: prospect.city,
            prospectType: prospect.prospectType,
            research,
        }, iterationCount);
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'value_asset',
                title: output.title,
                body: output.callToAction,
                metadata: JSON.stringify(output),
            },
        });
        return output;
    }
    catch (err) {
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'value_asset',
                title: 'Value asset failed',
                body: err.message?.slice(0, 500) ?? 'Unknown error',
            },
        });
        throw err;
    }
}
// ─── Outreach Messages (Agent 3 — CSLB data only, no research needed) ────────
async function orchestrateOutreach(prospectId) {
    const prospect = await database_1.default.b2BProspect.findUnique({ where: { id: prospectId } });
    if (!prospect)
        throw new Error('Prospect not found');
    const licenseIssuedYear = prospect.licenseIssuedDate
        ? new Date(prospect.licenseIssuedDate).getFullYear()
        : null;
    try {
        const output = await (0, outreachAgent_1.runOutreachAgent)({
            companyName: prospect.companyName,
            city: prospect.city,
            classification: prospect.cslbClassification,
            licenseIssuedYear,
            prospectType: prospect.prospectType,
        });
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'outreach',
                title: 'Outreach messages ready',
                body: output.angle,
                metadata: JSON.stringify(output),
            },
        });
        return output;
    }
    catch (err) {
        await database_1.default.prospectActivity.create({
            data: {
                prospectId,
                type: 'outreach',
                title: 'Outreach generation failed',
                body: err.message?.slice(0, 500) ?? 'Unknown error',
            },
        });
        throw err;
    }
}
//# sourceMappingURL=prospectOrchestrator.js.map