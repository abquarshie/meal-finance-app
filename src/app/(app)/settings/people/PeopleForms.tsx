"use client";
import { useState } from "react";
import { changeMyPassword, makeInviteCode, removePerson, resetPassword, saveName, setOwner } from "@/actions/people";
import { Confirm } from "@/components/Sheet";
import { Empty, Msg, Section } from "@/components/ui";
import { useAct } from "@/components/useAct";
import { passwordProblem, passwordStrength } from "@/lib/passwords";

type Me = { id: number; username: string; name: string; isOwner: boolean };
type Person = { id: number; name: string; username: string; isOwner: boolean; lastLogin: string };

export function MyAccount({ me }: { me: Me }) {
  const [busy, act] = useAct();
  const [name, setName] = useState(me.name);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const problem = next ? passwordProblem(next, me.username) : null;
  const mismatch = Boolean(again) && again !== next;
  const ready = Boolean(current && next && again) && !problem && !mismatch;
  return (
    <div className="stack">
      <form className="card form" onSubmit={(e) => { e.preventDefault(); act(() => saveName(name)); }}>
        <Section title="Your name" />
        <label className="field"><span>Name shown on your entries</span>
          <input className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div><button className="btn" disabled={!name.trim() || name.trim() === me.name || busy}>Save name</button></div>
      </form>
      <form className="card form" onSubmit={(e) => { e.preventDefault(); act(() => changeMyPassword(current, next), () => { setCurrent(""); setNext(""); setAgain(""); }); }}>
        <Section title="Change your password" />
        <label className="field"><span>Current password</span>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span>New password</span>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          {problem ? <Msg>{problem}</Msg> : next ? <Msg tone="ok">Strength: {passwordStrength(next)}</Msg> : null}
        </label>
        <label className="field"><span>Type the new password again</span>
          <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          {mismatch ? <Msg>The two passwords don&apos;t match.</Msg> : null}
        </label>
        <div><button className="btn primary" disabled={!ready || busy}>{busy ? "Saving…" : "Change password"}</button></div>
      </form>
    </div>
  );
}

export function OwnerTools({ me, code, people, backup }: {
  me: number; code: string; people: Person[]; backup: { tone: "ok" | "warn" | "hint"; text: string };
}) {
  const [busy, act] = useAct();
  const others = people.filter((p) => p.id !== me);
  const [pick, setPick] = useState(others[0]?.id ?? 0);
  const who = others.find((p) => p.id === pick) ?? others[0];
  const [pw, setPw] = useState("");
  const [asking, setAsking] = useState(false);
  const problem = pw && who ? passwordProblem(pw, who.username) : null;
  return (
    <div className="stack">
      <div className="card form">
        <Section title="Invite your family" />
        <p style={{ margin: 0 }}>Share the app link and this code. They choose <b>I have an invite code</b> on the sign-in screen.</p>
        <code style={{ fontSize: "1.2rem", fontWeight: 800, letterSpacing: ".06em" }}>{code}</code>
        <div><button type="button" className="btn" disabled={busy} title="The old code stops working. Accounts already created aren't affected."
          onClick={() => act(() => makeInviteCode())}>Make a new code</button></div>
      </div>
      <div className="card form">
        <Section title="Backups" />
        <Msg tone={backup.tone}>{backup.text}</Msg>
      </div>
      <div className="card form">
        <Section title="People" aside={`${people.length} account${people.length === 1 ? "" : "s"}`} />
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Last signed in</th></tr></thead>
          <tbody>{people.map((p) => <tr key={p.id}><td>{p.name}</td><td>@{p.username}</td><td>{p.isOwner ? "Owner" : "Member"}</td><td>{p.lastLogin}</td></tr>)}</tbody>
        </table></div>
        {!who ? <Empty>Nobody else has joined yet.</Empty> : (
          <>
            <select className="input" aria-label="Person" value={who.id} onChange={(e) => { setPick(Number(e.target.value)); setPw(""); }}>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name} (@{p.username})</option>)}
            </select>
            <label className="field"><span>New password for {who.name}</span>
              <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              {problem ? <Msg>{problem}</Msg> : <Msg tone="hint">For when someone forgets theirs. They&apos;re signed out on every device.</Msg>}
            </label>
            <div className="btns">
              <button type="button" className="btn primary" disabled={!pw || Boolean(problem) || busy} onClick={() => act(() => resetPassword(who.id, pw), () => setPw(""))}>Set password</button>
              <button type="button" className="btn" disabled={busy} onClick={() => act(() => setOwner(who.id, !who.isOwner))}>
                {who.isOwner ? "Make them a member" : "Make them an owner"}</button>
              <button type="button" className="btn danger" onClick={() => setAsking(true)}>Remove {who.name}</button>
            </div>
            <Msg tone="hint">Owners can invite people, reset passwords and remove accounts.</Msg>
            <Confirm open={asking} busy={busy} button="Remove" onCancel={() => setAsking(false)}
              message={`Remove ${who.name}'s account? Their entries stay in the records.`}
              onConfirm={() => act(() => removePerson(who.id), () => setAsking(false))} />
          </>
        )}
      </div>
    </div>
  );
}
