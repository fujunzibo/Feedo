import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkWallets() {
  try {
    const wallets = await prisma.wallet.findMany();
    console.log('Current wallets:');
    wallets.forEach((wallet: Awaited<ReturnType<typeof prisma.wallet.findMany>>[0]) => {
      console.log(`- ${wallet.type}: ${wallet.address}`);
    });
    console.log(`Total wallets: ${wallets.length}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWallets();

