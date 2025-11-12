/** @format */
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/auth/LoginPage";
import CorpDashboard from "./pages/corp/CorpDashboard";
import CulinaryDashboard from "./pages/culinary/CulinaryDashboard";
import ServerDashboard from "./pages/server/ServerDashboard";
import SeedDemo from "./pages/dev/SeedDemo";

function UnifiedDashboard() {
	const role = localStorage.getItem("role");

	if (!role)
		return (
			<Navigate
				to="/login"
				replace
			/>
		);

	if (role === "CORPORATE") return <CorpDashboard />;
	if (role === "CULINARY") return <CulinaryDashboard />;
	return <ServerDashboard />;
}

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route
					path="/login"
					element={<LoginPage />}
				/>
				<Route
					path="/dashboard"
					element={<UnifiedDashboard />}
				/>
				<Route
					path="/dev-seed"
					element={<SeedDemo />}
				/>
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
