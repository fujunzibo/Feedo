import { Connection } from '@solana/web3.js';

let connection: Connection | null = null;

export function getConnection(): Connection {
  if (!connection) {
    const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    connection = new Connection(rpcUrl, 'confirmed');
  }
  return connection;
}

