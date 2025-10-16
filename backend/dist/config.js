"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appEnv = void 0;
require("dotenv/config");
function getEnv() {
    const port = Number(process.env.PORT ?? '4000');
    return {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        port,
        rpcUrl: process.env.RPC_URL ?? 'https://devnet.helius-rpc.com/?api-key=97921435-08fe-45ec-bd0c-815044268d06',
        heliusApiKey: process.env.HELIUS_API_KEY,
        heliusWebhookSecret: process.env.HELIUS_WEBHOOK_SECRET,
        jupiterBase: process.env.JUPITER_BASE ?? 'https://api.jup.ag',
        databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
        treasuryWallet: process.env.TREASURY_WALLET ?? '',
        targetWallet: process.env.TARGET_WALLET ?? '',
        donationWallet: process.env.DONATION_WALLET ?? '',
        hsmEndpoint: process.env.HSM_ENDPOINT,
        hsmApiKey: process.env.HSM_API_KEY,
        localPrivateKey: process.env.LOCAL_PRIVATE_KEY,
    };
}
exports.appEnv = getEnv();
