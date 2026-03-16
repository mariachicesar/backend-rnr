import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../config/database';
import { fromStripeAmount, getStripe, getStripeWebhookSecret, normalizePaymentMethod } from '../services/stripe';
import { recalculateInvoiceAndLinkedCredits } from '../services/billing';

const router = Router();

async function recordSuccessfulCheckout(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoiceId;
  const clientId = session.metadata?.clientId;

  if (!invoiceId || !clientId) {
    throw new Error('Missing invoice metadata on Stripe session');
  }

  const referenceNumber = typeof session.payment_intent === 'string' ? session.payment_intent : session.id;
  const amount = fromStripeAmount(session.amount_total);
  const paymentMethod = normalizePaymentMethod(
    session.metadata?.paymentMethod || session.payment_method_types?.[0] || 'card'
  );

  const payment = await prisma.$transaction(async (tx) => {
    const lockKey = `stripe-payment:${invoiceId}:${referenceNumber}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existingPayment = await tx.payment.findFirst({
      where: {
        invoiceId,
        referenceNumber,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existingPayment) {
      const duplicatePayments = await tx.payment.findMany({
        where: {
          invoiceId,
          referenceNumber,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (duplicatePayments.length > 1) {
        await tx.payment.deleteMany({
          where: {
            id: { in: duplicatePayments.slice(1).map((payment) => payment.id) },
          },
        });
      }

      return existingPayment;
    }

    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, clientId },
      include: { payments: true },
    });

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found for Stripe webhook`);
    }

    return tx.payment.create({
      data: {
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        amount,
        paymentMethod,
        paymentDate: new Date(),
        referenceNumber,
        notes: `Stripe checkout session ${session.id}`,
      },
    });
  });

  await recalculateInvoiceAndLinkedCredits(invoiceId);

  return payment;
}

router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];

  if (!signature || Array.isArray(signature)) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(req.body as Buffer, signature, getStripeWebhookSecret());

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (event.type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid') {
        await recordSuccessfulCheckout(session);
      }
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;
      console.warn('[stripe webhook] async payment failed', {
        invoiceId: session.metadata?.invoiceId,
        sessionId: session.id,
      });
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[stripe webhook]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid webhook' });
  }
});

export default router;