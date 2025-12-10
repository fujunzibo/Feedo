import { Keypair } from '@solana/web3.js';
import fs from 'fs';

// 生成新的密钥对
const keypair = Keypair.generate();

console.log('Generated new keypair:');
console.log('Public Key (Address):', keypair.publicKey.toBase58());
console.log('Private Key (Array):', JSON.stringify(Array.from(keypair.secretKey)));

// 更新环境变量文件
const envFile = 'environment.bat';
let envContent = fs.readFileSync(envFile, 'utf8');

// 替换 LOCAL_PRIVATE_KEY
envContent = envContent.replace(
  /LOCAL_PRIVATE_KEY = .*/,
  `LOCAL_PRIVATE_KEY = "${JSON.stringify(Array.from(keypair.secretKey))}"`
);

fs.writeFileSync(envFile, envContent);

console.log('\nUpdated environment.bat with new private key');
console.log('Please restart the backend service to use the new keypair');
