require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { ethers, JsonRpcProvider, Wallet } = require('ethers');
const bs58 = require('bs58');

// Config
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const OMEGA_RPC = 'https://0x4e4542bc.rpc.aurora-cloud.dev/';
const OMEGA_BRIDGE_ADDRESS = '0xdC43DCAE0c13f11f425cAB7240A035137B2f6f6F';
const MINT_ADDRESS = 'FmHnkkzEGchswea7AX1KcM6hsNMF7uBzamVkoCvnFMby';

// Transaction to recover
const TX_SIG = '5E6iyptTKc1NqjDkZKhD7XEkXnFdAfcHAVJtaZ2SDVeH4LrUoCa6tx6duZAXDhKaJjoykn9cGjHsH3e758opr1kp';

// Copy of extractMemo logic
function extractMemo(tx) {
    if (!tx.meta || !tx.meta.logMessages) return null;
    let instructions = tx.transaction.message.instructions;
    if (!instructions) instructions = tx.transaction.message.compiledInstructions;
    
    // Check logs first (easiest)
    for (const log of tx.meta.logMessages) {
        const match = log.match(/Memo \(len \d+\): "(.+)"/);
        if (match) return match[1];
    }
    
    // Check instructions data if logs failed
    let accountKeys = tx.transaction.message.accountKeys || tx.transaction.message.staticAccountKeys;
    for (const ix of instructions) {
        // ... (simplified check) ...
        if (ix.data && typeof ix.data === 'string') {
             try {
                const buffer = bs58.decode(ix.data);
                const text = new TextDecoder().decode(buffer);
                // Look for 0x address pattern
                const match = text.match(/(0x[a-fA-F0-9]{40})/);
                if (match) return match[1];
             } catch(e) {}
        }
    }
    return null;
}

// Copy of extractBurnAmount logic
function extractBurnAmount(tx, mintPubkey) {
    if (!tx.meta || !tx.meta.preTokenBalances || !tx.meta.postTokenBalances) return 0n;
    
    const mintStr = mintPubkey.toString();
    const pre = tx.meta.preTokenBalances.find(b => b.mint === mintStr && b.owner === tx.transaction.message.accountKeys[0].toString()); // Assume user is payer
    const post = tx.meta.postTokenBalances.find(b => b.mint === mintStr && b.owner === tx.transaction.message.accountKeys[0].toString());

    if (!pre || !post) {
         // Fallback: Check TOTAL change for mint
         // If supply decreased?
         return 0n; // Simplified
    }
    
    // Better way: Check if a "Burn" instruction was successful in logs
    const hasBurn = tx.meta.logMessages.some(l => l.includes('Instruction: Burn'));
    if (!hasBurn) return 0n;

    const preAmount = BigInt(pre.uiTokenAmount.amount);
    const postAmount = BigInt(post.uiTokenAmount.amount);
    
    if (preAmount > postAmount) {
        return preAmount - postAmount;
    }
    return 0n;
}

async function recover() {
    console.log('🔄 Recovering Burn Transaction:', TX_SIG);
    
    const solConnection = new Connection(SOLANA_RPC, 'confirmed');
    const omegaProvider = new JsonRpcProvider(OMEGA_RPC);
    
    const wallet = new Wallet(process.env.OMEGA_PRIVATE_KEY, omegaProvider);
    const bridge = new ethers.Contract(OMEGA_BRIDGE_ADDRESS, [
        "function release(address payable recipient, uint256 amount) external"
    ], wallet);

    // Fetch Tx
    const tx = await solConnection.getTransaction(TX_SIG, { maxSupportedTransactionVersion: 0 });
    if (!tx) { console.log('❌ Tx not found'); return; }

    const logs = tx.meta.logMessages;
    
    // extract memo
    const memo = extractMemo(tx);
    console.log('📝 Extracted Memo (Target):', memo);
    
    if (!memo) {
        console.log('❌ Could not extract memo from this tx');
        return;
    }

    // Manual amount extraction from pre/post balances manually for this specific tx
    // I happen to know it was likely 100 or something, but let's try to find it
    // Looking at pre/post balances for the user
    // Find the account that changed
    let burnAmount = 0n;
    
    // Hacky but effective: Look at preTokenBalances vs postTokenBalances for the MINT
    const MINT = 'FmHnkkzEGchswea7AX1KcM6hsNMF7uBzamVkoCvnFMby';
    
    // We expect total supply to decrease, or user balance to decrease
    // Let's just find the user balance change
    const preBals = tx.meta.preTokenBalances.filter(b => b.mint === MINT);
    const postBals = tx.meta.postTokenBalances.filter(b => b.mint === MINT);
    
    for (const pre of preBals) {
        const post = postBals.find(p => p.accountIndex === pre.accountIndex);
        if (post) {
             const diff = BigInt(pre.uiTokenAmount.amount) - BigInt(post.uiTokenAmount.amount);
             if (diff > 0n) {
                 burnAmount = diff;
                 console.log(`🔥 Found balance decrease: ${diff.toString()} (raw units)`);
                 break;
             }
        }
    }
    
    if (burnAmount === 0n) {
        console.log('❌ Could not determine burn amount');
        return;
    }

    // Convert back to Omega units (9 decimals -> 18 decimals)
    // Amount * 10^9
    const omegaAmount = burnAmount * 1000000000n;
    
    console.log(`🚀 Releasing ${ethers.formatEther(omegaAmount)} OMGA to ${memo}...`);
    
    try {
        const tx = await bridge.release(memo, omegaAmount);
        console.log('✅ Recovery Tx Sent:', tx.hash);
        await tx.wait();
        console.log('🎉 Confirmed!');
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }
}

recover();
