"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { WebMCPBridge } from "./WebMCPBridge";

const navigation = [
  ["Dashboard", "/dashboard"],
  ["Hosted zones", "/hosted-zones"],
  ["Health checks", "/health-checks"],
  ["Profiles", "/profiles"],
  ["Traffic policies", "/traffic-policies"],
  ["Policy records", "/policy-records"],
  ["Resolver", "/resolver"],
] as const;

const regions = [
  { code: "us-east-1", label: "US East (N. Virginia)", shortLabel: "N. Virginia" },
  { code: "us-east-2", label: "US East (Ohio)", shortLabel: "Ohio" },
  { code: "us-west-1", label: "US West (N. California)", shortLabel: "N. California" },
  { code: "us-west-2", label: "US West (Oregon)", shortLabel: "Oregon" },
  { code: "ap-south-1", label: "Asia Pacific (Mumbai)", shortLabel: "Mumbai" },
  { code: "ap-southeast-1", label: "Asia Pacific (Singapore)", shortLabel: "Singapore" },
  { code: "ap-northeast-1", label: "Asia Pacific (Tokyo)", shortLabel: "Tokyo" },
  { code: "eu-central-1", label: "Europe (Frankfurt)", shortLabel: "Frankfurt" },
  { code: "eu-west-1", label: "Europe (Ireland)", shortLabel: "Ireland" },
] as const;

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [regionCode, setRegionCode] = useState<(typeof regions)[number]["code"]>("us-east-1");
  const [globalQuery, setGlobalQuery] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const globalSearchRef = useRef<HTMLInputElement>(null);
  const goPrefixAt = useRef(0);
  const currentRegion = regions.find((region) => region.code === regionCode) ?? regions[0];

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then(({ user }) => setUser(user))
      .catch(() => router.replace("/login"))
      .finally(() => setChecking(false));
  }, [router]);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem("route53-theme"); } catch {}
    const nextTheme = stored === "dark" || stored === "light" ? stored : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    const frame = window.requestAnimationFrame(() => setTheme(nextTheme));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let storedCode: (typeof regions)[number]["code"] | null = null;
    try {
      const storedRegion = window.localStorage.getItem("route53-region");
      const region = regions.find(({ code }) => code === storedRegion);
      if (region) storedCode = region.code;
    } catch {}
    if (!storedCode) return;
    const frame = window.requestAnimationFrame(() => setRegionCode(storedCode));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function focusGlobalSearch(event: globalThis.KeyboardEvent) {
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        globalSearchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusGlobalSearch);
    return () => window.removeEventListener("keydown", focusGlobalSearch);
  }, []);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setRegionOpen(false);
        setServicesOpen(false);
        setAccountOpen(false);
        return;
      }
      const target = event.target as HTMLElement;
      const isTyping = target.matches("input, textarea, select") || target.isContentEditable;
      if (isTyping) return;
      const key = event.key.toLowerCase();
      if (event.key === "?") { event.preventDefault(); setShortcutsOpen(true); return; }
      if (key === "/") { event.preventDefault(); document.querySelector<HTMLInputElement>("[data-page-search]")?.focus(); return; }
      if (key === "c") { event.preventDefault(); window.dispatchEvent(new CustomEvent("route53:create")); return; }
      if (key === "g") { goPrefixAt.current = Date.now(); return; }
      if (Date.now() - goPrefixAt.current < 1200 && key === "h") { event.preventDefault(); router.push("/hosted-zones"); goPrefixAt.current = 0; }
      if (Date.now() - goPrefixAt.current < 1200 && key === "d") { event.preventDefault(); router.push("/dashboard"); goPrefixAt.current = 0; }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function submitGlobalSearch(event: FormEvent) {
    event.preventDefault();
    const query = globalQuery.trim().toLowerCase();
    const match = navigation.find(([label]) => label.toLowerCase().includes(query));
    router.push(match?.[1] || `/hosted-zones`);
    setGlobalQuery("");
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try { window.localStorage.setItem("route53-theme", nextTheme); } catch {}
  }

  function selectRegion(code: (typeof regions)[number]["code"]) {
    setRegionCode(code);
    setRegionOpen(false);
    try { window.localStorage.setItem("route53-region", code); } catch {}
  }

  if (checking) return <div className="page-loader"><span className="spinner" />Loading AWS Management Console</div>;

  return (
    <div className="console">
      <WebMCPBridge />
      <header className="topbar">
        <button className="top-icon" aria-label="Open navigation" onClick={() => setNavOpen(!navOpen)}><Icon name="menu" /></button>
        <Link className="aws-logo" href="/dashboard"><span>aws</span><i /></Link>
        <button className="services-button" aria-expanded={servicesOpen} onClick={() => { setServicesOpen(!servicesOpen); setRegionOpen(false); setAccountOpen(false); }}><span className="grid-icon">⠿</span> Services</button>
        {servicesOpen && <div className="services-menu"><strong>Route 53 services</strong>{navigation.map(([label, href]) => <Link key={href} href={href} onClick={() => setServicesOpen(false)}>{label}</Link>)}</div>}
        <form className="global-search" role="search" onSubmit={submitGlobalSearch}><Icon name="search" size={17} /><input ref={globalSearchRef} aria-label="Search AWS services" placeholder="Search" value={globalQuery} onChange={(e) => setGlobalQuery(e.target.value)}/><kbd>[Alt+S]</kbd></form>
        <div className="top-spacer" />
        <button className="top-icon" aria-label="Notifications"><Icon name="bell" /></button>
        <button className="top-icon" aria-label="Help"><Icon name="help" /></button>
        <button className="top-icon" aria-label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}><Icon name="keyboard" /></button>
        <button className="top-icon" aria-label={`Use ${theme === "light" ? "dark" : "light"} mode`} onClick={toggleTheme}><Icon name={theme === "light" ? "moon" : "sun"} /></button>
        <button className="top-icon" aria-label="Settings"><Icon name="gear" /></button>
        <div className="region-wrap">
          <button className="region-button" aria-expanded={regionOpen} aria-haspopup="listbox" aria-controls="region-menu" onClick={() => { setRegionOpen(!regionOpen); setServicesOpen(false); setAccountOpen(false); }}>{currentRegion.shortLabel}<span aria-hidden="true">⌄</span></button>
          {regionOpen && <div id="region-menu" className="region-menu" role="listbox" aria-label="AWS Region">
            <strong>Select a Region</strong>
            <p>Route 53 is a global service. Your selection is saved for the console experience.</p>
            <div className="region-options">
              {regions.map((region) => <button key={region.code} role="option" aria-selected={region.code === regionCode} className={region.code === regionCode ? "selected" : ""} onClick={() => selectRegion(region.code)}>
                <span>{region.label}</span><small>{region.code}</small><i aria-hidden="true">{region.code === regionCode ? "✓" : ""}</i>
              </button>)}
            </div>
          </div>}
        </div>
        <button className="account-button" aria-expanded={accountOpen} onClick={() => { setAccountOpen(!accountOpen); setRegionOpen(false); setServicesOpen(false); }}>{user?.display_name}⌄</button>
        {accountOpen && <div className="account-menu">
          <strong>{user?.display_name}</strong><span>{user?.email}</span><span>Account ID: {user?.account_id}</span>
          <hr/><button onClick={logout}>Sign out</button>
        </div>}
      </header>
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="service-title"><div className="service-icon">53</div><strong>Route 53</strong><button onClick={() => setNavOpen(false)}>‹</button></div>
        <nav>
          {navigation.map(([label, href]) => <Link key={href} href={href} className={pathname.startsWith(href) ? "active" : ""}>{label}</Link>)}
          <div className="nav-group">DNS firewall <span>⌄</span></div>
          <div className="nav-group">Domains <span>⌄</span></div>
        </nav>
      </aside>
      <main className="main-content">{children}</main>
      <footer className="footer"><span>Built by Khwaish Yadav</span><span>Route 53 educational clone</span><a href="/dashboard">Project dashboard</a></footer>
      {shortcutsOpen && <Modal title="Keyboard shortcuts" width={520} onClose={() => setShortcutsOpen(false)} footer={<button className="primary" onClick={() => setShortcutsOpen(false)}>Close</button>}><div className="shortcut-list"><div><span>Search AWS services</span><kbd>Alt</kbd><kbd>S</kbd></div><div><span>Search the current table</span><kbd>/</kbd></div><div><span>Create a zone or record</span><kbd>C</kbd></div><div><span>Go to hosted zones</span><kbd>G</kbd><kbd>H</kbd></div><div><span>Go to dashboard</span><kbd>G</kbd><kbd>D</kbd></div><div><span>Show this panel</span><kbd>?</kbd></div><div><span>Close a dialog</span><kbd>Esc</kbd></div></div></Modal>}
    </div>
  );
}
