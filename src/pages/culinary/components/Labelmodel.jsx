/** @format */
import React, { useState, useEffect, useRef } from "react";

function addDays(date, days) {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

const fmtFull = (d) =>
	new Date(d).toLocaleString(undefined, {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});

export default function LabelModal({
	open,
	onClose,
	itemName,
	shelfLifeDays = 0,
	allergens = [],
}) {
	const [printQty, setPrintQty] = useState(1);
	const labelRef = useRef(null);

	useEffect(() => {
		try {
			const saved = Number(localStorage.getItem("label_qty") || "1");
			if (saved >= 1 && saved <= 9) setPrintQty(saved);
		} catch {}
	}, []);
	useEffect(() => {
		try {
			localStorage.setItem("label_qty", String(printQty));
		} catch {}
	}, [printQty]);

	if (!open) return null;

	const prep = new Date();
	const expiry = addDays(prep, Number(shelfLifeDays || 0));

	// 🔑 Print only the label, N times
	const handlePrint = () => {
		if (!labelRef.current) return;
		const single = labelRef.current.outerHTML;
		const copies = Array.from({ length: printQty })
			.map(() => single)
			.join("");

		const printWin = window.open("", "PRINT", "width=600,height=800");
		if (!printWin) return;

		// Optional: simple print CSS (white bg, tight margins)
		const css = `
      @page { margin: 6mm; }
      body { background: #fff; color: #000; font-family: system-ui, sans-serif; }
      .label-card { width: 20rem; border: 1px solid #ccc; border-radius: 12px; padding: 16px; margin: 0 0 8px 0; }
    `;

		printWin.document.write(
			`<html><head><title>Labels</title><style>${css}</style></head><body>${copies}</body></html>`
		);
		printWin.document.close();
		printWin.focus();
		printWin.print();
		printWin.close();

		// Optionally close the modal after printing
		onClose();
	};

	return (
		<div className="fixed inset-0 bg-black/70 grid place-items-center z-50">
			<div className="bg-white text-black w-[380px] rounded-xl p-4">
				<div className="text-sm font-semibold mb-2">Prep Label</div>

				{/* Single on-screen preview only */}
				<div
					ref={labelRef}
					className="label-card bg-white text-black w-[360px] print:w-80 rounded-xl p-4 border border-slate-300"
				>
					<div className="text-lg font-bold leading-tight">
						{itemName}
					</div>
					<div className="text-[10px] text-black/60">
						SKU: DEMO-
						{(itemName || "")
							.replace(/[^A-Z0-9]/gi, "")
							.slice(0, 6)
							.toUpperCase()}
					</div>
					<div className="text-xs mt-2">Prep: {fmtFull(prep)}</div>
					<div className="text-xs">Expiry: {fmtFull(expiry)}</div>
					<div className="text-xs mt-2">
						<span className="font-semibold">Allergens:</span>{" "}
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

					<div className="flex items-center gap-2">
						<label className="text-[10px] text-slate-600">
							Qty:
							<select
								value={printQty}
								onChange={(e) =>
									setPrintQty(Number(e.target.value))
								}
								className="ml-1 bg-slate-100 border border-slate-300 rounded px-1 text-[10px] text-black"
							>
								{[...Array(9)].map((_, i) => (
									<option
										key={i + 1}
										value={i + 1}
									>
										{i + 1}
									</option>
								))}
							</select>
						</label>

						<button
							onClick={handlePrint}
							className="px-3 py-1 rounded-full bg-emerald-500 text-slate-900 text-[11px] font-semibold"
						>
							Print
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
