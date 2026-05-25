"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_1 = require("../middleware/auth");
const database_1 = __importDefault(require("../config/database"));
const router = (0, express_1.Router)();
// Register
router.post('/register', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        const existingUser = await database_1.default.user.findUnique({
            where: { email },
        });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await database_1.default.user.create({
            data: {
                email,
                name,
                hashedPassword,
                role: 'user',
            },
        });
        const token = (0, auth_1.generateToken)(user.id, user.email || '', user.role);
        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to register' });
    }
});
// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        const user = await database_1.default.user.findUnique({
            where: { email },
        });
        if (!user || !user.hashedPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const passwordMatch = await bcryptjs_1.default.compare(password, user.hashedPassword);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = (0, auth_1.generateToken)(user.id, user.email || '', user.role);
        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to login' });
    }
});
// Get current user
router.get('/me', async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const currentUser = await database_1.default.user.findUnique({
            where: { id: user.id },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        });
        res.json(currentUser);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map