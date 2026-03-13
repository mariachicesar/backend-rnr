import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const appointmentInclude = {
  client: true,
  user: { select: { id: true, name: true, email: true } },
  slot: true,
} as const;

// GET /api/appointments — list all appointments
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, type, from, to } = req.query as Record<string, string>;

    const appointments = await prisma.appointment.findMany({
      where: {
        ...(status && { status }),
        ...(type && { type }),
        ...(from || to
          ? {
              startTime: {
                ...(from && { gte: new Date(from) }),
                ...(to && { lte: new Date(to) }),
              },
            }
          : {}),
      },
      orderBy: { startTime: 'asc' },
      include: appointmentInclude,
    });

    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/appointments/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: appointmentInclude,
    });
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// POST /api/appointments — admin creates an appointment directly (no slot required)
router.post('/', async (req: AuthRequest, res: Response) => {
  const {
    type,
    startTime,
    endTime,
    clientId,
    contactName,
    contactEmail,
    contactPhone,
    address,
    userId,
    slotId,
    notes,
    adminNotes,
  } = req.body;

  if (!type || !startTime || !endTime) {
    return res.status(400).json({ error: 'type, startTime, and endTime are required' });
  }

  if (!clientId && !contactName) {
    return res.status(400).json({ error: 'Either clientId or contactName is required' });
  }

  try {
    const appointment = await prisma.appointment.create({
      data: {
        type,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        clientId: clientId || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        address: address || null,
        userId: userId || null,
        slotId: slotId || null,
        notes: notes || null,
        adminNotes: adminNotes || null,
      },
      include: appointmentInclude,
    });

    // If linked to a slot, mark it unavailable
    if (slotId) {
      await prisma.appointmentSlot.update({
        where: { id: slotId },
        data: { isAvailable: false },
      });
    }

    res.status(201).json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// PUT /api/appointments/:id — update appointment
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const {
    type,
    status,
    startTime,
    endTime,
    clientId,
    contactName,
    contactEmail,
    contactPhone,
    address,
    userId,
    notes,
    adminNotes,
  } = req.body;

  try {
    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        ...(type !== undefined && { type }),
        ...(status !== undefined && { status }),
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime && { endTime: new Date(endTime) }),
        ...(clientId !== undefined && { clientId: clientId || null }),
        ...(contactName !== undefined && { contactName }),
        ...(contactEmail !== undefined && { contactEmail }),
        ...(contactPhone !== undefined && { contactPhone }),
        ...(address !== undefined && { address }),
        ...(userId !== undefined && { userId: userId || null }),
        ...(notes !== undefined && { notes }),
        ...(adminNotes !== undefined && { adminNotes }),
      },
      include: appointmentInclude,
    });

    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const appt = await prisma.appointment.findUnique({ where: { id: req.params.id } });

    await prisma.appointment.delete({ where: { id: req.params.id } });

    // Free the slot back up if one was linked
    if (appt?.slotId) {
      await prisma.appointmentSlot.update({
        where: { id: appt.slotId },
        data: { isAvailable: true },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

export default router;
