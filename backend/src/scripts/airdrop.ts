import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const connection = new Connection('https://devnet.helius-rpc.com/?api-key=97921435-08fe-45ec-bd0c-815044268d06');
const treasuryAddress = '6mM3eZ1Ne3XgvZMDvdJr2urcBkqWw8XwD5GecWLbpAzN';

async function airdrop() {
  try {
    // 检查当前余额
    const balance = await connection.getBalance(new PublicKey(treasuryAddress));
    console.log('Current treasury balance:', balance / LAMPORTS_PER_SOL, 'SOL');

    // 请求空投
    const signature = await connection.requestAirdrop(new PublicKey(treasuryAddress), 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature);
    console.log('Airdrop successful:', signature);
    
    const newBalance = await connection.getBalance(new PublicKey(treasuryAddress));
    console.log('New treasury balance:', newBalance / LAMPORTS_PER_SOL, 'SOL');
  } catch (error) {
    console.error('Airdrop failed:', error);
  }
}

airdrop();
