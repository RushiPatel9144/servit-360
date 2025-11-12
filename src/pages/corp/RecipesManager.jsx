/** @format
 * RecipesManager.jsx — Corporate
 *
 * Features
 * - CRUD recipes (name, yield, shelfLifeDays, tools, method)
 * - Lines: { ingredientId, qty, unit }
 * - Live cost from latest ingredient prices (prices subcollection)
 * - Live allergen roll-up from ingredients
 * - Search & sort list, edit/delete recipe
 * - Button loading + tiny in-file toast
 *
 * Firestore data expected:
 *   ingredients/{id} { name, unit, allergens[] }
 *   ingredients/{id}/prices/{pid} { unitCost, effectiveFrom(ts|ISO), effectiveTo|null }
 *   recipes/{id} {
 *     name, yield, shelfLifeDays, tools, method,
 *     lines:[{ ingredientId, qty, unit }]
 *   }
 */

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase"; // adjust if path differs
import {
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

/******************** tiny toast ********************/
function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (type, text, ms = 2200) => {
    setMsg({ type, text });
    window.clearTimeout(useToast._t);
    useToast._t = window.setTimeout(() => setMsg(null), ms);
  };
  const Toast = () =>
    msg ? (
      <div
        className={`fixed top-3 right-3 px-3 py-2 rounded-lg text-xs z-50 shadow ${
          msg.type === "ok"
            ? "bg-emerald-500 text-slate-900"
            : "bg-rose-500 text-white"
        }`}
      >
        {msg.text}
      </div>
    ) : null;
  return { show, Toast };
}

/******************** helpers ********************/
const norm = (s) => (s || "").trim().toLowerCase();
function tsToStr(v) {
  if (!v) return "—";
  if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

async function fetchIngredients() {
  const snap = await getDocs(collection(db, "ingredients"));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const map = Object.fromEntries(list.map((i) => [i.id, i]));
  return { list, map };
}

async function fetchLatestPriceFor(ingredientId) {
  // Get prices, pick one with effectiveTo == null, else most recent effectiveFrom
  const snap = await getDocs(collection(db, "ingredients", ingredientId, "prices"));
  const prices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!prices.length) return null;
  const current = prices.find((p) => p.effectiveTo == null);
  if (current) return current;
  const take = (p) => (p.effectiveFrom?.seconds ? p.effectiveFrom.seconds : Date.parse(p.effectiveFrom || 0) / 1000);
  return prices.slice().sort((a, b) => take(b) - take(a))[0];
}

async function computeCostAndAllergens(recipe, ingredientMap) {
  let total = 0;
  const allergens = new Set();
  const detailed = [];
  for (const line of recipe.lines || []) {
    const ing = ingredientMap[line.ingredientId];
    (ing?.allergens || []).forEach((a) => allergens.add(a));
    const price = await fetchLatestPriceFor(line.ingredientId);
    const unitCost = Number(price?.unitCost || 0);
    const ext = unitCost * Number(line.qty || 0);
    total += ext;
    detailed.push({ ...line, ingredientName: ing?.name || line.ingredientId, unitCost, extCost: ext });
  }
  return { total, allergens: [...allergens], lines: detailed };
}

/******************** UI bits ********************/
function Field({ label, children }) {
  return (
    <label className="block mb-2">
      <div className="text-[10px] text-slate-400 mb-1">{label}</div>
      {children}
    </label>
  );
}

function LineRow({ idx, line, ingredients, onChange, onRemove }) {
  const ing = ingredients.map[line.ingredientId];
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <select
        className="col-span-5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
        value={line.ingredientId || ""}
        onChange={(e) => onChange(idx, { ...line, ingredientId: e.target.value, unit: ingredients.map[e.target.value]?.unit || line.unit })}
      >
        <option value="">Select ingredient…</option>
        {ingredients.list
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
      </select>
      <input
        className="col-span-3 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-right"
        type="number"
        min="0"
        step="0.01"
        value={line.qty}
        onChange={(e) => onChange(idx, { ...line, qty: e.target.value })}
        placeholder="Qty"
      />
      <input
        className="col-span-3 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
        value={line.unit || ing?.unit || ""}
        onChange={(e) => onChange(idx, { ...line, unit: e.target.value })}
        placeholder="Unit (g/ml/pcs)"
      />
      <button
        type="button"
        onClick={() => onRemove(idx)}
        className="col-span-1 px-3 py-2 rounded-xl border border-rose-700 text-[11px] text-rose-300 hover:bg-rose-900/20"
        title="Remove line"
      >
        ×
      </button>
    </div>
  );
}

/******************** main ********************/
export default function RecipesManager() {
  const { show, Toast } = useToast();

  const [ingredients, setIngredients] = useState({ list: [], map: {} });
  const [recipes, setRecipes] = useState([]);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("name");

  const [form, setForm] = useState({ id: undefined, name: "", yield: 1, shelfLifeDays: 1, tools: "", method: "", lines: [] });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [computed, setComputed] = useState({ total: 0, allergens: [], lines: [] });
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    (async () => {
      const ing = await fetchIngredients();
      setIngredients(ing);
      const recSnap = await getDocs(collection(db, "recipes"));
      setRecipes(recSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    })();
  }, []);

  // Recompute cost/allergens when lines change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setComputing(true);
      const { total, allergens, lines } = await computeCostAndAllergens(form, ingredients.map);
      if (!cancelled) setComputed({ total, allergens, lines });
      setComputing(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(form.lines), ingredients.map]);

  const filtered = useMemo(() => {
    return recipes
      .filter((r) => !q || norm(r.name).includes(norm(q)))
      .sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")));
  }, [recipes, q, sortKey]);

  const startNew = () => setForm({ id: undefined, name: "", yield: 1, shelfLifeDays: 1, tools: "", method: "", lines: [] });
  const startEdit = (r) => setForm({ id: r.id, name: r.name || "", yield: r.yield || 1, shelfLifeDays: r.shelfLifeDays || 1, tools: r.tools || "", method: r.method || "", lines: r.lines || [] });

  const removeLine = (idx) => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  const updateLine = (idx, next) => setForm((f) => ({ ...f, lines: f.lines.map((ln, i) => (i === idx ? next : ln)) }));
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { ingredientId: "", qty: "", unit: "" }] }));

  const saveRecipe = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return show("err", "Name required");
    if (!form.lines.length) return show("err", "Add at least one ingredient line");
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        yield: Number(form.yield) || 1,
        shelfLifeDays: Number(form.shelfLifeDays) || 1,
        tools: form.tools || "",
        method: form.method || "",
        lines: form.lines.map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty) || 0, unit: l.unit || ingredients.map[l.ingredientId]?.unit || "" })),
        updatedAt: new Date().toISOString(),
      };
      if (form.id) {
        await setDoc(doc(db, "recipes", form.id), payload, { merge: true });
        show("ok", "Recipe updated");
      } else {
        const ref = await addDoc(collection(db, "recipes"), payload);
        show("ok", "Recipe added");
        payload.id = ref.id;
      }
      // refresh list
      const recSnap = await getDocs(collection(db, "recipes"));
      setRecipes(recSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      // keep editing current (update id if new)
      if (!form.id) {
        const last = recSnap.docs.find((d) => d.data().name === payload.name);
        if (last) setForm((f) => ({ ...f, id: last.id }));
      }
    } catch (e2) {
      console.error(e2);
      show("err", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async (r) => {
    if (!confirm(`Delete recipe \"${r.name}\"?`)) return;
    try {
      setDeletingId(r.id);
      await deleteDoc(doc(db, "recipes", r.id));
      show("ok", "Deleted");
      const recSnap = await getDocs(collection(db, "recipes"));
      setRecipes(recSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (form.id === r.id) startNew();
    } catch (e2) {
      console.error(e2);
      show("err", "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* List */}
      <div className="md:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipes…"
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] w-40"
          />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
          >
            <option value="name">Sort: Name</option>
            <option value="shelfLifeDays">Sort: Shelf life</option>
          </select>
          <button
            onClick={startNew}
            className="ml-auto px-3 py-2 rounded-full border border-slate-700 text-[10px] text-slate-300"
          >
            New
          </button>
        </div>
        <ul className="divide-y divide-slate-800 text-[11px] max-h-[420px] overflow-auto">
          {filtered.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-2">
                <button
                  className="text-left flex-1 hover:text-emerald-300"
                  onClick={() => startEdit(r)}
                >
                  <div className="font-medium text-slate-100">{r.name}</div>
                  <div className="text-[10px] text-slate-500">Yield: {r.yield || 1} · Shelf life: {r.shelfLifeDays || 1}d</div>
                </button>
                <button
                  onClick={() => deleteRecipe(r)}
                  className={`px-2 py-1 rounded-full border text-[10px] ${
                    deletingId === r.id ? "border-rose-900 text-rose-400 opacity-60" : "border-rose-700 text-rose-300"
                  }`}
                  disabled={deletingId === r.id}
                >
                  {deletingId === r.id ? "…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
          {!filtered.length && (
            <li className="py-4 text-slate-500">No recipes yet.</li>
          )}
        </ul>
      </div>

      {/* Editor */}
      <div className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <form onSubmit={saveRecipe} className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Recipe name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
                placeholder="e.g., Holiday Lobster Spaghetti"
                required
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Yield">
                <input
                  type="number"
                  min="1"
                  value={form.yield}
                  onChange={(e) => setForm({ ...form, yield: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-right"
                />
              </Field>
              <Field label="Shelf life (days)">
                <input
                  type="number"
                  min="0"
                  value={form.shelfLifeDays}
                  onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-right"
                />
              </Field>
              <Field label="Tools">
                <input
                  value={form.tools}
                  onChange={(e) => setForm({ ...form, tools: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
                  placeholder="Saute pan, tongs, ladle"
                />
              </Field>
            </div>
          </div>

          <Field label="Method">
            <textarea
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="w-full min-h-[96px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
              placeholder="Step 1…"
            />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-slate-400">Lines (ingredients)</div>
              <button type="button" onClick={addLine} className="px-3 py-1 rounded-full border border-slate-700 text-[10px]">Add line</button>
            </div>
            <div className="space-y-2">
              {(form.lines || []).map((ln, idx) => (
                <LineRow
                  key={idx}
                  idx={idx}
                  line={ln}
                  ingredients={ingredients}
                  onChange={updateLine}
                  onRemove={removeLine}
                />
              ))}
              {!form.lines.length && (
                <div className="text-[11px] text-slate-500">No lines yet. Add your first ingredient.</div>
              )}
            </div>
          </div>

          {/* Live compute */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-950/50 text-slate-400">
                  <tr>
                    <th className="text-left p-2">Ingredient</th>
                    <th className="text-right p-2">Qty</th>
                    <th className="text-right p-2">Unit Cost</th>
                    <th className="text-right p-2">Ext</th>
                  </tr>
                </thead>
                <tbody>
                  {(computed.lines || []).map((ln, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="p-2">{ln.ingredientName}</td>
                      <td className="p-2 text-right">{ln.qty} {ln.unit}</td>
                      <td className="p-2 text-right">${Number(ln.unitCost).toFixed(4)}</td>
                      <td className="p-2 text-right">${Number(ln.extCost).toFixed(4)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-700 bg-slate-950/40">
                    <td className="p-2 font-medium" colSpan={3}>Total</td>
                    <td className="p-2 text-right font-semibold">${Number(computed.total).toFixed(4)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-slate-800 p-3">
              <div className="text-[10px] text-slate-400 mb-1">Allergens (derived)</div>
              {computing ? (
                <div className="text-[11px] text-slate-500">Computing…</div>
              ) : (computed.allergens?.length ? (
                <div className="flex flex-wrap gap-2">
                  {computed.allergens.map((a) => (
                    <span key={a} className="px-2 py-1 rounded-full border border-amber-400 text-[10px] text-amber-300">{a}</span>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">None</div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={saving}
              className={`mt-1 py-2 px-4 rounded-full bg-emerald-400 text-[11px] font-semibold text-slate-900 ${
                saving ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {saving ? "Saving…" : form.id ? "Update Recipe" : "Save Recipe"}
            </button>
            {form.id && (
              <button
                type="button"
                onClick={startNew}
                className="mt-1 px-4 py-2 rounded-full border border-slate-700 text-[11px] text-slate-300"
              >
                New
              </button>
            )}
          </div>
        </form>
      </div>

      <Toast />
    </div>
  );
}
