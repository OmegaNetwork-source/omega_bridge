const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers, JsonRpcProvider, Wallet, ContractFactory } = require('ethers');
require('dotenv').config({ path: path.resolve(__dirname, '../relayer/.env') });

// --- Configuration ---
const RPC_URL = "https://0x4e4542bc.rpc.aurora-cloud.dev/";
const PRIVATE_KEY = process.env.OMEGA_PRIVATE_KEY;
// ---------------------

async function main() {
    console.log("Compiling OmegaBridge.sol...");

    const contractPath = path.resolve(__dirname, 'OmegaBridge.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'OmegaBridge.sol': {
                content: source,
            },
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['*'],
                },
            },
        },
    };

    // Helper to find imports (OpenZeppelin)
    function findImports(importPath) {
        try {
            const nodeModulesPath = path.resolve(__dirname, 'node_modules', importPath);
            if (fs.existsSync(nodeModulesPath)) {
                return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
            }
        } catch (e) {
            return { error: 'File not found' };
        }
        return { error: 'File not found' };
    }

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors) {
        output.errors.forEach((err) => {
            console.error(err.formattedMessage);
        });
        if (output.errors.some(x => x.severity === 'error')) {
            process.exit(1);
        }
    }

    const contractFile = output.contracts['OmegaBridge.sol']['OmegaBridge'];
    const bytecode = contractFile.evm.bytecode.object;
    const abi = contractFile.abi;

    console.log("Compilation Successful.");



    console.log("Deploying to Omega Network...");
    const provider = new JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(PRIVATE_KEY, provider);

    const factory = new ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy(wallet.address);

    console.log(`Deploying contract... Tx Hash: ${contract.deploymentTransaction().hash}`);

    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log(`OmegaBridge deployed to: ${address}`);

    // Save the ABI and Address for the Relayer
    const deploymentInfo = {
        address: address,
        abi: abi
    };
    fs.writeFileSync(path.resolve(__dirname, '../relayer/omega_deployment.json'), JSON.stringify(deploymentInfo, null, 2));
    console.log("Deployment info saved to ../relayer/omega_deployment.json");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
