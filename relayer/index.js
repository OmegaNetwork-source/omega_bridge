const path = require('path');
const http = require('http');
require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { mintTo, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const { ethers, JsonRpcProvider, Wallet, Contract } = require('ethers');
const fs = require('fs');

// Health check server for Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'omega-bridge-relayer' }));
}).listen(PORT, () => console.log(`Health check server on port ${PORT}`));

// --- Configuration ---
const SOLANA_RPC = 'https://api.devnet.solana.com';
const SOLANA_RPC_MAINNET = "https://mainnet.helius-rpc.com/?api-key=94a04704-448e-45a8-82e5-8f4c63b25082";
const OMEGA_RPC = "https://0x4e454228.rpc.aurora-cloud.dev"; // Omega Network RPC
const OMEGA_PK = process.env.OMEGA_PRIVATE_KEY;

// Load Keys
let relayerSolana; // Keypair
let relayerOmega;  // Wallet (ethers)

// Load Solana Info
let solanaInfo;
try {
    const solData = fs.readFileSync(path.resolve(__dirname, 'solana_info.json'));
    solanaInfo = JSON.parse(solData);

    let secret;
    if (process.env.SOLANA_RELAYER_KEYPAIR_JSON) {
        secret = JSON.parse(process.env.SOLANA_RELAYER_KEYPAIR_JSON);
    } else {
        secret = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'relayer-keypair.json')));
    }
    relayerSolana = Keypair.fromSecretKey(Uint8Array.from(secret));
} catch (e) {
    console.error("Missing Solana configuration (run solana/setup_token.js first).");
    // process.exit(1); // Don't exit to allow partial code review
}

// Load Omega Info
let omegaInfo;
// Load Omega NFT Info (Solar Sentries)
let omegaNftInfo;
try {
    const omegaNftData = fs.readFileSync(path.resolve(__dirname, 'omega_nft_deployment.json'));
    omegaNftInfo = JSON.parse(omegaNftData);
} catch (e) {
    console.warn("Missing Omega NFT (Solar Sentries) deployment info.");
    omegaNftInfo = { address: "0x0000000000000000000000000000000000000000", abi: [] };
}

// Load SSS (Secret Serpent Society) NFT Info
let omegaSssInfo;
try {
    const sssData = fs.readFileSync(path.resolve(__dirname, 'omega_sss_deployment.json'));
    omegaSssInfo = JSON.parse(sssData);
} catch (e) {
    console.warn("Missing Omega SSS (Secret Serpent Society) deployment info.");
    omegaSssInfo = { address: "0x0000000000000000000000000000000000000000", abi: [] };
}

// Collection IDs for identifying which collection an NFT belongs to
const SOLAR_SENTRIES_COLLECTION = "73958f3cf787aeec6276c6b5493ed966e07d55d7bd05e7abfe4e9bc7e31712f5"; // Placeholder - update if needed
const SECRET_SERPENT_COLLECTION = "73958f3cf787aeec6276c6b5493ed966e07d55d7bd05e7abfe4e9bc7e31712f5"; // SSS collection hash

async function main() {
    console.log("Starting Bridge Relayer...");

    // 1. Setup Connections
    const solConnection = new Connection(SOLANA_RPC, 'confirmed');
    const solMainnetConnection = new Connection(SOLANA_RPC_MAINNET, 'confirmed');

    let omegaProvider, omegaWallet, omegaContract, omegaNftContract, omegaSssContract;
    try {
        omegaProvider = new JsonRpcProvider(OMEGA_RPC);
        omegaWallet = new Wallet(OMEGA_PK, omegaProvider);
        if (omegaInfo && omegaInfo.abi && omegaInfo.abi.length > 0) {
            omegaContract = new Contract(omegaInfo.address, omegaInfo.abi, omegaWallet);
        }
        if (omegaNftInfo.abi.length > 0) {
            omegaNftContract = new Contract(omegaNftInfo.address, omegaNftInfo.abi, omegaWallet);
        }
        if (omegaSssInfo.abi.length > 0) {
            omegaSssContract = new Contract(omegaSssInfo.address, omegaSssInfo.abi, omegaWallet);
        }
    } catch (e) { console.error("Omega connection setup failed:", e); }

    console.log(`Listening on Solana (${solanaInfo?.mintAddress})...`);
    console.log(`  Solar Sentries Contract: ${omegaNftInfo?.address}`);
    console.log(`  Secret Serpent Contract: ${omegaSssInfo?.address}`);

    // ...

    async function processNftBridge(mintAddress, targetOmegaAddress) {
        console.log(`Processing NFT Bridge: ${mintAddress} -> ${targetOmegaAddress}`);

        try {
            // 1. Fetch Metadata from Solana (MAINNET)
            console.log("Step 1: Fetching Solana Metadata...");
            const metadata = await fetchSolanaMetadata(solMainnetConnection, mintAddress);
            if (!metadata) {
                console.error("Failed to fetch metadata for", mintAddress);
                return;
            }
            console.log("Fetched Metadata:", metadata.name, "|", metadata.symbol, "|", metadata.uri);

            // 2. Determine which collection this NFT belongs to
            let targetContract;
            let collectionName;

            if (metadata.symbol === 'SSS' || (metadata.name && metadata.name.includes('Secret Serpent'))) {
                targetContract = omegaSssContract;
                collectionName = 'Secret Serpent Society';
            } else if (metadata.symbol === 'SDS' || (metadata.name && metadata.name.includes('Solar Sent'))) {
                targetContract = omegaNftContract;
                collectionName = 'Solar Sentries';
            } else {
                // Default to Solar Sentries for unknown
                targetContract = omegaNftContract;
                collectionName = 'Unknown (defaulting to Solar Sentries)';
            }

            if (!targetContract) {
                console.error(`CRITICAL: No contract available for ${collectionName}`);
                return;
            }

            console.log(`Collection detected: ${collectionName}`);

            // 3. Mint on Omega
            console.log("Step 2: Sending Mint Transaction...");
            const tx = await targetContract.mint(targetOmegaAddress, metadata.uri, mintAddress);
            console.log(`Minted Wrapped NFT on Omega: ${tx.hash}. Waiting for confirmation...`);
            await tx.wait();
            console.log("NFT Bridge Confirmed.");

        } catch (e) {
            console.error("Failed to bridge NFT:", e);
        }
    }

    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

    async function fetchSolanaMetadata(connection, mint) {
        try {
            const [metadataPda] = await PublicKey.findProgramAddress(
                [
                    Buffer.from('metadata'),
                    METADATA_PROGRAM_ID.toBuffer(),
                    new PublicKey(mint).toBuffer()
                ],
                METADATA_PROGRAM_ID
            );
            const info = await connection.getAccountInfo(metadataPda);
            if (!info) return null;

            // Minimal Decode
            const buffer = info.data;
            // Structure: [Key (1)] [UpdateAuth (32)] [Mint (32)] [NameStr] [SymbolStr] [UriStr] ...
            let offset = 1 + 32 + 32;
            const nameLen = buffer.readUInt32LE(offset);
            offset += 4;
            const name = buffer.slice(offset, offset + nameLen).toString('utf-8').replace(/\0/g, '');
            offset += nameLen;
            const symbolLen = buffer.readUInt32LE(offset);
            offset += 4;
            const symbol = buffer.slice(offset, offset + symbolLen).toString('utf-8').replace(/\0/g, '');
            offset += symbolLen;
            const uriLen = buffer.readUInt32LE(offset);
            offset += 4;
            const uri = buffer.slice(offset, offset + uriLen).toString('utf-8').replace(/\0/g, '');

            return { name, symbol, uri };
        } catch (e) {
            console.error("Metadata fetch error:", e);
            return null;
        }
    }

    // --- Solana Listener (NFT Deposits -> Relayer Wallet) ---
    if (relayerSolana) {
        const relayerPubkey = relayerSolana.publicKey;
        console.log(`Starting NFT Listener on Relayer Wallet: ${relayerPubkey.toString()}...`);
        console.log("Connecting to Mainnet RPC:", SOLANA_RPC_MAINNET);

        let lastNftSignature = null;
        let isPolling = false;

        // Heartbeat to prove life in logs
        setInterval(() => console.log(`[Heartbeat] NFT Bridge Service is alive (${new Date().toLocaleTimeString()})`), 60000);

        const pollNftBridge = async () => {
            if (isPolling) return; // Prevention
            isPolling = true;

            try {
                // Listen on MAINNET
                const signatures = await solMainnetConnection.getSignaturesForAddress(relayerPubkey, { limit: 20, until: lastNftSignature });

                if (signatures.length > 0) console.log(`[Debug] Found ${signatures.length} signatures. Processing...`);

                // Process oldest first
                for (const sigInfo of signatures.reverse()) {
                    if (sigInfo.err) continue;

                    try {
                        // Log that we see a signature (debug)
                        console.log("Checking sig:", sigInfo.signature);

                        // Wait 1s to allow RPC propagation
                        await new Promise(r => setTimeout(r, 1000));

                        const tx = await solMainnetConnection.getTransaction(sigInfo.signature, {
                            maxSupportedTransactionVersion: 0,
                            commitment: 'confirmed'
                        });

                        if (!tx) {
                            console.log(`[Warn] getTransaction returned null for ${sigInfo.signature}. Skipping.`);
                            continue;
                        }

                        const memo = extractMemo(tx);
                        const transfer = extractIncomingTransfer(tx, relayerPubkey);

                        if (transfer && memo) {
                            console.log(`[NFT Bridge] Deposit Detected: ${transfer.mint} -> ${memo}`);
                            await processNftBridge(transfer.mint, memo);
                        }

                        // Update watermark to prevent re-processing
                        lastNftSignature = sigInfo.signature;

                    } catch (err) {
                        console.error("Error processing tx:", sigInfo.signature, err.message);
                    }
                }
            } catch (e) {
                console.error("Error polling NFT deposits:", e.message);
            } finally {
                isPolling = false;
                setTimeout(pollNftBridge, 5000); // Wait 5s before next poll
            }
        };

        // Start the loop
        pollNftBridge();
    }
    if (solanaInfo) {
        const mintPubkey = new PublicKey(solanaInfo.mintAddress);

        // Listen to logs for the Mint Address (Burn instructions usually involve the mint)
        // Note: For SPL Token, logs might not always contain the mint address nicely on the top level unless indexed.
        // A better way for "Burn" is to listen to the Token Program logs generally, but that's too noisy.
        // We will listen to the Relayer account if we were using a Vault. 
        // For "Burn", we have to accept we might need to poll signatures or use an indexing service (Helius/Shyft) for production.
        // For this demo: We poll `getSignaturesForAddress` of the Mint/Token Account? 
        // No, `Burn` instructions don't always show up on Mint's history in older RPCs? On devnet it should work.
        // ACTUALLY: The standard "Burn" emits a log "Instruction: Burn".

        console.log("Starting Solana Poll Loop...");

        let lastSignature = null;
        setInterval(async () => {
            try {
                // Fetch recent transaction signatures on the Mint
                // Note: The Mint address appears in Burn transactions.
                const signatures = await solConnection.getSignaturesForAddress(mintPubkey, { limit: 10, until: lastSignature });

                for (const sigInfo of signatures.reverse()) {
                    if (sigInfo.err) continue;
                    lastSignature = sigInfo.signature;

                    const tx = await solConnection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
                    if (!tx) continue;

                    // Analyze Transaction for Burn + Memo
                    // 1. Check for Burn Instruction
                    // 2. Check for Memo Instruction

                    const memo = extractMemo(tx);
                    const burnAmount = extractBurnAmount(tx, mintPubkey);

                    if (burnAmount > 0n && memo) {
                        console.log(`[Solana -> Omega] Detected Burn: ${burnAmount.toString()} (raw) to ${memo}`);
                        await releaseOnOmega(memo, burnAmount);
                    }
                }
            } catch (e) { console.error("Error polling Solana:", e.message); }
        }, 5000); // Poll every 5 seconds
    }



    // --- Omega Listener (Lock -> Mint on Solana) ---
    if (omegaContract) {
        console.log("Starting Omega Event Listener...");
        omegaContract.on("Locked", async (sender, amount, solanaAddress, event) => {
            console.log(`[Omega -> Solana] Detected Lock: ${ethers.formatEther(amount)} form ${sender} to ${solanaAddress}`);
            await mintOnSolana(solanaAddress, amount);
        });
    }

    // --- Helpers ---
    function extractIncomingTransfer(tx, targetPubkey) {
        if (!tx.meta || !tx.meta.postTokenBalances || !tx.meta.preTokenBalances) return null;

        const targetStr = targetPubkey.toString();

        for (const post of tx.meta.postTokenBalances) {
            if (post.owner === targetStr) {
                const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
                const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
                const postAmount = BigInt(post.uiTokenAmount.amount);

                if (postAmount > preAmount && post.uiTokenAmount.decimals === 0 && (postAmount - preAmount) === 1n) {
                    return { mint: post.mint, amount: 1 };
                }
            }
        }
        return null;
    }

    async function releaseOnOmega(targetAddress, amountWei) {
        if (!omegaContract) return;
        try {
            console.log(`Processing Release to ${targetAddress}...`);
            // Convert amount if decimals differ? 
            // Solana SPL = 9 decimals. Omega Native = 18 decimals usually.
            // conversion: Amount * 10^(18-9) = Amount * 10^9
            const adjustedAmount = BigInt(amountWei) * BigInt(10 ** 9);

            const tx = await omegaContract.release(targetAddress, adjustedAmount);
            console.log(`Release Tx Sent: ${tx.hash}`);
            await tx.wait();
            console.log("Release Confirmed.");
        } catch (e) {
            console.error("Failed to release on Omega:", e);
        }
    }

    async function mintOnSolana(targetAddress, amountWei) {
        if (!relayerSolana || !solanaInfo) return;
        try {
            console.log(`Processing Mint to ${targetAddress}...`);
            // Conversion: Omega (18) -> Solana (9)
            // Amount / 10^9
            const adjustedAmount = BigInt(amountWei) / BigInt(10 ** 9);

            const destPubkey = new PublicKey(targetAddress);
            const mintPubkey = new PublicKey(solanaInfo.mintAddress);

            // Get/Create ATA
            const userATA = await getOrCreateAssociatedTokenAccount(
                solConnection,
                relayerSolana,
                mintPubkey,
                destPubkey
            );

            // Mint
            const tx = await mintTo(
                solConnection,
                relayerSolana,
                mintPubkey,
                userATA.address,
                relayerSolana,
                adjustedAmount
            );
            console.log(`Mint Tx Confirmed: ${tx}`);

        } catch (e) {
            console.error("Failed to mint on Solana:", e);
        }
    }
}

// Helpers
const bs58 = require('bs58');

// ... (existing imports)

function extractMemo(tx) {
    // Look for SPL Memo Program
    // Program ID: Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo
    if (!tx.meta || !tx.meta.logMessages) return null;

    // Sometimes memo is in instructions data. Simple parsing:
    // In production, we iterate over tx.transaction.message.instructions

    for (const ix of tx.transaction.message.instructions) {
        // Check programId index mapping
        const progIdKey = tx.transaction.message.accountKeys[ix.programIdIndex];
        const progIdStr = progIdKey.toString();

        if (tx.transaction.signatures[0].startsWith("5pt3")) {
            console.log(`[DEBUG 5pt3] Instruction Program: ${progIdStr}`);
        }

        // Support both Memo v1 and v2
        if (progIdStr === "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo" ||
            progIdStr === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcQb") {

            let dataBuffer = ix.data;
            if (typeof ix.data === 'string') {
                try {
                    dataBuffer = bs58.decode(ix.data);
                } catch (e) {
                    // if decode fails, maybe it's not base58? ignore.
                    console.log("Memo decode failed", e);
                    continue;
                }
            }
            return new TextDecoder().decode(dataBuffer);
        }
    }
    return null;
}

function extractBurnAmount(tx, mintPubkey) {
    // Check pre/post token balances.
    // If Mint Supply decreases or Source Account balance decreases without transfer?
    // Easiest is checking `meta.balanceChanges` or `meta.preTokenBalances` vs `meta.postTokenBalances`.

    // Find the account related to the mint that changed.
    // Note: Burn reduces supply.

    // Naive check: Did any account burn tokens?
    // We expect 1 account (the user's ATA) to decrease in balance, and 0 destination.

    if (!tx.meta || !tx.meta.preTokenBalances || !tx.meta.postTokenBalances) return 0n;

    // Find the relevant ATA change
    for (const pre of tx.meta.preTokenBalances) {
        if (pre.mint !== mintPubkey.toBase58()) continue;

        const post = tx.meta.postTokenBalances.find(p => p.accountIndex === pre.accountIndex);
        if (post) {
            const diff = BigInt(pre.uiTokenAmount.amount) - BigInt(post.uiTokenAmount.amount);
            if (diff > 0n) return diff;
        }
    }
    return 0n;
}

main().catch(console.error);

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

function extractIncomingTransfer(tx, targetWalletPubkey) {
    if (!tx || !tx.meta) return null;

    // We look for a balance INCREASE on the target wallet
    // for ANY mint (since we accept any NFT in the whitelist)
    const targetStr = targetWalletPubkey.toBase58();

    const postBalances = tx.meta.postTokenBalances || [];
    const preBalances = tx.meta.preTokenBalances || [];

    console.log(`[Debug Meta] PostBalances Count: ${postBalances.length}`);
    if (postBalances.length > 0) {
        console.log("Sample PostBalance Owner:", postBalances[0].owner);
    }

    for (const post of postBalances) {
        // Debug: Log everything we see to find why it skips
        // console.log(`[Scan] Mint: ${post.mint}, Owner: ${post.owner}, Target: ${targetStr}`);

        if (post.owner !== targetStr) continue;

        // Find corresponding pre-balance
        const pre = preBalances.find(p => p.accountIndex === post.accountIndex);

        let preAmount = 0n;
        if (pre) {
            preAmount = BigInt(pre.uiTokenAmount.amount);
        }

        const postAmount = BigInt(post.uiTokenAmount.amount);

        console.log(`[Balance Check] Mint:${post.mint} Owner:${post.owner} Pre:${preAmount} Post:${postAmount}`);

        // Check if balance increased
        if (postAmount > preAmount) {
            console.log(`Debug: Balance increased for ${post.mint}. Pre: ${preAmount}, Post: ${postAmount}`);
            return {
                mint: post.mint,
                amount: postAmount - preAmount // Usually 1 for NFT
            };
        }
    }
    return null;
}
