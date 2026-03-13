import { Router, Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { sendEmail, generateInvoiceEmail, generateInvoiceLink } from '../config/email';

const router = Router();

async function generateInvoiceNumber() {
  const latestInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  const number = latestInvoice ? parseInt(latestInvoice.invoiceNumber.split('-')[1]) + 1 : 2001;
  return `INV-${number}`;
}

// GET /api/invoices
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: req.user!.id },
      include: { client: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = invoices.map(inv => ({
      ...inv,
      items: JSON.parse(inv.items),
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { client: true, payments: true },
    });

    if (!invoice || invoice.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({
      ...invoice,
      items: JSON.parse(invoice.items),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// POST /api/invoices - Create invoice
router.post('/', async (req: AuthRequest, res: Response) => {
  const { contractId, clientId, title, description, items, subtotal, tax, total, dueDate, notes, shouldSend } = req.body;

  if (!clientId || !title) {
    return res.status(400).json({ error: 'Client and title are required' });
  }

  try {
    const invoiceNumber = await generateInvoiceNumber();

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        contractId,
        clientId,
        userId: req.user!.id,
        title,
        description,
        items: JSON.stringify(items || []),
        subtotal,
        tax,
        total,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
      },
      include: { client: true, payments: true },
    });

    // Send email if requested
    if (shouldSend) {
      const viewLink = generateInvoiceLink(invoice.id, invoice.clientId);
      const emailHtml = generateInvoiceEmail(
        invoice.client.name,
        invoice.invoiceNumber,
        invoice.total,
        invoice.dueDate,
        viewLink
      );

      const emailResult = await sendEmail({
        to: invoice.client.email,
        subject: `Invoice ${invoice.invoiceNumber} from RnR Electrical`,
        html: emailHtml,
      });

      if (emailResult.success) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'sent', sentAt: new Date() },
        });

        await prisma.emailLog.create({
          data: {
            invoiceId: invoice.id,
            recipient: invoice.client.email,
            subject: `Invoice ${invoice.invoiceNumber} from RnR Electrical`,
            body: emailHtml,
            status: 'sent',
          },
        });
      }
    }

    res.status(201).json({
      ...invoice,
      items: JSON.parse(invoice.items),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// PUT /api/invoices/:id - Update invoice
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { title, description, items, subtotal, tax, total, dueDate, status, notes } = req.body;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });

    if (!invoice || invoice.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        items: JSON.stringify(items || []),
        subtotal,
        tax,
        total,
        dueDate: dueDate ? new Date(dueDate) : null,
        status,
        notes,
      },
      include: { client: true, payments: true },
    });

    res.json({
      ...updated,
      items: JSON.parse(updated.items),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
    });

    if (!invoice || invoice.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await prisma.invoice.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// POST /api/invoices/:id/send - Send invoice
router.post('/:id/send', async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { client: true },
    });

    if (!invoice || invoice.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const viewLink = generateInvoiceLink(invoice.id, invoice.clientId);
    const emailHtml = generateInvoiceEmail(
      invoice.client.name,
      invoice.invoiceNumber,
      invoice.total,
      invoice.dueDate,
      viewLink
    );

    const emailResult = await sendEmail({
      to: invoice.client.email,
      subject: `Invoice ${invoice.invoiceNumber} from RnR Electrical`,
      html: emailHtml,
    });

    if (emailResult.success) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'sent', sentAt: new Date() },
      });

      await prisma.emailLog.create({
        data: {
          invoiceId: invoice.id,
          recipient: invoice.client.email,
          subject: `Invoice ${invoice.invoiceNumber} from RnR Electrical`,
          body: emailHtml,
          status: 'sent',
        },
      });

      res.json({ success: true, messageId: emailResult.messageId });
    } else {
      res.status(500).json({ success: false, error: emailResult.error });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

export default router;
