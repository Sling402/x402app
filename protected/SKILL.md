# Sling402 — Protected Area

## Overview

This directory contains the authenticated explorer UI served after password gate.

| Field | Value |
|---|---|
| Name | Sling402 |
| Token | $S402 (native) · $wS402 (wrapped) |
| Handle | [@Sling402](https://x.com/Sling402) |
| Domain | [sling402.io](https://sling402.io) |
| Protocol | X402 (HTTP 402 Payment Required) |
| Supply | 1,000,000,000 $S402 (fixed) |

## Files

| File | Purpose |
|---|---|
| `index.html` | Main explorer with left sidebar navigation |
| `app.js` | All explorer logic, wallet connect modal, faucet, agents |
| `dex.html` | DEX trading interface with charts |

## UI Layout

Left sidebar (220px) with sections:
- **Protocol**: Explorer, Tokens, Agents, Programs
- **Payments**: Faucet, Convert
- **Info**: Supply, X402 Guide

Top bar: page title + X-402-Payment badge + chain sync indicator.

Bottom footer: block height, TPS, payments, tokens, agents, supply.

## Theme

- Background: `#111111`
- Accent: `#FF5722` (Sling orange)
- Fonts: DM Sans (body) + IBM Plex Mono (code/data)
- Mobile: sidebar slides from left with overlay

## Wallet Connect

Modal-based wallet picker detecting Phantom, Backpack, Solflare. Falls back to manual address paste.

---

**sling402.io** · **@Sling402** · **$S402**
