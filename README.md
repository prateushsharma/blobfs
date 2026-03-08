# BlobFS

**AI Dataset Licensing & Royalty Layer on Ethereum Blobspace**

> Built with BlobKit · Grant: BlobKit Cohort 2 · 2 ETH

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with BlobKit](https://img.shields.io/badge/Built%20with-BlobKit-00ffcc)](https://blobkit.org)
[![Network: Sepolia](https://img.shields.io/badge/Network-Sepolia-blue)](https://sepolia.etherscan.io)

---

## What is BlobFS?

BlobFS is an open-source marketplace where AI companies can license training datasets from data creators — with every piece of data, every license agreement, and every purchase receipt stored directly on **Ethereum blobspace** via EIP-4844.

**The problem:** AI companies are being sued for training on unlicensed data. There is no trustless, verifiable way to prove what data was licensed, when, and for how much.

**The solution:** BlobFS stores dataset chunks, license manifests, and cryptographic purchase receipts as blobs on Ethereum. License ownership is provable on-chain, permanent, and tamper-proof — without relying on any centralised database.

---

## How It Works

```
Data Creator                    BlobFS Protocol                  AI Company
     │                               │                               │
     │  1. Upload dataset            │                               │
     │ ─────────────────────────────►│                               │
     │     (chunks → ETH blobs)      │                               │
     │                               │                               │
     │  2. Publish manifest          │                               │
     │ ─────────────────────────────►│                               │
     │     (on-chain registry)       │                               │
     │                               │                               │
     │                               │  3. Browse & purchase license │
     │                               │◄──────────────────────────────│
     │                               │     (pay ETH)                 │
     │                               │                               │
     │  4. Royalty payment (97.5%)   │                               │
     │◄──────────────────────────────│                               │
     │                               │                               │
     │                               │  5. Receipt blob written      │
     │                               │ ─────────────────────────────►│
     │                               │     (cryptographic proof)     │
```

### Data Flow

1. **Upload** — dataset is split into ~120KB chunks, each chunk written to Ethereum blobspace via BlobKit
2. **Publish** — a manifest blob is created with all chunk tx hashes, file hash, price, and license terms. The manifest tx hash is registered on-chain via `DatasetRegistry.sol`
3. **Purchase** — AI company sends ETH to `LicenseMarket.sol`. 97.5% goes to the creator, 2.5% is the protocol fee
4. **Receipt** — a license receipt blob is written to Ethereum containing buyer, seller, dataset hash, amount paid, and timestamp — the buyer's cryptographic proof of license ownership
5. **Verify** — anyone can verify a license by reading the receipt blob directly from Ethereum blobspace via the Beacon API

---

## Roadmap

### Phase 2 — Blob Aggregation Layer

BlobFS will introduce a **blob aggregation layer** that batches multiple small dataset operations into single blob transactions. Instead of each upload or receipt write consuming a full blob, the aggregator packs multiple payloads into one blob transaction, dramatically reducing gas costs for smaller datasets and high-frequency licensing activity.

```
Multiple small payloads          Aggregation Layer           Single blob tx
  receipt A (2KB)  ──────►                                
  receipt B (1KB)  ──────►   [ pack + merkle root ]  ──►  1 blob on Ethereum
  receipt C (3KB)  ──────►                                
```

The aggregation layer maintains a Merkle tree of all packed payloads, so individual receipts remain independently verifiable — any payload can be proven against the root without reading the entire blob.

### Phase 3 — Open API Layer

BlobFS will expose a **public API layer** so other protocols and applications can inherit the BlobFS licensing and receipt infrastructure without rebuilding it:

- **`POST /api/v1/extern/publish`** — any application can publish a dataset to BlobFS and receive a dataset ID + manifest tx hash
- **`POST /api/v1/extern/license`** — any application can issue a BlobFS-compatible license receipt for their own content
- **`GET /api/v1/extern/verify`** — verify any BlobFS receipt programmatically, suitable for on-chain oracles or backend compliance checks
- **Webhooks** — subscribe to license purchase events for a dataset, enabling real-time royalty notifications
- **SDK packages** — `@blobfs/react`, `@blobfs/node` for direct integration without running a backend

This turns BlobFS from a standalone marketplace into a **licensing primitive** that any protocol can plug into.

### Phase 4 — Distributed Commit Layer

For scalability, BlobFS will implement a **distributed commit layer** where blob writes are coordinated across multiple nodes:

- Multiple BlobFS nodes each maintain a local index of published datasets and receipts
- Nodes gossip new manifests and receipts to each other via a lightweight p2p protocol
- Conflict resolution is handled by the Ethereum chain — the blob tx hash is the canonical identifier
- Any node can reconstruct the full dataset index by replaying blob transactions from Ethereum

This removes the single-server bottleneck and makes BlobFS censorship-resistant at the infrastructure level, not just the data level.

### Phase 5 — ZK License Proofs

Instead of revealing which datasets an AI model was trained on, a model provider generates a ZK proof that they hold valid licenses for all training data — without disclosing the dataset list. This enables **privacy-preserving compliance** for AI companies who need to prove licensing to regulators without revealing their data strategy.

**KZG Commitment Verification** — blob data is already committed via KZG proofs as part of EIP-4844. BlobFS will leverage these existing commitments to build ZK circuits that prove dataset integrity without re-downloading blob data. The KZG commitment in the blob transaction becomes the root of the proof.

**On-chain Proof Verification** — ZK proofs submitted to a verifier contract on Ethereum mainnet, enabling trustless compliance checks. Any smart contract or auditor can verify that a model's training data was fully licensed with a single on-chain call.

This makes BlobFS the first infrastructure layer for **verifiable AI training data compliance** — provable not just by transaction history, but by zero-knowledge proofs anchored directly to Ethereum blobspace.

### Phase 6 — Mainnet Deploy

Full deployment to Ethereum mainnet with:
- `DatasetRegistry` and `LicenseMarket` contracts on mainnet
- Mainnet BlobKit proxy (`https://proxy.blobkit.org`)
- Escrow contract at `0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838`
- Production frontend with mainnet wallet support
- Blob aggregation active to minimise gas costs for creators

---

## Architecture

```
blobfs/
├── packages/
│   ├── sdk/              # BlobKit wrapper — chunking, hashing, blob I/O
│   ├── cli/              # CLI: blobfs upload / blobfs verify
│   ├── contracts/        # Solidity: DatasetRegistry + LicenseMarket
│   └── backend/          # Express API — BlobKit integration, SQLite index
├── frontend/             # React + Vite + wagmi — marketplace UI
└── examples/             # Usage examples
```

### Smart Contracts (Sepolia)

| Contract | Address |
|---|---|
| DatasetRegistry | `0x130E6282AC19ae0B3f657BBf1303F4A1be75bbe2` |
| LicenseMarket | `0x9C9a50eeFAeb0d3661fdDD5702723E4faD63a62E` |
| Treasury | `0x313a132F028422c2553aacD22bE55c06134AfaC8` |

### BlobKit Integration

BlobFS uses BlobKit as its sole interface to Ethereum blobspace. Every data operation goes through BlobKit:

| Operation | BlobKit Function |
|---|---|
| Upload dataset chunk | `blobkit.writeBlob(chunk, { codec: 'application/octet-stream' })` |
| Write manifest | `blobkit.writeBlob(manifest, { codec: 'application/json' })` |
| Write license receipt | `blobkit.writeBlob(receipt, { codec: 'application/json' })` |
| Read blob data | `blobkit.readBlobAsJSON(txHash)` + Beacon API fallback |
| Estimate upload cost | `blobkit.estimateCost(bytes)` |
| Poll job confirmation | `blobkit.getJobStatus(jobId)` |
| Refund failed upload | `blobkit.refundIfExpired(jobId)` |
| Wallet balance | `blobkit.getBalance()` |

---

## Blob Data Structures

Everything in BlobFS lives on Ethereum as a blob. The SQLite database is only an index for fast queries — the source of truth is always blobspace.

### Dataset Manifest Blob
```json
{
  "type": "blobfs-manifest",
  "version": "0.1.0",
  "name": "ImageNet Subset 10k",
  "contentType": "application/zip",
  "totalSize": 524288000,
  "fileHash": "sha256:...",
  "licenseType": "commercial",
  "priceWei": "5000000000000000",
  "chunks": [
    { "index": 0, "blobTxHash": "0x...", "size": 120000 }
  ]
}
```

### License Receipt Blob
```json
{
  "type": "blobfs-receipt",
  "version": "0.1.0",
  "datasetId": "abc123",
  "buyer": "0xBuyerAddress",
  "seller": "0xCreatorAddress",
  "amountPaid": "5000000000000000",
  "licenseType": "commercial",
  "purchasedAt": 1710000000,
  "fileHash": "sha256:...",
  "payloadHash": "0x...",
  "ethTxHash": "0x..."
}
```

---

## ETH Impact

Every interaction with BlobFS produces blob transactions on Ethereum:

- **Dataset upload** — N blob transactions (one per ~120KB chunk) + 1 manifest blob
- **License purchase** — 1 receipt blob transaction + 1 ETH payment transaction
- **Protocol fee** — 2.5% of all licensing payments
- **Aggregation layer** (Phase 2) — further increases blob tx volume by batching third-party integrations

Every dataset published and every license purchased directly contributes to **ETH gas consumption and burn**. As the open API layer (Phase 3) enables other protocols to issue BlobFS receipts, ETH blob usage scales with the entire ecosystem built on top.

---

## Getting Started

### Prerequisites
- Node.js 18+
- Sepolia ETH ([faucet](https://sepoliafaucet.com))
- Alchemy or Infura RPC URL

### Backend

```bash
cd packages/backend
cp .env.example .env
# fill in RPC_URL, PRIVATE_KEY, PROXY_URL
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
# fill in VITE_API_URL
npm install
npm run dev
```

### CLI

```bash
cd packages/cli
npm install && npm run build

# Upload a dataset
blobfs upload ./mydata.csv --price 0.01 --license commercial

# Verify a receipt
blobfs verify 0xRECEIPT_TX_HASH
```

### Environment Variables

```bash
# Backend (.env)
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0xSERVER_WALLET_KEY
CHAIN_ID=11155111
PROXY_URL=https://proxy-sepolia.blobkit.org
BEACON_API_URL=https://ethereum-sepolia-beacon-api.publicnode.com
ARCHIVE_URL=https://api.blobscan.com
DATASET_REGISTRY_ADDRESS=0x130E6282AC19ae0B3f657BBf1303F4A1be75bbe2
LICENSE_MARKET_ADDRESS=0x9C9a50eeFAeb0d3661fdDD5702723E4faD63a62E

# Frontend (.env)
VITE_API_URL=http://localhost:3000
VITE_CHAIN_ID=11155111
```

---

## Grant

**Program:** BlobKit Cohort 2  
**Requested:** 2 ETH  
**Developer:** Prateush Sharma — solo, India  
**Repo:** [github.com/prateushsharma/blobfs](https://github.com/prateushsharma/blobfs)

### What the grant funds
- Development time for SDK, CLI, backend, and frontend
- Sepolia ETH for blob transaction testing
- Infrastructure costs for running the demo
- Initial work on the blob aggregation layer and open API
- Foundation for the ZK license proof layer

---

## License

MIT
