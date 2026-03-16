/**
 * AI Estimate Gateway — /api/ai/estimate
 *
 * Architecture:
 *   authMiddleware + adminMiddleware (inherited from index.ts)
 *   → request validation (Zod)
 *   → rate limiting (per-user)
 *   → session isolation (sessionId bound to userId)
 *   → orchestrator dispatch
 *
 * Endpoints:
 *   POST   /session              Create a new AI estimate session
 *   POST   /upload/:sessionId    Upload PDF/image → PlanParserAgent
 *   POST   /analyze/:sessionId   Confirm/generate scope → ScopeAnalyzerAgent
 *   POST   /price/:sessionId     Generate line items → PriceCalculatorAgent
 *   POST   /draft/:sessionId     Write final estimate → EstimateWriterAgent
 *   POST   /save/:sessionId      Save estimate to DB
 *   GET    /session/:sessionId   Get session state
 *   GET    /sessions             List all sessions for this user
 *   POST   /quick                Quick estimate for small jobs (no upload)
 *   POST   /reject/:sessionId    Log rejection reason (bid analytics)
 */

import { Router, Response } from 'express';
import multer from 'multer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import {
  orchestrateParsePlan,
  orchestrateAnalyzeScope,
  orchestratePriceEstimate,
  orchestrateWriteDraft,
  orchestrateSaveEstimate,
} from '../ai/orchestrator';
import { getLearningProfileSummary } from '../ai/learningProfile';
import { runQuickEstimateAgent } from '../ai/agents/quickEstimate';
import {
  AnalyzeRequestSchema,
  PriceRequestSchema,
  DraftRequestSchema,
  SaveRequestSchema,
  SmallJobInputSchema,
  ElectricalScopeSchema,
  PlanExtractionSchema,
  JobType,
  PlanExtraction,
} from '../ai/schemas';

const router = Router();

// OpenAI Files API cap — PDFs above this are routed to Gemini instead
const OPENAI_FILE_LIMIT_BYTES = 32 * 1024 * 1024;
// Gemini 1.5 Pro supports up to 2 GB — we cap multer at 200 MB as a sane limit
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

// ─── Multer — in-memory storage, 200MB limit ──────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, PNG, or WebP files are allowed'));
    }
  },
});

// ─── Per-user rate limiting (simple in-memory, good for 2-person team) ────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS ?? 60 * 60 * 1000); // default 1 hour
const RATE_LIMIT_MAX = Number(process.env.AI_RATE_LIMIT_MAX ?? 20); // default 20 ops per window
const RATE_LIMIT_DISABLED =
  process.env.AI_RATE_LIMIT_DISABLED === 'true' || process.env.NODE_ENV !== 'production';

function checkRateLimit(userId: string): boolean {
  if (RATE_LIMIT_DISABLED) return true;

  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ─── Helper: validate Zod schema and return 400 on failure ───────────────────
function validateBody<T>(
  schema: { safeParse: (d: unknown) => { success: boolean; data?: T; error?: any } },
  body: unknown,
  res: Response
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request', details: result.error?.flatten() });
    return null;
  }
  return result.data as T;
}

function shouldRetryPdfWithVision(extraction: PlanExtraction): boolean {
  const items = extraction.detectedItems;
  const numericSignals = [
    items.outlets,
    items.switches,
    items.lightFixtures,
    items.recessedLights,
    items.ceilingFans,
    items.smokeDetectors,
    items.carbonMonoxideDetectors,
    items.exhaustFans,
    items.mainPanelAmps,
    items.subPanelAmps,
    items.subPanelSpaces,
    items.trenchingFeet,
  ].filter((v) => typeof v === 'number');

  const booleanSignals = [
    items.electricWaterHeater,
    items.electricStove,
    items.washerDryer,
    items.dishwasher,
    items.microwave,
    items.solarPanels,
    items.evCharger,
    items.trenchingRequired,
  ].filter((v) => v === true);

  const metadataSignals = [
    typeof extraction.squareFootage === 'number',
    !!items.ownerSuppliesFixtures,
  ].filter(Boolean);

  const totalSignals = numericSignals.length + booleanSignals.length + metadataSignals.length;
  return extraction.confidence === 'low' && totalSignals <= 2;
}

// ─── POST /session — Create new session ──────────────────────────────────────
router.post('/session', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in an hour.' });
  }

  const jobType = req.body.jobType ?? 'adu';
  const jobTypeParsed = JobType.safeParse(jobType);
  if (!jobTypeParsed.success) {
    return res.status(400).json({ error: 'Invalid jobType' });
  }

  const session = await prisma.aiEstimateSession.create({
    data: {
      userId,
      jobType: jobTypeParsed.data,
      step: 'upload',
      iterations: JSON.stringify({ parser: 0, scope: 0, price: 0, writer: 0 }),
    },
  });

  res.status(201).json({ sessionId: session.id, step: session.step, jobType: session.jobType });
});

// ─── POST /upload/:sessionId — Upload & parse plan ───────────────────────────
router.post('/upload/:sessionId', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Reset parser iteration counter before each new upload so the limit
  // tracks retries-on-failure, not cumulative page uploads from the picker.
  await prisma.aiEstimateSession.updateMany({
    where: { id: sessionId, userId },
    data: {
      fileName: req.file.originalname,
      // Reset only the parser counter; leave other agent counters intact
      iterations: JSON.stringify({ parser: 0, scope: 0, price: 0, writer: 0 }),
    },
  });

  let parserInput: { text?: string; imageBase64?: string; mimeType?: string };

  if (req.file.mimetype === 'application/pdf') {
    // Extract text from PDF
    let extractedText = '';
    try {
      const pdfData = await pdfParse(req.file.buffer);
      extractedText = pdfData.text ?? '';
    } catch { /* scanned PDF — no text layer */ }

    if (extractedText.trim().length > 100) {
      // Text-based PDF — use cheaper gpt-4o-mini
      parserInput = { text: extractedText };
    } else if (extractedText.trim().length > 0) {
      // Short text but some content — use what we have
      parserInput = { text: extractedText };
    } else {
      // Scanned/image PDF — planParser will route to OpenAI Files API (<32MB)
      // or Gemini 1.5 Pro (≥32MB) based on file size
      parserInput = {
        imageBase64: req.file.buffer.toString('base64'),
        mimeType: 'application/pdf',
      };
    }
  } else {
    // Image file
    parserInput = {
      imageBase64: req.file.buffer.toString('base64'),
      mimeType: req.file.mimetype,
    };
  }

  let parseResult = await orchestrateParsePlan(sessionId, userId, parserInput);

  // If text extraction looked weak, retry once with full PDF vision parsing.
  if (
    req.file.mimetype === 'application/pdf' &&
    parserInput.text &&
    shouldRetryPdfWithVision(parseResult.extraction)
  ) {
    parseResult = await orchestrateParsePlan(sessionId, userId, {
      imageBase64: req.file.buffer.toString('base64'),
      mimeType: 'application/pdf',
    });
  }

  res.json({ sessionId, step: parseResult.state.step, extraction: parseResult.extraction });
});

// ─── POST /analyze/:sessionId — Confirm scope ────────────────────────────────
router.post('/analyze/:sessionId', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  // Optional: user can confirm/override scope manually
  let confirmedScope;
  if (req.body.confirmedScope) {
    const parsed = ElectricalScopeSchema.safeParse(req.body.confirmedScope);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid scope data', details: parsed.error.flatten() });
    }
    confirmedScope = parsed.data;
  }

  let extractedForLearning: PlanExtraction | undefined;
  if (req.body.extractedForLearning) {
    const parsed = PlanExtractionSchema.safeParse(req.body.extractedForLearning);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid extractedForLearning data', details: parsed.error.flatten() });
    }
    extractedForLearning = parsed.data;
  }

  const { state, scope } = await orchestrateAnalyzeScope(sessionId, userId, confirmedScope, extractedForLearning);
  res.json({ sessionId, step: state.step, scope });
});

// ─── POST /price/:sessionId — Price estimate ─────────────────────────────────
router.post('/price/:sessionId', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  const { state, priced } = await orchestratePriceEstimate(sessionId, userId);
  res.json({ sessionId, step: state.step, priced });
});

// ─── POST /draft/:sessionId — Write draft ────────────────────────────────────
router.post('/draft/:sessionId', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  const confirmedLineItems = req.body.confirmedLineItems ?? undefined;
  const { state, draft } = await orchestrateWriteDraft(sessionId, userId, confirmedLineItems);
  res.json({ sessionId, step: state.step, draft });
});

// ─── POST /save/:sessionId — Save to estimate system ─────────────────────────
router.post('/save/:sessionId', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  const body = validateBody(SaveRequestSchema, { ...req.body, sessionId }, res);
  if (!body) return;

  const { state, estimateId } = await orchestrateSaveEstimate(
    sessionId,
    userId,
    body.clientId,
    body.validUntilDays
  );

  res.json({ sessionId, step: state.step, estimateId });
});

// ─── GET /session/:sessionId — Get session state ──────────────────────────────
router.get('/session/:sessionId', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  const session = await prisma.aiEstimateSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) return res.status(404).json({ error: 'Session not found' });

  res.json(session);
});

// ─── GET /sessions — List sessions (bid analytics data) ──────────────────────
router.get('/sessions', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const sessions = await prisma.aiEstimateSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      step: true,
      jobType: true,
      fileName: true,
      savedEstimateId: true,
      rejectionReason: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(sessions);
});

// ─── GET /learning-profile — Correction learning summary ─────────────────────
router.get('/learning-profile', async (_req: AuthRequest, res: Response) => {
  const summary = getLearningProfileSummary();
  res.json(summary);
});

// ─── POST /quick — Quick estimate for small/phone jobs ───────────────────────
router.post('/quick', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  if (!checkRateLimit(userId)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }

  const body = validateBody(SmallJobInputSchema, req.body, res);
  if (!body) return;

  const result = await runQuickEstimateAgent(body);
  res.json(result);
});

// ─── POST /reject/:sessionId — Log rejection reason (bid analytics) ──────────
router.post('/reject/:sessionId', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { sessionId } = req.params;

  const VALID_REASONS = ['price_too_high', 'went_competitor', 'project_cancelled', 'no_response', 'other'];
  const reason = req.body.reason;

  if (!reason || !VALID_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'Invalid rejection reason', validReasons: VALID_REASONS });
  }

  const updated = await prisma.aiEstimateSession.updateMany({
    where: { id: sessionId, userId },
    data: { rejectionReason: reason },
  });

  if (updated.count === 0) return res.status(404).json({ error: 'Session not found' });

  res.json({ ok: true, rejectionReason: reason });
});

export default router;
