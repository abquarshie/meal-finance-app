"use client";
import { useEffect, useState } from "react";
import { addCategory, categoryUses, deleteCategory, editCategory, movePastEntries, renameGroup } from "@/actions/settings";
import { Confirm } from "@/components/Sheet";
import { Empty, Msg } from "@/components/ui";
import { useAct } from "@/components/useAct";
import { KINDS, type Kind } from "@/lib/money";
import { entries } from "@/lib/words";

type C = { name: string; group: string; kind: Kind };
type Action = "Add" | "Edit" | "Rename a group" | "Delete" | "Move past entries";
const NEW = "New group…";
const lc = (s: string) => s.trim().toLowerCase();

export function CategoryForms({ categories, groups, used }: { categories: C[]; groups: string[]; used: Record<string, number> }) {
  const [action, setAction] = useState<Action>("Add");
  const label = (n: string) => {
    const c = categories.find((x) => x.name === n);
    return c && c.group !== n ? `${c.group} › ${n}` : n;
  };
  // a budget is set on a group or a category by name, so a category can't share its name with another group
  const groupClash = (name: string, group: string) => {
    const other = groups.find((g) => lc(g) === lc(name));
    return other !== undefined && lc(other) !== lc(group);
  };
  const p = { categories, groups, used, label, groupClash };
  return (
    <div className="card form">
      <div className="chips" role="group" aria-label="Action">
        {(["Add", "Edit", "Rename a group", "Delete", "Move past entries"] as Action[]).map((x) => (
          <button key={x} type="button" className="chip" aria-pressed={x === action} onClick={() => setAction(x)}>{x}</button>
        ))}
      </div>
      {action === "Add" ? <Add {...p} /> : null}
      {action === "Edit" ? <Edit {...p} /> : null}
      {action === "Rename a group" ? <Rename {...p} /> : null}
      {action === "Delete" ? <Delete {...p} /> : null}
      {action === "Move past entries" ? <Move {...p} /> : null}
    </div>
  );
}

type P = { categories: C[]; groups: string[]; used: Record<string, number>; label: (n: string) => string;
  groupClash: (name: string, group: string) => boolean };

function Add({ categories, groups, groupClash }: P) {
  const [busy, act] = useAct();
  const [name, setName] = useState("");
  const [group, setGroup] = useState(groups[0] ?? NEW);
  const [newGroup, setNewGroup] = useState("");
  const [kind, setKind] = useState<Kind>("Expense");
  const finalGroup = group === NEW ? newGroup.trim() : group;
  const names = categories.map((c) => lc(c.name));
  let problem: string | null = null;
  if (group === NEW && groups.some((g) => lc(g) === lc(newGroup))) problem = "That group already exists. Pick it from the list instead.";
  else if (names.includes(lc(name))) problem = `'${name.trim()}' already exists.`;
  else if (finalGroup && name.trim() && groupClash(name, finalGroup)) problem = `'${name.trim()}' is the name of a group, so a budget couldn't tell them apart. Pick another name.`;
  else if (group === NEW && names.includes(lc(newGroup)) && lc(newGroup) !== lc(name)) problem = `'${newGroup.trim()}' is already a category name. Pick another group name.`;
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => addCategory(name, finalGroup, group === NEW ? kind : null), () => { setName(""); setNewGroup(""); }); }}>
      <div className="row2">
        <label className="field"><span>Category name</span><input className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Group</span>
          <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>{[...groups, NEW].map((g) => <option key={g}>{g}</option>)}</select>
        </label>
      </div>
      {group === NEW ? (
        <div className="row2">
          <label className="field"><span>New group name</span><input className="input" maxLength={60} placeholder="e.g. School" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} /></label>
          <label className="field"><span>Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          </label>
        </div>
      ) : null}
      {problem ? <Msg>{problem}</Msg> : null}
      <div><button className="btn primary" disabled={!name.trim() || !finalGroup || Boolean(problem) || busy}>Add category</button></div>
    </form>
  );
}

function Edit({ categories, groups, used, label }: P) {
  const [pick, setPick] = useState(categories[0]?.name ?? "");
  const c = categories.find((x) => x.name === pick) ?? categories[0];
  if (!c) return <Empty>No categories yet.</Empty>;
  return (
    <div className="form">
      <select className="input" aria-label="Category" value={c.name} onChange={(e) => setPick(e.target.value)}>
        {categories.map((x) => <option key={x.name} value={x.name}>{label(x.name)}</option>)}
      </select>
      <EditOne key={c.name} c={c} groups={groups} used={used[c.name] ?? 0} onRenamed={setPick}
        others={categories.filter((x) => x.name !== c.name).map((x) => lc(x.name))} />
    </div>
  );
}

function EditOne({ c, groups, used, others, onRenamed }: { c: C; groups: string[]; used: number; others: string[]; onRenamed: (n: string) => void }) {
  const [busy, act] = useAct();
  const [name, setName] = useState(c.name);
  const [group, setGroup] = useState(c.group);
  const n = name.trim();
  const clash = others.includes(lc(n));
  const groupClash = n !== c.name && groups.some((g) => lc(g) === lc(n) && lc(g) !== lc(group));
  const changed = n !== c.name || group !== c.group;
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => editCategory(c.name, n, group), () => onRenamed(n)); }}>
      <div className="row2">
        <label className="field"><span>Name</span><input className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Group</span>
          <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>{groups.map((g) => <option key={g}>{g}</option>)}</select>
        </label>
      </div>
      {!n ? <Msg>The name can&apos;t be empty.</Msg> : clash ? <Msg>&apos;{n}&apos; already exists.</Msg>
        : groupClash ? <Msg>&apos;{n}&apos; is the name of a group, so a budget couldn&apos;t tell them apart.</Msg> : null}
      {n && n !== c.name && used ? <Msg tone="hint">{entries(used)} will be renamed too.</Msg> : null}
      <div><button className="btn primary" disabled={!changed || !n || clash || groupClash || busy}>Save changes</button></div>
    </form>
  );
}

function Rename({ categories, groups }: P) {
  const [busy, act] = useAct();
  const [pick, setPick] = useState(groups[0] ?? "");
  const g = groups.includes(pick) ? pick : groups[0] ?? "";
  const [name, setName] = useState(g);
  useEffect(() => setName(g), [g]);
  const n = name.trim();
  const clash = n !== g && groups.some((x) => lc(x) === lc(n));
  const outside = n !== g && categories.some((c) => c.group !== g && lc(c.name) === lc(n));
  if (!groups.length) return <Empty>No groups yet.</Empty>;
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => renameGroup(g, n), () => setPick(n)); }}>
      <select className="input" aria-label="Group" value={g} onChange={(e) => setPick(e.target.value)}>{groups.map((x) => <option key={x}>{x}</option>)}</select>
      <label className="field"><span>New name</span><input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
      {clash ? <Msg>A group called &apos;{n}&apos; already exists.</Msg> : outside ? <Msg>&apos;{n}&apos; is a category in another group, so a budget couldn&apos;t tell them apart.</Msg> : null}
      <div><button className="btn primary" disabled={!n || n === g || clash || outside || busy}>Rename group</button></div>
    </form>
  );
}

function Delete({ categories, used, label }: P) {
  const [busy, act] = useAct();
  const [pick, setPick] = useState(categories[0]?.name ?? "");
  const c = categories.find((x) => x.name === pick) ?? categories[0];
  const [uses, setUses] = useState<Record<string, number> | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    let live = true;
    setUses(null);
    setMoveTo("");
    if (c) categoryUses(c.name).then((u) => live && setUses(u));
    return () => { live = false; };
  }, [c?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return <Empty>No categories yet.</Empty>;
  const n = used[c.name] ?? 0;
  const needsMove = Boolean(uses && Object.keys(uses).length);
  const sameKind = categories.filter((x) => x.kind === c.kind && x.name !== c.name);
  const list = uses ? Object.entries(uses).map(([what, k]) => `${k} ${what}`).join(", ") : "";
  return (
    <div className="form">
      <select className="input" aria-label="Category" value={c.name} onChange={(e) => setPick(e.target.value)}>
        {categories.map((x) => <option key={x.name} value={x.name}>{label(x.name)}</option>)}
      </select>
      {n ? <Msg tone="hint">{entries(n)} use it. They keep the name, or you can move them first with Move past entries.</Msg> : null}
      {needsMove ? (
        <>
          <Msg tone="warn">{c.name} is still used by {list}. Pick where they go instead.</Msg>
          <select className="input" aria-label="Move them to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">Choose a category</option>
            {sameKind.map((x) => <option key={x.name} value={x.name}>{label(x.name)}</option>)}
          </select>
        </>
      ) : null}
      <div><button type="button" className="btn danger" disabled={uses === null || (needsMove && !moveTo)} onClick={() => setAsking(true)}>Delete category</button></div>
      <Confirm open={asking} busy={busy} onCancel={() => setAsking(false)}
        message={`Delete the category ${c.name}?${needsMove ? ` Its ${Object.keys(uses!).join(", ")} move to ${moveTo}.` : ""}`}
        onConfirm={() => act(() => deleteCategory(c.name, moveTo || null), () => setAsking(false))} />
    </div>
  );
}

function Move({ categories, used, label }: P) {
  const [busy, act] = useAct();
  const usedCats = Object.keys(used).sort();
  const [from, setFrom] = useState(usedCats[0] ?? "");
  const [to, setTo] = useState(categories[0]?.name ?? "");
  const [asking, setAsking] = useState(false);
  if (!usedCats.length) return <Empty>There are no past entries to move yet.</Empty>;
  const f = usedCats.includes(from) ? from : usedCats[0];
  const n = used[f] ?? 0;
  return (
    <div className="form">
      <p className="caption" style={{ margin: 0 }}>Useful for entries made before a category existed, like an old &quot;Food &amp; Dining&quot;.</p>
      <div className="row2">
        <label className="field"><span>From</span>
          <select className="input" value={f} onChange={(e) => setFrom(e.target.value)}>{usedCats.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="field"><span>To</span>
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{categories.map((x) => <option key={x.name} value={x.name}>{label(x.name)}</option>)}</select>
        </label>
      </div>
      {f === to ? <Msg>Pick two different categories.</Msg> : null}
      <div><button type="button" className="btn primary" disabled={f === to} onClick={() => setAsking(true)}>Move {entries(n)}</button></div>
      <Confirm open={asking} busy={busy} button="Move" onCancel={() => setAsking(false)}
        message={`Move all ${entries(n)} from ${f} to ${to}?`} onConfirm={() => act(() => movePastEntries(f, to), () => setAsking(false))} />
    </div>
  );
}
