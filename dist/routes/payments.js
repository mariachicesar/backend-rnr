"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const billing_1 = require("../services/billing");
const router = (0, express_1.Router)();
function formatPayment(payment) {
    const isStripe = typeof payment.notes === 'string' && payment.notes.startsWith('Stripe checkout session');
    const paymentMethod = payment.paymentMethod;
    let sourceLabel = 'Manual';
    if (isStripe && paymentMethod === 'bank_transfer') {
        sourceLabel = 'Stripe ACH';
    }
    else if (isStripe && paymentMethod === 'credit_card') {
        sourceLabel = 'Stripe Card';
    }
    else if (paymentMethod === 'zelle') {
        sourceLabel = 'Zelle';
    }
    else if (paymentMethod === 'check') {
        sourceLabel = 'Check';
    }
    else if (paymentMethod === 'cash') {
        sourceLabel = 'Cash';
    }
    else if (paymentMethod === 'bank_transfer') {
        sourceLabel = 'Manual Bank Transfer';
    }
    else if (paymentMethod === 'credit_card') {
        sourceLabel = 'Manual Card';
    }
    return {
        ...payment,
        method: payment.paymentMethod,
        reference: payment.referenceNumber,
        invoiceNumber: payment.invoice?.invoiceNumber,
        clientName: payment.client?.name,
        source: isStripe ? 'stripe' : 'manual',
        sourceLabel,
        methodLabel: payment.paymentMethod.replace(/_/g, ' '),
    };
}
// GET /api/payments
router.get('/', async (req, res) => {
    try {
        const payments = await database_1.default.payment.findMany({
            include: { invoice: true, client: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(payments.map(formatPayment));
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});
// GET /api/payments/:id
router.get('/:id', async (req, res) => {
    try {
        const payment = await database_1.default.payment.findUnique({
            where: { id: req.params.id },
            include: { invoice: true, client: true },
        });
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        res.json(formatPayment(payment));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch payment' });
    }
});
// POST /api/payments - Create a payment record
router.post('/', async (req, res) => {
    const { invoiceId, clientId: providedClientId, amount, paymentMethod: providedPaymentMethod, method, paymentDate, referenceNumber, reference, notes, } = req.body;
    const paymentMethod = providedPaymentMethod || method;
    if (!invoiceId || !amount || !paymentMethod) {
        return res.status(400).json({ error: 'Required fields missing' });
    }
    try {
        const invoice = await database_1.default.invoice.findUnique({
            where: { id: invoiceId },
            include: { client: true, payments: true },
        });
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const clientId = providedClientId || invoice.clientId;
        const payment = await database_1.default.payment.create({
            data: {
                invoiceId,
                clientId,
                amount,
                paymentMethod,
                paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                referenceNumber: referenceNumber || reference,
                notes,
            },
            include: { invoice: true, client: true },
        });
        await (0, billing_1.recalculateInvoiceAndLinkedCredits)(invoiceId);
        res.status(201).json(formatPayment(payment));
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});
// DELETE /api/payments/:id
router.delete('/:id', async (req, res) => {
    try {
        const payment = await database_1.default.payment.findUnique({
            where: { id: req.params.id },
        });
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        // Recalculate invoice totals after deletion
        const invoice = await database_1.default.invoice.findUnique({
            where: { id: payment.invoiceId },
            include: { payments: true },
        });
        await database_1.default.payment.delete({
            where: { id: req.params.id },
        });
        if (invoice) {
            await (0, billing_1.recalculateInvoiceAndLinkedCredits)(invoice.id);
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete payment' });
    }
});
exports.default = router;
//# sourceMappingURL=payments.js.map