const path = require('path');
const http = require('http');
require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { mintTo, getOrCreateAssociatedTokenAccount, transfer } = require('@solana/spl-token');
const { ethers, JsonRpcProvider, Wallet, Contract } = require('ethers');
const fs = require('fs');

// File to persist processed NFT signatures (prevents duplicate minting on restart)
const PROCESSED_SIGS_FILE = path.join(__dirname, 'processed_nft_sigs.json');
const PROCESSED_BURNS_FILE = path.join(__dirname, 'processed_omega_burns.json');

// Load previously processed signatures
let processedNftSignatures = new Set();
try {
    if (fs.existsSync(PROCESSED_SIGS_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROCESSED_SIGS_FILE, 'utf-8'));
        processedNftSignatures = new Set(data);
        console.log(`Loaded ${processedNftSignatures.size} processed NFT signatures from disk.`);
    }
} catch (e) {
    console.warn("Could not load processed signatures file:", e.message);
}

// Load previously processed Omega burns
let processedOmegaBurns = new Set();
try {
    if (fs.existsSync(PROCESSED_BURNS_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROCESSED_BURNS_FILE, 'utf-8'));
        processedOmegaBurns = new Set(data);
        console.log(`Loaded ${processedOmegaBurns.size} processed Omega burns from disk.`);
    }
} catch (e) {
    console.warn("Could not load processed burns file:", e.message);
}

// Save processed signature to disk
function saveProcessedSignature(sig) {
    processedNftSignatures.add(sig);
    try {
        fs.writeFileSync(PROCESSED_SIGS_FILE, JSON.stringify([...processedNftSignatures]), 'utf-8');
    } catch (e) {
        console.error("Failed to save processed signature:", e.message);
    }
}

// Save processed burn to disk (tokenId-txHash format)
function saveProcessedBurn(burnId) {
    processedOmegaBurns.add(burnId);
    try {
        fs.writeFileSync(PROCESSED_BURNS_FILE, JSON.stringify([...processedOmegaBurns]), 'utf-8');
    } catch (e) {
        console.error("Failed to save processed burn:", e.message);
    }
}

// Health check server for Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'omega-bridge-relayer' }));
}).listen(PORT, () => console.log(`Health check server on port ${PORT}`));

// --- Configuration ---
const SOLANA_RPC = 'https://api.devnet.solana.com';
const SOLANA_RPC_MAINNET = "https://mainnet.helius-rpc.com/?api-key=94a04704-448e-45a8-82e5-8f4c63b25082";
const OMEGA_RPC = "https://0x4e4542bc.rpc.aurora-cloud.dev/"; // Omega Network RPC
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

// Load Omega Token Bridge Info
let omegaInfo;
try {
    const omegaData = fs.readFileSync(path.resolve(__dirname, 'omega_deployment.json'));
    omegaInfo = JSON.parse(omegaData);
    console.log("Loaded Omega Token Bridge:", omegaInfo.address);
} catch (e) {
    console.warn("Missing Omega Token Bridge deployment info (omega_deployment.json).");
    omegaInfo = { address: "0x0000000000000000000000000000000000000000", abi: [] };
}

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

    // In-memory lock to prevent concurrent processing of same Solana mint
    const processingMints = new Set();

    // ...

    async function processNftBridge(mintAddress, targetOmegaAddress) {
        console.log(`Processing NFT Bridge: ${mintAddress} -> ${targetOmegaAddress}`);

        // CONCURRENT PROCESSING LOCK: Prevent multiple simultaneous mints for same NFT
        if (processingMints.has(mintAddress)) {
            console.log(`[SKIP] Mint ${mintAddress} is already being processed. Skipping.`);
            return;
        }
        processingMints.add(mintAddress);

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

            // 2.5. DUPLICATE CHECK: Check if this Solana mint already exists on Omega
            // Optimized: Check in batches and from newest to oldest (duplicates more likely recent)
            console.log("Checking for existing wrapped NFT on Omega...");
            try {
                const tokenCounter = Number(await targetContract.tokenCounter());
                const checkAbi = ['function originalSolanaMint(uint256) view returns (string)'];
                const checkContract = new Contract(targetContract.target, checkAbi, omegaProvider);
                
                // Check in batches of 5, from newest to oldest
                const BATCH_SIZE = 5;
                for (let start = tokenCounter - 1; start >= 0; start -= BATCH_SIZE) {
                    const batchEnd = Math.max(0, start - BATCH_SIZE + 1);
                    const promises = [];
                    
                    for (let i = start; i >= batchEnd; i--) {
                        promises.push(
                            checkContract.originalSolanaMint(i)
                                .then(mint => ({ id: i, mint }))
                                .catch(() => null) // Token might be burned
                        );
                    }
                    
                    const results = await Promise.all(promises);
                    
                    for (const result of results) {
                        if (result && result.mint === mintAddress) {
                            console.log(`[SKIP] NFT already exists on Omega! Token ID: ${result.id}, Solana Mint: ${mintAddress}`);
                            return; // Don't mint duplicate
                        }
                    }
                }
                console.log("No existing wrapped NFT found, proceeding to mint...");
            } catch (e) {
                console.warn("Duplicate check failed, proceeding anyway:", e.message);
            }

            // 3. Mint on Omega
            console.log("Step 2: Sending Mint Transaction...");
            const tx = await targetContract.mint(targetOmegaAddress, metadata.uri, mintAddress);
            console.log(`Minted Wrapped NFT on Omega: ${tx.hash}. Waiting for confirmation...`);
            await tx.wait();
            console.log("NFT Bridge Confirmed.");

        } catch (e) {
            console.error("Failed to bridge NFT:", e);
        } finally {
            // Always release the lock when done
            processingMints.delete(mintAddress);
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

        let isPolling = false;

        // Heartbeat to prove life in logs
        setInterval(() => console.log(`[Heartbeat] NFT Bridge Service is alive (${new Date().toLocaleTimeString()})`), 60000);

        const pollNftBridge = async () => {
            if (isPolling) return; // Prevention
            isPolling = true;

            try {
                // Listen on MAINNET - get latest signatures (newest first by default)
                // Don't use 'until' or 'before' - just get the latest 20 signatures each time
                // We rely on processedNftSignatures Set to skip already-processed ones
                const signatures = await solMainnetConnection.getSignaturesForAddress(relayerPubkey, { limit: 20 });

                if (signatures.length > 0) console.log(`[Debug] Found ${signatures.length} signatures. Processing...`);

                // Process oldest first (reverse the array since API returns newest first)
                for (const sigInfo of signatures.reverse()) {
                    if (sigInfo.err) continue;

                    try {
                        // Log that we see a signature (debug)
                        console.log("Checking sig:", sigInfo.signature);

                        // Retry loop for getTransaction to handle RPC delays
                        let tx = null;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            // Exponential backoff: 1s, 2s, 4s
                            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));

                            tx = await solMainnetConnection.getTransaction(sigInfo.signature, {
                                maxSupportedTransactionVersion: 0,
                                commitment: 'confirmed'
                            });

                            if (tx && tx.meta) break;
                            console.log(`[Warn] Attempt ${attempt} failed (tx=${!!tx}, meta=${!!(tx && tx.meta)}) for ${sigInfo.signature}. Retrying...`);
                        }

                        if (!tx || !tx.meta) {
                            console.error(`[Error] Failed to fetch tx+meta for ${sigInfo.signature} after 3 attempts. Skipping.`);
                            continue;
                        }

                        // Valid TX found
                        console.log(`[Debug] Processing ${sigInfo.signature} (Meta OK)`);

                        // DUPLICATE PREVENTION: Skip if already processed
                        if (processedNftSignatures.has(sigInfo.signature)) {
                            console.log(`[Skip] Signature ${sigInfo.signature.slice(0,8)}... already processed. Skipping.`);
                            continue;
                        }

                        console.log("Calling extractMemo...");
                        const memo = extractMemo(tx);
                        console.log("Memo extracted:", memo);

                        console.log("Calling analyzeTransfer with:", relayerPubkey ? relayerPubkey.toString() : "NULL");
                        const transfer = analyzeTransfer(tx, relayerPubkey);

                        if (transfer && memo) {
                            console.log(`[NFT Bridge] Deposit Detected: ${transfer.mint} -> ${memo}`);
                            await processNftBridge(transfer.mint, memo);
                            
                            // Save this signature as processed to prevent future duplicates
                            saveProcessedSignature(sigInfo.signature);
                        }

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
    // --- Solana Token Bridge: Poll for burns (Solana -> Omega) ---
    if (solanaInfo) {
        const mintPubkey = new PublicKey(solanaInfo.mintAddress);
        console.log("Starting Solana Token Burn Poll Loop...");
        
        let lastSignature = null;
        const processedFile = path.resolve(__dirname, 'processed_token_sigs.json');
        
        // Load last processed signature
        if (fs.existsSync(processedFile)) {
            try {
                const loaded = JSON.parse(fs.readFileSync(processedFile, 'utf8'));
                if (loaded.lastSignature) {
                    lastSignature = loaded.lastSignature;
                    console.log(`Loaded last processed signature: ${lastSignature}`);
                }
            } catch (e) { console.error("Error loading token sigs:", e.message); }
        }

        setInterval(async () => {
            try {
                // Fetch signatures newer than lastSignature
                // If lastSignature is null, it fetches latest. 
                // We should probably limit to avoid processing *everything* on fresh start, 
                // but for now 20 is fine.
                const options = { limit: 20 };
                if (lastSignature) {
                    options.until = lastSignature;
                }
                
                const signatures = await solConnection.getSignaturesForAddress(mintPubkey, options);
                
                // Process oldest first
                for (const sigInfo of signatures.reverse()) {
                    if (sigInfo.err) continue;
                    
                    console.log(`Checking sig: ${sigInfo.signature}`);
                    
                    const tx = await solConnection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
                    if (!tx) continue;

                    const memo = extractMemo(tx);
                    const burnAmount = extractBurnAmount(tx, mintPubkey);

                    if (burnAmount > 0n && memo) {
                        console.log(`[Solana -> Omega] Detected Burn: ${burnAmount.toString()} (raw) to ${memo}`);
                        await releaseOnOmega(memo, burnAmount);
                    }
                    
                    // Update state
                    lastSignature = sigInfo.signature;
                    fs.writeFileSync(processedFile, JSON.stringify({ lastSignature }));
                }
            } catch (e) { console.error("Error polling Solana:", e.message); }
        }, 10000); // 10s poll
    }



    // --- Omega Token Listener (Lock -> Mint on Solana) ---
    if (omegaContract) {
        console.log("Starting Omega Token Event Listener...");
        omegaContract.on("Locked", async (sender, amount, solanaAddress, event) => {
            console.log(`[Omega -> Solana] Detected Lock: ${ethers.formatEther(amount)} from ${sender} to ${solanaAddress}`);
            await mintOnSolana(solanaAddress, amount);
        });
    }

    // --- Omega NFT Listener (Burn -> Unlock on Solana) ---
    const handleOmegaBurn = async (from, tokenId, solanaMint, solanaDestination, txHash) => {
        // Create unique burn ID for deduplication
        const burnId = `${tokenId.toString()}-${txHash || 'event'}`;
        
        // Check if already processed
        if (processedOmegaBurns.has(burnId)) {
            console.log(`[Skip] Burn ${burnId} already processed. Skipping.`);
            return;
        }
        
        console.log(`[Omega -> Solana] Burn Detected: TokenID ${tokenId} by ${from}`);
        console.log(`Target: ${solanaDestination}, Mint: ${solanaMint}`);
        
        await unlockNftOnSolana(solanaMint, solanaDestination);
        
        // Save as processed after successful unlock
        saveProcessedBurn(burnId);
    };

    if (omegaNftContract) {
        console.log("Listening for Solar Sentries Burns...");
        omegaNftContract.on("WrappedBurned", (from, tokenId, solanaMint, solanaDestination, event) => {
            handleOmegaBurn(from, tokenId, solanaMint, solanaDestination, event?.transactionHash);
        });
    }
    if (omegaSssContract) {
        console.log("Listening for Secret Serpent Burns...");
        omegaSssContract.on("WrappedBurned", (from, tokenId, solanaMint, solanaDestination, event) => {
            handleOmegaBurn(from, tokenId, solanaMint, solanaDestination, event?.transactionHash);
        });
    }

    // --- FALLBACK: Poll for missed Omega burn events (every 60s) ---
    const pollOmegaBurns = async () => {
        console.log("[Burn Poll] Checking for missed burn events...");
        
        const contracts = [
            { contract: omegaNftContract, name: "Solar Sentries" },
            { contract: omegaSssContract, name: "Secret Serpent Society" }
        ];
        
        for (const { contract, name } of contracts) {
            if (!contract) continue;
            
            try {
                // Query last 100 blocks for burn events
                const currentBlock = await omegaProvider.getBlockNumber();
                const fromBlock = Math.max(0, currentBlock - 100);
                
                const filter = contract.filters.WrappedBurned();
                const events = await contract.queryFilter(filter, fromBlock, currentBlock);
                
                for (const event of events) {
                    const [from, tokenId, solanaMint, solanaDestination] = event.args;
                    await handleOmegaBurn(from, tokenId, solanaMint, solanaDestination, event.transactionHash);
                }
                
                if (events.length > 0) {
                    console.log(`[Burn Poll] Found ${events.length} burns in ${name}`);
                }
            } catch (e) {
                console.warn(`[Burn Poll] Error checking ${name}:`, e.message);
            }
        }
    };
    
    // Run burn poll every 60 seconds
    setInterval(pollOmegaBurns, 60000);
    // Also run once on startup
    setTimeout(pollOmegaBurns, 5000);

    async function unlockNftOnSolana(mintStr, destinationStr) {
        try {
            console.log(`Unlocking NFT ${mintStr} to ${destinationStr}...`);
            const mint = new PublicKey(mintStr);
            const dest = new PublicKey(destinationStr);

            // 1. Get Relayer ATA (Source - Funded)
            const relayerAta = await getOrCreateAssociatedTokenAccount(
                solMainnetConnection, // Use Mainnet Connection
                relayerSolana,
                mint,
                relayerSolana.publicKey
            );

            // 1.5. BALANCE CHECK: Verify relayer actually holds this NFT
            if (relayerAta.amount === 0n) {
                console.error(`[ERROR] Relayer doesn't hold NFT ${mintStr}! Cannot unlock.`);
                console.error(`Relayer ATA: ${relayerAta.address.toString()} has 0 balance`);
                return;
            }
            console.log(`Relayer holds NFT (Balance: ${relayerAta.amount.toString()})`);

            // 2. Get User ATA (Dest)
            const userAta = await getOrCreateAssociatedTokenAccount(
                solMainnetConnection,
                relayerSolana, // Payer
                mint,
                dest
            );

            // 3. Transfer
            const tx = await transfer(
                solMainnetConnection,
                relayerSolana, // Payer
                relayerAta.address, // From
                userAta.address, // To
                relayerSolana.publicKey, // Owner
                1 // Amount
            );

            console.log(`Unlocked NFT on Solana! Tx: ${tx}`);

        } catch (e) {
            console.error("Failed to unlock NFT:", e);
        }
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
        
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Processing Mint to ${targetAddress}... (attempt ${attempt}/${maxRetries})`);
                // Conversion: Omega (18) -> Solana (9)
                // Amount / 10^9
                const adjustedAmount = BigInt(amountWei) / BigInt(10 ** 9);

                const destPubkey = new PublicKey(targetAddress);
                const mintPubkey = new PublicKey(solanaInfo.mintAddress);

                // Create fresh connection for each attempt to get fresh blockhash
                const freshConnection = new Connection(SOLANA_RPC_MAINNET, {
                    commitment: 'confirmed',
                    confirmTransactionInitialTimeout: 60000
                });

                // Get/Create ATA
                const userATA = await getOrCreateAssociatedTokenAccount(
                    freshConnection,
                    relayerSolana,
                    mintPubkey,
                    destPubkey
                );

                // Mint with fresh connection
                const tx = await mintTo(
                    freshConnection,
                    relayerSolana,
                    mintPubkey,
                    userATA.address,
                    relayerSolana,
                    adjustedAmount
                );
                console.log(`✅ Mint Tx Confirmed: ${tx}`);
                return; // Success, exit retry loop

            } catch (e) {
                console.error(`Mint attempt ${attempt} failed:`, e.message);
                if (attempt === maxRetries) {
                    console.error("Failed to mint on Solana after all retries:", e);
                } else {
                    console.log(`Waiting 2s before retry...`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
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

    // Handle both legacy and versioned (v0) transaction formats
    let instructions = tx.transaction.message.instructions;
    
    // For versioned transactions, instructions might be in compiledInstructions
    if (!instructions || !Array.isArray(instructions)) {
        instructions = tx.transaction.message.compiledInstructions;
    }
    
    // Still not found? Try to extract from log messages as fallback
    if (!instructions || !Array.isArray(instructions)) {
        // Fallback: Look for memo in log messages
        for (const log of tx.meta.logMessages) {
            if (log.includes('Memo (len')) {
                // Format: "Program log: Memo (len 42): \"0x84648D72E9e9882bd366df6898D66c93780FDb2a\""
                const match = log.match(/Memo \(len \d+\): "(.+)"/);
                if (match) return match[1];
            }
        }
        return null;
    }

    // Get account keys (handles both legacy and versioned formats)
    let accountKeys = tx.transaction.message.accountKeys;
    if (!accountKeys && tx.transaction.message.staticAccountKeys) {
        accountKeys = tx.transaction.message.staticAccountKeys;
    }

    for (const ix of instructions) {
        // Handle Parsed vs Legacy vs Compiled
        let progIdStr;
        if (ix.programId) {
            progIdStr = ix.programId.toString(); // Parsed format
        } else if (ix.programIdIndex !== undefined && accountKeys) {
            const progIdKey = accountKeys[ix.programIdIndex];
            progIdStr = progIdKey?.toString() || progIdKey;
        } else {
            continue;
        }

        // Support both Memo v1 and v2
        if (progIdStr === "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo" ||
            progIdStr === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcQb") {

            // Handle Helius "parsed" format
            if (ix.parsed && typeof ix.parsed === 'string') {
                return ix.parsed;
            }
            if (ix.parsed) { 
                console.log("Memo parsed object:", JSON.stringify(ix.parsed));
            }

            let dataBuffer = ix.data;
            if (!dataBuffer) continue; 

            // Handle Base58 encoded string data (common in raw RPC responses)
            if (typeof ix.data === 'string') {
                try {
                    dataBuffer = bs58.decode(ix.data);
                } catch (e) {
                    // Try simple utf8 buffer if bs58 fails? Unlikely for RPC but possible
                    dataBuffer = Buffer.from(ix.data);
                }
            }

            try {
                const memo = new TextDecoder().decode(dataBuffer);
                // Clean up any null bytes or non-printable chars
                return memo.replace(/\0/g, '').trim(); 
            } catch (e) {
                console.log("Memo decode failed", e);
            }
        }
    }
    
    // Fallback: Check logs again but looser
    if (tx.meta && tx.meta.logMessages) {
        for (const log of tx.meta.logMessages) {
             // Sometimes logs are "Program log: Memo (len ..): "
             // But sometimes just have the data if it's printed
             const match = log.match(/Memo \(len \d+\): "(.+)"/);
             if (match) return match[1];
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

    // CRITICAL: Ensure this was actually a BURN instruction, not just a transfer
    // Check logs for "Instruction: Burn"
    const hasBurnInstruction = tx.meta.logMessages?.some(log => 
        log.includes('Instruction: Burn') || 
        log.includes('Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success') // Fallback if instruction name hidden?
    );

    // If we can't find clear evidence of a burn, strict check logs for "Burn"
    if (!tx.meta.logMessages?.some(l => l.includes('Instruction: Burn'))) {
        // Double check: Maybe it's a BurnChecked?
        if (!tx.meta.logMessages?.some(l => l.includes('Instruction: BurnChecked'))) {
            return 0n;
        }
    }

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

function analyzeTransfer(tx, targetWalletPubkey) {
    console.log("[DEBUG] Entered analyzeTransfer");
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
