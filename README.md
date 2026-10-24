# SwiftShelf Agent

**WhatsApp fulfillment ops, automated.**

Lagos vendors burn 20 minutes per order: typing stock codes into chat, haggling over Lekki flood surcharges, screenshotting bank transfers. SwiftShelf kills that loop.

A Chord-powered WhatsApp agent. A merchant texts like a customer — gets stock audits, zone-aware pricing, a live Paystack top-up link, and a confirmed dispatch ID back in a handful of chat turns.

> One chat message in, confirmed dispatch out.

## The engines

| Module | Job |
|---|---|
| `inventory/` | Instant SKU stock audits. No "let me check and revert." |
| `logistics/` | Pre-computed disruption briefs (Ikeja / Yaba / Lekki). Flood surcharge? Applied automatically, disclosed upfront. |
| `wallet/` | Prepaid dispatch wallet on Paystack. No manual transfers, no reconciliation calls. Balance short? A real checkout link for the exact shortfall is generated in-chat. Duplicate-proof ledger, atomic deductions — money never double-spends or double-credits. |
| `mcp/` | The bridge: all five business tools exposed to Chord as a Model Context Protocol server (Streamable HTTP). |
| `presentation/` | Domain-event → WhatsApp copy renderer + Effect-TS event bus. The chat copy engine (used for proactive bubble paths; in the MCP build the assistant composes replies itself from tool results). |
| `core/` | Shared Effect runtime, typed domain events, PubSub event bus. |

Built with [Effect-TS](https://effect.website): every failure is a typed error in the effect channel (`InsufficientWalletCredit`, `StockUnavailable`, `AdvisoryNotAccepted`, `PaymentGateway`, `DuplicateTransactionReference`, `MerchantNotFound`) — no stringly-typed exceptions reaching the LLM.

## How it flows

```
Merchant (simulator/WhatsApp)
   │  chat turn
   ▼
Chord Assistant  ──  playbook = chord/SKILL.md (behaves like a SwiftShelf operator)
   │  MCP tool calls (Streamable HTTP, bearer-guarded)
   ▼
/mcp  ──►  wallet / inventory / logistics / dispatch (shared Effect runtime)
   │            │
   │            └─► Paystack API  ── checkout.link ──► merchant pays
   │                                        │
   └── tool result (typed, JSON) ◄── charge.success webhook ──► creditTopup (idempotent)
```

## Architecture note: MCP instead of the webhook/turns path

The original design assumed Chord would push `turn.created` events to an HTTP webhook, our server would execute `tool_calls`, and reply via `POST /v1/teammates/{id}/turns`. Against the live platform, that path was wrong in three ways:

1. **`POST /v1/teammates/{id}/turns` does not exist** — Chord answers `404 "No endpoint found for the requested path"`. There is no "post a turn as the agent" endpoint for this integration shape.
2. **`turn.created` is not a dispatched tenant event.** The webhook was registered and active; deliveries over real conversations: **zero**. The documented event vocabulary is `chat.completed`, `conversation.escalated`, `workspace.config_*`.
3. **The assistant's LLM can only call tools the platform knows about.** A `tools` manifest piggy-backed on replies arrives too late — the model must see tool schemas *before* generating a turn.

Chord's native mechanism is **MCP**: register a remote Streamable-HTTP MCP server on the workspace (`POST /v1/workspaces/{id}/mcp-servers`), bind it to the teammate (`set_mcp_server_ids`), and the agent discovers and calls tools itself during a turn. We rebuilt `mcp/server.ts` (~130 lines, official SDK) around our existing Effect services — zero business logic changed, only the transport.

### Edge cases this introduces (handled)

- **Tool failures must be LLM-readable.** Effect wraps typed errors in `FiberFailure` ("An error has occurred") when thrown from `runPromise`. The MCP layer runs every tool through `Effect.exit` and extracts the original cause, so the model receives e.g. `InsufficientWalletCredit: {"shortKobo":180000,"checkoutUrl":"https://checkout.paystack.com/…"}`.
- **The shortfall must be one payload.** The `InsufficientWalletCredit` error carries the Paystack URL generated during deduction, otherwise the agent "helpfully" retries the booking (observed behavior). The playbook now forbids retry and points at the embedded URL.
- **No proactive chat push.** Without a turns/thread reply channel, a "Payment confirmed" bubble can't be injected mid-conversation. Compensated in the skill: merchant says *"I paid"* → agent calls `check_or_create_wallet` → sees the credited balance → books.
- **State is in-memory.** Wallets live in a `SynchronizedRef`. Any server restart resets balances; keep one long-lived process, and note Paystack sessions created before a restart will credit `MerchantNotFound` (logged + ignored, not an error).
- **Duplicate webhook deliveries are normal** — Paystack retries `charge.success`. `processedReferences` makes credit idempotent (verified: double delivery = single credit).
- **MCP session semantics**: Chord is the MCP client; sessions are negotiated via `mcp-session-id`. The server keeps a transport map and cleans up on close. Bad/missing bearer → JSON-RPC 401-style error, never tool data.
- **Public HTTPS is mandatory.** Chord's outbound policy rejects private/loopback URLs. ngrok free tier is fine for dev (claim a static domain so the registration survives restarts); production here runs on InstaBox public ports — persistent HTTPS URLs that survive pause/resume and re-wake the machine on inbound webhook/MCP traffic.

## Running it

Requirements: **Node ≥ 20**, npm, a Chord API key with `teammate:update` + MCP permissions, a Paystack test account, and a public HTTPS entrypoint (ngrok for dev, or InstaBox/VPS public ports for production — see deployment).

```bash
npm install
cp .env.example .env   # fill values
npm run dev            # http://localhost:3000  (or: npm start)
```

### Environment variables (`.env`)

| Var | Required | Where it comes from |
|---|---|---|
| `CHORD_API_KEY`  | Chord dashboard → Channels & Tools → Developer → API credentials → Add token |
| `CHORD_TEAMMATE_ID`  | teammate UUID (from the teammate profile URL or `GET /v1/teammates`) |
| `CHORD_WORKSPACE_ID`  | `ws-…` from the teammate object |
| `MCP_AUTH_TOKEN` | any 32-byte hex secret (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) — also given to Chord as the MCP bearer |
| `PAYSTACK_SECRET_KEY` | (payments) | Paystack dashboard → Developers → API Keys (`sk_test_…`) |
| `CHORD_WEBHOOK_SECRET` | legacy | only if the (currently unused) chord webhook path is revived |
| `PAYSTACK_PUBLIC_KEY` | unused | informational only — server-side integration needs only the secret |
| `PORT` | – | default `3000` |

### One-time Chord setup (already done for this tenant — redo per environment)

```bash
# 1. Register the MCP server (via dashboard UI or API)
curl -X POST "$CHORD_BASE/v1/workspaces/$WS/mcp-servers" -H "Authorization: Bearer $KEY" \
  -d '{"name":"SwiftShelf tools","url":"https://<host>/mcp","auth_type":"bearer","auth_token":"<MCP_AUTH_TOKEN>","transport":"streamable_http","enabled":true}'
# 2. Force tool discovery: POST .../mcp-servers/<mcp-id>/tools
# 3. Bind to the teammate:  PUT /v1/teammates/<id>  {"set_mcp_server_ids":["<mcp-id>"]}
# 4. Load the playbook:     PUT /v1/teammates/<id>/playbook  {"playbook":"<contents of chord/SKILL.md>"}
```

### Paystack setup

- Dashboard → Settings → API Keys & Webhooks → Add endpoint: `https://<host>/api/paystack/webhook`, event `charge.success`, toggle **active**.
- Test card: `4084 0840 8408 4081`, CVV `408`, any future expiry, OTP `123456`.

### Deploying on a host with a public HTTPS URL

The production deployment runs on an **InstaBox** microVM (free 4 vCPU / 8 GiB machine), which replaces
the ngrok/laptop dev loop entirely — its public-ports gateway provides persistent HTTPS with TLS,
auto-wakes a paused machine on inbound request, and **pause/resume keeps running processes and memory
intact** (the in-memory ledger survives idle pauses; only a full `stop` resets it).

```bash
# on the box
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs git
git clone https://github.com/JoshuaIzu/TSG-swiftshelfagent.git swiftshelfagent && cd swiftshelfagent
npm ci
cp .env.example .env && chmod 600 .env        # fill real secrets; never commit

sudo npm i -g pm2 tsx
pm2 start "tsx server.ts" --name swiftshelf
pm2 save
pm2 logs swiftshelf --lines 10 --nostream      # expect: "listening on port 3000"

instabox-port publish 3000 --name swiftshelf   # prints https://3000-<id>.instabox.tech
curl -s https://3000-<id>.instabox.tech/health # liveness through the TLS gateway
```

Then re-point the two integrations at the new URL:

```bash
# Chord: update the MCP registration URL + force tool re-discovery
curl -s -X PUT  "https://api.chordhq.xyz/v1/workspaces/$WS/mcp-servers/$MCP_ID" \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"url":"https://3000-<id>.instabox.tech/mcp","enabled":true}'
curl -s -X POST "https://api.chordhq.xyz/v1/workspaces/$WS/mcp-servers/$MCP_ID/tools" \
  -H "Authorization: Bearer $KEY"               # must return the five tool definitions
```

Paystack dashboard → API Keys & Webhooks → endpoint `https://3000-<id>.instabox.tech/api/paystack/webhook`, event `charge.success`, active.

Optional but recommended: keep a free uptime monitor (e.g. UptimeRobot, 5-min GET `/health`) pointed at
the URL — it doubles as keep-warm (no auto-pause mid-demo) and downtime alerting. Never `instabox stop`
the machine manually; only ever let it auto-pause.

On a conventional VPS: any TLS-terminating reverse proxy works (Caddy `reverse_proxy localhost:3000` or
nginx + certbot on ports 80/443) — same pm2 run line, only the URL-provisioning step differs. Keep a
**single process** (the in-memory ledger isn't shared across replicas) and rotate any dev-exposed secrets.

### Endpoints

| Route | Purpose |
|---|---|
| `POST /mcp` | MCP Streamable HTTP (also `GET`/`DELETE`) — bearer-guarded, Chord connects here |
| `POST /api/paystack/webhook` | `charge.success` → verify HMAC-SHA512 → idempotent wallet credit |
| `GET /health` | liveness |
| `POST /api/chord/webhook` | legacy turn-push handler — dormant (see architecture note) |

### Verify it's alive

```bash
# MCP handshake + tool discovery
curl -sS -X POST https://<host>/mcp -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"check","version":"1"}}}'
```

Expected: `serverInfo: swiftshelf-tools` and a `mcp-session-id` header; `tools/list` then returns the five SwiftShelf tools.
