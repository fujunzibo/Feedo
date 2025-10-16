import { request } from 'undici';
import { appEnv } from '../config';

export type JupiterQuote = {
  routePlan: any[];
  otherAmountThreshold: string; // minOut
  slippageBps: number;
};

export async function getQuote(inputMint: string, outputMint: string, amount: string, slippageBps = 50) {
  const url = `${appEnv.jupiterBase}/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  const res = await request(url);
  if (res.statusCode >= 400) throw new Error(`Jupiter quote failed: ${res.statusCode}`);
  return (await res.body.json()) as JupiterQuote;
}

export async function buildSwapTransaction(body: any) {
  const res = await request(`${appEnv.jupiterBase}/v6/swap`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  if (res.statusCode >= 400) throw new Error(`Jupiter swap build failed: ${res.statusCode}`);
  return (await res.body.json()) as any;
}


