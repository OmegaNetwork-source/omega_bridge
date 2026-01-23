require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, burn, getAccount } = require('@solana/spl-token');

async function burnSupply() {
    console.log('🔥 Burning Relayer Token Supply...\n');

    const keypairJson = process.env.SOLANA_RELAYER_KEYPAIR_JSON;
    if (!keypairJson) { console.error('❌ No keypair'); process.exit(1); }
    
    const secretKey = Uint8Array.from(JSON.parse(keypairJson));
    const owner = Keypair.fromSecretKey(secretKey);
    console.log('📍 Relayer:', owner.publicKey.toBase58());

    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const mint = new PublicKey('FmHnkkzEGchswea7AX1KcM6hsNMF7uBzamVkoCvnFMby');

    // Get Relayer ATA
    const ata = await getAssociatedTokenAddress(mint, owner.publicKey);
    console.log('📦 Token Account:', ata.toBase58());

    try {
        const account = await getAccount(connection, ata);
        const amount = Number(account.amount);
        console.log('💰 Current Balance:', (amount / 1e9).toLocaleString(), 'OMGA');

        if (amount === 0) {
            console.log('✅ Balance is already 0. Nothing to burn.');
            return;
        }

        console.log('\n⏳ Burning entire balance...');
        const tx = await burn(
            connection,
            owner,
            ata,
            mint,
            owner,
            account.amount // Burn everything
        );
        console.log('✅ Burn Configured. Tx:', tx);
        console.log('🔥 Supply successfully reset!');

    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}

burnSupply();
