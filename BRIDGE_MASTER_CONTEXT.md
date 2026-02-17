# Omega Bridge: Master Context & Architecture
**Last Updated:** January 11, 2026
**Status:** Live (NFT Mainnet / Token Devnet)

## 1. System Overview
The Omega Bridge facilitates the transfer of Tokens and NFTs between **Solana** and **Omega Network**.
- **Architecture:** Lock-and-Mint / Burn-and-Release.
- **Relayer:** A Node.js service listening to on-chain events on both networks to trigger cross-chain actions.

---

## 2. Smart Contracts & Addresses

### 🔵 Omega Network (Mainnet)
*   **RPC:** `https://0x4e4542bc.rpc.aurora-cloud.dev/`
*   **Chain ID:** `1313161916`
*   **Token Bridge Contract:** `0xdC43DCAE0c13f11f425cAB7240A035137B2f6f6F`
    *   *Functionality:* Locks OMGA tokens on Omega (native coin) for wrapping on Solana.
*   **Solar Sentries NFT Contract (wSDS):** `0xf5d3107F16127272ADd8d6e6623A9B5bB9dE7aC4`
    *   *Symbol:* `wSDS` | *Type:* ERC721
*   **Secret Serpent Society NFT Contract (wSSS):** `0x387f12f5099B1fB1c927dcaE64048b69092FD953`
    *   *Symbol:* `wSSS` | *Type:* ERC721
*   **Relayer Authority Address:** `0x84648D72E9e9882bd366df6898D66c93780FDb2a`
    *   *Role:* Owner of NFT contracts (has `mint` permission). Derived from `OMEGA_PRIVATE_KEY`.

### 🌞 Solana (Mixed)
*   **Network:** Token Bridge is **Devnet** | NFT Bridge is **Mainnet**.
*   **Relayer Wallet (Custodial Vault):** `4XJ4Mrkn8Jn8vaJKxmUQWSKHQdwaDiKsDDxeNexodiEq`
    *   *Role:* Receives NFTs to lock them. Pays for Rent/Network fees.
*   **Fee Wallet (Revenue):** `3cRXRqs4BBQJeVZCpKNFjS3ife9ok1HxmEjwe2zX6CLY`
    *   *Rate:* 0.01 SOL per NFT Bridge transaction.
*   **Token Mint (Devnet Wrapped OMGA):** `6oSdZKPtY2SFptMHYnEjHU4MN2EYSNBHRVWgmDiJXjpy`
    *   *Note:* Will be replaced by Real OMGA Mint on Mainnet migration.

---

## 3. Infrastructure & Deployment

### 🖥️ Relayer (Render)
*   **Service Name:** `omega_bridge`
*   **Repo:** `github.com/OmegaNetwork-source/omega_bridge`
*   **Environment Variables (Secrets):**
    1.  `OMEGA_PRIVATE_KEY`: `0x15b...` (The Owner key for Omega contracts).
    2.  `SOLANA_RELAYER_KEYPAIR_JSON`: `[12, 242...]` (The `4XJ4...` wallet private key array).
    3.  `SOLANA_RPC_MAINNET`: Helius RPC URL.
*   **Key Rotation:** Performed on Jan 11, 2026. Compromised key (`Dgjkh...`) was rotated to `4XJ4...`.

### 🎨 Frontend UI (Vercel)
*   **Framework:** React + Vite
*   **Wallet Support:** Phantom (Solana), MetaMask (Omega).
*   **Features:**
    *   Dynamic Collection Detection (detects SSS vs SDS based on metadata).
    *   Helius DAS API integration for fast NFT loading.
    *   Fallback image handling for Shadow Drive outages.
    *   Automatic fee deduction (0.01 SOL).

---

## 4. Current Implementation Details

### NFT Bridge Flow (Solana -> Omega)
1.  **User UI:** Selects NFT -> Clicking "Bridge" sends 3 instructions:
    *   `Transfer`: NFT -> Relayer Wallet (`4XJ4...`).
    *   `Memo`: Destination Omega Address (e.g., `0x123...`).
    *   `Transfer`: 0.01 SOL -> Fee Wallet (`3cRXR...`).
2.  **Relayer:**
    *   Detects incoming transaction to `4XJ4...`.
    *   Extracts Memo (`0x123...`).
    *   Fetches Metadata (Symbol/Name) to decide Collection (`wSDS` vs `wSSS`).
    *   **Mints** wrapped NFT on Omega to `0x123...` with original Metadata URI.

### NFT Bridge Flow (Omega -> Solana) (TODO)
*   *Current Status:* Not yet implemented in UI. Contracts support `burnToSolana`. Relayer needs listener logic.

### Token Bridge Flow
*   **Solana -> Omega:** Burn Wrapped OMGA on Solana -> Release Native OMGA on Omega (Relayer logic active).
*   **Omega -> Solana:** Lock Native OMGA on Omega -> Mint Wrapped OMGA on Solana (Relayer logic active).

---

## 5. Next Steps: Mainnet Migration 🚀
To fully launch the Token Bridge on Mainnet:

1.  **Deploy:** Create new Wrapped OMGA SPL Token on Solana Mainnet.
2.  **Config:** Update `SOLANA_MINT_ADDRESS` in `ui/src/App.jsx` and `relayer/solana_info.json`.
3.  **Relayer:** Switch `SOLANA_RPC` to Mainnet in `relayer/index.js`.
4.  **Liquidity:** Ensure Relayer Wallet on Solana has "Mint Authority" for the new token (or enough supply to release).
