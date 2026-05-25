"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
// GET /api/clients - List all clients
router.get('/', async (req, res) => {
    try {
        const clients = await database_1.default.client.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                estimates: true,
                contracts: true,
                invoices: true,
                payments: true,
            },
        });
        res.json(clients);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});
// GET /api/clients/:id - Get a single client
router.get('/:id', async (req, res) => {
    try {
        const client = await database_1.default.client.findUnique({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch client' });
    }
});
// POST /api/clients - Create a new client
router.post('/', async (req, res) => {
    const { name, email, phone, address, city, state, zipCode, notes } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }
    try {
        const client = await database_1.default.client.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create client' });
    }
});
// PUT /api/clients/:id - Update a client
router.put('/:id', async (req, res) => {
    const { name, email, phone, address, city, state, zipCode, notes } = req.body;
    try {
        const client = await database_1.default.client.update({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update client' });
    }
});
// DELETE /api/clients/:id - Delete a client
router.delete('/:id', async (req, res) => {
    try {
        await database_1.default.client.delete({
            where: { id: req.params.id },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete client' });
    }
});
exports.default = router;
//# sourceMappingURL=clients.js.map