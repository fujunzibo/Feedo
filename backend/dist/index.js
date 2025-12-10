"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const scheduler_1 = require("./jobs/scheduler");
const logger_1 = require("./lib/logger");
const monthlyTransfer_1 = require("./services/monthlyTransfer");
const thresholdSwap_1 = require("./services/thresholdSwap");
const autoDonation_1 = require("./services/autoDonation");
const prisma_1 = require("./lib/prisma");
const cors_1 = __importDefault(require("cors"));
const web3_js_1 = require("@solana/web3.js");
// @ts-ignore - @solana/spl-token 0.1.8 types are incomplete, but functions exist at runtime
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
const spl_token_1 = require("@solana/spl-token");
const clients_1 = require("./solana/clients");
const pricing_1 = require("./services/pricing");
const realSwap_1 = require("./services/realSwap");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)({ origin: 'http://localhost:3000' }));
// Health check route
app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// 添加简单的内存缓存
let walletAssetsCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30秒缓存
// Wallet assets route
app.get('/api/wallet-assets', async (req, res) => {
    try {
        // 检查缓存
        const now = Date.now();
        if (walletAssetsCache && (now - cacheTimestamp) < CACHE_DURATION) {
            return res.json({
                success: true,
                wallets: walletAssetsCache,
                timestamp: new Date().toISOString(),
                cached: true
            });
        }
        const wallets = await prisma_1.prisma.wallet.findMany();
        const connection = (0, clients_1.getConnection)();
        const mintAddress = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK'; // FEEDO token
        // 并行获取SOL价格，避免重复请求
        const solPricePromise = (0, pricing_1.getSolPriceUsd)();
        const tokenPriceUsd = 0.001; // FEEDO代币固定价格
        const walletAssets = await Promise.all(wallets.map(async (wallet) => {
            try {
                const pubkey = new web3_js_1.PublicKey(wallet.address);
                // 获取 SOL 余额
                const solBalance = await connection.getBalance(pubkey);
                const solBalanceFormatted = solBalance / 1000000000; // Convert lamports to SOL
                // 获取代币余额
                let tokenBalance = 0;
                let tokenBalanceFormatted = 0;
                try {
                    const tokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(new web3_js_1.PublicKey(mintAddress), pubkey);
                    const accountInfo = await (0, spl_token_1.getAccount)(connection, tokenAccount);
                    const mintInfo = await (0, spl_token_1.getMint)(connection, new web3_js_1.PublicKey(mintAddress));
                    tokenBalance = Number(accountInfo.amount);
                    tokenBalanceFormatted = tokenBalance / Math.pow(10, mintInfo.decimals);
                }
                catch (error) {
                    // Token account doesn't exist or other error
                    tokenBalance = 0;
                    tokenBalanceFormatted = 0;
                }
                // 等待SOL价格
                const solPriceUsd = await solPricePromise;
                return {
                    id: wallet.id,
                    name: wallet.name,
                    type: wallet.type,
                    address: wallet.address,
                    solBalance: solBalanceFormatted,
                    solBalanceUsd: solBalanceFormatted * solPriceUsd,
                    tokenBalance: tokenBalanceFormatted,
                    tokenBalanceUsd: tokenBalanceFormatted * tokenPriceUsd,
                    totalUsd: (solBalanceFormatted * solPriceUsd) + (tokenBalanceFormatted * tokenPriceUsd)
                };
            }
            catch (error) {
                logger_1.logger.error(`Error fetching assets for wallet ${wallet.address}:`, error);
                return {
                    id: wallet.id,
                    name: wallet.name,
                    type: wallet.type,
                    address: wallet.address,
                    solBalance: 0,
                    solBalanceUsd: 0,
                    tokenBalance: 0,
                    tokenBalanceUsd: 0,
                    totalUsd: 0,
                    error: 'Failed to fetch balance'
                };
            }
        }));
        // 更新缓存
        walletAssetsCache = walletAssets;
        cacheTimestamp = now;
        res.json({
            success: true,
            wallets: walletAssets,
            timestamp: new Date().toISOString(),
            cached: false
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to fetch wallet assets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch wallet assets'
        });
    }
});
// Dashboard data route
app.get('/api/dashboard', async (req, res) => {
    try {
        const wallets = await prisma_1.prisma.wallet.findMany();
        // 支持分页参数
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 500; // 默认显示500条记录
        const skip = (page - 1) * limit;
        const txRecords = await prisma_1.prisma.txRecord.findMany({
            orderBy: { createdAt: 'desc' },
            skip: skip,
            take: limit,
        });
        // 获取总记录数用于分页
        const totalRecords = await prisma_1.prisma.txRecord.count();
        const metrics = await prisma_1.prisma.metric.findFirst();
        res.json({
            wallets,
            txRecords,
            metrics,
            pagination: {
                page,
                limit,
                total: totalRecords,
                totalPages: Math.ceil(totalRecords / limit)
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to fetch dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});
// CSV export route
app.get('/api/export-csv', async (_req, res) => {
    try {
        const txRecords = await prisma_1.prisma.txRecord.findMany({
            orderBy: { createdAt: 'desc' },
        });
        let csv = 'kind,txSig,status,amountUi,fromAddress,toAddress,createdAt,details\n';
        txRecords.forEach((record) => {
            csv += `${record.kind},${record.txSig},${record.status},${record.amountUi},${record.fromAddress},${record.toAddress},${record.createdAt.toISOString()},"${JSON.stringify(record.details)}"\n`;
        });
        res.header('Content-Type', 'text/csv');
        res.attachment('transactions.csv');
        res.send(csv);
    }
    catch (error) {
        logger_1.logger.error('CSV export error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
});
// 调试路由：手动触发 阈值换币 + 自动捐赠
app.post('/api/debug/trigger-swap-donate', async (_req, res) => {
    try {
        logger_1.logger.info('[debug] Manual trigger: threshold swap + donation');
        const swapResult = await (0, thresholdSwap_1.checkThresholdAndSwap)();
        if (!swapResult.success) {
            const msg = swapResult.error && String(swapResult.error).trim().length > 0
                ? swapResult.error
                : 'Unknown swap error. Please check backend logs for details.';
            logger_1.logger.warn(`[debug] swap step failed: ${msg}`);
            return res.status(400).json({ ok: false, step: 'swap', error: msg });
        }
        const donationResult = await (0, autoDonation_1.executeAutoDonationWithRetry)();
        if (!donationResult.success) {
            return res.status(400).json({ ok: false, step: 'donation', error: donationResult.error, swapTx: swapResult.txSignature });
        }
        return res.json({ ok: true, swapTx: swapResult.txSignature, donationTx: donationResult.txSignature });
    }
    catch (error) {
        logger_1.logger.error('[debug] trigger-swap-donate failed', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});
// 调试路由：手动触发完整流程（1%转账 + 阈值换币 + 自动捐赠）
app.post('/api/debug/trigger-full-workflow', async (_req, res) => {
    try {
        logger_1.logger.info('[debug] Manual trigger: full workflow (1% transfer + threshold swap + donation)');
        // 步骤1：1%转账
        logger_1.logger.info('[debug] Step 1: Monthly 1% transfer');
        const transferResult = await (0, monthlyTransfer_1.executeMonthlyTransferWithRetry)();
        if (!transferResult.success) {
            return res.status(400).json({ ok: false, step: 'transfer', error: transferResult.error });
        }
        // 步骤2：阈值换币
        logger_1.logger.info('[debug] Step 2: Threshold swap');
        const swapResult = await (0, thresholdSwap_1.checkThresholdAndSwap)();
        if (!swapResult.success) {
            return res.status(400).json({ ok: false, step: 'swap', error: swapResult.error, transferTx: transferResult.txSignature });
        }
        // 步骤3：自动捐赠
        logger_1.logger.info('[debug] Step 3: Auto donation');
        const donationResult = await (0, autoDonation_1.executeAutoDonationWithRetry)();
        if (!donationResult.success) {
            return res.status(400).json({ ok: false, step: 'donation', error: donationResult.error, transferTx: transferResult.txSignature, swapTx: swapResult.txSignature });
        }
        return res.json({
            ok: true,
            transferTx: transferResult.txSignature,
            swapTx: swapResult.txSignature,
            donationTx: donationResult.txSignature
        });
    }
    catch (error) {
        logger_1.logger.error('[debug] trigger-full-workflow failed', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});
// 月度转账任务
(0, scheduler_1.scheduleMonthlyTransfer)(async () => {
    logger_1.logger.info('Executing monthly 1% transfer...');
    await (0, monthlyTransfer_1.executeMonthlyTransferWithRetry)();
});
// 阈值换币任务
(0, scheduler_1.scheduleThresholdSwap)(async () => {
    logger_1.logger.info('Executing threshold swap...');
    await (0, thresholdSwap_1.checkThresholdAndSwapWithRetry)();
});
// Exchange swap route
app.post('/api/exchange/swap', async (req, res) => {
    try {
        const { fromToken, toToken, amount, slippage, fromWalletId, toWalletId } = req.body;
        if (config_1.appEnv.demoMode) {
            return res.json({
                success: true,
                message: '演示模式：需要配置签名者才能执行真实交易。当前为演示环境。',
                demo: true
            });
        }
        // 执行真实的代币兑换
        const swapResult = await realSwap_1.realSwapService.executeSwap({
            fromWalletId,
            toWalletId,
            fromToken,
            toToken,
            amount,
            slippage
        });
        res.json(swapResult);
    }
    catch (error) {
        logger_1.logger.error('Exchange swap failed:', error);
        res.status(500).json({ error: 'Exchange swap failed' });
    }
});
// Real swap execution route
app.post('/api/swap/execute', async (req, res) => {
    try {
        const { fromWalletId, toWalletId, fromToken, toToken, amount, slippage } = req.body;
        if (!fromWalletId || !toWalletId || !fromToken || !toToken || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }
        const swapResult = await realSwap_1.realSwapService.executeSwap({
            fromWalletId,
            toWalletId,
            fromToken,
            toToken,
            amount,
            slippage
        });
        res.json(swapResult);
    }
    catch (error) {
        logger_1.logger.error('Real swap execution failed:', error);
        res.status(500).json({
            success: false,
            error: 'Swap execution failed'
        });
    }
});
// Get swap rate
app.get('/api/swap/rate', async (req, res) => {
    try {
        const { fromToken, toToken } = req.query;
        if (!fromToken || !toToken) {
            return res.status(400).json({
                success: false,
                error: 'Missing fromToken or toToken parameter'
            });
        }
        const rate = await realSwap_1.realSwapService.getSwapRate(fromToken, toToken);
        res.json({
            success: true,
            rate,
            fromToken,
            toToken
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get swap rate:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get swap rate'
        });
    }
});
// Get wallet token balance
app.get('/api/wallet/:walletId/balance/:token', async (req, res) => {
    try {
        const { walletId, token } = req.params;
        if (!walletId || !token) {
            return res.status(400).json({
                success: false,
                error: 'Missing walletId or token parameter'
            });
        }
        const balance = await realSwap_1.realSwapService.getWalletTokenBalance(walletId, token);
        res.json({
            success: true,
            balance,
            token,
            walletId
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get wallet token balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get wallet token balance'
        });
    }
});
const server = app.listen(config_1.appEnv.port, () => {
    logger_1.logger.info(`Feedo Fund Backend listening on :${config_1.appEnv.port}`);
    logger_1.logger.info('Scheduled jobs:');
    logger_1.logger.info('- Monthly 1% transfer: 1st of every month at 00:00 UTC');
    logger_1.logger.info('- Threshold swap check: Every 5 minutes');
});
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger_1.logger.info('HTTP server closed');
        process.exit(0);
    });
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', error);
    process.exit(1);
});
