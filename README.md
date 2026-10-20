# Cashew (Next.js)

The money side of Cashew as a Next.js app: sign-in, Home, Add an entry (with MoMo texts), Transactions,
Repeats (auto transactions), Budgets, Goals, and Settings (accounts, categories, people).

It uses **the same Postgres database as the Python Cashew**, table for table. Nothing needs migrating:

- Everyone keeps their username and password. Hashes are the same PBKDF2 format in both apps.
- The Telegram reminders, the daily GitHub job and the backups keep running in Python against the same data.
- The kitchen (meals, pantry, shopping) stays in the Streamlit app for now. Set `CASHEW_STREAMLIT_URL` and a
  Kitchen link appears in the menu.
- Auto transactions can be added by this app, the Python app or the daily job. Rows are locked while they're
  added, so nothing is ever added twice.

## Run it on your Mac

You need Node 20 or newer (`node -v`).

```bash
cd cashew-next
cp .env.example .env        # then paste your Neon connection string into DATABASE_URL
npm install                 # also generates the Prisma client
npm run dev                 # http://localhost:3000
```

**Neon:** in the Neon console open your project, click **Connect**, choose the **pooled** connection string and
paste it into `.env`. If your Cashew database is still elsewhere (for example Supabase), copy it across once:

```bash
pg_dump --no-owner --no-acl "$OLD_DATABASE_URL" | psql "$NEON_DATABASE_URL"
```

Then point the Streamlit app's `DATABASE_URL` secret and the GitHub Actions `DATABASE_URL` secret at Neon too, so
all three use one database.

> Don't run `prisma migrate` or `prisma db push` against Cashew's database. The Python app's `ensure_schema` owns
> the tables (and the kitchen tables in the `meals` schema), and those commands would try to change them.
> `npx prisma db pull` is safe if you want to check `prisma/schema.prisma` against the live database.

## Put it online (Vercel)

1. Push this folder to GitHub (its own repository, or a `cashew-next/` folder in the existing one).
2. On vercel.com: **Add New → Project**, pick the repository. If it's a folder, set **Root Directory** to
   `cashew-next`.
3. Under **Environment Variables** add `DATABASE_URL` (the Neon pooled string) and, if you like,
   `CASHEW_STREAMLIT_URL`.
4. Deploy. The build runs `prisma generate` and `next build` by itself.

## How it's put together

```
prisma/schema.prisma      the money tables, mapped exactly onto the Python names
src/lib/book.ts           balances, budgets, auto payments still due, the banner figure (a port of core/data.py)
src/lib/rules.ts          auto transaction dates (a port of auto_rules.py)
src/lib/momo.ts           reading MoMo, Telecel Cash and AT Money texts (a port of core/momo.py)
src/lib/auth.ts           passwords, lock-out after 5 tries, sessions in an httpOnly cookie
src/lib/load.ts           reads everything once per request; adds due auto transactions first
src/actions/*.ts          Server Actions: every change, checked with zod, signed-in only, in one transaction
src/app/(app)/…           the pages (server components) with small client components for forms
src/proxy.ts              sends signed-out visitors to /login
```

The figures were checked against the Python app on the same database: the balances, budgets, auto payments
still due and the Home banner match to the cent across several dates. The MoMo texts and auto transaction dates
match too.

## Tests

```bash
npm test                                         # logic: banner states, budgets, dates, MoMo, passwords
tests/e2e/setup.sh ../cashew postgresql://you@localhost/postgres   # a throwaway database built by the Python code
npx playwright test                              # the whole app in a browser, phone and desktop
```

To repeat the side-by-side check with Python: `python3 tests/parity/seed.py <db-url> ../cashew`, then
`python3 tests/parity/dump.py <db-url> ../cashew > python.json` and
`DATABASE_URL=<db-url> PARITY_JSON=python.json npm test`.
