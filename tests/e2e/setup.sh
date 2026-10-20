#!/usr/bin/env bash
# Builds the throwaway database the browser tests use, with the Python app's own code:
#   tests/e2e/setup.sh /path/to/cashew postgresql://user@host/postgres
set -euo pipefail
CASHEW=${1:-../cashew}
ADMIN=${2:-postgresql://cashew@localhost:5433/postgres}
DB=cashew_e2e
psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"
URL="${ADMIN%/*}/$DB"
python3 - "$CASHEW" "$URL" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
import psycopg2
from core.schema import ensure_schema
from core.auth import hash_password
conn = psycopg2.connect(sys.argv[2])
ensure_schema(conn)
cur = conn.cursor()
cur.execute("INSERT INTO users (username, display_name, password_hash, is_owner) VALUES ('ama', 'Ama', %s, TRUE)",
            (hash_password("Kenkey and fish"),))
conn.commit()
PY
python3 "$(dirname "$0")/../parity/seed.py" "$URL" "$CASHEW"
echo "$URL"
