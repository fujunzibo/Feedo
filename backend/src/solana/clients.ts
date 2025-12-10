import { Connection, clusterApiUrl } from '@solana/web3.js';
import { appEnv } from '../config';
import { getSigner } from './signer';

export function getConnection(): Connection {
  const url = appEnv.rpcUrl || clusterApiUrl('devnet');
  return new Connection(url, 'confirmed');
}

export { getSigner };

