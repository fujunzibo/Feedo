import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferCheckedInstruction,
  getAccount,
  getMint
} from '@solana/spl-token';
import { getConnection, getSigner } from '../solana/clients';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { appEnv } from '../config';
import pRetry from 'p-retry';
import { randomUUID } from 'crypto';
import bs58 from 'bs58';

export interface TransferResult {
  success: boolean;
  txSignature?: string;
  amount?: number;
  error?: string;
}

export async function executeMonthlyTransfer(): Promise<TransferResult> {
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
    // 非 base58，尝试 hex（128 字符）
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
    logger.info('Starting monthly 1% transfer...');
    
    // 获取金库钱包信息
    const treasuryWallet = await prisma.wallet.findFirst({
      where: { type: 'treasury' }
    });
    
    if (!treasuryWallet) {
      throw new Error('Treasury wallet not found in database');
    }
    
    // 获取目标钱包信息
    const targetWallet = await prisma.wallet.findFirst({
      where: { type: 'target' }
    });
    
    if (!targetWallet) {
      throw new Error('Target wallet not found in database');
    }
    
    // Devnet mint address
    const mintAddress = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';
    
    // 获取金库钱包的代币余额
    logger.info(`Treasury wallet address: ${treasuryWallet.address}`);
    logger.info(`Target wallet address: ${targetWallet.address}`);
    logger.info(`Mint address: ${mintAddress}`);
    
    const treasuryPubkey = new PublicKey(treasuryWallet.address);
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(mintAddress),
      treasuryPubkey
    );
    
    let accountInfo;
    let mintInfo;

    try {
      accountInfo = await getAccount(connection, treasuryTokenAccount);
    } catch (error) {
      logger.error('Failed to get treasury token account:', error);
      return { success: false, error: 'Treasury token account not found' };
    }

    try {
      mintInfo = await getMint(connection, new PublicKey(mintAddress));
    } catch (error) {
      logger.error('Failed to get mint info:', error);
      return { success: false, error: 'Failed to get mint info' };
    }
    
    // 计算 1% 转账数量
    const totalBalance = Number(accountInfo.amount);
    const transferAmount = Math.floor(totalBalance * 0.01); // 1%
    
    if (transferAmount <= 0) {
      logger.warn('Insufficient balance for 1% transfer');
      return { success: false, error: 'Insufficient balance' };
    }
    
    logger.info(`Transferring ${transferAmount} tokens (1% of ${totalBalance})`);
    
    // 创建转账指令
    const targetPubkey = new PublicKey(targetWallet.address);
    const targetTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(mintAddress),
      targetPubkey
    );
    
    const transferInstruction = createTransferCheckedInstruction(
      treasuryTokenAccount,
      new PublicKey(mintAddress),
      targetTokenAccount,
      treasuryPubkey,
      transferAmount,
      mintInfo.decimals
    );
    
    // 构建并发送交易
    const transaction = new Transaction().add(transferInstruction);
    
    // 获取最近的 blockhash 并设置 feePayer
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryPubkey;
    
    const signature = await connection.sendTransaction(transaction, [keypair]);
    
    // 等待确认
    await connection.confirmTransaction(signature);
    
    logger.info(`Monthly transfer completed: ${signature}`);
    
    // 记录到数据库
    await prisma.txRecord.create({
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
    
  } catch (error) {
    logger.error('Monthly transfer failed:', error);
    
    // 记录失败到数据库
    await prisma.txRecord.create({
      data: {
        kind: 'monthly_transfer',
        txSig: `failed_${randomUUID()}`,
        status: 'failed',
        details: JSON.stringify({ error: (error as Error).message })
      }
    });
    
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

export async function executeMonthlyTransferWithRetry(): Promise<TransferResult> {
  return pRetry(
    () => executeMonthlyTransfer(),
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: (error) => {
        logger.warn(`Monthly transfer attempt ${error.attemptNumber} failed:`, error.message);
      }
    }
  );
}

