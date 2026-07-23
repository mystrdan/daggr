# Daggr

Ephemeral peer-to-peer chat. No accounts, no database, no trace.

Rooms are Cloudflare Durable Objects that self-destruct 30 minutes after creation. After WebRTC signaling completes, the Worker/DO never touches message content — only SDP/ICE relay between exactly 2 peers.

## Architecture

```
daggr/
├── packages/
│   ├── protocol/       # Zod message schemas & types
│   ├── crypto/         # Web Crypto ECDSA P-256 keypair helpers
│   └── shared/         # Room ID gen, nicknames, ICE config, constants
├── apps/
│   ├── worker/         # Cloudflare Worker + Durable Object (RoomDO)
│   └── web/            # React + Vite + Tailwind frontend
└── ...
```

### Data Flow

1. **User A** creates a room → generates room ID (`dg-XXXXXXX`), nickname, and ECDSA keypair → opens WebSocket to Worker
2. **Worker** routes `/r/{roomId}` → `RoomDO` Durable Object
3. **RoomDO** accepts connection (peer #1), sets 30-min alarm
4. **User B** joins via shareable link → connects to same RoomDO (peer #2)
5. **RoomDO** relays SDP offers/answers and ICE candidates between peers (signaling only)
6. **RTCPeerConnection** established directly between browsers
7. **Chat** flows over `RTCDataChannel` — Worker/DO never sees message content
8. **30-minute alarm** fires → all WebSockets closed → DO evicted

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0 (`npm install -g pnpm`)
- **Wrangler** (included as dev dependency)

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the worker (in one terminal)

```bash
cd apps/worker
npx wrangler dev
```

The worker runs on `http://localhost:8787` by default.

### 3. Start the frontend (in another terminal)

```bash
cd apps/web
npx vite
```

The frontend runs on `http://localhost:5173` and proxies `/r/*` WebSocket requests to the worker.

### 4. Open in browser

Navigate to `http://localhost:5173`. Create a room, copy the link, and open it in another browser tab/window to start chatting.

## Deployment

### Worker

```bash
cd apps/worker
npx wrangler deploy
```

### Frontend

```bash
cd apps/web
npx vite build
```

Then deploy the `dist/` directory to Cloudflare Pages, Vercel, or any static host.

## Known Limitations & TODOs

- **TURN server not configured**: Currently only uses Google's public STUN server. Before real-user testing, add a TURN server (Cloudflare Calls or a third-party provider) for symmetric NAT traversal. See `packages/shared/src/index.ts` — the `ICE_SERVERS` array is ready for injection.
- **No E2E encryption**: Phase 1 uses plaintext over RTCDataChannel. The identity keypair (ECDSA P-256) is generated but signatures are not yet verified on messages — this is a Phase 2 concern.
- **In-memory only**: The Durable Object holds peer state in memory. If the DO is evicted (e.g., due to an unexpected error), the room is lost. The 30-minute alarm ensures eventual cleanup either way.
- **No reconnection logic**: If a peer disconnects, the room is effectively over. Phase 2 may add a short reconnection window.
- **Browser support**: Requires WebRTC, Web Crypto, and WebSocket support (all modern browsers).

## ARCH_REVIEW Comments

Throughout the codebase, you'll find `// ARCH_REVIEW:` comments on key architectural decisions. These mark judgment calls worth reviewing before scaling — algorithm choices, encoding schemes, state management patterns, etc. Search the codebase for `ARCH_REVIEW` to find all of them.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev:worker` | Start worker (wrangler dev) |
| `pnpm dev:web` | Start frontend (vite dev) |
| `pnpm dev` | Start both concurrently |
| `pnpm build` | Build all packages |
| `pnpm lint` | Type-check all packages |