import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair, VersionedTransaction } from '@solana/web3.js';
// @ts-ignore - @solana/spl-token 0.1.8 types are incomplete, but functions exist at runtime
import { 
  // @ts-ignore
  getAssociatedTokenAddress, 
  // @ts-ignore
  getAccount, 
  // @ts-ignore
  getMint, 
  // @ts-ignore
  createTransferCheckedInstruction 
} from '@solana/spl-token';
import { getConnection, getSigner } from '../solana/clients';
import { appEnv } from '../config';
import bs58 from 'bs58';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getSolPriceUsd } from './pricing';
import { getQuote, buildSwapTransaction } from './jupiter';
import pRetry from 'p-retry';
import { randomUUID } from 'crypto';

export interface SwapResult {
  success: boolean;
  txSignature?: string;
  inputAmount?: number;
  outputAmount?: number;
  usdValue?: number;
  error?: string;
}

// 获取代币价格（USD）
async function getTokenPriceUsd(mintAddress: string): Promise<number> {
  const jupiterPriceUrl = `https://price.jup.ag/v4/price?ids=${mintAddress}`;
  
  try {
    const response = await fetch(jupiterPriceUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Feedo-Fund-Bot/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Jupiter Price API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.data?.[mintAddress]?.price;
    
    if (price && typeof price === 'number' && price > 0) {
      return price;
    }
    
    throw new Error('Invalid price data from Jupiter');
  } catch (error) {
    logger.warn(`Jupiter price fetch failed: ${error}`);
    
    // 尝试 CoinGecko 作为备选
    try {
      const coingeckoUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
      const response = await fetch(coingeckoUrl);
      const data = await response.json();
      const solPrice = data.solana?.usd;
      
      if (solPrice && typeof solPrice === 'number' && solPrice > 0) {
        // 假设代币价格为 SOL 价格的 0.01
        return solPrice * 0.01;
      }
    } catch (coingeckoError) {
      logger.warn(`CoinGecko price fetch failed: ${coingeckoError}`);
    }
    
    // 默认价格
    return 0.01;
  }
}

// 简化的交换方案：从国库发送等值 SOL 到目标钱包
async function executeSimplifiedSwap(
  connection: Connection,
  signer: any,
  targetWallet: any,
  tokenBalance: number,
  usdValue: number
): Promise<SwapResult> {
  try {
    logger.info('Executing simplified swap method');

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

    // 获取国库钱包
    const treasuryWallet = await prisma.wallet.findFirst({
      where: { type: 'treasury' }
    });

    if (!treasuryWallet) {
      throw new Error('Treasury wallet not found');
    }

    const targetPubkey = new PublicKey(targetWallet.address);
    const treasuryPubkey = new PublicKey(treasuryWallet.address);

    // 从国库钱包发送等值的 SOL 到目标钱包
    // 使用实时价格或回退价（当前设为 $195）
    const solPriceUsd = 195;
    const solAmount = usdValue / solPriceUsd;
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

    // 检查国库钱包是否有足够的 SOL
    const treasuryBalance = await connection.getBalance(treasuryPubkey);
    const treasurySolBalance = treasuryBalance / LAMPORTS_PER_SOL;

    if (treasurySolBalance < solAmount + 0.01) { // 保留 0.01 SOL 作为手续费
      throw new Error(`Insufficient SOL in treasury wallet. Required: ${solAmount + 0.01}, Available: ${treasurySolBalance}`);
    }

    const solTransferIx = SystemProgram.transfer({
      fromPubkey: treasuryPubkey,
      toPubkey: targetPubkey,
      lamports: lamports
    });

    // 构建交易
    const transaction = new Transaction().add(solTransferIx);

    // 获取最近的 blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryPubkey;

    // 签名并发送交易
    const signature = await connection.sendTransaction(transaction, [keypair]);
    await connection.confirmTransaction(signature);

    logger.info(`Simplified swap completed: ${signature}`);
    logger.info(`Transferred ${solAmount} SOL (${lamports} lamports) to ${targetWallet.address}`);

    // 记录到数据库
    await prisma.txRecord.create({
      data: {
        kind: 'swap',
        txSig: signature,
        status: 'success',
        amountUi: tokenBalance,
        fromAddress: treasuryWallet.address,
        toAddress: targetWallet.address,
        details: JSON.stringify({
          inputAmount: tokenBalance,
          outputAmount: solAmount,
          usdValue,
          method: 'simplified_sol_transfer',
          note: 'SOL sent from treasury to target wallet as equivalent value'
        })
      }
    });

    return {
      success: true,
      txSignature: signature,
      inputAmount: tokenBalance,
      outputAmount: solAmount,
      usdValue: usdValue
    };

  } catch (error) {
    logger.error('Simplified swap failed:', error);
    throw error;
  }
}

export async function checkThresholdAndSwap(): Promise<SwapResult> {
  const connection = getConnection();
  const signer = getSigner();

  try {
    logger.info('Checking threshold and executing swap...');

    // 获取目标钱包信息
    const targetWallet = await prisma.wallet.findFirst({
      where: { type: 'target' }
    });

    if (!targetWallet) {
      throw new Error('Target wallet not found in database');
    }

    // Devnet mint address
    const mintAddress = '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';

    // 获取目标钱包的代币余额
    const targetPubkey = new PublicKey(targetWallet.address);
    const targetTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(mintAddress),
      targetPubkey
    );

    let accountInfo;
    let mintInfo;

    try {
      accountInfo = await getAccount(connection, targetTokenAccount);
    } catch (error) {
      logger.error('Failed to get target token account:', error);
      return { success: false, error: 'Target token account not found' };
    }

    try {
      mintInfo = await getMint(connection, new PublicKey(mintAddress));
    } catch (error) {
      logger.error('Failed to get mint info:', error);
      return { success: false, error: 'Failed to get mint info' };
    }

    const tokenBalance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);

    // 获取代币价格
    const tokenPriceUsd = await getTokenPriceUsd(mintAddress);
    const usdValue = tokenBalance * tokenPriceUsd;

    logger.info(`Target wallet balance: ${tokenBalance} tokens ($${usdValue.toFixed(2)})`);

    // 检查是否达到阈值（$50）
    const thresholdUsd = 50;
    if (usdValue < thresholdUsd) {
      logger.info(`Below threshold: $${usdValue.toFixed(2)} < $${thresholdUsd}`);
      return { success: false, error: 'Below threshold' };
    }

    logger.info(`Above threshold: $${usdValue.toFixed(2)} >= $${thresholdUsd}, executing swap...`);

    // 使用 Jupiter 真实兑换（目标钱包签名），不再使用简化回退
    try {
      // 使用目标钱包原始最小单位余额作为兑换数量
      const amountRaw = accountInfo.amount.toString();
      // 获取报价（Feedo -> SOL）
      const quote = await getQuote(
        mintAddress,
        'So11111111111111111111111111111111111111112',
        amountRaw,
        50 // 0.5% slippage bps
      );

      // 构建 Jupiter 交换交易
      const swapResp = await buildSwapTransaction({
        quoteResponse: quote,
        userPublicKey: targetPubkey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      });

      const swapTxBase64 = swapResp.swapTransaction as string;
      if (!swapTxBase64) throw new Error('Jupiter response missing swapTransaction');

      // 解析并用目标钱包私钥签名
      if (!appEnv.targetPrivateKey) {
        throw new Error('TARGET_PRIVATE_KEY not set');
      }
      let tSecret: Uint8Array;
      try {
        tSecret = bs58.decode(appEnv.targetPrivateKey);
      } catch (e) {
        if (appEnv.targetPrivateKey.length === 128) {
          const hex = appEnv.targetPrivateKey;
          tSecret = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
        } else {
          throw new Error(`Invalid target private key format. Expected base58 or 128-char hex, got ${appEnv.targetPrivateKey.length} chars`);
        }
      }
      const targetKeypair = tSecret.length === 32
        ? Keypair.fromSeed(tSecret)
        : tSecret.length === 64
          ? Keypair.fromSecretKey(tSecret)
          : (() => { throw new Error(`Invalid target secret key size: ${tSecret.length}. Expected 32 or 64 bytes`); })();

      const vx = VersionedTransaction.deserialize(Buffer.from(swapTxBase64, 'base64'));
      vx.sign([targetKeypair]);

      const sig = await connection.sendRawTransaction(vx.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, 'confirmed');

      await prisma.txRecord.create({
        data: {
          kind: 'swap',
          txSig: sig,
          status: 'success',
          amountUi: tokenBalance,
          fromAddress: targetWallet.address,
          toAddress: targetWallet.address,
          details: JSON.stringify({
            method: 'jupiter_swap',
            inputMint: mintAddress,
            outputMint: 'So11111111111111111111111111111111111111112',
            amountRaw,
          })
        }
      });

      return {
        success: true,
        txSignature: sig,
        inputAmount: tokenBalance,
        // 输出数量无法从已签交易直接得出，这里不填
        usdValue,
      };
    } catch (jupiterError) {
      logger.error('Jupiter swap failed:', jupiterError);
      throw jupiterError;
    }

  } catch (error) {
    logger.error('Threshold swap failed:', error);
    await prisma.txRecord.create({
      data: {
        kind: 'swap',
        txSig: `failed_${randomUUID()}`,
        status: 'failed',
        details: JSON.stringify({ error: (error as Error).message })
      }
    });
    return { success: false, error: (error as Error).message };
  }
}

export async function checkThresholdAndSwapWithRetry(): Promise<SwapResult> {
  return pRetry(
    () => checkThresholdAndSwap(),
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: (error) => {
        logger.warn(`Threshold swap attempt ${error.attemptNumber} failed:`, error.message);
      }
    }
  );
}