"""Fill a Cashew database with a realistic family's money, then dump what the Python Book says about it."""
import json, sys, random
from datetime import date, timedelta
import psycopg2
sys.path.insert(0, sys.argv[2] if len(sys.argv) > 2 else "../cashew")
url = sys.argv[1]
c = psycopg2.connect(url); cur = c.cursor()
cur.execute("TRUNCATE transactions, budgets, recurring_rules, goal_contributions, goals RESTART IDENTITY CASCADE")
cur.execute("UPDATE accounts SET opening_balance = CASE name WHEN 'Cash' THEN 350 WHEN 'GCB' THEN 4200 WHEN 'Susu' THEN 1500 WHEN 'Fidelity - Emergency' THEN 3000 ELSE 0 END")
cur.execute("INSERT INTO accounts (name, opening_balance, spendable) VALUES ('MoMo', 120.5, TRUE) ON CONFLICT DO NOTHING")
rnd = random.Random(7)
today = date(2026, 10, 20)
cats = {"Expense": ["Meat/Fish", "Staples", "Dining Out", "Electricity", "Internet Data", "Work", "Other transport", "Medications", "Mother", "Charges"],
        "Income": ["Salary", "Additional income"]}
accts = ["Cash", "GCB", "MoMo", "Flip"]
members = ["Household", "Household", "Household", "Ama", "Kofi"]
for i in range(260):
    d = today - timedelta(days=rnd.randint(0, 150))
    r = rnd.random()
    if r < .08:
        cur.execute("INSERT INTO transactions (date,type,category,amount,note,member,account,created_by) VALUES (%s,'Income',%s,%s,%s,'Household',%s,'xan')",
                    (d, rnd.choice(cats["Income"]), round(rnd.uniform(200, 3000), 2), "", rnd.choice(["GCB", "MoMo"])))
    elif r < .16:
        a, b = rnd.sample(accts + ["Susu"], 2)
        cur.execute("INSERT INTO transactions (date,type,category,amount,note,member,account,to_account) VALUES (%s,'Transfer','Between accounts',%s,'','Household',%s,%s)",
                    (d, round(rnd.uniform(20, 600), 2), a, b))
    else:
        note = rnd.choice(["", "Makola", "Auto · Data bundle", "Fee · GCB to MoMo", "Shoprite", ""])
        cur.execute("INSERT INTO transactions (date,type,category,amount,note,member,account,created_by) VALUES (%s,'Expense',%s,%s,%s,%s,%s,%s)",
                    (d, rnd.choice(cats["Expense"]), round(rnd.uniform(2, 400), 2), note, rnd.choice(members), rnd.choice(accts + [""]), rnd.choice(["xan", "ama", None])))
cur.executemany("INSERT INTO budgets VALUES (%s,%s)", [("Food", 2500), ("Dining Out", 300), ("Utility", 800), ("Work", 150), ("Health", 50)])
rules = [
    ("Monthly Susu", "Transfer", 500, 2.5, "Susu", "GCB", "Susu", "Monthly", date(2026, 1, 19)),
    ("Data bundle", "Expense", 25, None, "Internet Data", "MoMo", None, "Weekly", date(2026, 9, 7)),
    ("Salary", "Income", 5200, None, "Salary", "GCB", None, "Monthly", date(2026, 1, 28)),
    ("Water bill", "Expense", 90, None, "Water for washing and bathing", "Cash", None, "Every 2 weeks", date(2026, 8, 5)),
    ("Move to Flip", "Transfer", 100, 1.0, "Between accounts", "GCB", "Flip", "Monthly", date(2026, 3, 31)),
    ("Rent saving", "Transfer", 300, None, "Between accounts", "Fidelity - Emergency", "GCB", "Monthly", date(2026, 2, 25)),
]
from auto_rules import catch_up, occurrence
for name, typ, amt, fee, cat, a, b, freq, start in rules:
    n = catch_up(start, freq, 0, today)
    cur.execute("INSERT INTO recurring_rules (name,type,amount,fee,category,account,to_account,member,note,frequency,start_date,next_date,run_count,end_date,active) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,'Household','',%s,%s,%s,%s,%s,TRUE)",
                (name, typ, amt, fee, cat, a, b, freq, start, occurrence(start, freq, n), n, date(2026, 10, 30) if name == "Water bill" else None))
cur.execute("INSERT INTO recurring_rules (name,type,amount,category,account,frequency,start_date,next_date,run_count,active) VALUES ('Paused gym','Expense',80,'Other transport','Cash','Monthly','2026-05-02','2026-08-02',3,FALSE)")
cur.execute("INSERT INTO goals (name,target,deadline) VALUES ('School fees',6000,'2027-01-10'),('Car',40000,NULL)")
cur.execute("INSERT INTO goal_contributions (goal_id,date,amount,note) VALUES (1,'2026-09-01',800,''),(1,'2026-10-01',650,'Ama'),(2,'2026-10-05',1200,'')")
c.commit()
