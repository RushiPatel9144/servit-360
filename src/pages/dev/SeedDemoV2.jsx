/** @format */
// @ts-nocheck
import React, { useState } from "react";
import { db } from "../../firebase";
import {
	collection,
	doc,
	setDoc,
	updateDoc,
	serverTimestamp,
	arrayUnion,
} from "firebase/firestore";

// ---------- helpers ----------
const slug = (s) =>
	(s || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");

const placeholderImg = (txt) =>
	`https://dummyimage.com/800x600/efefef/111111.jpg&text=${encodeURIComponent(
		txt
	)}`;

const guessYieldUnit = (name) => {
	const n = (name || "").toLowerCase();
	if (n.includes("dressing") || n.includes("glaze") || n.includes("sauce"))
		return "L";
	if (n.includes("butter") || n.includes("mix")) return "kg";
	return "portion";
};

export default function SeedDemoV2() {
	const [log, setLog] = useState([]);
	const [running, setRunning] = useState(false);
	const [done, setDone] = useState(false);
	const plog = (m) => setLog((L) => [...L, m]);

	const seed = async () => {
		try {
			setRunning(true);
			plog("🌱 Seed V2 starting… (idempotent)");

			// -------- INGREDIENTS (Purchased = ingredients only; NO menuItems of Purchased) --------
			const ingredientDefs = [
				// Proteins
				{ name: "Chicken Breast", unit: "g" },
				{ name: "Salmon Fillet", unit: "g" },
				{ name: "Shrimp", unit: "g", allergens: ["Shellfish"] },
				{ name: "Ground Beef", unit: "g" },
				{ name: "Pork Loin", unit: "g" },
				{ name: "Tofu", unit: "g", allergens: ["Soy"] },
				{ name: "Egg Yolk", unit: "g", allergens: ["Egg"] },
				{ name: "Bacon", unit: "g" },
				{ name: "Beef Striploin", unit: "g" },
				// Veg
				{ name: "Onion", unit: "g" },
				{ name: "Garlic", unit: "g" },
				{ name: "Romaine Lettuce", unit: "g" },
				{ name: "Tomato", unit: "g" },
				{ name: "Bell Pepper", unit: "g" },
				{ name: "Spinach", unit: "g" },
				{ name: "Broccoli", unit: "g" },
				{ name: "Carrot", unit: "g" },
				{ name: "Zucchini", unit: "g" },
				{ name: "Potato", unit: "g" },
				// Dairy & dry
				{ name: "Parmesan", unit: "g", allergens: ["Dairy"] },
				{ name: "Mozzarella", unit: "g", allergens: ["Dairy"] },
				{ name: "Butter", unit: "g", allergens: ["Dairy"] },
				{ name: "Cream", unit: "ml", allergens: ["Dairy"] },
				{ name: "Milk", unit: "ml", allergens: ["Dairy"] },
				{ name: "Flour", unit: "g", allergens: ["Wheat"] },
				{ name: "Breadcrumbs", unit: "g", allergens: ["Wheat"] },
				{ name: "Rice", unit: "g" },
				{ name: "Spaghetti", unit: "g" },
				{ name: "Penne Pasta", unit: "g" },
				// Liquids & sauces
				{ name: "Olive Oil", unit: "ml" },
				{ name: "Soy Sauce", unit: "ml", allergens: ["Soy"] },
				{ name: "Ketchup", unit: "ml" },
				{ name: "Mayo", unit: "ml", allergens: ["Egg"] },
				{
					name: "Caesar Dressing Base",
					unit: "ml",
					allergens: ["Egg", "Fish"],
				},
				{ name: "Truffle Oil", unit: "ml" },
				{ name: "Vinegar", unit: "ml" },
				{ name: "BBQ Sauce", unit: "ml" },
				{ name: "Honey", unit: "ml" },
				{ name: "Lemon Juice", unit: "ml" },
				// Herbs & misc
				{ name: "Salt", unit: "g" },
				{ name: "Pepper", unit: "g" },
				{ name: "Paprika", unit: "g" },
				{ name: "Basil", unit: "g" },
				{ name: "Oregano", unit: "g" },
				{ name: "Thyme", unit: "g" },
				{ name: "Parsley", unit: "g" },
				{ name: "Chili Flakes", unit: "g" },
				{ name: "Sugar", unit: "g" },
				{ name: "Brown Sugar", unit: "g" },
				// a few more to boost volume
				{ name: "Anchovy Fillets", unit: "g", allergens: ["Fish"] },
				{ name: "Croutons", unit: "g", allergens: ["Wheat"] },
				{ name: "Aioli Base", unit: "ml", allergens: ["Egg"] },
				{ name: "Pickled Onions", unit: "g" },
				{ name: "Herb Oil", unit: "ml" },
			];

			const ingIdByName = {};
			const ingUnitById = {};

			// Upsert ingredients and deterministic price doc
			for (const def of ingredientDefs) {
				const id = slug(def.name);
				await setDoc(
					doc(db, "ingredients", id),
					{
						name: def.name,
						unit: def.unit,
						allergens: def.allergens || [],
						updatedAt: serverTimestamp(),
						createdAt: serverTimestamp(),
					},
					{ merge: true }
				);
				ingIdByName[def.name] = id;
				ingUnitById[id] = def.unit;

				// deterministic "current" price doc so re-running doesn't spam
				const priceId = "current";
				const rand = Number((Math.random() * 0.08 + 0.01).toFixed(3)); // 0.01–0.09
				await setDoc(
					doc(db, "ingredients", id, "prices", priceId),
					{
						unitCost: rand,
						effectiveFrom: serverTimestamp(),
						effectiveTo: null,
						updatedAt: serverTimestamp(),
					},
					{ merge: true }
				);
			}
			plog(
				`✅ Upserted ${ingredientDefs.length} ingredients + current prices.`
			);

			// -------- PREP RECIPES (components) --------
			// These are prepped items used by dishes (Line Station).
			const prepRecipes = [
				{
					name: "Caesar Dressing",
					yield: 10,
					lines: [
						{ ing: "Caesar Dressing Base", qty: 900 },
						{ ing: "Garlic", qty: 30 },
						{ ing: "Lemon Juice", qty: 70 },
						{ ing: "Olive Oil", qty: 200 },
						{ ing: "Parmesan", qty: 50 },
					],
				},
				{
					name: "Garlic Butter",
					yield: 5,
					lines: [
						{ ing: "Butter", qty: 800 },
						{ ing: "Garlic", qty: 50 },
						{ ing: "Parsley", qty: 20 },
						{ ing: "Salt", qty: 5 },
					],
				},
				{
					name: "BBQ Glaze",
					yield: 5,
					lines: [
						{ ing: "BBQ Sauce", qty: 1800 },
						{ ing: "Vinegar", qty: 100 },
						{ ing: "Honey", qty: 100 },
					],
				},
				{
					name: "Croutons (Prep)",
					yield: 5,
					lines: [
						{ ing: "Croutons", qty: 1000 },
						{ ing: "Olive Oil", qty: 100 },
						{ ing: "Parmesan", qty: 50 },
					],
				},
				{
					name: "Herb Oil (Prep)",
					yield: 2,
					lines: [
						{ ing: "Herb Oil", qty: 1500 },
						{ ing: "Parsley", qty: 30 },
						{ ing: "Basil", qty: 30 },
					],
				},
			];

			const prepRecipeIdByName = {};
			for (const r of prepRecipes) {
				const rid = slug(r.name);
				await setDoc(
					doc(db, "recipes", rid),
					{
						name: r.name,
						yield: r.yield,
						yieldUnit: guessYieldUnit(r.name),
						shelfLifeDays: 5,
						tools: "Bowl / Blender",
						method: "Combine per SOP. Label with prep & expiry.",
						imageUrl: placeholderImg(r.name),
						// Only ingredient lines here; (components handled on main dish recipes)
						lines: r.lines
							.filter((ln) => ingIdByName[ln.ing])
							.map((ln) => ({
								ingredientId: ingIdByName[ln.ing],
								qty: ln.qty,
								unit: ingUnitById[ingIdByName[ln.ing]] || "g",
							})),
						updatedAt: serverTimestamp(),
						createdAt: serverTimestamp(),
					},
					{ merge: true }
				);
				prepRecipeIdByName[r.name] = rid;
			}
			plog(`✅ Upserted ${prepRecipes.length} PREP recipes.`);

			// -------- LINE STATION RECIPES (mains) + components linkage --------
			// We'll store `components: [recipeId]` so the UI can show "Go to Spec" buttons.
			const mains = [
				{
					name: "Caesar Salad",
					station: "Pantry",
					lines: [
						{ ing: "Romaine Lettuce", qty: 120 },
						{ ing: "Parmesan", qty: 10 },
					],
					components: ["Caesar Dressing", "Croutons (Prep)"], // prepped components to link
				},
				{
					name: "Spaghetti Pomodoro",
					station: "Saute",
					lines: [
						{ ing: "Spaghetti", qty: 140 },
						{ ing: "Tomato", qty: 120 },
						{ ing: "Garlic", qty: 8 },
						{ ing: "Olive Oil", qty: 12 },
						{ ing: "Parmesan", qty: 8 },
					],
					components: ["Herb Oil (Prep)"],
				},
				{
					name: "Chicken Parmesan",
					station: "Hot Pantry",
					lines: [
						{ ing: "Chicken Breast", qty: 220 },
						{ ing: "Breadcrumbs", qty: 60 },
						{ ing: "Mozzarella", qty: 60 },
						{ ing: "Tomato", qty: 90 },
						{ ing: "Olive Oil", qty: 10 },
					],
					components: ["Garlic Butter"],
				},
				{
					name: "Grilled Salmon",
					station: "Grill",
					lines: [
						{ ing: "Salmon Fillet", qty: 220 },
						{ ing: "Olive Oil", qty: 10 },
						{ ing: "Salt", qty: 2 },
						{ ing: "Pepper", qty: 2 },
					],
					components: ["Herb Oil (Prep)"],
				},
				{
					name: "Truffle Fries",
					station: "Fryer",
					lines: [
						{ ing: "Potato", qty: 200 },
						{ ing: "Truffle Oil", qty: 8 },
						{ ing: "Parmesan", qty: 10 },
						{ ing: "Salt", qty: 2 },
					],
					components: [],
				},
				{
					name: "Mozzarella Sticks",
					station: "Mozza",
					lines: [
						{ ing: "Mozzarella", qty: 120 },
						{ ing: "Breadcrumbs", qty: 60 },
						{ ing: "Egg Yolk", qty: 25 },
					],
					components: [],
				},
			];

			const brandPool = [
				"Scaddabush",
				"Reds",
				"Loose Moose",
				"Jack Astor's",
			];
			const lineRecipeIdByName = {};
			for (const m of mains) {
				const rid = slug(m.name);
				await setDoc(
					doc(db, "recipes", rid),
					{
						name: m.name,
						yield: 1,
						yieldUnit: "portion",
						shelfLifeDays: 0,
						tools: "Per station SOP",
						method: "Cook per station SOP. Plate with Expo standards.",
						imageUrl: placeholderImg(m.name),
						lines: m.lines
							.filter((ln) => ingIdByName[ln.ing])
							.map((ln) => ({
								ingredientId: ingIdByName[ln.ing],
								qty: ln.qty,
								unit: ingUnitById[ingIdByName[ln.ing]] || "g",
							})),
						// 🔗 components (prepped recipeIds for UI “Go to spec” buttons)
						components: (m.components || [])
							.filter((n) => prepRecipeIdByName[n])
							.map((n) => prepRecipeIdByName[n]),
						updatedAt: serverTimestamp(),
						createdAt: serverTimestamp(),
					},
					{ merge: true }
				);
				lineRecipeIdByName[m.name] = rid;
			}
			plog(
				`✅ Upserted ${mains.length} LINE STATION recipes (with components).`
			);

			// -------- MENU ITEMS (no Purchased). We’ll create Prep + Line Station + Expo --------
			// Prep menu items for visibility in Culinary
			for (const name of Object.keys(prepRecipeIdByName)) {
				const mid = slug(name);
				await setDoc(
					doc(db, "menuItems", mid),
					{
						name,
						brand: brandPool[
							Math.floor(Math.random() * brandPool.length)
						],
						type: "Prep",
						station: "Pantry",
						recipeId: prepRecipeIdByName[name],
						active: true,
						imageUrl: placeholderImg(name),
						createdAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
					},
					{ merge: true }
				);
			}

			// Line Station menu items
			for (const m of mains) {
				const mid = slug(m.name);
				await setDoc(
					doc(db, "menuItems", mid),
					{
						name: m.name,
						brand: brandPool[
							Math.floor(Math.random() * brandPool.length)
						],
						type: "Line Station",
						station: m.station,
						recipeId: lineRecipeIdByName[m.name],
						active: true,
						imageUrl: placeholderImg(m.name),
						createdAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
					},
					{ merge: true }
				);
			}

			// Expo menu items: one per main, “garnish/presentation” layer that references the main dish
			for (const m of mains) {
				const expoName = `${m.name} (Expo)`;
				const mid = slug(expoName);
				await setDoc(
					doc(db, "menuItems", mid),
					{
						name: expoName,
						brand: brandPool[
							Math.floor(Math.random() * brandPool.length)
						],
						type: "Expo",
						station: m.station, // often same station for pass
						recipeId: lineRecipeIdByName[m.name], // points to same recipe for now (presentation is SOP)
						parentMenuItemId: slug(m.name), // 🔗 ties Expo to the main Line Station dish
						active: true,
						imageUrl: placeholderImg(expoName),
						createdAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
					},
					{ merge: true }
				);
			}
			plog(
				"✅ Upserted Prep + Line Station + Expo menu items (no Purchased)."
			);

			// -------- Reverse linkage: preps -> used in which menu items --------
			// Every main that lists components will be added to each prep’s usedInMenuItems[]
			for (const m of mains) {
				const mainMenuItemId = slug(m.name);
				for (const compName of m.components || []) {
					const prepRid = prepRecipeIdByName[compName];
					if (!prepRid) continue;
					await updateDoc(doc(db, "recipes", prepRid), {
						usedInMenuItems: arrayUnion(mainMenuItemId),
						updatedAt: serverTimestamp(),
					});
				}
			}
			plog(
				"🔗 Linked prepped recipes with usedInMenuItems[] for reverse lookup."
			);

			plog("🎉 Seed V2 complete. Safe to re-run without duplicates.");
			setDone(true);
		} catch (err) {
			console.error(err);
			plog("❌ Error: " + err.message);
		} finally {
			setRunning(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 p-6">
			<div className="max-w-xl mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
				<h1 className="text-lg font-semibold mb-2">
					Seed Data (V2 · Idempotent)
				</h1>
				<p className="text-[11px] text-slate-400 mb-3">
					- No duplicates (slug IDs + merge)
					<br />
					- Ingredients only under Purchased (no Purchased menu items)
					<br />
					- Fills Line Station & Expo; Prep used by mains
					<br />- Links: recipe.components[] &
					recipe.usedInMenuItems[]
				</p>
				<button
					disabled={running || done}
					onClick={seed}
					className={`px-4 py-2 rounded-full ${
						done
							? "bg-emerald-500 text-slate-900"
							: "bg-emerald-400 text-slate-900"
					} text-[11px] font-semibold ${running ? "opacity-60" : ""}`}
				>
					{done ? "Seeded!" : running ? "Seeding…" : "Run Seed V2"}
				</button>
				<div className="mt-3 text-[11px] text-slate-300 space-y-1">
					{log.map((l, i) => (
						<div key={i}>{l}</div>
					))}
				</div>
			</div>
		</div>
	);
}
