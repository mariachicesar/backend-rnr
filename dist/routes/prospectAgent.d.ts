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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=prospectAgent.d.ts.map