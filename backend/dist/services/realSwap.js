"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realSwapService = exports.RealSwapService = void 0;
const web3_js_1 = require("@solana/web3.js");
// @ts-ignore - @solana/spl-token 0.1.8 types are incomplete, but functions exist at runtime
const spl_token_1 = require("@solana/spl-token");
const clients_1 = require("../solana/clients");
const logger_1 = require("../lib/logger");
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
// FEEDO代币的mint地址
const FEEDO_MINT = new web3_js_1.PublicKey('5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK');
class RealSwapService {
    constructor() {
        this.signer = null;
        this.connection = (0, clients_1.getConnection)();
        this.initializeSigner();
    }
    /**
     * 初始化签名者
     */
    initializeSigner() {
        try {
            logger_1.logger.info('Initializing signer...');
            logger_1.logger.info('appEnv.localPrivateKey:', config_1.appEnv.localPrivateKey);
            if (config_1.appEnv.localPrivateKey) {
                // 从环境变量中获取私钥
                const privateKeyArray = JSON.parse(config_1.appEnv.localPrivateKey);
                this.signer = web3_js_1.Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
                logger_1.logger.info('Signer initialized from environment variable');
                logger_1.logger.info('Signer public key:', this.signer.publicKey.toBase58());
            }
            else {
                logger_1.logger.warn('No private key found in environment variables. Swaps will be simulated.');
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize signer:', error);
        }
    }
    /**
     * 执行代币兑换
     */
    async executeSwap(request) {
        try {
            logger_1.logger.info('Starting real swap execution:', request);
            // 检查是否有签名者
            if (!this.signer) {
                return {
                    success: false,
                    error: 'No signer available. Please configure LOCAL_PRIVATE_KEY in environment variables.'
                };
            }
            // 检查签名者公钥是否与源钱包匹配
            const fromWallet = await prisma_1.prisma.wallet.findUnique({
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
            const toWallet = await prisma_1.prisma.wallet.findUnique({
                where: { id: request.toWalletId }
            });
            if (!toWallet) {
                return {
                    success: false,
                    error: 'Target wallet not found'
                };
            }
            const fromWalletPubkey = new web3_js_1.PublicKey(fromWallet.address);
            const toWalletPubkey = new web3_js_1.PublicKey(toWallet.address);
            // 检查余额
            const balanceCheck = await this.checkBalances(fromWalletPubkey, request.fromToken, request.amount);
            if (!balanceCheck.sufficient) {
                return {
                    success: false,
                    error: `Insufficient ${request.fromToken} balance. Available: ${balanceCheck.available}, Required: ${request.amount}`
                };
            }
            // 创建交易
            const transaction = new web3_js_1.Transaction();
            if (request.fromToken === 'SOL' && request.toToken === 'FEEDO') {
                return await this.swapSolToFeedo(transaction, fromWalletPubkey, toWalletPubkey, request.amount);
            }
            else if (request.fromToken === 'FEEDO' && request.toToken === 'SOL') {
                return await this.swapFeedoToSol(transaction, fromWalletPubkey, toWalletPubkey, request.amount);
            }
            else {
                return {
                    success: false,
                    error: 'Unsupported swap pair'
                };
            }
        }
        catch (error) {
            logger_1.logger.error('Swap execution failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * SOL -> FEEDO 兑换
     */
    async swapSolToFeedo(transaction, fromWallet, toWallet, solAmount) {
        try {
            logger_1.logger.info(`Executing SOL to FEEDO swap: ${solAmount} SOL`);
            // 1. 从源钱包转移SOL到目标钱包
            const lamports = Math.floor(solAmount * web3_js_1.LAMPORTS_PER_SOL);
            const transferInstruction = web3_js_1.SystemProgram.transfer({
                fromPubkey: fromWallet,
                toPubkey: toWallet,
                lamports: lamports
            });
            transaction.add(transferInstruction);
            // 2. 创建FEEDO代币账户（如果不存在）
            const feudoTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(FEEDO_MINT, toWallet, true);
            try {
                await (0, spl_token_1.getAccount)(this.connection, feudoTokenAccount);
            }
            catch (error) {
                // 代币账户不存在，创建它
                const createAccountInstruction = (0, spl_token_1.createAssociatedTokenAccountInstruction)(fromWallet, // payer
                feudoTokenAccount, // ata
                toWallet, // owner
                FEEDO_MINT // mint
                );
                transaction.add(createAccountInstruction);
            }
            // 3. 铸造FEEDO代币到目标钱包
            const feudoAmount = Math.floor(solAmount * 1000 * 1e6); // 假设FEEDO有6位小数
            const mintInstruction = (0, spl_token_1.createMintToInstruction)(FEEDO_MINT, feudoTokenAccount, fromWallet, // mint authority (需要是mint的authority)
            feudoAmount);
            transaction.add(mintInstruction);
            // 4. 发送交易
            const signature = await (0, web3_js_1.sendAndConfirmTransaction)(this.connection, transaction, [this.signer], {
                commitment: 'confirmed',
                skipPreflight: false
            });
            // 5. 记录到数据库
            await prisma_1.prisma.txRecord.create({
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
            logger_1.logger.info(`SOL to FEEDO swap successful: ${signature}`);
            return {
                success: true,
                transactionSignature: signature,
                fromAmount: solAmount,
                toAmount: solAmount * 1000
            };
        }
        catch (error) {
            logger_1.logger.error('SOL to FEEDO swap failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'SOL to FEEDO swap failed'
            };
        }
    }
    /**
     * FEEDO -> SOL 兑换
     */
    async swapFeedoToSol(transaction, fromWallet, toWallet, feudoAmount) {
        try {
            logger_1.logger.info(`Executing FEEDO to SOL swap: ${feudoAmount} FEEDO`);
            // 1. 检查FEEDO代币余额
            const feudoTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(FEEDO_MINT, fromWallet, true);
            const accountInfo = await (0, spl_token_1.getAccount)(this.connection, feudoTokenAccount);
            const mintInfo = await (0, spl_token_1.getMint)(this.connection, FEEDO_MINT);
            const currentBalance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
            if (currentBalance < feudoAmount) {
                return {
                    success: false,
                    error: `Insufficient FEEDO balance. Available: ${currentBalance}, Required: ${feudoAmount}`
                };
            }
            // 2. 销毁FEEDO代币
            const feudoAmountRaw = Math.floor(feudoAmount * Math.pow(10, mintInfo.decimals));
            const burnInstruction = (0, spl_token_1.createBurnInstruction)(feudoTokenAccount, FEEDO_MINT, fromWallet, // owner
            feudoAmountRaw);
            transaction.add(burnInstruction);
            // 3. 处理SOL转移
            const solAmount = feudoAmount / 1000; // 1000 FEEDO = 1 SOL
            const lamports = Math.floor(solAmount * web3_js_1.LAMPORTS_PER_SOL);
            if (fromWallet.toBase58() === toWallet.toBase58()) {
                // 同一个钱包的内部兑换：从系统储备转移SOL
                // 使用目标钱包作为SOL储备（需要预先存入SOL）
                const reserveWallet = toWallet; // 使用目标钱包作为储备
                const reserveBalance = await this.connection.getBalance(reserveWallet);
                if (reserveBalance < lamports) {
                    return {
                        success: false,
                        error: `Insufficient SOL in reserve wallet for internal swap. Available: ${reserveBalance / web3_js_1.LAMPORTS_PER_SOL}, Required: ${solAmount}. Please ensure the wallet has sufficient SOL for internal swaps.`
                    };
                }
                // 从储备钱包转移SOL到用户钱包
                const transferSolInstruction = web3_js_1.SystemProgram.transfer({
                    fromPubkey: reserveWallet,
                    toPubkey: fromWallet,
                    lamports: lamports
                });
                transaction.add(transferSolInstruction);
                logger_1.logger.info(`Internal swap: ${feudoAmount} FEEDO burned, ${solAmount} SOL transferred from reserve`);
            }
            else {
                // 不同钱包：需要从目标钱包转移SOL到源钱包
                // 检查目标钱包是否有足够的SOL余额
                const toWalletBalance = await this.connection.getBalance(toWallet);
                if (toWalletBalance < lamports) {
                    return {
                        success: false,
                        error: `Insufficient SOL balance in target wallet. Available: ${toWalletBalance / web3_js_1.LAMPORTS_PER_SOL}, Required: ${solAmount}`
                    };
                }
                const transferSolInstruction = web3_js_1.SystemProgram.transfer({
                    fromPubkey: toWallet,
                    toPubkey: fromWallet,
                    lamports: lamports
                });
                transaction.add(transferSolInstruction);
            }
            // 4. 发送交易
            const signature = await (0, web3_js_1.sendAndConfirmTransaction)(this.connection, transaction, [this.signer], {
                commitment: 'confirmed',
                skipPreflight: false
            });
            // 5. 记录到数据库
            await prisma_1.prisma.txRecord.create({
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
            logger_1.logger.info(`FEEDO to SOL swap successful: ${signature}`);
            return {
                success: true,
                transactionSignature: signature,
                fromAmount: feudoAmount,
                toAmount: solAmount
            };
        }
        catch (error) {
            logger_1.logger.error('FEEDO to SOL swap failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'FEEDO to SOL swap failed'
            };
        }
    }
    /**
     * 检查钱包余额
     */
    async checkBalances(walletPubkey, token, requiredAmount) {
        try {
            if (token === 'SOL') {
                const balance = await this.connection.getBalance(walletPubkey);
                const solBalance = balance / web3_js_1.LAMPORTS_PER_SOL;
                return {
                    sufficient: solBalance >= requiredAmount,
                    available: solBalance
                };
            }
            else {
                // FEEDO代币
                const feudoTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(FEEDO_MINT, walletPubkey, true);
                try {
                    const accountInfo = await (0, spl_token_1.getAccount)(this.connection, feudoTokenAccount);
                    const mintInfo = await (0, spl_token_1.getMint)(this.connection, FEEDO_MINT);
                    const feudoBalance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
                    return {
                        sufficient: feudoBalance >= requiredAmount,
                        available: feudoBalance
                    };
                }
                catch (error) {
                    // 代币账户不存在
                    return {
                        sufficient: false,
                        available: 0
                    };
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Balance check failed:', error);
            return {
                sufficient: false,
                available: 0
            };
        }
    }
    /**
     * 获取兑换汇率
     */
    async getSwapRate(fromToken, toToken) {
        // 固定汇率：1 SOL = 1000 FEEDO
        if (fromToken === 'SOL' && toToken === 'FEEDO') {
            return 1000;
        }
        else if (fromToken === 'FEEDO' && toToken === 'SOL') {
            return 0.001;
        }
        return 1;
    }
    /**
     * 获取钱包代币余额
     */
    async getWalletTokenBalance(walletId, token) {
        try {
            const wallet = await prisma_1.prisma.wallet.findUnique({
                where: { id: walletId }
            });
            if (!wallet) {
                return 0;
            }
            const walletPubkey = new web3_js_1.PublicKey(wallet.address);
            if (token === 'SOL') {
                const balance = await this.connection.getBalance(walletPubkey);
                return balance / web3_js_1.LAMPORTS_PER_SOL;
            }
            else {
                const feudoTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(FEEDO_MINT, walletPubkey, true);
                try {
                    const accountInfo = await (0, spl_token_1.getAccount)(this.connection, feudoTokenAccount);
                    const mintInfo = await (0, spl_token_1.getMint)(this.connection, FEEDO_MINT);
                    return Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
                }
                catch (error) {
                    return 0;
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to get wallet token balance:', error);
            return 0;
        }
    }
}
exports.RealSwapService = RealSwapService;
exports.realSwapService = new RealSwapService();
