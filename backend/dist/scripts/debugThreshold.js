"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const prisma_1 = require("../lib/prisma");
async function debugThreshold() {
    const rpcUrl = process.env.RPC_URL || 'https://devnet.helius-rpc.com/?api-key=97921435-08fe-45ec-bd0c-815044268d06';
    const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
    const MINT_ADDRESS = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';
    const THRESHOLD_USD = 50;
    console.log(`Debugging threshold calculation...`);
    console.log(`RPC URL: ${rpcUrl}`);
    console.log(`Mint: ${MINT_ADDRESS}`);
    console.log(`Threshold: $${THRESHOLD_USD}`);
    try {
        // 获取目标钱包
        const targetWallet = await prisma_1.prisma.wallet.findFirst({
            where: { type: 'target' }
        });
        if (!targetWallet) {
            console.log('❌ Target wallet not found');
            return;
        }
        console.log(`\nTarget wallet: ${targetWallet.address}`);
        // 获取代币账户
        const targetPubkey = new web3_js_1.PublicKey(targetWallet.address);
        const targetTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(new web3_js_1.PublicKey(MINT_ADDRESS), targetPubkey);
        console.log(`Token account: ${targetTokenAccount.toString()}`);
        // 获取账户信息
        const accountInfo = await (0, spl_token_1.getAccount)(connection, targetTokenAccount);
        const mintInfo = await (0, spl_token_1.getMint)(connection, new web3_js_1.PublicKey(MINT_ADDRESS));
        console.log(`\nAccount info:`);
        console.log(`- Raw amount: ${accountInfo.amount.toString()}`);
        console.log(`- Mint decimals: ${mintInfo.decimals}`);
        // 计算代币余额
        const tokenBalance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
        console.log(`- Token balance: ${tokenBalance} tokens`);
        // 获取代币价格
        const tokenPriceUsd = 0.01; // 使用占位价格
        console.log(`- Token price: $${tokenPriceUsd}`);
        // 计算 USD 价值
        const usdValue = tokenBalance * tokenPriceUsd;
        console.log(`- USD value: $${usdValue.toFixed(6)}`);
        // 检查阈值
        console.log(`\nThreshold check:`);
        console.log(`- Required: $${THRESHOLD_USD}`);
        console.log(`- Current: $${usdValue.toFixed(6)}`);
        console.log(`- Above threshold: ${usdValue >= THRESHOLD_USD ? '✅ YES' : '❌ NO'}`);
        if (usdValue < THRESHOLD_USD) {
            const needed = THRESHOLD_USD - usdValue;
            const neededTokens = needed / tokenPriceUsd;
            console.log(`- Need additional: $${needed.toFixed(6)} (${neededTokens.toFixed(0)} tokens)`);
        }
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
debugThreshold().catch(console.error);
