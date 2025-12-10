"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const prisma_1 = require("../lib/prisma");
async function checkTokenAccount() {
    const rpcUrl = process.env.RPC_URL || 'https://rpc.ankr.com/solana_devnet';
    const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
    const MINT_ADDRESS = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';
    console.log(`Checking token accounts for mint: ${MINT_ADDRESS}`);
    console.log(`RPC URL: ${rpcUrl}`);
    try {
        // 获取所有钱包
        const wallets = await prisma_1.prisma.wallet.findMany();
        for (const wallet of wallets) {
            console.log(`\n--- Checking ${wallet.type} wallet: ${wallet.address} ---`);
            try {
                const walletPubkey = new web3_js_1.PublicKey(wallet.address);
                const tokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(new web3_js_1.PublicKey(MINT_ADDRESS), walletPubkey);
                console.log(`Token account address: ${tokenAccount.toString()}`);
                // 检查代币账户是否存在
                try {
                    const accountInfo = await (0, spl_token_1.getAccount)(connection, tokenAccount);
                    console.log(`✅ Token account exists:`, {
                        mint: accountInfo.mint.toString(),
                        owner: accountInfo.owner.toString(),
                        amount: accountInfo.amount.toString(),
                        // state: accountInfo.state // Removed as it doesn't exist in current API
                    });
                }
                catch (error) {
                    console.log(`❌ Token account does not exist or invalid:`, error.message);
                    // 检查基础账户是否存在
                    try {
                        const baseAccount = await connection.getAccountInfo(tokenAccount);
                        if (baseAccount) {
                            console.log(`Base account exists but not a valid token account`);
                        }
                        else {
                            console.log(`Base account does not exist`);
                        }
                    }
                    catch (baseError) {
                        console.log(`Base account check failed:`, baseError.message);
                    }
                }
            }
            catch (error) {
                console.log(`❌ Error checking wallet ${wallet.address}:`, error.message);
            }
        }
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
checkTokenAccount().catch(console.error);
