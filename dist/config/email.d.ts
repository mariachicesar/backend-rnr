interface EmailPayload {
    to: string;
    subject: string;
    html: string;
}
export declare function sendEmail(payload: EmailPayload): Promise<{
    success: boolean;
    messageId: any;
    error?: undefined;
} | {
    success: boolean;
    error: string;
    messageId?: undefined;
}>;
export declare function generateEstimateLink(estimateId: string, clientId: string): string;
export declare function generateContractLink(contractId: string, clientId: string): string;
export declare function generateInvoiceLink(invoiceId: string, clientId: string): string;
export declare function generateEstimateEmail(clientName: string, estimateNumber: string, total: number, viewLink: string): string;
export declare function generateInvoiceEmail(clientName: string, invoiceNumber: string, total: number, dueDate: Date | null | undefined, viewLink: string): string;
export {};
//# sourceMappingURL=email.d.ts.map