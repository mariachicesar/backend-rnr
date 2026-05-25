"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const email_1 = require("../config/email");
const billing_1 = require("../services/billing");
const projects_1 = require("../services/projects");
const router = (0, express_1.Router)();
function formatInvoice(inv, relatedInvoices = [inv], projectLookup) {
    const summary = (0, billing_1.buildInvoiceSummary)(inv, relatedInvoices);
    const billing = (0, billing_1.getInvoiceBillingContext)(inv);
    const project = projectLookup ? (0, projects_1.resolveProjectForInvoice)(inv, projectLookup) : null;
    return {
        ...inv,
        items: JSON.parse(inv.items),
        number: inv.invoiceNumber,
        clientName: inv.client?.name,
        clientEmail: inv.client?.email,
        clientAddress: inv.client?.address,
        billingKind: billing.kind,
        estimateId: billing.sourceEstimateId,
        sourceEstimateId: billing.sourceEstimateId,
        appliesDepositCredit: billing.appliesDepositCredit,
        depositCredit: summary.depositCredit,
        actualPaymentsTotal: summary.actualPaymentsTotal,
        totalPaid: summary.totalPaid,
        balanceDue: summary.balanceDue,
        originalTotal: summary.originalTotal,
        projectId: project?.id || null,
        projectKey: project?.key || `invoice:${inv.id}`,
        projectName: project?.name || null,
        projectStatus: project?.status || null,
        projectSourceType: project?.sourceType || null,
        projectSourceEstimateId: project?.sourceEstimateId || null,
        projectSourceContractId: project?.sourceContractId || null,
        projectClientName: project?.clientName || inv.client?.name || null,
        projectClientEmail: project?.clientEmail || inv.client?.email || null,
    };
}
async function generateInvoiceNumber() {
    const latestInvoice = await database_1.default.invoice.findFirst({
        orderBy: { createdAt: 'desc' },
    });
    const number = latestInvoice ? parseInt(latestInvoice.invoiceNumber.split('-')[1]) + 1 : 2001;
    return `INV-${number}`;
}
// GET /api/invoices
router.get('/', async (req, res) => {
    try {
        const [invoices, projectLookup] = await Promise.all([
            database_1.default.invoice.findMany({
                where: { userId: req.user.id },
                include: { client: true, payments: true },
                orderBy: { createdAt: 'desc' },
            }),
            (0, projects_1.loadProjectLookupForUser)(req.user.id),
        ]);
        const formatted = invoices.map((invoice) => formatInvoice(invoice, invoices, projectLookup));
        res.json(formatted);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});
// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
    try {
        const [invoice, projectLookup] = await Promise.all([
            database_1.default.invoice.findUnique({
                where: { id: req.params.id },
                include: { client: true, payments: true },
            }),
            (0, projects_1.loadProjectLookupForUser)(req.user.id),
        ]);
        if (!invoice || invoice.userId !== req.user.id) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const relatedInvoices = await database_1.default.invoice.findMany({
            where: { userId: req.user.id, clientId: invoice.clientId },
            include: { client: true, payments: true },
        });
        res.json(formatInvoice(invoice, relatedInvoices, projectLookup));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});
// POST /api/invoices - Create invoice
router.post('/', async (req, res) => {
    const { contractId, estimateId, clientId, title, description, items, subtotal, tax, total, dueDate, notes, shouldSend, applyDepositCredit, } = req.body;
    if (!clientId || !title) {
        return res.status(400).json({ error: 'Client and title are required' });
    }
    try {
        const invoiceNumber = await generateInvoiceNumber();
        const mergedNotes = (0, billing_1.mergeBillingMarkers)(notes, {
            KIND: applyDepositCredit ? 'balance' : undefined,
            SOURCE_CONTRACT_ID: contractId || undefined,
            SOURCE_ESTIMATE_ID: estimateId || undefined,
            APPLIES_DEPOSIT_CREDIT: applyDepositCredit ? 'true' : undefined,
        });
        const invoice = await database_1.default.invoice.create({
            data: {
                invoiceNumber,
                contractId,
                clientId,
                userId: req.user.id,
                title,
                description,
                items: JSON.stringify(items || []),
                subtotal,
                tax,
                total,
                dueDate: dueDate ? new Date(dueDate) : null,
                notes: mergedNotes,
            },
            include: { client: true, payments: true },
        });
        if (applyDepositCredit) {
            await (0, billing_1.recalculateInvoiceAndLinkedCredits)(invoice.id);
        }
        const refreshedInvoice = await database_1.default.invoice.findUnique({
            where: { id: invoice.id },
            include: { client: true, payments: true },
        });
        const invoiceForResponse = refreshedInvoice || invoice;
        // Send email if requested
        if (shouldSend) {
            const viewLink = (0, email_1.generateInvoiceLink)(invoiceForResponse.id, invoiceForResponse.clientId);
            const emailHtml = (0, email_1.generateInvoiceEmail)(invoiceForResponse.client.name, invoiceForResponse.invoiceNumber, invoiceForResponse.total, invoiceForResponse.dueDate, viewLink);
            const emailResult = await (0, email_1.sendEmail)({
                to: invoiceForResponse.client.email,
                subject: `Invoice ${invoiceForResponse.invoiceNumber} from RnR Electrical`,
                html: emailHtml,
            });
            if (emailResult.success) {
                await database_1.default.invoice.update({
                    where: { id: invoiceForResponse.id },
                    data: { status: 'sent', sentAt: new Date() },
                });
                await database_1.default.emailLog.create({
                    data: {
                        invoiceId: invoiceForResponse.id,
                        recipient: invoiceForResponse.client.email,
                        subject: `Invoice ${invoiceForResponse.invoiceNumber} from RnR Electrical`,
                        body: emailHtml,
                        status: 'sent',
                    },
                });
            }
        }
        const [relatedInvoices, projectLookup] = await Promise.all([
            database_1.default.invoice.findMany({
                where: { userId: req.user.id, clientId },
                include: { client: true, payments: true },
            }),
            (0, projects_1.loadProjectLookupForUser)(req.user.id),
        ]);
        res.status(201).json(formatInvoice(invoiceForResponse, relatedInvoices, projectLookup));
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});
// PUT /api/invoices/:id - Update invoice
router.put('/:id', async (req, res) => {
    const { clientId, contractId, estimateId, title, description, items, subtotal, tax, total, dueDate, status, notes, applyDepositCredit } = req.body;
    try {
        const invoice = await database_1.default.invoice.findUnique({
            where: { id: req.params.id },
        });
        if (!invoice || invoice.userId !== req.user.id) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const mergedNotes = (0, billing_1.mergeBillingMarkers)(notes ?? invoice.notes, {
            KIND: applyDepositCredit ? 'balance' : undefined,
            SOURCE_CONTRACT_ID: contractId || invoice.contractId || undefined,
            SOURCE_ESTIMATE_ID: estimateId || undefined,
            APPLIES_DEPOSIT_CREDIT: applyDepositCredit ? 'true' : undefined,
        });
        const updated = await database_1.default.invoice.update({
            where: { id: req.params.id },
            data: {
                clientId: clientId || invoice.clientId,
                contractId: contractId || null,
                title,
                description,
                items: JSON.stringify(items || []),
                subtotal,
                tax,
                total,
                dueDate: dueDate ? new Date(dueDate) : null,
                status,
                notes: mergedNotes,
            },
            include: { client: true, payments: true },
        });
        await (0, billing_1.recalculateInvoiceAndLinkedCredits)(updated.id);
        const refreshed = await database_1.default.invoice.findUnique({
            where: { id: updated.id },
            include: { client: true, payments: true },
        });
        const [relatedInvoices, projectLookup] = await Promise.all([
            database_1.default.invoice.findMany({
                where: { userId: req.user.id, clientId: refreshed?.clientId || updated.clientId },
                include: { client: true, payments: true },
            }),
            (0, projects_1.loadProjectLookupForUser)(req.user.id),
        ]);
        res.json(formatInvoice(refreshed || updated, relatedInvoices, projectLookup));
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update invoice' });
    }
});
// DELETE /api/invoices/:id
router.delete('/:id', async (req, res) => {
    try {
        const invoice = await database_1.default.invoice.findUnique({
            where: { id: req.params.id },
        });
        if (!invoice || invoice.userId !== req.user.id) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        await database_1.default.invoice.delete({
            where: { id: req.params.id },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});
// POST /api/invoices/:id/send - Send invoice
router.post('/:id/send', async (req, res) => {
    try {
        const invoice = await database_1.default.invoice.findUnique({
            where: { id: req.params.id },
            include: { client: true },
        });
        if (!invoice || invoice.userId !== req.user.id) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const viewLink = (0, email_1.generateInvoiceLink)(invoice.id, invoice.clientId);
        const emailHtml = (0, email_1.generateInvoiceEmail)(invoice.client.name, invoice.invoiceNumber, invoice.total, invoice.dueDate, viewLink);
        const emailResult = await (0, email_1.sendEmail)({
            to: invoice.client.email,
            subject: `Invoice ${invoice.invoiceNumber} from RnR Electrical`,
            html: emailHtml,
        });
        if (emailResult.success) {
            await database_1.default.invoice.update({
                where: { id: invoice.id },
                data: { status: 'sent', sentAt: new Date() },
            });
            await database_1.default.emailLog.create({
                data: {
                    invoiceId: invoice.id,
                    recipient: invoice.client.email,
                    subject: `Invoice ${invoice.invoiceNumber} from RnR Electrical`,
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
        res.status(500).json({ error: 'Failed to send invoice' });
    }
});
exports.default = router;
//# sourceMappingURL=invoices.js.map