const { JsonRpcProvider } = require('ethers');

async function checkChain() {
    const rpcUrl = "https://0x4e454228.rpc.aurora-cloud.dev";
    const provider = new JsonRpcProvider(rpcUrl);

    try {
        const network = await provider.getNetwork();
        console.log("Connected to network:", network.name);
        console.log("Chain ID:", network.chainId.toString());
        
        // Block number check to ensure it's healthy
        const blockNumber = await provider.getBlockNumber();
        console.log("Current Block Number:", blockNumber);

    } catch (error) {
        console.error("Error connecting to RPC:", error);
    }
}

checkChain();
