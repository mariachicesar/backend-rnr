"use strict";
/**
 * Prospects CRUD — /api/prospects
 *
 * Mounted with authMiddleware + adminMiddleware in index.ts.
 *
 * Endpoints:
 *   GET    /                    List prospects (filters: stage, type, priority, source, q, limit, offset)
 *   GET    /:id                 Get one prospect with activities
 *   POST   /                    Create prospect manually
 *   PATCH  /:id                 Update fields (including stage)
 *   DELETE /:id                 Delete prospect (cascades activities)
 *   POST   /:id/activities      Add note/activity manually
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const b2bSchemas_1 = require("../ai/schemas/b2bSchemas");
const router = (0, express_1.Router)();
// ─── Schemas ──────────────────────────────────────────────────────────────────
const ListQuerySchema = zod_1.z.object({
    stage: b2bSchemas_1.ProspectStageSchema.optional(),
    type: b2bSchemas_1.ProspectTypeSchema.optional(),
    priority: b2bSchemas_1.ProspectPrioritySchema.optional(),
    source: b2bSchemas_1.ProspectSourceSchema.optional(),
    q: zod_1.z.string().max(200).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(200).default(50),
    offset: zod_1.z.coerce.number().int().min(0).default(0),
});
const CreateProspectSchema = zod_1.z.object({
    companyName: zod_1.z.string().min(1).max(255),
    contactName: zod_1.z.string().max(255).optional().nullable(),
    email: zod_1.z.string().email().max(255).optional().nullable(),
    phone: zod_1.z.string().max(50).optional().nullable(),
    website: zod_1.z.string().url().max(500).optional().nullable(),
    address: zod_1.z.string().max(500).optional().nullable(),
    city: zod_1.z.string().max(100).optional().nullable(),
    state: zod_1.z.string().max(50).optional().nullable(),
    zipCode: zod_1.z.string().max(20).optional().nullable(),
    prospectType: b2bSchemas_1.ProspectTypeSchema,
    stage: b2bSchemas_1.ProspectStageSchema.optional(),
    priority: b2bSchemas_1.ProspectPrioritySchema.optional(),
    cslbLicense: zod_1.z.string().max(50).optional().nullable(),
    cslbClassification: zod_1.z.string().max(500).optional().nullable(),
    linkedinUrl: zod_1.z.string().url().max(500).optional().nullable(),
    notes: zod_1.z.string().max(5000).optional().nullable(),
    source: b2bSchemas_1.ProspectSourceSchema.optional(),
});
const UpdateProspectSchema = CreateProspectSchema.partial();
const CreateActivitySchema = zod_1.z.object({
    type: zod_1.z.enum([
        'note', 'email', 'call', 'meeting', 'stage_change',
        'agent_discovery', 'research', 'outreach_draft', 'value_asset', 'linkedin_draft',
    ]),
    title: zod_1.z.string().min(1).max(255),
    body: zod_1.z.string().max(10000).optional().nullable(),
    metadata: zod_1.z.string().max(50000).optional().nullable(),
});
// ─── GET / — list with filters ───────────────────────────────────────────────
router.get('/', async (req, res) => {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success)
        return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    const { stage, type, priority, source, q, limit, offset } = parsed.data;
    const where = {};
    if (stage)
        where.stage = stage;
    if (type)
        where.prospectType = type;
    if (priority)
        where.priority = priority;
    if (source)
        where.source = source;
    if (q) {
        where.OR = [
            { companyName: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
            { cslbLicense: { contains: q, mode: 'insensitive' } },
        ];
    }
    const [items, total] = await Promise.all([
        database_1.default.b2BProspect.findMany({
            where,
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            skip: offset,
        }),
        database_1.default.b2BProspect.count({ where }),
    ]);
    res.json({ items, total, limit, offset });
});
// ─── GET /:id — single prospect + activities ─────────────────────────────────
router.get('/:id', async (req, res) => {
    const prospect = await database_1.default.b2BProspect.findUnique({
        where: { id: req.params.id },
        include: {
            activities: { orderBy: { createdAt: 'desc' }, take: 100 },
        },
    });
    if (!prospect)
        return res.status(404).json({ error: 'Prospect not found' });
    res.json(prospect);
});
// ─── POST / — create manually ────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const parsed = CreateProspectSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    try {
        const created = await database_1.default.b2BProspect.create({
            data: {
                ...parsed.data,
                stage: parsed.data.stage ?? 'discovered',
                priority: parsed.data.priority ?? 'medium',
                source: parsed.data.source ?? 'manual',
            },
        });
        await database_1.default.prospectActivity.create({
            data: {
                prospectId: created.id,
                type: 'note',
                title: 'Prospect created',
                body: 'Manually added to CRM.',
            },
        });
        res.status(201).json(created);
    }
    catch (err) {
        if (err.code === 'P2002')
            return res.status(409).json({ error: 'Prospect with this CSLB license already exists' });
        throw err;
    }
});
// ─── PATCH /:id — update + log stage change ──────────────────────────────────
router.patch('/:id', async (req, res) => {
    const parsed = UpdateProspectSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    const existing = await database_1.default.b2BProspect.findUnique({ where: { id: req.params.id } });
    if (!existing)
        return res.status(404).json({ error: 'Prospect not found' });
    const updated = await database_1.default.b2BProspect.update({
        where: { id: req.params.id },
        data: parsed.data,
    });
    if (parsed.data.stage && parsed.data.stage !== existing.stage) {
        await database_1.default.prospectActivity.create({
            data: {
                prospectId: updated.id,
                type: 'stage_change',
                title: `Stage: ${existing.stage} → ${parsed.data.stage}`,
                body: null,
            },
        });
    }
    res.json(updated);
});
// ─── DELETE /:id ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const existing = await database_1.default.b2BProspect.findUnique({ where: { id: req.params.id } });
    if (!existing)
        return res.status(404).json({ error: 'Prospect not found' });
    await database_1.default.b2BProspect.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});
// ─── POST /:id/activities — add note ─────────────────────────────────────────
router.post('/:id/activities', async (req, res) => {
    const parsed = CreateActivitySchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    const exists = await database_1.default.b2BProspect.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists)
        return res.status(404).json({ error: 'Prospect not found' });
    const activity = await database_1.default.prospectActivity.create({
        data: { prospectId: req.params.id, ...parsed.data },
    });
    res.status(201).json(activity);
});
exports.default = router;
//# sourceMappingURL=prospects.js.map