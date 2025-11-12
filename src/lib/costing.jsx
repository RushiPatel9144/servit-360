/** @format */
/** @ts-check */
import { collection, getDocs } from "firebase/firestore";

/**
 * @typedef {Object} PriceDoc
 * @property {string} id
 * @property {number=} unitCost
 * @property {{seconds:number}=} effectiveFrom   // Firestore Timestamp (or ISO later)
 * @property {any=} effectiveTo                  // null when current
 */

/**
 * Pick effectiveTo == null, else newest effectiveFrom.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} ingredientId
 * @returns {Promise<PriceDoc|null>}
 */
export async function latestPrice(db, ingredientId) {
  const snap = await getDocs(collection(db, "ingredients", ingredientId, "prices"));
  /** @type {PriceDoc[]} */
  const prices = snap.docs.map(d => ({ id: d.id, ...(/** @type {any} */(d.data())) }));
  if (!prices.length) return null;

  const current = prices.find(p => p.effectiveTo == null);
  if (current) return current;

  const get = (p) =>
    p.effectiveFrom && typeof p.effectiveFrom === "object" && "seconds" in p.effectiveFrom
      ? p.effectiveFrom.seconds
      : Date.parse(/** @type {any} */(p.effectiveFrom) || 0) / 1000;

  return prices.slice().sort((a, b) => get(b) - get(a))[0];
}

/**
 * Compute live cost + allergens for a recipe.
 * @param {import('firebase/firestore').Firestore} db
 * @param {any} recipe
 * @param {Record<string, {name?:string, unit?:string, allergens?:string[]}>} ingredientMap
 */
export async function computeCostAndAllergens(db, recipe, ingredientMap) {
  let total = 0;
  const allergens = new Set();
  const lines = [];

  for (const line of recipe?.lines || []) {
    const ing = ingredientMap[line.ingredientId] || {};
    (ing.allergens || []).forEach(a => allergens.add(a));

    const price = await latestPrice(db, line.ingredientId);
    const unitCost = Number(price?.unitCost || 0);
    const qty = Number(line.qty || 0);
    const extCost = unitCost * qty;

    lines.push({
      ingredientId: line.ingredientId,
      ingredientName: ing.name || line.ingredientId,
      qty,
      unit: line.unit || ing.unit || "",
      unitCost,
      extCost,
    });
    total += extCost;
  }

  return {
    total,
    lines,
    allergens: Array.from(allergens),
  };
}
