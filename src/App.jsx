/** @format */
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "./pages/auth/LoginPage";
import CorpDashboard from "./pages/corp/CorpDashboard";
import CulinaryDashboard from "./pages/culinary/CulinaryDashboard";
import ServerDashboard from "./pages/server/ServerDashboard";

import SeedDemo from "./pages/dev/SeedDemo";
import SeedDemoV2 from "./pages/dev/SeedDemoV2";
import SeedServers from "./pages/dev/SeedServers";
import SeedMenuV2 from "./pages/dev/SeedMenuV2";
import SeedCulinaryMaster from "./pages/dev/SeedCulinaryMaster";
import CulinaryIntegrityCheck from "./pages/dev/CulinaryIntegrityCheck";

function UnifiedDashboard() {
	const role = localStorage.getItem("role");

	// Only guard the main dashboard route
	if (!role) {
		return (
			<Navigate
				to="/login"
				replace
			/>
		);
	}

	if (role === "CORPORATE") return <CorpDashboard />;
	if (role === "CULINARY") return <CulinaryDashboard />;
	return <ServerDashboard />; // default = server view
}

// Simple 404 page instead of forcing /login
function NotFound() {
	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center">
			<h1 className="text-xl font-semibold mb-2">404 – Not Found</h1>
			<p className="text-sm text-slate-400 mb-4">
				This route does not exist in ServIt 360.
			</p>
			<a
				href="/login"
				className="px-4 py-2 rounded-full bg-emerald-400 text-slate-900 text-sm font-semibold"
			>
				Go to Login
			</a>
		</div>
	);
}

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				{/* Root → send to login */}
				<Route
					path="/"
					element={
						<Navigate
							to="/login"
							replace
						/>
					}
				/>

				{/* Auth */}
				<Route
					path="/login"
					element={<LoginPage />}
				/>

				{/* Role-based dashboard */}
				<Route
					path="/dashboard"
					element={<UnifiedDashboard />}
				/>

				{/* Dev / seeding routes – NO auth guard here */}
				<Route
					path="/dev-seed"
					element={<SeedDemo />}
				/>
				<Route
					path="/dev-seed2"
					element={<SeedDemoV2 />}
				/>
				<Route
					path="/dev-seed-servers"
					element={<SeedServers />}
				/>
				<Route
					path="/dev-menu-seed"
					element={<SeedMenuV2 />}
				/>
				<Route
					path="/dev-seed-culinary"
					element={<SeedCulinaryMaster />}
				/>
				<Route
					path="/dev-integrity"
					element={<CulinaryIntegrityCheck />}
				/>

				{/* Catch-all → 404, not forced login */}
				<Route
					path="*"
					element={<NotFound />}
				/>
			</Routes>
		</BrowserRouter>
	);
}
