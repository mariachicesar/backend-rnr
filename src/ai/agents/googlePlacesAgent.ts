import { PLACES_FETCH_TIMEOUT_MS, DiscoveryConfig } from '../schemas/b2bSchemas';

/**
 * Google Places Discovery Agent
 *
 * Property management companies are NOT in CSLB (they're not licensed contractors).
 * Use Google Places Text Search to find them. Pure fetch, no LLM.
 *
 * Requires GOOGLE_PLACES_API_KEY env var.
 */

const TEXTSEARCH = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS = 'https://maps.googleapis.com/maps/api/place/details/json';

export type PlacesDiscoveredProspect = {
  companyName: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  prospectType: 'property_manager';
  source: 'google_places_agent';
  sourceUrl: string;
  placeId: string;
};

function createAbortError(): Error {
  const err = new Error('Discovery cancelled');
  (err as any).name = 'AbortError';
  return err;
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLACES_FETCH_TIMEOUT_MS);
  const handleAbort = () => controller.abort();
  if (signal?.aborted) throw createAbortError();
  if (signal) signal.addEventListener('abort', handleAbort, { once: true });
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Places API ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', handleAbort);
  }
}

function extractCity(formattedAddress: string | null | undefined): {
  city: string | null;
  state: string | null;
  zipCode: string | null;
} {
  if (!formattedAddress) return { city: null, state: null, zipCode: null };
  // "123 Main St, Pasadena, CA 91101, USA"
  const parts = formattedAddress.split(',').map((p) => p.trim());
  const city = parts.length >= 3 ? parts[parts.length - 3] : null;
  const stateZip = parts.length >= 2 ? parts[parts.length - 2] : '';
  const [state, zipCode] = stateZip.split(' ').filter(Boolean);
  return { city: city || null, state: state || null, zipCode: zipCode || null };
}

export async function runGooglePlacesAgent(
  config: DiscoveryConfig,
  signal?: AbortSignal
): Promise<{ found: number; prospects: PlacesDiscoveredProspect[] }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY env var not configured.');

  const city = config.cityFilter?.trim();
  if (!city) throw new Error('cityFilter is required for Google Places agent.');

  const maxResults = Math.min(config.maxResults ?? 20, 60);
  const prospects: PlacesDiscoveredProspect[] = [];
  const query = encodeURIComponent(`property management company ${city}`);

  let pageToken: string | undefined;
  let pagesFetched = 0;
  const MAX_PAGES = 3; // Places Text Search returns up to 60 results across 3 pages

  while (prospects.length < maxResults && pagesFetched < MAX_PAGES) {
    const url = pageToken
      ? `${TEXTSEARCH}?pagetoken=${pageToken}&key=${apiKey}`
      : `${TEXTSEARCH}?query=${query}&key=${apiKey}`;

    if (signal?.aborted) throw createAbortError();
    const json: any = await fetchWithTimeout(url, signal);
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      throw new Error(`Places search status: ${json.status}`);
    }
    const results: any[] = json.results ?? [];

    for (const r of results) {
      if (prospects.length >= maxResults) break;
      const placeId = r.place_id;
      if (!placeId || !r.name) continue;

      // Details call for phone + website (Places text search doesn't include these)
      const detailsUrl = `${DETAILS}?place_id=${placeId}&fields=formatted_phone_number,website,formatted_address,name&key=${apiKey}`;
      let detail: any = {};
      try {
        if (signal?.aborted) throw createAbortError();
        const dj: any = await fetchWithTimeout(detailsUrl, signal);
        detail = dj.result ?? {};
      } catch {
        // continue with text-search data only
      }

      const formattedAddress = detail.formatted_address ?? r.formatted_address ?? null;
      const { city: parsedCity, state, zipCode } = extractCity(formattedAddress);

      prospects.push({
        companyName: (detail.name ?? r.name).trim(),
        phone: detail.formatted_phone_number ?? null,
        website: detail.website ?? null,
        address: formattedAddress,
        city: parsedCity ?? city,
        state,
        zipCode,
        prospectType: 'property_manager',
        source: 'google_places_agent',
        sourceUrl: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        placeId,
      });
    }

    pageToken = json.next_page_token;
    pagesFetched += 1;
    if (!pageToken) break;
    // Google requires short delay before next_page_token becomes valid
    await new Promise((r) => setTimeout(r, 2000));
    if (signal?.aborted) throw createAbortError();
  }

  return { found: prospects.length, prospects };
}
