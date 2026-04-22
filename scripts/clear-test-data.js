const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing test data (keeping admin user)...\n');

  // Delete in dependency order to avoid FK violations
  const emailLogs       = await prisma.emailLog.deleteMany({});
  const payments        = await prisma.payment.deleteMany({});
  const invoices        = await prisma.invoice.deleteMany({});
  const contracts       = await prisma.contract.deleteMany({});
  const estimates       = await prisma.estimate.deleteMany({});
  const aiSessions      = await prisma.aiEstimateSession.deleteMany({});
  const projects        = await prisma.project.deleteMany({});
  const appointments    = await prisma.appointment.deleteMany({});
  const appointmentSlots = await prisma.appointmentSlot.deleteMany({});
  const clients         = await prisma.client.deleteMany({});

  // Delete non-admin users (and their linked accounts)
  const nonAdminUsers = await prisma.user.findMany({
    where: { role: { not: 'admin' } },
    select: { id: true },
  });
  const nonAdminIds = nonAdminUsers.map((u) => u.id);
  if (nonAdminIds.length) {
    await prisma.account.deleteMany({ where: { userId: { in: nonAdminIds } } });
    await prisma.user.deleteMany({ where: { id: { in: nonAdminIds } } });
  }

  console.log('Deleted:');
  console.log(`  EmailLog:         ${emailLogs.count}`);
  console.log(`  Payment:          ${payments.count}`);
  console.log(`  Invoice:          ${invoices.count}`);
  console.log(`  Contract:         ${contracts.count}`);
  console.log(`  Estimate:         ${estimates.count}`);
  console.log(`  AiEstimateSession:${aiSessions.count}`);
  console.log(`  Project:          ${projects.count}`);
  console.log(`  Appointment:      ${appointments.count}`);
  console.log(`  AppointmentSlot:  ${appointmentSlots.count}`);
  console.log(`  Client:           ${clients.count}`);
  console.log(`  Non-admin User:   ${nonAdminIds.length}`);
  console.log('\nDone. Admin user preserved.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
