/** @format */
import React from "react";

function addDays(date, days) {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}
const fmt = (d) => new Date(d).toISOString().slice(0, 10);

export default function LabelModal({
	open,
	onClose,
	itemName,
	shelfLifeDays = 0,
	allergens = [],
}) {
	if (!open) return null;
	const prep = new Date();
	const expiry = addDays(prep, Number(shelfLifeDays || 0));

	return (
		<div className="fixed inset-0 bg-black/70 grid place-items-center z-50">
			<div className="bg-white text-black w-[360px] rounded-xl p-4">
				<div className="text-sm font-semibold mb-2">Prep Label</div>
				<div className="border rounded-lg p-3">
					<div className="text-lg font-bold">{itemName}</div>
					<div className="text-xs mt-2">Prep: {fmt(prep)}</div>
					<div className="text-xs">Expiry: {fmt(expiry)}</div>
					<div className="text-xs mt-2">
						Allergens:{" "}
						{allergens.length ? allergens.join(", ") : "None"}
					</div>
				</div>
				<div className="mt-3 flex justify-end gap-2">
					<button
						onClick={onClose}
						className="px-3 py-1 rounded border"
					>
						Close
					</button>
					<button
						onClick={() => window.print()}
						className="px-3 py-1 rounded bg-black text-white"
					>
						Print
					</button>
				</div>
			</div>
		</div>
	);
}
