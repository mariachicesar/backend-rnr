import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { createGoogleCalendarEventForAppointment, isGoogleCalendarSyncEnabled } from '../services/googleCalendar';
import { buildInvoiceTrackUrl, getStripe, toStripeAmount } from '../services/stripe';
import { sendEmail, generateInvoiceEmail, generateInvoiceLink } from '../config/email';

const router = Router();

const AUTO_DEPOSIT_THRESHOLD = 10000;
const AUTO_DEPOSIT_PERCENTAGE = 0.1;
const AUTO_DEPOSIT_MINIMUM = 50;

function parseItems(raw: string | null | undefined) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function generateInvoiceNumber() {
  const latestInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  const number = latestInvoice ? parseInt(latestInvoice.invoiceNumber.split('-')[1]) + 1 : 2001;
  return `INV-${number}`;
}

function roundMoney(amount: number) {
  return Number(amount.toFixed(2));
}

function calculateAutoDepositAmount(total: number) {
  return roundMoney(Math.max(total * AUTO_DEPOSIT_PERCENTAGE, AUTO_DEPOSIT_MINIMUM));
}

function isValidEmail(email: string | null | undefined) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/public/track — client auth via last 4 phone digits + last name
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { lastFourDigits, lastName } = req.body;

    if (!lastFourDigits || !lastName) {
      return res.status(400).json({ error: 'lastFourDigits and lastName are required' });
    }

    const client = await prisma.client.findFirst({
      where: {
        AND: [
          { phone: { endsWith: lastFourDigits } },
          {
            OR: [
              { name: { endsWith: ` ${lastName}`, mode: 'insensitive' } },
              { name: { equals: lastName, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: {
        estimates: { orderBy: { createdAt: 'asc' } },
        contracts: { orderBy: { createdAt: 'asc' } },
        invoices: { include: { payments: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found. Please check your information.' });
    }

    const latestEstimate = client.estimates[client.estimates.length - 1];
    const latestContract = client.contracts[client.contracts.length - 1];
    const invoices = client.invoices;

    let contractPhases: any[] = [];
    if (latestContract?.phases) {
      try { contractPhases = JSON.parse(latestContract.phases); } catch {}
    }

    const depositInvoice = invoices.find(
      (inv) => inv.title?.toLowerCase().includes('deposit') && inv.status === 'paid'
    );

    const estimateDoc = latestEstimate
      ? {
          id: latestEstimate.id,
          number: latestEstimate.estimateNumber,
          title: latestEstimate.title,
          total: latestEstimate.total,
          status: latestEstimate.status,
        }
      : null;

    const contractDoc = latestContract
      ? {
          id: latestContract.id,
          number: latestContract.contractNumber,
          title: latestContract.title,
          total: latestContract.total,
          status: latestContract.status,
          startDate: latestContract.startDate?.toISOString() ?? null,
          completionDate: latestContract.completionDate?.toISOString() ?? null,
        }
      : null;

    const invoiceDocs = invoices.map((inv) => ({
      id: inv.id,
      number: inv.invoiceNumber,
      title: inv.title,
      total: inv.total,
      amountPaid: (inv as any).amountPaid ?? 0,
      status: inv.status,
      dueDate: inv.dueDate?.toISOString() ?? null,
      paidAt: (inv as any).paidAt?.toISOString() ?? null,
    }));

    const status = {
      estimateAccepted: latestEstimate?.status === 'accepted',
      estimateAcceptedAt: latestEstimate?.respondedAt?.toISOString() ?? null,
      depositPaid: !!depositInvoice,
      depositPaidAt: (depositInvoice as any)?.paidAt?.toISOString() ?? null,
      permitsWaiting:
        latestContract?.status === 'active' || latestContract?.status === 'completed',
      contractSignedAt:
        latestContract?.signedAt?.toISOString() ??
        latestContract?.createdAt?.toISOString() ??
        null,
      dayToStart: latestContract?.startDate
        ? new Date() >= new Date(latestContract.startDate)
        : false,
      startDate: latestContract?.startDate?.toISOString() ?? null,
      phases: contractPhases.map((phase: any) => ({
        name: phase.name,
        completed: phase.status === 'completed',
        paymentDue: 0,
        paymentPaid: 0,
      })),
      finalWalkthroughScheduled: latestContract?.status === 'completed',
      completionDate: latestContract?.completionDate?.toISOString() ?? null,
      finalPaymentPaid: invoices.some(
        (inv) => inv.status === 'paid' && inv.title?.toLowerCase().includes('final')
      ),
    };

    res.json({
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      clientId: client.id,
      status,
      documents: {
        estimate: estimateDoc,
        contract: contractDoc,
        invoices: invoiceDocs,
      },
    });
  } catch (error) {
    console.error('[public/track]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/public/track/estimate/:id?clientId=
router.get('/track/estimate/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const clientId = req.query.clientId as string;

  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  try {
    const estimate = await prisma.estimate.findFirst({
      where: { id, clientId },
      include: {
        client: { select: { name: true, email: true, phone: true, address: true } },
      },
    });

    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    let depositInvoice: { id: string; clientId: string; invoiceNumber: string; status: string } | null = null;

    if (estimate.total < AUTO_DEPOSIT_THRESHOLD && estimate.status === 'accepted') {
      const marker = `AUTO_DEPOSIT_ESTIMATE_ID:${estimate.id}`;
      const existingDepositInvoice = await prisma.invoice.findFirst({
        where: {
          clientId: estimate.clientId,
          notes: { contains: marker },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingDepositInvoice) {
        depositInvoice = {
          id: existingDepositInvoice.id,
          clientId: existingDepositInvoice.clientId,
          invoiceNumber: existingDepositInvoice.invoiceNumber,
          status: existingDepositInvoice.status,
        };
      }
    }

    res.json({ ...estimate, items: parseItems(estimate.items), depositInvoice });
  } catch (error) {
    console.error('[public/track/estimate]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/public/track/estimate/:id — client accepts or declines
router.post('/track/estimate/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { clientId, action } = req.body;

  if (!clientId || !['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const estimate = await prisma.estimate.findFirst({ where: { id, clientId } });
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const updated = await prisma.estimate.update({
      where: { id },
      data: {
        status: action === 'accept' ? 'accepted' : 'rejected',
        respondedAt: new Date(),
      },
    });

    if (action === 'accept') {
      const requiresContract = estimate.total >= AUTO_DEPOSIT_THRESHOLD;

      if (requiresContract) {
        return res.json({
          estimate: updated,
          requiresContract: true,
          message: 'Estimate accepted. This project now moves to a contract with deposit, phase, and final payment milestones.',
        });
      }

      const marker = `AUTO_DEPOSIT_ESTIMATE_ID:${estimate.id}`;
      const existingDepositInvoice = await prisma.invoice.findFirst({
        where: {
          clientId: estimate.clientId,
          notes: { contains: marker },
        },
      });

      if (existingDepositInvoice) {
        return res.json({
          estimate: updated,
          requiresContract: false,
          depositInvoice: {
            id: existingDepositInvoice.id,
            clientId: existingDepositInvoice.clientId,
            invoiceNumber: existingDepositInvoice.invoiceNumber,
          },
          message: 'Estimate accepted. Your deposit invoice is ready.',
        });
      }

      const client = await prisma.client.findUnique({ where: { id: estimate.clientId } });

      if (!client) {
        return res.status(404).json({ error: 'Client not found for accepted estimate' });
      }

      const invoiceNumber = await generateInvoiceNumber();
      const depositAmount = calculateAutoDepositAmount(estimate.total);
      const invoiceTitle = `Project Deposit - ${estimate.title}`;

      const depositInvoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          clientId: estimate.clientId,
          userId: estimate.userId,
          title: invoiceTitle,
          description: `Deposit generated automatically after estimate ${estimate.estimateNumber} was accepted (10% with a $50 minimum).`,
          items: JSON.stringify([
            {
              id: `deposit-${estimate.id}`,
              description: `Required deposit for accepted estimate ${estimate.estimateNumber} (10% with a $50 minimum)` ,
              quantity: 1,
              unitPrice: depositAmount,
            },
          ]),
          subtotal: depositAmount,
          tax: 0,
          total: depositAmount,
          status: 'draft',
          notes: `${marker}\nAuto-generated deposit invoice after estimate acceptance.`,
        },
      });

      const viewLink = generateInvoiceLink(depositInvoice.id, depositInvoice.clientId);
      const emailHtml = generateInvoiceEmail(
        client.name,
        depositInvoice.invoiceNumber,
        depositInvoice.total,
        depositInvoice.dueDate,
        viewLink
      );

      const emailResult = await sendEmail({
        to: client.email,
        subject: `Deposit Invoice ${depositInvoice.invoiceNumber} from RnR Electrical`,
        html: emailHtml,
      });

      if (emailResult.success) {
        await prisma.invoice.update({
          where: { id: depositInvoice.id },
          data: { status: 'sent', sentAt: new Date() },
        });

        await prisma.emailLog.create({
          data: {
            invoiceId: depositInvoice.id,
            recipient: client.email,
            subject: `Deposit Invoice ${depositInvoice.invoiceNumber} from RnR Electrical`,
            body: emailHtml,
            status: 'sent',
          },
        });
      }

      return res.json({
        estimate: updated,
        requiresContract: false,
        depositInvoice: {
          id: depositInvoice.id,
          clientId: depositInvoice.clientId,
          invoiceNumber: depositInvoice.invoiceNumber,
        },
        message: emailResult.success
          ? 'Estimate accepted. We sent your deposit invoice.'
          : 'Estimate accepted. Your deposit invoice was created but email delivery failed.',
      });
    }

    res.json({ estimate: updated });
  } catch (error) {
    console.error('[public/track/estimate POST]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/public/track/invoice/:id?clientId=
router.get('/track/invoice/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const clientId = req.query.clientId as string;

  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, clientId },
      include: {
        client: { select: { name: true, email: true, phone: true, address: true } },
        payments: true,
      },
    });

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    res.json({ ...invoice, items: parseItems(invoice.items) });
  } catch (error) {
    console.error('[public/track/invoice]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/public/track/invoice/:id/checkout
router.post('/track/invoice/:id/checkout', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { clientId, paymentMethod } = req.body as {
    clientId?: string;
    paymentMethod?: 'ach' | 'card';
  };

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required' });
  }

  if (paymentMethod !== 'ach' && paymentMethod !== 'card') {
    return res.status(400).json({ error: 'paymentMethod must be ach or card' });
  }

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, clientId },
      include: {
        client: { select: { id: true, name: true, email: true } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const balanceDue = Number((invoice.total - invoice.amountPaid).toFixed(2));

    if (balanceDue <= 0 || invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already fully paid' });
    }

    const stripe = getStripe();
    const metadata = {
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      invoiceNumber: invoice.invoiceNumber,
      paymentMethod,
    };

    const customerEmail = isValidEmail(invoice.client.email) ? invoice.client.email : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      payment_method_types: paymentMethod === 'ach' ? ['us_bank_account'] : ['card'],
      billing_address_collection: 'auto',
      success_url: buildInvoiceTrackUrl(invoice.id, invoice.clientId, 'success'),
      cancel_url: buildInvoiceTrackUrl(invoice.id, invoice.clientId, 'cancelled'),
      metadata,
      payment_intent_data: {
        metadata,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: toStripeAmount(balanceDue),
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
              description: invoice.title,
            },
          },
        },
      ],
      ...(paymentMethod === 'ach'
        ? {
            payment_method_options: {
              us_bank_account: {
                verification_method: 'automatic',
              },
            },
          }
        : {}),
    });

    if (!session.url) {
      return res.status(500).json({ error: 'Stripe did not return a checkout URL' });
    }

    res.json({ url: session.url, id: session.id });
  } catch (error) {
    console.error('[public/track/invoice checkout]', error);

    if (error instanceof Error && error.message.includes('STRIPE_SECRET_KEY is not configured')) {
      return res.status(503).json({ error: 'Stripe checkout is not configured on the backend. Set STRIPE_SECRET_KEY and restart the API.' });
    }

    res.status(500).json({ error: 'Unable to start checkout' });
  }
});

// ─── Public Appointment Booking ──────────────────────────────────────────────

// GET /api/public/slots — available future slots for client self-booking
router.get('/slots', async (req: Request, res: Response) => {
  try {
    const { type } = req.query as { type?: string };
    const slots = await prisma.appointmentSlot.findMany({
      where: {
        isAvailable: true,
        startTime: { gte: new Date() },
        ...(type && type !== 'any' ? { type: { in: [type, 'any'] } } : {}),
      },
      orderBy: { startTime: 'asc' },
    });
    res.json(slots);
  } catch (error) {
    console.error('[public/slots]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/public/book — client books an available slot
router.post('/book', async (req: Request, res: Response) => {
  const { slotId, contactName, contactEmail, contactPhone, address, type, notes } = req.body;

  if (!slotId || !contactName || !contactEmail || !contactPhone) {
    return res.status(400).json({ error: 'slotId, contactName, contactEmail, and contactPhone are required' });
  }

  try {
    // Verify slot is still available
    const slot = await prisma.appointmentSlot.findUnique({ where: { id: slotId } });
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (!slot.isAvailable) return res.status(409).json({ error: 'This slot is no longer available' });

    const appointment = await prisma.appointment.create({
      data: {
        type: type ? type : slot.type === 'any' ? 'estimate' : slot.type,
        startTime: slot.startTime,
        endTime: slot.endTime,
        slotId: slot.id,
        contactName,
        contactEmail,
        contactPhone,
        address: address || null,
        notes: notes || null,
        status: 'scheduled',
      },
    });

    await prisma.appointmentSlot.update({
      where: { id: slotId },
      data: { isAvailable: false },
    });

    const syncResult = await createGoogleCalendarEventForAppointment({
      appointmentId: appointment.id,
      type: appointment.type,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      contactName: appointment.contactName,
      contactEmail: appointment.contactEmail,
      contactPhone: appointment.contactPhone,
      address: appointment.address,
      notes: appointment.notes,
    });

    let updatedAppointment = appointment;

    if (syncResult.status === 'synced') {
      updatedAppointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleEventId: syncResult.eventId ?? null,
          googleSyncStatus: 'synced',
          googleSyncError: null,
          googleSyncedAt: new Date(),
        },
      });
    } else if (syncResult.status === 'failed') {
      updatedAppointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleSyncStatus: 'failed',
          googleSyncError: syncResult.error?.slice(0, 1000) ?? 'Unknown error',
          googleSyncedAt: null,
        },
      });
      console.error('[public/book][google-sync]', syncResult.error);
    } else {
      updatedAppointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleSyncStatus: 'skipped',
          googleSyncError: syncResult.error?.slice(0, 1000) ?? 'Sync skipped',
          googleSyncedAt: null,
        },
      });
      if (isGoogleCalendarSyncEnabled()) {
        console.warn('[public/book][google-sync] skipped despite enabled config', syncResult.error);
      }
    }

    res.status(201).json({
      ...updatedAppointment,
      googleCalendarSync: syncResult,
    });
  } catch (error) {
    console.error('[public/book]', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

export default router;
