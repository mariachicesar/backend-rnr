import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/clients - List all clients
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        estimates: true,
        contracts: true,
        invoices: true,
        payments: true,
      },
    });

    res.json(clients);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/:id - Get a single client
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        estimates: true,
        contracts: true,
        invoices: true,
        payments: true,
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// POST /api/clients - Create a new client
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, email, phone, address, city, state, zipCode, notes } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    const client = await prisma.client.create({
      data: {
        name,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        notes,
      },
    });

    res.status(201).json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id - Update a client
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { name, email, phone, address, city, state, zipCode, notes } = req.body;

  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        name,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        notes,
      },
    });

    res.json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id - Delete a client
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.client.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
