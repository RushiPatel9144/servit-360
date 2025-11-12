/** @format
 * MenuManager.jsx — Corporate → Menu Manager
 *
 * Features
 * - CRUD menu items (name, brand, type, station, recipe link, active)
 * - Filter + search (type, station, brand)
 * - Sell price history (optional): ensures single current price
 * - Uses existing Recipes collection (id + name)
 *
 * Firestore expected:
 *   recipes/{id} { name }
 *   menuItems/{id} {
 *     name, brand, type, station, recipeId, active, updatedAt
 *   }
 *   menuItems/{id}/prices/{pid} { sellPrice, currency, effectiveFrom(ts), effectiveTo|null }
 */

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase"; // adjust path if different
import {
	collection,
	addDoc,
	getDocs,
	doc,
	setDoc,
	deleteDoc,
	query,
	orderBy,
	where,
	writeBatch,
	serverTimestamp,
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

/******************** constants ********************/
const TYPES = ["Prep", "Purchased", "Expo", "Line Station"];
const STATIONS = ["Pantry", "Hot Pantry", "Fryer", "Grill", "Saute", "Mozza"];
const BRANDS = ["SIR", "Scaddabush", "Other"];

/******************** utils ********************/
const norm = (s) => (s || "").trim().toLowerCase();
function tsStr(v) {
	if (!v) return "—";
	if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
	return String(v).slice(0, 10);
}

/******************** main ********************/
export default function MenuManager() {
	const { show, Toast } = useToast();

	// Data sources
	const [recipes, setRecipes] = useState([]);
	const [items, setItems] = useState([]);

	// Filters/search
	const [q, setQ] = useState("");
	const [type, setType] = useState("");
	const [station, setStation] = useState("");
	const [brand, setBrand] = useState("");

	// Forms
	const [form, setForm] = useState({
		id: undefined,
		name: "",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Pantry",
		recipeId: "",
		active: true,
	});
	const [saving, setSaving] = useState(false);
	const [deletingId, setDeletingId] = useState(null);

	// Price sub-form
	const [expanded, setExpanded] = useState(null);
	const [priceForm, setPriceForm] = useState({ sellPrice: "" });
	const [pricesCache, setPricesCache] = useState({}); // menuItemId -> prices[]
	const [addingPrice, setAddingPrice] = useState(false);

	useEffect(() => {
		(async () => {
			const rSnap = await getDocs(
				query(collection(db, "recipes"), orderBy("name"))
			);
			setRecipes(rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
			await loadItems();
		})();
	}, []);

	const loadItems = async () => {
		const snap = await getDocs(
			query(collection(db, "menuItems"), orderBy("name"))
		);
		setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
	};

	const filtered = useMemo(() => {
		return items.filter(
			(i) =>
				(!q || norm(i.name).includes(norm(q))) &&
				(!type || i.type === type) &&
				(!station || i.station === station) &&
				(!brand || i.brand === brand)
		);
	}, [items, q, type, station, brand]);

	const startNew = () =>
		setForm({
			id: undefined,
			name: "",
			brand: "Scaddabush",
			type: "Line Station",
			station: "Pantry",
			recipeId: "",
			active: true,
		});
	const startEdit = (it) =>
		setForm({
			id: it.id,
			name: it.name || "",
			brand: it.brand || "",
			type: it.type || "",
			station: it.station || "",
			recipeId: it.recipeId || "",
			active: Boolean(it.active),
		});

	const saveItem = async (e) => {
		e.preventDefault();
		if (!form.name.trim()) return show("err", "Name required");
		if (!form.recipeId) return show("err", "Select a recipe");
		try {
			setSaving(true);
			const payload = {
				name: form.name.trim(),
				brand: form.brand,
				type: form.type,
				station: form.station,
				recipeId: form.recipeId,
				active: !!form.active,
				updatedAt: serverTimestamp(),
			};
			if (form.id) {
				await setDoc(doc(db, "menuItems", form.id), payload, {
					merge: true,
				});
				show("ok", "Menu item updated");
			} else {
				await addDoc(collection(db, "menuItems"), payload);
				show("ok", "Menu item added");
			}
			await loadItems();
		} catch (e2) {
			console.error(e2);
			show("err", "Save failed");
		} finally {
			setSaving(false);
		}
	};

	const deleteItem = async (it) => {
		if (!confirm(`Delete \"${it.name}\"?`)) return;
		try {
			setDeletingId(it.id);
			await deleteDoc(doc(db, "menuItems", it.id));
			show("ok", "Deleted");
			if (expanded === it.id) setExpanded(null);
			await loadItems();
		} catch (e) {
			console.error(e);
			show("err", "Delete failed");
		} finally {
			setDeletingId(null);
		}
	};

	const expandRow = async (id) => {
		setExpanded((p) => (p === id ? null : id));
		if (expanded !== id) {
			const snap = await getDocs(
				collection(db, "menuItems", id, "prices")
			);
			const prices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
			setPricesCache((p) => ({ ...p, [id]: sortPrices(prices) }));
		}
	};

	const addSellPrice = async (itemId, e) => {
		e.preventDefault();
		const val = Number(priceForm.sellPrice);
		if (!val && val !== 0) return;
		try {
			setAddingPrice(true);
			// ensure single current price using batch
			const pricesRef = collection(db, "menuItems", itemId, "prices");
			const currentQ = query(pricesRef, where("effectiveTo", "==", null));
			const currentSnap = await getDocs(currentQ);

			const batch = writeBatch(db);
			currentSnap.forEach((d) =>
				batch.update(d.ref, { effectiveTo: serverTimestamp() })
			);
			const newRef = doc(pricesRef);
			batch.set(newRef, {
				sellPrice: val,
				currency: "CAD",
				effectiveFrom: serverTimestamp(),
				effectiveTo: null,
			});
			await batch.commit();

			setPriceForm({ sellPrice: "" });
			const snap = await getDocs(
				collection(db, "menuItems", itemId, "prices")
			);
			const prices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
			setPricesCache((p) => ({ ...p, [itemId]: sortPrices(prices) }));
			show("ok", "Price added");
		} catch (e2) {
			console.error(e2);
			show("err", "Could not add price");
		} finally {
			setAddingPrice(false);
		}
	};

	return (
		<div className="grid gap-4 md:grid-cols-3">
			{/* Form */}
			<div className="md:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
				<h2 className="text-[13px] font-semibold text-slate-50 mb-2">
					Add / Update Menu Item
				</h2>
				<form
					onSubmit={saveItem}
					className="space-y-2"
				>
					<input
						value={form.name}
						onChange={(e) =>
							setForm({ ...form, name: e.target.value })
						}
						placeholder="Item name"
						className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
						required
					/>
					<select
						value={form.brand}
						onChange={(e) =>
							setForm({ ...form, brand: e.target.value })
						}
						className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
					>
						{BRANDS.map((b) => (
							<option
								key={b}
								value={b}
							>
								{b}
							</option>
						))}
					</select>
					<div className="grid grid-cols-2 gap-2">
						<select
							value={form.type}
							onChange={(e) =>
								setForm({ ...form, type: e.target.value })
							}
							className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
						>
							{TYPES.map((t) => (
								<option
									key={t}
									value={t}
								>
									{t}
								</option>
							))}
						</select>
						<select
							value={form.station}
							onChange={(e) =>
								setForm({ ...form, station: e.target.value })
							}
							className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
						>
							{STATIONS.map((s) => (
								<option
									key={s}
									value={s}
								>
									{s}
								</option>
							))}
						</select>
					</div>
					<select
						value={form.recipeId}
						onChange={(e) =>
							setForm({ ...form, recipeId: e.target.value })
						}
						className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
						required
					>
						<option value="">Select recipe…</option>
						{recipes.map((r) => (
							<option
								key={r.id}
								value={r.id}
							>
								{r.name}
							</option>
						))}
					</select>
					<label className="flex items-center gap-2 text-[11px] text-slate-300">
						<input
							type="checkbox"
							checked={form.active}
							onChange={(e) =>
								setForm({ ...form, active: e.target.checked })
							}
						/>
						Active
					</label>
					<div className="flex gap-2">
						<button
							disabled={saving}
							className={`mt-1 flex-1 py-2 px-4 rounded-full bg-emerald-400 text-[11px] font-semibold text-slate-900 ${
								saving ? "opacity-60 cursor-not-allowed" : ""
							}`}
						>
							{saving
								? "Saving…"
								: form.id
								? "Update Item"
								: "Save Item"}
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

			{/* List + filters */}
			<div className="md:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
				<div className="flex flex-wrap items-center gap-2 mb-2">
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Search items…"
						className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] w-48"
					/>
					<select
						value={type}
						onChange={(e) => setType(e.target.value)}
						className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
					>
						<option value="">Type: All</option>
						{TYPES.map((t) => (
							<option
								key={t}
								value={t}
							>
								{t}
							</option>
						))}
					</select>
					<select
						value={station}
						onChange={(e) => setStation(e.target.value)}
						className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
					>
						<option value="">Station: All</option>
						{STATIONS.map((s) => (
							<option
								key={s}
								value={s}
							>
								{s}
							</option>
						))}
					</select>
					<select
						value={brand}
						onChange={(e) => setBrand(e.target.value)}
						className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
					>
						<option value="">Brand: All</option>
						{BRANDS.map((b) => (
							<option
								key={b}
								value={b}
							>
								{b}
							</option>
						))}
					</select>
				</div>

				<table className="w-full text-[11px]">
					<thead>
						<tr className="text-slate-400">
							<th className="text-left py-1">Name</th>
							<th className="text-left">Recipe</th>
							<th className="text-left">Type/Station</th>
							<th className="text-left">Brand</th>
							<th className="text-left">Active</th>
							<th className="text-left">Actions</th>
						</tr>
					</thead>
					<tbody>
						{filtered.map((it) => (
							<React.Fragment key={it.id}>
								<tr className="border-t border-slate-800 hover:bg-slate-900/40">
									<td className="py-1">{it.name}</td>
									<td>
										{recipes.find(
											(r) => r.id === it.recipeId
										)?.name || it.recipeId}
									</td>
									<td>
										{it.type} · {it.station}
									</td>
									<td>{it.brand}</td>
									<td>{it.active ? "Yes" : "No"}</td>
									<td className="text-slate-400">
										<button
											onClick={() => expandRow(it.id)}
											className="px-2 py-1 mr-2 rounded-full border border-slate-700 text-[10px] hover:border-emerald-400 hover:text-emerald-300"
										>
											{expanded === it.id
												? "Hide Prices"
												: "Manage Prices"}
										</button>
										<button
											onClick={() => startEdit(it)}
											className="px-2 py-1 mr-2 rounded-full border border-slate-700 text-[10px]"
										>
											Edit
										</button>
										<button
											onClick={() => deleteItem(it)}
											className="px-2 py-1 rounded-full border border-rose-700 text-[10px] text-rose-300 hover:bg-rose-900/20"
										>
											{deletingId === it.id
												? "…"
												: "Delete"}
										</button>
									</td>
								</tr>

								{expanded === it.id && (
									<tr>
										<td
											colSpan={6}
											className="bg-slate-900/50 p-3"
										>
											<div className="text-[10px] text-slate-400 mb-1">
												Sell price
											</div>
											<form
												onSubmit={(e) =>
													addSellPrice(it.id, e)
												}
												className="flex flex-wrap gap-2 mb-2"
											>
												<input
													placeholder="Price (e.g., 19.99)"
													value={priceForm.sellPrice}
													onChange={(e) =>
														setPriceForm({
															sellPrice:
																e.target.value,
														})
													}
													className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
													required
												/>
												<button
													disabled={addingPrice}
													className={`px-3 py-1 rounded-full bg-emerald-400 text-[11px] text-slate-900 font-semibold ${
														addingPrice
															? "opacity-60 cursor-not-allowed"
															: ""
													}`}
												>
													{addingPrice
														? "Adding…"
														: "Add"}
												</button>
											</form>

											<div className="text-[10px] text-slate-400 mb-1">
												Price history
											</div>
											<div className="rounded-xl border border-slate-800 overflow-hidden">
												<table className="w-full text-[10px]">
													<thead className="bg-slate-950/50 text-slate-400">
														<tr>
															<th className="text-left p-2">
																Price
															</th>
															<th className="text-left p-2">
																From
															</th>
														</tr>
													</thead>
													<tbody>
														{(
															pricesCache[
																it.id
															] || []
														).map((p) => (
															<tr
																key={p.id}
																className="border-t border-slate-800"
															>
																<td className="p-2">
																	$
																	{Number(
																		p.sellPrice
																	).toFixed(
																		2
																	)}
																</td>
																<td className="p-2">
																	{p.effectiveTo ==
																		null && (
																		<span className="mr-2 px-2 py-0.5 text-[9px] rounded-full bg-emerald-500/20 border border-emerald-500">
																			Current
																		</span>
																	)}
																	{tsStr(
																		p.effectiveFrom
																	)}
																</td>
															</tr>
														))}
														{!(
															pricesCache[
																it.id
															] || []
														).length && (
															<tr>
																<td
																	className="p-2 text-slate-500"
																	colSpan={2}
																>
																	No prices
																	yet.
																</td>
															</tr>
														)}
													</tbody>
												</table>
											</div>
										</td>
									</tr>
								)}
							</React.Fragment>
						))}
						{!filtered.length && (
							<tr>
								<td
									colSpan={6}
									className="py-2 text-slate-500"
								>
									No menu items found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<Toast />
		</div>
	);
}

/******************** helpers ********************/
function sortPrices(prices) {
	const get = (p) =>
		p.effectiveFrom?.seconds
			? p.effectiveFrom.seconds
			: Date.parse(p.effectiveFrom || 0) / 1000;
	return prices.slice().sort((a, b) => get(b) - get(a));
}
