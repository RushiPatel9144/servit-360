/** @format */
import React from "react";
import { Link } from "react-router-dom";

export default function LoginPage() {
	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100 space-y-3">
			<h1 className="text-xl font-bold">ServIt 360 Login</h1>
			<p className="text-sm text-slate-400">
				Temporary links to dashboards
			</p>
			<div className="flex gap-3">
				<Link
					to="/corp"
					className="px-3 py-1 rounded-full bg-emerald-400 text-slate-900 text-xs font-semibold"
				>
					Corporate
				</Link>
				<Link
					to="/culinary"
					className="px-3 py-1 rounded-full bg-emerald-400 text-slate-900 text-xs font-semibold"
				>
					Culinary
				</Link>
				<Link
					to="/server"
					className="px-3 py-1 rounded-full bg-emerald-400 text-slate-900 text-xs font-semibold"
				>
					Server
				</Link>
			</div>
		</div>
	);
}
