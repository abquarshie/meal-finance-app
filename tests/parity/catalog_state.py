import json
import sys

import psycopg2

conn = psycopg2.connect(sys.argv[1])
Q = {
    "ingredients": "SELECT name, unit, category, low_level::float8, pack_name, pack_size::float8, kind, loose, alt_units::text, section "
                   "FROM meals.ingredients ORDER BY name",
    "recipes": "SELECT name, portions::float8, keeps_days, prep_note, prep_hours, method, role, bought FROM meals.recipes ORDER BY name",
    "items": "SELECT r.name, i.name, ri.qty::float8, ri.unit FROM meals.recipe_items ri JOIN meals.recipes r ON r.id = ri.recipe_id "
             "JOIN meals.ingredients i ON i.id = ri.ingredient_id ORDER BY 1, 2, 3",
    "pairings": "SELECT p.name, r.name, i.name, pi.qty::float8, pi.unit FROM meals.pairing_items pi JOIN meals.pairings p ON "
                "p.id = pi.pairing_id LEFT JOIN meals.recipes r ON r.id = pi.recipe_id LEFT JOIN meals.ingredients i ON "
                "i.id = pi.ingredient_id ORDER BY 1, 2, 3",
    "categories": "SELECT name, group_name, kind FROM categories ORDER BY name",
}
out = {}
with conn.cursor() as cur:
    for k, sql in Q.items():
        cur.execute(sql)
        out[k] = [list(r) for r in cur.fetchall()]
for row in out["ingredients"]:  # the same JSON, however the keys are spaced
    row[8] = json.loads(row[8]) if row[8] else None
print(json.dumps(out, indent=1, default=str))
