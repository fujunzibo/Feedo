"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSigner = getSigner;
const bs58_1 = __importDefault(require("bs58"));
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("../config");
class LocalKeypairSigner {
    constructor(secretBase58) {
        let secret;
        try {
            // 尝试 base58 解码
            secret = bs58_1.default.decode(secretBase58);
        }
        catch (error) {
            // 如果不是 base58，尝试作为十六进制字符串
            if (secretBase58.length === 128) {
                const hex = secretBase58;
                secret = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            }
            else {
                throw new Error(`Invalid private key format. Expected base58 or 128-char hex, got ${secretBase58.length} chars`);
            }
        }
        // 处理不同长度的私钥
        if (secret.length === 32) {
            // 32 字节私钥，需要扩展为 64 字节（私钥 + 公钥）
            const keypair = web3_js_1.Keypair.fromSeed(secret);
            this.keypair = keypair;
        }
        else if (secret.length === 64) {
            // 64 字节私钥（私钥 + 公钥）
            this.keypair = web3_js_1.Keypair.fromSecretKey(secret);
        }
        else {
            throw new Error(`Invalid secret key size: ${secret.length}. Expected 32 or 64 bytes`);
        }
    }
    async sign(transaction) {
        // 确保交易有最近的 blockhash
        if (!transaction.recentBlockhash) {
            throw new Error('Transaction missing recent blockhash');
        }
        // 确保交易有feePayer
        if (!transaction.feePayer) {
            transaction.feePayer = this.keypair.publicKey;
        }
        transaction.partialSign(this.keypair);
        return transaction;
    }
    getPublicKeyBase58() {
        return this.keypair.publicKey.toBase58();
    }
}
function getSigner() {
    if (config_1.appEnv.localPrivateKey) {
        return new LocalKeypairSigner(config_1.appEnv.localPrivateKey);
    }
    throw new Error('HSM signer not implemented in this scaffold');
}
