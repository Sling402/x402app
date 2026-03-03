# Sling402 — X402 Payment Protocol

## Identity

| Field | Value |
|---|---|
| Name | Sling402 |
| Token | $S402 (native) · $wS402 (wrapped) |
| Handle | [@Sling402](https://x.com/Sling402) |
| Domain | [sling402.io](https://sling402.io) |
| Protocol | X402 (HTTP 402 Payment Required) |
| Chain | Solana-compatible (BankRun runtime) |
| Supply | 1,000,000,000 $S402 (fixed) |

## Quick Start

```bash
npm install
node server.js
```

Password: `Sling402`

## Architecture

```
┌──────────────────────────────────────────────┐
│                   SLING402                    │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─────────┐  ┌─────────┐  ┌────────────┐   │
│  │ Express  │  │  Solana  │  │ 12 Payment │   │
│  │ Server   │  │ BankRun  │  │   Agents   │   │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘   │
│       │             │              │           │
│  ┌────┴─────────────┴──────────────┴───────┐  │
│  │         REST API (25+ endpoints)        │  │
│  └────┬──────────┬──────────┬──────────┬───┘  │
│       │          │          │          │       │
│  ┌────┴───┐ ┌────┴───┐ ┌───┴────┐ ┌───┴───┐  │
│  │Explorer│ │ Faucet │ │  DEX   │ │Convert│  │
│  │ Tokens │ │ 1K/wal │ │ Swaps  │ │ wS402 │  │
│  │ Agents │ │        │ │ Charts │ │→ S402 │  │
│  └────────┘ └────────┘ └────────┘ └───────┘  │
│                                              │
│  Frontend: HTML/CSS/JS · Left Sidebar        │
│  DM Sans + IBM Plex Mono · Orange/#FF5722    │
│                                              │
└──────────────────────────────────────────────┘
```

## X402 Protocol

The X402 payment flow:

1. Client requests a paid resource
2. Server responds `402 Payment Required` with JSON body:
   - `x402Version: 1`
   - `scheme: "exact"`
   - `network: "solana-mainnet"`
   - `maxAmountRequired` (in micro-USDC)
   - `payTo` (recipient token account)
   - `asset` (USDC mint address)
3. Client signs Solana transaction, submits on-chain
4. Client retries request with `X-PAYMENT` header (base64 JSON with tx signature)
5. Server verifies on-chain, returns resource

## Solana JSON-RPC

```
POST https://sling402.io/rpc
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["ADDRESS"]}
```

### Wallet Setup

```
Network Name:  Sling402
RPC URL:       https://sling402.io/rpc
Symbol:        S402
Decimals:      9
Explorer:      https://sling402.io
```

## Payment Agents

| Agent | Role | Description |
|---|---|---|
| Meridian | Router | Payment path optimization |
| Conduit | Channel | Payment channel management |
| Arbiter | Disputes | Dispute resolution & refunds |
| Nexus | Bridge | Cross-chain bridge operations |
| Lattice | LP | Liquidity provisioning |
| Cipher | Privacy | Encryption & privacy layer |
| Prism | Optimizer | Fee optimization & gas estimation |
| Relay | Relay | Transaction broadcasting |
| Sentinel | Security | Fraud detection |
| Vaultr | Escrow | Escrow & custody services |
| Beacon | Oracle | Price feeds & rate oracle |
| Fulcrum | Settlement | Settlement engine |

## Tokens

### $S402 — Sling402 (Native)

```
Type:          SPL Token
Symbol:        S402
Name:          Sling402
Decimals:      9
Total Supply:  1,000,000,000
```

### $wS402 — Wrapped Sling402

```
Type:          SPL Token
Symbol:        wS402
Name:          Wrapped S402
Decimals:      9
Conversion:    10,000 wS402 = 1 S402 (burn & mint)
```

## Supply Allocation

| Pool | Amount | % | Purpose |
|---|---|---|---|
| Agent Operations | 350,000,000 | 35% | Payment agent wallets |
| Protocol Reserve | 200,000,000 | 20% | Network incentives |
| DEX Liquidity | 150,000,000 | 15% | Trading pair liquidity |
| Team | 150,000,000 | 15% | 6-month lock, linear vest |
| Faucet | 100,000,000 | 10% | 1K S402 per wallet, no refill |
| Development | 50,000,000 | 5% | Protocol upgrades |

## API Reference

Base URL: `https://sling402.io`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth` | Authenticate `{password}` |
| GET | `/api/chain` | Chain stats (block, TPS, supply) |
| GET | `/api/blocks?page=N` | Paginated blocks |
| GET | `/api/block/:slot` | Block detail |
| GET | `/api/transactions?page=N` | Paginated transactions |
| GET | `/api/tx/:sig` | Transaction detail |
| GET | `/api/account/:pubkey` | Account info + history |
| GET | `/api/wallet/:pubkey` | Wallet S402 balance |
| GET | `/api/tokens` | All SPL tokens |
| GET | `/api/agents` | 12 agent statuses |
| GET | `/api/tokenomics` | Supply & treasury balances |
| GET | `/api/faucet/status` | Faucet pool remaining |
| POST | `/api/faucet/claim` | Claim 1,000 S402 `{address}` |
| GET | `/api/dex/tokens` | DEX token list with prices |
| GET | `/api/dex/token/:mint` | Token detail + chart data |
| POST | `/api/dex/swap` | Execute swap `{wallet, tokenMint, side, amount}` |
| POST | `/api/convert` | Burn wS402 → mint S402 `{address, amount}` |
| GET | `/api/search/:q` | Search blocks/tx/accounts |
| POST | `/rpc` | Solana JSON-RPC |

## Environment Variables

```
PORT=3000                                  # Auto-set by Render
PUBLIC_URL=https://sling402.io             # Public domain
ANTHROPIC_API_KEY=sk-ant-api03-...         # Optional — Claude AI
OPENAI_API_KEY=sk-...                      # Optional — Agent AI
```

## File Structure

```
sling402/
├── server.js              # Express + Solana BankRun + Agents
├── package.json
├── bin/
│   └── start.js           # Boot banner
├── public/
│   ├── gate.html          # Password gate
│   ├── logo.svg           # Sling402 logo
│   └── favicon.svg        # Browser icon
└── protected/
    ├── index.html          # Main UI (sidebar layout)
    ├── app.js              # Explorer + wallet + faucet logic
    └── dex.html            # DEX trading interface
```

---

**sling402.io** · **@Sling402** · **$S402**
