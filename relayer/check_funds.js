require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { ethers, JsonRpcProvider, Wallet } = require('ethers');
const fs = require('fs');
const path = require('path');

const SOLANA_RPC = 'https://api.devnet.solana.com';
const OMEGA_RPC = "https://0x4e454228.rpc.aurora-cloud.dev";

async function main() {
    console.log("--- Checking Balances ---");

    // 1. Solana Relayer Balance
    try {
        // In relayer dir, keypair is just 'relayer-keypair.json'
        const secret = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'relayer-keypair.json')));
        const keypair = require('@solana/web3.js').Keypair.fromSecretKey(Uint8Array.from(secret));
        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const bal = await connection.getBalance(keypair.publicKey);
        console.log(`Solana Relayer (${keypair.publicKey.toBase58()}): ${bal / 1e9} SOL`);
    } catch (e) { console.log("Solana Relayer: Error loading keypair or connecting", e.message); }

    // 2. Omega Relayer Balance (Gas)
    try {
        const provider = new JsonRpcProvider(OMEGA_RPC);
        const OMEGA_PK = "ef06caca5dd89a0363c7be3c70125508487e53c40e022955f2774676430df969";
        if (!OMEGA_PK) throw new Error("No private key env");

        const wallet = new Wallet(OMEGA_PK, provider);
        const bal = await provider.getBalance(wallet.address);
        console.log(`Omega Relayer  (${wallet.address}): ${ethers.formatEther(bal)} OMGA`);

    } catch (e) { console.log("Omega Relayer: Error", e.message); }

    // 3. Omega Bridge Contract Balance (Liquidity)
    try {
        const provider = new JsonRpcProvider(OMEGA_RPC);
        // Load address from deployment if possible, or hardcode from previous context
        const OMEGA_BRIDGE_ADDRESS = "0x3E78D4Cd1026a90A582861E55BFf757361863ED8";
        const bal = await provider.getBalance(OMEGA_BRIDGE_ADDRESS);
        console.log(`Bridge Contract (${OMEGA_BRIDGE_ADDRESS}): ${ethers.formatEther(bal)} OMGA`);

        if (bal === 0n) {
            console.log("\n[WARNING] Bridge Contract has 0 OMGA!");
            console.log("Transfers from Solana -> Omega will FAIL.");
            console.log("Please send some OMGA to the bridge address to provide liquidity.");
        }

    } catch (e) { console.log("Omega Bridge: Error", e.message); }
}

main();
