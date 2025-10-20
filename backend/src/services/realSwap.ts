import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  Keypair,
  sendAndConfirmTransaction,
  TransactionInstruction
} from '@solana/web3.js';
import { 
  createTransferInstruction, 
  getAssociatedTokenAddress, 
  getAccount,
  getMint,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMintToInstruction,
  createBurnInstruction
} from '@solana/spl-token';
import { getConnection } from '../solana/clients';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { appEnv } from '../config';

// FEEDO代币的mint地址
const FEEDO_MINT = new PublicKey('5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK');

export interface SwapRequest {
  fromWalletId: string;
  toWalletId: string;
  fromToken: 'SOL' | 'FEEDO';
  toToken: 'SOL' | 'FEEDO';
  amount: number;
  slippage?: number;
}

export interface SwapResult {
  success: boolean;
  transactionSignature?: string;
  error?: string;
  fromAmount?: number;
  toAmount?: number;
  priceImpact?: number;
}

export class RealSwapService {
  private connection: Connection;
  private signer: Keypair | null = null;

  constructor() {
    this.connection = getConnection();
    this.initializeSigner();
  }

  /**
   * 初始化签名者
   */
  private initializeSigner() {
    try {
      logger.info('Initializing signer...');
      logger.info('appEnv.localPrivateKey:', appEnv.localPrivateKey);
      
      if (appEnv.localPrivateKey) {
        // 从环境变量中获取私钥
        const privateKeyArray = JSON.parse(appEnv.localPrivateKey);
        this.signer = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
        logger.info('Signer initialized from environment variable');
        logger.info('Signer public key:', this.signer.publicKey.toBase58());
      } else {
        logger.warn('No private key found in environment variables. Swaps will be simulated.');
      }
    } catch (error) {
      logger.error('Failed to initialize signer:', error);
    }
  }

  /**
   * 执行代币兑换
   */
  async executeSwap(request: SwapRequest): Promise<SwapResult> {
    try {
      logger.info('Starting real swap execution:', request);

      // 检查是否有签名者
      if (!this.signer) {
        return {
          success: false,
          error: 'No signer available. Please configure LOCAL_PRIVATE_KEY in environment variables.'
        };
      }

      // 检查签名者公钥是否与源钱包匹配
      const fromWallet = await prisma.wallet.findUnique({
        where: { id: request.fromWalletId }
      });

      if (!fromWallet) {
        return {
          success: false,
          error: 'Source wallet not found'
        };
      }

      if (this.signer.publicKey.toBase58() !== fromWallet.address) {
        return {
          success: false,
          error: `Signer public key (${this.signer.publicKey.toBase58()}) does not match source wallet address (${fromWallet.address}). Please use the correct private key for the source wallet.`
        };
      }

      // 获取目标钱包信息
      const toWallet = await prisma.wallet.findUnique({
        where: { id: request.toWalletId }
      });

      if (!toWallet) {
        return {
          success: false,
          error: 'Target wallet not found'
        };
      }

      const fromWalletPubkey = new PublicKey(fromWallet.address);
      const toWalletPubkey = new PublicKey(toWallet.address);

      // 检查余额
      const balanceCheck = await this.checkBalances(fromWalletPubkey, request.fromToken, request.amount);
      if (!balanceCheck.sufficient) {
        return {
          success: false,
          error: `Insufficient ${request.fromToken} balance. Available: ${balanceCheck.available}, Required: ${request.amount}`
        };
      }

      // 创建交易
      const transaction = new Transaction();

      if (request.fromToken === 'SOL' && request.toToken === 'FEEDO') {
        return await this.swapSolToFeedo(transaction, fromWalletPubkey, toWalletPubkey, request.amount);
      } else if (request.fromToken === 'FEEDO' && request.toToken === 'SOL') {
        return await this.swapFeedoToSol(transaction, fromWalletPubkey, toWalletPubkey, request.amount);
      } else {
        return {
          success: false,
          error: 'Unsupported swap pair'
        };
      }

    } catch (error) {
      logger.error('Swap execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * SOL -> FEEDO 兑换
   */
  private async swapSolToFeedo(
    transaction: Transaction,
    fromWallet: PublicKey,
    toWallet: PublicKey,
    solAmount: number
  ): Promise<SwapResult> {
    try {
      logger.info(`Executing SOL to FEEDO swap: ${solAmount} SOL`);

      // 1. 从源钱包转移SOL到目标钱包
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: fromWallet,
        toPubkey: toWallet,
        lamports: lamports
      });
      transaction.add(transferInstruction);

      // 2. 创建FEEDO代币账户（如果不存在）
      const feudoTokenAccount = await getAssociatedTokenAddress(
        FEEDO_MINT,
        toWallet,
        true
      );

      try {
        await getAccount(this.connection, feudoTokenAccount);
      } catch (error) {
        // 代币账户不存在，创建它
        const createAccountInstruction = createAssociatedTokenAccountInstruction(
          fromWallet, // payer
          feudoTokenAccount, // ata
          toWallet, // owner
          FEEDO_MINT // mint
        );
        transaction.add(createAccountInstruction);
      }

      // 3. 铸造FEEDO代币到目标钱包
      const feudoAmount = Math.floor(solAmount * 1000 * 1e6); // 假设FEEDO有6位小数
      const mintInstruction = createMintToInstruction(
        FEEDO_MINT,
        feudoTokenAccount,
        fromWallet, // mint authority (需要是mint的authority)
        feudoAmount
      );
      transaction.add(mintInstruction);

      // 4. 发送交易
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.signer!],
        {
          commitment: 'confirmed',
          skipPreflight: false
        }
      );

      // 5. 记录到数据库
      await prisma.txRecord.create({
        data: {
          kind: 'swap',
          txSig: signature,
          status: 'success',
          amountUi: solAmount,
          fromAddress: fromWallet.toBase58(),
          toAddress: toWallet.toBase58(),
          metadata: JSON.stringify({
            fromToken: 'SOL',
            toToken: 'FEEDO',
            feudoAmount: feudoAmount,
            rate: 1000,
            signature: signature
          })
        }
      });

      logger.info(`SOL to FEEDO swap successful: ${signature}`);

      return {
        success: true,
        transactionSignature: signature,
        fromAmount: solAmount,
        toAmount: solAmount * 1000
      };

    } catch (error) {
      logger.error('SOL to FEEDO swap failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SOL to FEEDO swap failed'
      };
    }
  }

  /**
   * FEEDO -> SOL 兑换
   */
  private async swapFeedoToSol(
    transaction: Transaction,
    fromWallet: PublicKey,
    toWallet: PublicKey,
    feudoAmount: number
  ): Promise<SwapResult> {
    try {
      logger.info(`Executing FEEDO to SOL swap: ${feudoAmount} FEEDO`);

      // 1. 检查FEEDO代币余额
      const feudoTokenAccount = await getAssociatedTokenAddress(
        FEEDO_MINT,
        fromWallet,
        true
      );

      const accountInfo = await getAccount(this.connection, feudoTokenAccount);
      const mintInfo = await getMint(this.connection, FEEDO_MINT);
      const currentBalance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);

      if (currentBalance < feudoAmount) {
        return {
          success: false,
          error: `Insufficient FEEDO balance. Available: ${currentBalance}, Required: ${feudoAmount}`
        };
      }

      // 2. 销毁FEEDO代币
      const feudoAmountRaw = Math.floor(feudoAmount * Math.pow(10, mintInfo.decimals));
      const burnInstruction = createBurnInstruction(
        feudoTokenAccount,
        FEEDO_MINT,
        fromWallet, // owner
        feudoAmountRaw
      );
      transaction.add(burnInstruction);

      // 3. 处理SOL转移
      const solAmount = feudoAmount / 1000; // 1000 FEEDO = 1 SOL
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      
      if (fromWallet.toBase58() === toWallet.toBase58()) {
        // 同一个钱包的内部兑换：从系统储备转移SOL
        // 使用目标钱包作为SOL储备（需要预先存入SOL）
        const reserveWallet = toWallet; // 使用目标钱包作为储备
        const reserveBalance = await this.connection.getBalance(reserveWallet);
        
        if (reserveBalance < lamports) {
          return {
            success: false,
            error: `Insufficient SOL in reserve wallet for internal swap. Available: ${reserveBalance / LAMPORTS_PER_SOL}, Required: ${solAmount}. Please ensure the wallet has sufficient SOL for internal swaps.`
          };
        }
        
        // 从储备钱包转移SOL到用户钱包
        const transferSolInstruction = SystemProgram.transfer({
          fromPubkey: reserveWallet,
          toPubkey: fromWallet,
          lamports: lamports
        });
        transaction.add(transferSolInstruction);
        
        logger.info(`Internal swap: ${feudoAmount} FEEDO burned, ${solAmount} SOL transferred from reserve`);
      } else {
        // 不同钱包：需要从目标钱包转移SOL到源钱包
        // 检查目标钱包是否有足够的SOL余额
        const toWalletBalance = await this.connection.getBalance(toWallet);
        if (toWalletBalance < lamports) {
          return {
            success: false,
            error: `Insufficient SOL balance in target wallet. Available: ${toWalletBalance / LAMPORTS_PER_SOL}, Required: ${solAmount}`
          };
        }
        
        const transferSolInstruction = SystemProgram.transfer({
          fromPubkey: toWallet,
          toPubkey: fromWallet,
          lamports: lamports
        });
        transaction.add(transferSolInstruction);
      }

      // 4. 发送交易
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.signer!],
        {
          commitment: 'confirmed',
          skipPreflight: false
        }
      );

      // 5. 记录到数据库
      await prisma.txRecord.create({
        data: {
          kind: 'swap',
          txSig: signature,
          status: 'success',
          amountUi: feudoAmount,
          fromAddress: fromWallet.toBase58(),
          toAddress: toWallet.toBase58(),
          metadata: JSON.stringify({
            fromToken: 'FEEDO',
            toToken: 'SOL',
            solAmount: solAmount,
            rate: 0.001,
            signature: signature
          })
        }
      });

      logger.info(`FEEDO to SOL swap successful: ${signature}`);

      return {
        success: true,
        transactionSignature: signature,
        fromAmount: feudoAmount,
        toAmount: solAmount
      };

    } catch (error) {
      logger.error('FEEDO to SOL swap failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'FEEDO to SOL swap failed'
      };
    }
  }

  /**
   * 检查钱包余额
   */
  private async checkBalances(
    walletPubkey: PublicKey,
    token: 'SOL' | 'FEEDO',
    requiredAmount: number
  ): Promise<{ sufficient: boolean; available: number }> {
    try {
      if (token === 'SOL') {
        const balance = await this.connection.getBalance(walletPubkey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        return {
          sufficient: solBalance >= requiredAmount,
          available: solBalance
        };
      } else {
        // FEEDO代币
        const feudoTokenAccount = await getAssociatedTokenAddress(
          FEEDO_MINT,
          walletPubkey,
          true
        );

        try {
          const accountInfo = await getAccount(this.connection, feudoTokenAccount);
          const mintInfo = await getMint(this.connection, FEEDO_MINT);
          const feudoBalance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
          
          return {
            sufficient: feudoBalance >= requiredAmount,
            available: feudoBalance
          };
        } catch (error) {
          // 代币账户不存在
          return {
            sufficient: false,
            available: 0
          };
        }
      }
    } catch (error) {
      logger.error('Balance check failed:', error);
      return {
        sufficient: false,
        available: 0
      };
    }
  }

  /**
   * 获取兑换汇率
   */
  async getSwapRate(fromToken: 'SOL' | 'FEEDO', toToken: 'SOL' | 'FEEDO'): Promise<number> {
    // 固定汇率：1 SOL = 1000 FEEDO
    if (fromToken === 'SOL' && toToken === 'FEEDO') {
      return 1000;
    } else if (fromToken === 'FEEDO' && toToken === 'SOL') {
      return 0.001;
    }
    return 1;
  }

  /**
   * 获取钱包代币余额
   */
  async getWalletTokenBalance(walletId: string, token: 'SOL' | 'FEEDO'): Promise<number> {
    try {
      const wallet = await prisma.wallet.findUnique({
        where: { id: walletId }
      });

      if (!wallet) {
        return 0;
      }

      const walletPubkey = new PublicKey(wallet.address);

      if (token === 'SOL') {
        const balance = await this.connection.getBalance(walletPubkey);
        return balance / LAMPORTS_PER_SOL;
      } else {
        const feudoTokenAccount = await getAssociatedTokenAddress(
          FEEDO_MINT,
          walletPubkey,
          true
        );

        try {
          const accountInfo = await getAccount(this.connection, feudoTokenAccount);
          const mintInfo = await getMint(this.connection, FEEDO_MINT);
          return Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
        } catch (error) {
          return 0;
        }
      }
    } catch (error) {
      logger.error('Failed to get wallet token balance:', error);
      return 0;
    }
  }
}

export const realSwapService = new RealSwapService();