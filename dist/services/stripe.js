"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripe = getStripe;
exports.getStripeWebhookSecret = getStripeWebhookSecret;
exports.getAppBaseUrl = getAppBaseUrl;
exports.buildInvoiceTrackUrl = buildInvoiceTrackUrl;
exports.toStripeAmount = toStripeAmount;
exports.fromStripeAmount = fromStripeAmount;
exports.normalizePaymentMethod = normalizePaymentMethod;
const stripe_1 = __importDefault(require("stripe"));
let stripeClient = null;
function getStripe() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    if (!stripeClient) {
        stripeClient = new stripe_1.default(secretKey);
    }
    return stripeClient;
}
function getStripeWebhookSecret() {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return webhookSecret;
}
function getAppBaseUrl() {
    return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}
function buildInvoiceTrackUrl(invoiceId, clientId, checkout) {
    const url = new URL('/track', getAppBaseUrl());
    url.searchParams.set('invoiceId', invoiceId);
    url.searchParams.set('clientId', clientId);
    if (checkout) {
        url.searchParams.set('checkout', checkout);
    }
    return url.toString();
}
function toStripeAmount(amount) {
    return Math.max(0, Math.round(amount * 100));
}
function fromStripeAmount(amount) {
    return Number(((amount ?? 0) / 100).toFixed(2));
}
function normalizePaymentMethod(method) {
    if (method === 'ach' || method === 'us_bank_account') {
        return 'bank_transfer';
    }
    if (method === 'card') {
        return 'credit_card';
    }
    return method;
}
//# sourceMappingURL=stripe.js.map