import prisma from '../config/database';

export type BillingKind = 'deposit' | 'phase' | 'final' | 'balance' | 'custom';

const BILLING_PREFIX = 'BILLING_';
const AUTO_DEPOSIT_PREFIX = 'AUTO_DEPOSIT_ESTIMATE_ID:';

function roundMoney(amount: number) {
  return Number(amount.toFixed(2));
}

async function generateInvoiceNumber() {
  const latestInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  const number = latestInvoice ? parseInt(latestInvoice.invoiceNumber.split('-')[1], 10) + 1 : 2001;
  return `INV-${number}`;
}

export function parseBillingNotes(notes: string | null | undefined) {
  const markers: Record<string, string> = {};
  const plainLines: string[] = [];

  for (const line of (notes || '').split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    if (line.startsWith(BILLING_PREFIX)) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.slice(BILLING_PREFIX.length, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key) {
          markers[key] = value;
        }
      }
      continue;
    }

    if (line.startsWith(AUTO_DEPOSIT_PREFIX)) {
      markers.SOURCE_ESTIMATE_ID = line.slice(AUTO_DEPOSIT_PREFIX.length).trim();
      plainLines.push(line);
      continue;
    }

    plainLines.push(line);
  }

  return {
    markers,
    plainText: plainLines.join('\n').trim(),
  };
}

export function mergeBillingMarkers(
  notes: string | null | undefined,
  markerValues: Record<string, string | number | boolean | null | undefined>
) {
  const parsed = parseBillingNotes(notes);
  const lines = parsed.plainText ? parsed.plainText.split(/\r?\n/) : [];

  for (const [key, value] of Object.entries(markerValues)) {
    if (value === undefined || value === null || value === '') {
      delete parsed.markers[key];
      continue;
    }

    parsed.markers[key] = String(value);
  }

  const markerLines = Object.entries(parsed.markers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${BILLING_PREFIX}${key}:${value}`);

  return [...lines, ...markerLines].join('\n').trim();
}

export function inferBillingKind(invoice: { title?: string | null; notes?: string | null; contractId?: string | null }) {
  const { markers } = parseBillingNotes(invoice.notes);
  const explicitKind = markers.KIND as BillingKind | undefined;

  if (explicitKind) {
    return explicitKind;
  }

  const title = invoice.title?.toLowerCase() || '';
  if (title.includes('deposit')) return 'deposit';
  if (title.includes('final')) return 'final';
  if (title.includes('phase')) return 'phase';
  if (title.includes('balance')) return 'balance';
  return 'custom';
}

export function getInvoiceBillingContext(invoice: any) {
  const { markers } = parseBillingNotes(invoice.notes);
  return {
    kind: inferBillingKind(invoice),
    sourceEstimateId: markers.SOURCE_ESTIMATE_ID || null,
    sourceContractId: invoice.contractId || markers.SOURCE_CONTRACT_ID || null,
    milestoneId: markers.MILESTONE_ID || null,
    phaseId: markers.PHASE_ID || null,
    appliesDepositCredit: markers.APPLIES_DEPOSIT_CREDIT === 'true',
  };
}

function getActualPaymentsTotal(invoice: any) {
  return roundMoney((invoice.payments || []).reduce((sum: number, payment: any) => sum + payment.amount, 0));
}

function getInvoiceSettledAmount(invoice: any) {
  if (typeof invoice.amountPaid === 'number') {
    return roundMoney(Math.min(invoice.amountPaid, invoice.total));
  }

  return roundMoney(Math.min(getActualPaymentsTotal(invoice), invoice.total));
}

function invoicesShareSource(targetContext: ReturnType<typeof getInvoiceBillingContext>, candidate: any) {
  const candidateContext = getInvoiceBillingContext(candidate);

  if (targetContext.sourceContractId) {
    return candidate.contractId === targetContext.sourceContractId || candidateContext.sourceContractId === targetContext.sourceContractId;
  }

  if (targetContext.sourceEstimateId) {
    return candidateContext.sourceEstimateId === targetContext.sourceEstimateId;
  }

  return false;
}

export function buildInvoiceSummary(invoice: any, relatedInvoices: any[]) {
  const context = getInvoiceBillingContext(invoice);
  const depositCredit = context.appliesDepositCredit
    ? roundMoney(
        relatedInvoices
          .filter((candidate) => candidate.id !== invoice.id)
          .filter((candidate) => inferBillingKind(candidate) === 'deposit')
          .filter((candidate) => invoicesShareSource(context, candidate))
          .reduce((sum, candidate) => sum + getInvoiceSettledAmount(candidate), 0)
      )
    : 0;

  const actualPaymentsTotal = getActualPaymentsTotal(invoice);
  const totalPaid = roundMoney(Math.min(invoice.total, depositCredit + actualPaymentsTotal));
  const balanceDue = roundMoney(Math.max(invoice.total - totalPaid, 0));

  return {
    billingKind: context.kind,
    sourceEstimateId: context.sourceEstimateId,
    appliesDepositCredit: context.appliesDepositCredit,
    depositCredit,
    actualPaymentsTotal,
    totalPaid,
    balanceDue,
    originalTotal: invoice.total,
  };
}

function deriveInvoiceStatus(invoice: any, totalPaid: number) {
  if (invoice.status === 'cancelled') {
    return invoice.status;
  }

  if (totalPaid >= invoice.total) {
    return 'paid';
  }

  if (totalPaid > 0) {
    return 'partially_paid';
  }

  if (invoice.status === 'overdue') {
    return 'overdue';
  }

  return invoice.sentAt ? 'sent' : 'draft';
}

async function getRelatedInvoices(invoice: any) {
  const context = getInvoiceBillingContext(invoice);

  if (context.sourceContractId) {
    return prisma.invoice.findMany({
      where: {
        clientId: invoice.clientId,
        OR: [
          { contractId: context.sourceContractId },
          { notes: { contains: `${BILLING_PREFIX}SOURCE_CONTRACT_ID:${context.sourceContractId}` } },
        ],
      },
      include: { payments: true },
    });
  }

  if (context.sourceEstimateId) {
    return prisma.invoice.findMany({
      where: {
        clientId: invoice.clientId,
        OR: [
          { notes: { contains: `${BILLING_PREFIX}SOURCE_ESTIMATE_ID:${context.sourceEstimateId}` } },
          { notes: { contains: `${AUTO_DEPOSIT_PREFIX}${context.sourceEstimateId}` } },
        ],
      },
      include: { payments: true },
    });
  }

  return [invoice];
}

async function recalculateStoredInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });

  if (!invoice) {
    return null;
  }

  const relatedInvoices = await getRelatedInvoices(invoice);
  const summary = buildInvoiceSummary(invoice, relatedInvoices);
  const status = deriveInvoiceStatus(invoice, summary.totalPaid);

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      amountPaid: summary.totalPaid,
      status,
      paidAt: status === 'paid' ? (invoice.paidAt || new Date()) : null,
    },
  });

  return {
    invoice,
    summary,
  };
}

async function ensureEstimateBalanceInvoiceForPaidDeposit(invoice: any) {
  const context = getInvoiceBillingContext(invoice);
  if (context.kind !== 'deposit' || !context.sourceEstimateId) {
    return null;
  }

  const depositPaid = getInvoiceSettledAmount(invoice);
  if (depositPaid < invoice.total) {
    return null;
  }

  const existingBalanceInvoice = await prisma.invoice.findFirst({
    where: {
      clientId: invoice.clientId,
      id: { not: invoice.id },
      AND: [
        { notes: { contains: `${BILLING_PREFIX}SOURCE_ESTIMATE_ID:${context.sourceEstimateId}` } },
        { notes: { contains: `${BILLING_PREFIX}KIND:balance` } },
        { notes: { contains: `${BILLING_PREFIX}APPLIES_DEPOSIT_CREDIT:true` } },
      ],
    },
  });

  if (existingBalanceInvoice) {
    return existingBalanceInvoice;
  }

  const estimate = await prisma.estimate.findUnique({
    where: { id: context.sourceEstimateId },
  });

  if (!estimate) {
    return null;
  }

  const invoiceNumber = await generateInvoiceNumber();
  const notes = mergeBillingMarkers('Auto-generated balance invoice after deposit payment.', {
    KIND: 'balance',
    SOURCE_ESTIMATE_ID: estimate.id,
    APPLIES_DEPOSIT_CREDIT: 'true',
  });

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      clientId: estimate.clientId,
      userId: estimate.userId,
      title: `Project Balance - ${estimate.title}`,
      description: `Remaining project balance for accepted estimate ${estimate.estimateNumber}. Paid deposit is applied automatically as credit.`,
      items: estimate.items,
      subtotal: estimate.subtotal,
      tax: estimate.tax,
      total: estimate.total,
      status: 'draft',
      notes,
    },
  });
}

export async function recalculateInvoiceAndLinkedCredits(invoiceId: string) {
  const primary = await recalculateStoredInvoice(invoiceId);

  if (!primary) {
    return null;
  }

  const primaryContext = getInvoiceBillingContext(primary.invoice);

  if (primaryContext.kind !== 'deposit') {
    return primary.summary;
  }

  await ensureEstimateBalanceInvoiceForPaidDeposit(primary.invoice);

  const linkedInvoices = await getRelatedInvoices(primary.invoice);
  for (const linkedInvoice of linkedInvoices) {
    if (linkedInvoice.id === invoiceId) {
      continue;
    }

    const linkedContext = getInvoiceBillingContext(linkedInvoice);
    if (!linkedContext.appliesDepositCredit) {
      continue;
    }

    await recalculateStoredInvoice(linkedInvoice.id);
  }

  return primary.summary;
}