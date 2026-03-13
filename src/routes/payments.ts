import { Router, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/payments
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const payments = await prisma.payment.findMany({
      include: { invoice: true, client: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(payments);
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

    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// POST /api/payments - Create a payment record
router.post('/', async (req: AuthRequest, res: Response) => {
  const { invoiceId, clientId, amount, paymentMethod, paymentDate, referenceNumber, notes } = req.body;

  if (!invoiceId || !clientId || !amount || !paymentMethod) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  try {
    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        clientId,
        amount,
        paymentMethod,
        paymentDate: new Date(paymentDate),
        referenceNumber,
        notes,
      },
      include: { invoice: true, client: true },
    });

    // Update invoice amountPaid and status
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });

    if (invoice) {
      const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0) + amount;
      let status = 'partially_paid';
      let paidAt = null;

      if (totalPaid >= invoice.total) {
        status = 'paid';
        paidAt = new Date();
      }

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: totalPaid,
          status,
          paidAt,
        },
      });
    }

    res.status(201).json(payment);
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
      const remainingPayments = invoice.payments.filter(p => p.id !== req.params.id);
      const totalPaid = remainingPayments.reduce((sum, p) => sum + p.amount, 0);
      let status = 'draft';

      if (totalPaid > 0 && totalPaid < invoice.total) {
        status = 'partially_paid';
      } else if (totalPaid >= invoice.total) {
        status = 'paid';
      } else if (invoice.sentAt && !totalPaid) {
        status = 'sent';
      }

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: totalPaid,
          status,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

export default router;
