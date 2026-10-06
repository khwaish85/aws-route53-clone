import Link from "next/link";

export default function NotFound() {
  return <main className="standalone-state"><div className="route53-logo">53</div><h1>Page not found</h1><p>The requested Route 53 console page doesn’t exist.</p><Link className="primary" href="/hosted-zones">Go to hosted zones</Link></main>;
}
