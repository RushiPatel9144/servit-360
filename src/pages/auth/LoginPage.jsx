/** @format */
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
	const [err, setErr] = useState("");
	const navigate = useNavigate();

	const onSubmit = async (e) => {
		e.preventDefault();
		setErr("");
		const fd = new FormData(e.target);
		const email = fd.get("email");
		const password = fd.get("password");

		try {
			await signInWithEmailAndPassword(auth, email, password);

			// Simple: assign role by email pattern
			let role = "SERVER";
			if (email.includes("corp")) role = "CORPORATE";
			else if (email.includes("chef")) role = "CULINARY";

			localStorage.setItem("role", role);
			navigate("/dashboard", { replace: true });
		} catch (e) {
			setErr("Invalid credentials");
			console.error(e);
		}
	};

	return (
		<div className="min-h-screen bg-slate-900 grid place-items-center text-slate-100">
			<form
				onSubmit={onSubmit}
				className="bg-slate-800 p-6 rounded-xl space-y-3"
			>
				<h1 className="text-lg font-semibold">ServIt 360 Login</h1>
				<input
					name="email"
					type="email"
					placeholder="Email"
					required
					className="w-64 p-2 rounded bg-slate-900 border border-slate-700"
				/>
				<input
					name="password"
					type="password"
					placeholder="Password"
					required
					className="w-64 p-2 rounded bg-slate-900 border border-slate-700"
				/>
				{err && <div className="text-amber-400 text-xs">{err}</div>}
				<button className="w-full bg-emerald-400 text-slate-900 py-2 rounded-full font-semibold text-sm">
					Sign In
				</button>
			</form>
		</div>
	);
}
