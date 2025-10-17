import express from 'express';
import { appEnv } from './config';
import { scheduleMonthlyTransfer, scheduleThresholdSwap } from './jobs/scheduler';
import { logger } from './lib/logger';
import { executeMonthlyTransferWithRetry } from './services/monthlyTransfer';
import { checkThresholdAndSwap, checkThresholdAndSwapWithRetry } from './services/thresholdSwap';
import { executeAutoDonationWithRetry } from './services/autoDonation';
import { prisma } from './lib/prisma';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

// Health check route
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard data route
app.get('/api/dashboard', async (_req, res) => {
  try {
    const wallets = await prisma.wallet.findMany();
    const txRecords = await prisma.txRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const metrics = await prisma.metric.findFirst();

    res.json({
      wallets,
      txRecords,
      metrics,
    });
  } catch (error) {
    logger.error('Failed to fetch dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// CSV export route
app.get('/api/export-csv', async (_req, res) => {
  try {
    const txRecords = await prisma.txRecord.findMany({
      orderBy: { createdAt: 'desc' },
    });

    let csv = 'kind,txSig,status,amountUi,fromAddress,toAddress,createdAt,details\n';
    txRecords.forEach(record => {
      csv += `${record.kind},${record.txSig},${record.status},${record.amountUi},${record.fromAddress},${record.toAddress},${record.createdAt.toISOString()},"${JSON.stringify(record.details)}"\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('transactions.csv');
    res.send(csv);
  } catch (error) {
    logger.error('CSV export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// 调试路由：手动触发 阈值换币 + 自动捐赠
app.post('/api/debug/trigger-swap-donate', async (_req, res) => {
  try {
    logger.info('[debug] Manual trigger: threshold swap + donation');
    const swapResult = await checkThresholdAndSwap();
    if (!swapResult.success) {
      const msg = swapResult.error && String(swapResult.error).trim().length > 0
        ? swapResult.error
        : 'Unknown swap error. Please check backend logs for details.';
      logger.warn(`[debug] swap step failed: ${msg}`);
      return res.status(400).json({ ok: false, step: 'swap', error: msg });
    }
    const donationResult = await executeAutoDonationWithRetry();
    if (!donationResult.success) {
      return res.status(400).json({ ok: false, step: 'donation', error: donationResult.error, swapTx: swapResult.txSignature });
    }
    return res.json({ ok: true, swapTx: swapResult.txSignature, donationTx: donationResult.txSignature });
  } catch (error) {
    logger.error('[debug] trigger-swap-donate failed', error);
    return res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

// 调试路由：手动触发完整流程（1%转账 + 阈值换币 + 自动捐赠）
app.post('/api/debug/trigger-full-workflow', async (_req, res) => {
  try {
    logger.info('[debug] Manual trigger: full workflow (1% transfer + threshold swap + donation)');
    
    // 步骤1：1%转账
    logger.info('[debug] Step 1: Monthly 1% transfer');
    const transferResult = await executeMonthlyTransferWithRetry();
    if (!transferResult.success) {
      return res.status(400).json({ ok: false, step: 'transfer', error: transferResult.error });
    }
    
    // 步骤2：阈值换币
    logger.info('[debug] Step 2: Threshold swap');
    const swapResult = await checkThresholdAndSwap();
    if (!swapResult.success) {
      return res.status(400).json({ ok: false, step: 'swap', error: swapResult.error, transferTx: transferResult.txSignature });
    }
    
    // 步骤3：自动捐赠
    logger.info('[debug] Step 3: Auto donation');
    const donationResult = await executeAutoDonationWithRetry();
    if (!donationResult.success) {
      return res.status(400).json({ ok: false, step: 'donation', error: donationResult.error, transferTx: transferResult.txSignature, swapTx: swapResult.txSignature });
    }
    
    return res.json({ 
      ok: true, 
      transferTx: transferResult.txSignature, 
      swapTx: swapResult.txSignature, 
      donationTx: donationResult.txSignature 
    });
  } catch (error) {
    logger.error('[debug] trigger-full-workflow failed', error);
    return res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

// 月度转账任务
scheduleMonthlyTransfer(async () => {
  logger.info('Executing monthly 1% transfer...');
  await executeMonthlyTransferWithRetry();
});

// 阈值换币任务
scheduleThresholdSwap(async () => {
  logger.info('Executing threshold swap...');
  await checkThresholdAndSwapWithRetry();
});

const server = app.listen(appEnv.port, () => {
  logger.info(`Feedo Fund Backend listening on :${appEnv.port}`);
  logger.info('Scheduled jobs:');
  logger.info('- Monthly 1% transfer: 1st of every month at 00:00 UTC');
  logger.info('- Threshold swap check: Every 5 minutes');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});