const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@rnrelectrician.com' },
    update: { hashedPassword: hash, role: 'admin', name: 'Admin' },
    create: {
      email: 'admin@rnrelectrician.com',
      name: 'Admin',
      hashedPassword: hash,
      role: 'admin',
    },
  });

  console.log(JSON.stringify({ id: user.id, email: user.email, role: user.role }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
