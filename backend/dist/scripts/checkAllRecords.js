"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
async function checkAllRecords() {
    console.log('Checking all records...');
    try {
        const allRecords = await prisma_1.prisma.txRecord.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        console.log(`Found ${allRecords.length} records:`);
        allRecords.forEach((record, index) => {
            console.log(`\n${index + 1}. ${record.kind} - ${record.txSig} (${record.status})`);
            console.log(`   Created: ${record.createdAt.toISOString()}`);
            if (record.details) {
                try {
                    const details = JSON.parse(record.details);
                    console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
                }
                catch {
                    console.log(`   Details: ${record.details}`);
                }
            }
        });
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
checkAllRecords().catch(console.error);
