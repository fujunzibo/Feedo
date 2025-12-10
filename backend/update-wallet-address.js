import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateWalletAddress() {
  try {
    // 恢复 Treasury Wallet 地址为原来的地址
    const updatedWallet = await prisma.wallet.update({
      where: { id: 'cmgrobwr30000i2p48yorsco5' },
      data: { address: '6mM3eZ1Ne3XgvZMDvdJr2urcBkqWw8XwD5GecWLbpAzN' }
    });

    console.log('Updated wallet address:', updatedWallet);
  } catch (error) {
    console.error('Error updating wallet address:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateWalletAddress();
