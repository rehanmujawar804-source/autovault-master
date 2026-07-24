"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { validateLogin } from "@/lib/authUtils";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleLogin() {
    const role = validateLogin(email, password);
    if (role === "owner") {
      localStorage.setItem("role", "owner");
      window.location.href = "/dashboard";
    } else if (role === "staff") {
      localStorage.setItem("role", "staff");
      window.location.href = "/dashboard";
    } else {
      setError("Invalid email or password");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 px-4">
      {/* Subtle background accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-yellow-400/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-yellow-400/5 rounded-full blur-3xl" />
      </div>

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Gold accent bar at top */}
        <div className="h-1 w-full bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-400" />

        <div className="p-8">
          {/* Brand block */}
          <div className="flex flex-col items-center mb-8">
            {/* Logo image wrapper - clips corners of the white background to show a perfect circle */}
            <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-yellow-400/30 mb-4 shadow-lg bg-[#0f1a2e] flex items-center justify-center">
              <img
                src="/7star-logo.png"
                alt="7 Star Car Accessories"
                className="object-cover w-full h-full rounded-full"
              />
            </div>

            <h1 className="text-lg font-black text-navy-950 leading-tight text-center">
              7 Star Car Accessories
            </h1>
            <p className="text-xs text-slate-500 mt-1 text-center">
              Staff Management Portal
            </p>
          </div>


          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-navy-950 hover:bg-navy-800 active:bg-navy-950 text-white py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
            >
              Sign In to Dashboard
            </button>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Private system — authorised personnel only
          </p>
        </div>
      </div>
    </div>
  );
}
