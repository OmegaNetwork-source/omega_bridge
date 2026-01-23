require('dotenv').config();
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { 
    createMint, 
    getOrCreateAssociatedTokenAccount, 
    mintTo,
    TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const { 
    createCreateMetadataAccountV3Instruction,
    PROGRAM_ID: METADATA_PROGRAM_ID
} = require('@metaplex-foundation/mpl-token-metadata');

async function deployToken() {
    console.log('🚀 Deploying Omega Token on Solana Mainnet...\n');

    // Load keypair from .env
    const keypairJson = process.env.SOLANA_RELAYER_KEYPAIR_JSON;
    if (!keypairJson) {
        console.error('❌ SOLANA_RELAYER_KEYPAIR_JSON not found in .env');
        process.exit(1);
    }

    const secretKey = Uint8Array.from(JSON.parse(keypairJson));
    const payer = Keypair.fromSecretKey(secretKey);
    console.log('📍 Deployer Address:', payer.publicKey.toBase58());

    // Connect to Mainnet
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Check balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log('💰 Balance:', balance / 1e9, 'SOL');
    
    if (balance < 0.05 * 1e9) {
        console.error('❌ Insufficient balance. Need at least 0.05 SOL for deployment.');
        process.exit(1);
    }

    // Token parameters
    const TOKEN_NAME = 'Omega';
    const TOKEN_SYMBOL = 'OMGA';
    const TOKEN_DECIMALS = 9;
    const TOTAL_SUPPLY = 1_000_000_000; // 1 billion

    console.log('\n📊 Token Parameters:');
    console.log('   Name:', TOKEN_NAME);
    console.log('   Symbol:', TOKEN_SYMBOL);
    console.log('   Decimals:', TOKEN_DECIMALS);
    console.log('   Total Supply:', TOTAL_SUPPLY.toLocaleString());

    try {
        // Step 1: Create the token mint
        console.log('\n⏳ Step 1: Creating token mint...');
        const mint = await createMint(
            connection,
            payer,           // Payer
            payer.publicKey, // Mint authority
            payer.publicKey, // Freeze authority (can be set to null later)
            TOKEN_DECIMALS   // Decimals
        );
        console.log('✅ Mint created:', mint.toBase58());

        // Step 2: Create token account for the payer
        console.log('\n⏳ Step 2: Creating token account...');
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            mint,
            payer.publicKey
        );
        console.log('✅ Token Account:', tokenAccount.address.toBase58());

        // Step 3: Mint the total supply
        console.log('\n⏳ Step 3: Minting', TOTAL_SUPPLY.toLocaleString(), 'tokens...');
        const mintAmount = BigInt(TOTAL_SUPPLY) * BigInt(10 ** TOKEN_DECIMALS);
        await mintTo(
            connection,
            payer,
            mint,
            tokenAccount.address,
            payer,
            mintAmount
        );
        console.log('✅ Minted', TOTAL_SUPPLY.toLocaleString(), 'tokens!');

        // Step 4: Create metadata
        console.log('\n⏳ Step 4: Creating metadata...');
        const [metadataPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                METADATA_PROGRAM_ID.toBuffer(),
                mint.toBuffer(),
            ],
            METADATA_PROGRAM_ID
        );

        const metadataData = {
            name: TOKEN_NAME,
            symbol: TOKEN_SYMBOL,
            uri: '', // Can add metadata URI later
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null,
        };

        const createMetadataIx = createCreateMetadataAccountV3Instruction(
            {
                metadata: metadataPDA,
                mint: mint,
                mintAuthority: payer.publicKey,
                payer: payer.publicKey,
                updateAuthority: payer.publicKey,
            },
            {
                createMetadataAccountArgsV3: {
                    data: metadataData,
                    isMutable: true,
                    collectionDetails: null,
                },
            }
        );

        const tx = new Transaction().add(createMetadataIx);
        const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
        console.log('✅ Metadata created! Tx:', sig);

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('🎉 TOKEN DEPLOYED SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log('Mint Address:', mint.toBase58());
        console.log('Token Account:', tokenAccount.address.toBase58());
        console.log('Owner:', payer.publicKey.toBase58());
        console.log('Total Supply:', TOTAL_SUPPLY.toLocaleString(), TOKEN_SYMBOL);
        console.log('\nView on Solscan: https://solscan.io/token/' + mint.toBase58());
        console.log('='.repeat(60));

        // Save to file
        const fs = require('fs');
        const tokenInfo = {
            name: TOKEN_NAME,
            symbol: TOKEN_SYMBOL,
            decimals: TOKEN_DECIMALS,
            totalSupply: TOTAL_SUPPLY,
            mintAddress: mint.toBase58(),
            tokenAccount: tokenAccount.address.toBase58(),
            owner: payer.publicKey.toBase58(),
            network: 'mainnet-beta',
            deployedAt: new Date().toISOString()
        };
        fs.writeFileSync('omega_token_mainnet.json', JSON.stringify(tokenInfo, null, 2));
        console.log('\n📁 Token info saved to omega_token_mainnet.json');

    } catch (error) {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    }
}

deployToken();
