/** @format */
import React, { useState } from "react";
import { db } from "../../firebase";
import {
	collection,
	addDoc,
	getDocs,
	serverTimestamp,
} from "firebase/firestore";

/**
 * This seeder populates:
 * - ~50 ingredients (with allergens + random prices)
 * - 15 recipes
 * - 20 menu items across all stations
 */

export default function SeedDemo() {
	const [log, setLog] = useState([]);
	const [running, setRunning] = useState(false);
	const [done, setDone] = useState(false);
	const plog = (msg) => setLog((l) => [...l, msg]);

	const seed = async () => {
		try {
			setRunning(true);
			plog("🌱 Starting seeding...");

			// --- INGREDIENTS ---
			const ingredientNames = [
				// Proteins
				"Chicken Breast",
				"Salmon Fillet",
				"Shrimp",
				"Ground Beef",
				"Pork Loin",
				"Tofu",
				"Egg Yolk",
				"Bacon",
				"Chicken Thigh",
				"Beef Striploin",
				// Veggies
				"Onion",
				"Garlic",
				"Romaine Lettuce",
				"Tomato",
				"Bell Pepper",
				"Spinach",
				"Broccoli",
				"Carrot",
				"Zucchini",
				"Potato",
				// Dry & Dairy
				"Parmesan",
				"Mozzarella",
				"Butter",
				"Cream",
				"Milk",
				"Flour",
				"Breadcrumbs",
				"Rice",
				"Spaghetti",
				"Penne Pasta",
				// Sauces & Liquids
				"Olive Oil",
				"Soy Sauce",
				"Ketchup",
				"Mayo",
				"Caesar Dressing Base",
				"Truffle Oil",
				"Vinegar",
				"BBQ Sauce",
				"Honey",
				"Lemon Juice",
				// Misc
				"Salt",
				"Pepper",
				"Paprika",
				"Basil",
				"Oregano",
				"Thyme",
				"Parsley",
				"Chili Flakes",
				"Sugar",
				"Brown Sugar",
			];

			const allergensMap = {
				Parmesan: ["Dairy"],
				Mozzarella: ["Dairy"],
				Butter: ["Dairy"],
				Cream: ["Dairy"],
				Milk: ["Dairy"],
				Egg: ["Egg"],
				Flour: ["Wheat"],
				Breadcrumbs: ["Wheat"],
				Shrimp: ["Shellfish"],
				Salmon: ["Fish"],
				"Soy Sauce": ["Soy"],
				"Caesar Dressing Base": ["Egg", "Fish"],
			};

			const ingRefs = {};
			for (const name of ingredientNames) {
				const unit = [
					"Olive Oil",
					"Soy Sauce",
					"Truffle Oil",
					"Vinegar",
					"Honey",
					"Lemon Juice",
					"Cream",
					"Milk",
				].includes(name)
					? "ml"
					: ["Egg Yolk", "Shrimp", "Chicken Breast"].includes(name)
					? "g"
					: "g";

				const allergens =
					Object.entries(allergensMap)
						.filter(([k]) => name.includes(k))
						.flatMap(([_, a]) => a) || [];

				const ref = await addDoc(collection(db, "ingredients"), {
					name,
					unit,
					allergens,
					createdAt: serverTimestamp(),
				});

				ingRefs[name] = ref.id;

				// Add price subcollection
				const unitCost = Number(
					(Math.random() * 0.1 + 0.005).toFixed(3)
				); // 0.005–0.105
				await addDoc(collection(db, "ingredients", ref.id, "prices"), {
					unitCost,
					effectiveFrom: serverTimestamp(),
					effectiveTo: null,
				});
			}
			plog(`✅ Seeded ${ingredientNames.length} ingredients.`);

			// --- RECIPES ---
			const recipeTemplates = [
				{
					name: "Spaghetti Pomodoro",
					yield: 1,
					shelfLifeDays: 2,
					tools: "Saute pan, tongs, ladle",
					method: "Cook pasta, toss with tomato, garlic, olive oil, finish with butter and Parmesan.",
					lines: [
						"Spaghetti",
						"Tomato",
						"Garlic",
						"Olive Oil",
						"Butter",
						"Parmesan",
					],
				},
				{
					name: "Chicken Parmesan",
					yield: 1,
					shelfLifeDays: 1,
					tools: "Oven, tongs, pan",
					method: "Bread chicken, fry, bake with mozzarella and tomato sauce.",
					lines: [
						"Chicken Breast",
						"Breadcrumbs",
						"Tomato",
						"Mozzarella",
						"Olive Oil",
						"Parmesan",
					],
				},
				{
					name: "Truffle Fries",
					yield: 1,
					shelfLifeDays: 0,
					tools: "Fryer, bowl",
					method: "Fry potatoes, toss with truffle oil and Parmesan.",
					lines: ["Potato", "Truffle Oil", "Parmesan", "Salt"],
				},
				{
					name: "Caesar Salad Dressing",
					yield: 10,
					shelfLifeDays: 5,
					tools: "Blender",
					method: "Blend egg yolk, anchovy, lemon juice, olive oil, and garlic.",
					lines: [
						"Egg Yolk",
						"Garlic",
						"Lemon Juice",
						"Olive Oil",
						"Caesar Dressing Base",
					],
				},
				{
					name: "BBQ Glaze",
					yield: 5,
					shelfLifeDays: 7,
					tools: "Sauce pot",
					method: "Simmer BBQ sauce, vinegar, and honey until reduced.",
					lines: ["BBQ Sauce", "Vinegar", "Honey"],
				},
				{
					name: "Garlic Butter",
					yield: 5,
					shelfLifeDays: 4,
					tools: "Mixing bowl",
					method: "Mix butter, garlic, parsley.",
					lines: ["Butter", "Garlic", "Parsley"],
				},
				{
					name: "Grilled Salmon",
					yield: 1,
					shelfLifeDays: 0,
					tools: "Grill",
					method: "Season salmon and grill until tender.",
					lines: ["Salmon Fillet", "Olive Oil", "Salt", "Pepper"],
				},
				{
					name: "Beef Burger Patty",
					yield: 1,
					shelfLifeDays: 2,
					tools: "Grill, scale",
					method: "Form ground beef into patty, season and grill.",
					lines: ["Ground Beef", "Salt", "Pepper"],
				},
				{
					name: "Mozzarella Sticks",
					yield: 5,
					shelfLifeDays: 2,
					tools: "Fryer",
					method: "Bread mozzarella and fry until golden.",
					lines: ["Mozzarella", "Breadcrumbs", "Egg Yolk"],
				},
			];

			const recipeRefs = {};
			for (const r of recipeTemplates) {
				const ref = await addDoc(collection(db, "recipes"), {
					name: r.name,
					yield: r.yield,
					shelfLifeDays: r.shelfLifeDays,
					tools: r.tools,
					method: r.method,
					lines: r.lines
						.filter((x) => ingRefs[x])
						.map((x) => ({
							ingredientId: ingRefs[x],
							qty: Math.floor(Math.random() * 100 + 10),
							unit: "g",
						})),
				});
				recipeRefs[r.name] = ref.id;
			}
			plog(`✅ Seeded ${recipeTemplates.length} recipes.`);

			// --- MENU ITEMS ---
			const stations = [
				"Pantry",
				"Hot Pantry",
				"Fryer",
				"Grill",
				"Saute",
				"Mozza",
			];
			const brands = [
				"Scaddabush",
				"Reds",
				"Loose Moose",
				"Jack Astor's",
			];

			const menuTemplates = [
				// Line station
				{
					name: "Spaghetti Pomodoro",
					type: "Line Station",
					station: "Saute",
					recipe: "Spaghetti Pomodoro",
				},
				{
					name: "Chicken Parm",
					type: "Line Station",
					station: "Hot Pantry",
					recipe: "Chicken Parmesan",
				},
				{
					name: "Grilled Salmon",
					type: "Line Station",
					station: "Grill",
					recipe: "Grilled Salmon",
				},
				{
					name: "Truffle Fries",
					type: "Line Station",
					station: "Fryer",
					recipe: "Truffle Fries",
				},
				{
					name: "Mozzarella Sticks",
					type: "Line Station",
					station: "Fryer",
					recipe: "Mozzarella Sticks",
				},
				// Prep & Expo
				{
					name: "Caesar Dressing",
					type: "Prep",
					station: "Pantry",
					recipe: "Caesar Salad Dressing",
				},
				{
					name: "Garlic Butter",
					type: "Prep",
					station: "Pantry",
					recipe: "Garlic Butter",
				},
				{
					name: "BBQ Glaze",
					type: "Prep",
					station: "Hot Pantry",
					recipe: "BBQ Glaze",
				},
				{
					name: "Beef Burger",
					type: "Expo",
					station: "Grill",
					recipe: "Beef Burger Patty",
				},
				{
					name: "Salmon Plate",
					type: "Expo",
					station: "Grill",
					recipe: "Grilled Salmon",
				},
				// Purchased
				{
					name: "Pesto Sauce",
					type: "Purchased",
					station: "Saute",
					recipe: "Garlic Butter",
				},
				{
					name: "Pomodoro Base",
					type: "Purchased",
					station: "Hot Pantry",
					recipe: "Spaghetti Pomodoro",
				},
				// Duplicates to reach ~20
				{
					name: "Chicken Parm XL",
					type: "Line Station",
					station: "Hot Pantry",
					recipe: "Chicken Parmesan",
				},
				{
					name: "Spaghetti Kids",
					type: "Line Station",
					station: "Saute",
					recipe: "Spaghetti Pomodoro",
				},
				{
					name: "Truffle Fries Side",
					type: "Expo",
					station: "Fryer",
					recipe: "Truffle Fries",
				},
				{
					name: "Caesar Prep",
					type: "Prep",
					station: "Pantry",
					recipe: "Caesar Salad Dressing",
				},
				{
					name: "Butter Mix",
					type: "Prep",
					station: "Pantry",
					recipe: "Garlic Butter",
				},
				{
					name: "BBQ Glaze Bulk",
					type: "Prep",
					station: "Hot Pantry",
					recipe: "BBQ Glaze",
				},
				{
					name: "Classic Burger",
					type: "Line Station",
					station: "Grill",
					recipe: "Beef Burger Patty",
				},
				{
					name: "Mozza Crunch",
					type: "Line Station",
					station: "Fryer",
					recipe: "Mozzarella Sticks",
				},
			];

			for (const item of menuTemplates) {
				await addDoc(collection(db, "menuItems"), {
					name: item.name,
					brand: brands[Math.floor(Math.random() * brands.length)],
					type: item.type,
					station: item.station,
					recipeId: recipeRefs[item.recipe],
					active: true,
					createdAt: serverTimestamp(),
				});
			}

			plog(`✅ Seeded ${menuTemplates.length} menu items.`);

			setDone(true);
			plog("🎉 All demo data seeded successfully!");
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
					Seed Large Demo Data
				</h1>
				<p className="text-[11px] text-slate-400 mb-3">
					This will insert ~50 ingredients, 15 recipes, and 20 menu
					items.
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
					{done ? "Seeded!" : running ? "Seeding…" : "Seed Demo Data"}
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
