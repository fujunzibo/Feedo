"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
async function checkFailedRecords() {
    console.log('Checking failed records...');
    try {
        const failedRecords = await prisma_1.prisma.txRecord.findMany({
            where: { status: 'failed' },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log(`Found ${failedRecords.length} failed records:`);
        failedRecords.forEach((record, index) => {
            console.log(`\n${index + 1}. ${record.kind} - ${record.txSig}`);
            console.log(`   Created: ${record.createdAt.toISOString()}`);
            console.log(`   Details: ${record.details}`);
        });
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
checkFailedRecords().catch(console.error);
