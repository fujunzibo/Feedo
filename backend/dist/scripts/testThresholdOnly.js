"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const prisma_1 = require("../lib/prisma");
async function testThresholdOnly() {
    const rpcUrl = process.env.RPC_URL || 'https://devnet.helius-rpc.com/?api-key=97921435-08fe-45ec-bd0c-815044268d06';
    const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
    const MINT_ADDRESS = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';
    const THRESHOLD_USD = 50;
    console.log(`Testing threshold check only...`);
    try {
        // 获取目标钱包
        const targetWallet = await prisma_1.prisma.wallet.findFirst({
            where: { type: 'target' }
        });
        if (!targetWallet) {
            console.log('❌ Target wallet not found');
            return;
        }
        console.log(`Target wallet: ${targetWallet.address}`);
        // 获取代币账户
        const targetPubkey = new web3_js_1.PublicKey(targetWallet.address);
        const targetTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(new web3_js_1.PublicKey(MINT_ADDRESS), targetPubkey);
        // 获取账户信息
        const accountInfo = await (0, spl_token_1.getAccount)(connection, targetTokenAccount);
        const mintInfo = await (0, spl_token_1.getMint)(connection, new web3_js_1.PublicKey(MINT_ADDRESS));
        // 计算代币余额
        const tokenBalance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
        const tokenPriceUsd = 0.01; // 占位价格
        const usdValue = tokenBalance * tokenPriceUsd;
        console.log(`\nCurrent status:`);
        console.log(`- Token balance: ${tokenBalance} tokens`);
        console.log(`- USD value: $${usdValue.toFixed(6)}`);
        console.log(`- Threshold: $${THRESHOLD_USD}`);
        console.log(`- Above threshold: ${usdValue >= THRESHOLD_USD ? '✅ YES' : '❌ NO'}`);
        if (usdValue >= THRESHOLD_USD) {
            console.log('\n✅ Threshold check passed! Ready for swap.');
        }
        else {
            console.log('\n❌ Threshold check failed. Need more tokens.');
        }
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
testThresholdOnly().catch(console.error);
