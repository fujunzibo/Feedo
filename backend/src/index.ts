import express from 'express';
import { appEnv } from './config';
import { scheduleMonthlyTransfer, scheduleThresholdSwap } from './jobs/scheduler';
import { logger } from './lib/logger';
import { executeMonthlyTransferWithRetry } from './services/monthlyTransfer';
import { checkThresholdAndSwap, checkThresholdAndSwapWithRetry } from './services/thresholdSwap';
import { executeAutoDonationWithRetry } from './services/autoDonation';
import { prisma } from './lib/prisma';
import cors from 'cors';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, getMint } from '@solana/spl-token';
import { getConnection } from './solana/clients';
import { getSolPriceUsd } from './services/pricing';

const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

// Health check route
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Wallet assets route
app.get('/api/wallet-assets', async (req, res) => {
  try {
    const wallets = await prisma.wallet.findMany();
    const connection = getConnection();
    const mintAddress = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK'; // FEEDO token
    
    const walletAssets = await Promise.all(wallets.map(async (wallet) => {
      try {
        const pubkey = new PublicKey(wallet.address);
        
        // 获取 SOL 余额
        const solBalance = await connection.getBalance(pubkey);
        const solBalanceFormatted = solBalance / 1000000000; // Convert lamports to SOL
        
        // 获取代币余额
        let tokenBalance = 0;
        let tokenBalanceFormatted = 0;
        try {
          const tokenAccount = await getAssociatedTokenAddress(
            new PublicKey(mintAddress),
            pubkey
          );
          const accountInfo = await getAccount(connection, tokenAccount);
          const mintInfo = await getMint(connection, new PublicKey(mintAddress));
          tokenBalance = Number(accountInfo.amount);
          tokenBalanceFormatted = tokenBalance / Math.pow(10, mintInfo.decimals);
        } catch (error) {
          // Token account doesn't exist or other error
          tokenBalance = 0;
          tokenBalanceFormatted = 0;
        }
        
        // 获取代币价格 (使用固定价格作为演示)
        const tokenPriceUsd = 0.001; // FEEDO代币固定价格 $0.001
        const solPriceUsd = await getSolPriceUsd();
        
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
      } catch (error) {
        logger.error(`Error fetching assets for wallet ${wallet.address}:`, error);
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
    
    res.json({
      success: true,
      wallets: walletAssets,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to fetch wallet assets:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch wallet assets' 
    });
  }
});

// Dashboard data route
app.get('/api/dashboard', async (req, res) => {
  try {
    const wallets = await prisma.wallet.findMany();
    
    // 支持分页参数
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 500; // 默认显示500条记录
    const skip = (page - 1) * limit;
    
    const txRecords = await prisma.txRecord.findMany({
      orderBy: { createdAt: 'desc' },
      skip: skip,
      take: limit,
    });
    
    // 获取总记录数用于分页
    const totalRecords = await prisma.txRecord.count();
    
    const metrics = await prisma.metric.findFirst();

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