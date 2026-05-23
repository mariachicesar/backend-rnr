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

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import {
  ProspectTypeSchema,
  ProspectStageSchema,
  ProspectPrioritySchema,
  ProspectSourceSchema,
} from '../ai/schemas/b2bSchemas';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────
const ListQuerySchema = z.object({
  stage: ProspectStageSchema.optional(),
  type: ProspectTypeSchema.optional(),
  priority: ProspectPrioritySchema.optional(),
  source: ProspectSourceSchema.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateProspectSchema = z.object({
  companyName: z.string().min(1).max(255),
  contactName: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  zipCode: z.string().max(20).optional().nullable(),
  prospectType: ProspectTypeSchema,
  stage: ProspectStageSchema.optional(),
  priority: ProspectPrioritySchema.optional(),
  cslbLicense: z.string().max(50).optional().nullable(),
  cslbClassification: z.string().max(500).optional().nullable(),
  linkedinUrl: z.string().url().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  source: ProspectSourceSchema.optional(),
});

const UpdateProspectSchema = CreateProspectSchema.partial();

const CreateActivitySchema = z.object({
  type: z.enum([
    'note', 'email', 'call', 'meeting', 'stage_change',
    'agent_discovery', 'research', 'outreach_draft', 'value_asset', 'linkedin_draft',
  ]),
  title: z.string().min(1).max(255),
  body: z.string().max(10000).optional().nullable(),
  metadata: z.string().max(50000).optional().nullable(),
});

// ─── GET / — list with filters ───────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  const { stage, type, priority, source, q, limit, offset } = parsed.data;

  const where: any = {};
  if (stage) where.stage = stage;
  if (type) where.prospectType = type;
  if (priority) where.priority = priority;
  if (source) where.source = source;
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: 'insensitive' } },
      { contactName: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { cslbLicense: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.b2BProspect.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    }),
    prisma.b2BProspect.count({ where }),
  ]);

  res.json({ items, total, limit, offset });
});

// ─── GET /:id — single prospect + activities ─────────────────────────────────
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const prospect = await prisma.b2BProspect.findUnique({
    where: { id: req.params.id },
    include: {
      activities: { orderBy: { createdAt: 'desc' }, take: 100 },
    },
  });
  if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
  res.json(prospect);
});

// ─── POST / — create manually ────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = CreateProspectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  try {
    const created = await prisma.b2BProspect.create({
      data: {
        ...parsed.data,
        stage: parsed.data.stage ?? 'discovered',
        priority: parsed.data.priority ?? 'medium',
        source: parsed.data.source ?? 'manual',
      },
    });
    await prisma.prospectActivity.create({
      data: {
        prospectId: created.id,
        type: 'note',
        title: 'Prospect created',
        body: 'Manually added to CRM.',
      },
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Prospect with this CSLB license already exists' });
    throw err;
  }
});

// ─── PATCH /:id — update + log stage change ──────────────────────────────────
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = UpdateProspectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const existing = await prisma.b2BProspect.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Prospect not found' });

  const updated = await prisma.b2BProspect.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  if (parsed.data.stage && parsed.data.stage !== existing.stage) {
    await prisma.prospectActivity.create({
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
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const existing = await prisma.b2BProspect.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Prospect not found' });
  await prisma.b2BProspect.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ─── POST /:id/activities — add note ─────────────────────────────────────────
router.post('/:id/activities', async (req: AuthRequest, res: Response) => {
  const parsed = CreateActivitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const exists = await prisma.b2BProspect.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) return res.status(404).json({ error: 'Prospect not found' });

  const activity = await prisma.prospectActivity.create({
    data: { prospectId: req.params.id, ...parsed.data },
  });
  res.status(201).json(activity);
});

export default router;
