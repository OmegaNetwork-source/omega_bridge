const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Connect to cluster (Devnet for testing, change to Mainnet for prod)
const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=94a04704-448e-45a8-82e5-8f4c63b25082', 'confirmed');

async function main() {
    // 1. Setup Relayer/Admin Keypair
    // In a real scenario, load this from a secret file.
    // For now, we generate one and save it.
    let relayerKeypair;
    const keyPath = path.resolve(__dirname, '../relayer/relayer-keypair.json');

    if (fs.existsSync(keyPath)) {
        const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keyPath)));
        relayerKeypair = Keypair.fromSecretKey(secretKey);
        console.log("Loaded existing Relayer Keypair:", relayerKeypair.publicKey.toBase58());
    } else {
        relayerKeypair = Keypair.generate();
        console.log("Generated new Relayer Keypair:", relayerKeypair.publicKey.toBase58());
        // Writes the array to file
        fs.writeFileSync(keyPath, JSON.stringify(Array.from(relayerKeypair.secretKey)));
    }

    // Airdrop SOL for fees (only works on devnet)
    console.log("Requesting Airdrop (Skipped - User provided key)...");
    /*
    try {
        const airdropSignature = await connection.requestAirdrop(
            relayerKeypair.publicKey,
            LAMPORTS_PER_SOL,
        );
        await connection.confirmTransaction(airdropSignature);
        console.log("Airdrop confirmed");
    } catch (e) {
        console.log("Airdrop failed (likely mainnet or rate limit), ensure account has SOL");
    }
    */

    // 2. Create the Mint (Wrapped Omega)
    console.log("Creating Mint...");
    const mint = await createMint(
        connection,
        relayerKeypair,
        relayerKeypair.publicKey, // Mint Authority
        relayerKeypair.publicKey, // Freeze Authority
        9 // Decimals
    );

    console.log("Mint Created:", mint.toBase58());

    // 3. Save Info
    const info = {
        mintAddress: mint.toBase58(),
        relayerPublicKey: relayerKeypair.publicKey.toBase58()
    };
    fs.writeFileSync(path.resolve(__dirname, '../relayer/solana_info.json'), JSON.stringify(info, null, 2));
    console.log("Solana Info saved to ../relayer/solana_info.json");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
