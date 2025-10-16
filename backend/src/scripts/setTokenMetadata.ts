import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID, createUpdateMetadataAccountV2Instruction } from '@metaplex-foundation/mpl-token-metadata';

async function setTokenMetadata() {
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const mintStr = process.env.MINT_ADDRESS;
  const name = process.env.TOKEN_NAME || 'Feedo';
  const symbol = process.env.TOKEN_SYMBOL || 'FEEDO';
  const uri = process.env.TOKEN_URI || 'https://arweave.net/unknown';
  const payerSecret = process.env.LOCAL_PRIVATE_KEY;

  if (!mintStr) throw new Error('MINT_ADDRESS not set');
  if (!payerSecret) throw new Error('LOCAL_PRIVATE_KEY not set');

  const connection = new Connection(rpcUrl, 'confirmed');
  const payer = Keypair.fromSecretKey(bs58.decode(payerSecret));
  const mint = new PublicKey(mintStr);

  console.log('Setting metadata for mint:', mintStr);
  console.log('Name:', name, 'Symbol:', symbol, 'URI:', uri);

  // PDA for metadata account
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );

  console.log('Metadata PDA:', metadataPda.toBase58());

  const accounts = {
    metadata: metadataPda,
    updateAuthority: payer.publicKey,
  } as any;

  const dataV2 = {
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  } as any;

  const ix = createUpdateMetadataAccountV2Instruction(
    accounts,
    { 
      updateMetadataAccountArgsV2: { 
        data: dataV2, 
        updateAuthority: payer.publicKey,
        primarySaleHappened: false,
        isMutable: true 
      } 
    }
  );

  const transaction = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
  console.log('✅ Metadata set successfully!');
  console.log('Transaction signature:', signature);
}

setTokenMetadata().catch((e) => {
  console.error(e);
  process.exit(1);
});


