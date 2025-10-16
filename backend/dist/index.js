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
const app = (0, express_1.default)();
app.use(express_1.default.json());
// 允许前端跨域访问（简易 CORS）
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS')
        return res.sendStatus(204);
    next();
});
// 健康检查
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
// 获取仪表板数据
app.get('/api/dashboard', async (_req, res) => {
    try {
        const donations = await prisma_1.prisma.donation.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        const metrics = await prisma_1.prisma.metric.findFirst();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDonations = await prisma_1.prisma.donation.findMany({
            where: {
                createdAt: {
                    gte: today
                }
            }
        });
        const todayTotal = todayDonations.reduce((sum, d) => sum + d.usdValue, 0);
        res.json({
            todayDonations: todayTotal,
            recentTransactions: donations,
            lastDonationTime: metrics?.lastDonationTimestamp,
            lastSwapTime: metrics?.lastSwapTimestamp,
            cumulativeDonations: metrics?.cumulativeDonations || 0
        });
    }
    catch (error) {
        logger_1.logger.error('Dashboard API error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// 导出捐赠数据为 CSV
app.get('/api/export/donations.csv', async (_req, res) => {
    try {
        const donations = await prisma_1.prisma.donation.findMany({
            orderBy: { createdAt: 'desc' }
        });
        const csv = [
            'Date,Transaction Hash,From,To,Amount (SOL),USD Value,Note',
            ...donations.map(d => `${d.createdAt.toISOString()},${d.txSig},${d.fromAddress},${d.toAddress},${d.amountSol},${d.usdValue},"${d.note || ''}"`)
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="donations.csv"');
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
            return res.status(400).json({ ok: false, step: 'swap', error: swapResult.error });
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
    const result = await (0, monthlyTransfer_1.executeMonthlyTransferWithRetry)();
    if (result.success) {
        logger_1.logger.info(`Monthly transfer completed: ${result.txSignature}`);
    }
    else {
        logger_1.logger.error(`Monthly transfer failed: ${result.error}`);
    }
});
// 阈值检查和换币任务
(0, scheduler_1.scheduleThresholdSwap)(async () => {
    logger_1.logger.info('Checking threshold and executing swap...');
    const swapResult = await (0, thresholdSwap_1.checkThresholdAndSwapWithRetry)();
    if (swapResult.success) {
        logger_1.logger.info(`Swap completed: ${swapResult.txSignature}`);
        // 换币成功后立即执行捐赠
        logger_1.logger.info('Executing auto donation...');
        const donationResult = await (0, autoDonation_1.executeAutoDonationWithRetry)();
        if (donationResult.success) {
            logger_1.logger.info(`Donation completed: ${donationResult.txSignature}`);
        }
        else {
            logger_1.logger.error(`Donation failed: ${donationResult.error}`);
        }
    }
    else if (swapResult.error !== 'Below threshold') {
        logger_1.logger.error(`Swap failed: ${swapResult.error}`);
    }
});
// 启动服务器
app.listen(config_1.appEnv.port, () => {
    logger_1.logger.info(`Feedo Fund Backend listening on :${config_1.appEnv.port}`);
    logger_1.logger.info('Scheduled jobs:');
    logger_1.logger.info('- Monthly 1% transfer: 1st of every month at 00:00 UTC');
    logger_1.logger.info('- Threshold swap check: Every 5 minutes');
});
