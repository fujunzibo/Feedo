"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeMonthlyTransfer = executeMonthlyTransfer;
exports.executeMonthlyTransferWithRetry = executeMonthlyTransferWithRetry;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const clients_1 = require("../solana/clients");
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
const config_1 = require("../config");
const p_retry_1 = __importDefault(require("p-retry"));
const crypto_1 = require("crypto");
const bs58_1 = __importDefault(require("bs58"));
async function executeMonthlyTransfer() {
    const connection = (0, clients_1.getConnection)();
    const signer = (0, clients_1.getSigner)();
    // 创建Keypair用于签名
    if (!config_1.appEnv.localPrivateKey) {
        throw new Error('LOCAL_PRIVATE_KEY not set');
    }
    let secret;
    try {
        secret = bs58_1.default.decode(config_1.appEnv.localPrivateKey);
    }
    catch (e) {
        // 非 base58，尝试 hex（128 字符）
        if (config_1.appEnv.localPrivateKey.length === 128) {
            const hex = config_1.appEnv.localPrivateKey;
            secret = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        }
        else {
            throw new Error(`Invalid private key format. Expected base58 or 128-char hex, got ${config_1.appEnv.localPrivateKey.length} chars`);
        }
    }
    const keypair = secret.length === 32
        ? web3_js_1.Keypair.fromSeed(secret)
        : secret.length === 64
            ? web3_js_1.Keypair.fromSecretKey(secret)
            : (() => { throw new Error(`Invalid secret key size: ${secret.length}. Expected 32 or 64 bytes`); })();
    try {
        logger_1.logger.info('Starting monthly 1% transfer...');
        // 获取金库钱包信息
        const treasuryWallet = await prisma_1.prisma.wallet.findFirst({
            where: { type: 'treasury' }
        });
        if (!treasuryWallet) {
            throw new Error('Treasury wallet not found in database');
        }
        // 获取目标钱包信息
        const targetWallet = await prisma_1.prisma.wallet.findFirst({
            where: { type: 'target' }
        });
        if (!targetWallet) {
            throw new Error('Target wallet not found in database');
        }
        // Devnet mint address
        const mintAddress = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';
        // 获取金库钱包的代币余额
        logger_1.logger.info(`Treasury wallet address: ${treasuryWallet.address}`);
        logger_1.logger.info(`Target wallet address: ${targetWallet.address}`);
        logger_1.logger.info(`Mint address: ${mintAddress}`);
        const treasuryPubkey = new web3_js_1.PublicKey(treasuryWallet.address);
        const treasuryTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(new web3_js_1.PublicKey(mintAddress), treasuryPubkey);
        let accountInfo;
        let mintInfo;
        try {
            accountInfo = await (0, spl_token_1.getAccount)(connection, treasuryTokenAccount);
        }
        catch (error) {
            logger_1.logger.error('Failed to get treasury token account:', error);
            return { success: false, error: 'Treasury token account not found' };
        }
        try {
            mintInfo = await (0, spl_token_1.getMint)(connection, new web3_js_1.PublicKey(mintAddress));
        }
        catch (error) {
            logger_1.logger.error('Failed to get mint info:', error);
            return { success: false, error: 'Failed to get mint info' };
        }
        // 计算 1% 转账数量
        const totalBalance = Number(accountInfo.amount);
        const transferAmount = Math.floor(totalBalance * 0.01); // 1%
        if (transferAmount <= 0) {
            logger_1.logger.warn('Insufficient balance for 1% transfer');
            return { success: false, error: 'Insufficient balance' };
        }
        logger_1.logger.info(`Transferring ${transferAmount} tokens (1% of ${totalBalance})`);
        // 创建转账指令
        const targetPubkey = new web3_js_1.PublicKey(targetWallet.address);
        const targetTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(new web3_js_1.PublicKey(mintAddress), targetPubkey);
        const transferInstruction = (0, spl_token_1.createTransferCheckedInstruction)(treasuryTokenAccount, new web3_js_1.PublicKey(mintAddress), targetTokenAccount, treasuryPubkey, transferAmount, mintInfo.decimals);
        // 构建并发送交易
        const transaction = new web3_js_1.Transaction().add(transferInstruction);
        // 获取最近的 blockhash 并设置 feePayer
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = treasuryPubkey;
        const signature = await connection.sendTransaction(transaction, [keypair]);
        // 等待确认
        await connection.confirmTransaction(signature);
        logger_1.logger.info(`Monthly transfer completed: ${signature}`);
        // 记录到数据库
        await prisma_1.prisma.txRecord.create({
            data: {
                kind: 'monthly_transfer',
                txSig: signature,
                status: 'success',
                amountUi: transferAmount / Math.pow(10, mintInfo.decimals),
                fromAddress: treasuryWallet.address,
                toAddress: targetWallet.address,
                details: JSON.stringify({
                    totalBalance,
                    transferAmount,
                    percentage: 1.0
                })
            }
        });
        return {
            success: true,
            txSignature: signature,
            amount: transferAmount / Math.pow(10, mintInfo.decimals)
        };
    }
    catch (error) {
        logger_1.logger.error('Monthly transfer failed:', error);
        // 记录失败到数据库
        await prisma_1.prisma.txRecord.create({
            data: {
                kind: 'monthly_transfer',
                txSig: `failed_${(0, crypto_1.randomUUID)()}`,
                status: 'failed',
                details: JSON.stringify({ error: error.message })
            }
        });
        return {
            success: false,
            error: error.message
        };
    }
}
async function executeMonthlyTransferWithRetry() {
    return (0, p_retry_1.default)(() => executeMonthlyTransfer(), {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: (error) => {
            logger_1.logger.warn(`Monthly transfer attempt ${error.attemptNumber} failed:`, error.message);
        }
    });
}
