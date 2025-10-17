import { request } from 'undici';
import { ProxyAgent } from 'undici';
import { appEnv } from '../config';
import WebSocket from 'ws';

let latestSolPriceUsd: number | null = null;
let wsConnected = false;
let currentWS: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function connectPriceWS() {
  if (wsConnected) return;
  
  // Clean up existing connection and timer
  if (currentWS) {
    try { currentWS.close(); } catch {}
    currentWS = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  try {
    // CoinGecko community stream (fallback used if unavailable)
    // Using Binance ticker as practical fallback
    currentWS = new WebSocket('wss://stream.binance.com:9443/ws/solusdt@ticker');
    currentWS.on('open', () => {
      wsConnected = true;
    });
    currentWS.on('message', (data) => {
      try {
        const json = JSON.parse(data.toString());
        const priceStr = json?.c || json?.p || json?.price;
        const price = priceStr ? Number(priceStr) : undefined;
        if (price && Number.isFinite(price)) {
          latestSolPriceUsd = price;
        }
      } catch {}
    });
    currentWS.on('close', () => {
      wsConnected = false;
      currentWS = null;
      reconnectTimer = setTimeout(connectPriceWS, 3000);
    });
    currentWS.on('error', () => {
      wsConnected = false;
      try { currentWS?.close(); } catch {}
      currentWS = null;
      reconnectTimer = setTimeout(connectPriceWS, 3000);
    });
  } catch {
    reconnectTimer = setTimeout(connectPriceWS, 3000);
  }
}

connectPriceWS();

export async function getSolPriceUsd(): Promise<number> {
  // Prefer websocket price if available
  if (latestSolPriceUsd && latestSolPriceUsd > 0) return latestSolPriceUsd;
  try {
    const opts: any = {
      method: 'GET',
      headers: {
        'User-Agent': 'Feedo-Fund-Bot/1.0'
      }
    } as any;
    if (appEnv.proxyUrl) {
      (opts as any).dispatcher = new ProxyAgent(appEnv.proxyUrl);
    }
    const res = await request('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', opts);
    const json = (await res.body.json()) as any;
    return json?.solana?.usd ?? 195; // 默认价格 $195
  } catch (error) {
    console.warn('Failed to fetch SOL price, using default:', error);
    return 195; // 默认价格 $195
  }
}


