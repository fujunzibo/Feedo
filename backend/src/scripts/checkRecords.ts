import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecords() {
  try {
    const records = await prisma.txRecord.findMany();
    console.log('Current records:');
    records.forEach(record => {
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
