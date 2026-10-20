# Cashew (Next.js)

Cashew as a lean Next.js app, styled with Tailwind CSS: sign-in, Home (summary cards), Add an entry (with MoMo
texts), Transactions, Budgets and Settings, and the kitchen: the meal plan, the shopping list and shopping trips, the
pantry (food and household supplies), the fridge, recipes and ingredients.

Goals, the Repeats page, price charts, the pairings editor and meal ideas were taken out to keep the app fast. Their
tables are untouched, and auto transactions still run (here, in the Python app and in the daily job).

It uses **the same Postgres database as the Python Cashew**, table for table. Nothing needs migrating:

- Everyone keeps their username and password. Hashes are the same PBKDF2 format in both apps.
- The Telegram reminders, the daily GitHub job and the backups keep running in Python against the same data.
- Ticking a meal records what it changed in the same format as the Python app, so a meal ticked in one app can be
  unticked in the other. The Streamlit app keeps working alongside while you switch over.
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
3. Under **Environment Variables** add `DATABASE_URL` (the Neon pooled string).
4. Deploy. The build runs `prisma generate` and `next build` by itself.

## How it's put together

```
prisma/schema.prisma      every table, money and kitchen, mapped exactly onto the Python names
src/lib/book.ts           balances, budgets, auto payments still due, the banner figure (a port of core/data.py)
src/lib/rules.ts          auto transaction dates (a port of auto_rules.py)
src/lib/momo.ts           reading MoMo, Telecel Cash and AT Money texts (a port of core/momo.py)
src/lib/auth.ts           passwords, lock-out after 5 tries, sessions in an httpOnly cookie
src/lib/load.ts           reads recent rows once per request, plus whole-history totals added up by the database;
                          adds due auto transactions first
src/lib/filters.ts        the Transactions filters, run as a database query
src/actions/*.ts          Server Actions: every change, checked with zod, signed-in only, in one transaction
src/app/(app)/…           the pages (server components) with small client components for forms
src/lib/kitchen/          the kitchen: units, the planner's arithmetic (allocate, reminders, shopping list),
                          the Kitchen class, the catalog: ports of meals/units.py, logic.py, data.py, catalog.py
src/actions/kitchen.ts    ticking, unticking, paying for bought food, shopping trips, fridge and pantry
src/proxy.ts              sends signed-out visitors to /login
```

Everything was checked against the Python app on the same database:
- money: balances, budgets, auto payments still due and the Home banner, to the cent, on several dates;
- the kitchen: how the stock is shared out across two weeks of meals, pots that would go to waste, every reminder,
  three shopping lists, each meal's status, the Today card, recipe costs, meal ideas and the budget guard;
- the actions: the same 20 ticks, payments, a shopping trip, fridge and pantry changes done by both apps on two
  copies of one database leave every kitchen table identical, and so do the starter recipes and the catalog.

## Tests

```bash
npm test                                         # logic: banner states, budgets, dates, MoMo, passwords
tests/e2e/setup.sh ../cashew postgresql://you@localhost/postgres   # a throwaway database built by the Python code
npx playwright test                              # the whole app in a browser, phone and desktop
```

To repeat the side-by-side checks with Python (on a throwaway database built by the Python app):

```bash
python3 tests/parity/seed.py $DB ../cashew && python3 tests/parity/seed_kitchen.py $DB ../cashew
python3 tests/parity/dump.py $DB ../cashew > money.json && python3 tests/parity/dump_kitchen.py $DB ../cashew > kitchen.json
DATABASE_URL=$DB PARITY_JSON=money.json KITCHEN_JSON=kitchen.json npm test
# the actions: two copies of the same database, one changed by each app, then compared
createdb -T cashew_dev kpy && createdb -T cashew_dev kts
python3 tests/parity/scenario.py $PG/kpy ../cashew && ACTIONS_DB=$PG/kts npx vitest run tests/unit/actions-parity.test.ts
python3 tests/parity/state.py $PG/kpy > a.json && python3 tests/parity/state.py $PG/kts > b.json && python3 tests/parity/compare.py a.json b.json
```

`src/lib/kitchen/catalog.json` comes from the Python catalog: `python3 tests/parity/export_catalog.py ../cashew`.
