const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers, JsonRpcProvider, Wallet, ContractFactory } = require('ethers');

// Read private key from relayer .env
const envPath = path.resolve(__dirname, '../relayer/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/OMEGA_PRIVATE_KEY=(.+)/);
const PRIVATE_KEY = match ? match[1].trim() : null;

const RPC_URL = "https://0x4e4542bc.rpc.aurora-cloud.dev/";

async function main() {
    if (!PRIVATE_KEY) {
        console.error('❌ OMEGA_PRIVATE_KEY not found in relayer/.env');
        process.exit(1);
    }

    console.log("🔧 Compiling OmegaBridge.sol...");

    const contractPath = path.resolve(__dirname, 'OmegaBridge.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'OmegaBridge.sol': { content: source },
        },
        settings: {
            outputSelection: { '*': { '*': ['*'] } },
        },
    };

    function findImports(importPath) {
        try {
            const nodeModulesPath = path.resolve(__dirname, 'node_modules', importPath);
            if (fs.existsSync(nodeModulesPath)) {
                return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
            }
        } catch (e) {}
        return { error: 'File not found' };
    }

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors?.some(x => x.severity === 'error')) {
        output.errors.forEach(err => console.error(err.formattedMessage));
        process.exit(1);
    }

    const contractFile = output.contracts['OmegaBridge.sol']['OmegaBridge'];
    const bytecode = contractFile.evm.bytecode.object;
    const abi = contractFile.abi;

    console.log("✅ Compilation Successful.\n");

    const provider = new JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(PRIVATE_KEY, provider);

    console.log("📍 Deployer:", wallet.address);
    const balance = await provider.getBalance(wallet.address);
    console.log("💰 Balance:", ethers.formatEther(balance), "OMGA\n");

    console.log("⏳ Deploying OmegaBridge...");
    const factory = new ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy(wallet.address);

    console.log("📝 Tx Hash:", contract.deploymentTransaction().hash);
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 OMEGABRIDGE DEPLOYED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('Contract Address:', address);
    console.log('Owner:', wallet.address);
    console.log('='.repeat(60));

    // Save deployment info
    const deploymentInfo = { address, abi };
    fs.writeFileSync(path.resolve(__dirname, '../relayer/omega_bridge_new.json'), JSON.stringify(deploymentInfo, null, 2));
    console.log('\n📁 Saved to ../relayer/omega_bridge_new.json');
    console.log('\n⚠️  Update OMEGA_BRIDGE_ADDRESS in your code to:', address);
}

main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
