"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAutoDonation = executeAutoDonation;
exports.executeAutoDonationWithRetry = executeAutoDonationWithRetry;
exports.isTransactionProcessed = isTransactionProcessed;
const web3_js_1 = require("@solana/web3.js");
const clients_1 = require("../solana/clients");
const config_1 = require("../config");
const bs58_1 = __importDefault(require("bs58"));
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
const pricing_1 = require("./pricing");
const p_retry_1 = __importDefault(require("p-retry"));
const crypto_1 = require("crypto");
async function executeAutoDonation() {
    const connection = (0, clients_1.getConnection)();
    const signer = (0, clients_1.getSigner)();
    // 创建Keypair用于签名
    if (!config_1.appEnv.localPrivateKey) {
        throw new Error('LOCAL_PRIVATE_KEY not set');
    }
    const secret = bs58_1.default.decode(config_1.appEnv.localPrivateKey);
    const keypair = web3_js_1.Keypair.fromSecretKey(secret);
    try {
        logger_1.logger.info('Starting auto donation...');
        // 获取目标钱包信息
        const targetWallet = await prisma_1.prisma.wallet.findFirst({
            where: { type: 'target' }
        });
        if (!targetWallet) {
            throw new Error('Target wallet not found in database');
        }
        // 获取慈善钱包信息
        const donationWallet = await prisma_1.prisma.wallet.findFirst({
            where: { type: 'donation' }
        });
        if (!donationWallet) {
            throw new Error('Donation wallet not found in database');
        }
        // 获取国库钱包的 SOL 余额
        const treasuryWallet = await prisma_1.prisma.wallet.findFirst({
            where: { type: 'treasury' }
        });
        if (!treasuryWallet) {
            throw new Error('Treasury wallet not found');
        }
        const treasuryPubkey = new web3_js_1.PublicKey(treasuryWallet.address);
        const balance = await connection.getBalance(treasuryPubkey);
        const solBalance = balance / web3_js_1.LAMPORTS_PER_SOL;
        // 使用固定的捐赠金额（0.1 SOL）
        const donationAmount = 0.1; // 0.1 SOL
        if (solBalance < donationAmount + 0.01) { // 保留 0.01 SOL 作为手续费
            logger_1.logger.warn(`Insufficient SOL balance in treasury for donation. Required: ${donationAmount + 0.01}, Available: ${solBalance}`);
            return { success: false, error: 'Insufficient treasury balance' };
        }
        // 获取 SOL 价格
        const solPriceUsd = await (0, pricing_1.getSolPriceUsd)();
        const usdValue = donationAmount * solPriceUsd;
        logger_1.logger.info(`Donating ${donationAmount} SOL ($${usdValue.toFixed(2)}) to charity from treasury`);
        // 创建转账交易
        const donationPubkey = new web3_js_1.PublicKey(donationWallet.address);
        const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
            fromPubkey: treasuryPubkey,
            toPubkey: donationPubkey,
            lamports: Math.floor(donationAmount * web3_js_1.LAMPORTS_PER_SOL)
        }));
        // 获取最近的 blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = treasuryPubkey;
        // 签名并发送交易
        const signature = await connection.sendTransaction(transaction, [keypair]);
        // 等待确认
        await connection.confirmTransaction(signature);
        logger_1.logger.info(`Donation completed: ${signature}`);
        // 记录到数据库
        await prisma_1.prisma.donation.create({
            data: {
                txSig: signature,
                fromAddress: treasuryWallet.address,
                toAddress: donationWallet.address,
                amountSol: donationAmount,
                usdValue,
                note: 'Auto donation from treasury after threshold swap'
            }
        });
        // 记录交易记录
        await prisma_1.prisma.txRecord.create({
            data: {
                kind: 'donation',
                txSig: signature,
                status: 'success',
                amountUi: donationAmount,
                fromAddress: treasuryWallet.address,
                toAddress: donationWallet.address,
                details: JSON.stringify({
                    solAmount: donationAmount,
                    usdValue,
                    method: 'treasury_donation'
                })
            }
        });
        // 更新指标
        await prisma_1.prisma.metric.upsert({
            where: { id: '1' },
            update: {
                lastDonationTimestamp: new Date(),
                cumulativeDonations: { increment: usdValue }
            },
            create: {
                lastDonationTimestamp: new Date(),
                cumulativeDonations: usdValue
            }
        });
        return {
            success: true,
            txSignature: signature,
            amount: donationAmount,
            usdValue
        };
    }
    catch (error) {
        logger_1.logger.error('Auto donation failed:', error);
        // 记录失败到数据库
        await prisma_1.prisma.txRecord.create({
            data: {
                kind: 'donation',
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
async function executeAutoDonationWithRetry() {
    return (0, p_retry_1.default)(() => executeAutoDonation(), {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: (error) => {
            logger_1.logger.warn(`Auto donation attempt ${error.attemptNumber} failed:`, error.message);
        }
    });
}
// 检查是否已经处理过某个交易（防重复）
async function isTransactionProcessed(txSig) {
    const existing = await prisma_1.prisma.txRecord.findFirst({
        where: { txSig }
    });
    return !!existing;
}
