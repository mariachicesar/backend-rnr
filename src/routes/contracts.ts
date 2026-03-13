import { Router, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';

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
    res.status(201).json(parseContract(contract));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create contract' });
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
