require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { mintTo, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const { ethers, JsonRpcProvider, Wallet, Contract } = require('ethers');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const SOLANA_RPC = 'https://api.devnet.solana.com';
const OMEGA_RPC = "https://0x4e454228.rpc.aurora-cloud.dev"; // Omega Network RPC

// Load Keys
let relayerSolana; // Keypair
let relayerOmega;  // Wallet (ethers)

// Load Solana Info
let solanaInfo;
try {
    const solData = fs.readFileSync(path.resolve(__dirname, 'solana_info.json'));
    solanaInfo = JSON.parse(solData);
    const secret = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'relayer-keypair.json')));
    relayerSolana = Keypair.fromSecretKey(Uint8Array.from(secret));
} catch (e) {
    console.error("Missing Solana configuration (run solana/setup_token.js first).");
    // process.exit(1); // Don't exit to allow partial code review
}

// Load Omega Info
let omegaInfo;
try {
    const omegaData = fs.readFileSync(path.resolve(__dirname, 'omega_deployment.json'));
    omegaInfo = JSON.parse(omegaData);
} catch (e) {
    console.warn("Missing Omega deployment info (run omega/deploy.js first). Using placeholders.");
    omegaInfo = { address: "0x0000000000000000000000000000000000000000", abi: [] };
}

// Omega Private Key (Env) or Placeholder
const OMEGA_PK = process.env.OMEGA_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000012345678";


async function main() {
    console.log("Starting Bridge Relayer...");

    // 1. Setup Connections
    const solConnection = new Connection(SOLANA_RPC, 'confirmed');

    let omegaProvider, omegaWallet, omegaContract;
    try {
        omegaProvider = new JsonRpcProvider(OMEGA_RPC);
        omegaWallet = new Wallet(OMEGA_PK, omegaProvider);
        if (omegaInfo.abi.length > 0) {
            omegaContract = new Contract(omegaInfo.address, omegaInfo.abi, omegaWallet);
        }
    } catch (e) { console.log("Omega connection setup failed (check keys)."); }

    console.log(`Listening on Solana (${solanaInfo?.mintAddress}) and Omega (${omegaInfo?.address})...`);

    // --- Solana Listener (Burn -> Release on Omega) ---
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

    // --- Handlers ---

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
        if (progIdKey.toString() === "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo") {
            let dataBuffer = ix.data;
            if (typeof ix.data === 'string') {
                dataBuffer = bs58.decode(ix.data);
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
