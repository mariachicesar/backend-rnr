"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
// GET /api/slots — list all slots (admin: all; public endpoint returns only available future slots)
router.get('/', async (req, res) => {
    try {
        const slots = await database_1.default.appointmentSlot.findMany({
            orderBy: { startTime: 'asc' },
            include: { appointment: true },
        });
        res.json(slots);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch slots' });
    }
});
// GET /api/slots/:id
router.get('/:id', async (req, res) => {
    try {
        const slot = await database_1.default.appointmentSlot.findUnique({
            where: { id: req.params.id },
            include: { appointment: true },
        });
        if (!slot)
            return res.status(404).json({ error: 'Slot not found' });
        res.json(slot);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch slot' });
    }
});
// POST /api/slots — create one or many slots
router.post('/', async (req, res) => {
    const { slots: batch, startTime, endTime, type } = req.body;
    try {
        // Accept either a single slot or an array for bulk creation
        if (Array.isArray(batch) && batch.length > 0) {
            const created = await database_1.default.$transaction(batch.map((s) => database_1.default.appointmentSlot.create({
                data: {
                    startTime: new Date(s.startTime),
                    endTime: new Date(s.endTime),
                    type: s.type ?? 'any',
                },
            })));
            return res.status(201).json(created);
        }
        if (!startTime || !endTime) {
            return res.status(400).json({ error: 'startTime and endTime are required' });
        }
        const slot = await database_1.default.appointmentSlot.create({
            data: {
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                type: type ?? 'any',
            },
        });
        res.status(201).json(slot);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create slot' });
    }
});
// PUT /api/slots/:id — update a slot (e.g., change time or type)
router.put('/:id', async (req, res) => {
    const { startTime, endTime, type, isAvailable } = req.body;
    try {
        const slot = await database_1.default.appointmentSlot.update({
            where: { id: req.params.id },
            data: {
                ...(startTime && { startTime: new Date(startTime) }),
                ...(endTime && { endTime: new Date(endTime) }),
                ...(type !== undefined && { type }),
                ...(isAvailable !== undefined && { isAvailable }),
            },
        });
        res.json(slot);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update slot' });
    }
});
// DELETE /api/slots/:id
router.delete('/:id', async (req, res) => {
    try {
        await database_1.default.appointmentSlot.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete slot' });
    }
});
exports.default = router;
//# sourceMappingURL=slots.js.map