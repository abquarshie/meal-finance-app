import json, sys
from datetime import date
import pandas as pd
sys.path.insert(0, sys.argv[2] if len(sys.argv) > 2 else "../cashew")
import psycopg2
from core.data import Book, _load_frames
conn = psycopg2.connect(sys.argv[1])
b = Book(_load_frames(conn))
out = {"balances": {k: round(float(v), 2) for k, v in b.balances().items()}, "members": b.members(),
       "months": [str(p) for p in b.months()], "unassigned": b.unassigned, "days": {}}
for kind in ("Expense", "Income", "Transfer"):
    out[f"top_{kind}"] = b.top_categories(kind)
    out[f"acct_{kind}"] = b.default_account(kind)
out["acct_to"] = b.default_account("Transfer", "to_account")
out["last"] = {c: b.last_amount("Expense", c) for c in ("Staples", "Dining Out", "Mother", "Nope")}
for d in ["2026-10-01", "2026-10-19", "2026-10-20", "2026-10-31", "2026-11-03"]:
    t = date.fromisoformat(d); p = pd.Period(t, "M")
    sp = b.spending_power(t)
    sp["committed_items"] = [{"name": i["name"], "date": str(i["date"]), "amount": round(i["amount"], 2)} for i in sp["committed_items"]]
    out["days"][d] = {"power": sp, "status": [{**s, "pct": round(s["pct"], 6)} for s in b.budget_status(p)],
                      "total": b.budget_total(p), "totals": list(b.month_totals(p)), "upto": list(b.month_totals(p - 1, upto_day=t.day))}
print(json.dumps(out, default=float, indent=1, sort_keys=True))
