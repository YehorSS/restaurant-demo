# Restaurant demo

Two restaurant websites on one booking backend, built as a working example:
**Trattoria Lucciola** (Ancona, Italian and English) and **ЖАР** (Kyiv, Ukrainian and English),
plus a shared admin where staff see the floor, confirm bookings and edit the menu.

| Part | What | Stack |
| --- | --- | --- |
| `api/` | Booking API, admin API, nightly demo reset | Cloudflare Workers, D1 (SQLite), Hono, TypeScript |
| `admin/` | Staff app served by the Worker at `/admin/` | React, Vite |
| `shared/` | API client and types used by the admin and the sites | TypeScript |

## How booking works

- Each restaurant has tables of 2 to 8 seats. A party gets the smallest free table that fits.
- Slots every 30 minutes, a visit lasts 2 hours, bookings open from one hour to 30 days ahead.
- A booking is written by a single SQL statement that re-checks overlaps, so two guests can never
  get the same table, even when they press the button at the same moment (covered by a test).
- Staff and guests can cancel; the guest needs the booking code and the phone number.
- Rate limits per address, a honeypot field for bots, server-side validation of every field.

## Admin

Sign in at `/admin/`. The demo account `demo` / `demo` can confirm and cancel bookings, add bookings
by phone, change prices and mark dishes out of stock. It cannot change menu texts or plan days off.
Everything the demo account and site visitors do is reset every night at 03:00 UTC, and the floor is
refilled with realistic bookings for the next 7 days.

## Run locally

```
npm install
npx wrangler d1 migrations apply restaurant-demo --local   # in api/
echo OWNER_PASSWORD=choose-one > api/.dev.vars
npm run build                     # builds the admin
npm run dev -w api                # http://localhost:8787/admin/
# seed: sign in as owner, then POST /api/admin/reset
npm test                          # API tests run against a real local D1
```

## Deploy

```
npx wrangler login
npx wrangler d1 create restaurant-demo          # put the id into api/wrangler.jsonc
npx wrangler d1 migrations apply restaurant-demo --remote
npx wrangler secret put OWNER_PASSWORD
npm run deploy
```
