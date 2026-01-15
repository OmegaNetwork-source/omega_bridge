// Manual NFT Unlock Script - Run this to transfer stuck NFT back to user
// Usage: node manual_unlock.js <mint_address> <destination_wallet>

require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer } = require('@solana/spl-token');

const SOLANA_RPC_MAINNET = "https://mainnet.helius-rpc.com/?api-key=94a04704-448e-45a8-82e5-8f4c63b25082";

async function main() {
    const mintStr = process.argv[2] || "9EtU6gtEvTUUZCsnFt3fDTUT2XDxyLDJcrv22eQvZM5H"; // SSS #14
    const destStr = process.argv[3] || "3cRXRqs4BBQJeVZCpKNFjS3ife9ok1HxmEjwe2zX6CLY"; // User wallet
    
    console.log("=== Manual NFT Unlock ===");
    console.log("Mint:", mintStr);
    console.log("Destination:", destStr);
    
    // Load relayer keypair
    if (!process.env.SOLANA_RELAYER_KEYPAIR_JSON) {
        console.error("ERROR: SOLANA_RELAYER_KEYPAIR_JSON not set in .env");
        process.exit(1);
    }
    
    const relayerSolana = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.SOLANA_RELAYER_KEYPAIR_JSON))
    );
    console.log("Relayer wallet:", relayerSolana.publicKey.toString());
    
    const connection = new Connection(SOLANA_RPC_MAINNET, 'confirmed');
    const mint = new PublicKey(mintStr);
    const dest = new PublicKey(destStr);
    
    try {
        // Get Relayer ATA (Source)
        console.log("Getting relayer ATA...");
        const relayerAta = await getOrCreateAssociatedTokenAccount(
            connection,
            relayerSolana,
            mint,
            relayerSolana.publicKey
        );
        console.log("Relayer ATA:", relayerAta.address.toString(), "Balance:", relayerAta.amount.toString());
        
        if (relayerAta.amount === 0n) {
            console.error("ERROR: Relayer doesn't hold this NFT!");
            process.exit(1);
        }
        
        // Get User ATA (Destination)
        console.log("Getting/Creating user ATA...");
        const userAta = await getOrCreateAssociatedTokenAccount(
            connection,
            relayerSolana, // Payer
            mint,
            dest
        );
        console.log("User ATA:", userAta.address.toString());
        
        // Transfer
        console.log("Transferring NFT...");
        const tx = await transfer(
            connection,
            relayerSolana,
            relayerAta.address,
            userAta.address,
            relayerSolana.publicKey,
            1
        );
        
        console.log("✅ SUCCESS! NFT transferred!");
        console.log("Transaction:", tx);
        console.log("View: https://solscan.io/tx/" + tx);
        
    } catch (e) {
        console.error("ERROR:", e.message);
    }
}

main();
