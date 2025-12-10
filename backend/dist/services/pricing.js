"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSolPriceUsd = getSolPriceUsd;
const undici_1 = require("undici");
const undici_2 = require("undici");
const config_1 = require("../config");
const ws_1 = __importDefault(require("ws"));
let latestSolPriceUsd = null;
let wsConnected = false;
let currentWS = null;
let reconnectTimer = null;
function connectPriceWS() {
    if (wsConnected)
        return;
    // Clean up existing connection and timer
    if (currentWS) {
        try {
            currentWS.close();
        }
        catch { }
        currentWS = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    try {
        // CoinGecko community stream (fallback used if unavailable)
        // Using Binance ticker as practical fallback
        currentWS = new ws_1.default('wss://stream.binance.com:9443/ws/solusdt@ticker');
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
            }
            catch { }
        });
        currentWS.on('close', () => {
            wsConnected = false;
            currentWS = null;
            reconnectTimer = setTimeout(connectPriceWS, 3000);
        });
        currentWS.on('error', () => {
            wsConnected = false;
            try {
                currentWS?.close();
            }
            catch { }
            currentWS = null;
            reconnectTimer = setTimeout(connectPriceWS, 3000);
        });
    }
    catch {
        reconnectTimer = setTimeout(connectPriceWS, 3000);
    }
}
connectPriceWS();
async function getSolPriceUsd() {
    // Prefer websocket price if available
    if (latestSolPriceUsd && latestSolPriceUsd > 0)
        return latestSolPriceUsd;
    try {
        const opts = {
            method: 'GET',
            headers: {
                'User-Agent': 'Feedo-Fund-Bot/1.0'
            }
        };
        if (config_1.appEnv.proxyUrl) {
            opts.dispatcher = new undici_2.ProxyAgent(config_1.appEnv.proxyUrl);
        }
        const res = await (0, undici_1.request)('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', opts);
        const json = (await res.body.json());
        return json?.solana?.usd ?? 195; // 默认价格 $195
    }
    catch (error) {
        console.warn('Failed to fetch SOL price, using default:', error);
        return 195; // 默认价格 $195
    }
}
