"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkRecords() {
    try {
        const records = await prisma.txRecord.findMany();
        console.log('Current records:');
        records.forEach((record) => {
            console.log(`- ${record.kind}: ${record.txSig} (${record.status})`);
        });
        console.log(`Total records: ${records.length}`);
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
checkRecords();
