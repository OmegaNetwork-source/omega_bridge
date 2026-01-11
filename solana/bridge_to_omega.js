const { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, createBurnInstruction, mintTo } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function main() {
    // Load Relayer (to mint tokens for the user first, for testing)
    const relayerKeyPath = path.resolve(__dirname, '../relayer/relayer-keypair.json');
    if (!fs.existsSync(relayerKeyPath)) {
        console.error("Run setup_token.js first!");
        return;
    }
    const relayerSecret = Uint8Array.from(JSON.parse(fs.readFileSync(relayerKeyPath)));
    const relayer = Keypair.fromSecretKey(relayerSecret);

    const info = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../relayer/solana_info.json')));
    const mintPubkey = new PublicKey(info.mintAddress);

    // Create a temporary "User" wallet
    const user = Keypair.generate();
    console.log("User Wallet:", user.publicKey.toBase58());

    // Fund user with SOL
    try {
        const sig = await connection.requestAirdrop(user.publicKey, 1000000000); // 1 SOL
        await connection.confirmTransaction(sig);
    } catch (e) { console.log("Airdrop failed, carry on if mainnet"); }

    // 1. Get User ATA
    const userATA = await getOrCreateAssociatedTokenAccount(
        connection,
        user,
        mintPubkey,
        user.publicKey
    );

    // 2. Mint tokens to user (Test setup) - 100 Tokens
    console.log("Minting 100 tokens to user for test...");
    await mintTo(
        connection,
        relayer,
        mintPubkey,
        userATA.address,
        relayer,
        100 * 10 ** 9
    );

    // 3. User wants to Bridge 50 tokens to Omega Address below
    const omegaDestination = "0x1234567890123456789012345678901234567890";
    const amountToBridge = 50 * 10 ** 9;

    console.log(`Bridging 50 tokens to ${omegaDestination}...`);

    const transaction = new Transaction();

    // Add Memo Instruction with destination
    transaction.add(
        new TransactionInstruction({
            keys: [{ pubkey: user.publicKey, isSigner: true, isWritable: true }],
            data: Buffer.from(omegaDestination, 'utf-8'),
            programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcQb"), // Memo Program ID
        })
    );

    // Add Burn Instruction
    transaction.add(
        createBurnInstruction(
            userATA.address,
            mintPubkey,
            user.publicKey,
            amountToBridge
        )
    );

    const txSig = await sendAndConfirmTransaction(connection, transaction, [user]);
    console.log("Bridge Transaction Sent:", txSig);
    console.log("Look for this transaction in the Relayer logs!");
}

main().catch(console.error);
