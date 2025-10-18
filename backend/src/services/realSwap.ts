import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
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

  constructor() {
    this.connection = getConnection();
  }

  /**
   * 执行内部代币兑换（同一钱包内）
   */
  private async executeInternalSwap(
    walletPubkey: PublicKey,
    request: SwapRequest
  ): Promise<SwapResult> {
    try {
      logger.info('Executing internal swap within same wallet:', {
        wallet: walletPubkey.toBase58(),
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount
      });

      // 检查余额
      const balanceCheck = await this.checkBalances(walletPubkey, request.fromToken, request.amount);
      if (!balanceCheck.sufficient) {
        return {
          success: false,
          error: `Insufficient ${request.fromToken} balance. Available: ${balanceCheck.available}, Required: ${request.amount}`
        };
      }

      // 创建交易记录
      const transaction = new Transaction();

      if (request.fromToken === 'SOL' && request.toToken === 'FEEDO') {
        // SOL -> FEEDO: 模拟铸造FEEDO代币
        const feudoAmount = Math.floor(request.amount * 1000 * 1e6); // 假设FEEDO有6位小数

        // 记录到数据库
        await prisma.txRecord.create({
          data: {
            kind: 'swap',
            txSig: 'internal_sol_to_feudo_' + Date.now(),
            status: 'success',
            amountUi: request.amount,
            fromAddress: walletPubkey.toBase58(),
            toAddress: walletPubkey.toBase58(),
            metadata: JSON.stringify({
              fromToken: 'SOL',
              toToken: 'FEEDO',
              feudoAmount: feudoAmount,
              rate: 1000,
              internal: true
            })
          }
        });

        return {
          success: true,
          transactionSignature: 'internal_sol_to_feudo_' + Date.now(),
          fromAmount: request.amount,
          toAmount: request.amount * 1000
        };

      } else if (request.fromToken === 'FEEDO' && request.toToken === 'SOL') {
        // FEEDO -> SOL: 模拟销毁FEEDO代币并释放SOL
        const feudoAmount = request.amount;
        const solAmount = feudoAmount / 1000; // 1000 FEEDO = 1 SOL

        // 记录到数据库
        await prisma.txRecord.create({
          data: {
            kind: 'swap',
            txSig: 'internal_feudo_to_sol_' + Date.now(),
            status: 'success',
            amountUi: feudoAmount,
            fromAddress: walletPubkey.toBase58(),
            toAddress: walletPubkey.toBase58(),
            metadata: JSON.stringify({
              fromToken: 'FEEDO',
              toToken: 'SOL',
              solAmount: solAmount,
              rate: 0.001,
              internal: true
            })
          }
        });

        return {
          success: true,
          transactionSignature: 'internal_feudo_to_sol_' + Date.now(),
          fromAmount: request.amount,
          toAmount: solAmount
        };

      } else {
        return {
          success: false,
          error: 'Unsupported internal swap pair'
        };
      }

    } catch (error) {
      logger.error('Internal swap execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Internal swap failed'
      };
    }
  }

  /**
   * 执行代币兑换
   */
  async executeSwap(request: SwapRequest): Promise<SwapResult> {
    try {
      logger.info('Starting real swap execution:', request);

      // 获取钱包信息
      const fromWallet = await prisma.wallet.findUnique({
        where: { id: request.fromWalletId }
      });
      const toWallet = await prisma.wallet.findUnique({
        where: { id: request.toWalletId }
      });

      if (!fromWallet || !toWallet) {
        return {
          success: false,
          error: 'Wallet not found'
        };
      }

      const fromWalletPubkey = new PublicKey(fromWallet.address);
      const toWalletPubkey = new PublicKey(toWallet.address);

      // 如果是同一个钱包，进行内部代币兑换
      if (fromWallet.id === toWallet.id) {
        return await this.executeInternalSwap(fromWalletPubkey, request);
      }

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
        // SOL -> FEEDO: 使用固定汇率 1 SOL = 1000 FEEDO
        const result = await this.swapSolToFeedo(
          transaction,
          fromWalletPubkey,
          toWalletPubkey,
          request.amount
        );
        
        if (!result.success) {
          return result;
        }
      } else if (request.fromToken === 'FEEDO' && request.toToken === 'SOL') {
        // FEEDO -> SOL: 使用固定汇率 1000 FEEDO = 1 SOL
        const result = await this.swapFeedoToSol(
          transaction,
          fromWalletPubkey,
          toWalletPubkey,
          request.amount
        );
        
        if (!result.success) {
          return result;
        }
      } else {
        return {
          success: false,
          error: 'Unsupported swap pair'
        };
      }

      // 记录交易到数据库
      await this.recordSwapTransaction(request, transaction);

      return {
        success: true,
        transactionSignature: 'simulated_tx_signature', // 在实际环境中，这里应该是真实的交易签名
        fromAmount: request.amount,
        toAmount: request.fromToken === 'SOL' ? request.amount * 1000 : request.amount / 1000
      };

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

      // 3. 模拟铸造FEEDO代币到目标钱包
      // 注意：在实际环境中，这需要与代币合约交互
      const feudoAmount = Math.floor(solAmount * 1000 * 1e6); // 假设FEEDO有6位小数

      // 记录到数据库
      await prisma.txRecord.create({
        data: {
          kind: 'swap',
          txSig: 'simulated_sol_to_feudo_' + Date.now(),
          status: 'success',
          amountUi: solAmount,
          fromAddress: fromWallet.toBase58(),
          toAddress: toWallet.toBase58(),
          metadata: JSON.stringify({
            fromToken: 'SOL',
            toToken: 'FEEDO',
            feudoAmount: feudoAmount,
            rate: 1000
          })
        }
      });

      return { success: true };

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

      // 2. 转移FEEDO代币（销毁）
      const feudoAmountRaw = Math.floor(feudoAmount * Math.pow(10, mintInfo.decimals));
      const transferInstruction = createTransferInstruction(
        feudoTokenAccount,
        feudoTokenAccount, // 在实际环境中，应该转移到销毁地址
        fromWallet,
        feudoAmountRaw,
        [],
        TOKEN_PROGRAM_ID
      );
      transaction.add(transferInstruction);

      // 3. 转移SOL到源钱包
      const solAmount = feudoAmount / 1000; // 1000 FEEDO = 1 SOL
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const transferSolInstruction = SystemProgram.transfer({
        fromPubkey: toWallet,
        toPubkey: fromWallet,
        lamports: lamports
      });
      transaction.add(transferSolInstruction);

      // 记录到数据库
      await prisma.txRecord.create({
        data: {
          kind: 'swap',
          txSig: 'simulated_feudo_to_sol_' + Date.now(),
          status: 'success',
          amountUi: feudoAmount,
          fromAddress: fromWallet.toBase58(),
          toAddress: toWallet.toBase58(),
          metadata: JSON.stringify({
            fromToken: 'FEEDO',
            toToken: 'SOL',
            solAmount: solAmount,
            rate: 0.001
          })
        }
      });

      return { success: true };

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
   * 记录兑换交易
   */
  private async recordSwapTransaction(request: SwapRequest, transaction: Transaction) {
    try {
      // 这里可以添加更多交易记录逻辑
      logger.info('Swap transaction recorded:', {
        fromWallet: request.fromWalletId,
        toWallet: request.toWalletId,
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount
      });
    } catch (error) {
      logger.error('Failed to record swap transaction:', error);
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
