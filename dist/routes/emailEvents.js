"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const emailIntake_1 = require("../services/emailIntake");
const router = (0, express_1.Router)();
// GET /api/email-events
router.get('/', async (req, res) => {
    try {
        const status = req.query.status || undefined;
        const category = req.query.category || undefined;
        const clientId = req.query.clientId || undefined;
        const limitRaw = req.query.limit;
        const limit = limitRaw ? Number(limitRaw) : undefined;
        const events = await (0, emailIntake_1.listEmailEvents)({ status, category, clientId, limit });
        res.json(events);
    }
    catch (error) {
        console.error('[email-events GET]', error);
        res.status(500).json({ error: 'Failed to fetch email events' });
    }
});
// POST /api/email-events/sync
router.post('/sync', async (req, res) => {
    try {
        const sinceDays = Number(req.body?.sinceDays ?? 2);
        const maxResults = Number(req.body?.maxResults ?? 50);
        const result = await (0, emailIntake_1.syncInboxRulesFirst)({ sinceDays, maxResults });
        res.json(result);
    }
    catch (error) {
        console.error('[email-events sync]', error);
        const err = error;
        const errText = [
            err?.message,
            err?.cause?.message,
            err?.response?.data?.error?.message,
        ]
            .filter(Boolean)
            .join(' | ')
            .toLowerCase();
        if (errText.includes('insufficient authentication scopes')) {
            return res.status(400).json({
                error: 'Gmail OAuth token is missing required Gmail scopes.',
                action: 'Re-authorize the Google OAuth refresh token with Gmail read scope: https://www.googleapis.com/auth/gmail.readonly',
            });
        }
        if (errText.includes('gmail api has not been used') ||
            errText.includes('it is disabled') ||
            errText.includes('access not configured')) {
            const projectId = err?.cause?.details?.find?.((d) => d?.metadata?.consumer)?.metadata?.consumer?.replace('projects/', '');
            return res.status(400).json({
                error: 'Gmail API is disabled for the Google Cloud project used by your OAuth client.',
                action: projectId
                    ? `Enable Gmail API for project ${projectId}: https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=${projectId}`
                    : 'Enable Gmail API in Google Cloud Console for the OAuth project, then retry in a few minutes.',
            });
        }
        res.status(500).json({ error: 'Failed to sync email inbox' });
    }
});
// PATCH /api/email-events/:id
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const status = req.body?.status;
        const summary = req.body?.summary;
        const matchedClientId = req.body?.matchedClientId;
        if (status && !['needs_review', 'approved', 'resolved'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const updated = await (0, emailIntake_1.updateEmailEvent)(id, {
            status: status,
            summary,
            matchedClientId,
        });
        if (!updated) {
            return res.status(404).json({ error: 'Email event not found' });
        }
        res.json(updated);
    }
    catch (error) {
        console.error('[email-events PATCH]', error);
        res.status(500).json({ error: 'Failed to update email event' });
    }
});
exports.default = router;
//# sourceMappingURL=emailEvents.js.map