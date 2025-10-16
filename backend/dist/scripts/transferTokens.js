"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferTokens = transferTokens;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bs58_1 = __importDefault(require("bs58"));
async function transferTokens() {
    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const mintStr = process.env.MINT_ADDRESS || '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';
    const fromWallet = process.env.TREASURY_WALLET || '6mM3eZ1Ne3XgvZMDvdJr2urcBkqWw8XwD5GecWLbpAzN';
    const toWallet = process.env.TARGET_WALLET || '6ringJBRM45z22WZ7z8Pg1Czs6sgbuLbu6U6uuPXFeht';
    const amount = process.env.TRANSFER_AMOUNT || '6000000'; // 6,000 tokens (6 decimals)
    const payerSecret = process.env.LOCAL_PRIVATE_KEY;
    if (!payerSecret)
        throw new Error('LOCAL_PRIVATE_KEY not set');
    const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
    const payer = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(payerSecret));
    const mint = new web3_js_1.PublicKey(mintStr);
    const fromPubkey = new web3_js_1.PublicKey(fromWallet);
    const toPubkey = new web3_js_1.PublicKey(toWallet);
    console.log('Transferring tokens...');
    console.log('From:', fromWallet);
    console.log('To:', toWallet);
    console.log('Amount:', amount, 'tokens');
    // Get mint info
    const mintInfo = await (0, spl_token_1.getMint)(connection, mint);
    console.log('Mint decimals:', mintInfo.decimals);
    // Get associated token addresses
    const fromTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mint, fromPubkey);
    const toTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(mint, toPubkey);
    console.log('From ATA:', fromTokenAccount.toBase58());
    console.log('To ATA:', toTokenAccount.toBase58());
    // Create transfer instruction
    const transferAmount = BigInt(amount);
    const transferInstruction = (0, spl_token_1.createTransferCheckedInstruction)(fromTokenAccount, mint, toTokenAccount, fromPubkey, transferAmount, mintInfo.decimals);
    // Build and send transaction
    const transaction = new web3_js_1.Transaction().add(transferInstruction);
    const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [payer]);
    console.log('✅ Transfer completed!');
    console.log('Transaction signature:', signature);
    console.log(`Transferred ${Number(amount) / Math.pow(10, mintInfo.decimals)} tokens`);
}
transferTokens().catch((e) => {
    console.error('Transfer failed:', e);
    process.exit(1);
});
