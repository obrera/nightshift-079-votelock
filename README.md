# VoteLock

Nightshift build 079: a Solana/MPL Core governance receipt workstation.

Live target: https://votelock079.colmena.dev
Repository: https://github.com/obrera/nightshift-079-votelock

## What It Does

VoteLock lets a connected Solana wallet browse active governance proposals, rank choices, sign a fresh ballot intent, and receive an MPL Core vote receipt asset owned by that wallet. Staff can verify a receipt ID against durable proposal, voter, mint, transaction, tally, and audit state.

The voter signs the VoteLock session challenge and a proposal-specific ballot receipt intent. The backend verifies the Ed25519 wallet signature, prevents duplicate votes, stores SQLite vote/audit state, then the server signer submits the MPL Core mint path for the receipt asset. `@obrera/mpl-core-kit-lib` is a required dependency for the MPL Core receipt instruction path.

## Run Locally

```bash
bun install
bun run build
bun run serve
```

Open http://127.0.0.1:4179.

For frontend-only iteration:

```bash
bun run dev
```

## Runtime Config

```bash
PUBLIC_BASE_URL=https://votelock079.colmena.dev
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_RPC_SUBSCRIPTIONS_URL=wss://api.devnet.solana.com
SQLITE_PATH=./data/votelock.sqlite
VOTELOCK_ENABLE_LIVE_MINT=false
VOTELOCK_SIGNER_SECRET=
VOTELOCK_COLLECTION_ADDRESS=
```

`/api/health` reports public URL, RPC, signer config, collection config, metadata/image URL health, and mint readiness. Missing mint config is reported directly.

`VOTELOCK_SIGNER_SECRET` accepts common Solana key formats: a JSON byte array, a comma-separated byte list, `base64:<value>`, or base58.

## Proof

The proof script mirrors the UI flow with a generated Ed25519 test wallet:

```bash
bun run proof:local
bun run proof:live
```

It creates a wallet-signed session, fetches the seeded proposal, signs a ballot intent, submits the vote through the same API path, verifies the receipt, and checks metadata/image endpoints. If live mint config is enabled and funded, the receipt includes an MPL Core asset address and transaction signature.

## Docker / Dokploy

```bash
docker compose up --build
```

The image uses `node:24-bookworm-slim`, installs Bun, builds the Vite app, and serves API plus static frontend from one container. In compose, the app listens on internal port `3000`, persists SQLite at `/app/data/votelock.sqlite`, and joins the external `dokploy-network` for Dokploy/Traefik routing at `https://votelock079.colmena.dev`. There is no host `ports:` mapping in compose.

## Challenge Reference

Nightshift build 079, project name VoteLock, category governance/voting, Solana week. Not ticketing, event access, or academic credentials.

## Agent / Model

Built by Codex as coding-agent for Nightshift build 079. Model metadata: GPT-5 coding agent in the OpenAI Codex environment.
