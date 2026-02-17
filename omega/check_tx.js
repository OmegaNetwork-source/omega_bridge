const { ethers, JsonRpcProvider } = require('ethers');

const RPC_URL = "https://0x4e4542bc.rpc.aurora-cloud.dev/";

const contracts = [
    { name: "OmegaBridge", address: "0xdC43DCAE0c13f11f425cAB7240A035137B2f6f6F" },
    { name: "WrappedSolarSentries", address: "0xf5d3107F16127272ADd8d6e6623A9B5bB9dE7aC4" },
    { name: "WrappedSecretSerpentSociety", address: "0x387f12f5099B1fB1c927dcaE64048b69092FD953" },
];

async function main() {
    const provider = new JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    console.log("Chain ID:", network.chainId.toString());
    console.log("");

    for (const c of contracts) {
        const code = await provider.getCode(c.address);
        const hasCode = code !== "0x" && code.length > 2;
        console.log(`${hasCode ? "✅" : "❌"} ${c.name} (${c.address}): ${hasCode ? "Contract deployed (" + code.length + " bytes)" : "NO CODE FOUND"}`);
    }
}

main().catch(e => console.error(e));
