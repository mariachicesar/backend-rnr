export type BillingKind = 'deposit' | 'phase' | 'final' | 'balance' | 'custom';
export declare function parseBillingNotes(notes: string | null | undefined): {
    markers: Record<string, string>;
    plainText: string;
};
export declare function mergeBillingMarkers(notes: string | null | undefined, markerValues: Record<string, string | number | boolean | null | undefined>): string;
export declare function inferBillingKind(invoice: {
    title?: string | null;
    notes?: string | null;
    contractId?: string | null;
}): BillingKind;
export declare function getInvoiceBillingContext(invoice: any): {
    kind: BillingKind;
    sourceEstimateId: string | null;
    sourceContractId: any;
    milestoneId: string | null;
    phaseId: string | null;
    appliesDepositCredit: boolean;
};
export declare function buildInvoiceSummary(invoice: any, relatedInvoices: any[]): {
    billingKind: BillingKind;
    sourceEstimateId: string | null;
    appliesDepositCredit: boolean;
    depositCredit: number;
    actualPaymentsTotal: number;
    totalPaid: number;
    balanceDue: number;
    originalTotal: any;
};
export declare function recalculateInvoiceAndLinkedCredits(invoiceId: string): Promise<{
    billingKind: BillingKind;
    sourceEstimateId: string | null;
    appliesDepositCredit: boolean;
    depositCredit: number;
    actualPaymentsTotal: number;
    totalPaid: number;
    balanceDue: number;
    originalTotal: any;
} | null>;
//# sourceMappingURL=billing.d.ts.map