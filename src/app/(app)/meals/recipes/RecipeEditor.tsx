"use client";
import { useState } from "react";
import { addStarterRecipes, deleteRecipe, saveBoughtDish, saveRecipe } from "@/actions/recipes";
import { Confirm } from "@/components/Sheet";
import { Msg, Section } from "@/components/ui";
import { useAct } from "@/components/useAct";
import { ROLES } from "@/lib/kitchen/logic";
import { baseOf, UNITS } from "@/lib/kitchen/units";

export type RecipeData = {
  id: number; name: string; portions: number; keepsDays: number; prepNote: string; prepHours: number | null; method: string; role: string;
  bought: boolean; price: number | null; countUnit: string; shop: string; category: string; lines: { ing: number; qty: number; unit: string }[];
};
type Ing = { id: number; name: string; unit: string; units: string[]; pack: string | null; alts: string[] };
const BOUGHT_UNITS = ["ball", "portion", "piece", "pack", "plate", "bowl", "loaf", "bottle", "sachet"];

export function StarterRecipes() {
  const [busy, act] = useAct();
  return (
    <div className="card form" style={{ marginBottom: "1rem" }}>
      <Section title="Add the everyday starter dishes" />
      <p style={{ margin: 0 }}>Six everyday dishes (jollof, red red, kontomire stew, okro stew with banku, light soup with chicken, and
        bread with eggs) with their ingredients. Change anything to suit how you cook.</p>
      <div><button type="button" className="btn primary" disabled={busy} onClick={() => act(() => addStarterRecipes())}>Add starter recipes</button></div>
    </div>
  );
}

export function RecipeEditor({ recipes, ingredients, household, categories }: {
  recipes: RecipeData[]; ingredients: Ing[]; household: number; categories: string[];
}) {
  const [pick, setPick] = useState(0);
  const r = recipes.find((x) => x.id === pick);
  return (
    <div className="card form">
      <Section title="Add or change a recipe" />
      <select className="input" aria-label="Recipe" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
        <option value={0}>＋ New recipe</option>
        {recipes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <Editor key={`${pick}-${r?.name}`} r={r} recipes={recipes} ingredients={ingredients} household={household} categories={categories}
        onSaved={(id) => setPick(id)} />
    </div>
  );
}

function Editor({ r, recipes, ingredients, household, categories, onSaved }: {
  r?: RecipeData; recipes: RecipeData[]; ingredients: Ing[]; household: number; categories: string[]; onSaved: (id: number) => void;
}) {
  const [busy, act] = useAct();
  const [bought, setBought] = useState(Boolean(r?.bought));
  const [name, setName] = useState(r?.name ?? "");
  const [portions, setPortions] = useState(String(r?.portions ?? Math.max(household, 1)));
  const [keeps, setKeeps] = useState(String(r?.keepsDays ?? 3));
  const [role, setRole] = useState(r?.role ?? "main");
  const [prep, setPrep] = useState(r?.prepNote ?? "");
  const [prepH, setPrepH] = useState(String(r?.prepHours ?? 0));
  const [method, setMethod] = useState(r?.method ?? "");
  const [lines, setLines] = useState(r?.lines.map((l) => ({ ing: String(l.ing), qty: String(l.qty), unit: l.unit })) ?? []);
  const [unit, setUnit] = useState(r?.countUnit && r.bought ? r.countUnit : "ball");
  const [price, setPrice] = useState(r?.price ? String(r.price) : "");
  const [shop, setShop] = useState(r?.shop ?? "");
  const defaultCat = r?.category || (categories.includes("Dining Out") ? "Dining Out" : categories[0] ?? "");
  const [category, setCategory] = useState(defaultCat);
  const [asking, setAsking] = useState(false);
  const byId = new Map(ingredients.map((i) => [String(i.id), i]));
  const clash = recipes.some((x) => x.id !== r?.id && x.name.toLowerCase() === name.trim().toLowerCase());

  const clean = lines.filter((l) => l.ing);
  const problems = clean.filter((l) => !(Number(l.qty) > 0)).map((l) => `Give ${byId.get(l.ing)?.name} an amount.`);
  const mismatch = clean.map((l) => {
    const it = byId.get(l.ing);
    if (!it || !l.unit) return null;
    return baseOf(l.unit) !== baseOf(it.unit) && l.unit !== it.pack && !it.alts.includes(l.unit)
      ? `${it.name} is counted in ${it.unit} in the pantry, and ${l.unit} doesn't convert to that: cooking this recipe can't take it off the pantry, and it won't add up on the shopping list. Use ${it.unit} here.`
      : null;
  }).filter(Boolean) as string[];
  const ids = clean.map((l) => l.ing);
  const dupes = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))].map((x) => byId.get(x)?.name);
  const ready = Boolean(name.trim()) && clean.length > 0 && !problems.length && !clash;

  const del = r ? (
    <>
      <button type="button" className="btn danger" onClick={() => setAsking(true)}>Delete</button>
      <Confirm open={asking} busy={busy} onCancel={() => setAsking(false)} onConfirm={() => act(() => deleteRecipe(r.id), () => { setAsking(false); onSaved(0); })}
        message={`Delete ${r.name}? It comes off any days it's planned for that haven't been ${r.bought ? "bought" : "cooked"} yet; days it was already ${r.bought ? "bought" : "cooked"} stay in the history.`} />
    </>
  ) : null;

  return (
    <>
      <label className="check"><input type="checkbox" checked={bought} onChange={(e) => setBought(e.target.checked)} /> Bought outside, ready-made</label>
      <label className="field"><span>Name</span>
        <input className="input" maxLength={80} placeholder={bought ? "e.g. Kenkey" : "e.g. Groundnut soup"} value={name} onChange={(e) => setName(e.target.value)} /></label>
      {clash ? <Msg>You already have a {bought ? "dish" : "recipe"} with this name.</Msg> : null}
      {bought ? (
        <>
          <div className="row2">
            <label className="field"><span>Counted in</span><select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {[...new Set([unit, ...BOUGHT_UNITS])].map((u) => <option key={u}>{u}</option>)}</select></label>
            <label className="field"><span>Usual price for one {unit} (GH₵)</span>
              <input className="input" type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          </div>
          <label className="field"><span>Where you buy it (optional)</span>
            <input className="input" maxLength={60} placeholder="e.g. Auntie Ama, Dansoman" value={shop} onChange={(e) => setShop(e.target.value)} /></label>
          <label className="field"><span>Paid under</span><select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c}>{c}</option>)}</select></label>
          <div className="btns">
            <button type="button" className="btn primary" disabled={!name.trim() || clash || busy}
              onClick={() => act(() => saveBoughtDish({ id: r?.id ?? null, name, countUnit: unit, price: price ? Number(price) : null, shop, category }).then((x) => {
                if (x.ok) onSaved(x.id);
                return x;
              }))}>Save</button>
            {del}
          </div>
        </>
      ) : (
        <>
          <div className="row2">
            <label className="field"><span>Portions it makes</span><input className="input" type="number" min="0.5" max="100" step="0.5" value={portions} onChange={(e) => setPortions(e.target.value)} /></label>
            <label className="field"><span>Keeps in the fridge (days)</span><input className="input" type="number" min="0" max="30" step="1" value={keeps} onChange={(e) => setKeeps(e.target.value)} /></label>
          </div>
          <label className="field"><span>Kind of dish</span><select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <Msg tone="hint">A starch (kokonte, fufu, banku…) planned with a soup or stew makes one meal, named starch first: Kokonte + Palm nut soup.</Msg>
          </label>
          <div className="row2">
            <label className="field"><span>Prep ahead (optional)</span><input className="input" placeholder="e.g. Soak the beans" maxLength={200} value={prep} onChange={(e) => setPrep(e.target.value)} /></label>
            <label className="field"><span>Hours before</span><input className="input" type="number" min="0" max="72" step="1" value={prepH} onChange={(e) => setPrepH(e.target.value)} /></label>
          </div>
          <div className="label" style={{ marginTop: ".3rem" }}>Ingredients</div>
          {!ingredients.length ? <Msg tone="hint">Add ingredients first, under Ingredients.</Msg> : null}
          {lines.map((l, i) => {
            const it = byId.get(l.ing);
            const units = it ? [...new Set([...it.units, ...UNITS])] : UNITS;
            const set = (x: Partial<typeof l>) => setLines(lines.map((y, j) => (j === i ? { ...y, ...x } : y)));
            return (
              <div key={i} className="recipe-line">
                <select className="input" aria-label="Ingredient" value={l.ing} onChange={(e) => {
                  const nit = byId.get(e.target.value);
                  set({ ing: e.target.value, unit: nit?.unit ?? l.unit });
                }}>
                  <option value="">Choose…</option>
                  {ingredients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <input className="input" type="number" min="0" step="any" aria-label="Amount" value={l.qty} onChange={(e) => set({ qty: e.target.value })} />
                <select className="input" aria-label="Unit" value={l.unit} onChange={(e) => set({ unit: e.target.value })}>
                  {units.map((u) => <option key={u}>{u}</option>)}
                </select>
                <button type="button" className="btn ghost small" aria-label="Remove this line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}
          <div><button type="button" className="btn small" onClick={() => setLines([...lines, { ing: "", qty: "", unit: "pcs" }])}>+ Add an ingredient</button></div>
          {mismatch.map((m, i) => <Msg key={i} tone="warn">{m}</Msg>)}
          {dupes.length ? <Msg tone="hint">{dupes.join(", ")} is listed twice; the amounts will be added together.</Msg> : null}
          {problems.map((p, i) => <Msg key={i}>{p}</Msg>)}
          <label className="field"><span>Method (optional)</span><textarea className="input" value={method} onChange={(e) => setMethod(e.target.value)} /></label>
          <div className="btns">
            <button type="button" className="btn primary" disabled={!ready || busy} onClick={() => act(() => saveRecipe({ id: r?.id ?? null, name,
              portions: Number(portions), keepsDays: Number(keeps), prepNote: prep || null, prepHours: Number(prepH) || null, method: method || null, role,
              lines: clean.map((l) => ({ ingredientId: Number(l.ing), qty: Number(l.qty), unit: l.unit })) }).then((x) => {
              if (x.ok) onSaved(x.id);
              return x;
            }))}>Save recipe</button>
            {del}
          </div>
          {!ready && !problems.length && !clash ? <Msg tone="hint">Add a name and at least one ingredient to save.</Msg> : null}
        </>
      )}
    </>
  );
}
