"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appEnv = void 0;
require("dotenv/config");
function getEnv() {
    const port = Number(process.env.PORT ?? '4000');
    console.log('process.env.LOCAL_PRIVATE_KEY:', process.env.LOCAL_PRIVATE_KEY);
    return {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        port,
        rpcUrl: process.env.RPC_URL ?? 'https://api.devnet.solana.com',
        heliusApiKey: process.env.HELIUS_API_KEY,
        heliusWebhookSecret: process.env.HELIUS_WEBHOOK_SECRET,
        jupiterBase: process.env.JUPITER_BASE ?? 'https://quote-api.jup.ag',
        databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
        treasuryWallet: process.env.TREASURY_WALLET ?? '',
        targetWallet: process.env.TARGET_WALLET ?? '',
        donationWallet: process.env.DONATION_WALLET ?? '',
        hsmEndpoint: process.env.HSM_ENDPOINT,
        hsmApiKey: process.env.HSM_API_KEY,
        localPrivateKey: '[77,63,94,98,244,101,110,176,236,71,253,159,65,64,109,61,239,107,118,182,14,225,244,232,153,219,84,86,149,238,144,154,85,166,167,234,8,136,173,101,61,63,5,64,255,30,66,173,39,32,32,165,12,224,72,149,3,146,205,157,56,192,199,91]',
        targetPrivateKey: process.env.TARGET_PRIVATE_KEY,
        proxyUrl: process.env.PROXY_URL,
        demoMode: process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'development',
    };
}
exports.appEnv = getEnv();
