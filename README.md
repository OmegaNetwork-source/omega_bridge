# Omega Bridge v1.3

Cross-chain bridge for Solar Sentries NFTs between Solana and Omega Network.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Solana        │     │    Relayer      │     │  Omega Network  │
│   (Mainnet)     │────▶│  (Node.js)      │────▶│   (EVM Chain)   │
│                 │     │                 │     │                 │
│  NFT + Memo     │     │  Detect + Mint  │     │  Wrapped NFT    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Components

- **`/ui`** - React frontend (Vite)
- **`/relayer`** - Node.js bridge relayer
- **`/omega`** - Solidity contracts

## Deployment

### Frontend (Vercel)
1. Connect repo to Vercel
2. Set root directory to `ui`
3. Deploy

### Relayer (Render/Railway)
1. Create new Web Service
2. Set root directory to `relayer`
3. Build command: `npm install`
4. Start command: `node index.js`
5. Add environment variables:
   - `OMEGA_PRIVATE_KEY` - Relayer wallet private key

## Contract Addresses

- **Omega NFT Contract:** `0x249133EB269Fe3fC1C9AE4063d4831AB3C8FfFF0`
- **Relayer Solana Wallet:** `DgjkhEv2xJNJhDSLaH7UTMffF3QkEUADXuaL92ogFeAx`

## Local Development

```bash
# UI
cd ui && npm install && npm run dev

# Relayer
cd relayer && npm install && node index.js
```
