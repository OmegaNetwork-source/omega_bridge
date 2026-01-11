const { ethers, JsonRpcProvider, Wallet, Contract } = require('ethers');
const fs = require('fs');
require('dotenv').config();

const OMEGA_RPC = 'https://0x4e454228.rpc.aurora-cloud.dev';

async function main() {
    const nftInfo = JSON.parse(fs.readFileSync('omega_nft_deployment.json'));
    console.log("New Contract:", nftInfo.address);

    const provider = new JsonRpcProvider(OMEGA_RPC);
    const wallet = new Wallet(process.env.OMEGA_PRIVATE_KEY, provider);
    const contract = new Contract(nftInfo.address, nftInfo.abi, wallet);

    // Re-mint NFT 0 (your NFT)
    console.log("\nMinting NFT 0...");
    let tx = await contract.mint(
        '0x84648D72E9e9882bd366df6898D66c93780FDb2a', // Your address
        'https://arweave.net/sJx4YxryBeb_mbrti2s1Ize1Aw9477WQBxSBAcWvzwE', // Real URI
        '9HG2xAgjWaNTksLWErZLUxvYBr9D1o8148V7RUAb9hxh' // Solana mint
    );
    await tx.wait();
    console.log("NFT 0 minted!");

    // Re-mint NFT 1 (user's NFT)
    console.log("\nMinting NFT 1...");
    tx = await contract.mint(
        '0x67385A8C40642822174b8Ddc67902E60b14cA9AC', // User's address
        'https://arweave.net/JXU5y3yzaJ_2NBTvUhzOicQm6mRn_7vROcNImYsNwpE', // Real URI
        'AuDC9CBQZq6epM4TvBK3xL3nN82tm411MYseWmcFVPHK' // Solana mint
    );
    await tx.wait();
    console.log("NFT 1 minted!");

    console.log("\nDone! Total tokens:", (await contract.tokenCounter()).toString());
}

main().catch(e => console.error(e));
