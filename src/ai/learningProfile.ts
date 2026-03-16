import fs from 'fs';
import path from 'path';
import { ElectricalScope, PlanExtraction } from './schemas';

type NumericStat = {
  avgError: number;
  avgAbsError: number;
  avgAbsPctError: number;
  underCountRate: number;
  samples: number;
};

type LearningProfile = {
  updatedAt: string;
  totalSamples: number;
  numeric: Record<string, NumericStat>;
};

export type LearningProfileSummary = {
  updatedAt: string;
  totalSamples: number;
  topFields: Array<{
    field: string;
    avgCorrection: number;
    avgAbsPctError: number;
    underCountRate: number;
    samples: number;
  }>;
};

const PROFILE_DIR = path.join(process.cwd(), 'data');
const PROFILE_PATH = path.join(PROFILE_DIR, 'ai-learning-profile.json');

const DEFAULT_PROFILE: LearningProfile = {
  updatedAt: new Date(0).toISOString(),
  totalSamples: 0,
  numeric: {},
};

function ensureProfileDir(): void {
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

function loadProfile(): LearningProfile {
  try {
    if (!fs.existsSync(PROFILE_PATH)) return { ...DEFAULT_PROFILE };
    const raw = fs.readFileSync(PROFILE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as LearningProfile;
    return {
      updatedAt: parsed.updatedAt ?? DEFAULT_PROFILE.updatedAt,
      totalSamples: typeof parsed.totalSamples === 'number' ? parsed.totalSamples : 0,
      numeric: parsed.numeric ?? {},
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(profile: LearningProfile): void {
  ensureProfileDir();
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf8');
}

function updateStat(stat: NumericStat | undefined, predicted: number | null, actual: number | null): NumericStat | undefined {
  if (typeof predicted !== 'number' || typeof actual !== 'number') return stat;

  const err = actual - predicted;
  const absErr = Math.abs(err);
  const pctErr = actual === 0 ? 0 : Math.abs(err) / Math.max(actual, 1);
  const under = predicted < actual ? 1 : 0;

  const prev = stat ?? {
    avgError: 0,
    avgAbsError: 0,
    avgAbsPctError: 0,
    underCountRate: 0,
    samples: 0,
  };

  const n = prev.samples + 1;
  return {
    avgError: (prev.avgError * prev.samples + err) / n,
    avgAbsError: (prev.avgAbsError * prev.samples + absErr) / n,
    avgAbsPctError: (prev.avgAbsPctError * prev.samples + pctErr) / n,
    underCountRate: (prev.underCountRate * prev.samples + under) / n,
    samples: n,
  };
}

export function recordScopeCorrection(rawExtraction: PlanExtraction | null, confirmedScope: ElectricalScope): void {
  if (!rawExtraction) return;

  const predicted = rawExtraction.detectedItems;
  const profile = loadProfile();

  const numOrZero = (v: number | null | undefined): number => (typeof v === 'number' ? v : 0);

  const pairs: Array<[string, number | null, number | null]> = [
    ['squareFootage', rawExtraction.squareFootage, confirmedScope.squareFootage],
    // For count-like fields, treat null prediction as 0 so undercounts are learned.
    ['outlets', numOrZero(predicted.outlets), confirmedScope.outlets],
    ['switches', numOrZero(predicted.switches), confirmedScope.switches],
    ['lightFixtures', numOrZero(predicted.lightFixtures), confirmedScope.lightFixtures],
    ['recessedLights', numOrZero(predicted.recessedLights), confirmedScope.recessedLights],
    ['ceilingFans', numOrZero(predicted.ceilingFans), confirmedScope.ceilingFans],
    ['smokeCoDetectors',
      (predicted.smokeDetectors ?? 0) + (predicted.carbonMonoxideDetectors ?? 0),
      confirmedScope.smokeCoDetectors],
    ['exhaustFans', numOrZero(predicted.exhaustFans), confirmedScope.exhaustFans],
    ['mainPanelAmps', predicted.mainPanelAmps, confirmedScope.mainPanelAmps],
    ['subPanelAmps', predicted.subPanelAmps, confirmedScope.subPanelAmps],
  ];

  for (const [key, p, a] of pairs) {
    const next = updateStat(profile.numeric[key], p, a);
    if (next) profile.numeric[key] = next;
  }

  profile.totalSamples += 1;
  profile.updatedAt = new Date().toISOString();
  saveProfile(profile);
}

export function getLearningPromptHints(): string {
  const profile = loadProfile();
  if (profile.totalSamples < 3) return '';

  const important = Object.entries(profile.numeric)
    .filter(([, s]) => s.samples >= 3)
    .sort((a, b) => Math.abs(b[1].avgError) - Math.abs(a[1].avgError))
    .slice(0, 6);

  if (important.length === 0) return '';

  const lines = important.map(([field, s]) => {
    const sign = s.avgError >= 0 ? '+' : '';
    const pct = Math.round(s.avgAbsPctError * 100);
    const under = Math.round(s.underCountRate * 100);
    return `- ${field}: avg correction ${sign}${s.avgError.toFixed(1)}, avg error ${pct}%, undercount rate ${under}%`;
  });

  return `Historical correction profile (${profile.totalSamples} confirmed jobs):\n${lines.join('\n')}\nApply these tendencies conservatively and prefer legend counts when present.`;
}

export function getLearningProfileSummary(): LearningProfileSummary {
  const profile = loadProfile();

  const topFields = Object.entries(profile.numeric)
    .filter(([, s]) => s.samples >= 1)
    .sort((a, b) => Math.abs(b[1].avgError) - Math.abs(a[1].avgError))
    .slice(0, 8)
    .map(([field, s]) => ({
      field,
      avgCorrection: Number(s.avgError.toFixed(2)),
      avgAbsPctError: Number((s.avgAbsPctError * 100).toFixed(1)),
      underCountRate: Number((s.underCountRate * 100).toFixed(1)),
      samples: s.samples,
    }));

  return {
    updatedAt: profile.updatedAt,
    totalSamples: profile.totalSamples,
    topFields,
  };
}
