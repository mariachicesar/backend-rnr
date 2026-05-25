import { DiscoveryConfig } from '../schemas/b2bSchemas';
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
export declare function runGooglePlacesAgent(config: DiscoveryConfig, signal?: AbortSignal): Promise<{
    found: number;
    prospects: PlacesDiscoveredProspect[];
}>;
//# sourceMappingURL=googlePlacesAgent.d.ts.map