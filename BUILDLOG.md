# VoteLock Build Log

Nightshift build: 079
Project: VoteLock
Repo/package: `nightshift-079-votelock`
Live URL target: https://votelock079.colmena.dev
Timestamp: 2026-05-06T00:00:00Z

## Scorecard

- Fresh scaffold: started from live `create-seed` template `bun-react-vite-solana-kit`.
- Solana/MPL Core: uses `@solana/kit`, `@wallet-ui/react`, and required dependency `@obrera/mpl-core-kit-lib`.
- Forbidden Solana packages: no intentional legacy Solana SDK, adapter React package, direct wallet standard app imports, or app-level byte-buffer global usage.
- Persistence: durable SQLite for proposals, sessions, challenges, votes, receipts, and audit events.
- Product: governance/ranked voting with verifiable receipt status and operator audit view.
- Deployment: Dockerfile and docker-compose added for Dokploy compose routing.

## NFT Use Case

Use-case family: governance/voting.

Primary actor: a voter using a connected Solana wallet.

Why NFT ownership matters: the MPL Core receipt asset is owned by the voter wallet that signed the ballot intent. Staff can verify that the durable receipt, proposal, wallet, tally state, asset address, and transaction signature line up without using username/password identity.

Wallet-signed vs server-signed architecture: the user signs a fresh VoteLock SIWS-style session challenge and then signs a proposal-specific ballot receipt intent containing proposal, ranking, voter, challenge, and receipt ID. The backend verifies the wallet signature, rejects duplicate votes, records durable state, and the server signer submits/mints the MPL Core asset using `@obrera/mpl-core-kit-lib`. The voter does not mint directly; the server signer pays/submits the receipt mint after signature validation.

## Runtime Gate

`/api/health` reports:

- public base URL
- Solana RPC and subscription URL
- signer configured
- collection configured
- metadata and image URL 2xx health when the base URL is HTTPS
- MPL Core mint readiness

Missing signer or disabled live mint is not hidden. Local proof can complete with `mint_pending_config`; live devnet mint requires `VOTELOCK_ENABLE_LIVE_MINT=true`, a funded `VOTELOCK_SIGNER_SECRET`, and optional `VOTELOCK_COLLECTION_ADDRESS`.

## Implementation Log

- 2026-05-06T00:00:00Z: Scaffolded from `bun-react-vite-solana-kit` in `/tmp` and copied into repo while preserving `.git`.
- 2026-05-06T00:00:00Z: Added Bun/Hono API, SQLite schema, seeded governance proposal, signed session and ballot challenge flow, duplicate vote protection, tally state, receipt metadata/image endpoints, and operator verification.
- 2026-05-06T00:00:00Z: Added MPL Core receipt mint module using `@obrera/mpl-core-kit-lib/generated` `getCreateV1Instruction`; live mint is gated by explicit runtime config.
- 2026-05-06T00:00:00Z: Added proof script, Dockerfile, docker-compose, README, and MIT license metadata.
- 2026-05-06T00:00:00Z: Updated compose for Dokploy/Traefik routing on internal port `3000` with no host port mapping, external `dokploy-network`, and SQLite persisted at `/app/data/votelock.sqlite`.

## Deployment Notes

- 2026-05-06T01:22:24Z: Local gates passed: `bun run lint`, `bun run check-types`, `bun run build`, and `bun run proof:local`.
- 2026-05-06T01:40:00Z: Fixed the Docker build context and disabled install-time prepare scripts inside the container so Dokploy can build from a clean remote context.
- 2026-05-06T01:52:00Z: Removed scaffold title/footer/favicon residue, redeployed on Dokploy, and verified `https://votelock079.colmena.dev` plus `/api/health` over a valid HTTPS certificate.
- 2026-05-06T01:53:00Z: Live proof minted MPL Core receipt asset `8eW4yZ8zo9Yx1KbxQ9ZpSBCG3CG8KWmLNJT992LEpubg` with transaction `2CDG6MMurWPUxSkGCu5FhL272MvTGCbk47gWYih5U6FT3awHL7p8prmHZffMWB8SdBg9mE3DxvxHYzEhtnHvtr5t`; proof receipt `votelock-motekrs5-6826c87b` returned metadata and image HTTP 200.
- 2026-05-06T01:53:00Z: Responsive verification passed for mobile `390x844` and desktop `1280x720`.
