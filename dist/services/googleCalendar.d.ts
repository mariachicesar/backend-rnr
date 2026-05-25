type SyncStatus = 'synced' | 'failed' | 'skipped';
export interface AppointmentCalendarPayload {
    appointmentId: string;
    type: string;
    startTime: Date;
    endTime: Date;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
    notes?: string | null;
}
export interface CalendarSyncResult {
    status: SyncStatus;
    eventId?: string;
    htmlLink?: string;
    error?: string;
}
export declare function isGoogleCalendarSyncEnabled(): boolean;
export declare function createGoogleCalendarEventForAppointment(payload: AppointmentCalendarPayload): Promise<CalendarSyncResult>;
export {};
//# sourceMappingURL=googleCalendar.d.ts.map