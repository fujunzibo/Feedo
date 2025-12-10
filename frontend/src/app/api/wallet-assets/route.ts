import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getConnection } from '@/lib/solana';
import { getSolPriceUsd } from '@/lib/pricing';
import { PublicKey } from '@solana/web3.js';
// @ts-ignore
import { getAssociatedTokenAddress, getAccount, getMint } from '@solana/spl-token';

// 简单的内存缓存（Vercel Serverless 中每个实例独立）
let walletAssetsCache: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30秒缓存

export async function GET(request: NextRequest) {
  try {
    // 检查缓存
    const now = Date.now();
    if (walletAssetsCache && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        wallets: walletAssetsCache,
        timestamp: new Date().toISOString(),
        cached: true
      });
    }

    const wallets = await prisma.wallet.findMany();
    const connection = getConnection();
    const mintAddress = process.env.MINT_ADDRESS || '5n8sDdBMjsLwtLRVpcFrhFcGa4cXdaUiWKKwNyos8fFK';

    // 并行获取SOL价格
    const solPricePromise = getSolPriceUsd();
    const tokenPriceUsd = 0.001; // FEEDO代币固定价格

    const walletAssets = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const pubkey = new PublicKey(wallet.address);
          
          // 获取 SOL 余额
          const solBalance = await connection.getBalance(pubkey);
          const solBalanceFormatted = solBalance / 1000000000;
          
          // 获取代币余额
          let tokenBalanceFormatted = 0;
          try {
            const tokenAccount = await getAssociatedTokenAddress(
              new PublicKey(mintAddress),
              pubkey
            );
            const accountInfo = await getAccount(connection, tokenAccount);
            const mintInfo = await getMint(connection, new PublicKey(mintAddress));
            const tokenBalance = Number(accountInfo.amount);
            tokenBalanceFormatted = tokenBalance / Math.pow(10, mintInfo.decimals);
          } catch {
            tokenBalanceFormatted = 0;
          }
          
          const solPriceUsd = await solPricePromise;
          
          return {
            id: wallet.id,
            name: wallet.name,
            type: wallet.type,
            address: wallet.address,
            solBalance: solBalanceFormatted,
            solBalanceUsd: solBalanceFormatted * solPriceUsd,
            tokenBalance: tokenBalanceFormatted,
            tokenBalanceUsd: tokenBalanceFormatted * tokenPriceUsd,
            totalUsd: solBalanceFormatted * solPriceUsd + tokenBalanceFormatted * tokenPriceUsd
          };
        } catch (error) {
          console.error(`Error fetching assets for wallet ${wallet.address}:`, error);
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
      })
    );

    // 更新缓存
    walletAssetsCache = walletAssets;
    cacheTimestamp = now;

    return NextResponse.json({
      success: true,
      wallets: walletAssets,
      timestamp: new Date().toISOString(),
      cached: false
    });
  } catch (error) {
    console.error('Failed to fetch wallet assets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wallet assets' },
      { status: 500 }
    );
  }
}

