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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=prospects.d.ts.map