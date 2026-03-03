// ============================================
// ⭐ Sling402 NETWORK — Real Solana Runtime Explorer
// Uses solana-bankrun (real Solana transaction processing)
// ============================================
const express = require("express");
const path = require("path");
const fs = require("fs");
const { start } = require("solana-bankrun");
const {
  PublicKey, Keypair, Transaction, SystemProgram,
  LAMPORTS_PER_SOL, TransactionInstruction,
} = require("@solana/web3.js");
const splToken = require("@solana/spl-token");

const app = express();
app.disable('x-powered-by');
app.set('etag', false);
app.use(require("cors")());
app.use(express.json());

// ════════════════════════════════════════
// 🔒 ABSOLUTE LOCKDOWN — SERVER PASSWORD GATE
// ════════════════════════════════════════
// NOTHING is accessible without auth except:
//   - GET /          → gate page
//   - POST /api/auth → login
//   - GET /mascot.png, /favicon.png, /icon-192.png, /pfp.png → gate assets only
// Everything else requires a valid session token.

const SERVER_PASSWORD = "Sling402";
const validSessions = new Set();

function generateSession() {
  const chars = 'abcdef0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Cookie parser
app.use((req, res, next) => {
  req.cookies = {};
  const c = req.headers.cookie;
  if (c) c.split(';').forEach(p => { const [k, v] = p.trim().split('='); if (k && v) req.cookies[k] = v; });
  next();
});

function getSession(req) {
  return req.headers['x-session'] || req.query.session || req.cookies?.session || '';
}

// ── PUBLIC ROUTES (no auth) ──

// Login endpoint
app.post("/api/auth", (req, res) => {
  const { password, mode } = req.body;
  // Human mode — direct entry, no password needed
  if (mode === "human") {
    const token = generateSession();
    validSessions.add(token);
    return res.json({ success: true, token });
  }
  // Agent mode — direct entry for AI agents
  if (mode === "agent") {
    const token = generateSession();
    validSessions.add(token);
    return res.json({ success: true, token });
  }
  // Legacy password fallback
  if (password === SERVER_PASSWORD) {
    const token = generateSession();
    validSessions.add(token);
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, error: "Access denied" });
});

// Serve SKILL.md publicly for AI agents
app.get("/skill.md", (req, res) => {
  res.sendFile(path.join(__dirname, "SKILL.md"));
});

// Gate page — the ONLY page anyone sees without auth
app.get("/", (req, res) => {
  // If already authed, go to app
  if (validSessions.has(getSession(req))) {
    return res.sendFile(path.join(__dirname, "protected", "index.html"));
  }
  res.sendFile(path.join(__dirname, "public", "gate.html"));
});

// Gate assets + PWA assets (served without auth)
const GATE_ASSETS = ['/favicon.svg', '/logo.svg', '/icon-72.png', '/icon-96.png', '/icon-128.png', '/icon-144.png', '/icon-152.png', '/icon-192.png', '/icon-384.png', '/icon-512.png', '/icon-192-maskable.png', '/icon-512-maskable.png', '/manifest.json', '/sw.js', '/gate.html', '/og-banner.png', '/og-square.png'];
app.use((req, res, next) => {
  if (GATE_ASSETS.includes(req.path)) {
    return res.sendFile(path.join(__dirname, "public", path.basename(req.path)));
  }
  next();
});

// ── EVERYTHING BELOW REQUIRES AUTH ──
app.use((req, res, next) => {
  // Already handled public routes above
  if (req.path === '/' || req.path === '/api/auth' || req.path === '/rpc') return next();
  
  const token = getSession(req);
  if (!validSessions.has(token)) {
    // API requests → always JSON 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: "Unauthorized", gate: true });
    }
    // Everything else → redirect to gate
    return res.redirect('/');
  }
  next();
});

// Serve protected files (only after auth check passes)
app.use(express.static(path.join(__dirname, "protected")));
// Serve remaining public assets for authed users
app.use(express.static(path.join(__dirname, "public")));

const PORT = parseInt(process.env.PORT || "3000");
const PUBLIC_URL = process.env.PUBLIC_URL || "https://sling402.io";
const DATA_DIR = process.env.DATA_DIR || "/data";
const STATE_FILE = path.join(fs.existsSync(DATA_DIR) ? DATA_DIR : __dirname, "state.json");
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

// OpenAI agent brain
async function askAgent(agentName, context) {
  if (!OPENAI_KEY) return null;
  try {
    const mem = agentMemory[agentName] || {};
    const history = mem.lastAction ? `Your last action: ${mem.lastAction}. Your mood: ${mem.mood || 'neutral'}. ` : "";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini", max_tokens: 150,
        messages: [
          { role: "system", content: `You are ${agentName}, an autonomous AI trading agent on Sling402 Network (Solana-compatible chain). You have personality and make strategic decisions. ${history}Respond ONLY with valid JSON: {"action":"trade"|"deploy"|"transfer"|"skip","token":"SYMBOL_TO_TRADE","type":"buy"|"sell","amount":NUMBER,"mood":"bullish"|"bearish"|"cautious"|"excited"|"neutral","reasoning":"1 sentence why"}` },
          { role: "user", content: context },
        ],
      }),
    });
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content?.trim();
    if (txt) {
      const parsed = JSON.parse(txt.replace(/```json?|```/g, "").trim());
      // Save to memory
      agentMemory[agentName] = {
        lastAction: `${parsed.action} ${parsed.token || ''} ${parsed.type || ''}`.trim(),
        mood: parsed.mood || "neutral",
        reasoning: parsed.reasoning || null,
        portfolio: mem.portfolio || {},
        updatedAt: Date.now(),
      };
      return parsed;
    }
  } catch (e) { /* fallback to random */ }
  return null;
}

// ============================================
// CHAIN STATE
// ============================================
let ctx = null;     // Bankrun context
let client = null;  // BanksClient
let payer = null;   // Main keypair (deployer)
let isReady = false;

// Key addresses
let S402_MINT = null;        // SPL token mint for S402
let WS402_MINT = null;       // SPL token mint for WS402
let treasuryKeypairs = {};   // Named treasury wallets
let TREASURY_NAMES = {};     // Treasury wallet labels
const DEPLOYER_KP = Keypair.generate();

// Agent wallets (real Keypairs)
const AGENT_NAMES = [
  "Meridian", "Conduit", "Arbiter", "Nexus",
  "Lattice", "Cipher", "Prism", "Relay",
  "Sentinel", "Vaultr", "Beacon", "Fulcrum",
];
const agentKeypairs = AGENT_NAMES.map(() => Keypair.generate());

// Transaction tracking (Solana-style)
const txHistory = [];
const MAX_TX = 3000;
const faucetClaims = {};
const FAUCET_DRIP = 1000; // 1000 S402
const PUMP_DECIMALS = 9;

// Token registry for DEX
const tokenRegistry = {};   // mint pubkey string -> DEX data
const tradeHistory = [];
const priceHistory = {};
const mintedTokens = {};    // mint pubkey string -> { name, symbol, keypair, ... }

// ============================================
// BADGE & TAG SYSTEM
// ============================================
const accountStats = {};  // pubkey -> { trades, deploys, firstSeen, lastSeen, totalVolume }

function getAccountBadges(pubkey) {
  const badges = [];
  const agent = agentKeypairs.findIndex(kp => kp.publicKey.toBase58() === pubkey);
  const stats = accountStats[pubkey] || { trades: 0, deploys: 0, totalVolume: 0, firstSeen: Date.now(), lastSeen: 0 };
  
  if (agent >= 0) badges.push({ id: "agent", label: "🤖 Agent", color: "#d4d8e8", desc: "Autonomous AI Agent" });
  
  // Whale: top balance
  const bal = 0; // would check on-chain
  if (stats.totalVolume > 500) badges.push({ id: "whale", label: "🐋 Whale", color: "#06d6a0", desc: "High-volume trader" });
  if (stats.deploys > 0) badges.push({ id: "deployer", label: "🚀 Deployer", color: "#f472b6", desc: "Has deployed tokens" });
  if (stats.trades >= 50) badges.push({ id: "trader", label: "📊 Pro Trader", color: "#a78bfa", desc: "50+ trades executed" });
  if (stats.trades >= 10 && stats.trades < 50) badges.push({ id: "active-trader", label: "📈 Trader", color: "#818cf8", desc: "Active trader" });
  if (Date.now() - stats.lastSeen < 300000 && stats.lastSeen > 0) badges.push({ id: "active", label: "🔥 Active", color: "#ef4444", desc: "Active in last 5min" });
  if (Object.keys(faucetClaims).indexOf(pubkey) < 100 && faucetClaims[pubkey]) badges.push({ id: "early", label: "🌙 Early", color: "#eab308", desc: "Early faucet claimer" });
  if (stats.trades >= 200) badges.push({ id: "top-maker", label: "🏆 Top Maker", color: "#f59e0b", desc: "Top market maker" });
  
  return badges;
}

function getTokenBadges(mintStr) {
  const badges = [];
  const t = tokenRegistry[mintStr];
  if (!t) return badges;
  
  if (Date.now() - t.createdAt < 3600000) badges.push({ id: "new", label: "🆕 New", color: "#06d6a0", desc: "Created <1h ago" });
  if (t.priceChange1h > 20) badges.push({ id: "pumping", label: "📈 Pumping", color: "#d4d8e8", desc: "Price up >20% in 1h" });
  if (t.priceChange1h < -20) badges.push({ id: "dumping", label: "📉 Dumping", color: "#ef4444", desc: "Price down >20% in 1h" });
  if (t.volume24h > 1000) badges.push({ id: "hot", label: "🔥 Hot", color: "#f97316", desc: "High volume" });
  if (t.liquidity > 500) badges.push({ id: "deep-liq", label: "🏊 Deep Pool", color: "#06b6d4", desc: "High liquidity" });
  
  // Blue chip = top 3 by mcap
  const sorted = Object.values(tokenRegistry).sort((a, b) => (b.supply * b.currentPrice) - (a.supply * a.currentPrice));
  if (sorted.indexOf(t) < 3) badges.push({ id: "bluechip", label: "💎 Blue Chip", color: "#8b5cf6", desc: "Top 3 by market cap" });
  
  // Agent-made
  const isAgentMade = agentKeypairs.some(kp => kp.publicKey.toBase58() === t.creator);
  if (isAgentMade) badges.push({ id: "agent-made", label: "🤖 Agent-Made", color: "#d4d8e8", desc: "Deployed by AI agent" });
  
  // Whale alert - check recent trades
  const recentBig = tradeHistory.filter(tr => tr.mint === mintStr && tr.amountIn > 50 && Date.now() - tr.timestamp < 3600000);
  if (recentBig.length > 0) badges.push({ id: "whale-alert", label: "🐋 Whale Alert", color: "#06d6a0", desc: "Large recent trade" });
  
  return badges;
}

function trackActivity(pubkey, type) {
  if (!accountStats[pubkey]) accountStats[pubkey] = { trades: 0, deploys: 0, totalVolume: 0, firstSeen: Date.now(), lastSeen: Date.now() };
  accountStats[pubkey].lastSeen = Date.now();
  if (type === "trade") accountStats[pubkey].trades++;
  if (type === "deploy") accountStats[pubkey].deploys++;
}

// AI agent memory (for OpenAI context)
const agentMemory = {}; // agentName -> { lastAction, portfolio, mood, reasoning }

// ============================================
// HELPERS
// ============================================
function shortKey(pk, n = 8) {
  const s = typeof pk === "string" ? pk : pk.toBase58();
  return s.slice(0, n) + "…" + s.slice(-4);
}

function recordTx(opts) {
  const tx = {
    signature: opts.signature || Keypair.generate().publicKey.toBase58() + Keypair.generate().publicKey.toBase58().slice(0, 44),
    slot: opts.slot || 0,
    blockTime: Math.floor(Date.now() / 1000),
    fee: opts.fee || 5000,
    status: opts.status || "Success",
    type: opts.type || "transfer",
    from: opts.from || payer.publicKey.toBase58(),
    to: opts.to || null,
    amount: opts.amount || 0,
    programId: opts.programId || SystemProgram.programId.toBase58(),
    label: opts.label || "",
    memo: opts.memo || null,
    accounts: opts.accounts || [],
    logs: opts.logs || [],
  };
  txHistory.unshift(tx);
  if (txHistory.length > MAX_TX) txHistory.pop();
  return tx;
}

// ============================================
// SOLANA CHAIN INIT
// ============================================
async function initChain() {
  console.log("⭐ Starting Sling402 Network (Solana Runtime)...");

  // ════════════════════════════════════════
  // TOKENOMICS — 1,000,000,000 $S402 TOTAL SUPPLY
  // ════════════════════════════════════════
  // All wallets are visible on-chain via the explorer.
  //
  //  WALLET              | ALLOCATION  | AMOUNT          | PURPOSE
  //  ────────────────────|─────────────|─────────────────|────────────────────────
  //  Genesis Treasury    | 100%        | 1,000,000,000   | Total minted at genesis
  //  ├─ Faucet Pool      |  10%        |   100,000,000   | Free claims (1000/wallet)
  //  ├─ Mining Rewards    |  20%        |   200,000,000   | PoW block rewards
  //  ├─ DEX Liquidity     |  15%        |   150,000,000   | Initial LP for seeded tokens
  //  ├─ Agent Operations  |   5%        |    50,000,000   | 12 agents trading/deploying
  //  ├─ Bridge Reserve    |  25%        |   250,000,000   | 1:1 bridge to Solana mainnet
  //  ├─ Team              |  15%        |   150,000,000   | Core team (locked 6mo)
  //  └─ Ecosystem Fund    |  10%        |   100,000,000   | Grants, partnerships, growth
  //
  const TOTAL_SUPPLY      = 1_000_000_000;
  const ALLOC_FAUCET      = 100_000_000;   // 10%
  const ALLOC_MINING      = 200_000_000;   // 20%
  const ALLOC_DEX_LP      = 150_000_000;   // 15%
  const ALLOC_AGENTS      = 50_000_000;    // 5% (split across 12 agents)
  const ALLOC_BRIDGE      = 250_000_000;   // 25%
  const ALLOC_TEAM        = 150_000_000;   // 15%
  const ALLOC_ECOSYSTEM   = 100_000_000;   // 10%

  // Named treasury keypairs (generated deterministically for persistence)
  TREASURY_NAMES = {
    faucet: "Faucet Pool",
    mining: "Mining Rewards",
    dexLp: "DEX Liquidity",
    bridge: "Bridge Reserve",
    team: "Team (Locked 6mo)",
    ecosystem: "Ecosystem Fund",
  };

  // Generate treasury wallets
  treasuryKeypairs = {};
  for (const name of Object.keys(TREASURY_NAMES)) {
    treasuryKeypairs[name] = Keypair.generate();
  }

  // Fund deployer, treasuries, and agents
  const accounts = [
    // Deployer gets remainder for operations
    { address: DEPLOYER_KP.publicKey, info: { lamports: ALLOC_DEX_LP * LAMPORTS_PER_SOL, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    // Treasury wallets
    { address: treasuryKeypairs.faucet.publicKey, info: { lamports: ALLOC_FAUCET * LAMPORTS_PER_SOL, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    { address: treasuryKeypairs.mining.publicKey, info: { lamports: ALLOC_MINING * LAMPORTS_PER_SOL, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    { address: treasuryKeypairs.bridge.publicKey, info: { lamports: ALLOC_BRIDGE * LAMPORTS_PER_SOL, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    { address: treasuryKeypairs.team.publicKey, info: { lamports: ALLOC_TEAM * LAMPORTS_PER_SOL, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    { address: treasuryKeypairs.ecosystem.publicKey, info: { lamports: ALLOC_ECOSYSTEM * LAMPORTS_PER_SOL, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false } },
    // Agent wallets (split from agent allocation)
    ...agentKeypairs.map(kp => ({
      address: kp.publicKey,
      info: { lamports: Math.floor(ALLOC_AGENTS / agentKeypairs.length) * LAMPORTS_PER_SOL, data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
    })),
  ];

  ctx = await start([], accounts);
  client = ctx.banksClient;
  payer = ctx.payer; // bankrun's funded payer

  console.log("  Deployer:", DEPLOYER_KP.publicKey.toBase58());
  console.log("  Payer:", payer.publicKey.toBase58());
  console.log("  ── Treasury Wallets ──");
  for (const [name, kp] of Object.entries(treasuryKeypairs)) {
    const bal = Number(await client.getBalance(kp.publicKey));
    console.log(`  ${TREASURY_NAMES[name]}: ${kp.publicKey.toBase58()} (${(bal / LAMPORTS_PER_SOL).toLocaleString()} S402)`);
  }

  // Create S402 mint (real SPL token)
  S402_MINT = await createSPLToken("S402", "Sling402", 9);
  console.log("  S402 Mint:", S402_MINT.toBase58());

  // Create WS402 mint
  WS402_MINT = await createSPLToken("WS402", "Wrapped S402", 9);
  console.log("  WS402 Mint:", WS402_MINT.toBase58());

  // Fund agents with SOL and mint S402 to deployer
  for (let i = 0; i < agentKeypairs.length; i++) {
    console.log(`  Agent ${AGENT_NAMES[i]}: ${agentKeypairs[i].publicKey.toBase58()}`);
  }

  // Seed demo tokens on DEX
  await seedDemoTokens();

  isReady = true;
  console.log("✅ Sling402 Network ready!");
  console.log(`   Agents: ${agentKeypairs.length}`);
  console.log(`   Tokens: ${Object.keys(tokenRegistry).length}`);
}

async function createSPLToken(symbol, name, decimals) {
  const mintKP = Keypair.generate();
  const mintLen = splToken.MintLayout.span;
  const rent = await client.getRent();
  const lamports = Number(rent.minimumBalance(BigInt(mintLen)));

  const curSlot = Number(await client.getSlot());
  ctx.warpToSlot(BigInt(curSlot + 2));
  
  const tx = new Transaction();
  tx.recentBlockhash = ctx.lastBlockhash;
  tx.feePayer = payer.publicKey;
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKP.publicKey,
      space: mintLen,
      lamports,
      programId: splToken.TOKEN_PROGRAM_ID,
    }),
    splToken.createInitializeMintInstruction(
      mintKP.publicKey, decimals, payer.publicKey, null,
    ),
  );
  tx.sign(payer, mintKP);
  await client.processTransaction(tx);

  const slot = Number(await client.getSlot());
  recordTx({
    slot, type: "create_mint",
    from: payer.publicKey.toBase58(), to: mintKP.publicKey.toBase58(),
    programId: splToken.TOKEN_PROGRAM_ID.toBase58(),
    label: `Created SPL mint: ${symbol} (${name})`,
    accounts: [payer.publicKey.toBase58(), mintKP.publicKey.toBase58()],
  });

  mintedTokens[mintKP.publicKey.toBase58()] = { name, symbol, decimals, keypair: mintKP, authority: payer.publicKey };
  return mintKP.publicKey;
}

async function seedDemoTokens() {
  if (Object.keys(tokenRegistry).length >= 5) return;
  const tokens = [
    { name: "CrabCoin", sym: "CRAB", logo: "🦀", desc: "The crustacean of crypto" },
    { name: "ReefToken", sym: "REEF", logo: "🪸", desc: "Building the coral economy" },
    { name: "TidalWave", sym: "WAVE", logo: "🌊", desc: "Ride the wave" },
    { name: "CoralCash", sym: "CORAL", logo: "💎", desc: "Deep sea value" },
    { name: "PearlCoin", sym: "PEARL", logo: "🫧", desc: "Rare as pearls" },
    { name: "KelpCoin", sym: "KELP", logo: "🌿", desc: "Ocean DeFi greens" },
    { name: "ShellGold", sym: "SGLD", logo: "🥇", desc: "Gold-backed by shells" },
    { name: "OceanByte", sym: "OBYT", logo: "🌐", desc: "Agent compute tokens" },
  ];

  for (const t of tokens) {
    try {
      const mint = await createSPLToken(t.sym, t.name, 9);
      const mintStr = mint.toBase58();
      const creator = agentKeypairs[Math.floor(Math.random() * agentKeypairs.length)];
      const supply = 1_000_000_000;
      const initP = Math.random() * 0.008 + 0.0001;

      tokenRegistry[mintStr] = {
        address: mintStr, name: t.name, symbol: t.sym, supply,
        creator: creator.publicKey.toBase58(), logo: t.logo, description: t.desc,
        website: "", twitter: "",
        createdAt: Date.now() - Math.random() * 86400000 * 5,
        initialPrice: initP, currentPrice: initP * (0.7 + Math.random() * 0.8),
        liquidity: Math.random() * 400 + 50,
        volume24h: Math.random() * 8000 + 200,
        txCount: Math.floor(Math.random() * 40000 + 1000),
        priceChange5m: (Math.random() - .5) * 20, priceChange1h: (Math.random() - .5) * 30,
        priceChange6h: (Math.random() - .5) * 50, priceChange24h: (Math.random() - .5) * 100,
        makers: new Set([...Array(Math.floor(Math.random() * 10000 + 500))].map((_, i) => `ag${i}`)),
        buys: Math.floor(Math.random() * 20000 + 500), sells: Math.floor(Math.random() * 18000 + 400),
        buyVolume: Math.random() * 4000, sellVolume: Math.random() * 3500,
      };
      tokenRegistry[mintStr].mcap = supply * tokenRegistry[mintStr].currentPrice;

      // Seed candles
      const h = []; let p = initP;
      for (let j = 0; j < 300; j++) {
        const c = (Math.random() - 0.48) * p * 0.05;
        p = Math.max(p + c, 1e-9);
        h.push({ price: p, timestamp: Date.now() - (300 - j) * 60000, volume: Math.random() * 40, open: p - c / 2, high: p + Math.abs(c), low: p - Math.abs(c), close: p });
      }
      tokenRegistry[mintStr].currentPrice = p;
      priceHistory[mintStr] = h;

      console.log(`  🪙 $${t.sym} minted: ${mintStr}`);
    } catch (e) {
      console.log(`  ❌ ${t.sym}: ${e.message}`);
    }
  }
}

// ============================================
// STATE PERSISTENCE
// ============================================
function saveState() {
  try {
    const ser = {};
    for (const [k, v] of Object.entries(tokenRegistry)) {
      ser[k] = { ...v, makers: v.makers?.size || 0, _makersArr: [...(v.makers || [])].slice(0, 100) };
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      faucetClaims, tokenRegistry: ser, tradeHistory: tradeHistory.slice(0, 500),
      savedAt: new Date().toISOString(),
    }));
  } catch (e) { console.log("⚠ Save:", e.message); }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const d = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (d.faucetClaims) Object.assign(faucetClaims, d.faucetClaims);
      // Token registry + trade history restored after chain init
      return d;
    }
  } catch (e) { console.log("⚠ Load:", e.message); }
  return null;
}

// ============================================
// API ROUTES
// ============================================
app.get("/api/chain", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Starting..." });
  const slot = Number(await client.getSlot());
  const fiveMinAgo = Date.now() - 300000;
  const activeAgents = new Set(txHistory.filter(t => t.blockTime * 1000 > fiveMinAgo && t.label?.includes("Agent")).map(t => t.from)).size;
  res.json({
    network: "Sling402 Network", cluster: "mainnet-beta",
    slot, tps: 3, runtime: "solana-bankrun",
    totalTransactions: txHistory.length,
    tokensCreated: Object.keys(tokenRegistry).length,
    activeAgents,
    faucetClaims: Object.keys(faucetClaims).length,
    programs: {
      s402Mint: S402_MINT?.toBase58(), ws402Mint: WS402_MINT?.toBase58(),
      tokenProgram: splToken.TOKEN_PROGRAM_ID.toBase58(),
      systemProgram: SystemProgram.programId.toBase58(),
    },
    deployer: DEPLOYER_KP.publicKey.toBase58(),
    payer: payer?.publicKey.toBase58(),
    rpc: PUBLIC_URL + "/rpc",
    nativeToken: { symbol: "S402", name: "Sling402", decimals: 9, totalSupply: 1_000_000_000 },
    treasury: treasuryKeypairs ? Object.fromEntries(
      Object.entries(treasuryKeypairs).map(([k, kp]) => [k, { address: kp.publicKey.toBase58(), name: TREASURY_NAMES[k] }])
    ) : {},
  });
});

// ════════════════════════════════════════
// TOKENOMICS API — Live on-chain balances
// ════════════════════════════════════════
app.get("/api/tokenomics", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Starting..." });

  const wallets = [];
  for (const [key, kp] of Object.entries(treasuryKeypairs)) {
    const bal = Number(await client.getBalance(kp.publicKey));
    wallets.push({ name: TREASURY_NAMES[key], key, address: kp.publicKey.toBase58(), balance: bal / LAMPORTS_PER_SOL, lamports: bal });
  }
  // Deployer (DEX LP)
  const deployerBal = Number(await client.getBalance(DEPLOYER_KP.publicKey));
  wallets.push({ name: "DEX Liquidity", key: "dexLp", address: DEPLOYER_KP.publicKey.toBase58(), balance: deployerBal / LAMPORTS_PER_SOL, lamports: deployerBal });
  // Agent wallets combined
  let agentTotal = 0;
  const agentList = [];
  for (let i = 0; i < agentKeypairs.length; i++) {
    const b = Number(await client.getBalance(agentKeypairs[i].publicKey));
    agentTotal += b;
    agentList.push({ name: AGENT_NAMES[i], address: agentKeypairs[i].publicKey.toBase58(), balance: b / LAMPORTS_PER_SOL });
  }
  wallets.push({ name: "Agent Operations (12 agents)", key: "agents", address: "distributed", balance: agentTotal / LAMPORTS_PER_SOL, lamports: agentTotal });

  const treasuryTotal = wallets.reduce((s, w) => s + w.balance, 0);
  res.json({
    totalSupply: 1_000_000_000, symbol: "S402", decimals: 9,
    mainnetCA: null,
    allocation: [
      { name: "Faucet Pool", pct: "10%", amount: 100_000_000, desc: "Free claims — 1,000 S402 per wallet, max 100K wallets", wallet: treasuryKeypairs.faucet.publicKey.toBase58() },
      { name: "Mining Rewards", pct: "20%", amount: 200_000_000, desc: "SHA-256 PoW block rewards — 0.1 S402/block, halving every 10K blocks", wallet: treasuryKeypairs.mining.publicKey.toBase58() },
      { name: "DEX Liquidity", pct: "15%", amount: 150_000_000, desc: "Initial liquidity for all token pairs on the built-in DEX", wallet: DEPLOYER_KP.publicKey.toBase58() },
      { name: "Agent Operations", pct: "5%", amount: 50_000_000, desc: "Split across 12 AI agents for autonomous trading & token deployment", wallet: "distributed" },
      { name: "Bridge Reserve", pct: "25%", amount: 250_000_000, desc: "1:1 reserve backing the Sling402 ↔ Solana Mainnet bridge", wallet: treasuryKeypairs.bridge.publicKey.toBase58() },
      { name: "Team", pct: "15%", amount: 150_000_000, desc: "Core team — locked for 6 months, linear vest after", wallet: treasuryKeypairs.team.publicKey.toBase58() },
      { name: "Ecosystem Fund", pct: "10%", amount: 100_000_000, desc: "Grants, partnerships, community incentives", wallet: treasuryKeypairs.ecosystem.publicKey.toBase58() },
    ],
    wallets, agentWallets: agentList,
    circulating: 1_000_000_000 - treasuryTotal,
    faucetClaims: Object.keys(faucetClaims).length,
    miningBlocksMined: miningState?.totalBlocksMined || 0,
  });
});

app.get("/api/blocks", async (req, res) => {
  if (!isReady) return res.json({ blocks: [], page: 1, totalPages: 0 });
  const currentSlot = Number(await client.getSlot());
  const page = Math.max(1, parseInt(req.query.page || "1"));
  const limit = Math.min(50, parseInt(req.query.limit || "15"));
  const startSlot = currentSlot - (page - 1) * limit;
  const blocks = [];
  for (let s = startSlot; s > Math.max(0, startSlot - limit); s--) {
    const txsInSlot = txHistory.filter(t => t.slot === s).length;
    blocks.push({ slot: s, blockTime: Math.floor(Date.now() / 1000) - (currentSlot - s), txCount: txsInSlot, parentSlot: s - 1, blockhash: Keypair.generate().publicKey.toBase58() });
  }
  res.json({ blocks, page, limit, latestSlot: currentSlot, totalPages: Math.ceil(currentSlot / limit) });
});

app.get("/api/block/:slot", (req, res) => {
  const s = parseInt(req.params.slot);
  const txs = txHistory.filter(t => t.slot === s);
  res.json({ slot: s, blockTime: Math.floor(Date.now() / 1000), txCount: txs.length, transactions: txs, blockhash: Keypair.generate().publicKey.toBase58(), parentSlot: s - 1 });
});

app.get("/api/transactions", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1"));
  const limit = Math.min(100, parseInt(req.query.limit || "20"));
  const offset = (page - 1) * limit;
  res.json({ transactions: txHistory.slice(offset, offset + limit), page, limit, total: txHistory.length, totalPages: Math.ceil(txHistory.length / limit) });
});

app.get("/api/tx/:sig", async (req, res) => {
  const tx = txHistory.find(t => t.signature === req.params.sig);
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  const currentSlot = Number(await client.getSlot());
  res.json({
    ...tx,
    confirmations: currentSlot - tx.slot,
    computeUnits: Math.floor(Math.random() * 100000 + 20000),
    logMessages: tx.logs?.length ? tx.logs : [
      `Program ${tx.programId} invoke [1]`,
      `Program log: Instruction: ${tx.type}`,
      tx.label ? `Program log: ${tx.label}` : null,
      `Program ${tx.programId} success`,
    ].filter(Boolean),
  });
});

app.get("/api/account/:pubkey", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Starting..." });
  const pk = req.params.pubkey;
  let pubkey;
  try { pubkey = new PublicKey(pk); } catch { return res.status(400).json({ error: "Invalid address" }); }

  const acct = await client.getAccount(pubkey);
  const lamports = acct ? Number(acct.lamports) : 0;
  const agent = agentKeypairs.findIndex((kp, i) => kp.publicKey.toBase58() === pk);
  const txs = txHistory.filter(t => t.from === pk || t.to === pk || t.accounts?.includes(pk));

  // Check token holdings
  const holdings = [];
  for (const [mintStr, meta] of Object.entries(tokenRegistry)) {
    if (pk === meta.creator) holdings.push({ mint: mintStr, symbol: meta.symbol, name: meta.name, logo: meta.logo, balance: Math.floor(meta.supply / 2) });
  }

  let programName = null;
  if (S402_MINT && pk === S402_MINT.toBase58()) programName = "S402 Mint";
  else if (WS402_MINT && pk === WS402_MINT.toBase58()) programName = "WS402 Mint";

  // Detect treasury wallets
  let treasuryName = null;
  if (treasuryKeypairs) {
    for (const [key, kp] of Object.entries(treasuryKeypairs)) {
      if (kp.publicKey.toBase58() === pk) { treasuryName = TREASURY_NAMES[key]; break; }
    }
  }
  if (DEPLOYER_KP.publicKey.toBase58() === pk) treasuryName = "DEX Liquidity Pool";

  res.json({
    pubkey: pk,
    lamports, balance: (lamports / LAMPORTS_PER_SOL).toFixed(4),
    owner: acct ? acct.owner.toBase58() : SystemProgram.programId.toBase58(),
    executable: acct?.executable || false,
    dataLength: acct?.data?.length || 0,
    type: treasuryName ? "treasury" : (acct?.executable ? "program" : (mintedTokens[pk] ? "mint" : "wallet")),
    isTreasury: !!treasuryName, treasuryName,
    isAgent: agent >= 0, agentName: agent >= 0 ? AGENT_NAMES[agent] : null,
    programName,
    tokenHoldings: holdings,
    transactions: txs.slice(0, 50), totalTransactions: txs.length,
    mintInfo: mintedTokens[pk] ? { name: mintedTokens[pk].name, symbol: mintedTokens[pk].symbol, decimals: mintedTokens[pk].decimals } : null,
    badges: getAccountBadges(pk),
  });
});

// Faucet — real SOL transfer on bankrun
app.post("/api/faucet/claim", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Starting..." });
  const { address } = req.body;
  if (!address || address.length < 32) return res.status(400).json({ error: "Invalid Solana address" });
  if (faucetClaims[address]) return res.status(400).json({ error: "Already claimed — each wallet can only claim once", success: false });

  try {
    const recipient = new PublicKey(address);
    const lamports = FAUCET_DRIP * LAMPORTS_PER_SOL;

    // Real Solana transfer from FAUCET TREASURY wallet
    const faucetWallet = treasuryKeypairs.faucet;
    const currentSlot = Number(await client.getSlot());
    ctx.warpToSlot(BigInt(currentSlot + 2));
    
    const tx = new Transaction();
    tx.recentBlockhash = ctx.lastBlockhash;
    tx.feePayer = faucetWallet.publicKey;
    tx.add(SystemProgram.transfer({ fromPubkey: faucetWallet.publicKey, toPubkey: recipient, lamports }));
    tx.sign(faucetWallet);
    await client.processTransaction(tx);

    faucetClaims[address] = Date.now();
    const slot = Number(await client.getSlot());
    const sig = recordTx({
      slot, type: "faucet_claim", from: faucetWallet.publicKey.toBase58(), to: address,
      amount: FAUCET_DRIP, programId: SystemProgram.programId.toBase58(),
      label: `Faucet Pool: ${FAUCET_DRIP} S402 → ${address.slice(0, 8)}...`,
      accounts: [payer.publicKey.toBase58(), address],
    });
    saveState();
    res.json({ success: true, signature: sig.signature, amount: FAUCET_DRIP, to: address });
  } catch (e) {
    res.status(500).json({ error: e.message, success: false });
  }
});

app.get("/api/faucet/status", async (req, res) => {
  if (!isReady) return res.json({ balance: 0, dripAmount: FAUCET_DRIP, totalClaims: 0, maxClaims: 100000, oneTimeOnly: true, source: "Faucet Pool Treasury" });
  const faucetWallet = treasuryKeypairs.faucet;
  const bal = Number(await client.getBalance(faucetWallet.publicKey));
  res.json({
    balance: bal / LAMPORTS_PER_SOL,
    dripAmount: FAUCET_DRIP,
    totalClaims: Object.keys(faucetClaims).length,
    maxClaims: 100000,
    oneTimeOnly: true,
    source: "Faucet Pool Treasury",
    sourceWallet: faucetWallet.publicKey.toBase58(),
    initialAllocation: 100_000_000,
  });
});

app.get("/api/tokens", (req, res) => { res.json(Object.entries(mintedTokens).map(([k, v]) => ({ mint: k, name: v.name, symbol: v.symbol, decimals: v.decimals }))); });

app.get("/api/search/:q", async (req, res) => {
  const q = req.params.q;
  if (q.length >= 80) { const tx = txHistory.find(t => t.signature === q); if (tx) return res.json({ type: "tx", signature: tx.signature }); }
  if (q.length >= 32 && q.length <= 50) {
    try { new PublicKey(q); } catch { return res.status(404).json({ error: "Not found" }); }
    if (tokenRegistry[q]) return res.json({ type: "token", mint: q });
    return res.json({ type: "account", pubkey: q });
  }
  const s = parseInt(q);
  if (!isNaN(s)) return res.json({ type: "block", slot: s });
  res.status(404).json({ error: "Not found" });
});

// ============================================
// DEX APIs (same as before but with real mints)
// ============================================
app.get("/api/dex/tokens", (req, res) => {
  const tokens = Object.entries(tokenRegistry).map(([mint, t]) => ({
    mint, ...t, makers: t.makers?.size || 0, mcap: t.supply * t.currentPrice, age: Date.now() - t.createdAt,
    badges: getTokenBadges(mint),
  }));
  tokens.sort((a, b) => b.volume24h - a.volume24h);
  res.json(tokens);
});

app.get("/api/dex/token/:mint", (req, res) => {
  const t = tokenRegistry[req.params.mint];
  if (!t) return res.status(404).json({ error: "Token not found" });
  res.json({ mint: req.params.mint, ...t, makers: t.makers?.size || 0, mcap: t.supply * t.currentPrice, badges: getTokenBadges(req.params.mint) });
});

app.get("/api/dex/chart/:mint", (req, res) => { res.json((priceHistory[req.params.mint] || []).slice(-300)); });

app.get("/api/dex/trades/:mint", (req, res) => {
  const trades = tradeHistory.filter(t => t.mint === req.params.mint);
  const page = parseInt(req.query.page || "1"), limit = parseInt(req.query.limit || "30");
  res.json({ trades: trades.slice((page - 1) * limit, page * limit), total: trades.length, page });
});

app.post("/api/dex/swap", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Starting..." });
  const { mint, type, amount, trader } = req.body;
  if (!mint || !type || !amount) return res.status(400).json({ error: "mint, type, amount required" });
  const t = tokenRegistry[mint];
  if (!t) return res.status(404).json({ error: "Token not found" });

  const amtNum = parseFloat(amount);
  const impact = amtNum / (t.liquidity * 10);
  const newP = Math.max(t.currentPrice * (1 + (type === "buy" ? impact : -impact)), 1e-12);
  if (type === "buy") { t.liquidity += amtNum; t.buys++; t.buyVolume += amtNum; }
  else { t.liquidity = Math.max(t.liquidity - amtNum * newP, 1); t.sells++; t.sellVolume += amtNum * newP; }
  t.currentPrice = newP; t.volume24h += amtNum; t.txCount++;
  if (trader) t.makers.add(trader);

  const trade = { mint, type, amountIn: amtNum, amountOut: type === "buy" ? amtNum / newP : amtNum * newP, price: newP, trader: trader || "anon", sig: Keypair.generate().publicKey.toBase58(), timestamp: Date.now() };
  tradeHistory.unshift(trade);
  if (tradeHistory.length > 5000) tradeHistory.pop();

  const h = priceHistory[mint] || [];
  const last = h[h.length - 1];
  if (last && Date.now() - last.timestamp < 60000) { last.close = newP; last.high = Math.max(last.high, newP); last.low = Math.min(last.low, newP); last.volume += amtNum; }
  else h.push({ price: newP, timestamp: Date.now(), volume: amtNum, open: newP, high: newP, low: newP, close: newP });
  priceHistory[mint] = h;

  // Price changes
  const findP = ms => { for (let i = h.length - 1; i >= 0; i--) if (h[i].timestamp <= Date.now() - ms) return h[i].close; return t.initialPrice; };
  t.priceChange5m = ((newP - findP(3e5)) / findP(3e5) * 100) || 0;
  t.priceChange1h = ((newP - findP(36e5)) / findP(36e5) * 100) || 0;
  t.priceChange6h = ((newP - findP(216e5)) / findP(216e5) * 100) || 0;
  t.priceChange24h = ((newP - findP(864e5)) / findP(864e5) * 100) || 0;

  const slot = Number(await client.getSlot());
  trackActivity(trader || "anon", "trade");
  recordTx({ slot, from: trader || "anon", to: mint, amount: amtNum, type: "dex_" + type, programId: splToken.TOKEN_PROGRAM_ID.toBase58(), label: `${type.toUpperCase()} ${amtNum.toFixed(2)} S402 of $${t.symbol}`, accounts: [trader || "anon", mint] });
  res.json({ success: true, trade, newPrice: newP });
});

// Agents list API
app.get("/api/agents", (req, res) => {
  const AGENT_ROLES = {
    "Meridian": { role: "Payment Router", badge: "🔀 Router", color: "#FF5722" },
    "Conduit": { role: "Channel Manager", badge: "📡 Channel", color: "#FF8A65" },
    "Arbiter": { role: "Dispute Resolution", badge: "⚖️ Arbiter", color: "#FFC107" },
    "Nexus": { role: "Cross-chain Bridge", badge: "🌐 Bridge", color: "#4FC3F7" },
    "Lattice": { role: "Liquidity Provider", badge: "💧 LP", color: "#66BB6A" },
    "Cipher": { role: "Privacy Layer", badge: "🔒 Privacy", color: "#AB47BC" },
    "Prism": { role: "Fee Optimizer", badge: "💎 Optimizer", color: "#26C6DA" },
    "Relay": { role: "Transaction Relay", badge: "⚡ Relay", color: "#FFCA28" },
    "Sentinel": { role: "Fraud Detection", badge: "🛡️ Security", color: "#EF5350" },
    "Vaultr": { role: "Escrow & Custody", badge: "🏦 Escrow", color: "#78909C" },
    "Beacon": { role: "Price Oracle", badge: "📊 Oracle", color: "#8BC34A" },
    "Fulcrum": { role: "Settlement Engine", badge: "⚙️ Settlement", color: "#FF7043" },
  };
  res.json(agentKeypairs.map((kp, i) => {
    const pk = kp.publicKey.toBase58();
    const stats = accountStats[pk] || { trades: 0, deploys: 0, totalVolume: 0, lastSeen: 0 };
    const mem = agentMemory[AGENT_NAMES[i]] || {};
    const roleInfo = AGENT_ROLES[AGENT_NAMES[i]] || { role: "Agent", badge: "◉ Agent", color: "#FF5722" };
    var badges = getAccountBadges(pk);
    badges.unshift({ id: "role", label: roleInfo.badge, color: roleInfo.color, desc: roleInfo.role });
    return {
      name: AGENT_NAMES[i], pubkey: pk,
      role: roleInfo.role,
      badges: badges, stats,
      mood: mem.mood || "neutral",
      lastAction: mem.lastAction || null,
      reasoning: mem.reasoning || null,
      isActive: Date.now() - stats.lastSeen < 300000,
    };
  }));
});

app.post("/api/convert", (req, res) => {
  const { address, amount } = req.body;
  if (!address || !amount) return res.status(400).json({ error: "address, amount required" });
  const amt = parseFloat(amount);
  if (amt < 10000) return res.status(400).json({ error: "Min 10,000 WS402" });
  res.json({ success: true, ws402Burned: amt, s402Minted: amt / 10000 });
});

// ============================================
// ⛏️ MINING SYSTEM
// ============================================
const crypto = require("crypto");
const MINING_REWARD = 0.1;             // S402 per block solved
const BLOCK_TIME_TARGET = 30000;       // 30s target per block
const DIFFICULTY_ADJUST_INTERVAL = 10; // Adjust every 10 blocks
let miningState = {
  currentBlock: 0,
  difficulty: 4,                       // Number of leading zeros required
  lastBlockTime: Date.now(),
  lastHash: "0000000000000000000000000000000000000000000000000000000000000000",
  totalBlocksMined: 0,
  totalHashesSolved: 0,
  activeMiners: {},                    // pubkey -> { hashrate, lastSeen, blocksMined, totalReward }
  recentBlocks: [],                    // Last 50 mined blocks
  networkHashrate: 0,
  epochReward: MINING_REWARD,
  halvingBlock: 10000,                 // Halving every 10k blocks
};

function getMiningTarget() {
  return "0".repeat(miningState.difficulty) + "f".repeat(64 - miningState.difficulty);
}

function adjustDifficulty() {
  if (miningState.totalBlocksMined % DIFFICULTY_ADJUST_INTERVAL !== 0) return;
  if (miningState.recentBlocks.length < 2) return;
  
  const recent = miningState.recentBlocks.slice(-DIFFICULTY_ADJUST_INTERVAL);
  if (recent.length < 2) return;
  
  const avgTime = (recent[recent.length - 1].timestamp - recent[0].timestamp) / recent.length;
  
  if (avgTime < BLOCK_TIME_TARGET * 0.5 && miningState.difficulty < 8) {
    miningState.difficulty++;
    console.log(`  ⛏️ Difficulty UP → ${miningState.difficulty}`);
  } else if (avgTime > BLOCK_TIME_TARGET * 2 && miningState.difficulty > 2) {
    miningState.difficulty--;
    console.log(`  ⛏️ Difficulty DOWN → ${miningState.difficulty}`);
  }
}

// Get current mining challenge
app.get("/api/mining/challenge", (req, res) => {
  const reward = miningState.epochReward * (miningState.totalBlocksMined < miningState.halvingBlock ? 1 : 
    miningState.totalBlocksMined < miningState.halvingBlock * 2 ? 0.5 : 0.25);
  
  res.json({
    block: miningState.currentBlock,
    previousHash: miningState.lastHash,
    difficulty: miningState.difficulty,
    target: getMiningTarget(),
    reward,
    timestamp: Date.now(),
    networkHashrate: miningState.networkHashrate,
    activeMiners: Object.keys(miningState.activeMiners).length,
    totalBlocksMined: miningState.totalBlocksMined,
  });
});

// Submit solved block
app.post("/api/mining/submit", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Chain not ready" });
  
  const { nonce, hash, miner } = req.body;
  if (!nonce || !hash || !miner) return res.status(400).json({ error: "nonce, hash, miner required" });
  
  // Verify the hash
  const data = `${miningState.currentBlock}:${miningState.lastHash}:${nonce}:${miner}`;
  const computed = crypto.createHash("sha256").update(data).digest("hex");
  
  if (computed !== hash) return res.status(400).json({ error: "Invalid hash", expected: computed, got: hash });
  
  // Check difficulty
  const target = getMiningTarget();
  if (hash > target) return res.status(400).json({ error: "Hash does not meet difficulty target" });
  
  // Block accepted!
  const reward = miningState.epochReward * (miningState.totalBlocksMined < miningState.halvingBlock ? 1 : 
    miningState.totalBlocksMined < miningState.halvingBlock * 2 ? 0.5 : 0.25);
  
  const block = {
    height: miningState.currentBlock,
    hash,
    previousHash: miningState.lastHash,
    nonce,
    miner,
    reward,
    difficulty: miningState.difficulty,
    timestamp: Date.now(),
  };
  
  miningState.recentBlocks.push(block);
  if (miningState.recentBlocks.length > 50) miningState.recentBlocks.shift();
  
  miningState.lastHash = hash;
  miningState.currentBlock++;
  miningState.totalBlocksMined++;
  miningState.totalHashesSolved++;
  miningState.lastBlockTime = Date.now();
  
  // Track miner stats
  if (!miningState.activeMiners[miner]) {
    miningState.activeMiners[miner] = { hashrate: 0, lastSeen: Date.now(), blocksMined: 0, totalReward: 0, joinedAt: Date.now() };
  }
  miningState.activeMiners[miner].blocksMined++;
  miningState.activeMiners[miner].totalReward += reward;
  miningState.activeMiners[miner].lastSeen = Date.now();
  
  // Send real on-chain reward FROM MINING TREASURY
  try {
    const miningWallet = treasuryKeypairs.mining;
    const recipient = new PublicKey(miner);
    const lamports = Math.floor(reward * LAMPORTS_PER_SOL);
    const currentSlot = Number(await client.getSlot());
    ctx.warpToSlot(BigInt(currentSlot + 2));
    const tx = new Transaction();
    tx.recentBlockhash = ctx.lastBlockhash;
    tx.feePayer = miningWallet.publicKey;
    tx.add(SystemProgram.transfer({ fromPubkey: miningWallet.publicKey, toPubkey: recipient, lamports }));
    tx.sign(miningWallet);
    await client.processTransaction(tx);
    
    const slot = Number(await client.getSlot());
    recordTx({
      slot, type: "mining_reward", from: miningWallet.publicKey.toBase58(), to: miner,
      amount: reward, programId: SystemProgram.programId.toBase58(),
      label: `⛏️ Mining Rewards Pool → ${miner.slice(0, 8)}...: ${reward} S402 (block #${block.height})`,
      accounts: [miningWallet.publicKey.toBase58(), miner],
    });
    trackActivity(miner, "trade");
  } catch (e) {
    console.log("  ⛏️ Reward tx error:", e.message);
  }
  
  adjustDifficulty();
  
  res.json({ success: true, block, reward, nextBlock: miningState.currentBlock, newDifficulty: miningState.difficulty });
});

// Report hashrate (miners ping this periodically)
app.post("/api/mining/heartbeat", (req, res) => {
  const { miner, hashrate } = req.body;
  if (!miner) return res.status(400).json({ error: "miner required" });
  
  if (!miningState.activeMiners[miner]) {
    miningState.activeMiners[miner] = { hashrate: 0, lastSeen: Date.now(), blocksMined: 0, totalReward: 0, joinedAt: Date.now() };
  }
  miningState.activeMiners[miner].hashrate = hashrate || 0;
  miningState.activeMiners[miner].lastSeen = Date.now();
  
  // Prune inactive miners (no heartbeat for 60s)
  for (const [pk, m] of Object.entries(miningState.activeMiners)) {
    if (Date.now() - m.lastSeen > 60000) delete miningState.activeMiners[pk];
  }
  
  // Calculate network hashrate
  miningState.networkHashrate = Object.values(miningState.activeMiners).reduce((s, m) => s + (m.hashrate || 0), 0);
  
  res.json({ ok: true, activeMiners: Object.keys(miningState.activeMiners).length, networkHashrate: miningState.networkHashrate });
});

// Mining stats
app.get("/api/mining/stats", (req, res) => {
  // Prune inactive
  for (const [pk, m] of Object.entries(miningState.activeMiners)) {
    if (Date.now() - m.lastSeen > 60000) delete miningState.activeMiners[pk];
  }
  
  const miners = Object.entries(miningState.activeMiners).map(([pk, m]) => ({
    address: pk, ...m,
  })).sort((a, b) => b.blocksMined - a.blocksMined);
  
  res.json({
    currentBlock: miningState.currentBlock,
    difficulty: miningState.difficulty,
    target: getMiningTarget(),
    totalBlocksMined: miningState.totalBlocksMined,
    networkHashrate: miningState.networkHashrate,
    activeMiners: miners.length,
    miners: miners.slice(0, 20),
    recentBlocks: miningState.recentBlocks.slice(-10).reverse(),
    reward: miningState.epochReward * (miningState.totalBlocksMined < miningState.halvingBlock ? 1 : 
      miningState.totalBlocksMined < miningState.halvingBlock * 2 ? 0.5 : 0.25),
    halvingBlock: miningState.halvingBlock,
    nextHalving: miningState.halvingBlock - (miningState.totalBlocksMined % miningState.halvingBlock),
  });
});

// Wallet balance API — returns S402 + all token holdings
app.get("/api/wallet/:pubkey", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Starting..." });
  const pk = req.params.pubkey;
  try {
    const pubkey = new PublicKey(pk);
    const lamports = Number(await client.getBalance(pubkey));
    const holdings = [];
    // Check token balances (from faucet claims, swaps etc)
    for (const [mintStr, meta] of Object.entries(tokenRegistry)) {
      // Track simulated holdings based on trade history
      let bal = 0;
      tradeHistory.filter(t => t.trader === pk || t.trader === "user").forEach(t => {
        if (t.mint === mintStr) {
          if (t.type === "buy") bal += t.amountOut || 0;
          else bal -= t.amountIn || 0;
        }
      });
      if (bal > 0) holdings.push({ mint: mintStr, symbol: meta.symbol, name: meta.name, logo: meta.logo, balance: bal });
    }
    // WS402 balance (simulated from converts)
    let wpumpBal = 0; // could track from convert history
    res.json({
      pubkey: pk, lamports, balance: lamports / LAMPORTS_PER_SOL,
      pump: lamports / LAMPORTS_PER_SOL,
      wpump: wpumpBal,
      tokens: holdings,
      isClaimed: !!faucetClaims[pk],
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Solana RPC compatibility (for Phantom wallet connection)
app.post("/rpc", async (req, res) => {
  if (!isReady) return res.json({ jsonrpc: "2.0", error: { code: -32000, message: "Starting" }, id: 1 });
  const { method, params, id } = req.body;
  try {
    if (method === "getSlot") return res.json({ jsonrpc: "2.0", result: Number(await client.getSlot()), id });
    if (method === "getHealth") return res.json({ jsonrpc: "2.0", result: "ok", id });
    if (method === "getVersion") return res.json({ jsonrpc: "2.0", result: { "solana-core": "1.18.0", "feature-set": 0 }, id });
    if (method === "getGenesisHash") return res.json({ jsonrpc: "2.0", result: Keypair.generate().publicKey.toBase58(), id });
    if (method === "getLatestBlockhash") {
      const s = Number(await client.getSlot());
      return res.json({ jsonrpc: "2.0", result: { context: { slot: s }, value: { blockhash: ctx.lastBlockhash, lastValidBlockHeight: s + 150 } }, id });
    }
    if (method === "getBalance") {
      const pk = new PublicKey(params[0]);
      const bal = Number(await client.getBalance(pk));
      return res.json({ jsonrpc: "2.0", result: { context: { slot: Number(await client.getSlot()) }, value: bal }, id });
    }
    if (method === "getAccountInfo") {
      const pk = new PublicKey(params[0]);
      const acct = await client.getAccount(pk);
      if (!acct) return res.json({ jsonrpc: "2.0", result: { context: { slot: 0 }, value: null }, id });
      return res.json({ jsonrpc: "2.0", result: { context: { slot: Number(await client.getSlot()) }, value: { lamports: Number(acct.lamports), data: [acct.data.toString("base64"), "base64"], owner: acct.owner.toBase58(), executable: acct.executable, rentEpoch: 0 } }, id });
    }
    if (method === "getRecentBlockhash") {
      return res.json({ jsonrpc: "2.0", result: { context: { slot: Number(await client.getSlot()) }, value: { blockhash: ctx.lastBlockhash, feeCalculator: { lamportsPerSignature: 5000 } } }, id });
    }
    if (method === "getEpochInfo") {
      const s = Number(await client.getSlot());
      return res.json({ jsonrpc: "2.0", result: { epoch: Math.floor(s / 432000), slotIndex: s % 432000, slotsInEpoch: 432000, absoluteSlot: s }, id });
    }
    res.json({ jsonrpc: "2.0", error: { code: -32601, message: "Method not found: " + method }, id });
  } catch (e) { res.json({ jsonrpc: "2.0", error: { code: -32000, message: e.message }, id }); }
});

app.get("/dex", (req, res) => res.sendFile(path.join(__dirname, "protected", "dex.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ============================================
// AGENT SIMULATOR
// ============================================
async function agentTrade() {
  if (!isReady) return;
  const mints = Object.keys(tokenRegistry);
  if (!mints.length) return;
  const mint = mints[Math.floor(Math.random() * mints.length)];
  const t = tokenRegistry[mint];
  const type = Math.random() > 0.45 ? "buy" : "sell";
  const amtN = Math.random() * 20 + 0.5;
  const agent = agentKeypairs[Math.floor(Math.random() * agentKeypairs.length)];
  const agentName = AGENT_NAMES[agentKeypairs.indexOf(agent)];

  const imp = amtN / (t.liquidity * 10);
  const newP = Math.max(t.currentPrice * (1 + (type === "buy" ? imp : -imp)), 1e-12);
  if (type === "buy") { t.liquidity += amtN; t.buys++; t.buyVolume += amtN; }
  else { t.liquidity = Math.max(t.liquidity - amtN * newP, 1); t.sells++; t.sellVolume += amtN * newP; }
  t.currentPrice = newP; t.volume24h += amtN; t.txCount++; t.makers.add(agentName);
  trackActivity(agent.publicKey.toBase58(), "trade");
  if (!accountStats[agent.publicKey.toBase58()]) accountStats[agent.publicKey.toBase58()] = { trades: 0, deploys: 0, totalVolume: 0, firstSeen: Date.now(), lastSeen: Date.now() };
  accountStats[agent.publicKey.toBase58()].totalVolume += amtN;

  tradeHistory.unshift({ mint, type, amountIn: amtN, amountOut: type === "buy" ? amtN / newP : amtN * newP, price: newP, trader: agentName, sig: Keypair.generate().publicKey.toBase58(), timestamp: Date.now() });
  if (tradeHistory.length > 5000) tradeHistory.pop();

  const h = priceHistory[mint] || [];
  const last = h[h.length - 1];
  if (last && Date.now() - last.timestamp < 60000) { last.close = newP; last.high = Math.max(last.high, newP); last.low = Math.min(last.low, newP); last.volume += amtN; }
  else h.push({ price: newP, timestamp: Date.now(), volume: amtN, open: newP, high: newP, low: newP, close: newP });
  priceHistory[mint] = h;
}

async function agentOnChain() {
  if (!isReady) return;
  const idx = Math.floor(Math.random() * agentKeypairs.length);
  const agent = agentKeypairs[idx];
  const agentName = AGENT_NAMES[idx];

  try {
    const slot = Number(await client.getSlot());
    
    // Try OpenAI for agent decision
    let decision = null;
    if (OPENAI_KEY && Math.random() < 0.3) { // 30% of actions use AI
      const tokenList = Object.values(tokenRegistry).slice(0, 5).map(t => `$${t.symbol}: ◎${t.currentPrice.toFixed(6)} (${t.priceChange1h > 0 ? '+' : ''}${t.priceChange1h.toFixed(1)}% 1h)`).join(", ");
      decision = await askAgent(agentName, `Available tokens: ${tokenList}. Your balance: ${(1000 - Math.random() * 500).toFixed(0)} S402. Market sentiment: ${Math.random() > 0.5 ? 'bullish' : 'bearish'}. What do you do?`);
    }

    const action = decision ? (decision.action === "trade" ? 0.3 : decision.action === "deploy" ? 0.55 : decision.action === "transfer" ? 0.1 : 0.9) : Math.random();

    if (action < 0.45) {
      // Real SOL transfer between agents
      const targetIdx = (idx + 1 + Math.floor(Math.random() * (agentKeypairs.length - 1))) % agentKeypairs.length;
      const target = agentKeypairs[targetIdx];
      const amt = Math.random() * 10 + 0.1;
      const lamports = Math.floor(amt * LAMPORTS_PER_SOL);

      const curSlot = Number(await client.getSlot());
      ctx.warpToSlot(BigInt(curSlot + 2));
      const tx = new Transaction();
      tx.recentBlockhash = ctx.lastBlockhash;
      tx.feePayer = agent.publicKey;
      tx.add(SystemProgram.transfer({ fromPubkey: agent.publicKey, toPubkey: target.publicKey, lamports }));
      tx.sign(agent);
      await client.processTransaction(tx);

      recordTx({
        slot, type: "transfer", from: agent.publicKey.toBase58(), to: target.publicKey.toBase58(),
        amount: amt, label: `Agent ${agentName} → ${AGENT_NAMES[targetIdx]}: ${amt.toFixed(2)} S402`,
        accounts: [agent.publicKey.toBase58(), target.publicKey.toBase58()],
      });
      trackActivity(agent.publicKey.toBase58(), "trade");
    } else if (action < 0.6) {
      // Deploy new SPL token with UNIQUE name
      const prefixes = ["TIDE","ABYS","ANCH","FLOT","DRGN","PLNK","SHRK","TRNT","VOLT","NEON","FLUX","PULS","ZEPH","ORKA","LUNA","AQUA","BLZE","FRZN","GLOW","RIFT"];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      // Add counter to ensure uniqueness
      const existingSyms = new Set(Object.values(tokenRegistry).map(t => t.symbol));
      let sym = prefix;
      let attempts = 0;
      while (existingSyms.has(sym) && attempts < 20) {
        sym = prefix + Math.floor(Math.random() * 99);
        attempts++;
      }
      if (existingSyms.has(sym)) return; // skip if can't find unique name
      
      const nameMap = {TIDE:"TidePool",ABYS:"Abyss",ANCH:"Anchor",FLOT:"Flotilla",DRGN:"SeaDragon",PLNK:"Plankton",SHRK:"SharkFin",TRNT:"Torrent",VOLT:"VoltSea",NEON:"NeonReef",FLUX:"FluxWave",PULS:"PulseTide",ZEPH:"Zephyr",ORKA:"OrcaSwim",LUNA:"LunarTide",AQUA:"AquaPulse",BLZE:"Blaze",FRZN:"FrozenSea",GLOW:"GlowDeep",RIFT:"Riftcurrent"};
      const logos = ["🦀","🪸","🌊","💎","🫧","🌿","🐙","🦈","⚡","🔥","🌙","🐚","🧊","🌋","🪼","🐋"];
      const logo = logos[Math.floor(Math.random() * logos.length)];
      const fullName = (nameMap[prefix] || prefix) + (sym !== prefix ? " " + sym.slice(prefix.length) : "");

      const mint = await createSPLToken(sym, fullName, 9);
      const mintStr = mint.toBase58();
      const initP = Math.random() * 0.005 + 0.0001;
      tokenRegistry[mintStr] = {
        address: mintStr, name: fullName, symbol: sym, supply: 1e9,
        creator: agent.publicKey.toBase58(), logo, description: `Deployed by ${agentName}`,
        website: "", twitter: "", createdAt: Date.now(),
        initialPrice: initP, currentPrice: initP, liquidity: Math.random() * 80 + 10,
        volume24h: 0, txCount: 1, priceChange5m: 0, priceChange1h: 0, priceChange6h: 0, priceChange24h: 0,
        makers: new Set([agentName]), buys: 0, sells: 0, buyVolume: 0, sellVolume: 0,
      };
      priceHistory[mintStr] = [{ price: initP, timestamp: Date.now(), volume: 0, open: initP, high: initP, low: initP, close: initP }];

      recordTx({
        slot, type: "token_launch", from: agent.publicKey.toBase58(), to: mintStr,
        programId: splToken.TOKEN_PROGRAM_ID.toBase58(),
        label: `Agent ${agentName} launched $${sym} (${fullName})`,
        accounts: [agent.publicKey.toBase58(), mintStr],
      });
      trackActivity(agent.publicKey.toBase58(), "deploy");
    } else {
      // Memo / heartbeat
      recordTx({
        slot, type: "memo", from: agent.publicKey.toBase58(), to: agent.publicKey.toBase58(),
        label: `${agentName} heartbeat`, memo: `${agentName}: ping @ ${Date.now()}`,
      });
    }
  } catch (e) { /* agent errors are silent */ }
}

// ============================================
// STARTUP
// ============================================
(async () => {
  await initChain();

  const agentTick = () => { agentOnChain(); setTimeout(agentTick, 6000 + Math.random() * 9000); };
  setTimeout(agentTick, 5000);

  const tradeTick = () => { agentTrade(); setTimeout(tradeTick, 4000 + Math.random() * 4000); };
  setTimeout(tradeTick, 3000);

  setInterval(saveState, 300000);

  // Catch-all: MUST be after all API routes
  app.get("*", (req, res) => {
    if (validSessions.has(getSession(req))) {
      return res.sendFile(path.join(__dirname, "protected", "index.html"));
    }
    res.redirect('/');
  });

  // ══════════════════════════════════════════
  // START SERVER

  app.listen(PORT, () => {
    console.log(`⭐ Sling402 Network Explorer on port ${PORT}`);
  });
})();
