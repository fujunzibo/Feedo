import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupDatabase() {
  try {
    console.log('Cleaning up database...');
    
    // 删除所有 TxRecord 记录
    const deletedRecords = await prisma.txRecord.deleteMany({});
    console.log(`Deleted ${deletedRecords.count} TxRecord entries`);
    
    // 删除所有 Donation 记录
    const deletedDonations = await prisma.donation.deleteMany({});
    console.log(`Deleted ${deletedDonations.count} Donation entries`);
    
    // 重置 Metric 记录
    await prisma.metric.deleteMany({});
    await prisma.metric.create({
      data: {
        cumulativeDonations: 0,
      }
    });
    console.log('Reset Metric records');
    
    console.log('Database cleanup completed successfully!');
  } catch (error) {
    console.error('Database cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupDatabase();
