import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// 将 base58 私钥转换为数组格式
const base58PrivateKey = '2YaSyQSmJSDMqVNGvVwJmWzW2fLGUXUzZFhqttFFQGA2tD6LyA4Fnrr8QqCgtCWWQzwFSPJy3JjdaCVypUWR8GKt';

try {
  // 从 base58 解码
  const privateKeyBytes = bs58.decode(base58PrivateKey);
  
  // 转换为数组格式
  const privateKeyArray = Array.from(privateKeyBytes);
  
  console.log('Base58 Private Key:', base58PrivateKey);
  console.log('Array Private Key:', JSON.stringify(privateKeyArray));
  
  // 验证密钥对
  const keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
  console.log('Public Key (Address):', keypair.publicKey.toBase58());
  
  // 验证是否与原始地址匹配
  const originalAddress = '6mM3eZ1Ne3XgvZMDvdJr2urcBkqWw8XwD5GecWLbpAzN';
  if (keypair.publicKey.toBase58() === originalAddress) {
    console.log('✅ 私钥验证成功！地址匹配');
  } else {
    console.log('❌ 私钥验证失败！地址不匹配');
    console.log('期望地址:', originalAddress);
    console.log('实际地址:', keypair.publicKey.toBase58());
  }
  
} catch (error) {
  console.error('转换失败:', error);
}
