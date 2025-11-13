/** @format */
import React, { useEffect, useState } from "react";
import { auth, db } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import AppHeader from "../../components/layout/AppHeader";
import { Navigate } from "react-router-dom";

export default function ServerDashboard() {
  // auth state
  const [authUser, setAuthUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // menu items
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuDebug, setMenuDebug] = useState(""); // 🔍 debug text
  const [selectedItem, setSelectedItem] = useState(null);

  // sales data
  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalItems: 0,
    totalEntries: 0,
  });

  // table closings (for tips, etc.)
  const [tableClosings, setTableClosings] = useState([]); // docs from serverTableClosings
  const [tipPercent, setTipPercent] = useState({}); // table -> string

  // form state
  const [tableNum, setTableNum] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");

  // helper: today as YYYY-MM-DD string
  const getServiceDate = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // 1) Listen to Firebase auth state
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) setAuthUser(user);
      else setAuthUser(null);
    });
    return () => unsub();
  }, []);

  // 2) Load Firestore profile from "users" by email
  useEffect(() => {
    const loadProfile = async () => {
      if (!authUser) {
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      try {
        const qUsers = query(
          collection(db, "users"),
          where("email", "==", authUser.email)
        );
        const snap = await getDocs(qUsers);

        if (!snap.empty) {
          const d = snap.docs[0].data();
          const loc = d.locationId || d.location || "Unknown Location";
          const prof = {
            name: d.name || authUser.email,
            location: loc,
            serverCode: d.serverCode || snap.docs[0].id,
          };
          setProfile(prof);

          localStorage.setItem("locationId", loc);
          localStorage.setItem("serverId", prof.serverCode);
          localStorage.setItem("serverName", prof.name);
        } else {
          setProfile({
            name: authUser.email,
            location: "Unknown Location",
            serverCode: authUser.uid,
          });
        }
      } catch (err) {
        console.error("Error loading server profile:", err);
      } finally {
        setProfileLoading(false);
      }
    };

    if (authUser !== undefined) {
      loadProfile();
    }
  }, [authUser]);

  const selectItem = (item) => {
    setSelectedItem(item);
    setPrice(
      typeof item.price === "number" ? item.price.toFixed(2) : item.price ?? ""
    );
    setQty(1);
  };

  // 3) Load ALL menuItems (no filters) just to prove we see data
  useEffect(() => {
    const loadMenu = async () => {
      setMenuLoading(true);
      try {
        const snap = await getDocs(collection(db, "menuItems"));
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        console.log("Loaded menuItems (raw):", list);
        setMenuItems(list);
        setMenuDebug(`Loaded ${list.length} menuItems from Firestore.`);
      } catch (err) {
        console.error("Error loading menuItems:", err);
        setMenuDebug("Error loading menuItems. Check console.");
      } finally {
        setMenuLoading(false);
      }
    };
    loadMenu();
  }, []);

  // 4) Load today's sales for this server
  const refreshSales = async (user, prof) => {
    if (!user) {
      setSalesLoading(false);
      return;
    }
    setSalesLoading(true);
    try {
      const serviceDate = getServiceDate();
      const qSales = query(
        collection(db, "serverSales"),
        where("serverUid", "==", user.uid)
      );
      const snap = await getDocs(qSales);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list = list.filter((s) => s.serviceDate === serviceDate);
      setSales(list);

      let totalSales = 0;
      let totalItems = 0;
      for (const s of list) {
        const q = Number(s.qty) || 0;
        const line =
          typeof s.lineTotal === "number"
            ? s.lineTotal
            : (Number(s.pricePerUnit) || 0) * q;
        totalSales += line;
        totalItems += q;
      }
      setSummary({
        totalSales,
        totalItems,
        totalEntries: list.length,
      });
    } catch (err) {
      console.error("Error loading sales:", err);
    } finally {
      setSalesLoading(false);
    }
  };

  useEffect(() => {
    if (authUser && profile) {
      refreshSales(authUser, profile);
    }
  }, [authUser, profile]);

  // 5) Load today's table closings for this server
  useEffect(() => {
    const loadClosings = async () => {
      if (!authUser || !profile) {
        setTableClosings([]);
        return;
      }
      try {
        const serviceDate = getServiceDate();
        const qClose = query(
          collection(db, "serverTableClosings"),
          where("serverUid", "==", authUser.uid),
          where("serviceDate", "==", serviceDate)
        );
        const snap = await getDocs(qClose);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTableClosings(list);
      } catch (err) {
        console.error("Error loading table closings:", err);
      }
    };
    if (authUser && profile) {
      loadClosings();
    }
  }, [authUser, profile]);

  // 6) Group menu items "like a menu" — by type then station
  const groupedMenu = React.useMemo(() => {
    const byType = {};
    for (const it of menuItems) {
      const t = it.type || "Other";
      if (!byType[t]) byType[t] = {};
      const st = it.station || "General";
      if (!byType[t][st]) byType[t][st] = [];
      byType[t][st].push(it);
    }
    return byType;
  }, [menuItems]);

  // 7) Group today's sales by table
  const tableGroups = React.useMemo(() => {
    const groups = {};
    for (const s of sales) {
      const table = s.table || "";
      if (!table) continue; // skip entries with no table
      if (!groups[table]) {
        groups[table] = {
          table,
          lines: [],
          subtotal: 0,
        };
      }
      const q = Number(s.qty) || 0;
      const lineTotal =
        typeof s.lineTotal === "number"
          ? s.lineTotal
          : (Number(s.pricePerUnit) || 0) * q;
      groups[table].lines.push(s);
      groups[table].subtotal += lineTotal;
    }
    return groups;
  }, [sales]);

  // set of closed tables for today
  const closedTablesSet = React.useMemo(() => {
    return new Set(tableClosings.map((c) => String(c.table || "")));
  }, [tableClosings]);

  const openTableKeys = React.useMemo(() => {
    return Object.keys(tableGroups).filter(
      (t) => t && !closedTablesSet.has(String(t))
    );
  }, [tableGroups, closedTablesSet]);

  // 8) Submit a new sale using selected menu item
  const handleAddSale = async (e) => {
    e.preventDefault();
    if (!authUser || !profile) return;
    if (!selectedItem) {
      alert("Select a menu item first.");
      return;
    }
    if (price === "" || price === null) {
      alert("Enter price per item.");
      return;
    }

    const qNum = Number(qty) || 1;
    const unitPrice = Number(price);
    const lineTotal = qNum * unitPrice;
    const serviceDate = getServiceDate();

    try {
      await addDoc(collection(db, "serverSales"), {
        serverUid: authUser.uid,
        serverEmail: authUser.email,
        serverName: profile.name,
        serverCode: profile.serverCode,
        locationId: profile.location,
        menuItemId: selectedItem.id,
        menuItemName: selectedItem.name,
        type: selectedItem.type || null,
        station: selectedItem.station || null,
        table: tableNum || null,
        qty: qNum,
        pricePerUnit: unitPrice,
        lineTotal,
        serviceDate, // YYYY-MM-DD
        createdAt: serverTimestamp(),
      });

      setTableNum("");
      setQty(1);
      setPrice("");

      // Refresh sales summary
      await refreshSales(authUser, profile);
    } catch (err) {
      console.error("Error adding sale:", err);
      alert("Error adding sale. Check console.");
    }
  };

  // 9) Close a table with tip
  const handleCloseTable = async (table) => {
    if (!authUser || !profile) return;
    const group = tableGroups[table];
    if (!group) return;

    const serviceDate = getServiceDate();
    const subtotal = group.subtotal;
    const pct = Number(tipPercent[table] ?? 15);
    const tipAmount = (subtotal * pct) / 100;
    const grandTotal = subtotal + tipAmount;

    try {
      // Write a closing record
      await addDoc(collection(db, "serverTableClosings"), {
        serverUid: authUser.uid,
        serverEmail: authUser.email,
        serverName: profile.name,
        serverCode: profile.serverCode,
        locationId: profile.location,
        table,
        serviceDate,
        subtotal,
        tipPercent: pct,
        tipAmount,
        grandTotal,
        createdAt: serverTimestamp(),
      });

      // refresh closings
      const qClose = query(
        collection(db, "serverTableClosings"),
        where("serverUid", "==", authUser.uid),
        where("serviceDate", "==", serviceDate)
      );
      const snap = await getDocs(qClose);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTableClosings(list);

      // Optionally clear input
      setTipPercent((prev) => {
        const copy = { ...prev };
        delete copy[table];
        return copy;
      });
    } catch (err) {
      console.error("Error closing table:", err);
      alert("Error closing table. Check console.");
    }
  };

  // --- RENDER STATES ---

  if (authUser === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading session…</p>
      </div>
    );
  }

  if (authUser === null) {
    return <Navigate to="/login" replace />;
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading server dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />
      <div className="max-w-6xl mx-auto p-5 space-y-4">
        {/* HEADER / SUMMARY */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Server Dashboard</h1>
            <p className="text-sm text-slate-300">
              Welcome{" "}
              <span className="font-semibold">{profile.name}</span> –{" "}
              {profile.location}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Today: {getServiceDate()}
            </p>
            {selectedItem && (
              <p className="text-[11px] text-emerald-300 mt-1">
                Punching for: {selectedItem.name} (
                {selectedItem.type || "Type"} ·{" "}
                {selectedItem.station || "Station"})
              </p>
            )}
          </div>
          <div className="text-right text-[11px] space-y-1">
            <div>
              <span className="text-slate-400">Total Sales: </span>
              <span className="font-semibold text-emerald-300">
                ${summary.totalSales.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Items Sold: </span>
              <span className="font-semibold">{summary.totalItems}</span>
            </div>
            <div>
              <span className="text-slate-400">Entries Today: </span>
              <span className="font-semibold">{summary.totalEntries}</span>
            </div>
          </div>
        </div>

        {/* LAYOUT: LEFT = FORM, RIGHT = MENU */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* ADD SALE FORM */}
          <form
            onSubmit={handleAddSale}
            className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3"
          >
            <h2 className="text-sm font-semibold mb-1">
              Add Sale (Quick Punch)
            </h2>
            <div className="text-[11px] text-slate-400 mb-1">
              {selectedItem ? (
                <>
                  Selected item:{" "}
                  <span className="text-slate-100">
                    {selectedItem.name}
                  </span>
                </>
              ) : (
                <span className="text-amber-300">
                  Select an item from the menu on the right.
                </span>
              )}
            </div>
            <input
              value={tableNum}
              onChange={(e) => setTableNum(e.target.value)}
              placeholder="Table # (optional)"
              className="w-full p-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Qty"
                className="p-2 w-16 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
              />
              <input
                type="number"
                step="0.01"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Price ea."
                className="p-2 w-24 rounded-xl bg-slate-950 border border-slate-700 text-[11px]"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-full bg-emerald-400 text-slate-900 text-[11px] font-semibold"
              >
                Add Entry
              </button>
            </div>
          </form>

          {/* MENU GRID */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Menu (from HQ specs)</h2>
              {menuLoading && (
                <div className="text-[10px] text-slate-400">
                  Loading menu…
                </div>
              )}
            </div>

            {/* Debug line so we see what Firestore did */}
            {menuDebug && (
              <div className="text-[10px] text-slate-500 mb-1">
                {menuDebug}
              </div>
            )}

            {!menuLoading && menuItems.length === 0 && (
              <div className="text-[11px] text-slate-500">
                No menu items found in <code>menuItems</code> collection.
                Check Firestore collection name & rules.
              </div>
            )}

            {Object.keys(groupedMenu).map((type) => (
              <div key={type} className="mb-3">
                <div className="text-[11px] font-semibold text-slate-300 mb-1">
                  {type}
                </div>
                {Object.keys(groupedMenu[type]).map((st) => (
                  <div key={st} className="mb-2">
                    <div className="text-[10px] text-slate-500 mb-1">
                      {st}
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {groupedMenu[type][st].map((it) => {
                        const active =
                          selectedItem && selectedItem.id === it.id;
                        return (
                          <button
                            type="button"
                            key={it.id}
                            onClick={() => selectItem(it)}
                            className={`text-left text-[11px] px-2 py-1 rounded-xl border ${
                              active
                                ? "border-emerald-400 bg-slate-800 text-emerald-200"
                                : "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                            }`}
                          >
                            <div className="font-semibold">{it.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {it.type || "Type"} ·{" "}
                              {it.station || "Station"}
                            </div>
                            {typeof it.price === "number" && (
                              <div className="text-[10px] text-slate-300">
                                ${it.price.toFixed(2)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* OPEN TABLES (with tips & close) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <h2 className="text-sm font-semibold mb-2">Open Tables</h2>
          {openTableKeys.length === 0 ? (
            <div className="text-[11px] text-slate-500">
              No open tables. Entries without table # don&apos;t show here.
            </div>
          ) : (
            <div className="space-y-2 text-[11px]">
              {openTableKeys.map((t) => {
                const g = tableGroups[t];
                const subtotal = g.subtotal;
                const pct = Number(tipPercent[t] ?? 15);
                const tipAmt = (subtotal * pct) / 100;
                const grand = subtotal + tipAmt;

                return (
                  <div
                    key={t}
                    className="border border-slate-800 rounded-xl p-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold">Table {t}</div>
                      <div className="text-slate-400">
                        {g.lines.length} entries · Subtotal $
                        {subtotal.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Tip %</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={pct}
                          onChange={(e) =>
                            setTipPercent((prev) => ({
                              ...prev,
                              [t]: e.target.value,
                            }))
                          }
                          className="w-14 px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-[11px]"
                        />
                      </div>
                      <div className="text-right">
                        <div>
                          Tip:{" "}
                          <span className="font-semibold">
                            ${tipAmt.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          Total:{" "}
                          <span className="font-semibold text-emerald-300">
                            ${grand.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCloseTable(t)}
                        className="px-3 py-1 rounded-full bg-emerald-400 text-slate-900 font-semibold text-[11px]"
                      >
                        Close Table
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* TODAY'S ENTRIES */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <h2 className="text-sm font-semibold mb-2">
            Today&apos;s Entries
          </h2>
          {salesLoading ? (
            <div className="text-[11px] text-slate-400">
              Loading sales…
            </div>
          ) : sales.length === 0 ? (
            <div className="text-[11px] text-slate-500">
              No entries yet. Punch your first sale above.
            </div>
          ) : (
            <div className="space-y-2 text-[11px]">
              {sales.map((s) => (
                <div
                  key={s.id}
                  className="border-b border-slate-800 pb-1"
                >
                  <div className="flex justify-between">
                    <div>
                      <div className="font-semibold">
                        {s.menuItemName || s.itemName}
                      </div>
                      <div className="text-slate-500">
                        Table {s.table || "—"} · Qty {s.qty}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        $
                        {(
                          s.lineTotal ||
                          (Number(s.pricePerUnit) || 0) *
                            (Number(s.qty) || 1)
                        ).toFixed(2)}
                      </div>
                      <div className="text-slate-500">
                        @ $
                        {(Number(s.pricePerUnit) || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
