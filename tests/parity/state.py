"""Everything the kitchen actions can change, as plain JSON for comparing two databases:
    python3 state.py <db-url> <transactions id it started after> > state.json"""
import json
import sys

import psycopg2

conn = psycopg2.connect(sys.argv[1])
QUERIES = {
    "pantry": "SELECT ingredient_id, unit, round(qty, 3)::float8 FROM meals.pantry ORDER BY 1, 2",
    "fridge": "SELECT id, recipe_id, label, round(portions, 2)::float8, cooked_on::text, eat_by::text, plan_id, created_by, unit "
              "FROM meals.fridge ORDER BY id",
    "plan": "SELECT id, day::text, slot, recipe_id, ingredient_id, round(qty, 3)::float8, unit, status, done_by, label, "
            "price::float8, people::float8, undo FROM meals.plan ORDER BY id",
    "tx": "SELECT date::text, type, category, amount::float8, note, member, account, to_account, created_by FROM transactions "
          f"WHERE id > {int(sys.argv[2]) if len(sys.argv) > 2 else 0} ORDER BY id",
    "bought": "SELECT date::text, plan_id, recipe_id, label, qty::float8, unit, paid::float8, shop FROM meals.bought ORDER BY id",
    "recipe_prices": "SELECT name, price::float8 FROM meals.recipes WHERE bought ORDER BY name",
    "waste": "SELECT date::text, label, amount::float8, unit, value::float8, recipe_id, created_by FROM meals.waste ORDER BY id",
    "trips": "SELECT date::text, account, total::float8, created_by, shop FROM meals.trips ORDER BY id",
    "trip_items": "SELECT trip_id, ingredient_id, name, qty::float8, unit, price::float8, category FROM meals.trip_items ORDER BY id",
    "prices": "SELECT ingredient_id, unit, round(per_unit, 5)::float8 FROM meals.prices ORDER BY 1, 2",
}
out = {}
with conn.cursor() as cur:
    for name, sql in QUERIES.items():
        cur.execute(sql)
        out[name] = [list(r) for r in cur.fetchall()]
print(json.dumps(out, indent=1, default=str))
