"""A realistic two weeks in the kitchen, on top of the money sample (seed.py) and the Ghanaian catalog that
ensure_schema() adds:  python3 seed_kitchen.py <db-url> /path/to/cashew"""
import json
import random
import sys
from datetime import date, timedelta

import psycopg2

sys.path.insert(0, sys.argv[2] if len(sys.argv) > 2 else "../cashew")
url = sys.argv[1]
c = psycopg2.connect(url)
cur = c.cursor()
cur.execute("TRUNCATE meals.plan, meals.fridge, meals.pantry, meals.prices, meals.trips, meals.trip_items, meals.waste, "
            "meals.bought RESTART IDENTITY CASCADE")
today = date.today()
cur.execute("SELECT lower(name), id, unit FROM meals.ingredients")
ing = {n: (i, u) for n, i, u in cur.fetchall()}
cur.execute("SELECT lower(name), id FROM meals.recipes")
rec = dict(cur.fetchall())


def I(name):
    return ing[name.lower()][0]


for k, v in {"meals_household": "3", "meals_people_breakfast": "3", "meals_people_lunch": "1",
             "meals_people_supper": "2"}.items():
    cur.execute("INSERT INTO app_meta (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                (k, v))

# a bought dish and a household supply
cur.execute("INSERT INTO meals.recipes (name, bought, price, count_unit, shop, category, portions, keeps_days) "
            "VALUES ('Kenkey', TRUE, 5, 'ball', 'Auntie Ama', 'Dining Out', 1, 1) ON CONFLICT (name) DO NOTHING")
cur.execute("SELECT id FROM meals.recipes WHERE name = 'Kenkey'")
rec["kenkey"] = cur.fetchone()[0]
cur.execute("INSERT INTO categories (name, group_name, kind) VALUES ('Cleaning supplies', 'Household', 'Expense') "
            "ON CONFLICT DO NOTHING")
for name, unit, low, pack, size in [("Bleach", "ml", 250, "bottle", 1000), ("Toilet roll", "pcs", 4, "pack", 10),
                                    ("Bar soap for washing", "pcs", 1, None, None)]:
    cur.execute("INSERT INTO meals.ingredients (name, unit, category, low_level, pack_name, pack_size, kind) VALUES "
                "(%s, %s, 'Cleaning supplies', %s, %s, %s, 'household') ON CONFLICT (name) DO NOTHING RETURNING id",
                (name, unit, low, pack, size))
cur.execute("SELECT lower(name), id, unit FROM meals.ingredients")
ing = {n: (i, u) for n, i, u in cur.fetchall()}

# warning levels on a few staples (base units)
for name, low in [("Gari", 500), ("Onions", 3), ("Palm oil", 250), ("Kokonte powder", 750), ("Eggs", 6)]:
    cur.execute("UPDATE meals.ingredients SET low_level = %s WHERE id = %s", (low, I(name)))

# what's in the pantry (base units: cups and tbsp are ml)
stock = [("Kokonte powder", "ml", 1500), ("Palm nut cream", "g", 800), ("Beef", "g", 600), ("Tomatoes", "pcs", 9),
         ("Onions", "pcs", 2), ("Pepper", "pcs", 12), ("Garden eggs", "pcs", 4), ("Smoked mackerel", "pcs", 1),
         ("Eggs", "pcs", 14), ("Gari", "ml", 375), ("A55 Gold jasmine rice (5kg)", "ml", 2500),
         ("Black-eyed peas (beans)", "ml", 250), ("Vegetable oil", "ml", 900), ("Tomato paste", "ml", 30),
         ("Ginger", "ml", 45), ("Garlic", "clove", 10), ("Sankofa Stew & Gravy", "ml", 20),
         ("Groundnut paste", "g", 120), ("Hard chicken", "g", 400), ("Plantain", "finger", 7),
         ("Kontomire", "bunch", 1), ("Palm oil", "ml", 200), ("Yam", "slice", 6),
         ("Lele Gold evaporated milk (400g)", "ml", 120), ("Bleach", "ml", 1500), ("Toilet roll", "pcs", 3),
         # the recipe asks for grams but this is kept in cups: can't be taken off
         ("Fermented corn dough", "g", 500)]
for name, base, q in stock:
    cur.execute("INSERT INTO meals.pantry (ingredient_id, unit, qty) VALUES (%s, %s, %s)", (I(name), base, q))

# prices from two trips, so price trends and cheapest shops have something to say
rnd = random.Random(3)
for t, (d, shop) in enumerate([(today - timedelta(days=40), "Makola"), (today - timedelta(days=9), "Shoprite")], 1):
    cur.execute("INSERT INTO meals.trips (date, account, total, shop) VALUES (%s, 'Cash', 0, %s) RETURNING id", (d, shop))
    trip = cur.fetchone()[0]
    total = 0
    for name, base, q, price in [("Tomatoes", "pcs", 10, 15), ("Onions", "pcs", 10, 12), ("Beef", "g", 1000, 95),
                                 ("Palm nut cream", "g", 800, 38), ("Kokonte powder", "ml", 2500, 30),
                                 ("Eggs", "pcs", 30, 70), ("Gari", "ml", 2000, 25), ("Bleach", "ml", 1000, 22),
                                 ("Pepper", "pcs", 20, 8), ("Hard chicken", "g", 1000, 75)]:
        p = round(price * (1 + (0.35 if t == 2 and name in ("Tomatoes", "Beef") else rnd.uniform(-.05, .05))), 2)
        total += p
        cur.execute("INSERT INTO meals.trip_items (trip_id, ingredient_id, name, qty, unit, price, category) VALUES "
                    "(%s, %s, %s, %s, %s, %s, 'Staples')", (trip, I(name), name, q, base, p))
        cur.execute("INSERT INTO meals.prices (ingredient_id, unit, per_unit) VALUES (%s, %s, %s) ON CONFLICT "
                    "(ingredient_id, unit) DO UPDATE SET per_unit = EXCLUDED.per_unit", (I(name), base, p / q))
    cur.execute("UPDATE meals.trips SET total = %s WHERE id = %s", (round(total, 2), trip))

# leftovers in the fridge
for r, label, portions, cooked, eat_by in [("tomato stew", "Tomato stew", 5, -3, 4), ("light soup", "Light soup", 2, -6, 0),
                                           (None, "Shito", 1, -10, -1), ("groundnut soup", "Groundnut soup", 1, -2, 1)]:
    cur.execute("INSERT INTO meals.fridge (recipe_id, label, portions, cooked_on, eat_by) VALUES (%s, %s, %s, %s, %s)",
                (rec.get(r) if r else None, label, portions, today + timedelta(days=cooked), today + timedelta(days=eat_by)))
cur.execute("INSERT INTO meals.waste (date, label, amount, unit, value) VALUES (%s, 'Okra soup', 3, 'portion', 18.5)",
            (today - timedelta(days=2),))


def plan(day, slot, recipe=None, item=None, qty=1, unit=None, label=None, price=None, people=None, status="planned",
         undo=None):
    cur.execute("INSERT INTO meals.plan (day, slot, recipe_id, ingredient_id, qty, unit, label, price, people, status, undo) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (today + timedelta(days=day), slot, rec[recipe.lower()] if recipe else None, I(item) if item else None,
                 qty, unit, label, price, people, status, json.dumps(undo) if undo else None))
    return cur.fetchone()[0]


# last week: some meals ticked (two of them ran short), one never ticked
plan(-7, "Supper", "Kokonte", qty=2, status="cooked")
plan(-7, "Supper", "Palm nut soup", qty=14, status="cooked")
plan(-3, "Lunch", "Groundnut soup", qty=14, status="cooked",
     undo={"pantry": [], "short": [[I("Groundnut paste"), "g", 380], [I("Sankofa Chicken"), "ml", 15]]})
plan(-2, "Breakfast", "Banku", qty=2, status="cooked", undo={"pantry": [], "short": [[I("Fermented corn dough"), "ml", 375]]})
plan(-1, "Supper", "Waakye", qty=2)  # never ticked
plan(-6, "Breakfast", item="Eggs", qty=6, unit="pcs", status="done")
plan(-7, "Lunch", "Light soup", qty=14)
plan(-5, "Supper", "Plain rice", qty=2, status="cooked")
plan(-5, "Supper", "Tomato stew", qty=14, status="cooked")

# the next two weeks
plan(0, "Breakfast", item="Eggs", qty=6, unit="pcs")
plan(0, "Breakfast", item="Lele Gold evaporated milk (400g)", qty=2, unit="tbsp")
plan(0, "Lunch", "Kenkey", qty=1)
plan(0, "Lunch", label="Fried fish", qty=2, unit="piece", price=12)
plan(0, "Supper", "Plain rice", qty=2)
plan(0, "Supper", "Tomato stew", qty=2)
plan(1, "Breakfast", "Waakye", qty=3)
plan(1, "Breakfast", "Tomato stew", qty=3)
plan(1, "Breakfast", item="Gari", qty=1.5, unit="cup")
plan(1, "Lunch", "Groundnut soup", qty=1)
plan(1, "Supper", "Kokonte", qty=2)
plan(1, "Supper", "Palm nut soup", qty=14)    # a big pot, eaten through the week
for d in (2, 4, 6):
    plan(d, "Supper", "Kokonte", qty=2)
    plan(d, "Supper", "Palm nut soup", qty=2)
plan(2, "Lunch", "Boiled yam", qty=1)
plan(2, "Lunch", "Kontomire stew", qty=14)   # cooked for one, never finished: a pot that goes to waste
plan(3, "Supper", "Fufu", qty=4, people=4)    # guests
plan(3, "Supper", "Light soup", qty=14, people=4)
plan(5, "Breakfast", item="Eggs", qty=1, unit="crate")
plan(8, "Supper", "Banku", qty=2)
plan(8, "Supper", "Okra soup", qty=14)
plan(9, "Lunch", "Kenkey", qty=2, price=6)
plan(12, "Supper", "Plain rice", qty=2)
plan(12, "Supper", "Groundnut soup", qty=14)
# a small household budget, so the guard has something to say
cur.execute("INSERT INTO budgets (category, monthly_limit) VALUES ('Household', 30) "
            "ON CONFLICT (category) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit")
cur.execute("INSERT INTO transactions (date, type, category, amount, note, member, account) VALUES "
            "(%s, 'Expense', 'Cleaning supplies', 26, 'Bleach', 'Household', 'Cash')", (today,))
c.commit()
print("kitchen seeded")
