import { 
  Connection, 
  Keypair, 
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl
} from '@solana/web3.js';
import { 
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount
} from '@solana/spl-token';
import bs58 from 'bs58';
import { appEnv } from '../config';

async function createNewToken() {
  console.log('Starting token creation...');
  console.log('Environment check:');
  console.log('- RPC_URL:', process.env.RPC_URL || 'https://api.devnet.solana.com');
  console.log('- TREASURY_WALLET:', process.env.TREASURY_WALLET);
  console.log('- TARGET_WALLET:', process.env.TARGET_WALLET);
  console.log('- DONATION_WALLET:', process.env.DONATION_WALLET);
  console.log('- LOCAL_PRIVATE_KEY:', process.env.LOCAL_PRIVATE_KEY ? 'Set' : 'Not set');
  
  const connection = new Connection(process.env.RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
  
  // 从私钥创建 Keypair
  const privateKey = process.env.LOCAL_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('LOCAL_PRIVATE_KEY not set');
  }
  
  // 检查私钥格式并转换
  let secretKey: Uint8Array;
  if (privateKey.length === 128) {
    // 十六进制格式，转换为 Uint8Array
    const hex = privateKey;
    secretKey = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  } else {
    // base58 格式
    secretKey = bs58.decode(privateKey);
  }
  
  const keypair = Keypair.fromSecretKey(secretKey);
  
  console.log('Using keypair:', keypair.publicKey.toBase58());
  
  try {
    console.log('Creating new SPL Token...');
    
    // 创建 mint
    const mint = await createMint(
      connection,
      keypair,
      keypair.publicKey, // mint authority
      keypair.publicKey, // freeze authority set to self
      6 // decimals
    );
    
    console.log(`✅ Token created successfully!`);
    console.log(`Mint Address: ${mint.toBase58()}`);
    console.log(`Decimals: 6`);
    console.log(`Mint Authority: ${keypair.publicKey.toBase58()}`);
    
    // 为金库钱包创建 ATA
    const treasuryPubkey = new PublicKey(process.env.TREASURY_WALLET!);
    const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      treasuryPubkey
    );
    
    console.log(`✅ Treasury ATA created: ${treasuryTokenAccount.address.toBase58()}`);
    
    // 为金库铸造初始供应量 (例如: 1,000,000 tokens)
    const initialSupply = 1_000_000 * Math.pow(10, 6); // 6 decimals
    await mintTo(
      connection,
      keypair,
      mint,
      treasuryTokenAccount.address,
      keypair,
      initialSupply
    );
    
    console.log(`✅ Minted ${1_000_000} tokens to treasury`);
    
    // 为其他钱包创建 ATA
    const targetPubkey = new PublicKey(process.env.TARGET_WALLET!);
    const targetTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      targetPubkey
    );
    
    const donationPubkey = new PublicKey(process.env.DONATION_WALLET!);
    const donationTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      donationPubkey
    );
    
    console.log(`✅ Target ATA created: ${targetTokenAccount.address.toBase58()}`);
    console.log(`✅ Donation ATA created: ${donationTokenAccount.address.toBase58()}`);
    
    // 输出配置信息
    console.log('\n=== 代币配置信息 ===');
    console.log(`Mint Address: ${mint.toBase58()}`);
    console.log(`Decimals: 6`);
    console.log(`Treasury Wallet: ${process.env.TREASURY_WALLET}`);
    console.log(`Target Wallet: ${process.env.TARGET_WALLET}`);
    console.log(`Donation Wallet: ${process.env.DONATION_WALLET}`);
    console.log(`Treasury ATA: ${treasuryTokenAccount.address.toBase58()}`);
    console.log(`Target ATA: ${targetTokenAccount.address.toBase58()}`);
    console.log(`Donation ATA: ${donationTokenAccount.address.toBase58()}`);
    
    return {
      mint: mint.toBase58(),
      decimals: 6,
      treasuryAta: treasuryTokenAccount.address.toBase58(),
      targetAta: targetTokenAccount.address.toBase58(),
      donationAta: donationTokenAccount.address.toBase58()
    };
    
  } catch (error) {
    console.error('Failed to create token:', error);
    throw error;
  }
}

// 直接执行
console.log('Script started');
createNewToken()
  .then((result) => {
    console.log('Token creation completed:', result);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Token creation failed:', error);
    process.exit(1);
  });

export { createNewToken };
