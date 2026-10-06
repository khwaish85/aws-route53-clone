"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { Toast } from "@/components/Toast";
import { api, downloadApi } from "@/lib/api";
import type { Page, RecordSet, Zone } from "@/lib/types";

const recordTypes = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"];
const blankRecord = { name: "", type: "A", value: "", ttl: 300, routing_policy: "Simple", evaluate_target_health: false };
type ImportResult = { imported: number; skipped: number; record_count: number; warnings: string[] };

export default function HostedZoneDetails() {
  const { id } = useParams<{ id: string }>();
  const [zone, setZone] = useState<Zone | null>(null);
  const [data, setData] = useState<Page<RecordSet>>({ items: [], total: 0, page: 1, page_size: 20 });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState<RecordSet[]>([]);
  const [form, setForm] = useState(blankRecord);
  const [editing, setEditing] = useState<RecordSet | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importContent, setImportContent] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exportBusy, setExportBusy] = useState<"json" | "bind" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; kind?: "success" | "error" } | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const [zoneData, records] = await Promise.all([api<Zone>(`/zones/${id}`), api<Page<RecordSet>>(`/zones/${id}/records?search=${encodeURIComponent(search)}&record_type=${typeFilter}&page=${page}&page_size=20`)]);
      setZone(zoneData); setData(records); setSelected([]);
    } catch (e) { setToast({ message: e instanceof Error ? e.message : "Could not load records", kind: "error" }); }
    finally { setLoading(false); }
  }, [id, search, typeFilter]);
  useEffect(() => { const timer = setTimeout(() => load(), 200); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 4500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    function handleCreateShortcut() { setForm(blankRecord); setEditing(null); setError(""); setCreateOpen(true); }
    window.addEventListener("route53:create", handleCreateShortcut);
    return () => window.removeEventListener("route53:create", handleCreateShortcut);
  }, []);

  function openCreate() { setForm(blankRecord); setEditing(null); setError(""); setCreateOpen(true); }
  function openEdit() { const r = selected[0]; if (!r || r.type === "SOA" || (r.type === "NS" && r.name === zone?.name)) return; const relativeName = r.name === zone?.name ? "" : r.name.endsWith(`.${zone?.name}`) ? r.name.slice(0, -(zone!.name.length + 1)) : r.name; setEditing(r); setForm({ name: relativeName, type: r.type, value: r.value, ttl: r.ttl, routing_policy: r.routing_policy, evaluate_target_health: Boolean(r.evaluate_target_health) }); setError(""); setCreateOpen(true); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(editing ? `/zones/${id}/records/${editing.id}` : `/zones/${id}/records`, { method: editing ? "PUT" : "POST", body: JSON.stringify(form) }); setCreateOpen(false); setToast({ message: `Record ${editing ? "updated" : "created"} successfully.` }); await load(data.page); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save record"); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api(`/zones/${id}/records:bulk-delete`, { method: "POST", body: JSON.stringify({ record_ids: selected.map((record) => record.id) }) }); setDeleteOpen(false); setToast({ message: `${selected.length} record${selected.length > 1 ? "s" : ""} deleted.` }); await load(data.page); }
    catch (e) { setToast({ message: e instanceof Error ? e.message : "Could not delete records", kind: "error" }); }
    finally { setBusy(false); }
  }
  function openImport() { setImportContent(""); setImportResult(null); setError(""); setImportOpen(true); }
  async function importZone(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await api<ImportResult>(`/zones/${id}/records/import`, { method: "POST", body: JSON.stringify({ content: importContent }) }); setImportResult(result); setToast({ message: `${result.imported} record set${result.imported === 1 ? "" : "s"} imported.` }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not import the zone file"); }
    finally { setBusy(false); }
  }
  async function exportZone(format: "json" | "bind") {
    setExportBusy(format);
    try { await downloadApi(`/zones/${id}/export?format=${format}`, `${zone?.name || "hosted-zone"}.${format === "bind" ? "zone" : "json"}`); setToast({ message: `${format.toUpperCase()} export downloaded.` }); }
    catch (e) { setToast({ message: e instanceof Error ? e.message : "Could not export hosted zone", kind: "error" }); }
    finally { setExportBusy(null); }
  }
  function toggle(record: RecordSet) { setSelected((current) => current.some((r) => r.id === record.id) ? current.filter((r) => r.id !== record.id) : [...current, record]); }
  const protectedSelection = selected.some((r) => r.type === "SOA" || (r.type === "NS" && r.name === zone?.name));
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));

  return <div className="content-page wide">
    <div className="breadcrumb"><Link href="/hosted-zones">Hosted zones</Link><span>›</span>{zone?.name || "Loading…"}</div>
    <div className="page-heading compact"><div><h1>{zone?.name}</h1><div className="metadata"><span><strong>Hosted zone ID</strong> {zone?.id}</span><span><strong>Type</strong> {zone?.zone_type === "private" ? "Private" : "Public"}</span></div></div><button className="secondary">Hosted zone details</button></div>
    <div className="tabs" role="tablist" aria-label="Hosted zone sections"><button role="tab" aria-selected="true" className="active">Records ({zone?.record_count ?? 0})</button><button role="tab" aria-selected="false" disabled title="Coming soon">DNSSEC signing</button><button role="tab" aria-selected="false" disabled title="Coming soon">Tags (0)</button></div>
    <section className="table-panel records-panel">
      <header className="panel-header"><div><h2>Records <span className="count">({data.total})</span></h2><p>Configure how Route 53 responds to DNS queries for this hosted zone.</p></div><div className="actions"><button className="icon-button" aria-label="Refresh records" onClick={() => load(data.page)}><Icon name="refresh" /></button><button className="secondary" onClick={openImport}><Icon name="upload" size={16}/>Import zone file</button><button className="secondary" disabled={exportBusy !== null} onClick={() => exportZone("json")}><Icon name="download" size={16}/>{exportBusy === "json" ? "Exporting…" : "Export JSON"}</button><button className="secondary" disabled={exportBusy !== null} onClick={() => exportZone("bind")}><Icon name="download" size={16}/>{exportBusy === "bind" ? "Exporting…" : "Export BIND"}</button><button className="secondary" disabled={selected.length !== 1 || protectedSelection} onClick={openEdit}>Edit record</button><button className="secondary danger-text" disabled={!selected.length || protectedSelection} onClick={() => setDeleteOpen(true)}>Delete {selected.length > 1 ? `${selected.length} records` : "record"}</button><button className="primary" onClick={openCreate}>Create record</button></div></header>
      <div className="toolbar record-tools"><div className="search-field"><Icon name="search" size={17}/><input data-page-search aria-label="Search records by name or value" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by record name or value"/></div><select aria-label="Filter by record type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">Record type: All</option>{recordTypes.map((type) => <option key={type}>{type}</option>)}</select><div className="pagination"><span>{selected.length ? `${selected.length} selected` : ""}</span><button aria-label="Previous page" disabled={data.page <= 1} onClick={() => load(data.page - 1)}>‹</button><span aria-label={`Page ${data.page} of ${pages}`}>{data.page}</span><button aria-label="Next page" disabled={data.page >= pages} onClick={() => load(data.page + 1)}>›</button><button aria-label="Table preferences">⚙</button></div></div>
      <div className="table-wrap"><table><thead><tr><th className="check"><input aria-label="Select all visible records" type="checkbox" checked={data.items.length > 0 && selected.length === data.items.length} onChange={() => setSelected(selected.length === data.items.length ? [] : data.items)}/></th><th>Record name ↕</th><th>Type</th><th>Routing policy</th><th>Differentiator</th><th>Value/Route traffic to</th><th>TTL (seconds)</th><th>Evaluate target health</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={8}><div className="loading-row"><span className="spinner"/> Loading records</div></td></tr> : data.items.length === 0 ? <tr><td colSpan={8}><div className="empty-table"><strong>No records found</strong><p>Try changing your filters or create a record.</p></div></td></tr> : data.items.map((record) => <tr key={record.id} className={selected.some((r) => r.id === record.id) ? "selected" : ""}><td className="check"><input aria-label={`Select ${record.name} ${record.type} record`} type="checkbox" checked={selected.some((r) => r.id === record.id)} onChange={() => toggle(record)}/></td><td className="record-name">{record.name}</td><td><span className="type-badge">{record.type}</span></td><td>{record.routing_policy}</td><td>–</td><td><div className="record-value">{record.value.split("\n").map((v, i) => <span key={i}>{v}</span>)}</div></td><td>{record.ttl}</td><td>{record.evaluate_target_health ? "Yes" : "No"}</td></tr>)}
      </tbody></table></div>
    </section>

    {createOpen && <Modal title={editing ? "Edit record" : "Create record"} width={760} onClose={() => setCreateOpen(false)} footer={<><button className="secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary" form="record-form" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create records"}</button></>}><form id="record-form" onSubmit={save} className="form-stack">{error && <div className="alert error" role="alert">{error}</div>}<div className="form-section"><div className="form-grid record-grid"><label>Record name<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={zone?.name}/><small>Leave blank to create a record for the root domain.</small></label><label>Record type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{recordTypes.map((type) => <option key={type} value={type}>{type} — {typeDescription(type)}</option>)}</select></label></div><label>Value <span className="required">*</span><textarea className="value-area" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={valuePlaceholder(form.type)} required/><small>Enter multiple values on separate lines.</small></label><label>TTL (seconds)<input type="number" min="0" value={form.ttl} onChange={(e) => setForm({ ...form, ttl: Number(e.target.value) })} required/></label></div><div className="form-section"><h3>Routing policy</h3><label>Routing policy<select value={form.routing_policy} onChange={(e) => setForm({ ...form, routing_policy: e.target.value })}><option>Simple</option><option>Weighted</option><option>Latency</option><option>Failover</option><option>Geolocation</option><option>Multivalue answer</option></select></label><label className="checkbox-row"><input type="checkbox" checked={form.evaluate_target_health} onChange={(e) => setForm({ ...form, evaluate_target_health: e.target.checked })}/><span>Evaluate target health</span></label></div></form></Modal>}
    {importOpen && <Modal title="Import BIND zone file" width={760} onClose={() => setImportOpen(false)} footer={importResult ? <button className="primary" onClick={() => setImportOpen(false)}>Done</button> : <><button className="secondary" onClick={() => setImportOpen(false)}>Cancel</button><button className="primary" form="import-zone" disabled={busy || !importContent.trim()}>{busy ? "Importing…" : "Import"}</button></>}>
      {importResult ? <div className="import-summary"><div className="success-box"><strong>Import complete</strong><p>{importResult.imported} record sets imported, {importResult.skipped} skipped.</p></div>{importResult.warnings.length > 0 && <div><h3>Warnings</h3><ul className="warning-list">{importResult.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}</div> : <form id="import-zone" className="form-stack" onSubmit={importZone}>{error && <div className="alert error" role="alert">{error}</div>}<label>Choose a zone file<input type="file" accept=".zone,.bind,.txt,text/plain" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setImportContent(await file.text()); }}/><small>Supported directives include $ORIGIN and $TTL. Existing record sets are skipped.</small></label><label>Zone file content<textarea className="bind-area" value={importContent} onChange={(event) => setImportContent(event.target.value)} placeholder={`$ORIGIN ${zone?.name || "example.com."}\n$TTL 300\nwww IN A 192.0.2.10`} required/></label></form>}
    </Modal>}
    {deleteOpen && <Modal title="Delete records" width={580} onClose={() => setDeleteOpen(false)} footer={<><button className="secondary" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button></>}><div className="warning-box"><strong>Delete {selected.length} record{selected.length > 1 ? "s" : ""}?</strong><p>DNS traffic may stop routing as expected. This action cannot be undone.</p></div><ul className="delete-list">{selected.map((r) => <li key={r.id}>{r.name} <span>{r.type}</span></li>)}</ul></Modal>}
    {toast && <Toast {...toast} onClose={() => setToast(null)}/>}
  </div>;
}

function typeDescription(type: string) { return ({ A: "Routes traffic to an IPv4 address", AAAA: "Routes traffic to an IPv6 address", CNAME: "Routes traffic to another domain", TXT: "Text record", MX: "Mail exchange", NS: "Name server", PTR: "Pointer record", SRV: "Service locator", CAA: "Certificate authority authorization" } as Record<string, string>)[type]; }
function valuePlaceholder(type: string) { return ({ A: "192.0.2.1", AAAA: "2001:db8::1", CNAME: "target.example.com.", TXT: '"verification=value"', MX: "10 mail.example.com.", NS: "ns-123.awsdns-45.com.", PTR: "host.example.com.", SRV: "10 5 5060 sip.example.com.", CAA: '0 issue "amazon.com"' } as Record<string, string>)[type]; }
