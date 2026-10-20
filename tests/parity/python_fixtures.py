"""Writes tests/fixtures/python.json: what the Python Cashew says for MoMo texts, auto-transaction dates and a
password hash, so the TypeScript tests can check this app gives the same answers.

    python3 tests/parity/python_fixtures.py /path/to/cashew
"""
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else "../cashew")
sys.path.insert(0, str(Path(sys.argv[1] if len(sys.argv) > 1 else "../cashew") / "tests"))
from auto_rules import catch_up, occurrence  # noqa: E402
from core import auth, momo  # noqa: E402
from test_logic import MOMO_SAMPLES  # noqa: E402

texts = [t for t, _ in MOMO_SAMPLES] + [
    "", "hello, are you coming tonight?", "Your OTP is 123456",
    "Payment for GHS 15.00 to MTN DATA BUNDLE successful. Fee: GHS 0.00. Reference: n/a. Transaction ID: 7788991.",
    "You have bought airtime of GH¢ 10.00 for 0244123456. Your balance is GH¢ 40.00. 05-Oct-2026",
    "Withdrawal of GHS 400.00 from your wallet at agent SHOP 22. Fee charged: GHS 4.00. Balance: GHS 96.00. 3-Sep-26",
    "Deposit of GHS 1,000.00 received. Current Balance: GHS 1,050.00.",
    "Payment made for GHS 60.00 to Uber Ghana, reference: trip home. E-Levy charged: GHS 0.60. Trans. ID: UB.991.",
]
parsed = []
for t in texts:
    f = momo.parse(t)
    if f:
        f = {**f, "date": f["date"].isoformat() if f["date"] else None}
        f["describe"] = momo.describe({**f, "date": date.fromisoformat(f["date"]) if f["date"] else None})
    parsed.append({"text": t, "found": f})

starts = ["2026-01-31", "2024-02-29", "2026-10-19", "2025-12-31", "2026-03-30"]
dates = []
for s in starts:
    for freq in ("Weekly", "Every 2 weeks", "Monthly", "Yearly"):
        dates.append({"start": s, "freq": freq, "runs": [occurrence(date.fromisoformat(s), freq, n).isoformat()
                                                          for n in range(0, 26)],
                      "catch_up": catch_up(date.fromisoformat(s), freq, 0, date(2026, 10, 20))})

out = {"momo": parsed, "occurrence": dates, "password": {"plain": "Kenkey and fish",
                                                        "hash": auth.hash_password("Kenkey and fish")},
       "token_hash": auth.token_hash("abc123")}
Path(__file__).parent.parent.joinpath("fixtures", "python.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
print("wrote", len(parsed), "texts,", len(dates), "schedules")
