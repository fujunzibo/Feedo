"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const clients_1 = require("../solana/clients");
const prisma_1 = require("../lib/prisma");
async function createTokenAccountsHelius() {
    const MINT_ADDRESS = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';
    console.log(`Creating token accounts for mint: ${MINT_ADDRESS}`);
    console.log(`Using Helius RPC: ${process.env.RPC_URL}`);
    try {
        const connection = (0, clients_1.getConnection)();
        const signer = (0, clients_1.getSigner)();
        console.log(`Signer public key: ${signer.getPublicKeyBase58()}`);
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
                    const existingAccount = await (0, spl_token_1.getAccount)(connection, tokenAccount);
                    console.log(`✅ Token account already exists:`, {
                        mint: existingAccount.mint.toString(),
                        owner: existingAccount.owner.toString(),
                        amount: existingAccount.amount.toString()
                    });
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
                // 获取最近的 blockhash
                const { blockhash } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = new web3_js_1.PublicKey(signer.getPublicKeyBase58());
                console.log('Sending transaction...');
                const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [signer]);
                console.log(`✅ Token account created: ${signature}`);
                // 验证创建成功
                const newAccount = await (0, spl_token_1.getAccount)(connection, tokenAccount);
                console.log(`✅ Verification successful:`, {
                    mint: newAccount.mint.toString(),
                    owner: newAccount.owner.toString(),
                    amount: newAccount.amount.toString()
                });
            }
            catch (error) {
                console.log(`❌ Error creating token account for ${wallet.address}:`, error.message);
                // 如果是 StructError，提供更详细的错误信息
                if (error.message.includes('StructError')) {
                    console.log('This is likely an RPC issue. Please check:');
                    console.log('1. RPC URL is correct and accessible');
                    console.log('2. API key is valid');
                    console.log('3. Network connectivity');
                }
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
createTokenAccountsHelius().catch(console.error);
