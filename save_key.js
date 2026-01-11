const fs = require('fs');
const path = require('path');
const bs58 = require('bs58'); // in v5/6 default export might be different or 'decode' might be on default

const solanaKeyBase58 = "5nYjAEqRq731gouFbzXeYhSeqnVE7t8Jy9XYRijHJoDn2ao8SnJ4FFEe3wm9mDUpJXDShoQw3PjsMTfBFyqWN9bi";

let secretKey;
// Handle different bs58 versions/imports
if (typeof bs58.decode === 'function') {
    secretKey = bs58.decode(solanaKeyBase58);
} else if (bs58.default && typeof bs58.default.decode === 'function') {
    secretKey = bs58.default.decode(solanaKeyBase58);
} else {
    // Try to see if it exposes it directly
    console.log("bs58 exports:", bs58);
    throw new Error("Cannot find decode function");
}

const keypairPath = path.resolve(__dirname, 'relayer/relayer-keypair.json');

fs.writeFileSync(keypairPath, JSON.stringify(Array.from(secretKey)));
console.log(`Saved Solana Keypair to ${keypairPath}`);
