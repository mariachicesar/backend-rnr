import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

export function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return webhookSecret;
}

export function getAppBaseUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function buildInvoiceTrackUrl(invoiceId: string, clientId: string, checkout?: 'success' | 'cancelled') {
  const url = new URL('/track', getAppBaseUrl());

  url.searchParams.set('invoiceId', invoiceId);
  url.searchParams.set('clientId', clientId);

  if (checkout) {
    url.searchParams.set('checkout', checkout);
  }

  return url.toString();
}

export function toStripeAmount(amount: number) {
  return Math.max(0, Math.round(amount * 100));
}

export function fromStripeAmount(amount: number | null | undefined) {
  return Number(((amount ?? 0) / 100).toFixed(2));
}

export function normalizePaymentMethod(method: string) {
  if (method === 'ach' || method === 'us_bank_account') {
    return 'bank_transfer';
  }

  if (method === 'card') {
    return 'credit_card';
  }

  return method;
}