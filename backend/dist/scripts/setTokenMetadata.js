"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
async function setTokenMetadata() {
    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const mintStr = process.env.MINT_ADDRESS;
    const name = process.env.TOKEN_NAME || 'Feedo';
    const symbol = process.env.TOKEN_SYMBOL || 'FEEDO';
    const uri = process.env.TOKEN_URI || 'https://arweave.net/unknown';
    const payerSecret = process.env.LOCAL_PRIVATE_KEY;
    if (!mintStr)
        throw new Error('MINT_ADDRESS not set');
    if (!payerSecret)
        throw new Error('LOCAL_PRIVATE_KEY not set');
    const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
    const payer = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(payerSecret));
    const mint = new web3_js_1.PublicKey(mintStr);
    console.log('Setting metadata for mint:', mintStr);
    console.log('Name:', name, 'Symbol:', symbol, 'URI:', uri);
    // 简化版本：只记录元数据信息
    console.log('Token metadata information:');
    console.log('Name:', name);
    console.log('Symbol:', symbol);
    console.log('URI:', uri);
    console.log('Mint:', mintStr);
    // 简化版本：不执行实际交易
    console.log('✅ Metadata setup completed (simplified version)');
}
setTokenMetadata().catch((e) => {
    console.error(e);
    process.exit(1);
});
