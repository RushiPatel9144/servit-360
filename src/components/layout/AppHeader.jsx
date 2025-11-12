/** @format */
import React from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";

const ROLES = ["CORPORATE", "CULINARY", "SERVER"];

export default function AppHeader() {
	const navigate = useNavigate();
	const role = localStorage.getItem("role") || "SERVER";

	const onRoleChange = (e) => {
		localStorage.setItem("role", e.target.value);
		// reload current dashboard (UnifiedDashboard chooses by role)
		navigate("/dashboard", { replace: true });
	};

	const onLogout = async () => {
		try {
			await signOut(auth);
		} catch {}
		localStorage.removeItem("role");
		navigate("/login", { replace: true });
	};

	return (
		<div className="w-full bg-slate-900/80 border-b border-slate-800">
			<div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between">
				<div className="text-slate-100 font-semibold">ServIt 360</div>
				<div className="flex items-center gap-2">
					{/* <select
						value={role}
						onChange={onRoleChange}
						className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[12px] text-slate-200"
						title="Switch role (demo only)"
					>
						{ROLES.map((r) => (
							<option
								key={r}
								value={r}
							>
								{r}
							</option>
						))}
					</select> */}
					<button
						onClick={onLogout}
						className="px-3 py-1 rounded-full border border-slate-700 text-[12px] text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
					>
						Logout
					</button>
				</div>
			</div>
		</div>
	);
}
