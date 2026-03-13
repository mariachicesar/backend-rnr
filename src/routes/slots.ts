import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/slots — list all slots (admin: all; public endpoint returns only available future slots)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const slots = await prisma.appointmentSlot.findMany({
      orderBy: { startTime: 'asc' },
      include: { appointment: true },
    });
    res.json(slots);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

// GET /api/slots/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const slot = await prisma.appointmentSlot.findUnique({
      where: { id: req.params.id },
      include: { appointment: true },
    });
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    res.json(slot);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch slot' });
  }
});

// POST /api/slots — create one or many slots
router.post('/', async (req: AuthRequest, res: Response) => {
  const { slots: batch, startTime, endTime, type } = req.body;

  try {
    // Accept either a single slot or an array for bulk creation
    if (Array.isArray(batch) && batch.length > 0) {
      const created = await prisma.$transaction(
        batch.map((s: { startTime: string; endTime: string; type?: string }) =>
          prisma.appointmentSlot.create({
            data: {
              startTime: new Date(s.startTime),
              endTime: new Date(s.endTime),
              type: s.type ?? 'any',
            },
          })
        )
      );
      return res.status(201).json(created);
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime are required' });
    }

    const slot = await prisma.appointmentSlot.create({
      data: {
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        type: type ?? 'any',
      },
    });
    res.status(201).json(slot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create slot' });
  }
});

// PUT /api/slots/:id — update a slot (e.g., change time or type)
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { startTime, endTime, type, isAvailable } = req.body;
  try {
    const slot = await prisma.appointmentSlot.update({
      where: { id: req.params.id },
      data: {
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime && { endTime: new Date(endTime) }),
        ...(type !== undefined && { type }),
        ...(isAvailable !== undefined && { isAvailable }),
      },
    });
    res.json(slot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update slot' });
  }
});

// DELETE /api/slots/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.appointmentSlot.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
});

export default router;
