/** @format */
import React, { useMemo } from "react";

const toKey = (s = "") => {
	const t = s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
	const m = t.match(/[A-Za-z0-9]/);
	return m ? m[0].toUpperCase() : "#";
};

function buildBuckets(items) {
	if (!items.length) return [];
	const sorted = items.slice().sort((a, b) => a._key.localeCompare(b._key));
	const n = sorted.length;
	const buckets = n <= 20 ? 2 : n <= 40 ? 3 : n <= 70 ? 4 : n <= 120 ? 5 : 6;
	const size = Math.ceil(n / buckets);
	const out = [];
	for (let i = 0; i < buckets; i++) {
		const slice = sorted.slice(i * size, (i + 1) * size);
		if (!slice.length) continue;
		const first = slice[0]._key;
		const last = slice[slice.length - 1]._key;
		out.push({
			label: first === last ? first : `${first}–${last}`,
			start: i * size,
			end: i * size + slice.length,
			items: slice,
		});
	}
	return out;
}

export default function AlphaBuckets({ items, activeIndex, setActiveIndex }) {
	const withKeys = useMemo(
		() => items.map((it) => ({ ...it, _key: toKey(it.name) })),
		[items]
	);
	const buckets = useMemo(() => buildBuckets(withKeys), [withKeys]);

	if (!buckets.length) return null;

	return (
		<div className="flex gap-2 overflow-x-auto pb-1">
			{buckets.map((b, idx) => (
				<button
					key={idx}
					onClick={() => setActiveIndex(idx)}
					className={`px-3 py-1 rounded-full border text-[10px] ${
						idx === activeIndex
							? "bg-emerald-400 text-slate-900 border-transparent font-semibold"
							: "bg-transparent border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
					}`}
					title={`${b.items.length} items`}
				>
					{b.label}
				</button>
			))}
		</div>
	);
}

export function sliceByBucket(items, activeIndex) {
	// Recompute same partition to return slice
	const withKeys = items.map((it) => ({ ...it, _key: toKey(it.name) }));
	const buckets = buildBuckets(withKeys);
	if (!buckets.length) return items;
	const b = buckets[Math.max(0, Math.min(activeIndex, buckets.length - 1))];
	return b.items;
}
