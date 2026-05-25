"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const email_1 = require("../config/email");
const router = (0, express_1.Router)();
async function generateEstimateNumber() {
    const latestEstimate = await database_1.default.estimate.findFirst({
        orderBy: { createdAt: 'desc' },
    });
    const number = latestEstimate ? parseInt(latestEstimate.estimateNumber.split('-')[1]) + 1 : 1001;
    return `EST-${number}`;
}
// GET /api/estimates
router.get('/', async (req, res) => {
    try {
        const estimates = await database_1.default.estimate.findMany({
            where: { userId: req.user.id },
            include: { client: true },
            orderBy: { createdAt: 'desc' },
        });
        const formatted = estimates.map(est => ({
            ...est,
            items: JSON.parse(est.items),
        }));
        res.json(formatted);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch estimates' });
    }
});
// GET /api/estimates/:id
router.get('/:id', async (req, res) => {
    try {
        const estimate = await database_1.default.estimate.findUnique({
            where: { id: req.params.id },
            include: { client: true },
        });
        if (!estimate || estimate.userId !== req.user.id) {
            return res.status(404).json({ error: 'Estimate not found' });
        }
        res.json({
            ...estimate,
            items: JSON.parse(estimate.items),
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch estimate' });
    }
});
// POST /api/estimates - Create estimate
router.post('/', async (req, res) => {
    const { clientId, title, description, items, subtotal, tax, total, validUntil, notes, imageUrls, shouldSend } = req.body;
    if (!clientId || !title) {
        return res.status(400).json({ error: 'Client and title are required' });
    }
    try {
        const estimateNumber = await generateEstimateNumber();
        const estimate = await database_1.default.estimate.create({
            data: {
                estimateNumber,
                clientId,
                userId: req.user.id,
                title,
                description,
                items: JSON.stringify(items || []),
                subtotal,
                tax,
                total,
                validUntil: validUntil ? new Date(validUntil) : null,
                notes,
                imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
            },
            include: { client: true },
        });
        // Send email if requested
        if (shouldSend) {
            const viewLink = (0, email_1.generateEstimateLink)(estimate.id, estimate.clientId);
            const emailHtml = (0, email_1.generateEstimateEmail)(estimate.client.name, estimate.estimateNumber, estimate.total, viewLink);
            const emailResult = await (0, email_1.sendEmail)({
                to: estimate.client.email,
                subject: `Estimate ${estimate.estimateNumber} from RnR Electrical`,
                html: emailHtml,
            });
            if (emailResult.success) {
                await database_1.default.estimate.update({
                    where: { id: estimate.id },
                    data: { status: 'sent', sentAt: new Date() },
                });
                await database_1.default.emailLog.create({
                    data: {
                        estimateId: estimate.id,
                        recipient: estimate.client.email,
                        subject: `Estimate ${estimate.estimateNumber} from RnR Electrical`,
                        body: emailHtml,
                        status: 'sent',
                    },
                });
            }
        }
        res.status(201).json({
            ...estimate,
            items: JSON.parse(estimate.items),
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create estimate' });
    }
});
// PUT /api/estimates/:id - Update estimate
router.put('/:id', async (req, res) => {
    const { title, description, items, subtotal, tax, total, validUntil, notes, imageUrls } = req.body;
    try {
        const estimate = await database_1.default.estimate.findUnique({
            where: { id: req.params.id },
        });
        if (!estimate || estimate.userId !== req.user.id) {
            return res.status(404).json({ error: 'Estimate not found' });
        }
        const updated = await database_1.default.estimate.update({
            where: { id: req.params.id },
            data: {
                title,
                description,
                items: JSON.stringify(items || []),
                subtotal,
                tax,
                total,
                validUntil: validUntil ? new Date(validUntil) : null,
                notes,
                imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
            },
            include: { client: true },
        });
        res.json({
            ...updated,
            items: JSON.parse(updated.items),
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update estimate' });
    }
});
// DELETE /api/estimates/:id
router.delete('/:id', async (req, res) => {
    try {
        const estimate = await database_1.default.estimate.findUnique({
            where: { id: req.params.id },
        });
        if (!estimate || estimate.userId !== req.user.id) {
            return res.status(404).json({ error: 'Estimate not found' });
        }
        await database_1.default.estimate.delete({
            where: { id: req.params.id },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete estimate' });
    }
});
// POST /api/estimates/:id/send - Send estimate to client
router.post('/:id/send', async (req, res) => {
    try {
        const estimate = await database_1.default.estimate.findUnique({
            where: { id: req.params.id },
            include: { client: true },
        });
        if (!estimate || estimate.userId !== req.user.id) {
            return res.status(404).json({ error: 'Estimate not found' });
        }
        const viewLink = (0, email_1.generateEstimateLink)(estimate.id, estimate.clientId);
        const emailHtml = (0, email_1.generateEstimateEmail)(estimate.client.name, estimate.estimateNumber, estimate.total, viewLink);
        const emailResult = await (0, email_1.sendEmail)({
            to: estimate.client.email,
            subject: `Estimate ${estimate.estimateNumber} from RnR Electrical`,
            html: emailHtml,
        });
        if (emailResult.success) {
            await database_1.default.estimate.update({
                where: { id: estimate.id },
                data: { status: 'sent', sentAt: new Date() },
            });
            await database_1.default.emailLog.create({
                data: {
                    estimateId: estimate.id,
                    recipient: estimate.client.email,
                    subject: `Estimate ${estimate.estimateNumber} from RnR Electrical`,
                    body: emailHtml,
                    status: 'sent',
                },
            });
            res.json({ success: true, messageId: emailResult.messageId });
        }
        else {
            res.status(500).json({ success: false, error: emailResult.error });
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send estimate' });
    }
});
// POST /api/estimates/:id/accept - Client accepts estimate
router.post('/:id/accept', async (req, res) => {
    try {
        const estimate = await database_1.default.estimate.findUnique({
            where: { id: req.params.id },
        });
        if (!estimate) {
            return res.status(404).json({ error: 'Estimate not found' });
        }
        const updated = await database_1.default.estimate.update({
            where: { id: req.params.id },
            data: {
                status: 'accepted',
                respondedAt: new Date(),
            },
        });
        res.json(updated);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to accept estimate' });
    }
});
exports.default = router;
//# sourceMappingURL=estimates.js.map