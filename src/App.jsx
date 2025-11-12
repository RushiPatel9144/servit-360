/** @format */
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/auth/LoginPage";
import CorpDashboard from "./pages/corp/CorpDashboard";
import CulinaryDashboard from "./pages/culinary/CulinaryDashboard";
import ServerDashboard from "./pages/server/ServerDashboard";

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				{/* default → login */}
				<Route
					path="/"
					element={
						<Navigate
							to="/login"
							replace
						/>
					}
				/>

				{/* login page */}
				<Route
					path="/login"
					element={<LoginPage />}
				/>

				{/* dashboards */}
				<Route
					path="/corp"
					element={<CorpDashboard />}
				/>
				<Route
					path="/culinary"
					element={<CulinaryDashboard />}
				/>
				<Route
					path="/server"
					element={<ServerDashboard />}
				/>

				{/* fallback */}
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
