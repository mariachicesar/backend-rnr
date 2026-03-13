import { Router, Request, Response } from 'express';
import prisma from '../config/database';

const router = Router();

function parseItems(raw: string | null | undefined) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// POST /api/public/track — client auth via last 4 phone digits + street address
router.post('/track', async (req: Request, res: Response) => {
  try {
    const { lastFourDigits, street } = req.body;

    if (!lastFourDigits || !street) {
      return res.status(400).json({ error: 'lastFourDigits and street are required' });
    }

    const client = await prisma.client.findFirst({
      where: {
        AND: [
          { phone: { endsWith: lastFourDigits } },
          { address: { contains: street, mode: 'insensitive' } },
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

    res.json({ ...estimate, items: parseItems(estimate.items) });
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

    res.json(updated);
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
        type: type || slot.type === 'any' ? (type || 'estimate') : slot.type,
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

    res.status(201).json(appointment);
  } catch (error) {
    console.error('[public/book]', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

export default router;
