import React, { useState } from 'react';
import { X, FileText, Server, Code, ArrowRight } from 'lucide-react';

const DocsModal = ({ isOpen, onClose }) => {
    const [activeSection, setActiveSection] = useState('overview');

    if (!isOpen) return null;

    const sections = [
        { id: 'overview', label: 'Protocol Overview' },
        { id: 'relayer', label: 'Relayer Infrastructure' },
        { id: 'contracts', label: 'Smart Contracts' },
        { id: 'lifecycle', label: 'Atomic Lifecycle' },
        { id: 'security', label: 'Security & Risk' },
    ];

    const renderContent = () => {
        switch (activeSection) {
            case 'overview':
                return (
                    <div className="doc-content">
                        <h2>Omega Bridge Protocol</h2>
                        <p>The **Omega Bridge** is a high-performance interoperability protocol designed to bridge liquidity between the <strong>Omega Network (EVM)</strong> and <strong>Solana (SVM)</strong>.</p>
                        <p>It employs a deterministic **Lock-and-Mint** / **Burn-and-Release** mechanism to ensure strict 1:1 token pegging. This architecture eliminates potential slippage found in liquidity-pool based bridges and ensures infinite capital efficiency relative to the collateral locked in the vault.</p>
                        <div className="info-box">
                            <strong>Network:</strong> Omega Testnet / Solana Devnet<br />
                            <strong>Consensus:</strong> Proof-of-Authority (PoA) Relayer Node
                        </div>
                    </div>
                );
            case 'relayer':
                return (
                    <div className="doc-content">
                        <h2>Relayer Infrastructure</h2>
                        <p>The Relayer is an off-chain orchestration node operating on an event-driven architecture.</p>
                        <ul>
                            <li><strong>Ingress Listener (Solana):</strong> Subscribes to the RPC to poll for finalized `Burn` instructions on the specific SPL Token Mint. It performs deep introspection of transaction logs to decode `Memo` payloads (Base58) for routing.</li>
                            <li><strong>Ingress Listener (Omega):</strong> Listens for WebSocket `Log` events emitted by the Solidity Bridge Contract, specifically filtering for `Locked(address,uint256,string)` topics.</li>
                            <li><strong>Transaction Orchestrator:</strong> Upon event validation, the Relayer cryptographically signs and submits the corresponding `mint` or `release` transaction to the destination chain, managing nonce sequencing and gas estimation.</li>
                        </ul>
                    </div>
                );
            case 'contracts':
                return (
                    <div className="doc-content">
                        <h2>Smart Contract Architecture</h2>
                        <div className="code-block">
                            <label>Omega Network (Solidity / EVM)</label>
                            <code>0x3E78D4Cd1026a90A582861E55BFf757361863ED8</code>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#666' }}>Implements `ReentrancyGuard` for security and `Ownable` for Relayer access control. Serves as the non-custodial vault for native assets.</p>
                        </div>
                        <div className="code-block">
                            <label>Solana (SPL Token / SVM)</label>
                            <code>6oSdZKPtY2SFptMHYnEjHU4MN2EYSNBHRVWgmDiJXjpy</code>
                            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#666' }}>Standard SPL Token with strict Mint Authority controls delegated to the Relayer keypair.</p>
                        </div>
                    </div>
                );
            case 'lifecycle':
                return (
                    <div className="doc-content">
                        <h2>Atomic Swap Lifecycle</h2>
                        <h3>Omega (EVM) &rarr; Solana (SVM)</h3>
                        <ol>
                            <li><strong>Lock:</strong> User invokes `lock()` on the Bridge Contract. Native assets are transferred to the contract vault.</li>
                            <li><strong>Emission:</strong> The contract emits a `Locked` event containing the sender, amount, and Solana destination.</li>
                            <li><strong>Observation:</strong> Relayer detects the event after `n` block confirmations.</li>
                            <li><strong>Mint:</strong> Relayer submits a `mintTo` instruction to the Solana Token Program, minting wOMGA to the user's Associated Token Account (ATA).</li>
                        </ol>
                        <h3>Solana (SVM) &rarr; Omega (EVM)</h3>
                        <ol>
                            <li><strong>Burn:</strong> User constructs a generic transaction with a `Memo` (EVM target) and a `Burn` instruction.</li>
                            <li><strong>Indexing:</strong> Relayer parses the finalized block, decoding the Memo instruction.</li>
                            <li><strong>Release:</strong> Relayer triggers the `release()` function on Omega, unlocking native assets from the vault to the user.</li>
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
                            <li><strong>Custody Isolation:</strong> Assets are isolated in the Bridge Contract, reachable only via the `release` function signed by the authorized Relayer.</li>
                            <li><strong>Access Control:</strong> Critical minting and releasing privileges are strictly scoped to the Relayer's cryptographic keys.</li>
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
