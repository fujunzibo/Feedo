import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecords() {
  try {
    const records = await prisma.txRecord.findMany();
    console.log('Current records:');
    records.forEach((record: Awaited<ReturnType<typeof prisma.txRecord.findMany>>[0]) => {
      console.log(`- ${record.kind}: ${record.txSig} (${record.status})`);
    });
    console.log(`Total records: ${records.length}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecords();

