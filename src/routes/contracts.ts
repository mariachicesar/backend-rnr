import { Router, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { inferBillingKind, mergeBillingMarkers } from '../services/billing';

const router = Router();

function parseContract(con: any) {
  return {
    ...con,
    items: JSON.parse(con.items || '[]'),
    phases: JSON.parse(con.phases || '[]'),
    paymentSchedule: JSON.parse(con.paymentSchedule || '[]'),
    clientName: con.client?.name,
    clientEmail: con.client?.email,
    clientPhone: con.client?.phone,
    clientAddress: con.client?.address,
    clientCity: con.client?.city,
    clientState: con.client?.state,
    clientZipCode: con.client?.zipCode,
    number: con.contractNumber,
  };
}

async function generateContractNumber() {
  const latestContract = await prisma.contract.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  const number = latestContract ? parseInt(latestContract.contractNumber.split('-')[1]) + 1 : 1501;
  return `CON-${number}`;
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

function describeMilestone(contract: any, milestone: any, phases: any[]) {
  if (milestone.dueOn === 'deposit') {
    return {
      kind: 'deposit',
      title: `Deposit - ${contract.title}`,
      description: milestone.description || `Upfront deposit for contract ${contract.contractNumber}`,
      dueDate: contract.startDate,
    };
  }

  if (milestone.dueOn === 'final') {
    return {
      kind: 'final',
      title: `Final Payment - ${contract.title}`,
      description: milestone.description || `Final payment for contract ${contract.contractNumber}`,
      dueDate: contract.completionDate,
    };
  }

  if (milestone.dueOn === 'phase_complete') {
    const phase = phases.find((entry: any) => entry.id === milestone.phaseId);
    return {
      kind: 'phase',
      title: `${phase?.name || 'Phase'} Payment - ${contract.title}`,
      description:
        milestone.description ||
        (phase
          ? `Payment due after completion of ${phase.name}`
          : `Progress payment for contract ${contract.contractNumber}`),
      dueDate: null,
    };
  }

  return {
    kind: 'custom',
    title: `${milestone.description || 'Scheduled Payment'} - ${contract.title}`,
    description: milestone.description || `Scheduled payment for contract ${contract.contractNumber}`,
    dueDate: milestone.dueDate ? new Date(milestone.dueDate) : null,
  };
}

async function generateMilestoneInvoicesForContract(contractId: string, userId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      client: true,
      invoices: true,
    },
  });

  if (!contract || contract.userId !== userId) {
    throw new Error('Contract not found');
  }

  const phases = JSON.parse(contract.phases || '[]');
  const schedule = JSON.parse(contract.paymentSchedule || '[]');

  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { contract, createdInvoices: [], skippedInvoices: [] };
  }

  const existingMilestoneIds = new Set(
    contract.invoices
      .map((invoice) => {
        const match = invoice.notes?.match(/BILLING_MILESTONE_ID:([^\r\n]+)/);
        return match ? match[1].trim() : null;
      })
      .filter(Boolean)
  );

  const createdInvoices: any[] = [];
  const skippedInvoices: any[] = [];

  let remainingAmount = roundMoney(contract.total);
  const lastIndex = schedule.length - 1;

  for (const [index, milestone] of schedule.entries()) {
    if (existingMilestoneIds.has(milestone.id)) {
      skippedInvoices.push({ milestoneId: milestone.id, description: milestone.description || milestone.dueOn, reason: 'already_exists' });
      continue;
    }

    const amount = index === lastIndex
      ? remainingAmount
      : roundMoney((contract.total * (milestone.percentage || 0)) / 100);

    remainingAmount = roundMoney(Math.max(remainingAmount - amount, 0));

    const milestoneMeta = describeMilestone(contract, milestone, phases);
    const invoiceNumber = await generateInvoiceNumber();
    const notes = mergeBillingMarkers('Auto-generated from contract payment schedule.', {
      KIND: milestoneMeta.kind,
      SOURCE_CONTRACT_ID: contract.id,
      MILESTONE_ID: milestone.id,
      PHASE_ID: milestone.phaseId || undefined,
    });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        contractId: contract.id,
        clientId: contract.clientId,
        userId: contract.userId,
        title: milestoneMeta.title,
        description: milestoneMeta.description,
        items: JSON.stringify([
          {
            id: `milestone-${contract.id}-${milestone.id}`,
            description: milestoneMeta.description,
            quantity: 1,
            unitPrice: amount,
          },
        ]),
        subtotal: amount,
        tax: 0,
        total: amount,
        dueDate: milestoneMeta.dueDate,
        status: 'draft',
        notes,
      },
      include: { client: true, payments: true },
    });

    createdInvoices.push(invoice);
  }

  return { contract, createdInvoices, skippedInvoices };
}

// GET /api/contracts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const contracts = await prisma.contract.findMany({
      where: { userId: req.user!.id },
      include: { client: true, estimate: true, invoices: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(contracts.map(parseContract));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// GET /api/contracts/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { client: true, estimate: true, invoices: true },
    });
    if (!contract || contract.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    res.json(parseContract(contract));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

// POST /api/contracts
router.post('/', async (req: AuthRequest, res: Response) => {
  const {
    estimateId, clientId, title, description,
    items, phases, paymentSchedule,
    subtotal, tax, total,
    startDate, completionDate, terms,
  } = req.body;

  if (!clientId || !title) {
    return res.status(400).json({ error: 'Client and title are required' });
  }

  try {
    const contractNumber = await generateContractNumber();
    const contract = await prisma.contract.create({
      data: {
        contractNumber,
        estimateId: estimateId || null,
        clientId,
        userId: req.user!.id,
        title,
        description,
        items: JSON.stringify(items || []),
        phases: JSON.stringify(phases || []),
        paymentSchedule: JSON.stringify(paymentSchedule || []),
        subtotal: subtotal || 0,
        tax: tax || 0,
        total: total || 0,
        startDate: startDate ? new Date(startDate) : null,
        completionDate: completionDate ? new Date(completionDate) : null,
        terms,
      },
      include: { client: true, estimate: true, invoices: true },
    });

    const generated = await generateMilestoneInvoicesForContract(contract.id, req.user!.id);
    const refreshed = await prisma.contract.findUnique({
      where: { id: contract.id },
      include: { client: true, estimate: true, invoices: true },
    });

    res.status(201).json({
      ...parseContract(refreshed || contract),
      generatedInvoices: generated.createdInvoices.map((invoice) => ({ id: invoice.id, number: invoice.invoiceNumber, title: invoice.title })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create contract' });
  }
});

router.post('/:id/generate-invoices', async (req: AuthRequest, res: Response) => {
  try {
    const generated = await generateMilestoneInvoicesForContract(req.params.id, req.user!.id);

    res.json({
      success: true,
      createdInvoices: generated.createdInvoices.map((invoice) => ({ id: invoice.id, number: invoice.invoiceNumber, title: invoice.title })),
      skippedInvoices: generated.skippedInvoices,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate milestone invoices' });
  }
});

// PUT /api/contracts/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const {
    title, description,
    items, phases, paymentSchedule,
    subtotal, tax, total,
    startDate, completionDate, status, terms, signedByClient,
  } = req.body;

  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract || contract.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const updated = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        items: JSON.stringify(items || []),
        phases: JSON.stringify(phases || []),
        paymentSchedule: JSON.stringify(paymentSchedule || []),
        subtotal,
        tax,
        total,
        startDate: startDate ? new Date(startDate) : null,
        completionDate: completionDate ? new Date(completionDate) : null,
        status,
        terms,
        signedByClient,
      },
      include: { client: true, estimate: true, invoices: true },
    });
    res.json(parseContract(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

// DELETE /api/contracts/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
    if (!contract || contract.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    await prisma.contract.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

export default router;
