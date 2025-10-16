"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const mpl_token_metadata_1 = require("@metaplex-foundation/mpl-token-metadata");
async function setTokenMetadata() {
    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const mintStr = process.env.MINT_ADDRESS;
    const name = process.env.TOKEN_NAME || 'Feedo';
    const symbol = process.env.TOKEN_SYMBOL || 'FEEDO';
    const uri = process.env.TOKEN_URI || 'https://arweave.net/unknown';
    const payerSecret = process.env.LOCAL_PRIVATE_KEY;
    if (!mintStr)
        throw new Error('MINT_ADDRESS not set');
    if (!payerSecret)
        throw new Error('LOCAL_PRIVATE_KEY not set');
    const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
    const payer = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(payerSecret));
    const mint = new web3_js_1.PublicKey(mintStr);
    console.log('Setting metadata for mint:', mintStr);
    console.log('Name:', name, 'Symbol:', symbol, 'URI:', uri);
    // PDA for metadata account
    const [metadataPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('metadata'), mpl_token_metadata_1.PROGRAM_ID.toBuffer(), mint.toBuffer()], mpl_token_metadata_1.PROGRAM_ID);
    console.log('Metadata PDA:', metadataPda.toBase58());
    const accounts = {
        metadata: metadataPda,
        updateAuthority: payer.publicKey,
    };
    const dataV2 = {
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
    };
    const ix = (0, mpl_token_metadata_1.createUpdateMetadataAccountV2Instruction)(accounts, {
        updateMetadataAccountArgsV2: {
            data: dataV2,
            updateAuthority: payer.publicKey,
            primarySaleHappened: false,
            isMutable: true
        }
    });
    const transaction = new web3_js_1.Transaction().add(ix);
    const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [payer]);
    console.log('✅ Metadata set successfully!');
    console.log('Transaction signature:', signature);
}
setTokenMetadata().catch((e) => {
    console.error(e);
    process.exit(1);
});
