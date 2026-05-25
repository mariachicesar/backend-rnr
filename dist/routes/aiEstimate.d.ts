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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=aiEstimate.d.ts.map