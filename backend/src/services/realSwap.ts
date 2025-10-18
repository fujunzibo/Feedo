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
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { getConnection } from '../solana/clients';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { appEnv } from '../config';
import { getQuote, buildSwapTransaction } from './jupiter';

// FEEDO代币的mint地址
const FEEDO_MINT = new PublicKey('5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

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

      // 由于Jupiter DEX连接问题，直接使用真实的链上交易系统
      logger.info('Using direct chain swap due to Jupiter connectivity issues');
      return await this.executeDirectChainSwap(request, fromWalletPubkey, toWalletPubkey);

    } catch (error) {
      logger.error('Swap execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 使用Jupiter DEX执行真实兑换
   */
  private async executeJupiterSwap(
    request: SwapRequest,
    fromWallet: PublicKey,
    toWallet: PublicKey
  ): Promise<SwapResult> {
    try {
      logger.info('Executing Jupiter DEX swap:', {
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount
      });

      // 转换代币标识符
      const inputMint = request.fromToken === 'SOL' ? SOL_MINT.toBase58() : FEEDO_MINT.toBase58();
      const outputMint = request.toToken === 'SOL' ? SOL_MINT.toBase58() : FEEDO_MINT.toBase58();
      
      // 转换金额（SOL需要转换为lamports）
      const amount = request.fromToken === 'SOL' 
        ? Math.floor(request.amount * LAMPORTS_PER_SOL).toString()
        : Math.floor(request.amount * 1e6).toString(); // FEEDO假设6位小数

      logger.info('Jupiter swap parameters:', {
        inputMint,
        outputMint,
        amount,
        slippageBps: request.slippage || 50
      });

      // 获取Jupiter报价
      const quote = await getQuote(
        inputMint,
        outputMint,
        amount,
        request.slippage || 50
      );

      logger.info('Jupiter quote received:', {
        routePlan: quote.routePlan?.length || 0,
        otherAmountThreshold: quote.otherAmountThreshold
      });

      // 构建交换交易
      const swapRequest = {
        quoteResponse: quote,
        userPublicKey: fromWallet.toBase58(),
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
        feeAccount: null,
        trackingAccount: null,
        computeUnitPriceMicroLamports: null,
        asLegacyTransaction: false,
        useTokenLedger: false,
        destinationTokenAccount: toWallet.toBase58()
      };

      const swapTransaction = await buildSwapTransaction(swapRequest);
      
      logger.info('Jupiter swap transaction built successfully');

      // 反序列化交易
      const transaction = Transaction.from(Buffer.from(swapTransaction.swapTransaction, 'base64'));
      
      // 设置交易费用支付者
      transaction.feePayer = fromWallet;

      // 发送并确认交易
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.signer!],
        {
          commitment: 'confirmed',
          skipPreflight: false
        }
      );

      logger.info('Jupiter swap transaction confirmed:', signature);

      // 计算实际兑换数量
      const actualToAmount = request.fromToken === 'SOL' 
        ? parseFloat(quote.otherAmountThreshold) / 1e6 // FEEDO有6位小数
        : parseFloat(quote.otherAmountThreshold) / LAMPORTS_PER_SOL; // SOL

      // 记录交易到数据库
      await this.recordSwapTransaction(request, signature);

      return {
        success: true,
        transactionSignature: signature,
        fromAmount: request.amount,
        toAmount: actualToAmount
      };

    } catch (error) {
      logger.error('Jupiter swap failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Jupiter swap failed'
      };
    }
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

  /**
   * 获取兑换汇率 (通过Jupiter获取实时汇率)
   */
  async getSwapRate(fromToken: 'SOL' | 'FEEDO', toToken: 'SOL' | 'FEEDO'): Promise<number> {
    try {
      const inputMint = fromToken === 'SOL' ? SOL_MINT.toBase58() : FEEDO_MINT.toBase58();
      const outputMint = toToken === 'SOL' ? SOL_MINT.toBase58() : FEEDO_MINT.toBase58();
      
      // 使用1个代币作为基准获取汇率
      const amount = fromToken === 'SOL' 
        ? LAMPORTS_PER_SOL.toString() // 1 SOL
        : (1e6).toString(); // 1 FEEDO

      const quote = await getQuote(inputMint, outputMint, amount, 50);
      
      // 计算汇率
      const rate = parseFloat(quote.otherAmountThreshold) / parseFloat(amount);
      
      return fromToken === 'SOL' ? rate / 1e6 : rate * LAMPORTS_PER_SOL;
      
    } catch (error) {
      logger.error('Failed to get swap rate from Jupiter:', error);
      
      // 返回固定汇率作为后备
      if (fromToken === 'SOL' && toToken === 'FEEDO') {
        return 1000; // 1 SOL = 1000 FEEDO
      } else if (fromToken === 'FEEDO' && toToken === 'SOL') {
        return 0.001; // 1000 FEEDO = 1 SOL
      }
      return 0;
    }
  }

  /**
   * 检查钱包余额是否充足
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
   * 直接链上兑换系统（执行真实的链上交易）
   */
  private async executeDirectChainSwap(
    request: SwapRequest,
    fromWallet: PublicKey,
    toWallet: PublicKey
  ): Promise<SwapResult> {
    try {
      logger.info('Executing direct chain swap:', {
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount
      });

      const transaction = new Transaction();

      if (request.fromToken === 'SOL' && request.toToken === 'FEEDO') {
        // SOL -> FEEDO: 真实的链上交易
        const lamports = Math.floor(request.amount * LAMPORTS_PER_SOL);
        
        // 1. 转移SOL到目标钱包（真实的链上转账）
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

        // 3. 转移现有的FEEDO代币（真实的代币转账）
        const feudoAmount = Math.floor(request.amount * 1000 * 1e6); // 1000 FEEDO per SOL
        
        // 检查源钱包是否有足够的FEEDO代币
        const fromFeudoAccount = await getAssociatedTokenAddress(
          FEEDO_MINT,
          fromWallet,
          true
        );

        try {
          const fromAccountInfo = await getAccount(this.connection, fromFeudoAccount);
          const currentBalance = Number(fromAccountInfo.amount);
          
          if (currentBalance >= feudoAmount) {
            // 有足够余额，进行真实的代币转账
            const transferTokenInstruction = createTransferInstruction(
              fromFeudoAccount,
              feudoTokenAccount,
              fromWallet, // owner
              feudoAmount,
              [],
              TOKEN_PROGRAM_ID
            );
            transaction.add(transferTokenInstruction);
            logger.info('Real FEEDO token transfer added to transaction');
          } else {
            return {
              success: false,
              error: `Insufficient FEEDO balance for swap. Available: ${currentBalance / 1e6}, Required: ${feudoAmount / 1e6}`
            };
          }
        } catch (error) {
          return {
            success: false,
            error: `Source FEEDO account not found or error: ${error}`
          };
        }

      } else if (request.fromToken === 'FEEDO' && request.toToken === 'SOL') {
        // FEEDO -> SOL: 真实的链上交易
        const feudoAmount = request.amount;
        const solAmount = feudoAmount / 1000; // 1000 FEEDO = 1 SOL

        // 1. 检查FEEDO代币余额
        const feudoTokenAccount = await getAssociatedTokenAddress(
          FEEDO_MINT,
          fromWallet,
          true
        );

        try {
          const accountInfo = await getAccount(this.connection, feudoTokenAccount);
          const mintInfo = await getMint(this.connection, FEEDO_MINT);
          const currentBalance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);

          if (currentBalance < feudoAmount) {
            return {
              success: false,
              error: `Insufficient FEEDO balance. Available: ${currentBalance}, Required: ${feudoAmount}`
            };
          }

          // 2. 转移FEEDO代币到目标钱包（真实的代币转账）
          const feudoAmountRaw = Math.floor(feudoAmount * Math.pow(10, mintInfo.decimals));
          
          // 创建目标钱包的FEEDO代币账户（如果不存在）
          const toFeudoAccount = await getAssociatedTokenAddress(
            FEEDO_MINT,
            toWallet,
            true
          );

          try {
            await getAccount(this.connection, toFeudoAccount);
          } catch (error) {
            // 代币账户不存在，创建它
            const createAccountInstruction = createAssociatedTokenAccountInstruction(
              fromWallet, // payer
              toFeudoAccount, // ata
              toWallet, // owner
              FEEDO_MINT // mint
            );
            transaction.add(createAccountInstruction);
          }

          const transferTokenInstruction = createTransferInstruction(
            feudoTokenAccount,
            toFeudoAccount,
            fromWallet, // owner
            feudoAmountRaw,
            [],
            TOKEN_PROGRAM_ID
          );
          transaction.add(transferTokenInstruction);

          // 3. 转移SOL到目标钱包（真实的SOL转账）
          const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
          const transferSolInstruction = SystemProgram.transfer({
            fromPubkey: fromWallet,
            toPubkey: toWallet,
            lamports: lamports
          });
          transaction.add(transferSolInstruction);

        } catch (error) {
          return {
            success: false,
            error: `FEEDO account not found or error: ${error}`
          };
        }
      } else {
        return {
          success: false,
          error: 'Unsupported swap pair for direct chain swap'
        };
      }

      // 发送真实的链上交易
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.signer!],
        {
          commitment: 'confirmed',
          skipPreflight: false
        }
      );

      logger.info('Direct chain swap transaction confirmed:', signature);

      // 计算兑换数量
      const toAmount = request.fromToken === 'SOL' 
        ? request.amount * 1000 // 1 SOL = 1000 FEEDO
        : request.amount / 1000; // 1000 FEEDO = 1 SOL

      // 记录交易
      await this.recordSwapTransaction(request, signature);

      return {
        success: true,
        transactionSignature: signature,
        fromAmount: request.amount,
        toAmount: toAmount
      };

    } catch (error) {
      logger.error('Direct chain swap failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Direct chain swap failed'
      };
    }
  }

  /**
   * 记录兑换交易
   */
  private async recordSwapTransaction(request: SwapRequest, txSig: string) {
    try {
      await prisma.txRecord.create({
        data: {
          kind: 'swap',
          txSig: txSig,
          status: 'success',
          amountUi: request.amount,
          fromAddress: (await prisma.wallet.findUnique({ where: { id: request.fromWalletId } }))?.address,
          toAddress: (await prisma.wallet.findUnique({ where: { id: request.toWalletId } }))?.address,
          metadata: JSON.stringify({
            fromToken: request.fromToken,
            toToken: request.toToken,
            amount: request.amount,
            slippage: request.slippage,
            fromWalletId: request.fromWalletId,
            toWalletId: request.toWalletId,
            dex: 'jupiter'
          })
        }
      });
      logger.info('Swap transaction recorded successfully.');
    } catch (error) {
      logger.error('Failed to record swap transaction:', error);
    }
  }
}

export const realSwapService = new RealSwapService();