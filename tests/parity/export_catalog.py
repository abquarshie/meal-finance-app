"""Writes src/lib/kitchen/catalog.json from the Python app's catalog and starter lists, so both apps add the same
Ghanaian kitchen catalog, soup and stew templates, pairings, starter dishes and household supplies:
    python3 tests/parity/export_catalog.py /path/to/cashew"""
import json
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else "../cashew")
from meals import catalog, starter  # noqa: E402

out = {
    "flag": catalog.FLAG,
    "sections": catalog.SECTIONS,
    "catalog": [list(r) for r in catalog.CATALOG],
    "templates": [list(r) for r in catalog.TEMPLATES],
    "pairings": [[n, d, list(s) if s else None] for n, d, s in catalog.PAIRINGS],
    "equiv": catalog.EQUIV,
    "starterIngredients": [list(r) for r in starter.INGREDIENTS],
    "starterRecipes": [list(r) for r in starter.RECIPES],
    "supplies": [list(r) for r in starter.SUPPLIES],
}
p = Path(__file__).resolve().parents[2] / "src" / "lib" / "kitchen" / "catalog.json"
p.write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("wrote", p, len(out["catalog"]), "items")
