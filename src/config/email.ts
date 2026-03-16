import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload) {
  try {
    const result = await resend.emails.send({
      from: `RnR Electrical <${process.env.ADMIN_EMAIL || 'rnrelectrical2@gmail.com'}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });

    return { success: true, messageId: (result as any)?.data?.id || (result as any)?.id };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function generateEstimateLink(estimateId: string, clientId: string) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${baseUrl}/track?estimateId=${estimateId}&clientId=${clientId}`;
}

export function generateContractLink(contractId: string, clientId: string) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${baseUrl}/track?contractId=${contractId}&clientId=${clientId}`;
}

export function generateInvoiceLink(invoiceId: string, clientId: string) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${baseUrl}/track?invoiceId=${invoiceId}&clientId=${clientId}`;
}

export function generateEstimateEmail(
  clientName: string,
  estimateNumber: string,
  total: number,
  viewLink: string
) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Estimate from RnR Electrical</h2>
      <p>Hi ${clientName},</p>
      <p>We've prepared an estimate for your project. Here are the details:</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Estimate #:</strong> ${estimateNumber}</p>
        <p><strong>Total Amount:</strong> $${total.toFixed(2)}</p>
      </div>
      
      <p>Please review the estimate by clicking the link below:</p>
      <p style="margin: 30px 0;">
        <a href="${viewLink}" style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          View & Accept Estimate
        </a>
      </p>
      
      <p>If you have any questions, please don't hesitate to reach out.</p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">
        RnR Electrical<br>
        ${process.env.NEXT_PUBLIC_COMPANY_PHONE || 'Phone'}<br>
        ${process.env.ADMIN_EMAIL || 'rnrelectrical2@gmail.com'}
      </p>
    </div>
  `;
}

export function generateInvoiceEmail(
  clientName: string,
  invoiceNumber: string,
  total: number,
  dueDate: Date | null | undefined,
  viewLink: string
) {
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString() : 'upon receipt';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Invoice from RnR Electrical</h2>
      <p>Hi ${clientName},</p>
      <p>Please find your invoice below:</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
        <p><strong>Total Amount:</strong> $${total.toFixed(2)}</p>
        <p><strong>Due Date:</strong> ${dueDateStr}</p>
      </div>
      
      <p>View your invoice:</p>
      <p style="margin: 30px 0;">
        <a href="${viewLink}" style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          View Invoice
        </a>
      </p>
      
      <p><strong>Payment Methods:</strong> Bank Account (ACH), Credit Card, or Zelle</p>
      
      <p>If you have any questions, please don't hesitate to reach out.</p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">
        RnR Electrical<br>
        ${process.env.NEXT_PUBLIC_COMPANY_PHONE || 'Phone'}<br>
        ${process.env.ADMIN_EMAIL || 'rnrelectrical2@gmail.com'}
      </p>
    </div>
  `;
}
