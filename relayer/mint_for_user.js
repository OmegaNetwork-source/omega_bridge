const { ethers, JsonRpcProvider, Wallet, Contract } = require('ethers');
const fs = require('fs');
require('dotenv').config();

const OMEGA_RPC = 'https://0x4e454228.rpc.aurora-cloud.dev';
// User's Omega address
const TARGET = '0x67385A8C40642822174b8Ddc67902E60b14cA9AC';
// We need to find the Solana mint - for now use placeholder, we'll update
const SOLANA_MINT = process.argv[2] || 'UNKNOWN_MINT';
const URI = 'https://arweave.net/solar-sentries/' + SOLANA_MINT;

async function main() {
    console.log("Manual Mint for User");
    console.log("====================");
    console.log("Target:", TARGET);
    console.log("Solana Mint:", SOLANA_MINT);

    const nftInfo = JSON.parse(fs.readFileSync('omega_nft_deployment.json'));
    console.log("Contract:", nftInfo.address);

    const provider = new JsonRpcProvider(OMEGA_RPC);
    const wallet = new Wallet(process.env.OMEGA_PRIVATE_KEY, provider);
    console.log("Relayer:", wallet.address);

    const contract = new Contract(nftInfo.address, nftInfo.abi, wallet);

    const tx = await contract.mint(TARGET, URI, SOLANA_MINT);
    console.log("TX Hash:", tx.hash);
    await tx.wait();
    console.log("SUCCESS!");

    const counter = await contract.tokenCounter();
    console.log("Total tokens minted:", counter.toString());
}

main().catch(e => console.error("Error:", e.message));
