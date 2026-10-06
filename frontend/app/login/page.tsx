"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("khwaish.yadav@route53.local");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); router.push("/hosted-zones"); }
    catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setBusy(false); }
  }

  return <div className="login-page">
    <header className="login-header"><div className="aws-logo"><span>aws</span><i /></div></header>
    <main className="login-wrap">
      <section className="signin-card">
        <div className="signin-brand"><div className="route53-logo">53</div><div><strong>Amazon Route 53</strong><span>Khwaish Yadav&apos;s project console</span></div></div>
        <h1>Sign in</h1>
        <p className="muted">Sign in to Khwaish Yadav&apos;s Route 53 project.</p>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={submit}>
          <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <div className="demo-note"><strong>Project account</strong><span>khwaish.yadav@route53.local / password</span></div>
      </section>
    </main>
    <footer className="login-footer">Built by Khwaish Yadav <span>Route 53 educational clone</span></footer>
  </div>;
}
