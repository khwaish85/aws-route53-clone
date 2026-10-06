"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="en"><body><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Arial, sans-serif", background: "#f2f3f3" }}><section style={{ background: "white", border: "1px solid #d5dbdb", padding: 32, textAlign: "center" }}><title>Console error | Route 53</title><h1>Something went wrong</h1><p>The Route 53 console couldn’t load this page.</p><button onClick={() => retry()} style={{ padding: "8px 16px", background: "#ec7211", color: "white", border: 0 }}>Try again</button></section></main></body></html>;
}
