import 'dotenv/config';

export type AppEnv = {
  nodeEnv: string;
  port: number;
  rpcUrl: string;
  heliusApiKey: string | undefined;
  heliusWebhookSecret: string | undefined;
  jupiterBase: string;
  databaseUrl: string;
  treasuryWallet: string;
  targetWallet: string;
  donationWallet: string;
  hsmEndpoint: string | undefined;
  hsmApiKey: string | undefined;
  localPrivateKey: string | undefined;
  targetPrivateKey: string | undefined;
  proxyUrl: string | undefined;
};

function getEnv(): AppEnv {
  const port = Number(process.env.PORT ?? '4000');
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
    localPrivateKey: process.env.LOCAL_PRIVATE_KEY,
    targetPrivateKey: process.env.TARGET_PRIVATE_KEY,
    proxyUrl: process.env.PROXY_URL,
  };
}

export const appEnv = getEnv();


