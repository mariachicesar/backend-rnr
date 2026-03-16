import { google } from 'googleapis';

const CALENDAR_SCOPE = ['https://www.googleapis.com/auth/calendar.events'];
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGoogleErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybeAny = error as any;
    const status = maybeAny?.response?.status;
    const apiError = maybeAny?.response?.data?.error;
    const apiMessage =
      apiError?.message ||
      apiError?.error_description ||
      maybeAny?.response?.data?.error_description ||
      maybeAny?.message;

    if (status && apiMessage) return `HTTP ${status}: ${apiMessage}`;
    if (apiMessage) return String(apiMessage);
  }

  return error instanceof Error ? error.message : String(error);
}

function getPrivateKey() {
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!key) return null;
  return key.replace(/\\n/g, '\n');
}

function getCalendarAuth() {
  // Explicit override: when enabled, always use ADC first.
  if (process.env.GOOGLE_USE_ADC === 'true') {
    return new google.auth.GoogleAuth({ scopes: CALENDAR_SCOPE });
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = getPrivateKey();

  // Preferred legacy mode when service account key usage is allowed.
  if (clientEmail && privateKey) {
    return new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: CALENDAR_SCOPE,
      subject: process.env.GOOGLE_CALENDAR_IMPERSONATE_USER || undefined,
    });
  }

  // Keyless mode for orgs that block service account key creation.
  const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const oauthRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    const oauth2Client = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
    oauth2Client.setCredentials({ refresh_token: oauthRefreshToken });
    return oauth2Client;
  }

  return null;
}

export function isGoogleCalendarSyncEnabled() {
  return Boolean(process.env.GOOGLE_CALENDAR_ID && getCalendarAuth());
}

function appointmentSummary(type: string) {
  return type === 'work' ? 'RnR Electrical - Work Visit' : 'RnR Electrical - Estimate Visit';
}

function appointmentDescription(payload: AppointmentCalendarPayload) {
  const lines = [
    `Appointment ID: ${payload.appointmentId}`,
    payload.contactName ? `Name: ${payload.contactName}` : null,
    payload.contactEmail ? `Email: ${payload.contactEmail}` : null,
    payload.contactPhone ? `Phone: ${payload.contactPhone}` : null,
    payload.address ? `Address: ${payload.address}` : null,
    payload.notes ? `Notes: ${payload.notes}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

export async function createGoogleCalendarEventForAppointment(
  payload: AppointmentCalendarPayload
): Promise<CalendarSyncResult> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const auth = getCalendarAuth();

  if (!calendarId || !auth) {
    return {
      status: 'skipped',
      error:
        'Google Calendar not configured. Set GOOGLE_CALENDAR_ID plus one auth mode: (1) GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY, (2) GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN, or (3) GOOGLE_USE_ADC=true after gcloud auth application-default login.',
    };
  }

  const calendar = google.calendar({ version: 'v3', auth });
  const businessTimezone = process.env.BUSINESS_TIMEZONE || 'America/Los_Angeles';
  const attempts = Number(process.env.GOOGLE_SYNC_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Number(process.env.GOOGLE_SYNC_BASE_DELAY_MS || DEFAULT_BASE_DELAY_MS);

  let lastError = 'Google Calendar sync failed';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: appointmentSummary(payload.type),
          description: appointmentDescription(payload),
          location: payload.address ?? undefined,
          start: {
            dateTime: payload.startTime.toISOString(),
            timeZone: businessTimezone,
          },
          end: {
            dateTime: payload.endTime.toISOString(),
            timeZone: businessTimezone,
          },
          attendees: payload.contactEmail
            ? [
                {
                  email: payload.contactEmail,
                  displayName: payload.contactName ?? undefined,
                },
              ]
            : undefined,
          extendedProperties: {
            private: {
              appointmentId: payload.appointmentId,
              source: 'rnr-booking',
            },
          },
        },
        sendUpdates: process.env.GOOGLE_SEND_UPDATES === 'all' ? 'all' : 'none',
      });

      return {
        status: 'synced',
        eventId: response.data.id ?? undefined,
        htmlLink: response.data.htmlLink ?? undefined,
      };
    } catch (error: unknown) {
      lastError = getGoogleErrorMessage(error);
      if (attempt < attempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await wait(delay);
      }
    }
  }

  return { status: 'failed', error: lastError };
}
