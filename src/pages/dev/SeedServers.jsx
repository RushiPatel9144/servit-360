/** @format */
import React, { useState } from "react";
import { db, auth } from "../../firebase";
import { collection, doc, setDoc, getDoc } from "firebase/firestore";
import {
	createUserWithEmailAndPassword,
	fetchSignInMethodsForEmail,
} from "firebase/auth";

export default function SeedServers() {
	const [log, setLog] = useState([]);
	const [running, setRunning] = useState(false);
	const [done, setDone] = useState(false);
	const plog = (msg) => setLog((l) => [...l, msg]);

	const SERVERS = [
		{
			email: "server-burl-1@sir-demo.com",
			password: "Demo123!",
			name: "Server Burlington 1",
			locationId: "BURLINGTON",
			serverCode: "server-burl-1",
		},
		{
			email: "server-burl-2@sir-demo.com",
			password: "Demo123!",
			name: "Server Burlington 2",
			locationId: "BURLINGTON",
			serverCode: "server-burl-2",
		},
		{
			email: "server-guel-1@sir-demo.com",
			password: "Demo123!",
			name: "Server Guelph 1",
			locationId: "GUELPH",
			serverCode: "server-guel-1",
		},
		{
			email: "server-guel-2@sir-demo.com",
			password: "Demo123!",
			name: "Server Guelph 2",
			locationId: "GUELPH",
			serverCode: "server-guel-2",
		},
	];

	const seed = async () => {
		try {
			setRunning(true);
			plog("🌱 Starting server seeding…");

			for (const s of SERVERS) {
				plog(`⏳ Processing ${s.email}…`);

				// Check if Auth user exists
				const methods = await fetchSignInMethodsForEmail(auth, s.email);
				let uid = null;

				if (methods.length > 0) {
					plog(`✔️ Auth user already exists: ${s.email}`);
				} else {
					const cred = await createUserWithEmailAndPassword(
						auth,
						s.email,
						s.password
					);
					uid = cred.user.uid;
					plog(`✨ Created Auth user: ${s.email}`);
				}

				// Firestore USER PROFILE
				const userRef = doc(db, "users", s.email);
				const existing = await getDoc(userRef);

				if (existing.exists()) {
					plog(
						`✔️ Firestore profile already exists: users/${s.email}`
					);
				} else {
					await setDoc(userRef, {
						name: s.name,
						role: "SERVER",
						locationId: s.locationId,
						serverCode: s.serverCode,
						email: s.email,
						active: true,
						createdAt: new Date().toISOString(),
					});
					plog(`✨ Created Firestore profile: users/${s.email}`);
				}
			}

			plog("🎉 All server accounts seeded successfully!");
			setDone(true);
		} catch (err) {
			console.error(err);
			plog("❌ ERROR: " + err.message);
		} finally {
			setRunning(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 p-6">
			<div className="max-w-xl mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
				<h1 className="text-lg font-semibold mb-2">
					Seed Server Accounts
				</h1>
				<p className="text-[11px] text-slate-400 mb-3">
					This will create 4 server users in Auth + Firestore.
				</p>

				<button
					disabled={running || done}
					onClick={seed}
					className={`px-4 py-2 rounded-full ${
						done
							? "bg-emerald-500 text-slate-900"
							: "bg-emerald-400 text-slate-900"
					} text-[11px] font-semibold ${running ? "opacity-60" : ""}`}
				>
					{done
						? "Seeded!"
						: running
						? "Seeding…"
						: "Seed Server Data"}
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
