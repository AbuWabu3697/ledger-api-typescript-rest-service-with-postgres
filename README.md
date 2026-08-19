# ledger-api

A REST API for a double-entry accounting ledger. Each transaction records a debit account, a credit account, and an amount in cents — keeping `balanceCents` on both accounts updated atomically inside a serializable database transaction.

Stack: TypeScript, Express, Prisma ORM, Postgres, Zod, JWT.

## Architecture

```
src/
├── app.ts               Express app (middleware + routes wired up)
├── server.ts            Process entry point — starts HTTP listener
├── config.ts            Environment variable loading with fail-fast validation
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
│   ├── auth.ts          Zod schemas: RegisterSchema, LoginSchema, RefreshSchema
│   ├── account.ts       Zod schemas: CreateAccountSchema, UpdateAccountSchema
│   └── transaction.ts   Zod schemas: CreateTransactionSchema, UpdateTransactionSchema
├── services/
│   ├── authService.ts   register, login, refresh (with token rotation), logout
│   ├── accountService.ts listAccounts, getAccount, createAccount, updateAccount, deleteAccount
│   └── transactionService.ts createTransaction (atomic balance update), list, get, update, delete
└── types/
    └── index.ts         JwtPayload, AuthRequest, ApiResponse, ApiError
prisma/
└── schema.prisma        Users, Accounts, Transactions, TransactionLines, RefreshTokens
```

## Data model

- **User** — owns accounts and refresh tokens.
- **Account** — has a `type` (ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE), a `currency` (3-char ISO), and a running `balanceCents` (BigInt).
- **Transaction** — description, amount in cents, date.
- **TransactionLine** — links one transaction to exactly one debit account and one credit account (normalized double-entry).
- **RefreshToken** — stored on issue; deleted on rotation or logout.

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | HMAC secret for access tokens |
| `JWT_EXPIRES_IN` | no | Access token TTL (default `15m`) |
| `JWT_REFRESH_SECRET` | yes | HMAC secret for refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | no | Refresh token TTL (default `7d`) |
| `PORT` | no | HTTP port (default `3000`) |
| `NODE_ENV` | no | `development` or `production` |

## Running locally

```bash
cp .env.example .env
# fill in DATABASE_URL and JWT secrets

npm install
npx prisma migrate dev
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"..."}
```

## API overview

All write routes return `{ "data": <resource> }`. All error responses return `{ "error": "<message>" }` with an appropriate HTTP status.

### Auth

```
POST /auth/register    body: { email, password }     → 201 { data: { accessToken, refreshToken } }
POST /auth/login       body: { email, password }     → 200 { data: { accessToken, refreshToken } }
POST /auth/refresh     body: { refreshToken }        → 200 { data: { accessToken, refreshToken } }
POST /auth/logout      body: { refreshToken }        → 204
```

### Accounts (Authorization: Bearer <accessToken>)

```
GET    /accounts          list all accounts for the authenticated user
GET    /accounts/:id      get one account
POST   /accounts          body: { name, type, currency? }     → 201
PATCH  /accounts/:id      body: { name? }
DELETE /accounts/:id      → 204
```

### Transactions (Authorization: Bearer <accessToken>)

```
GET    /transactions      list transactions referencing any owned account
GET    /transactions/:id  get one transaction
POST   /transactions      body: { description, amountCents, date, debitAccountId, creditAccountId }  → 201
PATCH  /transactions/:id  body: { description?, date? }
DELETE /transactions/:id  reverses balanceCents on both accounts  → 204
```

## Status

Foundation committed. Tests, Docker setup, CI, and Fly.io deployment are in progress.
