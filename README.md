# ledger-api

A REST API for a double-entry accounting ledger. Each transaction records a debit account, a credit account, and an amount in cents — keeping `balanceCents` on both accounts updated atomically inside a serializable database transaction.

Stack: TypeScript, Express, Prisma ORM, Postgres 16, Zod, JWT (RS256-compatible HS256 for simplicity).

## Architecture

```
src/
├── app.ts               Express app (middleware + routes)
├── server.ts            Process entry point
├── config.ts            Env var loading with fail-fast validation
├── lib/
│   └── prisma.ts        Singleton PrismaClient
├── middleware/
│   ├── auth.ts          JWT Bearer token verification
│   └── validate.ts      Zod schema validation for request bodies
├── routes/
│   ├── auth.ts          POST /auth/register, /login, /refresh, /logout
│   ├── accounts.ts      CRUD on /accounts (authenticated)
│   └── transactions.ts  CRUD on /transactions (authenticated)
├── schemas/
│   ├── auth.ts          RegisterSchema, LoginSchema, RefreshSchema
│   ├── account.ts       CreateAccountSchema, UpdateAccountSchema
│   └── transaction.ts   CreateTransactionSchema, UpdateTransactionSchema
├── services/
│   ├── authService.ts   register, login, refresh (token rotation), logout
│   ├── accountService.ts listAccounts, getAccount, createAccount, updateAccount, deleteAccount
│   └── transactionService.ts createTransaction (atomic balance update), list, get, update, delete
└── types/
    └── index.ts         JwtPayload, AuthRequest, ApiResponse, ApiError
prisma/
└── schema.prisma        Users, Accounts, Transactions, TransactionLines, RefreshTokens
```

## Data model

- **User** — owns accounts and refresh tokens.
- **Account** — `type` (ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE), `currency` (3-char ISO), running `balanceCents` (BigInt, stored as Postgres `bigint`).
- **Transaction** — description, amount in cents, date.
- **TransactionLine** — links one transaction to exactly one debit account and one credit account (normalized double-entry). A `@@unique([transactionId])` constraint enforces one line per transaction.
- **RefreshToken** — persisted on issue; deleted on rotation or explicit logout.

All balance mutations run inside a Prisma `$transaction` with the debit account incremented and the credit account decremented in the same serializable unit.

## Environment variables

Copy `.env.example` to `.env` and fill in values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string |
| `JWT_SECRET` | yes | — | HMAC secret for access tokens |
| `JWT_EXPIRES_IN` | no | `15m` | Access token TTL |
| `JWT_REFRESH_SECRET` | yes | — | HMAC secret for refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh token TTL |
| `PORT` | no | `3000` | HTTP port |
| `NODE_ENV` | no | `development` | `development` or `production` |

## Running locally

```bash
cp .env.example .env
# fill in DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

npm install
npx prisma migrate dev   # creates and applies migrations
npm run dev
```

## Running with Docker

```bash
# copies env vars from the shell; override JWT secrets in production
docker compose up --build
```

`docker compose up` boots Postgres 16 and the app. Migrations run automatically on the app's first start. The app listens on port `3000`.

Health check:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"2024-03-01T12:00:00.000Z"}
```

## Running tests

Tests mock the Prisma client entirely — no database required.

```bash
npm test
# or with coverage report:
npm run test:coverage
```

Coverage threshold: 70% line coverage on `src/services/**` and `src/middleware/**`.

## API

All success responses: `{ "data": <resource> }`.
All error responses: `{ "error": "<message>" }` with an appropriate HTTP status.
Validation errors (400): `{ "error": "Validation failed", "details": [{ "path": "...", "message": "..." }] }`.

### Auth

```
POST /auth/register
  body: { "email": "user@example.com", "password": "atleast8chars" }
  201: { "data": { "accessToken": "<jwt>", "refreshToken": "<jwt>" } }
  409: email already registered

POST /auth/login
  body: { "email": "user@example.com", "password": "atleast8chars" }
  200: { "data": { "accessToken": "<jwt>", "refreshToken": "<jwt>" } }
  401: invalid credentials

POST /auth/refresh
  body: { "refreshToken": "<jwt>" }
  200: { "data": { "accessToken": "<jwt>", "refreshToken": "<jwt>" } }
  401: token invalid, expired, or revoked

POST /auth/logout
  body: { "refreshToken": "<jwt>" }
  204
```

### Accounts

All account routes require `Authorization: Bearer <accessToken>`.

```
GET /accounts
  200: { "data": [ { "id", "name", "type", "currency", "balanceCents", "userId", ... } ] }

GET /accounts/:id
  200: { "data": { ... } }
  404: account not found

POST /accounts
  body: { "name": "Checking", "type": "ASSET", "currency": "USD" }
  201: { "data": { "id": "...", "balanceCents": 0, ... } }
  400: validation error

PATCH /accounts/:id
  body: { "name": "New name" }
  200: { "data": { ... } }
  404: account not found

DELETE /accounts/:id
  204
  404: account not found
```

Account types: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`.

### Transactions

All transaction routes require `Authorization: Bearer <accessToken>`.

```
GET /transactions
  200: { "data": [ { "id", "description", "amountCents", "date", "lines": [...] } ] }
  note: amountCents is serialized as a string

GET /transactions/:id
  200: { "data": { ... } }
  404: transaction not found

POST /transactions
  body: {
    "description": "Office rent",
    "amountCents": 150000,
    "date": "2024-03-01T00:00:00.000Z",
    "debitAccountId": "<uuid>",
    "creditAccountId": "<uuid>"
  }
  201: { "data": { "id": "...", "amountCents": "150000", ... } }
  400: debit and credit accounts are the same, or validation error
  404: one or both accounts not found / not owned by the user

PATCH /transactions/:id
  body: { "description": "Updated", "date": "2024-04-01T00:00:00.000Z" }
  200: { "data": { ... } }
  404: transaction not found

DELETE /transactions/:id
  204  (reverses balanceCents on debit and credit accounts)
  404: transaction not found
```

## End-to-end example

```bash
BASE=http://localhost:3000

# Register
TOKENS=$(curl -s -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"strongpassword"}')
ACCESS=$(echo $TOKENS | jq -r '.data.accessToken')
REFRESH=$(echo $TOKENS | jq -r '.data.refreshToken')

# Create accounts
ASSET=$(curl -s -X POST $BASE/accounts \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bank","type":"ASSET"}' | jq -r '.data.id')

EXPENSE=$(curl -s -X POST $BASE/accounts \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rent","type":"EXPENSE"}' | jq -r '.data.id')

# Record a transaction (debit Rent expense, credit Bank asset)
curl -s -X POST $BASE/transactions \
  -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d "{
    \"description\": \"March rent\",
    \"amountCents\": 150000,
    \"date\": \"2024-03-01T00:00:00.000Z\",
    \"debitAccountId\": \"$EXPENSE\",
    \"creditAccountId\": \"$ASSET\"
  }"
```

## Deployment (Fly.io)

```bash
fly auth login
fly launch --no-deploy   # creates the app, skips first deploy
fly postgres create --name ledger-db
fly postgres attach ledger-db
fly secrets set JWT_SECRET=$(openssl rand -hex 32) \
               JWT_REFRESH_SECRET=$(openssl rand -hex 32)
fly deploy
```

The `fly.toml` in this repo configures a `/health` check that runs every 30 seconds.
