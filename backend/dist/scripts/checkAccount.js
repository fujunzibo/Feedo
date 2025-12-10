"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
async function checkAccount() {
    const rpcUrl = process.env.RPC_URL || 'https://rpc.ankr.com/solana_devnet';
    const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
    const accountAddress = 'AtAqx8CKKofdBxyvtVQx4CFdKkSmBs4rNC2eb375menk';
    console.log(`Checking account: ${accountAddress}`);
    console.log(`RPC URL: ${rpcUrl}`);
    try {
        // 1. 检查账户是否存在
        const accountInfo = await connection.getAccountInfo(new web3_js_1.PublicKey(accountAddress));
        if (!accountInfo) {
            console.log('❌ Account does not exist or is closed');
            return;
        }
        console.log('✅ Account exists');
        console.log('Account info:', {
            executable: accountInfo.executable,
            owner: accountInfo.owner.toString(),
            lamports: accountInfo.lamports,
            dataLength: accountInfo.data.length,
            rentEpoch: accountInfo.rentEpoch
        });
        // 2. 尝试作为代币账户解析
        try {
            const tokenAccount = await (0, spl_token_1.getAccount)(connection, new web3_js_1.PublicKey(accountAddress));
            console.log('✅ Token account info:', {
                mint: tokenAccount.mint.toString(),
                owner: tokenAccount.owner.toString(),
                amount: tokenAccount.amount.toString(),
                delegate: tokenAccount.delegate?.toString() || 'None',
                // state: tokenAccount.state, // Removed as it doesn't exist in current API
                isNative: tokenAccount.isNative
            });
        }
        catch (tokenError) {
            console.log('❌ Not a valid token account:', tokenError.message);
        }
        // 3. 检查原始数据
        console.log('Raw data (first 100 bytes):', accountInfo.data.slice(0, 100));
    }
    catch (error) {
        console.error('❌ Error checking account:', error);
    }
}
checkAccount().catch(console.error);
