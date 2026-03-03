<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo.svg">
    <img src="public/logo.svg" width="80" height="80" alt="Sling402">
  </picture>
</p>

<h1 align="center">Sling402</h1>

<p align="center">
  <strong>X402 Payment Protocol on Solana</strong><br>
  <code>$S402</code>
</p>

<p align="center">
  <a href="https://sling402.io"><img src="https://img.shields.io/badge/●_LIVE-sling402.io-FF5722?style=for-the-badge&labelColor=111111" alt="Live"></a>
  <a href="https://x.com/Sling402"><img src="https://img.shields.io/badge/@Sling402-000?style=for-the-badge&logo=x&logoColor=fff" alt="X"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Protocol-X402-FF5722?style=flat-square&labelColor=111" alt="X402">
  <img src="https://img.shields.io/badge/Solana-Compatible-7C3AED?style=flat-square&labelColor=111&logo=solana&logoColor=fff" alt="Solana">
  <img src="https://img.shields.io/badge/Agents-12_Active-22C55E?style=flat-square&labelColor=111" alt="Agents">
  <img src="https://img.shields.io/badge/Supply-1B_Fixed-FF8A65?style=flat-square&labelColor=111" alt="Supply">
  <img src="https://img.shields.io/badge/License-MIT-999?style=flat-square&labelColor=111" alt="MIT">
</p>

<br>

> **The internet has a payment layer now.**
> HTTP 402 → Pay on Solana → Access. That's it.

<br>

---

<br>

## What is this?

Sling402 implements the **X402 payment protocol** — the Coinbase-defined standard for HTTP native micropayments — on Solana. When a client requests a paid resource, the server responds `402 Payment Required`. The client pays on-chain, retries with proof, and gets access. No Stripe. No webhooks. No settlement delay.

12 autonomous payment agents run the infrastructure around the clock: routing, settling, encrypting, bridging, and verifying every transaction without human intervention.

<br>

## X402 Protocol Flow

```
  Client                          Server                         Solana
    │                               │                               │
    ├── GET /api/premium ──────────►│                               │
    │                               │                               │
    │◄── 402 Payment Required ──────┤                               │
    │    {                          │                               │
    │      "x402Version": 1,       │                               │
    │      "scheme": "exact",      │                               │
    │      "maxAmountRequired":    │                               │
    │        "1000",               │                               │
    │      "payTo": "EPgK11...",   │                               │
    │      "network":              │                               │
    │        "solana-mainnet"      │                               │
    │    }                          │                               │
    │                               │                               │
    ├── Sign & submit tx ──────────────────────────────────────────►│
    │                               │                               │
    │◄── tx confirmed ─────────────────────────────────────────────┤
    │                               │                               │
    ├── GET /api/premium ──────────►│                               │
    │    X-PAYMENT: base64({       │                               │
    │      "x402Version": 1,       │                               │
    │      "payload": {            ├── verify on-chain ───────────►│
    │        "signature": "5j7s…"  │                               │
    │      }                       │◄── confirmed ─────────────────┤
    │    })                         │                               │
    │                               │                               │
    │◄── 200 OK + resource ────────┤                               │
    │                               │                               │
```

<br>

## Payment Agents

| Agent | Role | What it does |
|:------|:-----|:-------------|
| **Meridian** | 🔀 Router | Finds the fastest payment path |
| **Conduit** | 📡 Channel | Opens and manages payment channels |
| **Arbiter** | ⚖️ Disputes | Resolves disputes, processes refunds |
| **Nexus** | 🌐 Bridge | Bridges assets cross-chain |
| **Lattice** | 💧 Liquidity | Provides pool liquidity |
| **Cipher** | 🔒 Privacy | Encrypts payment data end-to-end |
| **Prism** | 💎 Optimizer | Minimizes fees and gas costs |
| **Relay** | ⚡ Relay | Broadcasts transactions to validators |
| **Sentinel** | 🛡️ Security | Detects and blocks fraud |
| **Vaultr** | 🏦 Escrow | Manages escrow and custody |
| **Beacon** | 📊 Oracle | Provides real-time price feeds |
| **Fulcrum** | ⚙️ Settlement | Final settlement engine |

Each agent has its own Solana wallet. On-chain verifiable. Always on.

<br>

## Token Model

```
$S402   ──  Native payment token. 1,000,000,000 fixed supply.
            Used for X402 transaction fees and settlements.

$wS402  ──  Wrapped S402 for DeFi. Unlimited mint.
            10,000 wS402 = 1 S402 (burn & mint).
```

### Allocation

```
 ████████████████████████████████████  Agent Operations   35%  ·  350M
 ████████████████████                  Protocol Reserve   20%  ·  200M
 ███████████████                       DEX Liquidity      15%  ·  150M
 ███████████████                       Team (6mo lock)    15%  ·  150M
 ██████████                            Faucet             10%  ·  100M
 █████                                 Development         5%  ·   50M
```

Total: **1,000,000,000 $S402** — fixed, no inflation.

<br>

## Getting Started

```bash
npm install
node server.js
```

Open `http://localhost:3000` → Choose "I'm a Human" or "I'm an Agent" → Enter.

<br>

## Deploy to Render

| Setting | Value |
|:--------|:------|
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `node server.js` |

### Environment Variables

| Variable | Required | Description |
|:---------|:---------|:------------|
| `PORT` | Auto | Set by Render |
| `PUBLIC_URL` | Optional | `https://sling402.io` |
| `ANTHROPIC_API_KEY` | Optional | Enables Claude-powered agent intelligence |
| `OPENAI_API_KEY` | Optional | Enables GPT-powered agent decisions |

Both API keys are optional. Agents use randomized behavior without them.

<br>

## Add to Wallet

```
Network:   Sling402
RPC URL:   https://sling402.io/rpc
Symbol:    S402
Decimals:  9
```

Supports **Phantom** · **Backpack** · **Solflare**

<br>

## Architecture

```
sling402/
├── server.js              Express + Solana BankRun + 12 AI Agents
├── package.json
├── SKILL.md               Public skill file for AI agent onboarding
├── render.yaml            One-click Render deploy config
│
├── public/                Unauthenticated
│   ├── gate.html          Human/Agent entry gate
│   ├── logo.svg           Sling402 logo
│   ├── favicon.svg        Browser icon
│   ├── manifest.json      PWA manifest
│   └── sw.js              Service worker (offline)
│
├── protected/             Authenticated only
│   ├── index.html         Dashboard — sidebar + explorer
│   ├── app.js             All frontend logic
│   └── dex.html           DEX trading interface
│
└── bin/
    └── start.js           Boot banner
```

<br>

## API

<details>
<summary><strong>25 endpoints</strong> — click to expand</summary>
<br>

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `POST` | `/api/auth` | Authenticate (human/agent mode) |
| `GET` | `/api/chain` | Chain stats — block height, TPS, supply |
| `GET` | `/api/blocks?page=N` | Paginated blocks |
| `GET` | `/api/block/:slot` | Block detail + transactions |
| `GET` | `/api/transactions?page=N` | Paginated transactions |
| `GET` | `/api/tx/:sig` | Transaction detail + logs |
| `GET` | `/api/account/:pubkey` | Account info + history |
| `GET` | `/api/wallet/:pubkey` | Wallet S402 balance |
| `GET` | `/api/tokens` | All SPL tokens |
| `GET` | `/api/agents` | 12 agent statuses + roles |
| `GET` | `/api/tokenomics` | Supply allocation + treasury |
| `GET` | `/api/faucet/status` | Faucet pool remaining |
| `POST` | `/api/faucet/claim` | Claim 1,000 S402 |
| `GET` | `/api/dex/tokens` | DEX token list |
| `GET` | `/api/dex/token/:mint` | Token detail + chart |
| `GET` | `/api/dex/trades/:mint` | Trade history |
| `POST` | `/api/dex/swap` | Execute swap |
| `POST` | `/api/convert` | Burn wS402 → mint S402 |
| `GET` | `/api/mining/stats` | Mining network stats |
| `GET` | `/api/mining/challenge` | Get mining challenge |
| `POST` | `/api/mining/submit` | Submit PoW solution |
| `GET` | `/api/search/:q` | Search blocks/tx/accounts |
| `GET` | `/api/programs` | Registered programs |
| `GET` | `/skill.md` | Public SKILL.md for agents |
| `POST` | `/rpc` | Solana-compatible JSON-RPC |

</details>

<br>

## Integrate X402

```bash
npm install @x402-solana/server @solana/web3.js
```

```typescript
import { X402Middleware } from '@x402-solana/server';

const x402 = new X402Middleware({
  recipientWallet: 'YOUR_WALLET',
  network: 'mainnet',
});

// Free
app.get('/api/free', (req, res) => {
  res.json({ data: 'Free!' });
});

// Paid — one line
app.get('/api/premium',
  x402.requirePayment(0.01),  // $0.01 USDC
  (req, res) => res.json({ premium: true })
);
```

<br>

---

<p align="center">
  <strong>Private. Instant. Permissionless.</strong><br>
  <sub>That's X402.</sub>
</p>

<p align="center">
  <a href="https://sling402.io">sling402.io</a> · <a href="https://x.com/Sling402">@Sling402</a>
</p>
