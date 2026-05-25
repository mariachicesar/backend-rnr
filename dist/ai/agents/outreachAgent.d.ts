import { OutreachOutput } from '../schemas/b2bSchemas';
export type OutreachInput = {
    companyName: string;
    city: string | null;
    classification: string | null;
    licenseIssuedYear: number | null;
    prospectType: 'general_contractor' | 'builder';
};
export declare function runOutreachAgent(input: OutreachInput): Promise<OutreachOutput>;
//# sourceMappingURL=outreachAgent.d.ts.map