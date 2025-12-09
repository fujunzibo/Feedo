"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkWallets() {
    try {
        const wallets = await prisma.wallet.findMany();
        console.log('Current wallets:');
        wallets.forEach(wallet => {
            console.log(`- ${wallet.type}: ${wallet.address}`);
        });
        console.log(`Total wallets: ${wallets.length}`);
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
checkWallets();
