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
import SpecPanel from "./components/SpecPanel";
import LabelModal from "./components/Labelmodel";
import { computeCostAndAllergens } from "../../lib/costing";
import AllergenMatrixModal from "./components/AllergenMatrixModal";

const TYPES = ["Prep", "Purchased", "Expo", "Line Station"];
const STATIONS = ["Pantry", "Hot Pantry", "Fryer", "Grill", "Saute", "Mozza"];
// Alphabet ranges optimized for 13–15" laptops
const ALPHA_RANGES = [
	{ key: "A-C", from: "A", to: "C" },
	{ key: "D-H", from: "D", to: "H" },
	{ key: "I-M", from: "I", to: "M" },
	{ key: "N-R", from: "N", to: "R" },
	{ key: "S-Z", from: "S", to: "Z" },
];

export default function CulinaryDashboard() {
	const [activeType, setActiveType] = useState("Line Station");
	const [activeStation, setActiveStation] = useState("Pantry");
	const [queryText, setQueryText] = useState("");
	const [items, setItems] = useState([]); // active menuItems
	const [loading, setLoading] = useState(false);

	const [ingredientsMap, setIngredientsMap] = useState({});
	const [ingredientIdsByNameWord, setIngredientIdsByNameWord] = useState({}); // token -> Set(ids)
	const [ingredientNameIndex, setIngredientNameIndex] = useState({}); // map: ingredientId -> lowercased name

	const [selected, setSelected] = useState(null); // menu item
	const [recipe, setRecipe] = useState(null);
	const [computed, setComputed] = useState(null);
	const [specOpen, setSpecOpen] = useState(false);
	const [labelOpen, setLabelOpen] = useState(false);
	const [allItems, setAllItems] = useState([]);

	const [recipeNameMap, setRecipeNameMap] = useState({}); // recipeId -> recipeName
	const [recipeCache, setRecipeCache] = useState({}); // recipeId -> {lines: [...]}

	// alpha buckets
	const [bucketIndex, setBucketIndex] = useState(0);
	const [matrixOpen, setMatrixOpen] = useState(false);

	// Purchased tab: which A–Z range is active. "ALL" shows everything.
	const [activeAlphaRange, setActiveAlphaRange] = useState("ALL");

	const pinned = useMemo(
		() => items.filter((i) => getFavs().includes(i.id)),
		[items]
	);

	//Load a recipe name map to match by recipe title too
	useEffect(() => {
		(async () => {
			const snap = await getDocs(collection(db, "recipes"));
			const map = Object.fromEntries(
				snap.docs.map((d) => [d.id, d.data()?.name || ""])
			);
			setRecipeNameMap(map);
		})();
	}, []);

	// one-time load of all active menu items
	useEffect(() => {
		(async () => {
			const snap = await getDocs(
				query(collection(db, "menuItems"), where("active", "==", true))
			);
			setAllItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
		})();
	}, []);

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

	//  setIngredientsMap(map) in load ingredients map once" effect
	useEffect(() => {
		const idToNameLower = {};
		const tokenMap = {}; // simple token index for partial matches
		for (const [id, data] of Object.entries(ingredientsMap)) {
			const name = (data?.name || "").trim();
			const low = name.toLowerCase();
			idToNameLower[id] = low;

			// tokenize (very light)
			for (const tok of low.split(/[\s\-_,.()]+/).filter(Boolean)) {
				if (!tokenMap[tok]) tokenMap[tok] = new Set();
				tokenMap[tok].add(id);
			}
		}
		setIngredientNameIndex(idToNameLower);
		setIngredientIdsByNameWord(tokenMap);
	}, [ingredientsMap]);

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

	//Loads a light recipe cache (id → minimal doc) for search
	useEffect(() => {
		(async () => {
			const snap = await getDocs(collection(db, "recipes"));
			const rc = {};
			snap.docs.forEach((d) => {
				const data = d.data();
				rc[d.id] = { lines: data?.lines || [], name: data?.name || "" };
			});
			setRecipeCache(rc);
		})();
	}, []);

	function ingredientIdsMatchingQuery(q) {
		// exact substring match over whole name first
		const hitIds = new Set(
			Object.entries(ingredientNameIndex)
				.filter(([_, name]) => name.includes(q))
				.map(([id]) => id)
		);

		// also try token startsWith (quick fuzzy)
		for (const [tok, ids] of Object.entries(ingredientIdsByNameWord)) {
			if (tok.startsWith(q)) ids.forEach((id) => hitIds.add(id));
		}
		return hitIds;
	}

	// cache of recipeId -> boolean/map to avoid recompute if you like (optional)
	function recipeContainsAny(recipeDoc, hitSet) {
		for (const ln of recipeDoc?.lines || []) {
			if (hitSet.has(ln.ingredientId)) return true;
		}
		return false;
	}

	// search filter
	const visible = useMemo(() => {
		const raw = (queryText || "").trim();
		const q = raw.toLowerCase();

		if (q.length > 0) {
			// 1) text match over all items (name/brand/type/station/recipeName)
			const baseMatches = allItems.filter((it) => {
				const inName = (it.name || "").toLowerCase().includes(q);
				const inBrand = (it.brand || "").toLowerCase().includes(q);
				const inType = (it.type || "").toLowerCase().includes(q);
				const inStation = (it.station || "").toLowerCase().includes(q);
				const inRecipe = (recipeNameMap[it.recipeId] || "")
					.toLowerCase()
					.includes(q);
				return inName || inBrand || inType || inStation || inRecipe;
			});

			// 2) ingredient-driven matches: any item whose recipe uses a matched ingredient
			const ingHitIds = ingredientIdsMatchingQuery(q);
			const recipeIdsWithHit = new Set(
				Object.entries(recipeCache)
					.filter(([_, r]) => recipeContainsAny(r, ingHitIds))
					.map(([rid]) => rid)
			);

			const ingredientMatches = allItems.filter((it) =>
				recipeIdsWithHit.has(it.recipeId)
			);

			// merge (avoid dupes)
			const mergedMap = new Map();
			[...baseMatches, ...ingredientMatches].forEach((it) =>
				mergedMap.set(it.id, it)
			);
			return [...mergedMap.values()];
		}

		// browse mode (no search)
		let base = items;
		if (activeType === "Line Station") {
			base = sliceByBucket(items, bucketIndex);
		}
		return base;
	}, [
		queryText,
		allItems,
		recipeNameMap,
		recipeCache,
		items,
		activeType,
		bucketIndex,
		ingredientNameIndex,
		ingredientIdsByNameWord,
	]);

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

	//Tiny UI cue for ingredient-based matches
	const matchesIngredient = (mi) => {
		const q = (queryText || "").trim().toLowerCase();
		if (!q) return "";
		const ingHitIds = ingredientIdsMatchingQuery(q);
		const r = recipeCache[mi.recipeId];
		if (!r) return "";
		const hit = (r.lines || []).find((ln) =>
			ingHitIds.has(ln.ingredientId)
		);
		if (!hit) return "";
		const ingName = ingredientsMap[hit.ingredientId]?.name || "ingredient";
		return `Matched by ingredient: ${ingName}`;
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

	//pins for favs
	function getFavs() {
		try {
			return JSON.parse(localStorage.getItem("cul_fav") || "[]");
		} catch {
			return [];
		}
	}
	function setFavs(list) {
		try {
			localStorage.setItem("cul_fav", JSON.stringify(list));
		} catch {}
	}
	const favIds = new Set(getFavs());

	function toggleFav(id) {
		const list = getFavs();
		const idx = list.indexOf(id);
		if (idx >= 0) list.splice(idx, 1);
		else list.push(id);
		setFavs(list);
	}
	//Debounce the search input
	function useDebounced(value, delay = 200) {
		const [v, setV] = useState(value);
		useEffect(() => {
			const t = setTimeout(() => setV(value), delay);
			return () => clearTimeout(t);
		}, [value, delay]);
		return v;
	}
	const debouncedQuery = useDebounced(queryText, 150);
	useEffect(() => {
		const onKey = (e) => {
			if (e.key === "/") {
				e.preventDefault();
				const el = document.getElementById("globalSearch");
				el?.focus();
			}
			if (e.key === "Escape") {
				setQueryText("");
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Turn ingredientsMap into an array
	const ingredientsArr = useMemo(
		() =>
			Object.entries(ingredientsMap).map(([id, data]) => ({
				id,
				...(data || {}),
				name: data?.name || "",
			})),
		[ingredientsMap]
	);
	const filteredIngredients = useMemo(() => {
		const q = (debouncedQuery || "").trim().toLowerCase();
		let arr = ingredientsArr;

		if (q) {
			arr = arr.filter((g) => (g.name || "").toLowerCase().includes(q));
		}

		if (activeType === "Purchased" && activeAlphaRange !== "ALL" && !q) {
			const { from, to } =
				ALPHA_RANGES.find((r) => r.key === activeAlphaRange) || {};
			if (from && to) {
				arr = arr.filter((g) => inRange(g.name, from, to));
			}
		}

		// Stable alphabetical order for nice scanning
		return [...arr].sort((a, b) => a.name.localeCompare(b.name));
	}, [ingredientsArr, debouncedQuery, activeType, activeAlphaRange]);

	//Helper to open a label for a raw ingredient
	const openIngredientLabel = (ing) => {
		setSelected({ id: ing.id, name: ing.name });
		setRecipe({
			shelfLifeDays: Number(ing.shelfLifeDays || 0), // optional if you store this
			lines: [], // raw ingredient label has no recipe lines
		});
		setComputed({
			allergens: ing.allergens || [],
		});
		setLabelOpen(true);
	};

	function firstLetterUp(s = "") {
		const c = (s || "").trim().charAt(0).toUpperCase();
		return c >= "A" && c <= "Z" ? c : "#";
	}

	function inRange(name, from, to) {
		const c = firstLetterUp(name);
		if (c === "#") return false;
		return c >= from && c <= to;
	}

	// Open a spec when you only know the recipeId (for components / reverse links)
	const openSpecByRecipeId = async (recipeId) => {
		if (!recipeId) return;

		// try to find an existing menuItem that uses this recipe
		const mi =
			allItems.find((m) => m.recipeId === recipeId) ||
			items.find((m) => m.recipeId === recipeId);

		// fetch recipe
		const rSnap = await getDoc(doc(db, "recipes", recipeId));
		const r = rSnap.exists() ? rSnap.data() : null;
		setRecipe(r);

		const map = await ensureIngMap();
		const cmp = await computeCostAndAllergens(db, r, map);
		setComputed(cmp);

		// pick a label for the left header
		setSelected(
			mi || {
				id: recipeId,
				name: r?.name || "Spec",
				type: "Prep",
				station: "Pantry",
				brand: "",
			}
		);
		setSpecOpen(true);
	};

	const menuItemsById = useMemo(() => {
		const m = {};
		allItems.forEach((mi) => {
			m[mi.id] = mi;
		});
		return m;
	}, [allItems]);

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
								className={`px-8 py-2 rounded-full text-[10px] border ${
									t === activeType
										? "bg-emerald-400 text-slate-900 border-transparent font-bold"
										: "bg-transparent border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300 font-bold"
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
					<button
						onClick={() => setMatrixOpen(true)}
						className="px-3 py-1 rounded-full border border-slate-700 text-[10px] hover:border-emerald-400 hover:text-emerald-300"
					>
						Allergen Matrix
					</button>
				</div>
				{/* Second row: stations (only for Line Station) */}
				{activeType === "Line Station" && (
					<div className="flex justify-self-start gap-2 mb-2">
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

				{pinned.length > 0 && !queryText && (
					<div className="mb-3">
						<div className="text-[10px] text-slate-400 mb-1">
							Pinned
						</div>
						<div className="flex gap-2 overflow-x-auto">
							{pinned.map((p) => (
								<span
									key={p.id}
									className="px-2 py-1 rounded-full border border-slate-700 text-[10px]"
								>
									{p.name}
								</span>
							))}
						</div>
					</div>
				)}

				{queryText ? (
					<div className="text-[10px] text-slate-400 mb-2">
						Showing global results for{" "}
						<span className="text-slate-200">“{queryText}”</span>{" "}
						across all types & stations
					</div>
				) : null}

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
									{/* If global search is active and this item matched via ingredient, show a hint */}
									{queryText &&
										(() => {
											const msg = matchesIngredient(it);
											return msg ? (
												<div className="text-[10px] text-emerald-300 mt-1">
													{msg}
												</div>
											) : null;
										})()}

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
										<button
											title="Pin/Favorite"
											onClick={() => {
												toggleFav(
													it.id
												); /* no re-render trigger needed for demo */
											}}
											className="ml-auto px-2 py-1 rounded-full border border-slate-700 text-[10px]"
										>
											★
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
				{/* 
				{activeType === "Purchased" && !queryText && (
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<button
							onClick={() => setActiveAlphaRange("ALL")}
							className={`px-2 py-1 rounded-full text-[10px] border ${
								activeAlphaRange === "ALL"
									? "bg-slate-800 text-slate-200 border-slate-600"
									: "bg-transparent border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
							}`}
						>
							All
						</button>
						{ALPHA_RANGES.map((r) => (
							<button
								key={r.key}
								onClick={() => setActiveAlphaRange(r.key)}
								className={`px-2 py-1 rounded-full text-[10px] border ${
									activeAlphaRange === r.key
										? "bg-slate-800 text-slate-200 border-slate-600"
										: "bg-transparent border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
								}`}
							>
								{r.key}
							</button>
						))}
					</div>
				)} */}

				{/* Purchased: full ingredient list with Label buttons (range-aware) */}
				{activeType === "Purchased" && (
					<div className="mt-4">
						{/* Range chips when not searching */}
						{!debouncedQuery && (
							<div className="mb-2 flex flex-wrap items-center gap-2">
								<button
									onClick={() => setActiveAlphaRange("ALL")}
									className={`px-2 py-1 rounded-full text-[10px] border ${
										activeAlphaRange === "ALL"
											? "bg-slate-800 text-slate-200 border-slate-600"
											: "bg-transparent border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
									}`}
								>
									All
								</button>
								{ALPHA_RANGES.map((r) => (
									<button
										key={r.key}
										onClick={() =>
											setActiveAlphaRange(r.key)
										}
										className={`px-2 py-1 rounded-full text-[10px] border ${
											activeAlphaRange === r.key
												? "bg-slate-800 text-slate-200 border-slate-600"
												: "bg-transparent border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
										}`}
									>
										{r.key}
									</button>
								))}
							</div>
						)}

						<div className="text-[10px] text-slate-400 mb-1">
							Ingredients ({filteredIngredients.length})
							{activeAlphaRange !== "ALL" && !debouncedQuery && (
								<>
									{" "}
									· Range:{" "}
									<span className="text-slate-200">
										{activeAlphaRange}
									</span>
								</>
							)}
						</div>

						{/* Scrollable area sized for laptop screens */}
						<div className="max-h-[58vh] overflow-auto pr-1">
							<div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
								{filteredIngredients.map((g) => (
									<div
										key={g.id}
										className="bg-slate-900/60 border border-slate-800 rounded-xl p-3"
									>
										<div
											className="text-[12px] font-semibold truncate"
											title={g.name}
										>
											{g.name}
										</div>
										<div className="text-[10px] text-slate-500">
											Ingredient
										</div>

										{Array.isArray(g.allergens) &&
											g.allergens.length > 0 && (
												<div className="mt-1 flex flex-wrap gap-1">
													{g.allergens.map((a) => (
														<span
															key={a}
															className="px-2 py-0.5 rounded-full border border-amber-400 text-amber-300 text-[9px]"
														>
															{a}
														</span>
													))}
												</div>
											)}

										<div className="mt-2 flex gap-2">
											<button
												onClick={() =>
													openIngredientLabel(g)
												}
												className="px-2 py-1 rounded-full border border-slate-700 text-[10px]"
											>
												Label
											</button>
										</div>
									</div>
								))}

								{!filteredIngredients.length && (
									<div className="text-[12px] text-slate-500 col-span-full py-4">
										No ingredients found.
									</div>
								)}
							</div>
						</div>
					</div>
				)}
			</div>

			<SpecPanel
				open={specOpen}
				onClose={() => setSpecOpen(false)}
				recipe={recipe}
				computed={computed}
				menuItem={selected}
				// 🔽 new props
				recipeNameMap={recipeNameMap}
				menuItemsById={menuItemsById}
				onOpenByRecipeId={openSpecByRecipeId}
			/>

			<LabelModal
				open={labelOpen}
				onClose={() => setLabelOpen(false)}
				itemName={selected?.name}
				shelfLifeDays={recipe?.shelfLifeDays}
				allergens={computed?.allergens || []}
			/>

			<AllergenMatrixModal
				open={matrixOpen}
				onClose={() => setMatrixOpen(false)}
				items={visible} // matrix from current view
				ingredientsMap={ingredientsMap}
			/>
		</div>
	);
}
