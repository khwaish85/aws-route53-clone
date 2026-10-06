export function ComingSoon({ label }: { label: string }) {
  return <div className="content-page"><div className="breadcrumb">Route 53 <span>›</span> {label}</div><div className="page-heading"><div><h1>{label}</h1><p>Manage {label.toLowerCase()} from the Route 53 console.</p></div></div><section className="empty-panel"><div className="route53-logo">53</div><h2>{label} is coming soon</h2><p>This area is available as a placeholder in the Route 53 clone.</p></section></div>;
}
