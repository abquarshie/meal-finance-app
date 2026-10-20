"use client";
import { useActionState, useState } from "react";
import { registerAction, signInAction } from "@/actions/people";
import { Msg } from "@/components/ui";
import { passwordProblem, passwordStrength, usernameProblem } from "@/lib/passwords";

export function AuthForms({ first, next }: { first: boolean; next: string }) {
  const [mode, setMode] = useState<"in" | "join">(first ? "join" : "in");
  if (first) {
    return (
      <>
        <div className="note" style={{ marginBottom: "1rem" }}>
          Nobody has an account yet. The first person to sign up becomes the owner and can invite the rest of the family.
        </div>
        <Register first />
      </>
    );
  }
  return (
    <>
      <div className="seg" role="group" aria-label="Sign in or join" style={{ marginBottom: "1rem" }}>
        <button type="button" aria-pressed={mode === "in"} onClick={() => setMode("in")}>I have an account</button>
        <button type="button" aria-pressed={mode === "join"} onClick={() => setMode("join")}>I have an invite code</button>
      </div>
      {mode === "in" ? <SignIn next={next} /> : <Register first={false} />}
    </>
  );
}

function SignIn({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, undefined);
  const [username, setUsername] = useState(""); // kept when a wrong password clears the form
  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next} />
      <label className="field"><span>Username</span>
        <input className="input" name="username" autoComplete="username" autoCapitalize="none" required value={username}
          onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label className="field"><span>Password</span>
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      <label className="check"><input type="checkbox" name="remember" defaultChecked /> Keep me signed in on this device</label>
      {state?.error ? <div className="note error" role="alert">{state.error}</div> : null}
      <button className="btn primary wide big" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function Register({ first }: { first: boolean }) {
  const [state, action, pending] = useActionState(registerAction, undefined);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const uErr = username ? usernameProblem(username) : null;
  const pErr = password ? passwordProblem(password, username) : null;
  const strength = password && !pErr ? passwordStrength(password) : null;
  const mismatch = Boolean(again) && again !== password;
  const ready = Boolean(username && password && again && (first || code)) && !uErr && !pErr && !mismatch;
  return (
    <form action={action} className="form">
      <label className="field"><span>Your name</span>
        <input className="input" name="name" placeholder="e.g. Ama" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
        <Msg tone="hint">Shown on entries you add. You can use your first name.</Msg>
      </label>
      <label className="field"><span>Username</span>
        <input className="input" name="username" autoComplete="username" autoCapitalize="none" maxLength={30}
          value={username} onChange={(e) => setUsername(e.target.value)} />
        {uErr ? <Msg>{uErr}</Msg> : <Msg tone="hint">What you&apos;ll type to sign in. Lower case, no spaces.</Msg>}
      </label>
      <label className="field"><span>Password</span>
        <input className="input" name="password" type="password" autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        {pErr ? <Msg>{pErr}</Msg> : strength ? (
          <Msg tone={strength === "Good" || strength === "Strong" ? "ok" : "warn"}>
            Strength: {strength}{strength === "Good" || strength === "Strong" ? "" : ". Longer is stronger; a short phrase works well."}
          </Msg>
        ) : null}
      </label>
      <label className="field"><span>Type the password again</span>
        <input className="input" name="password2" type="password" autoComplete="new-password" value={again}
          onChange={(e) => setAgain(e.target.value)} />
        {mismatch ? <Msg>The two passwords don&apos;t match.</Msg> : null}
      </label>
      {!first ? (
        <label className="field"><span>Invite code</span>
          <input className="input" name="code" placeholder="e.g. 4F2A-91C0-7B3E" value={code} onChange={(e) => setCode(e.target.value)} />
          <Msg tone="hint">The account owner can find this in Settings, under People.</Msg>
        </label>
      ) : null}
      <label className="check"><input type="checkbox" name="remember" defaultChecked /> Keep me signed in on this device</label>
      {state?.error ? <div className="note error" role="alert">{state.error}</div> : null}
      <button className="btn primary wide big" disabled={!ready || pending}>
        {pending ? "Creating your account…" : first ? "Create owner account" : "Create account"}
      </button>
    </form>
  );
}
