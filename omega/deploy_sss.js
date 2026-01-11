const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers, JsonRpcProvider, Wallet, ContractFactory } = require('ethers');
require('dotenv').config({ path: path.resolve(__dirname, '../relayer/.env') });

const RPC_URL = "https://0x4e454228.rpc.aurora-cloud.dev";
const PRIVATE_KEY = process.env.OMEGA_PRIVATE_KEY;

async function main() {
    console.log("Compiling WrappedSecretSerpentSociety.sol...");

    const contractPath = path.resolve(__dirname, 'WrappedSecretSerpentSociety.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'WrappedSecretSerpentSociety.sol': {
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

    function findImports(importPath) {
        try {
            let nodeModulesPath = path.resolve(__dirname, 'node_modules', importPath);
            if (fs.existsSync(nodeModulesPath)) {
                return { contents: fs.readFileSync(nodeModulesPath, 'utf8') };
            }
            nodeModulesPath = path.resolve(__dirname, '../node_modules', importPath);
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

    const contractFile = output.contracts['WrappedSecretSerpentSociety.sol']['WrappedSecretSerpentSociety'];
    const bytecode = contractFile.evm.bytecode.object;
    const abi = contractFile.abi;

    console.log("Compilation Successful.");

    console.log("Deploying to Omega Network...");
    const provider = new JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(PRIVATE_KEY, provider);

    const factory = new ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy();

    console.log(`Deploying contract... Tx Hash: ${contract.deploymentTransaction().hash}`);
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log(`WrappedSecretSerpentSociety deployed to: ${address}`);

    // Save the ABI and Address
    const deploymentInfo = {
        address: address,
        abi: abi
    };
    fs.writeFileSync(path.resolve(__dirname, '../relayer/omega_sss_deployment.json'), JSON.stringify(deploymentInfo, null, 2));
    console.log("Deployment info saved to ../relayer/omega_sss_deployment.json");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
