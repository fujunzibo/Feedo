import { request } from 'undici';
import { ProxyAgent } from 'undici';
import { appEnv } from '../config';
import https from 'https';
import { URL } from 'url';

// Test network connectivity first
async function testConnectivity(url: string): Promise<boolean> {
  try {
    console.log(`Testing connectivity to: ${url}`);
    
    // 尝试使用 Node.js 内置的 fetch
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: AbortSignal.timeout(10000)
    });
    console.log(`Connectivity test result: ${response.status}`);
    return response.ok;
  } catch (error) {
    console.log(`Connectivity test failed: ${error}`);
    
    // 尝试使用 undici 进行测试
    try {
      console.log(`Trying undici for connectivity test...`);
      const res = await request(url, { 
        method: 'HEAD'
      });
      console.log(`Undici connectivity test result: ${res.statusCode}`);
      return res.statusCode < 400;
    } catch (undiciError) {
      console.log(`Undici connectivity test also failed: ${undiciError}`);
      return false;
    }
  }
}

export type JupiterQuote = {
  routePlan: any[];
  otherAmountThreshold: string; // minOut
  slippageBps: number;
};

export async function getQuote(inputMint: string, outputMint: string, amount: string, slippageBps = 50) {
  console.log('=== Jupiter getQuote called ===');
  console.log(`Input mint: ${inputMint}`);
  console.log(`Output mint: ${outputMint}`);
  console.log(`Amount: ${amount}`);
  console.log(`Slippage: ${slippageBps}`);
  
  // Try multiple Jupiter endpoints for better reliability
  // 使用 IP 地址绕过 DNS 污染问题
  const endpoints = [
    'https://108.160.166.9',  // quote-api.jup.ag 的正确 IP
    'https://quote-api.jup.ag',
    'https://api.jup.ag'
  ];
  
  const baseUrl = appEnv.jupiterBase || endpoints[0];
  const url = `${baseUrl}/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Full URL: ${url}`);
  
  const opts: any = {
    // Add retry configuration
    retry: {
      retries: 5,
    },
    // Force IPv4 to avoid IPv6 issues
    family: 4,
    // Add headers for better compatibility
    headers: {
      'User-Agent': 'Feedo-Fund-Bot/1.0',
      'Accept': 'application/json',
      'Connection': 'keep-alive'
    }
  };
  // Temporarily disable proxy to avoid 502 errors
  // if (appEnv.proxyUrl) {
  //   opts.dispatcher = new ProxyAgent(appEnv.proxyUrl);
  // }
  
  let lastError: any;
  
  // Test connectivity first
  const isConnected = await testConnectivity(baseUrl);
  if (!isConnected) {
    console.log(`Primary endpoint ${baseUrl} is not reachable, trying alternatives...`);
  }

  // Try primary endpoint first
  try {
    console.log(`Attempting to connect to Jupiter API: ${baseUrl}`);
    const res = await request(url, opts);
    if (res.statusCode >= 400) throw new Error(`Jupiter quote failed: ${res.statusCode}`);
    console.log(`Successfully connected to Jupiter API: ${baseUrl}`);
    return (await res.body.json()) as JupiterQuote;
  } catch (e: any) {
    lastError = e;
    console.log(`Primary endpoint failed: ${e.message}`);
    console.log(`Error details: code=${e.code}, name=${e.name}`);
    
    // 尝试使用 Node.js 内置 https 模块
    try {
      console.log(`Trying Node.js built-in https module...`);
      const result = await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            'User-Agent': 'Feedo-Fund-Bot/1.0',
            'Accept': 'application/json'
          },
          timeout: 30000
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTPS request failed: ${res.statusCode}`));
            } else {
              resolve(JSON.parse(data));
            }
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('HTTPS request timeout')));
        req.end();
      });
      
      console.log(`HTTPS module succeeded!`);
      return result as JupiterQuote;
    } catch (httpsError) {
      console.log(`HTTPS module also failed: ${httpsError}`);
    }
  }
  
  // Try alternative endpoints
  for (const endpoint of endpoints) {
    if (endpoint === baseUrl) continue; // Skip already tried endpoint
    
    try {
      const altUrl = `${endpoint}/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
      console.log(`Trying alternative endpoint: ${endpoint}`);
      const res = await request(altUrl, opts);
      if (res.statusCode >= 400) throw new Error(`Jupiter quote failed: ${res.statusCode}`);
      return (await res.body.json()) as JupiterQuote;
    } catch (e: any) {
      lastError = e;
      console.log(`Alternative endpoint ${endpoint} failed: ${e.message}`);
    }
  }
  
  // All endpoints failed
  const code = lastError?.code ? ` code=${lastError.code}` : '';
  const name = lastError?.name ? ` name=${lastError.name}` : '';
  const cause = lastError?.cause ? ` cause=${lastError.cause?.message || lastError.cause}` : '';
  const msg = lastError?.message || String(lastError);
  throw new Error(`getQuote error: ${msg}${name}${code}${cause} url=${url}`);
}

export async function buildSwapTransaction(body: any) {
  const opts: any = {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    // Add retry configuration
    retry: {
      retries: 3,
    },
    // Force IPv4 to avoid IPv6 issues
    family: 4
  } as any;
  // Temporarily disable proxy to avoid 502 errors
  // if (appEnv.proxyUrl) {
  //   (opts as any).dispatcher = new ProxyAgent(appEnv.proxyUrl);
  // }
  const url = `${appEnv.jupiterBase}/v6/swap`;
  try {
    const res = await request(url, opts);
    if (res.statusCode >= 400) throw new Error(`Jupiter swap build failed: ${res.statusCode}`);
    return (await res.body.json()) as any;
  } catch (e: any) {
    const code = e?.code ? ` code=${e.code}` : '';
    const name = e?.name ? ` name=${e.name}` : '';
    const cause = e?.cause ? ` cause=${e.cause?.message || e.cause}` : '';
    const msg = e?.message || String(e);
    throw new Error(`buildSwapTransaction error: ${msg}${name}${code}${cause} url=${url}`);
  }
}


