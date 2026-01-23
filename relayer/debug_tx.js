const { Connection, PublicKey } = require('@solana/web3.js');

async function debugTx() {
    const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Get latest signature
    const mintPub = new PublicKey('FmHnkkzEGchswea7AX1KcM6hsNMF7uBzamVkoCvnFMby');
    const logs = await conn.getSignaturesForAddress(mintPub, { limit: 1 });
    
    if (logs.length === 0) {
        console.log('No signatures found');
        return;
    }

    const signature = logs[0].signature;
    console.log('Analyzing:', signature);
    const tx = await conn.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
    
    if (!tx || !tx.meta) {
        console.log('Tx not found or missing meta');
        return;
    }
    
    // Check Logs for Memo
    console.log('\n=== Transaction Logs ===');
    tx.meta.logMessages.forEach(l => console.log(l));
    
    // Check for Memo Program
    const memoProg = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';
    const foundMemo = tx.meta.logMessages.some(l => l.includes('Memo') || l.includes(memoProg));
    console.log('\nHas Memo Program in logs:', foundMemo);
}
debugTx();
