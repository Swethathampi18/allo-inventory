# Allo Inventory – Take-Home Exercise

A multi-warehouse inventory reservation system built with Next.js 14, Prisma, PostgreSQL, and Redis.

## Live Demo

allo-inventory-git-main-swethathampi18s-projects.vercel.app


---

## Local Development

### Prerequisites

- Node.js 18+
- A hosted Postgres database (Supabase, Neon, or Railway — all have free tiers)
- A Redis instance (Upstash free tier works great)

### 1. Clone & install

```bash
git clone https://github.com/your-username/allo-inventory
cd allo-inventory
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (with `?sslmode=require` for hosted) |
| `REDIS_URL` | Redis URL in `rediss://default:password@host:port` format |
| `CRON_SECRET` | Any random string — protects the cron endpoint |

### 3. Run migrations and seed

```bash
# Generate Prisma client
npm run db:generate

# Push schema to the database (dev — skips migration files)
npm run db:push

# Seed with sample products, warehouses, and stock
npm run db:seed
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel + Supabase + Upstash)

1. Push the repo to GitHub.
2. Create a new Vercel project and import the repo.
3. Add the three env vars (`DATABASE_URL`, `REDIS_URL`, `CRON_SECRET`) in Vercel → Settings → Environment Variables.
4. Deploy. Vercel reads `vercel.json` and automatically sets up the cron job.
5. After first deploy, run the seed via a one-off command or the Vercel CLI:
   ```bash
   vercel env pull .env.local && npm run db:seed
   ```

---

## How Concurrency Safety Works

### The core problem

Two users can simultaneously request the last unit of a SKU. A naive read-then-write approach has a race window: both read `available = 1`, both pass the stock check, both decrement — you've now sold `-1` units.

### Solution: Distributed lock + DB transaction (two layers)

**Layer 1 — Redis distributed lock**

Before touching the database, the reservation endpoint acquires a Redis lock scoped to `stock:{productId}:{warehouseId}`:

```
SET lock:stock:prod_abc:wh_xyz <uuid> NX PX 5000
```

- `NX` means "only set if key does not exist" — this is atomic at the Redis level.
- Only one request wins the lock at a time; the other gets a 503 and can retry.
- The lock is released in a `finally` block (or auto-expires after 5s if the process crashes).

**Layer 2 — Prisma transaction**

Inside the lock, the stock check and decrement happen inside a single `$transaction`. This means:
- The `SELECT` and `UPDATE` are committed atomically.
- If the process crashes between read and write, the transaction rolls back automatically.
- Defense-in-depth: even if the Redis lock were somehow bypassed, the DB transaction prevents double-decrement.

**Result**: If two requests race for the last unit, exactly one acquires the lock and succeeds. The other either gets a 503 (lock contention) or 409 (stock truly gone).

---

## Reservation Expiry

### Production approach: Vercel Cron (every minute)

`vercel.json` configures a cron job that calls `GET /api/cron/expire-reservations` every minute:

```json
{
  "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "* * * * *" }]
}
```

The handler finds all `PENDING` reservations where `expiresAt < now`, decrements their reserved count from `StockLevel`, and marks them `RELEASED`. It's protected by a `CRON_SECRET` bearer token to prevent unauthorized calls.

### Lazy cleanup (defense-in-depth)

The `POST /api/reservations/:id/confirm` endpoint also checks `expiresAt` on read. If a reservation is expired at confirm time, it releases the stock immediately and returns 410. This means even if the cron is delayed, expired reservations can never be confirmed.

### Why not a long-running worker?

Vercel's serverless model doesn't support persistent background processes. The cron approach fits the platform. If this were deployed on a VPS or Kubernetes, a dedicated worker (e.g. BullMQ queue with delayed jobs) would be more precise — the cron has up to ~60s latency in releasing stock after expiry.

---

## Idempotency (Bonus)

Both `POST /api/reservations` and `POST /api/reservations/:id/confirm` support an `Idempotency-Key` header.

**How it works:**

1. Client generates a UUID before the request and attaches it as `Idempotency-Key: <uuid>`.
2. On the server, before processing, we check Redis for `idem:<key>`.
3. If found, we return the cached response immediately — no side effects.
4. If not found, we process normally and store the response in Redis with a TTL matching the reservation window (10 min for create, 24h for confirm).

**Why Redis (not the DB)?**

Redis is faster and the TTL cleanup is automatic. The `idempotencyKey` field is also stored on the `Reservation` row (with a unique constraint) as a fallback uniqueness check.

**Client usage:**

```http
POST /api/reservations
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{ "productId": "...", "warehouseId": "...", "quantity": 1 }
```

---

## Data Model

```
Product
  id, name, description, imageUrl, price (in paise)

Warehouse
  id, name, location

StockLevel (Product × Warehouse)
  total     — physical units in the warehouse
  reserved  — units currently held by PENDING reservations
  available = total - reserved

Reservation
  productId, warehouseId, quantity
  status: PENDING | CONFIRMED | RELEASED
  expiresAt, idempotencyKey
```

Stock flow:
- **Reserve**: `reserved += quantity`
- **Confirm**: `total -= quantity`, `reserved -= quantity`
- **Release/expire**: `reserved -= quantity` (total unchanged)

---

## Trade-offs & What I'd Do With More Time

**Trade-offs made:**

- **Per-SKU locking, not per-user**: The lock is `stock:{productId}:{warehouseId}`, so two users reserving different products never block each other — only the same SKU/warehouse pair serializes.
- **Quantity fixed to 1 in the UI**: The API supports any quantity, but the product listing page always reserves 1. A production UI would have a quantity selector.
- **No auth**: Reservations aren't tied to a user session. In production, you'd attach a `userId` (from your auth provider) and ensure users can only confirm/release their own reservations.
- **Cron granularity**: Vercel Cron's minimum is 1 minute. Stock can stay "locked" up to 59 extra seconds after expiry. Acceptable for a 10-minute window.

**With more time:**

- Add proper auth (NextAuth / Clerk) and tie reservations to users.
- Replace the cron with Upstash QStash delayed messages (fires exactly at expiry, not on a 60s poll).
- Add optimistic UI updates (update product stock count in the client after reserving without a full refetch).
- Add an admin dashboard to view all reservations and stock levels.
- Write integration tests for the race-condition logic using concurrent `fetch` calls.
