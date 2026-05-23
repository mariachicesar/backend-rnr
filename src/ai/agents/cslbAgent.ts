import { createReadStream } from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { LicenseAge, DiscoveryConfig } from '../schemas/b2bSchemas';

/**
 * CSLB Discovery Agent
 *
 * Pulls active California contractor licenses from a local CSV export
 * downloaded from the CSLB data portal (MASTER LIST of CONTRACTORS).
 * Pure parse + filter, no LLM (no token cost, no iteration limit).
 */

const CSLB_CSV_PATH = path.resolve(process.cwd(), 'data', 'cslb-active.csv');

export type CSLBDiscoveredProspect = {
  companyName: string;
  cslbLicense: string;
  cslbClassification: string | null;
  cslbStatus: string | null;
  licenseIssuedDate: Date | null;
  licenseExpireDate: Date | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  prospectType: 'general_contractor' | 'builder';
  source: 'cslb_agent';
  sourceUrl: string;
};

function licenseAgeToCutoff(age: LicenseAge | undefined): Date | null {
  if (!age || age === 'all') return null;
  const now = new Date();
  const days = age === 'new_90d' ? 90 : age === 'new_180d' ? 180 : 365;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function classificationContains(raw: string | null | undefined, target: string): boolean {
  if (!raw) return false;
  // CSLB Classifications field looks like "B - GENERAL BUILDING CONTRACTOR | C10 - ELECTRICAL"
  const normalizedTarget = target.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw
    .toUpperCase()
    .split(/[|,;]/)
    .some((c) => c.trim().replace(/[^A-Z0-9]/g, '').startsWith(normalizedTarget));
}

function inferProspectType(classification: string | null): 'general_contractor' | 'builder' {
  // 'A' = general engineering (often builders/developers), 'B' = general building (GCs)
  if (classification && classificationContains(classification, 'A')) return 'builder';
  return 'general_contractor';
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeHeader(key);
    if (!(normalizedKey in normalized)) {
      normalized[normalizedKey] = value;
    }
  }
  return normalized;
}

function readField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const raw = record[normalizedKey] ?? record[key];
    if (raw !== undefined && raw !== null) {
      const value = String(raw).trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

function isActiveStatus(status: string | null): boolean {
  if (!status) return true;
  const normalized = status.toUpperCase();
  return normalized.includes('ACTIVE') || normalized === 'CLEAR';
}

function createAbortError(): Error {
  const err = new Error('Discovery cancelled');
  (err as any).name = 'AbortError';
  return err;
}

async function readCsvProspects(
  config: DiscoveryConfig,
  signal?: AbortSignal
): Promise<CSLBDiscoveredProspect[]> {
  const ageCutoff = licenseAgeToCutoff(config.licenseAge);
  const maxResults = Math.min(config.maxResults ?? 100, 200);
  const cityFilter = config.cityFilter?.trim().toLowerCase() ?? null;
  const tradeFilter = config.tradeFilter?.trim() ?? null;

  const prospects: CSLBDiscoveredProspect[] = [];

  return new Promise((resolve, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, trim: true });
    const stream = createReadStream(CSLB_CSV_PATH);
    let settled = false;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
    };

    const resolveOnce = (result: CSLBDiscoveredProspect[]) => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(result);
      }
    };

    const rejectOnce = (err: Error) => {
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
      let record: Record<string, unknown> | null;
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
        if (!license || !name) continue;

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
        if (!isActiveStatus(status)) continue;

        if (
          tradeFilter &&
          tradeFilter.toLowerCase() !== 'all' &&
          !classificationContains(classifications, tradeFilter)
        ) {
          continue;
        }

        const city = readField(normalizedRecord, ['City']);
        if (cityFilter && city?.toLowerCase() !== cityFilter) {
          continue;
        }

        const issued = parseDate(
          readField(normalizedRecord, ['IssueDate', 'Issue Date', 'Original Issue Date', 'OriginalIssueDate'])
        );
        if (ageCutoff && (!issued || issued < ageCutoff)) continue;

        const prospect: CSLBDiscoveredProspect = {
          companyName: name,
          cslbLicense: license,
          cslbClassification: classifications ?? null,
          cslbStatus: status ?? null,
          licenseIssuedDate: issued,
          licenseExpireDate: parseDate(
            readField(normalizedRecord, ['ExpirationDate', 'Expiration Date', 'Expire Date', 'ExpireDate', 'ExpirationDate1'])
          ),
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

export async function runCSLBAgent(
  config: DiscoveryConfig,
  signal?: AbortSignal
): Promise<{ found: number; prospects: CSLBDiscoveredProspect[] }> {
  try {
    const prospects = await readCsvProspects(config, signal);
    return { found: prospects.length, prospects };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `CSLB CSV file not found at ${CSLB_CSV_PATH}. Download the MASTER LIST of CONTRACTORS and save it as data/cslb-active.csv.`
      );
    }
    throw error;
  }
}
