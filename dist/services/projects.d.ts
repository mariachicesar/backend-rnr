export declare function backfillProjectsForUser(userId: string): Promise<void>;
export declare function loadProjectLookupForUser(userId: string): Promise<{
    projects: ({
        client: {
            id: string;
            email: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            phone: string | null;
            address: string | null;
            city: string | null;
            state: string | null;
            zipCode: string | null;
            notes: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        clientId: string;
        status: string;
        userId: string;
        title: string;
        description: string | null;
        sourceEstimateId: string | null;
        sourceContractId: string | null;
        sourceType: string;
    })[];
    projectByEstimateId: Map<string, any>;
    projectByContractId: Map<string, any>;
    contractById: Map<string, any>;
}>;
export declare function resolveProjectForInvoice(invoice: any, lookup: Awaited<ReturnType<typeof loadProjectLookupForUser>>): {
    id: any;
    key: any;
    name: any;
    status: any;
    sourceType: any;
    sourceEstimateId: any;
    sourceContractId: any;
    estimateNumber: null;
    contractNumber: any;
    clientName: any;
    clientEmail: any;
};
export declare function listProjectsForUser(userId: string): Promise<any[]>;
//# sourceMappingURL=projects.d.ts.map