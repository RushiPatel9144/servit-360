/** @format */
import React, { useEffect, useState } from "react";
import RecipesManager from "./RecipesManager";
import AppHeader from "../../components/layout/AppHeader";
import MenuManager from "./MenuManager";
import { db } from "../../firebase";
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

/* ------------ Tiny in-file Toast hook ------------ */
function useToast() {
	const [msg, setMsg] = useState(null); // {type:'ok'|'err', text}
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

/* ------------ UI Bits ------------ */
function Card({ title, children, className = "" }) {
	return (
		<div
			className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-4 ${className}`}
		>
			{title && (
				<h2 className="text-[13px] font-semibold text-slate-50 mb-2">
					{title}
				</h2>
			)}
			{children}
		</div>
	);
}

const ALLERGENS = [
	"Egg",
	"Fish",
	"Shellfish",
	"Dairy",
	"Tree Nuts",
	"Peanuts",
	"Soy",
	"Wheat",
	"Sesame",
	"Mustard",
];

/* ================================================== */
export default function CorpDashboard() {
	const { show, Toast } = useToast();
	return (
		<div className="min-h-screen bg-slate-950 text-slate-100">
			<AppHeader />
			<div className="max-w-[1200px] mx-auto p-5 space-y-4">
				<h1 className="text-xl font-semibold">Corporate Dashboard</h1>
				<IngredientsManager toast={{ show }} />
				<RecipesManager />
				<MenuManager />
			</div>
			<Toast />
		</div>
	);
}

/* ================================================== */
function IngredientsManager({ toast }) {
	const [items, setItems] = useState([]);
	const [q, setQ] = useState("");
	const [sortKey, setSortKey] = useState("name"); // name|unit
	const [expanded, setExpanded] = useState(null);

	const [form, setForm] = useState({
		id: undefined,
		name: "",
		unit: "g",
		allergens: [],
	});
	const [saving, setSaving] = useState(false);

	const [priceForm, setPriceForm] = useState({
		unitCost: "",
		vendorId: "",
		locationId: "",
	});
	const [addingPrice, setAddingPrice] = useState(false);
	const [pricesCache, setPricesCache] = useState({}); // ingredientId -> prices[]

	/* ---------- Load ingredients ---------- */
	const loadIngredients = async () => {
		const snap = await getDocs(
			query(collection(db, "ingredients"), orderBy("name"))
		);
		setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
	};
	useEffect(() => {
		loadIngredients();
	}, []);

	/* ---------- Helpers ---------- */
	const norm = (s) => (s || "").trim().toLowerCase();

	const toggleAllergen = (a) => {
		setForm((f) => {
			const have = f.allergens.includes(a);
			return {
				...f,
				allergens: have
					? f.allergens.filter((x) => x !== a)
					: [...f.allergens, a],
			};
		});
	};

	/* ---------- Create/Update Ingredient ---------- */
	const saveIngredient = async (e) => {
		e.preventDefault();
		if (!form.name.trim()) return;

		// prevent dupes on create
		if (!form.id) {
			const dupe = items.find((i) => norm(i.name) === norm(form.name));
			if (dupe) {
				toast.show("err", "Ingredient already exists");
				return;
			}
		}

		try {
			setSaving(true);
			if (form.id) {
				await setDoc(
					doc(db, "ingredients", form.id),
					{
						name: form.name,
						unit: form.unit,
						allergens: form.allergens,
					},
					{ merge: true }
				);
				toast.show("ok", "Ingredient updated");
			} else {
				await addDoc(collection(db, "ingredients"), {
					name: form.name,
					unit: form.unit,
					allergens: form.allergens,
				});
				toast.show("ok", "Ingredient added");
			}
			setForm({ id: undefined, name: "", unit: "g", allergens: [] });
			await loadIngredients();
		} catch (e2) {
			console.error(e2);
			toast.show("err", "Save failed");
		} finally {
			setSaving(false);
		}
	};

	/* ---------- Delete Ingredient ---------- */
	const deleteIngredient = async (it) => {
		if (!confirm(`Delete "${it.name}"?`)) return;
		try {
			await deleteDoc(doc(db, "ingredients", it.id));
			toast.show("ok", "Deleted");
			if (expanded === it.id) setExpanded(null);
			await loadIngredients();
		} catch (e) {
			console.error(e);
			toast.show("err", "Delete failed");
		}
	};

	/* ---------- Expand row & fetch prices ---------- */
	const expandRow = async (id) => {
		setExpanded((prev) => (prev === id ? null : id));
		if (expanded !== id) {
			const snap = await getDocs(
				collection(db, "ingredients", id, "prices")
			);
			const prices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
			setPricesCache((p) => ({ ...p, [id]: sortPrices(prices) }));
		}
	};

	/* ---------- Add price & auto-close previous current ---------- */
	const addPriceAndClosePrevious = async (
		ingredientId,
		{ unitCost, vendorId, locationId }
	) => {
		const pricesRef = collection(db, "ingredients", ingredientId, "prices");
		const currentQ = query(pricesRef, where("effectiveTo", "==", null));
		const currentSnap = await getDocs(currentQ);

		const batch = writeBatch(db);
		currentSnap.forEach((d) =>
			batch.update(d.ref, { effectiveTo: serverTimestamp() })
		);

		const newRef = doc(pricesRef);
		batch.set(newRef, {
			unitCost: Number(unitCost),
			vendorId: vendorId || "default",
			locationId: locationId || "default",
			currency: "CAD",
			effectiveFrom: serverTimestamp(),
			effectiveTo: null,
		});

		await batch.commit();
		return newRef.id;
	};

	const addPrice = async (ingredientId, e) => {
		e.preventDefault();
		if (!priceForm.unitCost) return;
		try {
			setAddingPrice(true);
			await addPriceAndClosePrevious(ingredientId, priceForm);
			setPriceForm({ unitCost: "", vendorId: "", locationId: "" });

			// reload that ingredient's prices
			const snap = await getDocs(
				collection(db, "ingredients", ingredientId, "prices")
			);
			const prices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
			setPricesCache((p) => ({
				...p,
				[ingredientId]: sortPrices(prices),
			}));
			toast.show("ok", "Price added");
		} catch (e2) {
			console.error(e2);
			toast.show("err", "Could not add price");
		} finally {
			setAddingPrice(false);
		}
	};

	/* ---------- Render helpers ---------- */
	const rows = items
		.filter((i) => !q || norm(i.name).includes(norm(q)))
		.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));

	const startEdit = (it) => {
		setForm({
			id: it.id,
			name: it.name,
			unit: it.unit,
			allergens: it.allergens || [],
		});
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	return (
		<div className="grid gap-4 md:grid-cols-3">
			{/* Left: form */}
			<Card
				title="Add / Update Ingredient"
				className="md:col-span-1"
			>
				<form
					onSubmit={saveIngredient}
					className="space-y-2"
				>
					<input
						value={form.name}
						onChange={(e) =>
							setForm({ ...form, name: e.target.value })
						}
						placeholder="Name (e.g., Spaghetti)"
						className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
						required
					/>
					<input
						value={form.unit}
						onChange={(e) =>
							setForm({ ...form, unit: e.target.value })
						}
						placeholder="Unit (g, ml, pcs)"
						className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
					/>

					<div className="text-[10px] text-slate-400">Allergens</div>
					<div className="flex flex-wrap gap-2">
						{ALLERGENS.map((a) => (
							<button
								key={a}
								type="button"
								onClick={() => toggleAllergen(a)}
								className={`px-2 py-1 rounded-full border text-[10px] ${
									form.allergens.includes(a)
										? "border-amber-400 text-amber-300"
										: "border-slate-700 text-slate-400"
								}`}
							>
								{a}
							</button>
						))}
					</div>

					<div className="flex gap-2">
						<button
							disabled={saving}
							className={`mt-2 flex-1 py-2 px-4 rounded-full bg-emerald-400 text-[11px] font-semibold text-slate-900 ${
								saving ? "opacity-60 cursor-not-allowed" : ""
							}`}
						>
							{saving
								? "Saving…"
								: form.id
								? "Update Ingredient"
								: "Save Ingredient"}
						</button>
						{form.id && (
							<button
								type="button"
								onClick={() =>
									setForm({
										id: undefined,
										name: "",
										unit: "g",
										allergens: [],
									})
								}
								className="mt-2 px-4 rounded-full border border-slate-700 text-[11px] text-slate-300"
							>
								Cancel
							</button>
						)}
					</div>
				</form>
			</Card>

			{/* Right: table */}
			<Card
				title="Ingredients"
				className="md:col-span-2"
			>
				<div className="flex items-center gap-2 mb-2">
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Search ingredients…"
						className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] w-48"
					/>
					<select
						value={sortKey}
						onChange={(e) => setSortKey(e.target.value)}
						className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
					>
						<option value="name">Sort: Name</option>
						<option value="unit">Sort: Unit</option>
					</select>
				</div>

				<table className="w-full text-[11px]">
					<thead>
						<tr className="text-slate-400">
							<th className="text-left py-1">Name</th>
							<th className="text-left">Unit</th>
							<th className="text-left">Allergens</th>
							<th className="text-left">Actions</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((it) => (
							<React.Fragment key={it.id}>
								<tr className="border-t border-slate-800 hover:bg-slate-900/40">
									<td className="py-1">{it.name}</td>
									<td>{it.unit}</td>
									<td className="text-amber-300">
										{(it.allergens || []).join(", ") || "—"}
									</td>
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
											onClick={() => deleteIngredient(it)}
											className="px-2 py-1 rounded-full border border-rose-700 text-[10px] text-rose-300 hover:bg-rose-900/20"
										>
											Delete
										</button>
									</td>
								</tr>

								{expanded === it.id && (
									<tr>
										<td
											colSpan={4}
											className="bg-slate-900/50 p-3"
										>
											<div className="text-[10px] text-slate-400 mb-1">
												Add price
											</div>
											<form
												onSubmit={(e) =>
													addPrice(it.id, e)
												}
												className="flex flex-wrap gap-2 mb-2"
											>
												<input
													placeholder="Unit Cost (e.g., 0.032)"
													value={priceForm.unitCost}
													onChange={(e) =>
														setPriceForm({
															...priceForm,
															unitCost:
																e.target.value,
														})
													}
													className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
													required
												/>
												<input
													placeholder="Vendor (opt.)"
													value={priceForm.vendorId}
													onChange={(e) =>
														setPriceForm({
															...priceForm,
															vendorId:
																e.target.value,
														})
													}
													className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
												/>
												<input
													placeholder="Location (opt.)"
													value={priceForm.locationId}
													onChange={(e) =>
														setPriceForm({
															...priceForm,
															locationId:
																e.target.value,
														})
													}
													className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
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
																Unit Cost
															</th>
															<th className="text-left p-2">
																Vendor
															</th>
															<th className="text-left p-2">
																Location
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
														).map((p) => {
															const isCurrent =
																p.effectiveTo ==
																null;
															const from =
																tsOrIso(
																	p.effectiveFrom
																);
															return (
																<tr
																	key={p.id}
																	className="border-t border-slate-800"
																>
																	<td className="p-2">
																		$
																		{Number(
																			p.unitCost
																		).toFixed(
																			4
																		)}
																	</td>
																	<td className="p-2">
																		{p.vendorId ||
																			"default"}
																	</td>
																	<td className="p-2">
																		{p.locationId ||
																			"default"}
																	</td>
																	<td className="p-2">
																		{isCurrent && (
																			<span className="mr-2 px-2 py-0.5 text-[9px] rounded-full bg-emerald-500/20 border border-emerald-500">
																				Current
																			</span>
																		)}
																		{from}
																	</td>
																</tr>
															);
														})}
														{!(
															pricesCache[
																it.id
															] || []
														).length && (
															<tr>
																<td
																	className="p-2 text-slate-500"
																	colSpan={4}
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
						{!rows.length && (
							<tr>
								<td
									colSpan={4}
									className="py-2 text-slate-500"
								>
									No ingredients match your search.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</Card>
		</div>
	);
}

/* ---------- tiny utils ---------- */
function tsOrIso(v) {
	if (!v) return "—";
	if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
	return String(v).slice(0, 10);
}
function sortPrices(prices) {
	// latest first by effectiveFrom (Timestamp or ISO)
	const get = (p) =>
		p.effectiveFrom?.seconds
			? p.effectiveFrom.seconds
			: Date.parse(p.effectiveFrom || 0) / 1000;
	return prices.slice().sort((a, b) => get(b) - get(a));
}
