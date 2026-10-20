"""The same steps as tests/unit/actions-parity.test.ts, done by the Python app's own actions (meals/actions.py):
    python3 scenario.py <db-url> /path/to/cashew
Run it on one copy of a seeded database, and the TypeScript test on another, then compare with state.py."""
import sys
from datetime import date, timedelta
from types import SimpleNamespace

sys.path.insert(0, sys.argv[2] if len(sys.argv) > 2 else "../cashew")
import psycopg2  # noqa: E402

from core import db  # noqa: E402
from meals import actions  # noqa: E402

url = sys.argv[1]
db.st = SimpleNamespace(secrets={"DATABASE_URL": url})
db.invalidate = actions.invalidate = actions.invalidate_kitchen = lambda: None
actions._me = lambda: "ama"
conn = psycopg2.connect(url)
today = date.today()


def entries(day, slot):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM meals.plan WHERE day = %s AND slot = %s ORDER BY id", (today + timedelta(days=day), slot))
        return [r[0] for r in cur.fetchall()]


def slot_people():
    from meals.data import Kitchen, _load
    return Kitchen(_load(conn)).slot_people


def one(sql, params=()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()[0]


hh = slot_people()
actions.mark_meal(entries(0, "Breakfast"), hh)                      # eggs and milk
actions.mark_meal(entries(0, "Supper"), hh)                         # rice cooked, stew from the fridge
actions.mark_cooked(entries(1, "Lunch")[0], hh)                     # groundnut soup, cooked for one
actions.mark_from_fridge(entries(1, "Breakfast")[1], hh)            # the stew with waakye, from the fridge
actions.mark_bought(entries(0, "Lunch"), 28, "Cash", "Dining Out")  # kenkey and fried fish, one payment
actions.untick_meal(entries(0, "Supper"))
actions.mark_meal(entries(1, "Supper"), hh)                         # kokonte + a 14-portion palm nut soup
actions.mark_meal(entries(-1, "Supper"), hh)                        # waakye from yesterday, ticked late
actions.eat_portion(one("SELECT id FROM meals.fridge WHERE label = 'Light soup'"), 1)
actions.throw_away(one("SELECT id FROM meals.fridge WHERE label = 'Shito'"), 5.0)
ing = {n: i for n, i in [(r[1], r[0]) for r in (lambda c: (c.execute("SELECT id, name FROM meals.ingredients"), c.fetchall())[1])(conn.cursor())]}
actions.save_trip(today, "GCB", [
    {"ingredient_id": ing["Tomatoes"], "name": "Tomatoes", "qty": 10, "base": "pcs", "price": 18, "category": "Fruits/Veges"},
    {"ingredient_id": ing["Beef"], "name": "Beef", "qty": 1000, "base": "g", "price": 120, "category": "Meat/Fish"},
    {"ingredient_id": ing["Bleach"], "name": "Bleach", "qty": 1000, "base": "ml", "price": 25, "category": "Cleaning supplies"},
    {"ingredient_id": ing["Onions"], "name": "Onions", "qty": 5, "base": "pcs", "price": 0, "category": "Fruits/Veges"},
], "Makola")
actions.set_stock([(ing["Gari"], "ml", 1000), (ing["Palm oil"], "ml", 0)])
actions.adjust_stock(ing["Toilet roll"], "pcs", -1)
actions.untick_meal(entries(0, "Lunch"))                            # the payment comes back out
actions.remove_from_plan(entries(2, "Lunch"))
actions.set_meal_people(today + timedelta(days=3), "Supper", 5)
actions.set_plan_qty(entries(8, "Supper")[1], 6)
actions.add_to_fridge("Shito", 3, today + timedelta(days=10), None, "bowl")
actions.add_many([{"day": today + timedelta(days=10), "slot": "Lunch", "recipe_id": None, "ingredient_id": ing["Eggs"],
                   "qty": 2, "unit": "pcs"}, {"day": today + timedelta(days=10), "slot": "Lunch", "label": "Bofrot",
                                              "qty": 4, "unit": "piece", "price": 1.5}])
actions.mark_bought(entries(9, "Lunch"), 13, "GCB", "Dining Out")    # paid, and kept
print("python scenario done")
