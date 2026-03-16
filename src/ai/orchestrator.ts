import prisma from '../config/database';
import { runPlanParserAgent } from './agents/planParser';
import { runScopeAnalyzerAgent } from './agents/scopeAnalyzer';
import { runPriceCalculatorAgent } from './agents/priceCalculator';
import { runEstimateWriterAgent } from './agents/estimateWriter';
import { recordScopeCorrection } from './learningProfile';
import {
  AgentSessionState,
  PlanExtraction,
  ElectricalScope,
  PricedEstimate,
  EstimateDraft,
  LineItem,
  MAX_AGENT_ITERATIONS,
} from './schemas';

// ─── Session helpers ──────────────────────────────────────────────────────────

async function loadSession(sessionId: string, userId: string): Promise<AgentSessionState> {
  const row = await prisma.aiEstimateSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!row) throw new Error('Session not found or access denied');

  const iterations = safeParseJson(row.iterations, { parser: 0, scope: 0, price: 0, writer: 0 });

  return {
    sessionId: row.id,
    userId: row.userId,
    jobType: row.jobType as any,
    step: row.step as any,
    fileName: row.fileName ?? null,
    rawExtraction: row.rawExtraction ? safeParseJson(row.rawExtraction, null) : null,
    scope: row.scope ? safeParseJson(row.scope, null) : null,
    lineItems: row.lineItems ? safeParseJson(row.lineItems, null) : null,
    draft: row.draft ? safeParseJson(row.draft, null) : null,
    savedEstimateId: row.savedEstimateId ?? null,
    iterations,
    error: row.errorMessage ?? null,
  };
}

async function saveSession(state: AgentSessionState): Promise<void> {
  await prisma.aiEstimateSession.update({
    where: { id: state.sessionId },
    data: {
      step: state.step,
      rawExtraction: state.rawExtraction ? JSON.stringify(state.rawExtraction) : undefined,
      scope: state.scope ? JSON.stringify(state.scope) : undefined,
      lineItems: state.lineItems ? JSON.stringify(state.lineItems) : undefined,
      draft: state.draft ? JSON.stringify(state.draft) : undefined,
      savedEstimateId: state.savedEstimateId ?? undefined,
      errorMessage: state.error ?? undefined,
      iterations: JSON.stringify(state.iterations),
    },
  });
}

function safeParseJson<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

// ─── Orchestrator: Parse Plan ─────────────────────────────────────────────────
export async function orchestrateParsePlan(
  sessionId: string,
  userId: string,
  input: { text?: string; imageBase64?: string; mimeType?: string }
): Promise<{ state: AgentSessionState; extraction: PlanExtraction }> {
  const state = await loadSession(sessionId, userId);

  if (state.iterations.parser >= MAX_AGENT_ITERATIONS) {
    throw new Error('Plan parser has reached its maximum retry limit. Please review and manually confirm the scope.');
  }

  state.iterations = { ...state.iterations, parser: state.iterations.parser + 1 };

  try {
    const extraction = await runPlanParserAgent(input, state.iterations.parser - 1);
    state.rawExtraction = extraction;
    state.step = 'scope';
    state.error = null;
    await saveSession(state);
    return { state, extraction };
  } catch (err: any) {
    state.error = `PlanParser failed: ${err.message}`;
    state.step = 'failed';
    await saveSession(state);
    throw err;
  }
}

// ─── Orchestrator: Analyze Scope ──────────────────────────────────────────────
export async function orchestrateAnalyzeScope(
  sessionId: string,
  userId: string,
  confirmedScope?: ElectricalScope,
  learningExtraction?: PlanExtraction | null
): Promise<{ state: AgentSessionState; scope: ElectricalScope }> {
  const state = await loadSession(sessionId, userId);

  // If the user manually confirmed scope, skip the AI agent and use it directly
  if (confirmedScope) {
    // Learn from user corrections to improve future parsing accuracy.
    recordScopeCorrection(learningExtraction ?? state.rawExtraction, confirmedScope);
    state.scope = confirmedScope;
    state.step = 'price';
    state.error = null;
    await saveSession(state);
    return { state, scope: confirmedScope };
  }

  if (!state.rawExtraction) throw new Error('No plan extraction found. Run plan parser first.');

  if (state.iterations.scope >= MAX_AGENT_ITERATIONS) {
    throw new Error('Scope analyzer has reached its maximum retry limit.');
  }

  state.iterations = { ...state.iterations, scope: state.iterations.scope + 1 };

  try {
    const scope = await runScopeAnalyzerAgent(state.rawExtraction, state.iterations.scope - 1);
    state.scope = scope;
    state.step = 'price';
    state.error = null;
    await saveSession(state);
    return { state, scope };
  } catch (err: any) {
    state.error = `ScopeAnalyzer failed: ${err.message}`;
    state.step = 'failed';
    await saveSession(state);
    throw err;
  }
}

// ─── Orchestrator: Price Estimate ─────────────────────────────────────────────
export async function orchestratePriceEstimate(
  sessionId: string,
  userId: string
): Promise<{ state: AgentSessionState; priced: PricedEstimate }> {
  const state = await loadSession(sessionId, userId);

  if (!state.scope) throw new Error('No confirmed scope found. Run scope analyzer first.');

  if (state.iterations.price >= MAX_AGENT_ITERATIONS) {
    throw new Error('Price calculator has reached its maximum retry limit.');
  }

  state.iterations = { ...state.iterations, price: state.iterations.price + 1 };

  try {
    const priced = await runPriceCalculatorAgent(state.scope, state.iterations.price - 1);
    state.lineItems = priced;
    state.step = 'draft';
    state.error = null;
    await saveSession(state);
    return { state, priced };
  } catch (err: any) {
    state.error = `PriceCalculator failed: ${err.message}`;
    state.step = 'failed';
    await saveSession(state);
    throw err;
  }
}

// ─── Orchestrator: Write Draft ────────────────────────────────────────────────
export async function orchestrateWriteDraft(
  sessionId: string,
  userId: string,
  confirmedLineItems?: LineItem[]
): Promise<{ state: AgentSessionState; draft: EstimateDraft }> {
  const state = await loadSession(sessionId, userId);

  if (!state.scope) throw new Error('No scope found.');
  if (!state.lineItems) throw new Error('No priced line items found.');

  // Allow user to override line items before writing
  if (confirmedLineItems && confirmedLineItems.length > 0) {
    const subtotal = confirmedLineItems.reduce((s, i) => s + i.total, 0);
    state.lineItems = { ...state.lineItems, lineItems: confirmedLineItems, subtotal, total: subtotal };
  }

  if (state.iterations.writer >= MAX_AGENT_ITERATIONS) {
    throw new Error('Estimate writer has reached its maximum retry limit.');
  }

  state.iterations = { ...state.iterations, writer: state.iterations.writer + 1 };

  try {
    const draft = await runEstimateWriterAgent(state.scope, state.lineItems, state.iterations.writer - 1);
    state.draft = draft;
    state.step = 'draft';
    state.error = null;
    await saveSession(state);
    return { state, draft };
  } catch (err: any) {
    state.error = `EstimateWriter failed: ${err.message}`;
    state.step = 'failed';
    await saveSession(state);
    throw err;
  }
}

// ─── Orchestrator: Save as Estimate ──────────────────────────────────────────
export async function orchestrateSaveEstimate(
  sessionId: string,
  userId: string,
  clientId: string,
  validUntilDays: number = 30
): Promise<{ state: AgentSessionState; estimateId: string }> {
  const state = await loadSession(sessionId, userId);

  if (!state.draft) throw new Error('No draft found. Run estimate writer first.');

  // Generate estimate number
  const latest = await prisma.estimate.findFirst({ orderBy: { createdAt: 'desc' } });
  const nextNum = latest ? parseInt(latest.estimateNumber.split('-')[1] || '1000') + 1 : 1001;
  const estimateNumber = `EST-${nextNum}`;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + validUntilDays);

  const estimate = await prisma.estimate.create({
    data: {
      estimateNumber,
      clientId,
      userId,
      title: state.draft.title,
      description: state.draft.description,
      items: JSON.stringify(state.draft.items),
      subtotal: state.draft.subtotal,
      tax: state.draft.tax,
      total: state.draft.total,
      validUntil,
      notes: state.draft.notes + (state.draft.exclusions?.length
        ? '\n\nEXCLUSIONS:\n' + state.draft.exclusions.map((e: string) => `• ${e}`).join('\n')
        : ''),
      status: 'draft',
    },
  });

  state.savedEstimateId = estimate.id;
  state.step = 'saved';
  await saveSession(state);

  return { state, estimateId: estimate.id };
}
