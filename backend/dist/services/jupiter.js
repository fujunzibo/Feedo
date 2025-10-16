"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQuote = getQuote;
exports.buildSwapTransaction = buildSwapTransaction;
const undici_1 = require("undici");
const config_1 = require("../config");
async function getQuote(inputMint, outputMint, amount, slippageBps = 50) {
    const url = `${config_1.appEnv.jupiterBase}/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
    // 重试机制
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`Jupiter quote attempt ${attempt}/3 for ${inputMint} -> ${outputMint}`);
            const res = await (0, undici_1.request)(url, {
                headers: {
                    'User-Agent': 'Feedo-Backend/1.0',
                    'Accept': 'application/json'
                }
            });
            if (res.statusCode >= 400) {
                const errorText = await res.body.text();
                throw new Error(`Jupiter quote failed: ${res.statusCode} - ${errorText}`);
            }
            const quote = await res.body.json();
            console.log(`Jupiter quote successful: ${quote.otherAmountThreshold} output`);
            return quote;
        }
        catch (error) {
            console.error(`Jupiter quote attempt ${attempt} failed:`, error);
            if (attempt === 3) {
                throw new Error(`Jupiter API failed after 3 attempts: ${error.message}`);
            }
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
}
async function buildSwapTransaction(body) {
    // 重试机制
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`Jupiter swap build attempt ${attempt}/3`);
            const res = await (0, undici_1.request)(`${config_1.appEnv.jupiterBase}/v6/swap`, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    'content-type': 'application/json',
                    'User-Agent': 'Feedo-Backend/1.0'
                }
            });
            if (res.statusCode >= 400) {
                const errorText = await res.body.text();
                throw new Error(`Jupiter swap build failed: ${res.statusCode} - ${errorText}`);
            }
            const result = await res.body.json();
            console.log(`Jupiter swap build successful`);
            return result;
        }
        catch (error) {
            console.error(`Jupiter swap build attempt ${attempt} failed:`, error);
            if (attempt === 3) {
                throw new Error(`Jupiter swap build failed after 3 attempts: ${error.message}`);
            }
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
}
