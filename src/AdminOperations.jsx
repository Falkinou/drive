import { useEffect, useMemo, useState } from "react";
import { timeAgo } from "./AdminDashboard";

export const ADMIN_OPERATIONS_STYLE = `
.ops-head{display:flex;align-items:flex-end;gap:12px;margin:3px 0 13px}.ops-head div{flex:1}.ops-head h1{font-size:19px;letter-spacing:-.35px;color:#17251f;margin:0}.ops-head p{font-size:9px;color:#8d9892;margin:4px 0 0}.ops-refresh{height:34px;border:1px solid #dfe6e2;border-radius:10px;background:#fff;color:#147d64;padding:0 11px;font-size:9px;font-weight:850;cursor:pointer}.ops-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-bottom:10px}.ops-card{border:1px solid #e6ebe8;border-radius:17px;background:#fff;padding:13px;box-shadow:0 5px 18px rgba(25,56,47,.04)}.ops-card.wide{grid-column:1/-1}.ops-card label{display:block;font-size:7px;color:#929c97;font-weight:900;letter-spacing:.7px;text-transform:uppercase}.ops-card strong{display:block;font-size:21px;color:#1a2822;margin-top:5px}.ops-card small{display:block;font-size:8px;color:#8f9994;margin-top:4px}.ops-status{display:inline-flex!important;align-items:center;gap:5px;color:#147d64!important}.ops-status:before{content:'';width:7px;height:7px;border-radius:50%;background:#42cf9e;box-shadow:0 0 8px #42cf9e}.ops-bar{height:8px;border-radius:99px;background:#edf1ef;overflow:hidden;margin-top:10px}.ops-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#147d64,#3bcbb0)}.ops-warning{color:#b54838!important}.audit-toolbar{display:flex;gap:7px;margin-bottom:10px}.audit-toolbar input,.audit-toolbar select{height:40px;border:1px solid #e1e7e4;border-radius:11px;background:#fff;padding:0 11px;font-size:10px;color:#35423c;outline:none}.audit-toolbar input{flex:1;min-width:0}.audit-list{display:flex;flex-direction:column;gap:7px}.audit-row{display:flex;gap:9px;align-items:flex-start;border:1px solid #e7ece9;background:#fff;border-radius:14px;padding:11px}.audit-icon{width:30px;height:30px;flex:0 0 30px;border-radius:10px;display:grid;place-items:center;background:#edf8f5;color:#147d64;font-size:13px}.audit-main{flex:1;min-width:0}.audit-main b{display:block;font-size:10px;color:#213029}.audit-main span{display:block;font-size:8px;color:#929c97;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.audit-time{font-size:7px;color:#a1aaa6;white-space:nowrap}.log-row{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid #f0f2f1}.log-row:last-child{border:0}.log-dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px}.log-main{flex:1}.log-main b{display:block;font-size:10px;color:#28352f}.log-main span{font-size:8px;color:#97a09c}.ops-loading{min-height:220px;display:grid;place-items:center;color:#8e9893;font-size:10px}
@media(min-width:760px){.ops-grid{grid-template-columns:repeat(4,1fr)}.ops-card.wide{grid-column:span 2}}
`;

export const formatBytes = value => {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let amount = bytes / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
};

const formatDuration = seconds => {
  const days = Math.floor(Number(seconds || 0) / 86400);
  const hours = Math.floor(Number(seconds || 0) % 86400 / 3600);
  return days ? `${days} j ${hours} h` : `${hours} h`;
};

export function AdminSection({ title, subtitle, children }) {
  return <section className="admin-old-panel"><header className="ops-head"><div><h1>{title}</h1><p>{subtitle}</p></div></header>{children}</section>;
}

export function AdminSystem({ request }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true); setError("");
    try { setData(await request("/admin/system")); } catch { setError("La supervision du VPS est momentanément indisponible."); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  if (loading) return <div className="ops-loading">Lecture de l’état du VPS…</div>;
  if (error) return <><div className="team-error">{error}</div><button className="ops-refresh" onClick={load}>Réessayer</button></>;
  const disk = data.storage || {};
  const backup = data.backup || {};
  const memoryUsed = data.host?.memoryTotalBytes ? Math.round((data.host.memoryTotalBytes - data.host.memoryFreeBytes) / data.host.memoryTotalBytes * 100) : 0;
  return <>
    <header className="ops-head"><div><h1>Supervision du VPS</h1><p>État réel de l’API, de PostgreSQL, du disque et des sauvegardes.</p></div><button className="ops-refresh" onClick={load}>↻ Actualiser</button></header>
    <section className="ops-grid">
      <div className="ops-card"><label>API DRIVE</label><strong className="ops-status">En ligne</strong><small>{data.api.responseMs} ms · {formatDuration(data.api.uptimeSeconds)}</small></div>
      <div className="ops-card"><label>PostgreSQL</label><strong>{formatBytes(data.database.sizeBytes)}</strong><small>{data.database.connections} connexions · v{data.database.version}</small></div>
      <div className="ops-card"><label>Photos</label><strong>{formatBytes(disk.uploadBytes)}</strong><small>Stockage médias utilisé</small></div>
      <div className="ops-card"><label>Sauvegarde</label><strong className={backup.healthy ? "ops-status" : "ops-warning"}>{backup.healthy ? "À jour" : "À vérifier"}</strong><small>{backup.latest ? `${timeAgo(backup.latest.createdAt)} · ${formatBytes(backup.latest.size)}` : "Aucune archive détectée"}</small></div>
      <div className="ops-card wide"><label>Disque VPS · {disk.usedPercent ?? "?"}% utilisé</label><strong>{formatBytes(disk.freeBytes)} libres</strong><small>{formatBytes(disk.usedBytes)} utilisés sur {formatBytes(disk.totalBytes)}</small><div className="ops-bar"><i style={{ width: `${disk.usedPercent || 0}%`, background: disk.usedPercent > 85 ? "#e15c4c" : undefined }}/></div></div>
      <div className="ops-card wide"><label>Mémoire et charge</label><strong>{memoryUsed}% mémoire</strong><small>{formatBytes(data.host.memoryFreeBytes)} libres · charge {data.host.load.join(" / ")}</small><div className="ops-bar"><i style={{ width: `${memoryUsed}%`, background: memoryUsed > 85 ? "#e15c4c" : undefined }}/></div></div>
      <div className="ops-card wide"><label>Archives locales</label><strong>{backup.count || 0} fichiers</strong><small>{formatBytes(backup.bytes)} conservés sur le VPS</small></div>
      <div className="ops-card wide"><label>Dernière mesure</label><strong>{timeAgo(data.generatedAt)}</strong><small>{data.host.hostname} · Node {data.api.node}</small></div>
    </section>
  </>;
}

const actionNames = { create: "Création", update: "Modification", delete: "Suppression", restore: "Restauration", reset_pin: "Réinitialisation PIN" };
const actionIcons = { create: "+", update: "↗", delete: "×", restore: "↺", reset_pin: "●" };

export function AdminAudit({ request }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  useEffect(() => { request("/admin/audit?limit=300").then(setRows).catch(() => setError("Impossible de charger le journal d’audit.")).finally(() => setLoading(false)); }, [request]);
  const filtered = useMemo(() => rows.filter(row => (action === "all" || row.action === action) && (!search || `${row.technician_name} ${row.technician_code} ${row.entity_type} ${row.entity_id || ""}`.toLowerCase().includes(search.toLowerCase()))), [rows, action, search]);
  return <>
    <header className="ops-head"><div><h1>Journal d’audit</h1><p>Actions sensibles effectuées par les administrateurs.</p></div></header>
    <div className="audit-toolbar"><input placeholder="Rechercher…" value={search} onChange={event => setSearch(event.target.value)}/><select value={action} onChange={event => setAction(event.target.value)}><option value="all">Toutes</option>{Object.entries(actionNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    {error && <div className="team-error">{error}</div>}
    {loading ? <div className="ops-loading">Chargement de l’audit…</div> : <div className="audit-list">{filtered.map(row => <article className="audit-row" key={row.id}><div className="audit-icon">{actionIcons[row.action] || "·"}</div><div className="audit-main"><b>{row.technician_name || row.technician_code} · {actionNames[row.action] || row.action}</b><span>{row.entity_type}{row.entity_id ? ` · ${row.entity_id}` : ""}</span></div><time className="audit-time">{timeAgo(row.created_at)}</time></article>)}{!filtered.length && <div className="adm-empty">Aucune action correspondante</div>}</div>}
  </>;
}

export function AdminLoginLogs({ logs = [], loading = false }) {
  const [filter, setFilter] = useState("all");
  const filtered = logs.filter(log => filter === "all" || (filter === "success" ? log.success : !log.success));
  return <>
    <header className="ops-head"><div><h1>Connexions</h1><p>Historique récent des authentifications réussies et refusées.</p></div></header>
    <div className="team-toolbar"><div className="team-periods">{[["all", "Toutes"], ["success", "Réussies"], ["failed", "Échecs"]].map(([key, label]) => <button key={key} className={`team-period ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>{label}</button>)}</div></div>
    <div className="ops-card">{loading ? <div className="ops-loading">Chargement…</div> : filtered.map(log => <div className="log-row" key={log.id}><i className="log-dot" style={{ background: log.success ? "#35bd8b" : "#e15c4c" }}/><div className="log-main"><b>{log.technician_code || "Code inconnu"}</b><span>{log.success ? "Connexion réussie" : "Tentative refusée"}</span></div><time className="audit-time">{new Date(log.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></div>)}{!loading && !filtered.length && <div className="adm-empty">Aucune connexion</div>}</div>
  </>;
}
