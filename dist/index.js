"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("express-async-errors");
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
dotenv_1.default.config();
const auth_1 = require("./middleware/auth");
// Routes
const auth_2 = __importDefault(require("./routes/auth"));
const public_1 = __importDefault(require("./routes/public"));
const clients_1 = __importDefault(require("./routes/clients"));
const estimates_1 = __importDefault(require("./routes/estimates"));
const contracts_1 = __importDefault(require("./routes/contracts"));
const invoices_1 = __importDefault(require("./routes/invoices"));
const payments_1 = __importDefault(require("./routes/payments"));
const projects_1 = __importDefault(require("./routes/projects"));
const appointments_1 = __importDefault(require("./routes/appointments"));
const slots_1 = __importDefault(require("./routes/slots"));
const stripe_1 = __importDefault(require("./routes/stripe"));
const aiEstimate_1 = __importDefault(require("./routes/aiEstimate"));
const emailEvents_1 = __importDefault(require("./routes/emailEvents"));
const prospectAgent_1 = __importDefault(require("./routes/prospectAgent"));
const prospects_1 = __importDefault(require("./routes/prospects"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use('/api/stripe/webhook', express_1.default.raw({ type: 'application/json' }));
app.use(express_1.default.json());
app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
    });
    next();
});
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
// Public routes (no auth required)
app.use('/api/auth', auth_2.default);
app.use('/api/public', public_1.default);
app.use('/api/stripe', stripe_1.default);
// Protected routes (require authentication)
app.use('/api/clients', auth_1.authMiddleware, auth_1.adminMiddleware, clients_1.default);
app.use('/api/estimates', auth_1.authMiddleware, auth_1.adminMiddleware, estimates_1.default);
app.use('/api/contracts', auth_1.authMiddleware, auth_1.adminMiddleware, contracts_1.default);
app.use('/api/invoices', auth_1.authMiddleware, auth_1.adminMiddleware, invoices_1.default);
app.use('/api/payments', auth_1.authMiddleware, auth_1.adminMiddleware, payments_1.default);
app.use('/api/projects', auth_1.authMiddleware, auth_1.adminMiddleware, projects_1.default);
app.use('/api/appointments', auth_1.authMiddleware, auth_1.adminMiddleware, appointments_1.default);
app.use('/api/slots', auth_1.authMiddleware, auth_1.adminMiddleware, slots_1.default);
app.use('/api/ai/estimate', auth_1.authMiddleware, auth_1.adminMiddleware, aiEstimate_1.default);
app.use('/api/email-events', auth_1.authMiddleware, auth_1.adminMiddleware, emailEvents_1.default);
// Agent route registered BEFORE /api/prospects so any sub-paths don't collide with :id
app.use('/api/prospects-agent', auth_1.authMiddleware, auth_1.adminMiddleware, prospectAgent_1.default);
app.use('/api/prospects', auth_1.authMiddleware, auth_1.adminMiddleware, prospects_1.default);
// Error handling
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${process.env.DATABASE_URL?.split('/').pop()}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map