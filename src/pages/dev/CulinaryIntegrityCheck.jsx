/** @format */
import React, { useState } from "react";
import { db } from "../../firebase";
import {
	collection,
	getDocs,
	doc,
	updateDoc,
	serverTimestamp,
} from "firebase/firestore";

function norm(str) {
	return (str || "").trim().toLowerCase();
}

export default function CulinaryIntegrityCheck() {
	const [busy, setBusy] = useState(false);
	const [log, setLog] = useState([]);
	const [results, setResults] = useState(null);
	const [autoFixBusy, setAutoFixBusy] = useState(false);

	const pushLog = (msg) => {
		setLog((prev) => [
			`${new Date().toLocaleTimeString()} — ${msg}`,
			...prev,
		]);
		console.log(msg);
	};

	const runScan = async () => {
		setBusy(true);
		setResults(null);
		setLog([]);
		try {
			pushLog("🔍 Starting culinary data integrity scan…");

			// 1) Load base collections
			const [menuSnap, recipeSnap, ingSnap] = await Promise.all([
				getDocs(collection(db, "menuItems")),
				getDocs(collection(db, "recipes")),
				getDocs(collection(db, "ingredients")),
			]);

			const menuItems = menuSnap.docs.map((d) => ({
				id: d.id,
				...d.data(),
			}));
			const recipes = recipeSnap.docs.map((d) => ({
				id: d.id,
				...d.data(),
			}));
			const ingredients = ingSnap.docs.map((d) => ({
				id: d.id,
				...d.data(),
			}));

			pushLog(
				`Loaded ${menuItems.length} menuItems, ${recipes.length} recipes, ${ingredients.length} ingredients.`
			);

			const recipeMap = Object.fromEntries(recipes.map((r) => [r.id, r]));
			const ingredientMap = Object.fromEntries(
				ingredients.map((i) => [i.id, i])
			);

			// 2) For each ingredient, check pricing
			const ingredientCostReady = {};
			const ingredientIssues = [];

			for (const ing of ingredients) {
				const pricesSnap = await getDocs(
					collection(db, "ingredients", ing.id, "prices")
				);
				const prices = pricesSnap.docs.map((d) => ({
					id: d.id,
					...d.data(),
				}));

				let problems = [];
				let hasCurrentPrice = false;

				if (!prices.length) {
					problems.push("No prices in prices subcollection.");
				} else {
					const current = prices.find((p) => p.effectiveTo == null);
					if (!current) {
						problems.push(
							"No active price row (effectiveTo == null)."
						);
					} else if (!current.unitCost && current.unitCost !== 0) {
						problems.push("Active price row is missing unitCost.");
					} else {
						hasCurrentPrice = true;
					}
				}

				ingredientCostReady[ing.id] = hasCurrentPrice;

				if (problems.length > 0) {
					ingredientIssues.push({
						id: ing.id,
						name: ing.name || "(no name)",
						problems,
					});
				}
			}

			pushLog(
				`Ingredient pricing check complete. ${ingredientIssues.length} ingredients have issues.`
			);

			// 3) Check recipes: missing ingredients / yields / costability
			const recipeIssues = [];
			const recipeCostable = {};

			for (const r of recipes) {
				let problems = [];
				const lines = r.lines || [];

				if (!r.yield || r.yield <= 0) {
					problems.push("Yield is missing or <= 0.");
				}

				let allIngredientsExist = true;
				let allIngredientsPriced = true;

				for (const ln of lines) {
					const ingId = ln.ingredientId;
					if (!ingId || !ingredientMap[ingId]) {
						problems.push(
							`Missing ingredient: ingredientId "${ingId}" not found.`
						);
						allIngredientsExist = false;
						allIngredientsPriced = false; // can't cost if missing entirely
						continue;
					}
					if (!ingredientCostReady[ingId]) {
						problems.push(
							`Ingredient "${
								ingredientMap[ingId].name || ingId
							}" has no active price.`
						);
						allIngredientsPriced = false;
					}
				}

				const isCostable =
					allIngredientsExist &&
					allIngredientsPriced &&
					!!r.yield &&
					r.yield > 0;
				recipeCostable[r.id] = isCostable;

				if (problems.length > 0) {
					recipeIssues.push({
						id: r.id,
						name: r.name || "(no name)",
						problems,
					});
				}
			}

			pushLog(
				`Recipe integrity check complete. ${recipeIssues.length} recipes have issues.`
			);

			// 4) Check menuItems: recipe links & cost readiness
			const menuIssues = [];
			let costReadyCount = 0;
			let costBlockedCount = 0;

			for (const mi of menuItems) {
				let problems = [];
				let canAutoFix = false;
				let suggestedRecipeId = null;
				let suggestedRecipeName = null;

				if (!mi.recipeId) {
					problems.push("Missing recipeId field on menuItem.");

					// Try to match by name
					const miName = norm(mi.name);
					const exactMatches = recipes.filter(
						(r) => norm(r.name) === miName
					);
					const looseMatches = recipes.filter(
						(r) =>
							norm(r.name).includes(miName) ||
							miName.includes(norm(r.name))
					);

					const candidate =
						exactMatches[0] || looseMatches[0] || null;
					if (candidate) {
						canAutoFix = true;
						suggestedRecipeId = candidate.id;
						suggestedRecipeName = candidate.name;
						problems.push(
							`Can auto-link to recipe "${candidate.name}".`
						);
					}
				} else if (!recipeMap[mi.recipeId]) {
					problems.push(
						`recipeId "${mi.recipeId}" does not match any recipe document.`
					);

					// Try to recover by name
					const miName = norm(mi.name);
					const exactMatches = recipes.filter(
						(r) => norm(r.name) === miName
					);
					const looseMatches = recipes.filter(
						(r) =>
							norm(r.name).includes(miName) ||
							miName.includes(norm(r.name))
					);
					const candidate =
						exactMatches[0] || looseMatches[0] || null;
					if (candidate) {
						canAutoFix = true;
						suggestedRecipeId = candidate.id;
						suggestedRecipeName = candidate.name;
						problems.push(
							`Can auto-link to recipe "${candidate.name}".`
						);
					}
				} else {
					// Has a recipeId that exists
					const r = recipeMap[mi.recipeId];
					if (!recipeCostable[mi.recipeId]) {
						problems.push(
							"Linked recipe is not fully costable (missing prices / yield / ingredients)."
						);
						costBlockedCount++;
					} else {
						costReadyCount++;
					}
				}

				if (problems.length > 0) {
					menuIssues.push({
						id: mi.id,
						name: mi.name || "(no name)",
						station: mi.station || "",
						type: mi.type || "",
						problems,
						canAutoFix,
						suggestedRecipeId,
						suggestedRecipeName,
					});
				}
			}

			pushLog(
				`Menu item check complete. ${menuIssues.length} menuItems have issues.`
			);

			const summary = {
				totalMenuItems: menuItems.length,
				totalRecipes: recipes.length,
				totalIngredients: ingredients.length,
				costReadyMenuItems: costReadyCount,
				costBlockedMenuItems: costBlockedCount,
				ingredientIssuesCount: ingredientIssues.length,
				recipeIssuesCount: recipeIssues.length,
				menuIssuesCount: menuIssues.length,
			};

			setResults({
				summary,
				menuIssues,
				recipeIssues,
				ingredientIssues,
			});

			pushLog("✅ Integrity scan complete.");
		} catch (err) {
			console.error(err);
			pushLog("❌ Error during integrity scan. Check console.");
		} finally {
			setBusy(false);
		}
	};

	const handleAutoFixMenuLinks = async () => {
		if (!results || !results.menuIssues?.length) return;
		if (
			!window.confirm(
				"Auto-link menuItems to suggested recipes where possible?"
			)
		) {
			return;
		}

		setAutoFixBusy(true);
		try {
			let updatedCount = 0;
			for (const issue of results.menuIssues) {
				if (!issue.canAutoFix || !issue.suggestedRecipeId) continue;
				await updateDoc(doc(db, "menuItems", issue.id), {
					recipeId: issue.suggestedRecipeId,
					updatedAt: serverTimestamp(),
				});
				updatedCount++;
			}
			pushLog(`🔧 Auto-fix complete. Updated ${updatedCount} menuItems.`);
			// rerun scan
			await runScan();
		} catch (err) {
			console.error(err);
			pushLog("❌ Error during auto-fix. Check console.");
		} finally {
			setAutoFixBusy(false);
		}
	};

	return (
		<main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-8">
			<div className="w-full max-w-5xl space-y-4 px-4">
				<header className="flex items-center justify-between gap-3">
					<div>
						<h1 className="text-xl font-semibold">
							Dev · Culinary Data Integrity Checker
						</h1>
						<p className="text-sm text-slate-400">
							Scans <code>ingredients</code>, <code>recipes</code>
							, and <code>menuItems</code> for missing links and
							pricing issues that block COGS / food cost.
						</p>
					</div>
					<div className="flex flex-col items-end gap-2">
						<button
							onClick={runScan}
							disabled={busy}
							className={`px-4 py-2 rounded-full text-sm font-semibold ${
								busy
									? "bg-slate-700 text-slate-300 cursor-not-allowed"
									: "bg-emerald-400 text-slate-900"
							}`}
						>
							{busy ? "Scanning…" : "Run Integrity Scan"}
						</button>

						<button
							onClick={handleAutoFixMenuLinks}
							disabled={
								autoFixBusy ||
								!results ||
								!results.menuIssues?.some((m) => m.canAutoFix)
							}
							className={`px-4 py-1 rounded-full text-xs font-semibold ${
								autoFixBusy ||
								!results ||
								!results.menuIssues?.some((m) => m.canAutoFix)
									? "bg-slate-800 text-slate-500 cursor-not-allowed"
									: "bg-amber-300 text-slate-900"
							}`}
						>
							{autoFixBusy
								? "Auto-fixing…"
								: "Auto-fix Menu ↔ Recipe Links"}
						</button>
					</div>
				</header>

				{/* Summary */}
				{results && (
					<section className="grid md:grid-cols-4 gap-3 text-xs">
						<SummaryCard
							label="Menu Items"
							main={results.summary.totalMenuItems}
							sub={`Cost-ready: ${results.summary.costReadyMenuItems} · Blocked: ${results.summary.costBlockedMenuItems}`}
						/>
						<SummaryCard
							label="Recipes"
							main={results.summary.totalRecipes}
							sub={`With issues: ${results.summary.recipeIssuesCount}`}
						/>
						<SummaryCard
							label="Ingredients"
							main={results.summary.totalIngredients}
							sub={`With pricing issues: ${results.summary.ingredientIssuesCount}`}
						/>
						<SummaryCard
							label="Menu Issues"
							main={results.summary.menuIssuesCount}
							sub={`Auto-fixable: ${
								results.menuIssues.filter((m) => m.canAutoFix)
									.length
							}`}
						/>
					</section>
				)}

				{/* Issues detail */}
				<section className="grid md:grid-cols-3 gap-4 mt-4 text-xs">
					{/* Menu issues */}
					<div className="md:col-span-1 space-y-2">
						<h2 className="text-sm font-semibold text-slate-200">
							Menu Items with Issues
						</h2>
						<div className="bg-slate-900/70 border border-slate-800 rounded-2xl max-h-80 overflow-auto p-3 space-y-2">
							{!results || !results.menuIssues.length ? (
								<div className="text-slate-500">
									No menu issues found.
								</div>
							) : (
								results.menuIssues.map((m) => (
									<div
										key={m.id}
										className="border border-slate-800 rounded-xl p-2"
									>
										<div className="flex justify-between gap-2">
											<div>
												<div className="font-medium text-slate-100">
													{m.name}
												</div>
												<div className="text-[10px] text-slate-500">
													{m.type} · {m.station} · id:{" "}
													{m.id}
												</div>
											</div>
											{m.canAutoFix && (
												<span className="px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 text-[10px] self-start">
													Auto-fix
												</span>
											)}
										</div>
										<ul className="mt-1 list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
											{m.problems.map((p, idx) => (
												<li key={idx}>{p}</li>
											))}
										</ul>
										{m.suggestedRecipeName && (
											<div className="mt-1 text-[10px] text-emerald-300">
												Suggested recipe:{" "}
												{m.suggestedRecipeName}
											</div>
										)}
									</div>
								))
							)}
						</div>
					</div>

					{/* Recipe issues */}
					<div className="space-y-2">
						<h2 className="text-sm font-semibold text-slate-200">
							Recipes with Issues
						</h2>
						<div className="bg-slate-900/70 border border-slate-800 rounded-2xl max-h-80 overflow-auto p-3 space-y-2">
							{!results || !results.recipeIssues.length ? (
								<div className="text-slate-500">
									No recipe issues found.
								</div>
							) : (
								results.recipeIssues.map((r) => (
									<div
										key={r.id}
										className="border border-slate-800 rounded-xl p-2"
									>
										<div className="font-medium text-slate-100">
											{r.name}
										</div>
										<div className="text-[10px] text-slate-500">
											id: {r.id}
										</div>
										<ul className="mt-1 list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
											{r.problems.map((p, idx) => (
												<li key={idx}>{p}</li>
											))}
										</ul>
									</div>
								))
							)}
						</div>
					</div>

					{/* Ingredient issues */}
					<div className="space-y-2">
						<h2 className="text-sm font-semibold text-slate-200">
							Ingredients with Pricing Issues
						</h2>
						<div className="bg-slate-900/70 border border-slate-800 rounded-2xl max-h-80 overflow-auto p-3 space-y-2">
							{!results || !results.ingredientIssues.length ? (
								<div className="text-slate-500">
									No ingredient pricing issues found.
								</div>
							) : (
								results.ingredientIssues.map((ing) => (
									<div
										key={ing.id}
										className="border border-slate-800 rounded-xl p-2"
									>
										<div className="font-medium text-slate-100">
											{ing.name}
										</div>
										<div className="text-[10px] text-slate-500">
											id: {ing.id}
										</div>
										<ul className="mt-1 list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
											{ing.problems.map((p, idx) => (
												<li key={idx}>{p}</li>
											))}
										</ul>
									</div>
								))
							)}
						</div>
					</div>
				</section>

				{/* Log */}
				<section className="mt-4">
					<h2 className="text-sm font-semibold mb-2">Log</h2>
					<div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 max-h-60 overflow-auto text-[11px] font-mono">
						{log.length === 0 ? (
							<div className="text-slate-600">
								Click “Run Integrity Scan” to begin.
							</div>
						) : (
							<ul className="space-y-1">
								{log.map((l, i) => (
									<li key={i}>{l}</li>
								))}
							</ul>
						)}
					</div>
				</section>
			</div>
		</main>
	);
}

function SummaryCard({ label, main, sub }) {
	return (
		<div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3">
			<div className="text-[11px] text-slate-400 mb-1">{label}</div>
			<div className="text-lg font-semibold text-slate-50">{main}</div>
			{sub && (
				<div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
			)}
		</div>
	);
}
