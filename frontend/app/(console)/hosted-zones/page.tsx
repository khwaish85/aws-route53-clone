"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { Toast } from "@/components/Toast";
import { api } from "@/lib/api";
import type { Page, Zone } from "@/lib/types";

type ZoneForm = { name: string; description: string; zone_type: "public" | "private"; vpc_region: string; vpc_id: string };
const blankZone: ZoneForm = { name: "", description: "", zone_type: "public", vpc_region: "us-east-1", vpc_id: "" };

export default function HostedZonesPage() {
  const [data, setData] = useState<Page<Zone>>({ items: [], total: 0, page: 1, page_size: 10 });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editZone, setEditZone] = useState<Zone | null>(null);
  const [deleteZone, setDeleteZone] = useState<Zone | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [form, setForm] = useState(blankZone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; kind?: "success" | "error" } | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { setData(await api<Page<Zone>>(`/zones?search=${encodeURIComponent(search)}&zone_type=${typeFilter}&page=${page}&page_size=10`)); setSelectedZone(null); }
    catch (e) { setToast({ message: e instanceof Error ? e.message : "Could not load hosted zones", kind: "error" }); }
    finally { setLoading(false); }
  }, [search, typeFilter]);

  useEffect(() => { const timer = setTimeout(() => load(1), 250); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 4500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    function handleCreateShortcut() { setForm(blankZone); setError(""); setCreateOpen(true); }
    window.addEventListener("route53:create", handleCreateShortcut);
    return () => window.removeEventListener("route53:create", handleCreateShortcut);
  }, []);

  function startCreate() { setForm(blankZone); setError(""); setCreateOpen(true); }
  function startDelete(zone: Zone) { setDeleteConfirm(""); setDeleteZone(zone); }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/zones", { method: "POST", body: JSON.stringify(form) }); setCreateOpen(false); setToast({ message: `Hosted zone ${form.name} was created.` }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create hosted zone"); }
    finally { setBusy(false); }
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault(); if (!editZone) return; setBusy(true);
    try { await api(`/zones/${editZone.id}`, { method: "PATCH", body: JSON.stringify({ description: editZone.description }) }); setEditZone(null); setToast({ message: "Hosted zone description updated." }); await load(data.page); }
    catch (e) { setToast({ message: e instanceof Error ? e.message : "Could not update hosted zone", kind: "error" }); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleteZone) return; setBusy(true);
    try { await api(`/zones/${deleteZone.id}`, { method: "DELETE" }); setDeleteZone(null); setToast({ message: `Hosted zone ${deleteZone.name} was deleted.` }); await load(); }
    catch (e) { setToast({ message: e instanceof Error ? e.message : "Could not delete hosted zone", kind: "error" }); }
    finally { setBusy(false); }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return <div className="content-page">
    <div className="breadcrumb">Route 53 <span>›</span> Hosted zones</div>
    <div className="page-heading"><div><h1>Hosted zones <a className="external" href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-working-with.html" target="_blank" rel="noreferrer" aria-label="Hosted zones documentation"><Icon name="external" size={15} /></a></h1><p>A hosted zone is a container for records that define how you want to route traffic for a domain.</p></div></div>
    <section className="table-panel">
      <header className="panel-header"><div><h2>Hosted zones <span className="count">({data.total})</span></h2></div><div className="actions"><button className="icon-button" aria-label="Refresh" onClick={() => load(data.page)}><Icon name="refresh" /></button><button className="secondary" disabled={!selectedZone} onClick={() => setEditZone(selectedZone)}>Edit</button><button className="secondary danger-text" disabled={!selectedZone} onClick={() => selectedZone && startDelete(selectedZone)}>Delete</button><button className="primary" onClick={startCreate}>Create hosted zone</button></div></header>
      <div className="toolbar hosted-zone-tools"><div className="search-field"><Icon name="search" size={17}/><input data-page-search value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find hosted zones" aria-label="Find hosted zones"/>{search && <button aria-label="Clear search" onClick={() => setSearch("")}>×</button>}</div><select aria-label="Filter by hosted zone type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">Type: All</option><option value="public">Public</option><option value="private">Private</option></select><div className="pagination"><button aria-label="Previous page" disabled={data.page <= 1} onClick={() => load(data.page - 1)}>‹</button><span aria-label={`Page ${data.page} of ${pages}`}>{data.page}</span><button aria-label="Next page" disabled={data.page >= pages} onClick={() => load(data.page + 1)}>›</button><button aria-label="Preferences">⚙</button></div></div>
      <div className="table-wrap"><table><thead><tr><th className="check"><span className="sr-only">Select</span></th><th>Hosted zone name ↕</th><th>Type</th><th>Created by</th><th>Record count</th><th>Description</th><th>Hosted zone ID</th><th></th></tr></thead><tbody>
        {loading ? <tr><td colSpan={8}><div className="loading-row"><span className="spinner"/> Loading hosted zones</div></td></tr> : data.items.length === 0 ? <tr><td colSpan={8}><div className="empty-table"><strong>No hosted zones</strong><p>{search || typeFilter ? "No hosted zones match your filters." : "Create a hosted zone to start routing internet traffic for your domain."}</p>{!search && !typeFilter && <button className="primary" onClick={startCreate}>Create hosted zone</button>}</div></td></tr> : data.items.map((zone) => <tr key={zone.id} className={selectedZone?.id === zone.id ? "selected" : ""}><td className="check"><input type="radio" name="selected-zone" aria-label={`Select ${zone.name}`} checked={selectedZone?.id === zone.id} onChange={() => setSelectedZone(zone)}/></td><td><Link className="table-link" href={`/hosted-zones/${zone.id}`}>{zone.name}</Link></td><td>{zone.zone_type === "public" ? "Public" : "Private"}</td><td>Route 53</td><td>{zone.record_count}</td><td className="truncate">{zone.description || "–"}</td><td className="mono">{zone.id}</td><td><button className="more-button" aria-label={`Edit ${zone.name}`} onClick={() => setEditZone(zone)}>⋮</button></td></tr>)}
      </tbody></table></div>
    </section>
    <div className="info-strip"><Icon name="info" size={16}/><span><strong>Looking for domain registration?</strong> Use <a>Registered domains</a> to buy and manage domains.</span></div>

    {createOpen && <Modal title="Create hosted zone" onClose={() => setCreateOpen(false)} footer={<><button className="secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary" form="create-zone" disabled={busy}>{busy ? "Creating…" : "Create hosted zone"}</button></>}>
      <form id="create-zone" onSubmit={create} className="form-stack">{error && <div className="alert error" role="alert">{error}</div>}<div className="form-section"><h3>Domain configuration</h3><label>Domain name <span className="required">*</span><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="example.com" required/><small>Enter the name of the domain for which you want to route traffic.</small></label><label>Description – optional<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Add a description for this hosted zone"/></label></div><fieldset className="form-section"><legend>Type</legend><label className="radio-row"><input name="zone-type" type="radio" checked={form.zone_type === "public"} onChange={() => setForm({ ...form, zone_type: "public" })}/><span><strong>Public hosted zone</strong><small>Route traffic on the internet.</small></span></label><label className="radio-row"><input name="zone-type" type="radio" checked={form.zone_type === "private"} onChange={() => setForm({ ...form, zone_type: "private" })}/><span><strong>Private hosted zone</strong><small>Route traffic within one or more VPCs.</small></span></label>{form.zone_type === "private" && <div className="form-grid"><label>Region<select value={form.vpc_region} onChange={(e) => setForm({ ...form, vpc_region: e.target.value })}><option>us-east-1</option><option>us-west-2</option><option>ap-south-1</option><option>eu-west-1</option></select></label><label>VPC ID<input value={form.vpc_id} onChange={(e) => setForm({ ...form, vpc_id: e.target.value })} placeholder="vpc-1234567890abcdef0" required/></label></div>}</fieldset></form>
    </Modal>}
    {editZone && <Modal title="Edit hosted zone" onClose={() => setEditZone(null)} footer={<><button className="secondary" onClick={() => setEditZone(null)}>Cancel</button><button className="primary" form="edit-zone" disabled={busy}>Save changes</button></>}><form id="edit-zone" onSubmit={saveEdit} className="form-stack"><label>Hosted zone name<input disabled value={editZone.name}/></label><label>Description<textarea autoFocus value={editZone.description} onChange={(e) => setEditZone({ ...editZone, description: e.target.value })}/></label></form></Modal>}
    {deleteZone && <Modal title="Delete hosted zone" width={560} onClose={() => setDeleteZone(null)} footer={<><button className="secondary" onClick={() => setDeleteZone(null)}>Cancel</button><button className="danger" onClick={remove} disabled={busy || deleteConfirm !== "delete"}>{busy ? "Deleting…" : "Delete"}</button></>}><div className="warning-box"><strong>Delete {deleteZone.name}?</strong><p>This permanently deletes the hosted zone and all record sets in it. This action cannot be undone.</p></div><label>To confirm deletion, enter <strong>delete</strong><input autoFocus value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}/></label></Modal>}
    {toast && <Toast {...toast} onClose={() => setToast(null)}/>}
  </div>;
}
