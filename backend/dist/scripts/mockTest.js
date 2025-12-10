"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
async function mockTest() {
    console.log('Running mock test for swap+donation flow...');
    try {
        // 模拟成功的换币交易
        const mockSwapTx = await prisma_1.prisma.txRecord.create({
            data: {
                kind: 'swap',
                txSig: `mock_swap_${Date.now()}`,
                status: 'success',
                details: JSON.stringify({
                    inputAmount: '5000000000', // 5000 tokens (6 decimals)
                    outputAmount: '0.5', // 0.5 SOL
                    inputMint: '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK',
                    outputMint: 'So11111111111111111111111111111111111111112'
                })
            }
        });
        console.log('✅ Mock swap transaction created:', mockSwapTx.txSig);
        // 模拟成功的捐赠交易
        const mockDonationTx = await prisma_1.prisma.txRecord.create({
            data: {
                kind: 'donation',
                txSig: `mock_donation_${Date.now()}`,
                status: 'success',
                details: JSON.stringify({
                    amount: '0.5', // 0.5 SOL
                    recipient: 'A8BsT5caNZqaku3ckP2YG7yv8NzJKFg9761zmTmjgij9'
                })
            }
        });
        console.log('✅ Mock donation transaction created:', mockDonationTx.txSig);
        // 显示所有记录
        const records = await prisma_1.prisma.txRecord.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log('\nRecent transactions:');
        records.forEach(r => {
            console.log(`- ${r.kind}: ${r.txSig} (${r.status})`);
        });
        console.log('\n✅ Mock test completed successfully!');
    }
    catch (error) {
        console.error('❌ Mock test failed:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
mockTest().catch(console.error);
