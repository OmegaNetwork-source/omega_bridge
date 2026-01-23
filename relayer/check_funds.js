require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { ethers, JsonRpcProvider, Wallet } = require('ethers');
const fs = require('fs');
const path = require('path');

const SOLANA_RPC = "https://mainnet.helius-rpc.com/?api-key=94a04704-448e-45a8-82e5-8f4c63b25082";
// const OMEGA_RPC = "https://0x4e454228.rpc.aurora-cloud.dev"; // Use .env if possible
const OMEGA_RPC = process.env.OMEGA_RPC_URL || "https://0x4e454228.rpc.aurora-cloud.dev";

async function main() {
    console.log("--- Checking Balances ---");

    // 1. Solana Relayer Balance
    try {
        let keypair;
        if (process.env.SOLANA_RELAYER_KEYPAIR_JSON) {
            const secret = JSON.parse(process.env.SOLANA_RELAYER_KEYPAIR_JSON);
            keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
        } else if (fs.existsSync(path.resolve(__dirname, 'relayer-keypair.json'))) {
             const secret = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'relayer-keypair.json')));
             keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
        }

        if (keypair) {
            const connection = new Connection(SOLANA_RPC, 'confirmed');
            const bal = await connection.getBalance(keypair.publicKey);
            console.log(`Solana Relayer (${keypair.publicKey.toBase58()}): ${bal / 1e9} SOL`);
        } else {
            console.log("Solana Relayer: No keypair found.");
        }
    } catch (e) { console.log("Solana Relayer: Error loading keypair or connecting", e.message); }

    // 2. Omega Relayer Balance (Gas)
    try {
        const provider = new JsonRpcProvider(OMEGA_RPC);
        const OMEGA_PK = process.env.OMEGA_PRIVATE_KEY;
        
        if (!OMEGA_PK) throw new Error("No OMEGA_PRIVATE_KEY env");

        const wallet = new Wallet(OMEGA_PK, provider);
        const bal = await provider.getBalance(wallet.address);
        console.log(`Omega Relayer  (${wallet.address}): ${ethers.formatEther(bal)} OMG`);

    } catch (e) { console.log("Omega Relayer: Error", e.message); }

    // 3. Omega Bridge Contract Balance (Liquidity)
    try {
        const provider = new JsonRpcProvider(OMEGA_RPC);
        // Load address from deployment if possible
        const deployPath = path.resolve(__dirname, 'omega_deployment.json');
        let OMEGA_BRIDGE_ADDRESS;
        if (fs.existsSync(deployPath)) {
            const data = JSON.parse(fs.readFileSync(deployPath));
            OMEGA_BRIDGE_ADDRESS = data.address;
        } else {
            // Fallback
             OMEGA_BRIDGE_ADDRESS = "0x66e5BaCbf34974fEfdd9d7DB5bA07df0Bfd4591f";
        }
       
        const bal = await provider.getBalance(OMEGA_BRIDGE_ADDRESS);
        console.log(`Bridge Contract (${OMEGA_BRIDGE_ADDRESS}): ${ethers.formatEther(bal)} OMG`);

        if (bal === 0n) {
            console.log("\n[WARNING] Bridge Contract has 0 balance!");
            console.log("Transfers from Solana -> Omega will FAIL.");
            console.log("Please send some tokens to the bridge address to provide liquidity.");
        }

    } catch (e) { console.log("Omega Bridge: Error", e.message); }
}

main();
