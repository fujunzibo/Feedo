"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSolPriceUsd = getSolPriceUsd;
const undici_1 = require("undici");
async function getSolPriceUsd() {
    // 重试机制
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`SOL price fetch attempt ${attempt}/3`);
            const res = await (0, undici_1.request)('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
                headers: {
                    'User-Agent': 'Feedo-Backend/1.0',
                    'Accept': 'application/json'
                }
            });
            if (res.statusCode >= 400) {
                throw new Error(`CoinGecko API failed: ${res.statusCode}`);
            }
            const json = (await res.body.json());
            const price = json?.solana?.usd;
            if (price && price > 0) {
                console.log(`SOL price found: $${price}`);
                return price;
            }
            throw new Error('Invalid price data received');
        }
        catch (error) {
            console.error(`SOL price fetch attempt ${attempt} failed:`, error);
            if (attempt === 3) {
                console.warn('Using default SOL price $100 after 3 failed attempts');
                return 100; // 默认 SOL 价格
            }
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
    return 100; // 默认 SOL 价格
}
