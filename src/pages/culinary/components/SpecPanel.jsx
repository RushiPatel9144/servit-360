/** @format */
// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

/**
 * Props:
 * - open
 * - onClose
 * - menuItem   (selected item)
 * - recipe     ({ name, yield, yieldUnit?, shelfLifeDays, tools, method, lines[] })
 * - computed   ({ total, lines:[{ingredientId, name?, unitCost, qty, unit, lineCost}], allergens:[] })
 *
 * Scaling:
 * - factor comes from either a simple 1..8x selector, or from desiredYield/baseYield if custom is filled.
 * - All qty + cost scale by factor.
 */
export default function SpecPanel({
	open,
	onClose,
	recipe,
	computed,
	menuItem,
	// 🔽 new props
	recipeNameMap = {},
	menuItemsById = {},
	onOpenByRecipeId,
}) {
	const [mult, setMult] = useState(1); // 1..8
	const [customYield, setCustomYield] = useState(""); // optional numeric
	const baseYield = Number(recipe?.yield || 1);
	// Try in order: recipe.yieldUnit → recipe.unit → menuItem.portionUnit → "portion(s)"
	const yieldUnit = (
		recipe?.yieldUnit ||
		recipe?.unit ||
		menuItem?.portionUnit ||
		"portion"
	)
		.toString()
		.trim();

	// choose factor: if customYield is valid, use that; else mult
	const factor = useMemo(() => {
		const cy = Number(customYield);
		if (!isNaN(cy) && cy > 0) {
			return cy / (baseYield || 1);
		}
		return mult || 1;
	}, [customYield, mult, baseYield]);

	// scaled lines + totals
	const scaled = useMemo(() => {
		const lines = (computed?.lines || []).map((ln) => {
			const baseQty = Number(ln.qty || 0);
			const qtyScaled = baseQty * factor;

			// Prefer ln.unitCost; fall back to pricing fields you may have used earlier
			const unitCost = Number(
				ln.unitCost ?? ln.pricePerUnit ?? ln.latestUnitCost ?? 0
			);

			// If backend gave us ln.lineCost, scale it. Otherwise compute from unitCost*qty.
			const lineCostBase =
				ln.lineCost != null ? Number(ln.lineCost) : unitCost * baseQty;

			const lineCostScaled = lineCostBase * factor;

			return {
				...ln,
				unitCost,
				qtyScaled,
				lineCostScaled,
			};
		});

		// If backend total missing/incorrect, recompute locally from lines:
		const total = lines.reduce(
			(acc, r) => acc + Number(r.lineCostScaled || 0),
			0
		);

		return { lines, total };
	}, [computed, factor]);

	const imageUrl =
		menuItem?.imageUrl ||
		recipe?.imageUrl ||
		"https://dummyimage.com/800x600/efefef/111111.jpg&text=No+Photo";

	const [photoOpen, setPhotoOpen] = useState(false);

	const getRecipeName = (id) => recipeNameMap?.[id] || id || "Component";
	const usedInMenuItems = (recipe?.usedInMenuItems || [])
		.map((mid) => menuItemsById[mid])
		.filter(Boolean);

	useEffect(() => {
		if (!open) {
			// reset when closed
			setMult(1);
			setCustomYield("");
			setPhotoOpen(false);
		}
	}, [open]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4">
			<div className="w-[min(1000px,95vw)] bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
					<div>
						<div className="text-sm font-semibold">
							{menuItem?.name || recipe?.name || "Spec"}
						</div>
						<div className="text-[11px] text-slate-400">
							Yield:{" "}
							<span className="text-slate-200">
								{(baseYield || 1).toLocaleString()}
							</span>{" "}
							<span className="text-slate-400">{yieldUnit}</span>
							{recipe?.shelfLifeDays ? (
								<>
									{" "}
									· Shelf Life:{" "}
									<span className="text-slate-200">
										{recipe.shelfLifeDays} days
									</span>
								</>
							) : null}
						</div>
					</div>

					<div className="flex items-center gap-2">
						{/* Multiplier control */}
						<label className="text-[10px] text-slate-400 flex items-center gap-1">
							Mult:
							<select
								value={mult}
								onChange={(e) =>
									setMult(Number(e.target.value))
								}
								className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px]"
							>
								{Array.from({ length: 8 }).map((_, i) => (
									<option
										key={i + 1}
										value={i + 1}
									>
										{i + 1}×
									</option>
								))}
							</select>
						</label>

						{/* Custom yield control */}
						<label className="text-[10px] text-slate-400 flex items-center gap-1">
							Custom Yield:
							<input
								value={customYield}
								onChange={(e) =>
									setCustomYield(
										e.target.value.replace(/[^\d.]/g, "")
									)
								}
								placeholder={`${baseYield}`}
								className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px]"
							/>
							<span className="text-[10px] text-slate-500">
								{yieldUnit}
							</span>
						</label>

						{/* Photo */}
						<button
							onClick={() => setPhotoOpen(true)}
							className="px-3 py-1 rounded-full border border-slate-700 text-[11px] hover:border-emerald-400 hover:text-emerald-300"
						>
							Photo
						</button>

						<button
							onClick={onClose}
							className="p-2 rounded-full border border-slate-700 hover:border-emerald-400"
							title="Close"
						>
							<X size={16} />
						</button>
					</div>
				</div>

				{/* Body */}
				<div className="p-4 grid gap-4 md:grid-cols-3">
					{/* Ingredients */}
					<div className="md:col-span-2">
						<h3 className="text-[12px] font-semibold mb-2">
							Ingredients
						</h3>
						<div className="rounded-xl border border-slate-800 overflow-hidden">
							<table className="w-full text-[11px]">
								<thead className="bg-slate-900/60 text-slate-300">
									<tr>
										<th className="text-left p-2">
											Ingredient
										</th>
										<th className="text-right p-2">Qty</th>
										<th className="text-left p-2">Unit</th>
										<th className="text-right p-2">Cost</th>
									</tr>
								</thead>
								<tbody>
									{scaled.lines.map((ln, idx) => (
										<tr
											key={idx}
											className="border-t border-slate-800"
										>
											<td className="p-2">
												{ln.name ||
													ln.ingredientName ||
													ln.ingredientId}
											</td>
											<td className="p-2 text-right">
												{toFixedSmart(ln.qtyScaled)}
											</td>
											<td className="p-2">
												{ln.unit || "-"}
											</td>
											<td className="p-2 text-right">
												$
												{toFixedSmart(
													ln.lineCostScaled,
													4
												)}
											</td>
										</tr>
									))}
									{!scaled.lines.length && (
										<tr>
											<td
												colSpan={4}
												className="p-2 text-slate-500"
											>
												No lines.
											</td>
										</tr>
									)}
								</tbody>

								<tfoot className="bg-slate-900/40">
									<tr>
										<td
											className="p-2 font-semibold"
											colSpan={3}
										>
											Total Cost (
											{displayYield(
												baseYield,
												yieldUnit,
												factor
											)}
											)
										</td>
										<td className="p-2 text-right font-semibold">
											${toFixedSmart(scaled.total, 4)}
										</td>
									</tr>
								</tfoot>
							</table>
						</div>

						<div className="text-[10px] text-slate-400 mt-2">
							* All quantities and costs above reflect the
							selected multiplier / custom yield.
						</div>
					</div>

					{/* Method / Tools */}
					<div className="">
						<h3 className="text-[12px] font-semibold mb-2">
							Method
						</h3>
						<div className="text-[11px] text-slate-300 whitespace-pre-line bg-slate-900/40 border border-slate-800 rounded-xl p-3">
							{recipe?.method || "—"}
						</div>

						<h3 className="text-[12px] font-semibold mt-3 mb-2">
							Tools
						</h3>
						<div className="text-[11px] text-slate-300 bg-slate-900/40 border border-slate-800 rounded-xl p-3">
							{recipe?.tools || "—"}
						</div>

						{computed?.allergens?.length ? (
							<>
								<h3 className="text-[12px] font-semibold mt-3 mb-2">
									Allergens
								</h3>
								<div className="flex flex-wrap gap-1">
									{computed.allergens.map((a) => (
										<span
											key={a}
											className="px-2 py-0.5 rounded-full border border-amber-400 text-amber-300 text-[10px]"
										>
											{a}
										</span>
									))}
								</div>
							</>
						) : null}

						{/* Components: other prepped recipes this spec uses (for mains) */}
						{Array.isArray(recipe?.components) &&
							recipe.components.length > 0 && (
								<>
									<h3 className="text-[12px] font-semibold mt-3 mb-2">
										Components
									</h3>
									<div className="flex flex-wrap gap-1">
										{recipe.components.map((rid) => (
											<button
												key={rid}
												onClick={() =>
													onOpenByRecipeId &&
													onOpenByRecipeId(rid)
												}
												className="px-2 py-1 rounded-full border border-slate-700 text-[10px] hover:border-emerald-400 hover:text-emerald-300"
											>
												{getRecipeName(rid)}
											</button>
										))}
									</div>
								</>
							)}

						{/* Used in: which dishes use this prep recipe */}
						{usedInMenuItems.length > 0 && (
							<>
								<h3 className="text-[12px] font-semibold mt-3 mb-2">
									Used In
								</h3>
								<div className="flex flex-wrap gap-1">
									{usedInMenuItems.map((mi) => (
										<button
											key={mi.id}
											onClick={() =>
												onOpenByRecipeId &&
												onOpenByRecipeId(mi.recipeId)
											}
											className="px-2 py-1 rounded-full border border-slate-700 text-[10px] hover:border-emerald-400 hover:text-emerald-300"
										>
											{mi.name} · {mi.type || "Line"}
										</button>
									))}
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{/* Photo Modal */}
			{photoOpen && (
				<div className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4">
					<div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden max-w-[95vw]">
						<div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
							<div className="text-[12px]">Photo Preview</div>
							<button
								onClick={() => setPhotoOpen(false)}
								className="p-2 rounded border border-slate-700"
							>
								<X size={16} />
							</button>
						</div>
						<img
							src={imageUrl}
							alt="Spec"
							className="max-h-[80vh] max-w-[90vw] object-contain bg-black"
						/>
					</div>
				</div>
			)}
		</div>
	);
}

function toFixedSmart(n, dp = 2) {
	const num = Number(n || 0);
	if (num === 0) return "0";
	return num.toFixed(dp).replace(/\.?0+$/, ""); // trim trailing zeros
}

function displayYield(baseYield, unit, factor) {
	const out = (Number(baseYield || 1) * Number(factor || 1)).toLocaleString();
	return `${out} ${unit}`;
}
