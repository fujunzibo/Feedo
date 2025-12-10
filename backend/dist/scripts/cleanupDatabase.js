"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
async function cleanupDatabase() {
    console.log('Cleaning up database...');
    try {
        // 删除所有失败记录（空字符串或重复的）
        const deleted = await prisma_1.prisma.txRecord.deleteMany({
            where: {
                OR: [
                    { txSig: '' },
                    { txSig: { startsWith: 'failed_' } }
                ]
            }
        });
        console.log(`Deleted ${deleted.count} failed records`);
        // 显示当前记录
        const records = await prisma_1.prisma.txRecord.findMany();
        console.log('Current records:');
        records.forEach(r => {
            console.log(`- ${r.kind}: ${r.txSig} (${r.status})`);
        });
        console.log('✅ Database cleanup completed!');
    }
    catch (error) {
        console.error('Cleanup failed:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
cleanupDatabase().catch(console.error);
