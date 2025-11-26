/** @format */
import React, { useState } from "react";
import { db } from "../../firebase";
import {
	collection,
	getDocs,
	addDoc,
	doc,
	setDoc,
	serverTimestamp,
} from "firebase/firestore";

/**
 * Dev page: Culinary Master Menu Seeder (JS version, no TypeScript)
 *
 * Behaviour:
 * - DOES NOT WIPE any collections.
 * - Assumes `ingredients` and `recipes` were already seeded.
 * - Reads existing `recipes` by name and maps them to our internal `recipeKey`s.
 * - Upserts `menuItems` (document id = `key`) with:
 *     name, brand, type, station, recipeId, active, imageUrl
 *     version: 2
 *     price: latest sell price
 * - Adds price-history rows to `menuItems/{id}/prices`.
 *
 * Does NOT touch users, auth, servers, or serverSales.
 */

export default function SeedCulinaryMaster() {
	const [log, setLog] = useState([]);
	const [busy, setBusy] = useState(false);

	const pushLog = (msg) => {
		setLog((prev) => [
			`${new Date().toLocaleTimeString()} — ${msg}`,
			...prev,
		]);
		console.log(msg);
	};

	const handleRun = async () => {
		if (
			!window.confirm(
				"This will seed/update menuItems (no deletion). Ingredients & recipes must already exist. Continue?"
			)
		) {
			return;
		}

		setBusy(true);
		setLog([]);
		try {
			pushLog("Starting master culinary menu seed…");

			// Build recipeKey -> recipeId map from existing recipes
			const recipeKeyToId = await buildRecipeKeyToIdFromExisting(pushLog);

			// Seed / upsert menu items
			await seedMenuItems(recipeKeyToId, pushLog);

			pushLog("✅ Master culinary menu seed complete.");
			alert("Culinary menu seed completed successfully.");
		} catch (err) {
			console.error(err);
			pushLog("❌ Error during seed. Check console.");
			alert("Error during seeding. See console/log.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-8">
			<div className="w-full max-w-3xl space-y-4 px-4">
				<h1 className="text-xl font-semibold">
					Dev · Culinary Master Seeder
				</h1>
				<p className="text-sm text-slate-400">
					Uses existing <code>recipes</code> and{" "}
					<code>ingredients</code>, then seeds/updates{" "}
					<code>menuItems</code> (Italian kitchen + bar) with sell
					prices, <code>version: 2</code> and a top-level{" "}
					<code>price</code> for the Server POS.
				</p>
				<button
					onClick={handleRun}
					disabled={busy}
					className={`px-4 py-2 rounded-full text-sm font-semibold ${
						busy
							? "bg-slate-700 text-slate-300 cursor-not-allowed"
							: "bg-emerald-400 text-slate-900"
					}`}
				>
					{busy ? "Seeding…" : "Run Menu Seed (no wipe)"}
				</button>

				<section className="mt-4">
					<h2 className="text-sm font-semibold mb-2">Log</h2>
					<div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 max-h-80 overflow-auto text-[11px] font-mono">
						{log.length === 0 ? (
							<div className="text-slate-600">
								Click the button to run the seed.
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

/* ------------------------------------------------------------------ */
/*  Seed metadata (JS, no TS types)                                   */
/* ------------------------------------------------------------------ */

// Not used for now, but kept here if you ever want to do a full reseed.
const INGREDIENTS = [];

/**
 * RECIPES is only used so we know:
 *  - the canonical `key`
 *  - the `name` you originally seeded in Firestore
 *
 * We DO NOT reinsert recipes here; we just match by `name` against existing
 * docs in the `recipes` collection.
 */
const RECIPES = [
	{
		key: "prep-caesar-dressing",
		name: "Caesar Dressing",
		yield: 20,
		shelfLifeDays: 3,
		tools: "Blender, spatula, container with lid",
		method: "Blend anchovy, garlic, egg, lemon and seasoning. Slowly emulsify with oil. Fold in grated parmesan. Chill and label.",
		lines: [
			{ ingredientKey: "anchovy-fillets", qty: 80, unit: "g" },
			{ ingredientKey: "garlic-fresh", qty: 40, unit: "g" },
			{ ingredientKey: "egg-yolk", qty: 120, unit: "g" },
			{ ingredientKey: "lemon-juice", qty: 150, unit: "ml" },
			{ ingredientKey: "olive-oil-evoo", qty: 600, unit: "ml" },
			{ ingredientKey: "parmesan-reggiano", qty: 200, unit: "g" },
		],
	},
	{
		key: "prep-pomodoro-sauce",
		name: "Pomodoro Sauce",
		yield: 30,
		shelfLifeDays: 3,
		tools: "Rondeau, wooden spoon, blender (optional)",
		method: "Sweat onion and garlic in olive oil. Add San Marzano tomatoes and simmer gently. Finish with basil at the end.",
		lines: [
			{ ingredientKey: "olive-oil-evoo", qty: 150, unit: "ml" },
			{ ingredientKey: "onion-yellow", qty: 400, unit: "g" },
			{ ingredientKey: "garlic-fresh", qty: 80, unit: "g" },
			{ ingredientKey: "san-marzano-tomato", qty: 5000, unit: "g" },
			{ ingredientKey: "basil-fresh", qty: 80, unit: "g" },
		],
	},
	{
		key: "prep-alfredo-sauce",
		name: "Alfredo Cream Sauce",
		yield: 20,
		shelfLifeDays: 3,
		tools: "Sauce pot, whisk, ladle",
		method: "Reduce cream with garlic and butter until nappé. Finish with grana padano and adjust seasoning.",
		lines: [
			{ ingredientKey: "whipping-cream-35", qty: 4000, unit: "ml" },
			{ ingredientKey: "butter-unsalted", qty: 300, unit: "g" },
			{ ingredientKey: "garlic-fresh", qty: 60, unit: "g" },
			{ ingredientKey: "grana-padano", qty: 400, unit: "g" },
		],
	},
	{
		key: "dish-caesar-salad",
		name: "Caesar Salad",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Mixing bowl, tongs",
		method: "In a chilled bowl, toss romaine with Caesar dressing. Plate high, top with croutons and shaved parmigiano.",
		lines: [
			{ ingredientKey: "romaine-hearts", qty: 120, unit: "g" },
			{ ingredientKey: "croutons-house", qty: 18, unit: "g" },
			{ ingredientKey: "parmesan-reggiano", qty: 12, unit: "g" },
		],
	},
	{
		key: "dish-spaghetti-pomodoro",
		name: "Spaghetti Pomodoro",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Pasta pot, saute pan, tongs",
		method: "Cook spaghetti al dente. In saute pan, warm pomodoro with olive oil and garlic, toss pasta, finish with basil and parmigiano.",
		lines: [
			{ ingredientKey: "spaghetti-dry", qty: 110, unit: "g" },
			{ ingredientKey: "olive-oil-evoo", qty: 10, unit: "ml" },
			{ ingredientKey: "garlic-fresh", qty: 6, unit: "g" },
			{ ingredientKey: "san-marzano-tomato", qty: 140, unit: "g" },
			{ ingredientKey: "basil-fresh", qty: 4, unit: "g" },
			{ ingredientKey: "parmesan-reggiano", qty: 8, unit: "g" },
		],
	},
	{
		key: "dish-rigatoni-bolognese",
		name: "Rigatoni Bolognese",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Pasta pot, saute pan, spoon",
		method: "Cook rigatoni. Render sausage with onion and garlic, glaze with tomato, mount with butter and finish with parmesan.",
		lines: [
			{ ingredientKey: "rigatoni-dry", qty: 120, unit: "g" },
			{ ingredientKey: "italian-sausage", qty: 70, unit: "g" },
			{ ingredientKey: "onion-yellow", qty: 20, unit: "g" },
			{ ingredientKey: "garlic-fresh", qty: 6, unit: "g" },
			{ ingredientKey: "san-marzano-tomato", qty: 130, unit: "g" },
			{ ingredientKey: "butter-unsalted", qty: 8, unit: "g" },
			{ ingredientKey: "parmesan-reggiano", qty: 10, unit: "g" },
		],
	},
	{
		key: "dish-gnocchi-gorgonzola",
		name: "Potato Gnocchi Gorgonzola",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Saute pan, spatula",
		method: "Pan-sear gnocchi in butter, deglaze with cream and cheese, reduce to coat.",
		lines: [
			{ ingredientKey: "gnocchi-potato", qty: 140, unit: "g" },
			{ ingredientKey: "butter-unsalted", qty: 12, unit: "g" },
			{ ingredientKey: "whipping-cream-35", qty: 80, unit: "ml" },
			{ ingredientKey: "grana-padano", qty: 10, unit: "g" },
		],
	},
	{
		key: "dish-tiramisu",
		name: "Tiramisu",
		yield: 12,
		shelfLifeDays: 2,
		tools: "Mixer, spatula, hotel pan",
		method: "Whip mascarpone with yolk and sugar, fold with cream. Layer with espresso-soaked ladyfingers and chill. Portion to order.",
		lines: [
			{ ingredientKey: "mascarpone", qty: 900, unit: "g" },
			{ ingredientKey: "egg-yolk", qty: 200, unit: "g" },
			{ ingredientKey: "whipping-cream-35", qty: 700, unit: "ml" },
		],
	},
	{
		key: "drink-aperol-spritz",
		name: "Aperol Spritz",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Wine glass, jigger, bar spoon",
		method: "Build over ice: 3 parts prosecco, 2 parts Aperol, 1 part soda. Garnish with orange slice.",
		lines: [
			{ ingredientKey: "prosecco", qty: 90, unit: "ml" },
			{ ingredientKey: "aperol", qty: 60, unit: "ml" },
			{ ingredientKey: "soda-water", qty: 30, unit: "ml" },
			{ ingredientKey: "orange-slice", qty: 15, unit: "g" },
		],
	},
	{
		key: "drink-negroni",
		name: "Negroni",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Rocks glass, mixing glass, jigger, strainer",
		method: "Stir gin, Campari and sweet vermouth over ice. Strain over fresh ice in rocks glass. Garnish with orange.",
		lines: [
			{ ingredientKey: "gin-london-dry", qty: 30, unit: "ml" },
			{ ingredientKey: "campari", qty: 30, unit: "ml" },
			{ ingredientKey: "sweet-vermouth", qty: 30, unit: "ml" },
			{ ingredientKey: "orange-slice", qty: 12, unit: "g" },
		],
	},
	{
		key: "pizza-margherita",
		name: "Pizza Margherita",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Mozza station, deck oven, pizza peel, ladle",
		method: "Stretch dough evenly. Sauce lightly with tomato passata, top with fior di latte and basil. Bake until leoparding on crust and cheese is melted. Finish with olive oil.",
		lines: [
			{ ingredientKey: "pizza-dough-ball", qty: 280, unit: "g" },
			{ ingredientKey: "tomato-passata", qty: 80, unit: "g" },
			{ ingredientKey: "fior-di-latte-slices", qty: 110, unit: "g" },
			{ ingredientKey: "basil-fresh", qty: 4, unit: "g" },
			{ ingredientKey: "olive-oil-evoo", qty: 8, unit: "ml" },
		],
	},
	{
		key: "pizza-diavola",
		name: "Pizza Diavola",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Mozza station, deck oven, pizza peel",
		method: "Stretch dough, sauce with passata and top with fior di latte and spicy salami. Bake hard for defined leoparding. Finish with chili oil.",
		lines: [
			{ ingredientKey: "pizza-dough-ball", qty: 280, unit: "g" },
			{ ingredientKey: "tomato-passata", qty: 80, unit: "g" },
			{ ingredientKey: "fior-di-latte-slices", qty: 110, unit: "g" },
			{ ingredientKey: "salami-spicy", qty: 55, unit: "g" },
			{ ingredientKey: "chili-oil", qty: 5, unit: "ml" },
		],
	},
	{
		key: "pizza-prosciutto-arugula",
		name: "Pizza Prosciutto & Arugula",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Mozza station, deck oven, pizza wheel",
		method: "Bake a white pizza with fior di latte. Post-bake, top with prosciutto, arugula, shaved parmigiano and a drizzle of olive oil.",
		lines: [
			{ ingredientKey: "pizza-dough-ball", qty: 280, unit: "g" },
			{ ingredientKey: "fior-di-latte-slices", qty: 120, unit: "g" },
			{ ingredientKey: "prosciutto-crudo", qty: 45, unit: "g" },
			{ ingredientKey: "arugula", qty: 18, unit: "g" },
			{ ingredientKey: "parmesan-reggiano", qty: 6, unit: "g" },
			{ ingredientKey: "olive-oil-evoo", qty: 6, unit: "ml" },
		],
	},
	{
		key: "app-burrata-pesto",
		name: "Burrata with Basil Pesto",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Cold station, spoon, small plate",
		method: "Room-temp burrata, spoon basil pesto around, finish with olive oil, cracked pepper and basil.",
		lines: [
			{ ingredientKey: "burrata", qty: 110, unit: "g" },
			{ ingredientKey: "pesto-basil", qty: 35, unit: "g" },
			{ ingredientKey: "olive-oil-evoo", qty: 4, unit: "ml" },
			{ ingredientKey: "basil-fresh", qty: 2, unit: "g" },
		],
	},
	{
		key: "app-calamari-fritti",
		name: "Calamari Fritti",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Fryer, metal bowl, spider, paper-lined plate",
		method: "Toss calamari in seasoned flour/breadcrumb mix, fry until golden and just cooked. Season with salt and serve with lemon wedge and aioli.",
		lines: [
			{ ingredientKey: "calamari-rings", qty: 130, unit: "g" },
			{ ingredientKey: "breadcrumbs-fine", qty: 25, unit: "g" },
			{ ingredientKey: "olive-oil-evoo", qty: 4, unit: "ml" },
		],
	},
	{
		key: "dessert-affogato",
		name: "Affogato al Caffè",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Espresso machine, dessert glass",
		method: "Scoop gelato into chilled glass. Pour hot espresso tableside over gelato.",
		lines: [
			{ ingredientKey: "gelato-vanilla", qty: 90, unit: "g" },
			{ ingredientKey: "espresso-shot", qty: 30, unit: "ml" },
		],
	},
	{
		key: "drink-virgin-spritz",
		name: "Virgin Italian Spritz",
		yield: 1,
		shelfLifeDays: 0,
		tools: "Wine glass, jigger, bar spoon",
		method: "Build over ice: simple syrup, lemon, sparkling water and soda. Garnish with orange slice.",
		lines: [
			{ ingredientKey: "simple-syrup", qty: 20, unit: "ml" },
			{ ingredientKey: "lemon-juice", qty: 15, unit: "ml" },
			{ ingredientKey: "sparkling-water", qty: 140, unit: "ml" },
			{ ingredientKey: "orange-slice", qty: 12, unit: "g" },
		],
	},
];

/* ------------------------------------------------------------------ */
/* MENU ITEMS (proper menu definitions only)                          */
/* ------------------------------------------------------------------ */

const MENU_ITEMS = [
	// SALADS
	{
		key: "mi-caesar-salad",
		name: "Classic Caesar Salad",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Pantry",
		recipeKey: "dish-caesar-salad",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg",
		sellPrices: [14.5],
	},

	// PASTA – Pomodoro
	{
		key: "mi-spaghetti-pomodoro",
		name: "Spaghetti Pomodoro",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Saute",
		recipeKey: "dish-spaghetti-pomodoro",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg",
		sellPrices: [19.0],
	},

	// PASTA – Bolognese
	{
		key: "mi-rigatoni-bolognese",
		name: "Rigatoni Bolognese",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Saute",
		recipeKey: "dish-rigatoni-bolognese",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/10580198/pexels-photo-10580198.jpeg",
		sellPrices: [21.5],
	},

	// PASTA – Gnocchi
	{
		key: "mi-gnocchi-gorgonzola",
		name: "Potato Gnocchi Gorgonzola",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Saute",
		recipeKey: "dish-gnocchi-gorgonzola",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/6287523/pexels-photo-6287523.jpeg",
		sellPrices: [22.0],
	},

	// DESSERT
	{
		key: "mi-tiramisu",
		name: "House Tiramisu",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Pantry",
		recipeKey: "dish-tiramisu",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/4877857/pexels-photo-4877857.jpeg",
		sellPrices: [10.0],
	},

	// BAR – Aperol Spritz
	{
		key: "mi-aperol-spritz",
		name: "Aperol Spritz",
		brand: "Scaddabush",
		type: "Line Station", // still works with your Server POS filters
		station: "Pantry", // or "Bar" once you add that station
		recipeKey: "drink-aperol-spritz",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/5531529/pexels-photo-5531529.jpeg",
		sellPrices: [13.0],
	},

	// BAR – Negroni
	{
		key: "mi-negroni",
		name: "Negroni",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Pantry",
		recipeKey: "drink-negroni",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/5531551/pexels-photo-5531551.jpeg",
		sellPrices: [14.0],
	},

	// PIZZA – Margherita
	{
		key: "mi-pizza-margherita",
		name: "Margherita Pizza",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Mozza",
		recipeKey: "pizza-margherita",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg",
		sellPrices: [22.0],
	},

	// PIZZA – Diavola
	{
		key: "mi-pizza-diavola",
		name: "Diavola Pizza",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Mozza",
		recipeKey: "pizza-diavola",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/995743/pexels-photo-995743.jpeg",
		sellPrices: [24.0],
	},

	// PIZZA – Prosciutto & Arugula
	{
		key: "mi-pizza-prosciutto-arugula",
		name: "Prosciutto & Arugula Pizza",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Mozza",
		recipeKey: "pizza-prosciutto-arugula",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg",
		sellPrices: [25.0],
	},

	// APP – Burrata
	{
		key: "mi-app-burrata-pesto",
		name: "Burrata with Basil Pesto",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Pantry",
		recipeKey: "app-burrata-pesto",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/1306338/pexels-photo-1306338.jpeg",
		sellPrices: [18.0],
	},

	// APP – Calamari Fritti
	{
		key: "mi-app-calamari-fritti",
		name: "Calamari Fritti",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Fryer",
		recipeKey: "app-calamari-fritti",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/6287520/pexels-photo-6287520.jpeg",
		sellPrices: [17.0],
	},

	// DESSERT – Affogato
	{
		key: "mi-dessert-affogato",
		name: "Affogato al Caffè",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Pantry",
		recipeKey: "dessert-affogato",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/302901/pexels-photo-302901.jpeg",
		sellPrices: [9.0],
	},

	// MOCKTAIL – Virgin Spritz
	{
		key: "mi-drink-virgin-spritz",
		name: "Virgin Italian Spritz",
		brand: "Scaddabush",
		type: "Line Station",
		station: "Pantry",
		recipeKey: "drink-virgin-spritz",
		active: true,
		imageUrl:
			"https://images.pexels.com/photos/5531555/pexels-photo-5531555.jpeg",
		sellPrices: [7.0],
	},
];

/* ------------------------------------------------------------------ */
/* Helper: build recipeKey → recipeId from existing recipes           */
/* ------------------------------------------------------------------ */

async function buildRecipeKeyToIdFromExisting(log) {
	log("Reading existing recipes to build key → id map…");
	const snap = await getDocs(collection(db, "recipes"));

	const nameToId = {};
	snap.forEach((d) => {
		const data = d.data();
		if (data.name) {
			nameToId[data.name] = d.id;
		}
	});

	const keyToId = {};
	for (const r of RECIPES) {
		const id = nameToId[r.name];
		if (!id) {
			log(
				`  ⚠ No existing recipe found with name "${r.name}" (key: ${r.key})`
			);
			continue;
		}
		keyToId[r.key] = id;
	}

	log(`Resolved ${Object.keys(keyToId).length} recipe keys to IDs.`);
	return keyToId;
}

/* ------------------------------------------------------------------ */
/* Seed menu items (upsert, set price + version)                      */
/* ------------------------------------------------------------------ */

async function seedMenuItems(recipeKeyToId, log) {
	log("Seeding / upserting menu items…");

	for (const mi of MENU_ITEMS) {
		const recipeId = recipeKeyToId[mi.recipeKey];
		if (!recipeId) {
			log(
				`  ⚠ No recipeId found for menu item ${mi.key} (${mi.name}) with recipeKey "${mi.recipeKey}"`
			);
		}

		const sellPrices = mi.sellPrices || [];
		const latestPrice =
			sellPrices.length > 0 ? sellPrices[sellPrices.length - 1] : 0;

		// Use key as document ID so re-runs overwrite instead of duplicating
		const miDocRef = doc(db, "menuItems", mi.key);

		await setDoc(
			miDocRef,
			{
				name: mi.name,
				brand: mi.brand,
				type: mi.type,
				station: mi.station,
				recipeId: recipeId || "MISSING",
				active: mi.active,
				imageUrl: mi.imageUrl || "",
				updatedAt: serverTimestamp(),
				version: 2,
				price: latestPrice, // 👈 used by Server POS auto-fill
			},
			{ merge: true }
		);

		// Append price history rows (simple dev version – no dedupe)
		for (const price of sellPrices) {
			await addDoc(collection(db, "menuItems", miDocRef.id, "prices"), {
				sellPrice: price,
				currency: "CAD",
				effectiveFrom: serverTimestamp(),
				effectiveTo: null,
			});
		}

		log(
			`  → Menu item ${mi.name} (${
				mi.key
			}) upserted with price ${latestPrice.toFixed(2)} and ${
				sellPrices.length
			} price row(s)`
		);
	}

	log(`Menu items processed: ${MENU_ITEMS.length}`);
}
