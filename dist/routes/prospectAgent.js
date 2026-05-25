"use strict";
/**
 * Prospect Agent gateway — /api/prospects-agent
 *
 * Mounted with authMiddleware + adminMiddleware in index.ts.
 * IMPORTANT: this route is registered BEFORE /api/prospects so that the agent
 * endpoints never collide with /api/prospects/:id.
 *
 * Endpoints:
 *   POST /discovery                Run a discovery run (CSLB or Google Places)
 *   POST /discovery/cancel         Cancel an in-progress discovery run
 *   GET  /discovery/runs           List recent discovery runs
 *   POST /:prospectId/enrich       Run enrichment agent
 *   POST /:prospectId/research     Run research agent (Agent 4a)
 *   POST /:prospectId/linkedin     Generate LinkedIn drafts (Agent 4b)
 *   POST /:prospectId/asset        Generate value-first asset (Agent 4c)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const prospectOrchestrator_1 = require("../ai/prospectOrchestrator");
const router = (0, express_1.Router)();
// ─── Discovery ────────────────────────────────────────────────────────────────
router.post('/discovery', async (req, res) => {
    try {
        const result = await (0, prospectOrchestrator_1.orchestrateDiscovery)(req.body);
        res.json(result);
    }
    catch (err) {
        if (err.name === 'ZodError')
            return res.status(400).json({ error: 'Invalid config', details: err.flatten?.() });
        if (err.statusCode === 409)
            return res.status(409).json({ error: err.message });
        res.status(500).json({ error: err.message ?? 'Discovery failed' });
    }
});
router.post('/discovery/cancel', async (req, res) => {
    try {
        const { searchType } = req.body ?? {};
        const result = await (0, prospectOrchestrator_1.cancelDiscoveryRun)(searchType);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message ?? 'Cancel failed' });
    }
});
router.get('/discovery/runs', async (_req, res) => {
    const runs = await database_1.default.prospectAgentRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
    res.json({ items: runs });
});
// ─── CSLB trade classification options ────────────────────────────────────────
const CSLB_TRADE_OPTIONS = [
    { code: 'A', label: 'A – General Engineering Contractor' },
    { code: 'B', label: 'B – General Building Contractor' },
    { code: 'B-2', label: 'B-2 – Residential Remodeling Contractor' },
    { code: 'C-2', label: 'C-2 – Insulation and Acoustical' },
    { code: 'C-4', label: 'C-4 – Boiler, Hot-Water Heating, and Steam Fitting' },
    { code: 'C-5', label: 'C-5 – Framing and Rough Carpentry' },
    { code: 'C-6', label: 'C-6 – Cabinet, Millwork, and Finish Carpentry' },
    { code: 'C-7', label: 'C-7 – Low Voltage Systems' },
    { code: 'C-8', label: 'C-8 – Concrete' },
    { code: 'C-9', label: 'C-9 – Drywall' },
    { code: 'C10', label: 'C-10 – Electrical' },
    { code: 'C-11', label: 'C-11 – Elevator' },
    { code: 'C-12', label: 'C-12 – Earthwork and Paving' },
    { code: 'C-13', label: 'C-13 – Fencing' },
    { code: 'C-15', label: 'C-15 – Flooring and Floor Covering' },
    { code: 'C-16', label: 'C-16 – Fire Protection' },
    { code: 'C-17', label: 'C-17 – Glazing' },
    { code: 'C-20', label: 'C-20 – Warm-Air Heating, Ventilating, and Air-Conditioning' },
    { code: 'C-21', label: 'C-21 – Building Moving and Demolition' },
    { code: 'C-22', label: 'C-22 – Asbestos Abatement' },
    { code: 'C-23', label: 'C-23 – Ornamental Metal' },
    { code: 'C-27', label: 'C-27 – Landscaping' },
    { code: 'C-28', label: 'C-28 – Lock and Security Equipment' },
    { code: 'C-29', label: 'C-29 – Masonry' },
    { code: 'C-31', label: 'C-31 – Construction Zone Traffic Control' },
    { code: 'C-32', label: 'C-32 – Parking and Highway Improvement' },
    { code: 'C-33', label: 'C-33 – Painting and Decorating' },
    { code: 'C-34', label: 'C-34 – Pipeline' },
    { code: 'C-35', label: 'C-35 – Lathing and Plastering' },
    { code: 'C-36', label: 'C-36 – Plumbing' },
    { code: 'C-38', label: 'C-38 – Refrigeration' },
    { code: 'C-39', label: 'C-39 – Roofing' },
    { code: 'C-42', label: 'C-42 – Sanitation System' },
    { code: 'C-43', label: 'C-43 – Sheet Metal' },
    { code: 'C-45', label: 'C-45 – Sign' },
    { code: 'C-46', label: 'C-46 – Solar' },
    { code: 'C-47', label: 'C-47 – General Manufactured Housing' },
    { code: 'C-50', label: 'C-50 – Reinforcing Steel' },
    { code: 'C-51', label: 'C-51 – Structural Steel' },
    { code: 'C-53', label: 'C-53 – Swimming Pool' },
    { code: 'C-54', label: 'C-54 – Ceramic and Mosaic Tile' },
    { code: 'C-55', label: 'C-55 – Water Conditioning' },
    { code: 'C-57', label: 'C-57 – Well Drilling' },
    { code: 'C-60', label: 'C-60 – Welding' },
    { code: 'C-61', label: 'C-61 – Limited Specialty' },
];
router.get('/discovery/trade-options', (_req, res) => {
    res.json({ items: CSLB_TRADE_OPTIONS });
});
// ─── Per-prospect agents ──────────────────────────────────────────────────────
router.post('/:prospectId/enrich', async (req, res) => {
    try {
        const output = await (0, prospectOrchestrator_1.orchestrateEnrich)(req.params.prospectId);
        res.json(output);
    }
    catch (err) {
        res.status(err.statusCode ?? 500).json({ error: err.message ?? 'Enrichment failed' });
    }
});
router.post('/:prospectId/research', async (req, res) => {
    try {
        const output = await (0, prospectOrchestrator_1.orchestrateResearch)(req.params.prospectId);
        res.json(output);
    }
    catch (err) {
        res.status(err.statusCode ?? 500).json({ error: err.message ?? 'Research failed' });
    }
});
router.post('/:prospectId/linkedin', async (req, res) => {
    try {
        const output = await (0, prospectOrchestrator_1.orchestrateLinkedIn)(req.params.prospectId);
        res.json(output);
    }
    catch (err) {
        res.status(err.statusCode ?? 500).json({ error: err.message ?? 'LinkedIn draft failed' });
    }
});
router.post('/:prospectId/asset', async (req, res) => {
    try {
        const output = await (0, prospectOrchestrator_1.orchestrateValueAsset)(req.params.prospectId);
        res.json(output);
    }
    catch (err) {
        res.status(err.statusCode ?? 500).json({ error: err.message ?? 'Value asset failed' });
    }
});
router.post('/:prospectId/outreach', async (req, res) => {
    try {
        const output = await (0, prospectOrchestrator_1.orchestrateOutreach)(req.params.prospectId);
        res.json(output);
    }
    catch (err) {
        res.status(err.statusCode ?? 500).json({ error: err.message ?? 'Outreach generation failed' });
    }
});
exports.default = router;
//# sourceMappingURL=prospectAgent.js.map