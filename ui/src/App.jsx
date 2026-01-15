import React, { useState, useEffect } from 'react';
import DocsModal from './DocsModal';
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createBurnInstruction, createAssociatedTokenAccountInstruction, createTransferInstruction } from '@solana/spl-token';
import { ethers } from 'ethers';
import { ArrowRightLeft, Wallet, ShieldCheck, Loader2, Link, Book } from 'lucide-react';
import { motion } from 'framer-motion';

// Configuration
const SOLANA_MINT_ADDRESS = "6oSdZKPtY2SFptMHYnEjHU4MN2EYSNBHRVWgmDiJXjpy";
const SOLANA_RPC_DEVNET = "https://api.devnet.solana.com";
const SOLANA_RPC_MAINNET = "https://mainnet.helius-rpc.com/?api-key=94a04704-448e-45a8-82e5-8f4c63b25082";
// Hardcoded Relayer Address (Vault)
const RELAYER_SOLANA_ADDRESS = "4XJ4Mrkn8Jn8vaJKxmUQWSKHQdwaDiKsDDxeNexodiEq";

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

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const ALLOWED_AUTHORITIES = [
  "9LoZrQjAuNjGKogMKuq8HXXbo245e3Y6vXYTff7Tr7nr", // Solar Sentries (Solscan)
  "HB55Zfu3md55JUeP6QjRPfxPHUTUEzZEXJFmf9s2HBJ2", // Solar Sentries (On-Chain)
  "MorerMW4X2gUzhVRQCNFZJSkxC7wv7zGZqCNz72jGqs",  // Secret Serpent Society
  "SeuppqTF9LQQPRXDX5cFZ3KjZwuqjbLWVEpa6Ly4h6d"   // Secret Serpent SC (Legacy/V1)
];

// Helper to decode basic Metaplex Metadata (Name, Symbol, URI)
// Structure: [Key (1)] [UpdateAuth (32)] [Mint (32)] [NameStr] [SymbolStr] [UriStr] ...
function decodeMetadata(buffer) {
  try {
    const updateAuthority = new PublicKey(buffer.slice(1, 33)).toString();
    const mint = new PublicKey(buffer.slice(33, 65)).toString();

    let offset = 1 + 32 + 32; // Skip Key, UpdateAuth, Mint

    // Read Name
    const nameLen = buffer.readUInt32LE(offset);
    offset += 4;
    const name = buffer.slice(offset, offset + nameLen).toString('utf-8').replace(/\0/g, ''); // Remove null bytes
    offset += nameLen;

    // Read Symbol
    const symbolLen = buffer.readUInt32LE(offset);
    offset += 4;
    const symbol = buffer.slice(offset, offset + symbolLen).toString('utf-8').replace(/\0/g, '');
    offset += symbolLen;

    // Read URI
    const uriLen = buffer.readUInt32LE(offset);
    offset += 4;
    const uri = buffer.slice(offset, offset + uriLen).toString('utf-8').replace(/\0/g, '');

    return { name, symbol, uri, updateAuthority, mint };
  } catch (e) {
    console.error("Failed to decode metadata", e);
    return null;
  }
}

function App() {
  // State
  const [solanaAddress, setSolanaAddress] = useState(null);
  const [omegaAddress, setOmegaAddress] = useState(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('OMEGA_TO_SOL');
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState('--');
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('tokens');
  const [selectedNfts, setSelectedNfts] = useState([]); // Array for Bulk
  const [nfts, setNfts] = useState([]);
  
  // Ref to track fetch version and cancel stale requests
  const fetchIdRef = React.useRef(0);

  // Fetch Logic
  const fetchBalances = async () => {
    try {
      // ONLY fetch token balances if we are in 'tokens' tab (Devnet)
      if (activeTab !== 'tokens') return;

      if (direction === 'OMEGA_TO_SOL' && omegaAddress && window.ethereum) {
        // ... (existing logic) ...
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
        // ... (existing logic) ...
        const connection = new Connection(SOLANA_RPC_DEVNET);
        const mint = new PublicKey(SOLANA_MINT_ADDRESS);
        const owner = new PublicKey(solanaAddress);
        try {
          const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: mint });
          if (accounts.value.length > 0) setBalance(accounts.value[0].account.data.parsed.info.tokenAmount.uiAmountString);
          else setBalance('0.00');
        } catch { setBalance('0.00'); }
      } else {
        setBalance('--');
      }
    } catch (e) {
      console.error("Balance fetch error:", e);
      setBalance('--');
    }
  };

  const fetchNFTs = async () => {
    // Increment fetch ID and capture it for this request
    const currentFetchId = ++fetchIdRef.current;
    console.log('[DEBUG] Starting fetchNFTs, id:', currentFetchId, 'direction:', direction);
    
    // 1. OMEGA -> SOL Direction
    if (direction === 'OMEGA_TO_SOL') {
      if (!omegaAddress) return;
      console.log('[DEBUG] Fetching Omega NFTs for:', omegaAddress);
      setStatus({ type: 'info', msg: 'Fetching NFTs from Omega...' });
      // Keep old NFTs visible while fetching (caching)

      try {
        const OMEGA_RPC = "https://0x4e454228.rpc.aurora-cloud.dev";
        
        // Helper to make raw JSON-RPC calls
        const rpcCall = async (method, params) => {
          const res = await fetch(OMEGA_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method,
              params
            })
          });
          const json = await res.json();
          if (json.error) throw new Error(json.error.message);
          return json.result;
        };

        // balanceOf(address) function signature: 0x70a08231
        const encodeBalanceOf = (addr) => 
          '0x70a08231000000000000000000000000' + addr.slice(2).toLowerCase();
        
        // ownerOf(uint256) function signature: 0x6352211e
        const encodeOwnerOf = (tokenId) => 
          '0x6352211e' + tokenId.toString(16).padStart(64, '0');
        
        // tokenURI(uint256) function signature: 0xc87b56dd
        const encodeTokenURI = (tokenId) => 
          '0xc87b56dd' + tokenId.toString(16).padStart(64, '0');
        
        // tokenCounter() function signature: 0xd082e381
        const encodeTokenCounter = () => '0xd082e381';

        const contracts = [
          { addr: "0x0c33763995A6eC29D07317A8F4Eb37E338C5C4D3", name: "Solar Sentries" },
          { addr: "0xc4adBE5BfF256c54f2fd6b906B4cfA407Af8a05E", name: "Secret Serpent Society" }
        ];

        let found = [];

        for (const c of contracts) {
          try {
            // 1. Check Balance
            const balResult = await rpcCall('eth_call', [{ to: c.addr, data: encodeBalanceOf(omegaAddress) }, 'latest']);
            const bal = parseInt(balResult, 16);
            console.log(`[${c.name}] Balance: ${bal}`);
            
            if (bal === 0) continue;

            // 2. Get tokenCounter
            let maxId = 100;
            try {
              const counterResult = await rpcCall('eth_call', [{ to: c.addr, data: encodeTokenCounter() }, 'latest']);
              maxId = parseInt(counterResult, 16);
            } catch (e) {
              console.log('No tokenCounter, using default 100');
            }
            console.log(`[${c.name}] Scanning up to ID ${maxId}...`);

            // 3. Find owned tokens
            for (let tokenId = 0; tokenId < maxId; tokenId++) {
              try {
                const ownerResult = await rpcCall('eth_call', [{ to: c.addr, data: encodeOwnerOf(tokenId) }, 'latest']);
                const owner = '0x' + ownerResult.slice(26).toLowerCase();
                
                if (owner === omegaAddress.toLowerCase()) {
                  console.log(`[${c.name}] Found token #${tokenId}`);
                  
                  // Get metadata
                  let nftName = `${c.name} #${tokenId}`;
                  let nftImage = `https://placehold.co/200x200/4F46E5/FFF?text=${c.name}`;
                  let solanaMint = '';

                  try {
                    // First get the original Solana mint address
                    // originalSolanaMint(uint256) function signature: 0x6b051f73
                    const encodeOriginalMint = (id) => '0x6b051f73' + id.toString(16).padStart(64, '0');
                    const mintResult = await rpcCall('eth_call', [{ to: c.addr, data: encodeOriginalMint(tokenId) }, 'latest']);
                    
                    // Decode string from ABI
                    const offset = parseInt(mintResult.slice(2, 66), 16) * 2 + 2;
                    const length = parseInt(mintResult.slice(offset, offset + 64), 16);
                    const hexStr = mintResult.slice(offset + 64, offset + 64 + length * 2);
                    for (let i = 0; i < hexStr.length; i += 2) {
                      solanaMint += String.fromCharCode(parseInt(hexStr.slice(i, i + 2), 16));
                    }
                    console.log(`[${c.name}] Token #${tokenId} Solana Mint:`, solanaMint);

                    // Use Helius DAS API to get cached metadata
                    if (solanaMint) {
                      const dasRes = await fetch('https://mainnet.helius-rpc.com/?api-key=94a04704-448e-45a8-82e5-8f4c63b25082', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          jsonrpc: '2.0',
                          id: 'omega-bridge',
                          method: 'getAsset',
                          params: { id: solanaMint }
                        })
                      });
                      const dasData = await dasRes.json();
                      if (dasData.result?.content) {
                        const content = dasData.result.content;
                        if (content.metadata?.name) nftName = content.metadata.name;
                        // Use CDN image if available, otherwise fallback to links.image
                        if (content.files?.[0]?.cdn_uri) {
                          nftImage = content.files[0].cdn_uri;
                        } else if (content.links?.image) {
                          nftImage = content.links.image;
                        }
                        console.log(`[${c.name}] Got metadata from Helius:`, nftName, nftImage);
                      }
                    }
                  } catch (e) {
                    console.warn('Metadata fetch failed for', tokenId, e);
                  }

                  found.push({
                    mint: tokenId.toString(),
                    name: nftName,
                    symbol: c.name.includes('Solar') ? 'SDS' : 'SSS',
                    image: nftImage,
                    collection: c.name,
                    contract: c.addr,
                    isOmega: true,
                    solanaMint: solanaMint
                  });
                }
              } catch (e) {
                // Token doesn't exist
              }
            }
          } catch (err) { 
            console.warn("Omega Scan Error:", c.name, err); 
          }
        }

        // Check if this request is still valid before updating state
        if (currentFetchId !== fetchIdRef.current) {
          console.log('[DEBUG] Stale Omega fetch, ignoring results');
          return;
        }
        console.log('[DEBUG] Found NFTs:', found);
        setNfts(found);
        setStatus({ type: '', msg: found.length === 0 ? 'No Omega NFTs found' : `Found ${found.length} NFT(s)` });
      } catch (e) {
        console.error(e);
        setStatus({ type: 'error', msg: 'Failed to fetch Omega NFTs' });
      }
      return;
    }

    // 2. SOL -> OMEGA Direction
    if (!solanaAddress) return;
    setStatus({ type: 'info', msg: 'Fetching NFTs from Mainnet...' });
    // Keep old NFTs visible while fetching (caching)

    try {
      // Use Helius DAS API for faster NFT fetching with cached images
      const response = await fetch(SOLANA_RPC_MAINNET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'omega-bridge',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: solanaAddress,
            page: 1,
            limit: 1000,
            displayOptions: { showFungible: false, showNativeBalance: false }
          }
        })
      });

      const data = await response.json();
      console.log("Helius DAS Response:", data);

      if (!data.result || !data.result.items) {
        setStatus({ type: 'warning', msg: 'No NFTs found' });
        return;
      }

      // Filter for whitelisted collections
      const loadedNfts = data.result.items
        .filter(item => {
          // Check if update authority is whitelisted
          const authority = item.authorities?.[0]?.address;
          const isWhitelisted = ALLOWED_AUTHORITIES.includes(authority);
          if (!isWhitelisted) {
            console.log("Skipping (not whitelisted):", item.content?.metadata?.name, authority);
          }
          return isWhitelisted;
        })
        .map(item => ({
          mint: item.id,
          name: item.content?.metadata?.name || 'Unknown NFT',
          symbol: item.content?.metadata?.symbol || 'NFT',
          image: item.content?.links?.image || item.content?.files?.[0]?.uri || `https://placehold.co/200x200/1a1a1a/666?text=NFT`,
          collection: item.grouping?.find(g => g.group_key === 'collection')?.group_value
        }));

      // Check if this request is still valid before updating state
      if (currentFetchId !== fetchIdRef.current) {
        console.log('[DEBUG] Stale Solana fetch, ignoring results');
        return;
      }
      console.log("Loaded NFTs:", loadedNfts);
      setNfts(loadedNfts);
      setStatus({ type: '', msg: loadedNfts.length === 0 ? 'No whitelisted NFTs found' : '' });

    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Failed to fetch NFTs' });
    }
  };

  useEffect(() => {
    if (activeTab === 'tokens') fetchBalances();
    if (activeTab === 'nfts') fetchNFTs();

    const interval = setInterval(() => {
      if (activeTab === 'tokens') fetchBalances();
    }, 10000);
    return () => clearInterval(interval);
  }, [omegaAddress, solanaAddress, direction, activeTab]);

  // Tab Handler
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Clearing previous state when switching
    setStatus({ type: '', msg: '' });
    setSelectedNfts([]); // Clear selected NFTs when switching tabs
    if (tab === 'tokens') {
      setBalance('--');
    }
    // Note: fetchNFTs is called automatically by useEffect when activeTab changes
  };

  const toggleNftSelection = (nft) => {
    if (selectedNfts.find(n => n.mint === nft.mint)) {
      setSelectedNfts(selectedNfts.filter(n => n.mint !== nft.mint));
    } else {
      setSelectedNfts([...selectedNfts, nft]);
    }
  };

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
    if (activeTab === 'tokens' && (!amount || parseFloat(amount) <= 0)) return alert("Invalid amount");
    if (activeTab === 'nfts' && selectedNfts.length === 0) return alert("Select at least one NFT");

    setLoading(true);
    setStatus({ type: 'info', msg: 'Processing... Please approve in wallet.' });

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

        if (activeTab === 'tokens') {
          const amountWei = ethers.parseEther(amount);
          const tx = await contract.lock(solanaAddress, { value: amountWei });

          setStatus({ type: 'info', msg: 'Transaction Sent! Waiting for confirmation...' });
          await tx.wait();
          setStatus({ type: 'success', msg: `Successfully locked ${amount} OMGA! Relayer will mint tokens to Solana shortly.` });
        } else {
          // NFT Bridging OMEGA -> SOL
          setStatus({ type: 'info', msg: `Burning ${selectedNfts.length} NFTs to release on Solana...` });

          const BurnABI = ["function burnToSolana(uint256 tokenId, string memory solanaDestination)"];

          for (const nft of selectedNfts) {
            if (!nft.contract) continue;
            const nftContract = new ethers.Contract(nft.contract, BurnABI, signer);
            try {
              const tx = await nftContract.burnToSolana(nft.mint, solanaAddress);
              setStatus({ type: 'info', msg: `Burning ${nft.name}... Waiting for confirmation...` });
              await tx.wait();
            } catch (err) {
              console.error("Burn failed for", nft.name, err);
              setStatus({ type: 'error', msg: `Failed to bridge ${nft.name}: ${err.message}` });
              setLoading(false);
              return;
            }
          }

          setStatus({ type: 'success', msg: `Successfully Bridged ${selectedNfts.length} NFTs to Solana! Check the Relayer logs for unlock.` });
        }

      } else {
        // SOL -> OMEGA
        if (!solanaAddress) throw new Error("Connect Solana Wallet");
        if (!omegaAddress) throw new Error("Connect Omega Wallet (destination)");

        // USE DYNAMIC RPC
        const rpcUrl = activeTab === 'nfts' ? SOLANA_RPC_MAINNET : SOLANA_RPC_DEVNET;
        const connection = new Connection(rpcUrl, 'confirmed');
        const pubKey = new PublicKey(solanaAddress);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        const tx = new Transaction();
        tx.recentBlockhash = blockhash;
        tx.feePayer = pubKey;

        // Common Memo (Target Omega Address)
        tx.add(new TransactionInstruction({
          keys: [{ pubkey: pubKey, isSigner: true, isWritable: true }],
          data: Buffer.from(omegaAddress, 'utf-8'),
          programId: new PublicKey("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo")
        }));

        if (activeTab === 'tokens') {
          const mintKey = new PublicKey(SOLANA_MINT_ADDRESS);
          const amountLamports = BigInt(Math.floor(parseFloat(amount) * 10 ** 9));

          const ata = await getAssociatedTokenAddress(mintKey, pubKey);

          // Burn Instruction
          tx.add(createBurnInstruction(ata, mintKey, pubKey, amountLamports));

        } else {
          // NFT Logic (Batch Transfer)
          setStatus({ type: 'info', msg: `Preparing transfer for ${selectedNfts.length} NFTs...` });

          const relayerKey = new PublicKey(RELAYER_SOLANA_ADDRESS);

          for (const nft of selectedNfts) {
            const mintKey = new PublicKey(nft.mint);
            // User's ATA
            const userAta = await getAssociatedTokenAddress(mintKey, pubKey);
            // Relayer's ATA (Destination)
            const relayerAta = await getAssociatedTokenAddress(mintKey, relayerKey);

            // Check if Relayer ATA exists, if not, create it (User pays rent - ~0.002 SOL)
            // This is necessary because Relayer wallet typically won't have ATAs for every random NFT upfront.
            const info = await connection.getAccountInfo(relayerAta);
            if (!info) {
              tx.add(createAssociatedTokenAccountInstruction(
                pubKey, // Payer
                relayerAta, // Associated Token Account
                relayerKey, // Owner
                mintKey // Mint
              ));
            }

            // Transfer Instruction
            tx.add(createTransferInstruction(
              userAta, // Source
              relayerAta, // Destination
              pubKey, // Owner
              1 // Amount (NFT is 1)
            ));
          }

          // ADD FEE: 0.005 SOL to Relayer Wallet
          // This ensures the Relayer Address is indexed in the transaction keys for polling
          const LAMPORTS_PER_SOL = 1000000000;
          const feeAmount = BigInt(0.005 * LAMPORTS_PER_SOL);

          tx.add(SystemProgram.transfer({
            fromPubkey: pubKey,
            toPubkey: relayerKey, // Use Relayer as fee recipient
            lamports: feeAmount,
          }));
        }

        // Sign and Send explicitly
        const signedTx = await window.solana.signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize());

        setStatus({ type: 'info', msg: `Tx Sent. Confirming...`, link: `https://solscan.io/tx/${signature}` });

        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature
        }, 'finalized');

        setStatus({
          type: 'success',
          msg: activeTab === 'tokens' ? 'Burned Tokens! Relayer will release OMGA shortly.' : `Bridge Initiated! Relayer will mint ${selectedNfts.length} NFTs on Omega.`,
          link: `https://solscan.io/tx/${signature}`
        });

        if (activeTab === 'nfts') {
          setSelectedNfts([]);
          setTimeout(fetchNFTs, 5000); // Storage refresh wait
        }
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
            <div>
              <h1>Bridge Assets</h1>
              <p>Transfer tokens securely between Omega Network and Solana.</p>
            </div>
            <div className={`network-badge ${activeTab}`}>
              {activeTab === 'tokens' ? '🟢 Devnet' : '🟣 Mainnet'}
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="tab-group">
            <button
              className={`tab-btn ${activeTab === 'tokens' ? 'active' : ''}`}
              onClick={() => handleTabChange('tokens')}
            >
              Tokens
            </button>
            <button
              className={`tab-btn ${activeTab === 'nfts' ? 'active' : ''}`}
              onClick={() => handleTabChange('nfts')}
            >
              NFTs
            </button>
          </div>

          {/* Wallet Connection (Common) */}
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

          {activeTab === 'tokens' ? (
            <>
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
            </>
          ) : (
            <>
              <div className="nft-selection-area">
                <div className="nft-grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', alignContent: 'start', padding: '0.5rem', overflowY: 'auto', maxHeight: '300px' }}>
                  {nfts.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      <p>No NFTs found</p>
                      <small>{direction === 'OMEGA_TO_SOL' ? "Connect Omega wallet" : "Connect Solana wallet"}</small>
                    </div>
                  ) : (
                    nfts.map((nft) => {
                      const isSelected = selectedNfts.find(n => n.mint === nft.mint);
                      return (
                        <div
                          key={nft.mint}
                          onClick={() => toggleNftSelection(nft)}
                          style={{
                            cursor: 'pointer',
                            border: isSelected ? '2px solid #6b21a8' : '1px solid #e2e8f0',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            opacity: isSelected ? 1 : 0.8,
                            position: 'relative',
                            transition: 'all 0.2s'
                          }}
                        >
                          {isSelected && <div style={{ position: 'absolute', top: 5, right: 5, background: '#6b21a8', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px' }}>✓</div>}
                          <img
                            src={nft.image}
                            alt={nft.name}
                            style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }}
                            onError={(e) => { e.target.src = `https://placehold.co/200x200/1a1a1a/666?text=${encodeURIComponent(nft.symbol || 'NFT')}`; }}
                          />
                          <div style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: '#fff' }}>
                            {nft.name}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {/* Common Bridge Controls (Direction & Action) */}
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
          <div className="action-button-container">
            <button
              className="action-btn"
              onClick={handleBridge}
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto' }} /> : (
                activeTab === 'nfts'
                  ? `Bridge ${selectedNfts.length > 0 ? selectedNfts.length + ' ' : ''}NFT${selectedNfts.length !== 1 ? 's' : ''}`
                  : 'Bridge Assets'
              )}
            </button>
            {status.msg && (
              <div className={`status-msg ${status.type}`}>
                {status.msg}
                {status.link && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                    <a href={status.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      View Transaction
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

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
