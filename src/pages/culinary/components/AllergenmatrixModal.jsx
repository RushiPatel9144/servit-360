/** @format */
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../../firebase";
import { getDoc, doc } from "firebase/firestore";

// Default allergen columns (adjust if you use more)
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

export default function AllergenMatrixModal({
	open,
	onClose,
	items = [], // array of menuItems you pass in (already filtered)
	ingredientsMap = {}, // from dashboard state
}) {
	const [rows, setRows] = useState([]); // [{id,name,flags:{Egg:true,...}}]
	const [loading, setLoading] = useState(false);

	const hasItems = items && items.length > 0;

	useEffect(() => {
		if (!open || !hasItems) return;
		(async () => {
			setLoading(true);
			try {
				// Pull each recipe and derive allergens from ingredientMap (fast)
				const derived = [];
				for (const it of items) {
					const s = await getDoc(doc(db, "recipes", it.recipeId));
					const r = s.exists() ? s.data() : null;
					const flags = Object.fromEntries(
						ALLERGENS.map((a) => [a, false])
					);

					for (const ln of r?.lines || []) {
						const ing = ingredientsMap[ln.ingredientId];
						(ing?.allergens || []).forEach((a) => {
							if (a in flags) flags[a] = true;
						});
					}

					derived.push({ id: it.id, name: it.name, flags });
				}
				setRows(derived);
			} finally {
				setLoading(false);
			}
		})();
	}, [open, hasItems, items, ingredientsMap]);

	const totalCols = useMemo(() => ALLERGENS.length, []);

	if (!open) return null;

	return (
		<div className="fixed inset-0 bg-black/70 z-50 grid place-items-center">
			<div className="bg-slate-950 text-slate-100 w-[min(1000px,95vw)] rounded-2xl border border-slate-800 p-4">
				<div className="flex items-center justify-between mb-3">
					<div className="text-sm font-semibold">
						Allergen Matrix ({items.length} items)
					</div>
					<div className="flex gap-2">
						<button
							onClick={onClose}
							className="px-3 py-1 rounded-full border border-slate-700 text-[11px]"
						>
							Close
						</button>
						<button
							onClick={() => window.print()}
							className="px-3 py-1 rounded-full bg-emerald-400 text-slate-900 text-[11px] font-semibold"
						>
							Print
						</button>
					</div>
				</div>

				{loading ? (
					<div className="text-[12px] text-slate-400">
						Building matrix…
					</div>
				) : rows.length ? (
					<div className="overflow-auto rounded-xl border border-slate-800">
						<table className="min-w-[720px] w-full text-[11px]">
							<thead className="bg-slate-900/60 text-slate-300">
								<tr>
									<th className="text-left p-2 sticky left-0 bg-slate-900/60">
										Item
									</th>
									{ALLERGENS.map((a) => (
										<th
											key={a}
											className="p-2 text-center"
										>
											{a}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<tr
										key={r.id}
										className="border-t border-slate-800"
									>
										<td className="p-2 sticky left-0 bg-slate-950">
											{r.name}
										</td>
										{ALLERGENS.map((a) => (
											<td
												key={a}
												className="p-2 text-center"
											>
												{r.flags[a] ? "✓" : "–"}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className="text-[12px] text-slate-400">
						No items to show.
					</div>
				)}
			</div>
		</div>
	);
}
