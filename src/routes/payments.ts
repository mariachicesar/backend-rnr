import { Router, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { recalculateInvoiceAndLinkedCredits } from '../services/billing';

const router = Router();

function formatPayment(payment: any) {
  const isStripe = typeof payment.notes === 'string' && payment.notes.startsWith('Stripe checkout session');
  const paymentMethod = payment.paymentMethod;

  let sourceLabel = 'Manual';

  if (isStripe && paymentMethod === 'bank_transfer') {
    sourceLabel = 'Stripe ACH';
  } else if (isStripe && paymentMethod === 'credit_card') {
    sourceLabel = 'Stripe Card';
  } else if (paymentMethod === 'zelle') {
    sourceLabel = 'Zelle';
  } else if (paymentMethod === 'check') {
    sourceLabel = 'Check';
  } else if (paymentMethod === 'cash') {
    sourceLabel = 'Cash';
  } else if (paymentMethod === 'bank_transfer') {
    sourceLabel = 'Manual Bank Transfer';
  } else if (paymentMethod === 'credit_card') {
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
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const payments = await prisma.payment.findMany({
      include: { invoice: true, client: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(payments.map(formatPayment));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// GET /api/payments/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { invoice: true, client: true },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(formatPayment(payment));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// POST /api/payments - Create a payment record
router.post('/', async (req: AuthRequest, res: Response) => {
  const {
    invoiceId,
    clientId: providedClientId,
    amount,
    paymentMethod: providedPaymentMethod,
    method,
    paymentDate,
    referenceNumber,
    reference,
    notes,
  } = req.body;

  const paymentMethod = providedPaymentMethod || method;

  if (!invoiceId || !amount || !paymentMethod) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: true, payments: true },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const clientId = providedClientId || invoice.clientId;
    const payment = await prisma.payment.create({
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

    await recalculateInvoiceAndLinkedCredits(invoiceId);

    res.status(201).json(formatPayment(payment));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// DELETE /api/payments/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Recalculate invoice totals after deletion
    const invoice = await prisma.invoice.findUnique({
      where: { id: payment.invoiceId },
      include: { payments: true },
    });

    await prisma.payment.delete({
      where: { id: req.params.id },
    });

    if (invoice) {
      await recalculateInvoiceAndLinkedCredits(invoice.id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

export default router;
