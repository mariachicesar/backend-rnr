"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCSLBAgent = runCSLBAgent;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const csv_parse_1 = require("csv-parse");
/**
 * CSLB Discovery Agent
 *
 * Pulls active California contractor licenses from a local CSV export
 * downloaded from the CSLB data portal (MASTER LIST of CONTRACTORS).
 * Pure parse + filter, no LLM (no token cost, no iteration limit).
 */
const CSLB_CSV_PATH = path_1.default.resolve(process.cwd(), 'data', 'cslb-active.csv');
function licenseAgeToCutoff(age) {
    if (!age || age === 'all')
        return null;
    const now = new Date();
    const days = age === 'new_90d' ? 90 : age === 'new_180d' ? 180 : 365;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
}
function parseDate(value) {
    if (!value)
        return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}
function classificationContains(raw, target) {
    if (!raw)
        return false;
    // CSLB Classifications field looks like "B - GENERAL BUILDING CONTRACTOR | C10 - ELECTRICAL"
    const normalizedTarget = target.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return raw
        .toUpperCase()
        .split(/[|,;]/)
        .some((c) => c.trim().replace(/[^A-Z0-9]/g, '').startsWith(normalizedTarget));
}
function inferProspectType(classification) {
    // 'A' = general engineering (often builders/developers), 'B' = general building (GCs)
    if (classification && classificationContains(classification, 'A'))
        return 'builder';
    return 'general_contractor';
}
function normalizeHeader(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function normalizeRecord(record) {
    const normalized = {};
    for (const [key, value] of Object.entries(record)) {
        const normalizedKey = normalizeHeader(key);
        if (!(normalizedKey in normalized)) {
            normalized[normalizedKey] = value;
        }
    }
    return normalized;
}
function readField(record, keys) {
    for (const key of keys) {
        const normalizedKey = normalizeHeader(key);
        const raw = record[normalizedKey] ?? record[key];
        if (raw !== undefined && raw !== null) {
            const value = String(raw).trim();
            if (value.length > 0)
                return value;
        }
    }
    return null;
}
function isActiveStatus(status) {
    if (!status)
        return true;
    const normalized = status.toUpperCase();
    return normalized.includes('ACTIVE') || normalized === 'CLEAR';
}
function createAbortError() {
    const err = new Error('Discovery cancelled');
    err.name = 'AbortError';
    return err;
}
async function readCsvProspects(config, signal) {
    const ageCutoff = licenseAgeToCutoff(config.licenseAge);
    const maxResults = Math.min(config.maxResults ?? 100, 200);
    const cityFilter = config.cityFilter?.trim().toLowerCase() ?? null;
    const tradeFilter = config.tradeFilter?.trim() ?? null;
    const prospects = [];
    return new Promise((resolve, reject) => {
        const parser = (0, csv_parse_1.parse)({ columns: true, skip_empty_lines: true, trim: true });
        const stream = (0, fs_1.createReadStream)(CSLB_CSV_PATH);
        let settled = false;
        const cleanup = () => {
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
        };
        const resolveOnce = (result) => {
            if (!settled) {
                settled = true;
                cleanup();
                resolve(result);
            }
        };
        const rejectOnce = (err) => {
            if (!settled) {
                settled = true;
                cleanup();
                reject(err);
            }
        };
        const handleAbort = () => {
            stream.destroy(createAbortError());
        };
        if (signal?.aborted) {
            cleanup();
            return reject(createAbortError());
        }
        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }
        stream.on('error', (err) => {
            rejectOnce(err);
        });
        parser.on('error', (err) => {
            rejectOnce(err);
        });
        parser.on('readable', () => {
            let record;
            while ((record = parser.read()) !== null) {
                if (signal?.aborted) {
                    stream.destroy(createAbortError());
                    break;
                }
                if (prospects.length >= maxResults) {
                    // stream.destroy() won't fire parser 'end', so resolve immediately
                    stream.destroy();
                    resolveOnce(prospects);
                    break;
                }
                const normalizedRecord = normalizeRecord(record);
                const license = readField(normalizedRecord, [
                    'LicenseNumber',
                    'License Number',
                    'LicenseNo',
                    'License No',
                    'License #',
                    'License',
                ]);
                const name = readField(normalizedRecord, [
                    'BusinessName',
                    'Business Name',
                    'Company Name',
                    'Company',
                ]);
                if (!license || !name)
                    continue;
                const classifications = readField(normalizedRecord, [
                    'Classification(s)',
                    'Classifications',
                    'Classification',
                ]);
                const status = readField(normalizedRecord, [
                    'Status',
                    'License Status',
                    'Primary Status',
                    'PrimaryStatus',
                ]);
                if (!isActiveStatus(status))
                    continue;
                if (tradeFilter &&
                    tradeFilter.toLowerCase() !== 'all' &&
                    !classificationContains(classifications, tradeFilter)) {
                    continue;
                }
                const city = readField(normalizedRecord, ['City']);
                if (cityFilter && city?.toLowerCase() !== cityFilter) {
                    continue;
                }
                const issued = parseDate(readField(normalizedRecord, ['IssueDate', 'Issue Date', 'Original Issue Date', 'OriginalIssueDate']));
                if (ageCutoff && (!issued || issued < ageCutoff))
                    continue;
                const prospect = {
                    companyName: name,
                    cslbLicense: license,
                    cslbClassification: classifications ?? null,
                    cslbStatus: status ?? null,
                    licenseIssuedDate: issued,
                    licenseExpireDate: parseDate(readField(normalizedRecord, ['ExpirationDate', 'Expiration Date', 'Expire Date', 'ExpireDate', 'ExpirationDate1'])),
                    address: readField(normalizedRecord, ['Address', 'Business Address', 'Mailing Address', 'MailingAddress']),
                    city: city ?? null,
                    state: readField(normalizedRecord, ['State']),
                    zipCode: readField(normalizedRecord, ['ZIP Code', 'Zip Code', 'ZIP', 'Zip', 'ZIPCode']),
                    phone: readField(normalizedRecord, ['PhoneNumber', 'Business Phone', 'Phone', 'BusinessPhone']),
                    prospectType: inferProspectType(classifications ?? null),
                    source: 'cslb_agent',
                    sourceUrl: `https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/LicenseDetail.aspx?LicNum=${encodeURIComponent(license)}`,
                };
                prospects.push(prospect);
            }
        });
        parser.on('end', () => {
            resolveOnce(prospects);
        });
        stream.pipe(parser);
    });
}
async function runCSLBAgent(config, signal) {
    try {
        const prospects = await readCsvProspects(config, signal);
        return { found: prospects.length, prospects };
    }
    catch (error) {
        if (error?.code === 'ENOENT') {
            throw new Error(`CSLB CSV file not found at ${CSLB_CSV_PATH}. Download the MASTER LIST of CONTRACTORS and save it as data/cslb-active.csv.`);
        }
        throw error;
    }
}
//# sourceMappingURL=cslbAgent.js.map