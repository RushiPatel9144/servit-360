/** @format */
import React from "react";

export default function SpecPanel({
	open,
	onClose,
	recipe,
	computed,
	menuItem,
}) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-40 flex">
			<div
				className="flex-1"
				onClick={onClose}
			/>
			<div className="w-full max-w-[420px] bg-slate-950 text-slate-100 border-l border-slate-800 p-4 overflow-y-auto">
				<div className="flex items-center justify-between mb-2">
					<div className="text-sm font-semibold">
						{menuItem?.name}
					</div>
					<button
						onClick={onClose}
						className="px-2 py-1 rounded-full border border-slate-700 text-[11px]"
					>
						Close
					</button>
				</div>

				<div className="text-[11px] text-slate-400 mb-2">
					Yield: {recipe?.yield || 1} · Shelf life:{" "}
					{recipe?.shelfLifeDays || 0}d
				</div>

				<div className="rounded-xl border border-slate-800 overflow-hidden mb-3">
					<table className="w-full text-[10px]">
						<thead className="bg-slate-900/60 text-slate-400">
							<tr>
								<th className="text-left p-2">Ingredient</th>
								<th className="text-right p-2">Qty</th>
								<th className="text-right p-2">Unit Cost</th>
								<th className="text-right p-2">Ext</th>
							</tr>
						</thead>
						<tbody>
							{(computed?.lines || []).map((ln, i) => (
								<tr
									key={i}
									className="border-t border-slate-800"
								>
									<td className="p-2">{ln.ingredientName}</td>
									<td className="p-2 text-right">
										{ln.qty} {ln.unit}
									</td>
									<td className="p-2 text-right">
										${Number(ln.unitCost).toFixed(4)}
									</td>
									<td className="p-2 text-right">
										${Number(ln.extCost).toFixed(4)}
									</td>
								</tr>
							))}
							<tr className="border-t border-slate-700 bg-slate-900/40">
								<td
									className="p-2 font-medium"
									colSpan={3}
								>
									Total
								</td>
								<td className="p-2 text-right font-semibold">
									${Number(computed?.total || 0).toFixed(4)}
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<div className="mb-3">
					<div className="text-[10px] text-slate-400 mb-1">
						Allergens (derived)
					</div>
					{computed?.allergens?.length ? (
						<div className="flex flex-wrap gap-2">
							{computed.allergens.map((a) => (
								<span
									key={a}
									className="px-2 py-1 rounded-full border border-amber-400 text-[10px] text-amber-300"
								>
									{a}
								</span>
							))}
						</div>
					) : (
						<div className="text-[11px] text-slate-500">None</div>
					)}
				</div>

				<div className="mb-3">
					<div className="text-[10px] text-slate-400 mb-1">Tools</div>
					<div className="text-[11px] text-slate-300">
						{recipe?.tools || "—"}
					</div>
				</div>

				<div className="">
					<div className="text-[10px] text-slate-400 mb-1">
						Method
					</div>
					<pre className="text-[11px] text-slate-300 whitespace-pre-wrap">
						{recipe?.method || "—"}
					</pre>
				</div>
			</div>
		</div>
	);
}
