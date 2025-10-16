import { prisma } from '../lib/prisma';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SeedWallet = { name: string; address: string; type: 'treasury' | 'target' | 'donation' };

async function main() {
  const file = resolve(process.cwd(), 'seed', 'wallets.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as SeedWallet[];

  for (const w of data) {
    await prisma.wallet.upsert({
      where: { address: w.address },
      update: { name: w.name, type: w.type },
      create: { name: w.name, address: w.address, type: w.type },
    });
  }
  console.log('Seeded wallets:', data.map((w) => `${w.type}:${w.address}`).join(', '));
}

main().finally(async () => {
  await prisma.$disconnect();
});


