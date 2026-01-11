import React, { useState, useEffect } from 'react';
import DocsModal from './DocsModal';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createBurnInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import { ethers } from 'ethers';
import { ArrowRightLeft, Wallet, ShieldCheck, Loader2, Link, Book } from 'lucide-react';
import { motion } from 'framer-motion';

// Configuration
const SOLANA_MINT_ADDRESS = "6oSdZKPtY2SFptMHYnEjHU4MN2EYSNBHRVWgmDiJXjpy";
// Note: We need the ABI for OmegaBridge. 
// Since we are in the UI folder, we can hardcode the minimal ABI or import. 
// For simplicity in this demo, I'll inline the minimal ABI.
const OMEGA_BRIDGE_ADDRESS = "0x3E78D4Cd1026a90A582861E55BFf757361863ED8";
const OMEGA_RPC_URL = "https://0x4e454228.rpc.aurora-cloud.dev";
const OMEGA_CHAIN_ID = 1313161768;

const OmegaBridgeABI = [
  "function lock(string memory solanaAddress) external payable",
  "function release(address payable recipient, uint256 amount) external"
];

function App() {
  // State
  const [solanaAddress, setSolanaAddress] = useState(null);
  const [omegaAddress, setOmegaAddress] = useState(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('OMEGA_TO_SOL'); // 'OMEGA_TO_SOL' or 'SOL_TO_OMEGA'
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState('--');
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  // Fetch Logic
  const fetchBalances = async () => {
    try {
      if (direction === 'OMEGA_TO_SOL' && omegaAddress && window.ethereum) {
        let provider;
        if (window.ethereum.providers) {
          const found = window.ethereum.providers.find(p => p.isMetaMask);
          if (found) provider = new ethers.BrowserProvider(found);
          else provider = new ethers.BrowserProvider(window.ethereum);
        } else {
          provider = new ethers.BrowserProvider(window.ethereum);
        }

        const bal = await provider.getBalance(omegaAddress);
        setBalance(ethers.formatEther(bal));
      }
      else if (direction === 'SOL_TO_OMEGA' && solanaAddress && window.solana) {
        const connection = new Connection("https://api.devnet.solana.com");
        const mint = new PublicKey(SOLANA_MINT_ADDRESS);
        const owner = new PublicKey(solanaAddress);

        // Get SPL Balance (Wrapped Omega)
        try {
          const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: mint });
          if (accounts.value.length > 0) {
            setBalance(accounts.value[0].account.data.parsed.info.tokenAmount.uiAmountString);
          } else {
            setBalance('0.00');
          }
        } catch (e) { setBalance('0.00'); }
      } else {
        setBalance('--');
      }
    } catch (e) {
      console.error("Balance fetch error:", e);
      setBalance('--');
    }
  };

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [omegaAddress, solanaAddress, direction]);

  // Connection Handlers
  const connectPhantom = async () => {
    try {
      if (window.solana && window.solana.isPhantom) {
        const resp = await window.solana.connect();
        setSolanaAddress(resp.publicKey.toString());
      } else {
        alert("Phantom Wallet not found!");
      }
    } catch (err) { console.error(err); }
  };

  const connectMetamask = async () => {
    try {
      let provider;
      // Handle multiple wallets (Phantom + Metamask)
      if (window.ethereum && window.ethereum.providers) {
        const found = window.ethereum.providers.find(p => p.isMetaMask);
        if (found) {
          provider = new ethers.BrowserProvider(found);
        } else {
          provider = new ethers.BrowserProvider(window.ethereum);
        }
      } else if (window.ethereum) {
        // If only one wallet or no providers array
        provider = new ethers.BrowserProvider(window.ethereum);
      }

      if (provider) {
        const accounts = await provider.send("eth_requestAccounts", []);
        setOmegaAddress(accounts[0]);

        // Check Chain ID
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== OMEGA_CHAIN_ID) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x' + OMEGA_CHAIN_ID.toString(16) }],
            });
          } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: '0x' + OMEGA_CHAIN_ID.toString(16),
                    chainName: 'Omega Network',
                    rpcUrls: [OMEGA_RPC_URL],
                    nativeCurrency: { name: 'OMEGA', symbol: 'OMGA', decimals: 18 },
                    blockExplorerUrls: ['https://explorer.omeganetwork.co/'],
                  },
                ],
              });
            }
          }
        }
      } else {
        alert("Metamask not found!");
      }
    } catch (err) { console.error(err); }
  };

  // Bridge Logic
  const handleBridge = async () => {
    if (!amount || parseFloat(amount) <= 0) return alert("Invalid amount");
    setLoading(true);
    setStatus({ type: 'info', msg: 'Processing transaction...' });

    try {
      if (direction === 'OMEGA_TO_SOL') {
        if (!omegaAddress) throw new Error("Connect Omega Wallet");
        if (!solanaAddress) throw new Error("Connect Solana Wallet (destination)");

        let provider;
        if (window.ethereum.providers) {
          const found = window.ethereum.providers.find(p => p.isMetaMask);
          if (found) provider = new ethers.BrowserProvider(found);
          else provider = new ethers.BrowserProvider(window.ethereum);
        } else {
          provider = new ethers.BrowserProvider(window.ethereum);
        }

        const signer = await provider.getSigner();
        const contract = new ethers.Contract(OMEGA_BRIDGE_ADDRESS, OmegaBridgeABI, signer);

        const amountWei = ethers.parseEther(amount);
        const tx = await contract.lock(solanaAddress, { value: amountWei });

        setStatus({ type: 'info', msg: 'Transaction Sent! Waiting for confirmation...' });
        await tx.wait();
        setStatus({ type: 'success', msg: `Successfully locked ${amount} OMGA! Relayer will mint tokens to Solana shortly.` });

      } else {
        // SOL -> OMEGA
        if (!solanaAddress) throw new Error("Connect Solana Wallet");
        if (!omegaAddress) throw new Error("Connect Omega Wallet (destination)");

        const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
        const pubKey = new PublicKey(solanaAddress);
        const mintKey = new PublicKey(SOLANA_MINT_ADDRESS);
        const amountLamports = BigInt(Math.floor(parseFloat(amount) * 10 ** 9));

        const ata = await getAssociatedTokenAddress(mintKey, pubKey);

        const tx = new Transaction();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = pubKey;

        // Memo Instruction (Target Omega Address)
        tx.add(new TransactionInstruction({
          keys: [{ pubkey: pubKey, isSigner: true, isWritable: true }],
          data: Buffer.from(omegaAddress, 'utf-8'),
          programId: new PublicKey("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo")
        }));

        // Burn Instruction
        tx.add(createBurnInstruction(ata, mintKey, pubKey, amountLamports));

        // Sign and Send explicitly
        const signedTx = await window.solana.signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize());

        setStatus({ type: 'info', msg: `Tx Sent: ${signature.slice(0, 8)}... Waiting for confirmation...` });

        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature
        });

        setStatus({ type: 'success', msg: `Burned Tokens! Relayer will release OMGA shortly.` });
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: e.message || "Transaction failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="background-grid"></div>
      <div className="gradient-orb orb-1"></div>
      <div className="gradient-orb orb-2"></div>

      <nav>
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Omega Bridge <Link size={24} color="black" strokeWidth={2.5} />
        </div>
        <ul className="nav-links">
          <a href="#">Bridge</a>
          <a href="https://explorer.omeganetwork.co/" target="_blank">Explorer</a>
          <a href="#" onClick={(e) => { e.preventDefault(); setIsDocsOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            Docs <Book size={16} />
          </a>
        </ul>
      </nav>

      <main className="main-content">
        <div className="bridge-card">
          <div className="card-header">
            <h1>Bridge Assets</h1>
            <p>Transfer tokens securely between Omega Network and Solana.</p>
          </div>

          {/* Wallet Connection */}
          <div className="wallet-section">
            {direction === 'OMEGA_TO_SOL' ? (
              <>
                <motion.button
                  layout
                  key="metamask"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`wallet-btn ${omegaAddress ? 'connected' : ''}`}
                  onClick={connectMetamask}
                >
                  <Wallet size={18} />
                  {omegaAddress ? `${omegaAddress.slice(0, 6)}...${omegaAddress.slice(-4)}` : "Connect Metamask"}
                </motion.button>

                <motion.button
                  layout
                  key="phantom"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`wallet-btn ${solanaAddress ? 'connected' : ''}`}
                  onClick={connectPhantom}
                >
                  <Wallet size={18} />
                  {solanaAddress ? `${solanaAddress.slice(0, 6)}...${solanaAddress.slice(-4)}` : "Connect Phantom"}
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  layout
                  key="phantom"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`wallet-btn ${solanaAddress ? 'connected' : ''}`}
                  onClick={connectPhantom}
                >
                  <Wallet size={18} />
                  {solanaAddress ? `${solanaAddress.slice(0, 6)}...${solanaAddress.slice(-4)}` : "Connect Phantom"}
                </motion.button>

                <motion.button
                  layout
                  key="metamask"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`wallet-btn ${omegaAddress ? 'connected' : ''}`}
                  onClick={connectMetamask}
                >
                  <Wallet size={18} />
                  {omegaAddress ? `${omegaAddress.slice(0, 6)}...${omegaAddress.slice(-4)}` : "Connect Metamask"}
                </motion.button>
              </>
            )}
          </div>

          {/* Input Section */}
          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label>Amount</label>
              <span style={{ fontSize: '0.8rem', color: '#666' }}>Balance: {balance}</span>
            </div>

            <div className="amount-input-container">
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="currency-badge">
                OMGA
              </span>
            </div>
          </div>

          {/* Direction Switch */}
          <div className="switch-container">
            <button className="switch-btn" onClick={() => setDirection(d => d === 'OMEGA_TO_SOL' ? 'SOL_TO_OMEGA' : 'OMEGA_TO_SOL')}>
              <ArrowRightLeft size={20} />
            </button>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.9rem', color: '#666' }}>
            {direction === 'OMEGA_TO_SOL'
              ? <span>From <strong>Omega Network</strong> to <strong>Solana</strong></span>
              : <span>From <strong>Solana</strong> to <strong>Omega Network</strong></span>
            }
          </div>

          <button className="action-btn" onClick={handleBridge} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" style={{ margin: '0 auto' }} /> : "Bridge Assets"}
          </button>

          {status.msg && (
            <div className={`status-msg ${status.type}`}>
              {status.msg}
            </div>
          )}

          <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#999', fontSize: '0.8rem' }}>
            <ShieldCheck size={14} />
            <span>Powered by Omega Relayer Service</span>
          </div>
        </div>
      </main>

      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />
    </div>
  );
}

export default App;
