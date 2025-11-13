/** @format */
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    try {
      console.log("Trying login:", email, password);
      console.log("Using Firebase Project:", auth.app.options.projectId);

      await signInWithEmailAndPassword(auth, email.trim(), password.trim());

      // Role assignment
      let role = "SERVER";
      if (email.includes("corp")) role = "CORPORATE";
      else if (email.includes("chef")) role = "CULINARY";

      localStorage.setItem("role", role);

      navigate("/dashboard", { replace: true });
    } catch (e) {
      console.error("Login Err:", e);
      setErr("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 grid place-items-center text-slate-100">
      <form
        onSubmit={onSubmit}
        className="bg-slate-800 p-6 rounded-xl space-y-3 w-[300px]"
      >
        <h1 className="text-lg font-semibold text-center">ServIt 360 Login</h1>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full p-2 rounded bg-slate-900 border border-slate-700"
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          name="password"
          type="password"
          placeholder="Password"
          required
          className="w-full p-2 rounded bg-slate-900 border border-slate-700"
        />

        {err && <div className="text-amber-400 text-xs">{err}</div>}

        <button className="w-full bg-emerald-400 text-slate-900 py-2 rounded-full font-semibold text-sm">
          Sign In
        </button>

        <div className="mt-3 border-t border-slate-700 pt-3 text-[10px] text-slate-400">
          <div className="font-semibold text-slate-300 mb-1">Demo Accounts</div>

          <div>server-burl-1@sir-demo.com · Burlington</div>
          <div>server-burl-2@sir-demo.com · Burlington</div>
          <div>server-guel-1@sir-demo.com · Guelph</div>
          <div>server-guel-2@sir-demo.com · Guelph</div>
          <div>server@sir-demo.com · General</div>
          <div>chef@sir-demo.com · Chef</div>
          <div>corp@sir-demo.com · HQ Admin</div>
        </div>
      </form>
    </div>
  );
}
