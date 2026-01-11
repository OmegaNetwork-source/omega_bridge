import React, { useState } from 'react';
import { X, FileText, Server, Code, ArrowRight } from 'lucide-react';

const DocsModal = ({ isOpen, onClose }) => {
    const [activeSection, setActiveSection] = useState('overview');

    if (!isOpen) return null;

    const sections = [
        { id: 'overview', label: 'Protocol Overview' },
        { id: 'relayer', label: 'Relayer Infrastructure' },
        { id: 'contracts', label: 'Smart Contracts' },
        { id: 'nft', label: 'NFT Bridge' },
        { id: 'lifecycle', label: 'Atomic Lifecycle' },
        { id: 'security', label: 'Security & Risk' },
    ];

    const renderContent = () => {
        switch (activeSection) {
            case 'overview':
                return (
                    <div className="doc-content">
                        <h2>Omega Bridge Protocol</h2>
                        <p>The <strong>Omega Bridge</strong> is a high-performance interoperability protocol designed to bridge liquidity and NFTs between the <strong>Omega Network (EVM)</strong> and <strong>Solana (SVM)</strong>.</p>
                        <p>It employs a deterministic <strong>Lock-and-Mint</strong> / <strong>Burn-and-Release</strong> mechanism for tokens, and a <strong>Transfer-and-Wrap</strong> mechanism for NFTs to ensure strict 1:1 pegging.</p>
                        <div className="info-box">
                            <strong>Network:</strong> Omega Mainnet / Solana Mainnet<br />
                            <strong>Consensus:</strong> Proof-of-Authority (PoA) Relayer Node<br />
                            <strong>Supported Assets:</strong> OMGA Tokens, Solar Sentries NFTs
                        </div>
                    </div>
                );
            case 'relayer':
                return (
                    <div className="doc-content">
                        <h2>Relayer Infrastructure</h2>
                        <p>The Relayer is an off-chain orchestration node operating on an event-driven architecture.</p>
                        <ul>
                            <li><strong>Token Listener (Solana):</strong> Subscribes to the RPC to poll for finalized `Burn` instructions on the SPL Token Mint. Decodes `Memo` payloads (Base58) for EVM routing.</li>
                            <li><strong>NFT Listener (Solana):</strong> Monitors the Relayer wallet for incoming NFT transfers. Extracts destination address from the attached Memo instruction.</li>
                            <li><strong>Token Listener (Omega):</strong> Listens for `Locked(address,uint256,string)` events from the Bridge Contract.</li>
                            <li><strong>Transaction Orchestrator:</strong> Upon event validation, signs and submits `mint`, `release`, or NFT wrapping transactions to the destination chain.</li>
                        </ul>
                    </div>
                );
            case 'contracts':
                return (
                    <div className="doc-content">
                        <h2>Smart Contract Architecture</h2>
                        <div className="code-block">
                            <label>Omega Token Bridge (Solidity)</label>
                            <code>0x3E78D4Cd1026a90A582861E55BFf757361863ED8</code>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#666' }}>Implements `ReentrancyGuard` and `Ownable`. Non-custodial vault for native OMGA.</p>
                        </div>
                        <div className="code-block">
                            <label>Omega NFT Contract (ERC-721)</label>
                            <code>0x249133EB269Fe3fC1C9AE4063d4831AB3C8FfFF0</code>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#666' }}>Wrapped Solar Sentries (wSDS). Mints wrapped NFTs with original Solana metadata URI.</p>
                        </div>
                        <div className="code-block">
                            <label>Solana SPL Token</label>
                            <code>6oSdZKPtY2SFptMHYnEjHU4MN2EYSNBHRVWgmDiJXjpy</code>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#666' }}>wOMGA token with Mint Authority controlled by the Relayer.</p>
                        </div>
                        <div className="code-block">
                            <label>Relayer Solana Wallet</label>
                            <code>4XJ4Mrkn8Jn8vaJKxmUQWSKHQdwaDiKsDDxeNexodiEq</code>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#666' }}>Custodial wallet for bridged NFTs. NFTs sent here are wrapped on Omega.</p>
                        </div>
                    </div>
                );
            case 'nft':
                return (
                    <div className="doc-content">
                        <h2>NFT Bridge (Solar Sentries)</h2>
                        <p>Bridge your Solar Sentries NFTs from Solana to Omega Network and back.</p>

                        <h3>Solana → Omega</h3>
                        <ol>
                            <li><strong>Select NFT:</strong> Choose one or more Solar Sentries NFTs from your wallet.</li>
                            <li><strong>Enter Omega Address:</strong> Provide your Omega/EVM wallet address.</li>
                            <li><strong>Transfer:</strong> NFTs are transferred to the Relayer wallet with a Memo containing your destination.</li>
                            <li><strong>Wrapping:</strong> Relayer detects the deposit and mints a Wrapped NFT (wSDS) on Omega with the original metadata.</li>
                        </ol>

                        <h3>Omega → Solana</h3>
                        <ol>
                            <li><strong>Burn:</strong> Call `burnToSolana(tokenId, solanaAddress)` on the NFT contract.</li>
                            <li><strong>Release:</strong> Relayer detects the burn event and transfers the original NFT back to your Solana wallet.</li>
                        </ol>

                        <div className="info-box">
                            <strong>Note:</strong> Each wrapped NFT stores the original Solana mint address, ensuring authentic provenance verification.
                        </div>
                    </div>
                );
            case 'lifecycle':
                return (
                    <div className="doc-content">
                        <h2>Atomic Swap Lifecycle</h2>
                        <h3>Tokens: Omega → Solana</h3>
                        <ol>
                            <li><strong>Lock:</strong> User invokes `lock()` on the Bridge Contract. Native OMGA is transferred to the vault.</li>
                            <li><strong>Emission:</strong> Contract emits a `Locked` event with sender, amount, and Solana destination.</li>
                            <li><strong>Observation:</strong> Relayer detects the event after block confirmation.</li>
                            <li><strong>Mint:</strong> Relayer mints wOMGA to the user's Solana ATA.</li>
                        </ol>
                        <h3>Tokens: Solana → Omega</h3>
                        <ol>
                            <li><strong>Burn:</strong> User burns wOMGA with a Memo containing their Omega address.</li>
                            <li><strong>Indexing:</strong> Relayer parses the finalized transaction.</li>
                            <li><strong>Release:</strong> Relayer calls `release()` on Omega, unlocking native OMGA.</li>
                        </ol>
                        <h3>NFTs: Solana → Omega</h3>
                        <ol>
                            <li><strong>Transfer:</strong> User sends NFT to Relayer wallet with Memo (Omega address).</li>
                            <li><strong>Detection:</strong> Relayer detects balance change and extracts metadata.</li>
                            <li><strong>Mint:</strong> Relayer mints wrapped ERC-721 on Omega.</li>
                        </ol>
                    </div>
                );
            case 'security':
                return (
                    <div className="doc-content">
                        <h2>Security & Risk Model</h2>
                        <p>The protocol implements a hub-and-spoke security model relying on Relayer integrity.</p>
                        <ul>
                            <li><strong>Double-Spend Protection:</strong> The Relayer maintains a cursor of processed transaction signatures to prevent replay attacks.</li>
                            <li><strong>Custody Isolation:</strong> Token assets are isolated in the Bridge Contract. NFTs are held in the Relayer wallet.</li>
                            <li><strong>Access Control:</strong> Minting and releasing privileges require the Relayer's cryptographic signature.</li>
                            <li><strong>NFT Provenance:</strong> Each wrapped NFT stores the original Solana mint address on-chain for verification.</li>
                        </ul>
                    </div>
                )
            default:
                return null;
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="docs-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header Row */}
                <div className="modal-header-row">
                    <h3>Omega OS Technical Documentation</h3>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body (Sidebar + Content) */}
                <div className="modal-body">
                    <div className="docs-sidebar">
                        <ul className="docs-nav">
                            {sections.map((section) => (
                                <li
                                    key={section.id}
                                    className={activeSection === section.id ? 'active' : ''}
                                    onClick={() => setActiveSection(section.id)}
                                >
                                    <span>{section.label}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="docs-main">
                        <div className="content-scroll">
                            {renderContent()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocsModal;
