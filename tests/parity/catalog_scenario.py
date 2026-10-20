"""The starter lists and catalog, added by the Python app: python3 catalog_scenario.py <db-url> /path/to/cashew"""
import sys
from types import SimpleNamespace

sys.path.insert(0, sys.argv[2])
import psycopg2  # noqa: E402

from core import db  # noqa: E402
from meals import actions  # noqa: E402
from meals.starter import load_starter  # noqa: E402

url = sys.argv[1]
db.st = SimpleNamespace(secrets={"DATABASE_URL": url})
db.invalidate = actions.invalidate = actions.invalidate_kitchen = lambda: None
conn = psycopg2.connect(url)
with conn.cursor() as cur:  # something to add back
    cur.execute("DELETE FROM meals.recipes WHERE name IN ('Okra soup', 'Fufu')")
    cur.execute("DELETE FROM meals.pairings WHERE name LIKE 'Fufu%%'")
    cur.execute("UPDATE meals.ingredients SET section = NULL WHERE name = 'Yam'")
conn.commit()
cats = [r[0] for r in (lambda c: (c.execute("SELECT name FROM categories WHERE kind = 'Expense' ORDER BY id"), c.fetchall())[1])(conn.cursor())]
print(db.transact(lambda c: load_starter(c, cats)), actions.load_supplies_starter(), actions.load_catalog())
