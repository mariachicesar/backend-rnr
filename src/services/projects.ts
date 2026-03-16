import prisma from '../config/database';
import { buildInvoiceSummary, getInvoiceBillingContext } from './billing';

function normalizeProjectStatus(status: string | null | undefined) {
  if (!status) {
    return 'active';
  }

  switch (status) {
    case 'draft':
    case 'sent':
      return 'planning';
    case 'accepted':
    case 'signed':
    case 'active':
    case 'in_progress':
      return 'active';
    case 'completed':
    case 'paid':
      return 'completed';
    case 'cancelled':
    case 'rejected':
      return 'cancelled';
    default:
      return status;
  }
}

function roundMoney(amount: number) {
  return Number(amount.toFixed(2));
}

async function saveProject(data: {
  clientId: string;
  userId: string;
  title: string;
  description?: string | null;
  status: string;
  sourceType: 'estimate' | 'contract';
  sourceEstimateId?: string | null;
  sourceContractId?: string | null;
}) {
  const filters = [] as Array<Record<string, string>>;

  if (data.sourceEstimateId) {
    filters.push({ sourceEstimateId: data.sourceEstimateId });
  }

  if (data.sourceContractId) {
    filters.push({ sourceContractId: data.sourceContractId });
  }

  const existing = filters.length
    ? await prisma.project.findFirst({
        where: {
          OR: filters,
        },
      })
    : null;

  const projectData = {
    clientId: data.clientId,
    userId: data.userId,
    title: data.title,
    description: data.description || null,
    status: data.status,
    sourceType: data.sourceType,
    sourceEstimateId: data.sourceEstimateId || null,
    sourceContractId: data.sourceContractId || null,
  };

  if (existing) {
    return prisma.project.update({
      where: { id: existing.id },
      data: projectData,
    });
  }

  return prisma.project.create({
    data: projectData,
  });
}

async function syncProjectFromEstimate(estimate: any, contractId?: string | null) {
  return saveProject({
    clientId: estimate.clientId,
    userId: estimate.userId,
    title: estimate.title,
    description: estimate.description,
    status: normalizeProjectStatus(estimate.status),
    sourceType: 'estimate',
    sourceEstimateId: estimate.id,
    sourceContractId: contractId || null,
  });
}

async function syncProjectFromContract(contract: any) {
  return saveProject({
    clientId: contract.clientId,
    userId: contract.userId,
    title: contract.title,
    description: contract.description,
    status: normalizeProjectStatus(contract.status),
    sourceType: contract.estimateId ? 'estimate' : 'contract',
    sourceEstimateId: contract.estimateId || null,
    sourceContractId: contract.id,
  });
}

export async function backfillProjectsForUser(userId: string) {
  const [estimates, contracts] = await Promise.all([
    prisma.estimate.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.contract.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const contractByEstimateId = new Map(
    contracts
      .filter((contract) => Boolean(contract.estimateId))
      .map((contract) => [contract.estimateId as string, contract])
  );

  for (const estimate of estimates) {
    await syncProjectFromEstimate(estimate, contractByEstimateId.get(estimate.id)?.id || null);
  }

  for (const contract of contracts) {
    await syncProjectFromContract(contract);
  }
}

export async function loadProjectLookupForUser(userId: string) {
  await backfillProjectsForUser(userId);

  const [projects, contracts] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      include: { client: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.contract.findMany({
      where: { userId },
      select: { id: true, estimateId: true, contractNumber: true, title: true },
    }),
  ]);

  const projectByEstimateId = new Map<string, any>();
  const projectByContractId = new Map<string, any>();
  const contractById = new Map<string, any>();

  for (const contract of contracts) {
    contractById.set(contract.id, contract);
  }

  for (const project of projects) {
    if (project.sourceEstimateId) {
      projectByEstimateId.set(project.sourceEstimateId, project);
    }

    if (project.sourceContractId) {
      projectByContractId.set(project.sourceContractId, project);
    }
  }

  return {
    projects,
    projectByEstimateId,
    projectByContractId,
    contractById,
  };
}

export function resolveProjectForInvoice(
  invoice: any,
  lookup: Awaited<ReturnType<typeof loadProjectLookupForUser>>
) {
  const billing = getInvoiceBillingContext(invoice);
  const contractId = billing.sourceContractId || invoice.contractId || null;
  const contract = contractId ? lookup.contractById.get(contractId) : null;
  const sourceEstimateId = billing.sourceEstimateId || contract?.estimateId || null;

  let project = contractId ? lookup.projectByContractId.get(contractId) : null;

  if (!project && sourceEstimateId) {
    project = lookup.projectByEstimateId.get(sourceEstimateId) || null;
  }

  const key = project?.id || (contractId ? `contract:${contractId}` : sourceEstimateId ? `estimate:${sourceEstimateId}` : `invoice:${invoice.id}`);
  const title = project?.title || contract?.title || invoice.title;

  return {
    id: project?.id || null,
    key,
    name: title,
    status: project?.status || 'active',
    sourceType: project?.sourceType || (contractId ? 'contract' : 'estimate'),
    sourceEstimateId: project?.sourceEstimateId || sourceEstimateId || null,
    sourceContractId: project?.sourceContractId || contractId || null,
    estimateNumber: null,
    contractNumber: contract?.contractNumber || null,
    clientName: project?.client?.name || invoice.client?.name || null,
    clientEmail: project?.client?.email || invoice.client?.email || null,
  };
}

export async function listProjectsForUser(userId: string) {
  const lookup = await loadProjectLookupForUser(userId);

  const [estimates, contracts, invoices] = await Promise.all([
    prisma.estimate.findMany({
      where: { userId },
      select: {
        id: true,
        estimateNumber: true,
        title: true,
        total: true,
        status: true,
        clientId: true,
      },
    }),
    prisma.contract.findMany({
      where: { userId },
      select: {
        id: true,
        contractNumber: true,
        title: true,
        total: true,
        status: true,
        clientId: true,
        estimateId: true,
      },
    }),
    prisma.invoice.findMany({
      where: { userId },
      include: {
        client: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const estimateById = new Map(estimates.map((estimate) => [estimate.id, estimate]));
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const groups = new Map<string, any>();

  for (const project of lookup.projects) {
    const estimate = project.sourceEstimateId ? estimateById.get(project.sourceEstimateId) : null;
    const contract = project.sourceContractId ? contractById.get(project.sourceContractId) : null;
    const projectTotal = roundMoney(contract?.total ?? estimate?.total ?? 0);

    groups.set(project.id, {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      sourceType: project.sourceType,
      clientId: project.clientId,
      clientName: project.client?.name || null,
      clientEmail: project.client?.email || null,
      sourceEstimateId: project.sourceEstimateId,
      sourceEstimateNumber: estimate?.estimateNumber || null,
      sourceContractId: project.sourceContractId,
      sourceContractNumber: contract?.contractNumber || null,
      projectTotal,
      cashCollected: 0,
      depositCollected: 0,
      creditedDeposits: 0,
      invoiceBalanceDue: 0,
      invoiceCount: 0,
      openInvoiceCount: 0,
      paidInvoiceCount: 0,
      latestInvoiceAt: null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  }

  for (const invoice of invoices) {
    const projectRef = resolveProjectForInvoice(invoice, lookup);
    if (!projectRef.id) {
      continue;
    }

    const group = groups.get(projectRef.id);
    if (!group) {
      continue;
    }

    const relatedInvoices = invoices.filter((candidate) => resolveProjectForInvoice(candidate, lookup).id === projectRef.id);
    const summary = buildInvoiceSummary(invoice, relatedInvoices);

    group.invoiceCount += 1;
    group.cashCollected = roundMoney(group.cashCollected + summary.actualPaymentsTotal);
    group.creditedDeposits = roundMoney(group.creditedDeposits + summary.depositCredit);
    group.invoiceBalanceDue = roundMoney(group.invoiceBalanceDue + summary.balanceDue);

    if (summary.billingKind === 'deposit') {
      group.depositCollected = roundMoney(group.depositCollected + summary.actualPaymentsTotal);
    }

    if (invoice.status === 'paid') {
      group.paidInvoiceCount += 1;
    } else if (summary.balanceDue > 0) {
      group.openInvoiceCount += 1;
    }

    if (!group.latestInvoiceAt || new Date(invoice.createdAt) > new Date(group.latestInvoiceAt)) {
      group.latestInvoiceAt = invoice.createdAt;
    }
  }

  return Array.from(groups.values())
    .map((project) => ({
      ...project,
      remainingDue: roundMoney(Math.max(project.projectTotal - project.cashCollected, 0)),
    }))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}