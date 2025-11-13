/** @format */
import React, { useState } from "react";
import { db } from "../../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Seeds a clean "v2" menu:
 * - consistent fields: name, type, station, brand, imageUrl, recipeId,
 *   parentMenuItemId, price, active, version, createdAt, updatedAt
 * - includes main dishes, expo items, and bar drinks
 */
export default function SeedMenuV2() {
	const [log, setLog] = useState([]);
	const [running, setRunning] = useState(false);
	const [done, setDone] = useState(false);
	const plog = (m) => setLog((x) => [...x, m]);

	// simple helper to make a dummy image url
	const img = (label) =>
		`https://dummyimage.com/800x600/efefef/111111.jpg&text=${encodeURIComponent(
			label
		)}`;

	const menuDefs = [
		// ---------- LINE STATION MAINS ----------
		{
			id: "grilled-salmon",
			name: "Grilled Salmon",
			type: "Line Station",
			station: "Grill",
			brand: "Jack Astor's",
			recipeId: "grilled-salmon",
			parentMenuItemId: null,
			price: 27.99,
		},
		{
			id: "classic-burger",
			name: "Classic Burger",
			type: "Line Station",
			station: "Grill",
			brand: "Jack Astor's",
			recipeId: "beef-burger-patty",
			parentMenuItemId: null,
			price: 19.99,
		},
		{
			id: "chicken-parm",
			name: "Chicken Parm",
			type: "Line Station",
			station: "Hot Pantry",
			brand: "Scaddabush",
			recipeId: "chicken-parmesan",
			parentMenuItemId: null,
			price: 25.49,
		},
		{
			id: "spaghetti-pomodoro-main",
			name: "Spaghetti Pomodoro",
			type: "Line Station",
			station: "Saute",
			brand: "Scaddabush",
			recipeId: "spaghetti-pomodoro",
			parentMenuItemId: null,
			price: 21.99,
		},
		{
			id: "truffle-fries-main",
			name: "Truffle Fries",
			type: "Line Station",
			station: "Fryer",
			brand: "Jack Astor's",
			recipeId: "truffle-fries",
			parentMenuItemId: null,
			price: 12.99,
		},
		{
			id: "mozza-sticks-main",
			name: "Mozzarella Sticks",
			type: "Line Station",
			station: "Fryer",
			brand: "Jack Astor's",
			recipeId: "mozzarella-sticks",
			parentMenuItemId: null,
			price: 13.49,
		},

		// ---------- EXPO PLATES (PRESENTATION) ----------
		{
			id: "grilled-salmon-expo",
			name: "Grilled Salmon (Expo)",
			type: "Expo",
			station: "Grill",
			brand: "Jack Astor's",
			recipeId: "grilled-salmon",
			parentMenuItemId: "grilled-salmon",
			price: 27.99,
		},
		{
			id: "classic-burger-expo",
			name: "Classic Burger (Expo)",
			type: "Expo",
			station: "Grill",
			brand: "Jack Astor's",
			recipeId: "beef-burger-patty",
			parentMenuItemId: "classic-burger",
			price: 19.99,
		},
		{
			id: "chicken-parm-expo",
			name: "Chicken Parm (Expo)",
			type: "Expo",
			station: "Hot Pantry",
			brand: "Scaddabush",
			recipeId: "chicken-parmesan",
			parentMenuItemId: "chicken-parm",
			price: 25.49,
		},
		{
			id: "spaghetti-pomodoro-expo",
			name: "Spaghetti Pomodoro (Expo)",
			type: "Expo",
			station: "Saute",
			brand: "Scaddabush",
			recipeId: "spaghetti-pomodoro",
			parentMenuItemId: "spaghetti-pomodoro-main",
			price: 21.99,
		},
		{
			id: "truffle-fries-expo",
			name: "Truffle Fries (Expo)",
			type: "Expo",
			station: "Fryer",
			brand: "Jack Astor's",
			recipeId: "truffle-fries",
			parentMenuItemId: "truffle-fries-main",
			price: 12.99,
		},
		{
			id: "mozza-sticks-expo",
			name: "Mozzarella Sticks (Expo)",
			type: "Expo",
			station: "Fryer",
			brand: "Jack Astor's",
			recipeId: "mozzarella-sticks",
			parentMenuItemId: "mozza-sticks-main",
			price: 13.49,
		},

		// ---------- PREP ITEMS (USED IN DISHES) ----------
		{
			id: "caesar-dressing-prep",
			name: "Caesar Dressing (Prep)",
			type: "Prep",
			station: "Pantry",
			brand: "Scaddabush",
			recipeId: "caesar-dressing",
			parentMenuItemId: null,
			price: 0, // not sold to guests directly
		},
		{
			id: "garlic-butter-prep",
			name: "Garlic Butter (Prep)",
			type: "Prep",
			station: "Pantry",
			brand: "Scaddabush",
			recipeId: "garlic-butter",
			parentMenuItemId: null,
			price: 0,
		},

		// ---------- PURCHASED (JUST LABELS, NOT DISHES) ----------
		{
			id: "pomodoro-base-purchased",
			name: "Pomodoro Base",
			type: "Purchased",
			station: "Hot Pantry",
			brand: "Scaddabush",
			recipeId: null,
			parentMenuItemId: null,
			price: 0,
		},
		{
			id: "pesto-sauce-purchased",
			name: "Pesto Sauce",
			type: "Purchased",
			station: "Saute",
			brand: "Scaddabush",
			recipeId: null,
			parentMenuItemId: null,
			price: 0,
		},

		// ---------- BAR DRINKS ----------
		{
			id: "negroni",
			name: "Negroni",
			type: "Bar",
			station: "Bar",
			brand: "Scaddabush",
			recipeId: "negroni",
			parentMenuItemId: null,
			price: 14.5,
		},
		{
			id: "aperol-spritz",
			name: "Aperol Spritz",
			type: "Bar",
			station: "Bar",
			brand: "Scaddabush",
			recipeId: "aperol-spritz",
			parentMenuItemId: null,
			price: 13.5,
		},
		{
			id: "house-red-6oz",
			name: "House Red Wine 6oz",
			type: "Bar",
			station: "Bar",
			brand: "Scaddabush",
			recipeId: "house-red-6oz",
			parentMenuItemId: null,
			price: 10.0,
		},
		{
			id: "house-white-6oz",
			name: "House White Wine 6oz",
			type: "Bar",
			station: "Bar",
			brand: "Scaddabush",
			recipeId: "house-white-6oz",
			parentMenuItemId: null,
			price: 10.0,
		},
		{
			id: "margarita-rocks",
			name: "Margarita on the Rocks",
			type: "Bar",
			station: "Bar",
			brand: "Jack Astor's",
			recipeId: "margarita-rocks",
			parentMenuItemId: null,
			price: 15.0,
		},
	];

	const run = async () => {
		if (running || done) return;
		setRunning(true);
		setLog([]);
		plog("🌱 Seeding v2 menu items…");

		try {
			for (const def of menuDefs) {
				const ref = doc(db, "menuItems", def.id);
				await setDoc(
					ref,
					{
						...def,
						imageUrl: def.imageUrl || img(def.name),
						active: true,
						version: 2,
						updatedAt: serverTimestamp(),
						createdAt: serverTimestamp(),
					},
					{ merge: true } // overwrite/normalize if already exists
				);
				plog(`✅ Upserted menu item: ${def.name}`);
			}
			plog("🎉 Completed seeding v2 menu.");
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
					Seed v2 Menu (with prices + bar)
				</h1>
				<p className="text-[11px] text-slate-400 mb-3">
					Writes a clean set of menuItems with price,
					parentMenuItemId, images and a <code>version: 2</code> flag
					so you can ignore the old messy seeds.
				</p>
				<button
					disabled={running || done}
					onClick={run}
					className={`px-4 py-2 rounded-full text-[11px] font-semibold ${
						done
							? "bg-emerald-500 text-slate-900"
							: "bg-emerald-400 text-slate-900"
					} ${running ? "opacity-60" : ""}`}
				>
					{done ? "Done!" : running ? "Seeding…" : "Seed v2 Menu"}
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
