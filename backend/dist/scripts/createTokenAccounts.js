"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const clients_1 = require("../solana/clients");
const prisma_1 = require("../lib/prisma");
async function createTokenAccounts() {
    const MINT_ADDRESS = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';
    console.log(`Creating token accounts for mint: ${MINT_ADDRESS}`);
    try {
        const connection = (0, clients_1.getConnection)();
        const signer = (0, clients_1.getSigner)();
        // 获取所有钱包
        const wallets = await prisma_1.prisma.wallet.findMany();
        for (const wallet of wallets) {
            console.log(`\n--- Creating token account for ${wallet.type} wallet: ${wallet.address} ---`);
            try {
                const walletPubkey = new web3_js_1.PublicKey(wallet.address);
                const tokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(new web3_js_1.PublicKey(MINT_ADDRESS), walletPubkey);
                console.log(`Token account address: ${tokenAccount.toString()}`);
                // 检查代币账户是否已存在
                try {
                    await (0, spl_token_1.getAccount)(connection, tokenAccount);
                    console.log(`✅ Token account already exists`);
                    continue;
                }
                catch (error) {
                    console.log(`Token account does not exist, creating...`);
                }
                // 创建代币账户
                const transaction = new web3_js_1.Transaction().add((0, spl_token_1.createAssociatedTokenAccountInstruction)(new web3_js_1.PublicKey(signer.getPublicKeyBase58()), // payer
                tokenAccount, // associated token account
                walletPubkey, // owner
                new web3_js_1.PublicKey(MINT_ADDRESS) // mint
                ));
                const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [signer]);
                console.log(`✅ Token account created: ${signature}`);
            }
            catch (error) {
                console.log(`❌ Error creating token account for ${wallet.address}:`, error.message);
            }
        }
        console.log('\n✅ Token account creation completed!');
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
createTokenAccounts().catch(console.error);
