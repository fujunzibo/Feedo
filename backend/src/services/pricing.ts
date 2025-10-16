import { request } from 'undici';

export async function getSolPriceUsd(): Promise<number> {
  try {
    const res = await request('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      method: 'GET',
      headers: {
        'User-Agent': 'Feedo-Fund-Bot/1.0'
      }
    });
    const json = (await res.body.json()) as any;
    return json?.solana?.usd ?? 100; // 默认价格 $100
  } catch (error) {
    console.warn('Failed to fetch SOL price, using default:', error);
    return 100; // 默认价格 $100
  }
}


