"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWallets = updateWallets;
const prisma_1 = require("../lib/prisma");
async function updateWallets() {
    console.log('Updating wallet addresses...');
    // 删除现有钱包
    await prisma_1.prisma.wallet.deleteMany();
    // 创建新钱包
    await prisma_1.prisma.wallet.create({
        data: {
            name: 'Treasury Wallet',
            address: '6mM3eZ1Ne3XgvZMDvdJr2urcBkqWw8XwD5GecWLbpAzN',
            type: 'treasury'
        }
    });
    await prisma_1.prisma.wallet.create({
        data: {
            name: 'Target Wallet',
            address: '6ringJBRM45z22WZ7z8Pg1Czs6sgbuLbu6U6uuPXFeht',
            type: 'target'
        }
    });
    await prisma_1.prisma.wallet.create({
        data: {
            name: 'Donation Wallet',
            address: 'A8BsT5caNZqaku3ckP2YG7yv8NzJKFg9761zmTmjgij9',
            type: 'donation'
        }
    });
    console.log('✅ Wallet addresses updated successfully!');
    // 显示当前钱包
    const wallets = await prisma_1.prisma.wallet.findMany();
    console.log('Current wallets:');
    wallets.forEach(w => {
        console.log(`- ${w.type}: ${w.address}`);
    });
}
updateWallets().catch((e) => {
    console.error('Update failed:', e);
    process.exit(1);
});
