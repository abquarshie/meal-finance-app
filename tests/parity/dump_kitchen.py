"""What the Python Kitchen says about the database: python3 dump_kitchen.py <db-url> /path/to/cashew > kitchen.json"""
import json
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, sys.argv[2] if len(sys.argv) > 2 else "../cashew")
import psycopg2  # noqa: E402

from core.data import Book, _load_frames  # noqa: E402
from meals import logic as ml  # noqa: E402
from meals.briefing import entry_status, guard, meal_state, planned_cost, supplies_cost, today_summary  # noqa: E402
from meals.data import Kitchen, _load  # noqa: E402
from meals.pages.shopping import ran_out_needs  # noqa: E402
from meals.units import fmt, fmt_stock, frac  # noqa: E402

conn = psycopg2.connect(sys.argv[1])
k = Kitchen(_load(conn))
b = Book(_load_frames(conn))
today = date.today()


def key(i, base):
    return f"{i}|{base}"


def D(x):
    return x.isoformat() if hasattr(x, "isoformat") else x


alloc = k.allocation(today)
out = {
    "today": today.isoformat(),
    "meals": {str(i): {"status": m["status"], "missing": [[a, b_, round(q, 6)] for a, b_, q in m["missing"]],
                       "needs": [[a, b_, round(q, 6)] for a, b_, q in m["needs"]]} for i, m in alloc["meals"].items()},
    "stock_after": {key(i, u): round(v, 6) for (i, u), v in alloc["stock_after"].items()},
    "pots": {str(i): {**{kk: D(v) for kk, v in p.items()}} for i, p in alloc["pots"].items()},
    "pot_warnings": [{"entry_id": p["entry_id"], "text": p["text"], "suggest": p["suggest"]} for p in k.pot_warnings(today)],
    "ran_short": {key(i, u): t for (i, u), t in k.ran_short(today).items()},
    "notes": {}, "shopping": {}, "states": {}, "summary": None,
    "recipe_cost": {str(r): list(ml.recipe_cost(r, k.recipes, k.items, k.prices, k.packs)) for r in k.recipes},
    "suggest": ml.suggest({i: r for i, r in k.recipes.items() if not r["bought"] and r["role"] not in ("starch", "side")},
                          k.items, k.pantry, k.fridge, [e for e in k.plan if e["day"] >= today - timedelta(days=21)],
                          today, packs=k.packs),
    "stocktake": k.stocktake(today), "food_low": k.food_low(), "supplies_low": k.supplies_low(),
    "planned_cost": list(planned_cost(k, today)), "supplies_cost": supplies_cost(k),
    "guard_food": guard(k, b, today, "food"), "guard_household": guard(k, b, today, "household"),
    "repeat": [{kk: D(v) for kk, v in e.items()} for e in ml.repeat_plan(k.plan, today, k.HORIZON)],
    "slot_people": k.slot_people, "household": k.household,
    "meal_people": {f"{d}|{s}": k.meal_people(today + timedelta(days=d), s) for d in range(0, 6) for s in ml.SLOTS},
    "waste_month": list(k.waste_this_month(today)),
    "from_leftovers": {f"{d}|{s}|{r}": ml.from_leftovers(k.open_entries(*k.window(today)), k.recipes, k.items, k.pantry,
                                                         k.fridge, k.slot_people[s], today, today + timedelta(days=d), s,
                                                         rid, k.packs)
                       for d, s, r in [(2, "Lunch", "Palm nut soup"), (3, "Lunch", "Tomato stew"), (9, "Supper", "Okra soup"),
                                       (0, "Lunch", "Groundnut soup")]
                       for rid in [next(i for i, x in k.recipes.items() if x["name"] == r)]},
}
for hour in (5, 8, 21):
    now = datetime(today.year, today.month, today.day, hour, 30)
    out["notes"][str(hour)] = k.notes(now)
for days in (7, 14, 2):
    start, end = today, today + timedelta(days=days - 1)
    entries = k.open_entries(start, end)
    needs = ml.shortfall(alloc, entries, names_for_entry=lambda e: f"{k.meal_name_of(e)} ({e['day']:%a})")
    for kk, t in ran_out_needs(k, today).items():
        needs.setdefault(kk, t)
    items = ml.shopping_list(needs, k.pantry, k.low_levels, k.prices, k.packs)
    items.sort(key=lambda r: (r["low"], k.names.get(r["ingredient_id"], "").lower()))
    out["shopping"][str(days)] = [{kk: (round(v, 6) if isinstance(v, float) else v) for kk, v in r.items()} for r in items]
for d in range(-7, 14):
    day = today + timedelta(days=d)
    for slot in ml.SLOTS:
        parts = [e for e in k.entries(day) if e["slot"] == slot]
        if parts:
            st, label = meal_state(k, parts, today)
            out["states"][f"{day}|{slot}"] = {"name": k.meal_name(parts), "state": [st, label],
                                              "each": [list(entry_status(k, e, today)) for e in parts]}
s = today_summary(k, datetime(today.year, today.month, today.day, 8, 0))
out["summary"] = {"meals": [list(m) for m in s["meals"]], "note": s["note"], "notes": s["notes"]}
out["fmt"] = [[q, base, usual, fmt(q, base, usual)] for q, base, usual in
              [(1500, "g", "kg"), (750, "ml", "cup"), (3, "pcs", None), (0.125, "g", None), (2.5, "bunch", None),
               (1250.4, "ml", "l"), (37.5, "ml", "tbsp"), (1, "finger", None), (0.333, "ml", "tsp")]]
out["frac"] = [[x, frac(x)] for x in (1.5, 0.25, 3, 1.2, 2 / 3, 1234.5, 0.004, 10.75)]
out["stock_fmt"] = [[k.names[i], fmt_stock(q, u, k.pack(i), k.unit_of.get(i))] for (i, u), q in sorted(k.pantry.items())]


def clean(x):  # pandas leaves NaN for an empty unit or price; that's None (null) here
    if isinstance(x, float) and x != x:
        return None
    if isinstance(x, dict):
        return {kk: clean(v) for kk, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    return x


print(json.dumps(clean(out), default=str, indent=1))
