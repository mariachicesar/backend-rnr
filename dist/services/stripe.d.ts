import Stripe from 'stripe';
export declare function getStripe(): Stripe;
export declare function getStripeWebhookSecret(): string;
export declare function getAppBaseUrl(): string;
export declare function buildInvoiceTrackUrl(invoiceId: string, clientId: string, checkout?: 'success' | 'cancelled'): string;
export declare function toStripeAmount(amount: number): number;
export declare function fromStripeAmount(amount: number | null | undefined): number;
export declare function normalizePaymentMethod(method: string): string;
//# sourceMappingURL=stripe.d.ts.map