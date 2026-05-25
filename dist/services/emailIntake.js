"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEmailEvents = listEmailEvents;
exports.updateEmailEvent = updateEmailEvent;
exports.listClientApprovedInspectorUpdates = listClientApprovedInspectorUpdates;
exports.syncInboxRulesFirst = syncInboxRulesFirst;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const database_1 = __importDefault(require("../config/database"));
const googleapis_1 = require("googleapis");
const uuid_1 = require("uuid");
const STORE_PATH = path_1.default.resolve(process.cwd(), 'data', 'email-events.json');
function normalizeText(input) {
    return (input || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function normalizeAddress(input) {
    return normalizeText(input)
        .replace(/\bstreet\b/g, 'st')
        .replace(/\bavenue\b/g, 'ave')
        .replace(/\bboulevard\b/g, 'blvd')
        .replace(/\bdrive\b/g, 'dr')
        .replace(/\broad\b/g, 'rd')
        .replace(/\blane\b/g, 'ln')
        .replace(/\bplace\b/g, 'pl')
        .replace(/\bcourt\b/g, 'ct')
        .replace(/\bterrace\b/g, 'ter')
        .replace(/\bhighway\b/g, 'hwy')
        .replace(/\s+/g, ' ')
        .trim();
}
function decodeBase64Url(input) {
    return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
function collectTextPart(part) {
    if (!part)
        return '';
    const mime = part.mimeType || '';
    const bodyData = part.body?.data ? decodeBase64Url(part.body.data) : '';
    if (mime === 'text/plain' && bodyData.trim())
        return bodyData;
    const childText = (part.parts || []).map((p) => collectTextPart(p)).filter(Boolean).join('\n');
    if (childText.trim())
        return childText;
    if (mime === 'text/html' && bodyData.trim()) {
        return bodyData.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return '';
}
function pickHeader(headers, name) {
    return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;
}
function extractAddress(text) {
    const pattern = /\b\d{1,6}\s+[A-Za-z0-9'\.\-\s]{2,80}\s(?:Ave|Avenue|St|Street|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way|Hwy|Highway|Terrace|Ter)\b/i;
    const m = text.match(pattern);
    return m?.[0]?.trim();
}
function parseLeadPayload(body) {
    const find = (label) => {
        const r = new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, 'i');
        return body.match(r)?.[1]?.trim();
    };
    return {
        name: find('name'),
        email: find('email'),
        phone: find('phone'),
        zipCode: find('zip|zip code'),
        workType: find('type of work|service type|job type'),
        description: find('description|brief description|message'),
    };
}
function classifyEmail(subject) {
    const s = subject.toLowerCase();
    if (s.includes('new lead from website'))
        return 'lead';
    if (s.includes('meter spot') || s.includes('plans requested'))
        return 'inspector';
    return 'other';
}
function summarizeInspector(subject, body, address) {
    const s = subject.toLowerCase();
    const wr = subject.match(/\bwr\#?\s*([0-9]+)/i)?.[1];
    if (s.includes('meter spot')) {
        return `Meter spot received${address ? ` for ${address}` : ''}${wr ? ` (WR# ${wr})` : ''}. Next step: submit completed work photos and inspection request.`;
    }
    if (s.includes('plans requested')) {
        return `Plans requested by utility${address ? ` for ${address}` : ''}${wr ? ` (WR# ${wr})` : ''}. Include required PDF plan set before inspection can proceed.`;
    }
    const compact = body.replace(/\s+/g, ' ').trim();
    return compact.slice(0, 220) || 'Inspector update received.';
}
async function readStore() {
    try {
        const raw = await promises_1.default.readFile(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
async function writeStore(records) {
    await promises_1.default.mkdir(path_1.default.dirname(STORE_PATH), { recursive: true });
    await promises_1.default.writeFile(STORE_PATH, JSON.stringify(records, null, 2), 'utf8');
}
async function findClientByAddress(address) {
    if (!address)
        return null;
    const clients = await database_1.default.client.findMany({
        select: { id: true, name: true, address: true },
    });
    const target = normalizeAddress(address);
    if (!target)
        return null;
    for (const client of clients) {
        const cAddr = normalizeAddress(client.address);
        if (!cAddr)
            continue;
        if (cAddr.includes(target) || target.includes(cAddr)) {
            return { id: client.id, name: client.name };
        }
    }
    return null;
}
function buildGmailClient() {
    const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken)
        return null;
    const oauth = new googleapis_1.google.auth.OAuth2(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken });
    return googleapis_1.google.gmail({ version: 'v1', auth: oauth });
}
function getGmailUserId() {
    return process.env.GMAIL_USER_ID || process.env.GOOGLE_CALENDAR_ID || 'me';
}
async function listEmailEvents(filters) {
    const events = await readStore();
    const filtered = events.filter((evt) => {
        if (filters.status && evt.status !== filters.status)
            return false;
        if (filters.category && evt.category !== filters.category)
            return false;
        if (filters.clientId && evt.matchedClientId !== filters.clientId)
            return false;
        return true;
    });
    filtered.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    if (filters.limit && Number.isFinite(filters.limit)) {
        return filtered.slice(0, Math.max(1, filters.limit));
    }
    return filtered;
}
async function updateEmailEvent(id, patch) {
    const events = await readStore();
    const idx = events.findIndex((evt) => evt.id === id);
    if (idx === -1)
        return null;
    events[idx] = {
        ...events[idx],
        ...patch,
        approvedAt: patch.status === 'approved' ? new Date().toISOString() : events[idx].approvedAt,
        updatedAt: new Date().toISOString(),
    };
    await writeStore(events);
    return events[idx];
}
async function listClientApprovedInspectorUpdates(clientId) {
    const events = await readStore();
    let changed = false;
    // Backfill missing matchedClientId at read time so approved inspector updates
    // still appear for clients even if initial sync failed to match by address.
    for (const evt of events) {
        if (evt.category !== 'inspector' || evt.status !== 'approved')
            continue;
        if (evt.matchedClientId)
            continue;
        if (!evt.address)
            continue;
        const matchedClient = await findClientByAddress(evt.address);
        if (matchedClient) {
            evt.matchedClientId = matchedClient.id;
            evt.matchedClientName = matchedClient.name;
            evt.updatedAt = new Date().toISOString();
            changed = true;
        }
    }
    if (changed) {
        await writeStore(events);
    }
    return events
        .filter((evt) => evt.category === 'inspector' && evt.status === 'approved' && evt.matchedClientId === clientId)
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        .map((evt) => ({
        id: evt.id,
        category: evt.category,
        summary: evt.summary || summarizeInspector(evt.subject, evt.bodyPreview || '', evt.address),
        address: evt.address,
        receivedAt: evt.receivedAt,
    }));
}
async function syncInboxRulesFirst(params) {
    const gmail = buildGmailClient();
    if (!gmail) {
        return {
            imported: 0,
            skipped: 0,
            message: 'Missing Gmail OAuth env vars. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN (or GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).',
        };
    }
    const sinceDays = Math.max(1, params.sinceDays ?? 2);
    // Gmail newer_than is strict by elapsed hours; add a one-day grace so boundary-day
    // emails are included in practical "last N days" scans from the UI.
    const querySinceDays = sinceDays + 1;
    const maxResults = Math.max(1, Math.min(params.maxResults ?? 1000, 2000));
    const query = `newer_than:${querySinceDays}d -in:spam -in:trash`;
    const collectedIds = [];
    let nextPageToken;
    // Pull multiple pages so we don't miss relevant emails in busy inboxes.
    do {
        const remaining = Math.max(1, maxResults - collectedIds.length);
        const listRes = await gmail.users.messages.list({
            userId: getGmailUserId(),
            q: query,
            maxResults: Math.min(100, remaining),
            pageToken: nextPageToken,
        });
        const batch = (listRes.data.messages || [])
            .map((m) => m.id)
            .filter(Boolean);
        collectedIds.push(...batch);
        nextPageToken = listRes.data.nextPageToken || undefined;
    } while (nextPageToken && collectedIds.length < maxResults);
    const messageIds = [...new Set(collectedIds)].slice(0, maxResults);
    if (!messageIds.length) {
        return { imported: 0, skipped: 0, message: 'No inbox messages in scan window.' };
    }
    const existing = await readStore();
    const existingExternal = new Set(existing.map((e) => e.externalId).filter(Boolean));
    let imported = 0;
    let skipped = 0;
    for (const id of messageIds) {
        if (existingExternal.has(id)) {
            skipped++;
            continue;
        }
        const msg = await gmail.users.messages.get({ userId: getGmailUserId(), id, format: 'full' });
        const headers = msg.data.payload?.headers || [];
        const subject = pickHeader(headers, 'Subject') || '(No subject)';
        const sender = pickHeader(headers, 'From') || undefined;
        const dateHeader = pickHeader(headers, 'Date');
        const body = collectTextPart(msg.data.payload) || msg.data.snippet || '';
        const category = classifyEmail(subject);
        if (category === 'other') {
            skipped++;
            continue;
        }
        const address = extractAddress(`${subject}\n${body}`);
        const matchedClient = await findClientByAddress(address);
        const lead = category === 'lead' ? parseLeadPayload(body) : undefined;
        const summary = category === 'inspector'
            ? summarizeInspector(subject, body, address)
            : lead?.description || body.replace(/\s+/g, ' ').trim().slice(0, 220);
        const now = new Date().toISOString();
        const record = {
            id: (0, uuid_1.v4)(),
            externalId: id,
            category,
            status: 'needs_review',
            source: 'gmail',
            subject,
            sender,
            address,
            receivedAt: dateHeader ? new Date(dateHeader).toISOString() : now,
            summary,
            bodyPreview: body.replace(/\s+/g, ' ').trim().slice(0, 400),
            lead,
            matchedClientId: matchedClient?.id,
            matchedClientName: matchedClient?.name,
            createdAt: now,
            updatedAt: now,
        };
        existing.push(record);
        imported++;
    }
    existing.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    await writeStore(existing);
    return { imported, skipped, message: 'Rules-first sync complete.' };
}
//# sourceMappingURL=emailIntake.js.map