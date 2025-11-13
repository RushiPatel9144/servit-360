/** @format
 * SalesInsights.jsx — Corporate → Sales & Food Cost
 *
 * - Filter by location + date range (presets + custom)
 * - Load serverSales + menuItems + recipes + ingredients
 * - Compute theoretical food cost from recipes & ingredient prices
 * - Show KPI tiles + summary tables
 */

import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

const TARGET_FOOD_COST_PCT = 50; // HQ target % for food cost

/************* helpers *************/
const formatCurrency = (n) => `\$${(Number(n) || 0).toFixed(2)}`;

const formatPct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

const norm = (s) => (s || "").trim().toLowerCase();

function toYmd(d) {
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function todayYmd() {
	return toYmd(new Date());
}

function computeRange(type) {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	let start = today;
	let end = today;

	if (type === "today") {
		// today only
	} else if (type === "yesterday") {
		start = new Date(today);
		start.setDate(start.getDate() - 1);
		end = start;
	} else if (type === "thisWeek") {
		const day = today.getDay(); // 0-6
		const diff = (day + 6) % 7; // treat Monday as start
		start = new Date(today);
		start.setDate(start.getDate() - diff);
	} else if (type === "lastWeek") {
		const day = today.getDay();
		const diff = (day + 6) % 7;
		end = new Date(today);
		end.setDate(end.getDate() - diff - 1);
		start = new Date(end);
		start.setDate(start.getDate() - 6);
	} else if (type === "thisMonth") {
		start = new Date(today.getFullYear(), today.getMonth(), 1);
	}

	return {
		start: toYmd(start),
		end: toYmd(end),
	};
}

function tsToStr(v) {
	if (!v) return "—";
	if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
	return String(v).slice(0, 10);
}

/************* core cost helpers (reuse logic from RecipesManager) *************/
async function fetchIngredients() {
	const snap = await getDocs(collection(db, "ingredients"));
	const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
	const map = Object.fromEntries(list.map((i) => [i.id, i]));
	return { list, map };
}

async function fetchLatestPriceForIngredient(ingredientId) {
	const snap = await getDocs(
		collection(db, "ingredients", ingredientId, "prices")
	);
	const prices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
	if (!prices.length) return null;
	const current = prices.find((p) => p.effectiveTo == null);
	if (current) return current;
	const take = (p) =>
		p.effectiveFrom?.seconds
			? p.effectiveFrom.seconds
			: Date.parse(p.effectiveFrom || 0) / 1000;
	return prices.slice().sort((a, b) => take(b) - take(a))[0];
}

async function computeRecipeCostPerPortion(recipe, ingredientMap) {
	let total = 0;
	for (const line of recipe.lines || []) {
		const price = await fetchLatestPriceForIngredient(line.ingredientId);
		const unitCost = Number(price?.unitCost || 0);
		total += unitCost * Number(line.qty || 0);
	}
	const y = Number(recipe.yield || 1) || 1;
	return total / y;
}

/************* main component *************/
const LOCATION_OPTIONS = [
	{ id: "ALL", label: "All locations" },
	{ id: "Burlington", label: "Burlington" },
	{ id: "Guelph", label: "Guelph" },
];

const RANGE_OPTIONS = [
	{ id: "today", label: "Today" },
	{ id: "yesterday", label: "Yesterday" },
	{ id: "thisWeek", label: "This Week" },
	{ id: "lastWeek", label: "Last Week" },
	{ id: "thisMonth", label: "This Month" },
	{ id: "custom", label: "Custom" },
];

export default function SalesInsights() {
	// base data
	const [ingredients, setIngredients] = useState({ list: [], map: {} });
	const [recipes, setRecipes] = useState([]);
	const [menuItems, setMenuItems] = useState([]);
	const [costPerMenuItem, setCostPerMenuItem] = useState({});
	const [baseLoading, setBaseLoading] = useState(true);

	// sales data
	const [sales, setSales] = useState([]);
	const [salesLoading, setSalesLoading] = useState(false);

	// filters
	const [locationId, setLocationId] = useState("ALL");
	const [rangeType, setRangeType] = useState("today");
	const [startDate, setStartDate] = useState(todayYmd());
	const [endDate, setEndDate] = useState(todayYmd());

	// 1) Load base data: ingredients, recipes, active menuItems
	useEffect(() => {
		(async () => {
			try {
				setBaseLoading(true);
				const [ing, recSnap, menuSnap] = await Promise.all([
					fetchIngredients(),
					getDocs(collection(db, "recipes")),
					getDocs(collection(db, "menuItems")),
				]);
				setIngredients(ing);
				setRecipes(
					recSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
				);
				setMenuItems(
					menuSnap.docs
						.map((d) => ({ id: d.id, ...d.data() }))
						.filter((m) => m.active !== false)
				);
			} catch (e) {
				console.error("Error loading base data:", e);
			} finally {
				setBaseLoading(false);
			}
		})();
	}, []);

	// 2) When recipes + ingredients + menuItems ready, compute costPerMenuItem
	useEffect(() => {
		(async () => {
			if (
				!ingredients.list.length ||
				!recipes.length ||
				!menuItems.length
			)
				return;

			try {
				const recipeCostMap = {};
				for (const r of recipes) {
					const c = await computeRecipeCostPerPortion(
						r,
						ingredients.map
					);
					recipeCostMap[r.id] = c;
				}

				const menuCostMap = {};
				for (const mi of menuItems) {
					if (mi.recipeId && recipeCostMap[mi.recipeId] != null) {
						menuCostMap[mi.id] = recipeCostMap[mi.recipeId];
					} else {
						menuCostMap[mi.id] = 0;
					}
				}
				setCostPerMenuItem(menuCostMap);
			} catch (e) {
				console.error("Error computing menu costs:", e);
			}
		})();
	}, [ingredients, recipes, menuItems]);

	// 3) Update date range when preset changes
	useEffect(() => {
		if (rangeType === "custom") return;
		const { start, end } = computeRange(rangeType);
		setStartDate(start);
		setEndDate(end);
	}, [rangeType]);

	// 4) Load sales whenever filters change (and dates are set)
	useEffect(() => {
		if (!startDate || !endDate) return;

		(async () => {
			try {
				setSalesLoading(true);
				const ref = collection(db, "serverSales");
				const wheres = [
					where("serviceDate", ">=", startDate),
					where("serviceDate", "<=", endDate),
				];
				let qRef = query(ref, ...wheres);
				if (locationId !== "ALL") {
					qRef = query(
						ref,
						...wheres,
						where("locationId", "==", locationId)
					);
				}
				const snap = await getDocs(qRef);
				const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
				setSales(list);
			} catch (e) {
				console.error("Error loading sales:", e);
			} finally {
				setSalesLoading(false);
			}
		})();
	}, [startDate, endDate, locationId]);

	// 5) Aggregations
	const analytics = useMemo(() => {
		if (!sales.length) {
			return {
				totalSales: 0,
				totalItems: 0,
				totalCOGS: 0,
				foodCostPct: 0,
				byDate: [],
				topItems: [],
				byLocation: [],
				avgCheck: 0,
				tablesCount: 0,
			};
		}

		let totalSales = 0;
		let totalItems = 0;
		let totalCOGS = 0;
		const byDateMap = {};
		const byItemMap = {};
		const byLocationMap = {};
		const tablesSet = new Set();

		for (const s of sales) {
			const date = s.serviceDate || tsToStr(s.createdAt);
			const qty = Number(s.qty) || 1;
			const lineSales =
				typeof s.lineTotal === "number"
					? s.lineTotal
					: (Number(s.pricePerUnit) || 0) * qty;

			const costPerUnit = costPerMenuItem[s.menuItemId] || 0;
			const lineCOGS = costPerUnit * qty;

			totalSales += lineSales;
			totalItems += qty;
			totalCOGS += lineCOGS;

			// per date
			if (!byDateMap[date]) {
				byDateMap[date] = {
					date,
					sales: 0,
					items: 0,
					cogs: 0,
				};
			}
			byDateMap[date].sales += lineSales;
			byDateMap[date].items += qty;
			byDateMap[date].cogs += lineCOGS;

			// per item
			if (!byItemMap[s.menuItemId]) {
				byItemMap[s.menuItemId] = {
					id: s.menuItemId,
					name: s.menuItemName || s.itemName || s.menuItemId,
					station: s.station || "",
					type: s.type || "",
					qty: 0,
					sales: 0,
					cogs: 0,
				};
			}
			byItemMap[s.menuItemId].qty += qty;
			byItemMap[s.menuItemId].sales += lineSales;
			byItemMap[s.menuItemId].cogs += lineCOGS;

			// per location
			const loc = s.locationId || "Unknown";
			if (!byLocationMap[loc]) {
				byLocationMap[loc] = {
					locationId: loc,
					sales: 0,
					items: 0,
					cogs: 0,
				};
			}
			byLocationMap[loc].sales += lineSales;
			byLocationMap[loc].items += qty;
			byLocationMap[loc].cogs += lineCOGS;

			// tables
			if (s.table) {
				tablesSet.add(`${date}|${s.table}`);
			}
		}

		const foodCostPct = totalSales > 0 ? (totalCOGS / totalSales) * 100 : 0;

		const variancePct = foodCostPct - TARGET_FOOD_COST_PCT;

		const byDate = Object.values(byDateMap).sort((a, b) =>
			a.date.localeCompare(b.date)
		);

		const topItems = Object.values(byItemMap)
			.sort((a, b) => b.sales - a.sales)
			.slice(0, 10);

		const byLocation = Object.values(byLocationMap);

		const tablesCount = tablesSet.size;
		const avgCheck = tablesCount > 0 ? totalSales / tablesCount : 0;

		return {
			totalSales,
			totalItems,
			totalCOGS,
			foodCostPct,
			variancePct,
			byDate,
			topItems,
			byLocation,
			avgCheck,
			tablesCount,
		};
	}, [sales, costPerMenuItem]);

	const rangeLabel = useMemo(
		() => `${startDate} → ${endDate}`,
		[startDate, endDate]
	);

	return (
		<div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="text-[13px] font-semibold text-slate-50">
						Sales & Insights
					</h2>
					<p className="text-[11px] text-slate-400">
						Theoretical food cost based on recipes & ingredient
						prices.
					</p>
				</div>
				<div className="flex flex-wrap gap-2 text-[11px]">
					<select
						value={locationId}
						onChange={(e) => setLocationId(e.target.value)}
						className="px-2.5 py-1.5 rounded-full bg-slate-950 border border-slate-700"
					>
						{LOCATION_OPTIONS.map((l) => (
							<option
								key={l.id}
								value={l.id}
							>
								{l.label}
							</option>
						))}
					</select>
					<select
						value={rangeType}
						onChange={(e) => setRangeType(e.target.value)}
						className="px-2.5 py-1.5 rounded-full bg-slate-950 border border-slate-700"
					>
						{RANGE_OPTIONS.map((r) => (
							<option
								key={r.id}
								value={r.id}
							>
								{r.label}
							</option>
						))}
					</select>
					{rangeType === "custom" && (
						<>
							<input
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
								className="px-2 py-1.5 rounded-full bg-slate-950 border border-slate-700"
							/>
							<input
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
								className="px-2 py-1.5 rounded-full bg-slate-950 border border-slate-700"
							/>
						</>
					)}
				</div>
			</div>

			{/* loading state */}
			{(baseLoading || salesLoading) && (
				<div className="text-[11px] text-slate-400">
					Loading {baseLoading ? "base data" : "sales"}…
				</div>
			)}

			{/* KPI cards */}
			{!baseLoading && (
				<div className="grid md:grid-cols-4 gap-3 text-[11px]">
					<KpiCard
						label="Total Sales"
						value={formatCurrency(analytics.totalSales)}
						sub={rangeLabel}
					/>
					<KpiCard
						label="Items Sold"
						value={analytics.totalItems}
						sub={`${analytics.tablesCount} tables`}
					/>
					<KpiCard
						label="Food Cost % (Theoretical)"
						value={formatPct(analytics.foodCostPct)}
						sub={
							analytics.totalSales > 0
								? `${formatCurrency(
										analytics.totalCOGS
								  )} · Target ${formatPct(
										TARGET_FOOD_COST_PCT
								  )} · Var ${
										analytics.variancePct >= 0 ? "+" : ""
								  }${formatPct(analytics.variancePct)}`
								: "No sales in range"
						}
					/>

					<KpiCard
						label="Avg Check (per table)"
						value={formatCurrency(analytics.avgCheck)}
						sub={
							locationId === "ALL" ? "All locations" : locationId
						}
					/>
				</div>
			)}

			{/* By date summary */}
			{!baseLoading && (
				<div className="grid md:grid-cols-2 gap-4">
					<div className="rounded-2xl border border-slate-800 p-3">
						<div className="flex items-center justify-between mb-2">
							<div className="text-[11px] font-semibold text-slate-200">
								Daily Sales
							</div>
							<div className="text-[10px] text-slate-500">
								{analytics.byDate.length || 0} day(s)
							</div>
						</div>
						{analytics.byDate.length === 0 ? (
							<div className="text-[11px] text-slate-500">
								No sales in this period.
							</div>
						) : (
							<div className="space-y-1">
								{analytics.byDate.map((d) => (
									<div
										key={d.date}
										className="text-[11px]"
									>
										<div className="flex justify-between">
											<span className="text-slate-300">
												{d.date}
											</span>
											<span className="font-semibold text-emerald-300">
												{formatCurrency(d.sales)}
											</span>
										</div>
										{/* tiny bar */}
										<div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
											<div
												className="h-full bg-emerald-400/80"
												style={{
													width:
														analytics.byDate[0]
															.sales > 0
															? `${Math.max(
																	5,
																	(d.sales /
																		analytics
																			.byDate[0]
																			.sales) *
																		100
															  )}%`
															: "0%",
												}}
											/>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Top items */}
					<div className="rounded-2xl border border-slate-800 p-3">
						<div className="flex items-center justify-between mb-2">
							<div className="text-[11px] font-semibold text-slate-200">
								Top Items (by sales)
							</div>
							<div className="text-[10px] text-slate-500">
								{analytics.topItems.length || 0} item(s)
							</div>
						</div>
						{analytics.topItems.length === 0 ? (
							<div className="text-[11px] text-slate-500">
								No data yet.
							</div>
						) : (
							<div className="space-y-1">
								{analytics.topItems.map((it) => {
									const itemFoodCostPct =
										it.sales > 0
											? (it.cogs / it.sales) * 100
											: 0;
									return (
										<div
											key={it.id}
											className="text-[11px] border-b border-slate-800 last:border-0 pb-1 last:pb-0"
										>
											<div className="flex justify-between gap-2">
												<div>
													<div className="font-semibold text-slate-100">
														{it.name}
													</div>
													<div className="text-[10px] text-slate-500">
														{it.type} · {it.station}{" "}
														· Qty {it.qty}
													</div>
												</div>
												<div className="text-right">
													<div className="font-semibold text-emerald-300">
														{formatCurrency(
															it.sales
														)}
													</div>
													<div className="text-[10px] text-slate-400">
														Theo cost{" "}
														{formatCurrency(
															it.cogs
														)}{" "}
														·{" "}
														{formatPct(
															itemFoodCostPct
														)}
													</div>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			)}

			{/* by location summary (nice for ALL view) */}
			{!baseLoading && analytics.byLocation.length > 0 && (
				<div className="rounded-2xl border border-slate-800 p-3">
					<div className="flex items-center justify-between mb-2">
						<div className="text-[11px] font-semibold text-slate-200">
							Sales by Location
						</div>
						<div className="text-[10px] text-slate-500">
							{analytics.byLocation.length} location(s)
						</div>
					</div>
					<table className="w-full text-[11px]">
						<thead>
							<tr className="text-slate-400 border-b border-slate-800">
								<th className="text-left py-1">Location</th>
								<th className="text-right py-1">Sales</th>
								<th className="text-right py-1">Theo COGS</th>
								<th className="text-right py-1">Food Cost %</th>
							</tr>
						</thead>
						<tbody>
							{analytics.byLocation.map((loc) => {
								const pct =
									loc.sales > 0
										? (loc.cogs / loc.sales) * 100
										: 0;
								return (
									<tr
										key={loc.locationId}
										className="border-b border-slate-900/60"
									>
										<td className="py-1">
											{loc.locationId}
										</td>
										<td className="py-1 text-right">
											{formatCurrency(loc.sales)}
										</td>
										<td className="py-1 text-right">
											{formatCurrency(loc.cogs)}
										</td>
										<td className="py-1 text-right">
											{formatPct(pct)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

/************* small KPI card *************/
function KpiCard({ label, value, sub }) {
	return (
		<div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
			<div className="text-[10px] text-slate-400 mb-1">{label}</div>
			<div className="text-sm font-semibold text-slate-50">{value}</div>
			{sub && (
				<div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
			)}
		</div>
	);
}
