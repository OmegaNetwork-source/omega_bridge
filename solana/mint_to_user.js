const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { mintTo, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=94a04704-448e-45a8-82e5-8f4c63b25082', 'confirmed');

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: node mint_to_user.js <RECIPIENT_SOLANA_KEY> [AMOUNT]");
        return;
    }

    const recipient = new PublicKey(args[0]);
    const amount = args[1] ? parseFloat(args[1]) : 100; // Default 100 tokens

    // Load Relayer (Mint Authority)
    const relayerKeyPath = path.resolve(__dirname, '../relayer/relayer-keypair.json');
    if (!fs.existsSync(relayerKeyPath)) {
        console.error("Relayer keypair needed to mint.");
        return;
    }
    const relayerSecret = Uint8Array.from(JSON.parse(fs.readFileSync(relayerKeyPath)));
    const relayer = Keypair.fromSecretKey(relayerSecret);

    // Load Mint Info
    const info = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../relayer/solana_info.json')));
    const mintPubkey = new PublicKey(info.mintAddress);

    console.log(`Minting ${amount} Wrapped Omega to ${recipient.toBase58()}...`);

    // Get/Create ATA
    const userATA = await getOrCreateAssociatedTokenAccount(
        connection,
        relayer,
        mintPubkey,
        recipient
    );

    // Mint
    const tx = await mintTo(
        connection,
        relayer,
        mintPubkey,
        userATA.address,
        relayer,
        amount * 10 ** 9 // 9 decimals
    );

    console.log(`Success! Transaction: ${tx}`);
}

main().catch(console.error);
