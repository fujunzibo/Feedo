import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { getConnection, getSigner } from '../solana/clients';
import { appEnv } from '../config';
import bs58 from 'bs58';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getSolPriceUsd } from './pricing';
import pRetry from 'p-retry';
import { randomUUID } from 'crypto';

export interface DonationResult {
  success: boolean;
  txSignature?: string;
  amount?: number;
  usdValue?: number;
  error?: string;
}

export async function executeAutoDonation(): Promise<DonationResult> {
  const connection = getConnection();
  const signer = getSigner();

  // 创建Keypair用于签名
  if (!appEnv.localPrivateKey) {
    throw new Error('LOCAL_PRIVATE_KEY not set');
  }
  let secret: Uint8Array;
  try {
    secret = bs58.decode(appEnv.localPrivateKey);
  } catch (e) {
    if (appEnv.localPrivateKey.length === 128) {
      const hex = appEnv.localPrivateKey;
      secret = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    } else {
      throw new Error(`Invalid private key format. Expected base58 or 128-char hex, got ${appEnv.localPrivateKey.length} chars`);
    }
  }
  const keypair = secret.length === 32
    ? Keypair.fromSeed(secret)
    : secret.length === 64
      ? Keypair.fromSecretKey(secret)
      : (() => { throw new Error(`Invalid secret key size: ${secret.length}. Expected 32 or 64 bytes`); })();

  try {
    logger.info('Starting auto donation...');

    // 获取目标钱包信息 (不再是发送方，但需要其地址)
    const targetWallet = await prisma.wallet.findFirst({
      where: { type: 'target' }
    });

    if (!targetWallet) {
      throw new Error('Target wallet not found in database');
    }

    // 获取慈善钱包信息
    const donationWallet = await prisma.wallet.findFirst({
      where: { type: 'donation' }
    });

    if (!donationWallet) {
      throw new Error('Donation wallet not found in database');
    }

    // 获取国库钱包
    const treasuryWallet = await prisma.wallet.findFirst({
      where: { type: 'treasury' }
    });

    if (!treasuryWallet) {
      throw new Error('Treasury wallet not found');
    }

    const treasuryPubkey = new PublicKey(treasuryWallet.address);
    const balance = await connection.getBalance(treasuryPubkey);
    const solBalance = balance / LAMPORTS_PER_SOL;

    // 使用固定的捐赠金额（0.01 SOL）
    const donationAmount = 0.01; // 0.01 SOL

    if (solBalance < donationAmount + 0.01) { // 保留 0.01 SOL 作为手续费
      logger.warn(`Insufficient SOL balance in treasury for donation. Required: ${donationAmount + 0.01}, Available: ${solBalance}`);
      return { success: false, error: 'Insufficient treasury balance' };
    }

    // 获取 SOL 价格
    const solPriceUsd = await getSolPriceUsd();
    const usdValue = donationAmount * solPriceUsd;

    logger.info(`Donating ${donationAmount} SOL ($${usdValue.toFixed(2)}) to charity from treasury`);

    // 创建转账交易
    const donationPubkey = new PublicKey(donationWallet.address);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasuryPubkey,
        toPubkey: donationPubkey,
        lamports: Math.floor(donationAmount * LAMPORTS_PER_SOL)
      })
    );

    // 获取最近的 blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryPubkey;

    // 签名并发送交易
    const signature = await connection.sendTransaction(transaction, [keypair]);

    // 等待确认
    await connection.confirmTransaction(signature);

    logger.info(`Donation completed: ${signature}`);

    // 记录到数据库
    await prisma.donation.create({
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
    await prisma.txRecord.create({
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
    await prisma.metric.upsert({
      where: { id: '1' },
      update: {
        cumulativeDonations: {
          increment: usdValue,
        },
        lastDonationTimestamp: new Date(),
      },
      create: {
        id: '1',
        cumulativeDonations: usdValue,
        lastDonationTimestamp: new Date(),
      },
    });

    return {
      success: true,
      txSignature: signature,
      amount: donationAmount,
      usdValue: usdValue
    };

  } catch (error) {
    logger.error('Auto donation failed:', error);
    // 记录失败到数据库
    await prisma.txRecord.create({
      data: {
        kind: 'donation',
        txSig: `failed_${randomUUID()}`,
        status: 'failed',
        details: JSON.stringify({ error: (error as Error).message })
      }
    });
    return { success: false, error: (error as Error).message };
  }
}

export async function executeAutoDonationWithRetry(): Promise<DonationResult> {
  return pRetry(
    () => executeAutoDonation(),
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: (error) => {
        logger.warn(`Auto donation attempt ${error.attemptNumber} failed:`, error.message);
      }
    }
  );
}