import { DiscoveryConfig } from '../schemas/b2bSchemas';
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
export declare function runCSLBAgent(config: DiscoveryConfig, signal?: AbortSignal): Promise<{
    found: number;
    prospects: CSLBDiscoveredProspect[];
}>;
//# sourceMappingURL=cslbAgent.d.ts.map