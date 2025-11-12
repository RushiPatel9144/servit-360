/** @format */

// @ts-nocheck

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "../../components/layout/AppHeader";
import { db } from "../../firebase";
import {
	collection,
	getDoc,
	getDocs,
	doc,
	query,
	where,
} from "firebase/firestore";
import AlphaBuckets, { sliceByBucket } from "./components/AlphaBuckets";
import SpecPanel from "./components/specPanel";
import LabelModal from "./components/labelmodel";
import { computeCostAndAllergens } from "../../lib/costing";

const TYPES = ["Prep", "Purchased", "Expo", "Line Station"];
const STATIONS = ["Pantry", "Hot Pantry", "Fryer", "Grill", "Saute", "Mozza"];

export default function CulinaryDashboard() {
	const [activeType, setActiveType] = useState("Line Station");
	const [activeStation, setActiveStation] = useState("Pantry");
	const [queryText, setQueryText] = useState("");
	const [items, setItems] = useState([]); // active menuItems
	const [loading, setLoading] = useState(false);

	const [ingredientsMap, setIngredientsMap] = useState({});
	const [selected, setSelected] = useState(null); // menu item
	const [recipe, setRecipe] = useState(null);
	const [computed, setComputed] = useState(null);
	const [specOpen, setSpecOpen] = useState(false);
	const [labelOpen, setLabelOpen] = useState(false);

	// alpha buckets
	const [bucketIndex, setBucketIndex] = useState(0);

	// load ingredients map once (for allergen rollup)
	useEffect(() => {
		(async () => {
			const snap = await getDocs(collection(db, "ingredients"));
			const map = Object.fromEntries(
				snap.docs.map((d) => [d.id, d.data()])
			);
			setIngredientsMap(map);
		})();
	}, []);

	// fetch menuItems on filter change
	useEffect(() => {
		(async () => {
			setLoading(true);
			let base = collection(db, "menuItems");
			const conds = [where("active", "==", true)];
			if (activeType !== "Line Station") {
				conds.push(where("type", "==", activeType));
			} else {
				conds.push(
					where("type", "==", "Line Station"),
					where("station", "==", activeStation)
				);
			}
			const snap = await getDocs(query(base, ...conds));
			const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
			setItems(list);
			setBucketIndex(0);
			setLoading(false);
		})();
	}, [activeType, activeStation]);

	// search filter
	const visible = useMemo(() => {
		let base = items;
		if (activeType === "Line Station" && !queryText) {
			base = sliceByBucket(items, bucketIndex);
		}
		if (queryText) {
			const q = queryText.trim().toLowerCase();
			base = items.filter((i) => i.name.toLowerCase().includes(q));
		}
		return base;
	}, [items, bucketIndex, queryText, activeType]);

	// In CulinaryDashboard.jsx, inside openSpec()
	const ensureIngMap = async () => {
		if (Object.keys(ingredientsMap).length) return ingredientsMap;
		const snap = await getDocs(collection(db, "ingredients"));
		const map = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
		setIngredientsMap(map);
		return map;
	};

	const openSpec = async (menuItem) => {
		setSelected(menuItem);
		setSpecOpen(true);

		const rSnap = await getDoc(doc(db, "recipes", menuItem.recipeId));
		const r = rSnap.exists() ? rSnap.data() : null;
		setRecipe(r);

		const map = await ensureIngMap(); // 🔑 make sure we have allergens
		const cmp = await computeCostAndAllergens(db, r, map);
		setComputed(cmp);
		pushRecent(menuItem);
	};

	const openLabel = async (menuItem) => {
		// fetch recipe
		const rSnap = await getDoc(doc(db, "recipes", menuItem.recipeId));
		const r = rSnap.exists() ? rSnap.data() : { shelfLifeDays: 0 };
		setRecipe(r);

		// 🔑 make sure ingredient map is ready, then compute
		const map = await ensureIngMap();
		const cmp = await computeCostAndAllergens(db, r, map);
		setComputed(cmp);

		// open modal with fresh allergens
		setSelected(menuItem);
		setLabelOpen(true);
		pushRecent(menuItem);
	};

	// recent
	const recent = getRecent();
	function pushRecent(mi) {
		try {
			const list = getRecent().filter((x) => x.id !== mi.id);
			list.unshift({ id: mi.id, name: mi.name, ts: Date.now() });
			localStorage.setItem(
				"cul_recent",
				JSON.stringify(list.slice(0, 5))
			);
		} catch {}
	}
	function getRecent() {
		try {
			return JSON.parse(localStorage.getItem("cul_recent") || "[]");
		} catch {
			return [];
		}
	}

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100">
			<AppHeader />
			<div className="max-w-[1200px] mx-auto p-5">
				{/* Top row: tabs + search */}
				<div className="flex items-center justify-between mb-3">
					<div className="flex flex-wrap gap-2">
						{TYPES.map((t) => (
							<button
								key={t}
								onClick={() => {
									setActiveType(t);
									setQueryText("");
								}}
								className={`px-3 py-1 rounded-full text-[10px] border ${
									t === activeType
										? "bg-emerald-400 text-slate-900 border-transparent font-semibold"
										: "bg-transparent border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
								}`}
							>
								{t}
							</button>
						))}
					</div>
					<div className="flex items-center gap-2">
						<input
							id="globalSearch"
							value={queryText}
							onChange={(e) => setQueryText(e.target.value)}
							placeholder="Search items…"
							className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] w-56"
						/>
						{queryText && (
							<button
								onClick={() => setQueryText("")}
								className="px-2 py-1 rounded-full border border-slate-700 text-[10px]"
							>
								Clear
							</button>
						)}
					</div>
				</div>

				{/* Second row: stations (only for Line Station) */}
				{activeType === "Line Station" && (
					<div className="flex gap-2 mb-2">
						{STATIONS.map((s) => (
							<button
								key={s}
								onClick={() => {
									setActiveStation(s);
									setQueryText("");
								}}
								className={`px-3 py-1 rounded-full text-[10px] border ${
									s === activeStation
										? "bg-slate-800 text-slate-200 border-slate-600"
										: "bg-transparent border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
								}`}
							>
								{s}
							</button>
						))}
					</div>
				)}

				{/* Third row: alpha buckets (only for Line Station, when no search) */}
				{activeType === "Line Station" && !queryText && (
					<div className="mb-3">
						<AlphaBuckets
							items={items}
							activeIndex={bucketIndex}
							setActiveIndex={setBucketIndex}
						/>
					</div>
				)}

				{/* Recent (optional) */}
				{recent.length > 0 && !queryText && (
					<div className="mb-3">
						<div className="text-[10px] text-slate-400 mb-1">
							Recently viewed
						</div>
						<div className="flex gap-2 flex-wrap">
							{recent.map((r) => (
								<span
									key={r.id}
									className="px-2 py-1 rounded-full border border-slate-700 text-[10px] text-slate-300"
								>
									{r.name}
								</span>
							))}
						</div>
					</div>
				)}

				{/* Grid */}
				<div>
					{loading ? (
						<div className="text-[12px] text-slate-400">
							Loading…
						</div>
					) : visible.length ? (
						<div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
							{visible.map((it) => (
								<div
									key={it.id}
									className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3"
								>
									<div className="text-[12px] font-semibold">
										{it.name}
									</div>
									<div className="text-[10px] text-slate-500">
										{activeType === "Line Station"
											? `${it.station} · ${it.brand}`
											: `${it.type} · ${it.brand}`}
									</div>
									<div className="mt-2 flex gap-2">
										<button
											onClick={() => openSpec(it)}
											className="px-2 py-1 rounded-full border border-slate-700 text-[10px] hover:border-emerald-400 hover:text-emerald-300"
										>
											Spec
										</button>
										<button
											onClick={() => openLabel(it)}
											className="px-2 py-1 rounded-full border border-slate-700 text-[10px]"
										>
											Label
										</button>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="text-[12px] text-slate-500 mt-6">
							No items found
							{activeType === "Line Station"
								? ` in ${activeStation}`
								: ""}
							. Add some in Corporate → Menu.
						</div>
					)}
				</div>
			</div>

			<SpecPanel
				open={specOpen}
				onClose={() => setSpecOpen(false)}
				recipe={recipe}
				computed={computed}
				menuItem={selected}
			/>

			<LabelModal
				open={labelOpen}
				onClose={() => setLabelOpen(false)}
				itemName={selected?.name}
				shelfLifeDays={recipe?.shelfLifeDays}
				allergens={computed?.allergens || []}
			/>
		</div>
	);
}
