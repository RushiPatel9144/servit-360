/** @format */
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

const TARGET_FOOD_COST_PCT = 0.28; // 28% target

/* ---------- tiny helpers ---------- */
const norm = (s) => (s || "").trim().toLowerCase();
const formatCurrency = (v) =>
  `$${(Number(v) || 0).toFixed(2)}`;
const formatPct = (v) =>
  `${((Number(v) || 0) * 100).toFixed(1)}%`;

/* Simple card for KPIs */
function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-[11px]">
      <div className="text-[10px] text-slate-400 mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold text-slate-50">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[10px] text-slate-500">
          {sub}
        </div>
      )}
    </div>
  );
}

export default function SalesInsights() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");

  // init default range = last 7 days
  useEffect(() => {
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const d2 = new Date();
    d2.setDate(d2.getDate() - 6);
    const start = d2.toISOString().slice(0, 10);
    setStartDate(start);
    setEndDate(end);
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    loadAnalytics(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const loadAnalytics = async (from, to) => {
    try {
      setLoading(true);
      setError("");

      // 1) Load menuItems
      const miSnap = await getDocs(collection(db, "menuItems"));
      const menuItems = miSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      const menuMap = Object.fromEntries(
        menuItems.map((m) => [m.id, m])
      );

      // 2) Load recipes
      const recSnap = await getDocs(collection(db, "recipes"));
      const recipes = recSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      const recipeMap = Object.fromEntries(
        recipes.map((r) => [r.id, r])
      );

      // 3) Load ingredients + latest cost for each
      const ingSnap = await getDocs(collection(db, "ingredients"));
      const ingredients = ingSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // latest unit cost per ingredient
      const ingredientCostMap = {};
      for (const ing of ingredients) {
        const pricesSnap = await getDocs(
          collection(db, "ingredients", ing.id, "prices")
        );
        const prices = pricesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        if (!prices.length) {
          ingredientCostMap[ing.id] = 0;
          continue;
        }
        const current =
          prices.find((p) => p.effectiveTo == null) || null;
        if (current) {
          ingredientCostMap[ing.id] =
            Number(current.unitCost) || 0;
        } else {
          const get = (p) =>
            p.effectiveFrom?.seconds
              ? p.effectiveFrom.seconds
              : Date.parse(p.effectiveFrom || 0) / 1000;
          const latest = prices
            .slice()
            .sort((a, b) => get(b) - get(a))[0];
          ingredientCostMap[ing.id] =
            Number(latest.unitCost) || 0;
        }
      }

      // 4) Pre-compute recipe COGS per portion
      const recipeCostPerPortion = {};
      for (const r of recipes) {
        let total = 0;
        for (const line of r.lines || []) {
          const cost =
            ingredientCostMap[line.ingredientId] || 0;
          const qty = Number(line.qty) || 0;
          total += cost * qty;
        }
        const yieldV = Number(r.yield) || 1;
        recipeCostPerPortion[r.id] = total / yieldV;
      }

      // 5) Load sales in date range
      const salesQ = query(
        collection(db, "serverSales"),
        where("serviceDate", ">=", from),
        where("serviceDate", "<=", to)
      );
      const salesSnap = await getDocs(salesQ);
      const sales = salesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // 6) Aggregate
      let totalSales = 0;
      let totalCOGS = 0;

      const byDateLocation = {}; // date -> loc -> agg
      const byLocation = {}; // loc -> agg
      const perItem = {}; // menuItemId -> agg

      for (const s of sales) {
        const qty = Number(s.qty) || 0;
        const pricePerUnit = Number(s.pricePerUnit) || 0;
        const lineTotal =
          typeof s.lineTotal === "number"
            ? s.lineTotal
            : qty * pricePerUnit;

        const date = s.serviceDate || "Unknown";
        const loc = s.locationId || "Unknown";
        const menu = menuMap[s.menuItemId];
        const recipeId = menu?.recipeId;
        const portionCost =
          (recipeId && recipeCostPerPortion[recipeId]) || 0;
        const lineCOGS = portionCost * qty;

        totalSales += lineTotal;
        totalCOGS += lineCOGS;

        // by date/location
        if (!byDateLocation[date]) byDateLocation[date] = {};
        if (!byDateLocation[date][loc])
          byDateLocation[date][loc] = {
            sales: 0,
            cogs: 0,
            tables: new Set(),
          };
        byDateLocation[date][loc].sales += lineTotal;
        byDateLocation[date][loc].cogs += lineCOGS;
        if (s.table) {
          byDateLocation[date][loc].tables.add(String(s.table));
        }

        // by location (overall)
        if (!byLocation[loc])
          byLocation[loc] = {
            sales: 0,
            cogs: 0,
            tables: new Set(),
          };
        byLocation[loc].sales += lineTotal;
        byLocation[loc].cogs += lineCOGS;
        if (s.table) {
          byLocation[loc].tables.add(String(s.table));
        }

        // per menu item
        if (!perItem[s.menuItemId]) {
          perItem[s.menuItemId] = {
            menuItemId: s.menuItemId,
            name: menu?.name || s.menuItemName || s.menuItemId,
            type: menu?.type || "",
            station: menu?.station || "",
            qty: 0,
            sales: 0,
            cogs: 0,
          };
        }
        perItem[s.menuItemId].qty += qty;
        perItem[s.menuItemId].sales += lineTotal;
        perItem[s.menuItemId].cogs += lineCOGS;
      }

      const foodCostPct =
        totalSales > 0 ? totalCOGS / totalSales : 0;
      const variancePct = foodCostPct - TARGET_FOOD_COST_PCT;

      // daily breakdown rows
      const dailyRows = [];
      Object.entries(byDateLocation).forEach(
        ([date, locMap]) => {
          Object.entries(locMap).forEach(
            ([loc, agg]) => {
              const tablesCount =
                agg.tables.size || 0;
              const avgCheck =
                tablesCount > 0
                  ? agg.sales / tablesCount
                  : 0;
              const pct =
                agg.sales > 0
                  ? agg.cogs / agg.sales
                  : 0;
              dailyRows.push({
                date,
                location: loc,
                sales: agg.sales,
                cogs: agg.cogs,
                foodCostPct: pct,
                tables: tablesCount,
                avgCheck,
              });
            }
          );
        }
      );
      dailyRows.sort((a, b) => {
        if (a.date === b.date) {
          return a.location.localeCompare(b.location);
        }
        return a.date < b.date ? 1 : -1; // latest first
      });

      // top 10 items by sales
      const perItemArr = Object.values(perItem);
      const topItems = perItemArr
        .slice()
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 10);

      // worst 5 items by food cost %
      const worstItems = perItemArr
        .filter((it) => it.sales > 0 && it.cogs > 0)
        .map((it) => ({
          ...it,
          pct: it.cogs / it.sales,
        }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5);

      setAnalytics({
        totalSales,
        totalCOGS,
        foodCostPct,
        variancePct,
        dailyRows,
        topItems,
        worstItems,
        byLocation,
        countSales: sales.length,
      });
    } catch (e) {
      console.error(e);
      setError("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  const rangeLabel = useMemo(() => {
    if (!startDate || !endDate) return "";
    if (startDate === endDate) return startDate;
    return `${startDate} → ${endDate}`;
  }, [startDate, endDate]);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 mt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-50">
            Sales & Food Cost Insights
          </h2>
          <p className="text-[11px] text-slate-400">
            Pulls from server POS punches and HQ specs.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-slate-400">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                setStartDate(e.target.value)
              }
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) =>
                setEndDate(e.target.value)
              }
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-[11px] text-slate-400">
          Loading analytics…
        </div>
      )}
      {error && (
        <div className="text-[11px] text-rose-400">
          {error}
        </div>
      )}

      {!loading && analytics && (
        <>
          {/* KPI row */}
          <div className="grid md:grid-cols-4 gap-3 text-[11px]">
            <KpiCard
              label="Total Sales"
              value={formatCurrency(
                analytics.totalSales
              )}
              sub={rangeLabel}
            />
            <KpiCard
              label="Theoretical COGS"
              value={formatCurrency(
                analytics.totalCOGS
              )}
              sub={
                analytics.countSales > 0
                  ? `${analytics.countSales} POS entries`
                  : "No sales in range"
              }
            />
            <KpiCard
              label="Food Cost % (Theoretical)"
              value={formatPct(
                analytics.foodCostPct
              )}
              sub={
                analytics.totalSales > 0
                  ? `${formatCurrency(
                      analytics.totalCOGS
                    )} · Target ${formatPct(
                      TARGET_FOOD_COST_PCT
                    )} · Var ${
                      analytics.variancePct >= 0
                        ? "+"
                        : ""
                    }${formatPct(
                      analytics.variancePct
                    )}`
                  : "No sales in range"
              }
            />
            <KpiCard
              label="Locations in range"
              value={Object.keys(
                analytics.byLocation || {}
              ).length}
              sub={Object.entries(
                analytics.byLocation || {}
              )
                .map(([loc, v]) => {
                  const tables =
                    v.tables.size || 0;
                  const avgCheck =
                    tables > 0
                      ? v.sales / tables
                      : 0;
                  return `${loc}: ${formatCurrency(
                    v.sales
                  )} · ${
                    tables
                  } tables · Avg ${formatCurrency(
                    avgCheck
                  )}`;
                })
                .join(" | ")}
            />
          </div>

          {/* Daily breakdown + lists */}
          <div className="grid md:grid-cols-3 gap-3 mt-3 text-[11px]">
            {/* Daily breakdown table */}
            <div className="md:col-span-2 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="px-3 py-2 bg-slate-950/60 text-[11px] text-slate-300 font-semibold">
                Daily Breakdown by Location
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-[10px]">
                  <thead className="bg-slate-950/40 text-slate-400">
                    <tr>
                      <th className="text-left p-2">
                        Date
                      </th>
                      <th className="text-left p-2">
                        Location
                      </th>
                      <th className="text-right p-2">
                        Sales
                      </th>
                      <th className="text-right p-2">
                        COGS
                      </th>
                      <th className="text-right p-2">
                        Food Cost %
                      </th>
                      <th className="text-right p-2">
                        Tables
                      </th>
                      <th className="text-right p-2">
                        Avg Check
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.dailyRows
                      .slice()
                      .map((row, idx) => (
                        <tr
                          key={
                            row.date +
                            row.location +
                            idx
                          }
                          className="border-t border-slate-800 hover:bg-slate-900/60"
                        >
                          <td className="p-2">
                            {row.date}
                          </td>
                          <td className="p-2">
                            {row.location}
                          </td>
                          <td className="p-2 text-right">
                            {formatCurrency(
                              row.sales
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {formatCurrency(
                              row.cogs
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {formatPct(
                              row.foodCostPct
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {row.tables}
                          </td>
                          <td className="p-2 text-right">
                            {formatCurrency(
                              row.avgCheck
                            )}
                          </td>
                        </tr>
                      ))}
                    {!analytics.dailyRows
                      .length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="p-3 text-slate-500 text-center"
                        >
                          No sales in this date
                          range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top / worst items */}
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-800 p-3">
                <div className="text-[11px] font-semibold text-slate-300 mb-1">
                  Top 10 Items by Sales
                </div>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {analytics.topItems &&
                  analytics.topItems.length ? (
                    analytics.topItems.map(
                      (it) => (
                        <div
                          key={it.menuItemId}
                          className="flex justify-between text-[10px]"
                        >
                          <div>
                            <div className="font-medium text-slate-100">
                              {it.name}
                            </div>
                            <div className="text-slate-500">
                              {it.type} ·{" "}
                              {it.station} · Qty{" "}
                              {it.qty}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">
                              {formatCurrency(
                                it.sales
                              )}
                            </div>
                            <div className="text-slate-500">
                              COGS{" "}
                              {formatCurrency(
                                it.cogs
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    )
                  ) : (
                    <div className="text-[10px] text-slate-500">
                      No data.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 p-3">
                <div className="text-[11px] font-semibold text-slate-300 mb-1">
                  Worst 5 Items by Food Cost %
                </div>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {analytics.worstItems &&
                  analytics.worstItems.length ? (
                    analytics.worstItems.map(
                      (it) => (
                        <div
                          key={it.menuItemId}
                          className="flex justify-between text-[10px]"
                        >
                          <div>
                            <div className="font-medium text-slate-100">
                              {it.name}
                            </div>
                            <div className="text-slate-500">
                              {it.type} ·{" "}
                              {it.station} · Qty{" "}
                              {it.qty}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-amber-300">
                              {formatPct(
                                it.pct
                              )}
                            </div>
                            <div className="text-slate-500">
                              {formatCurrency(
                                it.cogs
                              )}{" "}
                              COGS on{" "}
                              {formatCurrency(
                                it.sales
                              )}{" "}
                              sales
                            </div>
                          </div>
                        </div>
                      )
                    )
                  ) : (
                    <div className="text-[10px] text-slate-500">
                      No data.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
