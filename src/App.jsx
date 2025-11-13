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

function UnifiedDashboard() {
	const role = localStorage.getItem("role");

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
	return <ServerDashboard />;
}

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				{/* Root → always send to /login */}
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

				{/* Dev / seeding routes (keep for now, remove in prod if you want) */}
				<Route
					path="/dev-seed"
					element={<SeedDemo />}
				/>
				<Route
					path="/dev-seed-servers"
					element={<SeedServers />}
				/>
				<Route
					path="/dev-seed2"
					element={<SeedDemoV2 />}
				/>
				<Route
					path="/dev-menu-seed"
					element={<SeedMenuV2 />}
				/>

				{/* Catch-all → login */}
				<Route
					path="*"
					element={
						<Navigate
							to="/login"
							replace
						/>
					}
				/>
			</Routes>
		</BrowserRouter>
	);
}
