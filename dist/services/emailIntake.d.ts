export type EmailEventCategory = 'lead' | 'inspector' | 'other';
export type EmailEventStatus = 'needs_review' | 'approved' | 'resolved';
export interface LeadPayload {
    name?: string;
    email?: string;
    phone?: string;
    zipCode?: string;
    workType?: string;
    description?: string;
}
export interface EmailEventRecord {
    id: string;
    externalId?: string;
    category: EmailEventCategory;
    status: EmailEventStatus;
    source: 'gmail';
    subject: string;
    sender?: string;
    address?: string;
    receivedAt: string;
    summary?: string;
    bodyPreview?: string;
    lead?: LeadPayload;
    matchedClientId?: string;
    matchedClientName?: string;
    approvedAt?: string;
    createdAt: string;
    updatedAt: string;
}
export declare function listEmailEvents(filters: {
    status?: string;
    category?: string;
    limit?: number;
    clientId?: string;
}): Promise<EmailEventRecord[]>;
export declare function updateEmailEvent(id: string, patch: Partial<Pick<EmailEventRecord, 'status' | 'summary' | 'matchedClientId'>>): Promise<EmailEventRecord | null>;
export declare function listClientApprovedInspectorUpdates(clientId: string): Promise<{
    id: string;
    category: EmailEventCategory;
    summary: string;
    address: string | undefined;
    receivedAt: string;
}[]>;
export declare function syncInboxRulesFirst(params: {
    sinceDays?: number;
    maxResults?: number;
}): Promise<{
    imported: number;
    skipped: number;
    message: string;
}>;
//# sourceMappingURL=emailIntake.d.ts.map