"""Compares two state.py dumps by value (250.0 and 250 are the same number): python3 compare.py a.json b.json"""
import json
import sys

a, b = (json.load(open(p)) for p in sys.argv[1:3])
bad = 0
for table in a:
    if a[table] != b[table]:
        bad += 1
        print(f"{table}: differs")
        for x, y in zip(a[table], b[table]):
            if x != y:
                print("  python:", x, "\n  next:  ", y)
        if len(a[table]) != len(b[table]):
            print(f"  {len(a[table])} rows vs {len(b[table])}")
print("SAME" if not bad else f"{bad} tables differ", "-", {t: len(v) for t, v in a.items()})
sys.exit(1 if bad else 0)
