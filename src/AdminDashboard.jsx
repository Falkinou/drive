import { useEffect, useMemo, useState } from "react";

const GREEN = "#147d64";
const AQUA = "#3bcbb0";
const ORANGE = "#f58220";
const PURPLE = "#7567d9";
const BLUE = "#367bd6";

export const ADMIN_SHELL_STYLE = `
.admin-page{min-height:calc(100vh - 48px);background:#f3f6f8}.admin-page,.admin-page *{box-sizing:border-box}.admin-tabs{position:sticky;top:48px;z-index:50;display:flex;gap:7px;padding:9px 12px;background:rgba(255,255,255,.94);border-bottom:1px solid #e8ecef;overflow-x:auto;scrollbar-width:none;backdrop-filter:blur(18px)}.admin-tabs::-webkit-scrollbar{display:none}.admin-tab{flex:0 0 auto;height:36px;border:1px solid #e5e9ec;border-radius:11px;background:#fff;color:#748079;padding:0 12px;font-size:10px;font-weight:800;white-space:nowrap;cursor:pointer}.admin-tab.active{color:#fff;border-color:#147d64;background:linear-gradient(135deg,#147d64,#25a987);box-shadow:0 5px 14px rgba(20,125,100,.2)}.admin-content{width:min(100%,1180px);margin:auto;padding:14px 14px 42px}.admin-toast{position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:10000;background:#12241f;color:#fff;border-radius:13px;padding:11px 16px;font-size:11px;font-weight:800;box-shadow:0 12px 35px rgba(0,0,0,.25);white-space:nowrap}.admin-old-panel>div,.admin-old-panel>section{border-radius:17px!important;border-color:#e6ebe8!important;box-shadow:0 5px 18px rgba(25,56,47,.04)!important}
.adm-hero{overflow:hidden;position:relative;border-radius:22px;padding:20px;color:#fff;background:radial-gradient(circle at 90% 0%,rgba(78,205,196,.32),transparent 34%),linear-gradient(145deg,#0c2d25,#14263b);box-shadow:0 16px 38px rgba(22,54,46,.16);margin-bottom:12px}.adm-hero:after{content:'';position:absolute;width:160px;height:160px;border:1px solid rgba(255,255,255,.08);border-radius:50%;right:-75px;bottom:-105px}.adm-eyebrow{font-size:8px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase;color:#78e4ca;margin-bottom:7px}.adm-hero h1{font-size:25px;line-height:1.05;letter-spacing:-.7px;margin:0}.adm-hero p{font-size:10px;color:rgba(255,255,255,.57);margin:7px 0 0}.adm-sync{display:inline-flex;align-items:center;gap:6px;margin-top:14px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.08);font-size:8px;font-weight:800;color:rgba(255,255,255,.72)}.adm-sync i{width:6px;height:6px;border-radius:50%;background:#55e8ac;box-shadow:0 0 9px #55e8ac}.adm-refresh{position:absolute;top:18px;right:18px;width:36px;height:36px;border:1px solid rgba(255,255,255,.15);border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-size:16px;cursor:pointer}
.adm-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-bottom:12px}.adm-kpi{position:relative;overflow:hidden;min-height:105px;border:1px solid #e8edef;border-radius:18px;background:#fff;padding:14px;box-shadow:0 5px 18px rgba(25,56,47,.045)}.adm-kpi-icon{width:31px;height:31px;border-radius:10px;display:grid;place-items:center;font-size:15px;margin-bottom:10px}.adm-kpi strong{display:block;font-size:25px;line-height:1;font-weight:900;letter-spacing:-.6px;color:#18231f}.adm-kpi span{display:block;font-size:9px;font-weight:750;color:#85908b;margin-top:5px}.adm-kpi small{position:absolute;right:10px;top:12px;font-size:8px;font-weight:900;padding:3px 6px;border-radius:7px}.adm-trend.up{background:#e7f7f0;color:#147d64}.adm-trend.down{background:#fff0ee;color:#b43d31}.adm-trend.flat{background:#f1f3f2;color:#68736e}
.adm-grid{display:grid;grid-template-columns:1fr;gap:10px}.adm-card{border:1px solid #e7ece9;border-radius:19px;background:#fff;padding:15px;box-shadow:0 5px 18px rgba(25,56,47,.04)}.adm-card-head{display:flex;align-items:center;gap:8px;margin-bottom:13px}.adm-card-head h2{font-size:12px;color:#1a2823;margin:0;flex:1}.adm-card-head span{font-size:8px;color:#99a29e;font-weight:800}.adm-progress-row{margin-bottom:13px}.adm-progress-row:last-child{margin-bottom:0}.adm-progress-meta{display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#69746f;margin-bottom:5px}.adm-progress-meta b{font-size:10px;color:#27332e}.adm-track{height:8px;border-radius:99px;background:#edf1ef;overflow:hidden}.adm-track i{display:block;height:100%;border-radius:99px;transition:width .5s ease}.adm-alerts{display:grid;grid-template-columns:1fr 1fr;gap:7px}.adm-alert{border-radius:13px;padding:11px;min-height:75px}.adm-alert b{display:block;font-size:18px}.adm-alert span{display:block;font-size:8px;font-weight:800;margin-top:3px}.adm-bars{height:125px;display:flex;align-items:flex-end;gap:7px}.adm-bar-col{flex:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px}.adm-bar-col b{font-size:8px;color:#64716b}.adm-bar{width:100%;max-width:30px;min-height:4px;border-radius:6px 6px 3px 3px;background:linear-gradient(180deg,#3bcbb0,#147d64)}.adm-bar-col span{font-size:7px;color:#9ba49f;white-space:nowrap}.adm-feed{display:flex;flex-direction:column;gap:3px}.adm-feed-row{display:flex;gap:9px;align-items:center;padding:8px 0;border-bottom:1px solid #f0f2f1}.adm-feed-row:last-child{border:0}.adm-avatar{width:31px;height:31px;flex:0 0 31px;border-radius:11px;display:grid;place-items:center;color:#fff;font-size:9px;font-weight:900;background:linear-gradient(145deg,#147d64,#3bcbb0)}.adm-feed-main{flex:1;min-width:0}.adm-feed-main b{display:block;font-size:10px;color:#24302c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.adm-feed-main span{display:block;font-size:8px;color:#98a09d;margin-top:2px}.adm-feed-tag{font-size:7px;font-weight:900;padding:3px 6px;border-radius:6px;background:#edf8f5;color:#147d64}.adm-empty{text-align:center;padding:25px 10px;color:#9aa39f;font-size:10px}
.team-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:10px}.team-periods{display:flex;gap:5px;overflow-x:auto;flex:1;scrollbar-width:none}.team-period{flex:0 0 auto;height:34px;padding:0 10px;border-radius:10px;border:1px solid #e2e8e5;background:#fff;color:#77817c;font-size:9px;font-weight:850;cursor:pointer}.team-period.active{border-color:#147d64;background:#e9f7f3;color:#147d64}.team-export{height:34px;border:0;border-radius:10px;background:#172a24;color:#fff;padding:0 12px;font-size:9px;font-weight:850;cursor:pointer}.team-custom{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:-2px 0 10px}.team-custom label{font-size:8px;color:#7f8984;font-weight:800}.team-custom input{display:block;width:100%;height:36px;margin-top:4px;border:1px solid #e2e8e5;border-radius:10px;padding:0 9px;background:#fff;color:#26332d}.team-search{width:100%;height:42px;border:1px solid #e2e8e5;background:#fff;border-radius:13px;padding:0 13px;font-size:11px;outline:none;margin-bottom:10px}.team-search:focus{border-color:#3bcbb0;box-shadow:0 0 0 3px rgba(59,203,176,.12)}.team-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px}.team-summary>div{border:1px solid #e7ece9;background:#fff;border-radius:15px;padding:12px}.team-summary strong{font-size:20px;color:#192620}.team-summary span{display:block;font-size:8px;color:#929c97;font-weight:800;margin-top:3px}.team-list{display:flex;flex-direction:column;gap:8px}.team-person{border:1px solid #e6ebe8;background:#fff;border-radius:17px;padding:12px;box-shadow:0 4px 14px rgba(24,55,46,.035)}.team-person-top{display:flex;align-items:center;gap:10px}.team-rank{width:23px;flex:0 0 23px;text-align:center;font-size:9px;color:#9ba39f;font-weight:900}.team-person-info{flex:1;min-width:0}.team-person-info b{display:block;font-size:11px;color:#1c2924;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.team-person-info span{font-size:8px;color:#9aa29e}.team-score{text-align:right}.team-score strong{display:block;font-size:18px;color:#147d64}.team-score span{font-size:7px;color:#a0a8a4;font-weight:800}.team-person-track{height:5px;background:#eef2f0;border-radius:99px;overflow:hidden;margin:10px 0 8px}.team-person-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#147d64,#3bcbb0)}.team-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.team-metric{border-radius:8px;background:#f5f7f6;padding:6px;text-align:center}.team-metric b{display:block;font-size:10px;color:#35423c}.team-metric span{font-size:6px;color:#98a09c;text-transform:uppercase;font-weight:850}.team-state{font-size:7px!important;font-weight:900;padding:2px 5px;border-radius:5px;margin-left:5px}.team-state.on{background:#e6f7f0;color:#13805f}.team-state.off{background:#f0f2f1;color:#9aa19e}.team-error{border:1px solid #ffd2cc;background:#fff1ef;color:#a4372c;border-radius:15px;padding:13px;font-size:10px;margin-bottom:10px}.team-loading{display:grid;place-items:center;min-height:180px;color:#8b9690;font-size:10px}.team-loading i{display:block;width:24px;height:24px;border-radius:50%;border:3px solid #e5ebe8;border-top-color:#147d64;animation:adm-spin .8s linear infinite;margin:0 auto 8px}
@keyframes adm-spin{to{transform:rotate(360deg)}}
@media(min-width:760px){.admin-tabs{justify-content:center}.admin-content{padding:20px 24px 50px}.adm-kpis{grid-template-columns:repeat(4,1fr)}.adm-grid{grid-template-columns:1fr 1fr}.adm-card.wide{grid-column:1/-1}.team-summary{grid-template-columns:repeat(4,1fr)}.team-metrics{grid-template-columns:repeat(6,1fr)}}
`;

export function timeAgo(value) {
  if (!value) return "Jamais";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "À l’instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} j`;
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

const actionLabel = action => ({ edit: "Modification", photo: "Photo", comment: "Note", create: "Création", visit: "Visite" })[action] || "Activité";
const trend = (current, previous) => previous ? Math.round((current - previous) / previous * 100) : current ? 100 : 0;
const trendClass = value => value > 0 ? "up" : value < 0 ? "down" : "flat";
const trendLabel = value => `${value > 0 ? "+" : ""}${value}%`;

export function AdminOverview({ data, onRefresh }) {
  const totals = data?.totals || {};
  const percentages = data?.percentages || {};
  const days = data?.visits7d || [];
  const activity = data?.recentActivity || [];
  const maxDay = Math.max(1, ...days.map(day => Number(day.count)));
  const visitsTrend = trend(totals.visits_month, totals.visits_previous_month);
  const actionsTrend = trend(totals.actions_30d, totals.actions_previous_30d);
  return <>
    <section className="adm-hero"><div className="adm-eyebrow">Administration · PostgreSQL</div><h1>Centre de contrôle</h1><p>Indicateurs consolidés directement sur le serveur.</p><div className="adm-sync"><i/>Actualisé {timeAgo(data?.generatedAt)}</div><button className="adm-refresh" onClick={onRefresh} aria-label="Actualiser">↻</button></section>
    <section className="adm-kpis">
      <div className="adm-kpi"><div className="adm-kpi-icon" style={{ background: "#e6f7f1", color: GREEN }}>⌖</div><strong>{totals.sites || 0}</strong><span>Sites référencés</span><small className="adm-trend up">{percentages.gps || 0}% GPS</small></div>
      <div className="adm-kpi"><div className="adm-kpi-icon" style={{ background: "#fff0e5", color: ORANGE }}>↗</div><strong>{totals.visits_month || 0}</strong><span>Visites ce mois</span><small className={`adm-trend ${trendClass(visitsTrend)}`}>{trendLabel(visitsTrend)}</small></div>
      <div className="adm-kpi"><div className="adm-kpi-icon" style={{ background: "#eeecff", color: PURPLE }}>◎</div><strong>{totals.accounts_active || 0}</strong><span>Comptes actifs</span><small className="adm-trend flat">{totals.accounts_total || 0} total</small></div>
      <div className="adm-kpi"><div className="adm-kpi-icon" style={{ background: "#e8f1fd", color: BLUE }}>⌁</div><strong>{totals.actions_30d || 0}</strong><span>Actions sur 30 jours</span><small className={`adm-trend ${trendClass(actionsTrend)}`}>{trendLabel(actionsTrend)}</small></div>
    </section>
    <section className="adm-grid">
      <div className="adm-card"><div className="adm-card-head"><h2>Qualité des données</h2><span>{totals.sites || 0} sites analysés</span></div>
        <div className="adm-progress-row"><div className="adm-progress-meta"><b>Coordonnées GPS</b><span>{totals.gps || 0}/{totals.sites || 0} · {percentages.gps || 0}%</span></div><div className="adm-track"><i style={{ width: `${percentages.gps || 0}%`, background: `linear-gradient(90deg,${GREEN},${AQUA})` }}/></div></div>
        <div className="adm-progress-row"><div className="adm-progress-meta"><b>Correspondance ANFR</b><span>{totals.anfr || 0}/{totals.mobile || 0} · {percentages.anfr || 0}%</span></div><div className="adm-track"><i style={{ width: `${percentages.anfr || 0}%`, background: `linear-gradient(90deg,${PURPLE},#aa9ef0)` }}/></div></div>
      </div>
      <div className="adm-card"><div className="adm-card-head"><h2>Points d’attention</h2><span>État actuel</span></div><div className="adm-alerts">
        <div className="adm-alert" style={{ background: "#fff3e9", color: "#a84c0e" }}><b>{(totals.sites || 0) - (totals.gps || 0)}</b><span>Sites sans GPS</span></div>
        <div className="adm-alert" style={{ background: "#f1efff", color: "#5948bd" }}><b>{totals.stale_mobile_30d || 0}</b><span>Sans visite depuis 30 j</span></div>
        <div className="adm-alert" style={{ background: "#edf8f5", color: GREEN }}><b>{(totals.accounts_total || 0) - (totals.accounts_active || 0)}</b><span>Comptes désactivés</span></div>
        <div className="adm-alert" style={{ background: totals.failed_logins_24h ? "#fff0ee" : "#f2f5f3", color: totals.failed_logins_24h ? "#b43d31" : "#76817b" }}><b>{totals.failed_logins_24h || 0}</b><span>Échecs de connexion · 24 h</span></div>
      </div></div>
      <div className="adm-card"><div className="adm-card-head"><h2>Visites sur 7 jours</h2><span>{days.reduce((sum, day) => sum + Number(day.count), 0)} passages</span></div><div className="adm-bars">{days.map(day => <div className="adm-bar-col" key={day.day}><b>{Number(day.count) || ""}</b><i className="adm-bar" style={{ height: `${Math.max(4, Number(day.count) / maxDay * 88)}px` }}/><span>{new Date(day.day).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span></div>)}</div></div>
      <div className="adm-card"><div className="adm-card-head"><h2>Dernières actions</h2><span>Flux terrain</span></div>{activity.length ? <div className="adm-feed">{activity.slice(0, 6).map((item, index) => <div className="adm-feed-row" key={item.id || index}><div className="adm-avatar">{(item.technician_name || item.technician_code || "?").slice(0, 2).toUpperCase()}</div><div className="adm-feed-main"><b>{item.technician_name || item.technician_code || "Inconnu"} · {item.site_name}</b><span>{timeAgo(item.created_at)}</span></div><span className="adm-feed-tag">{actionLabel(item.action)}</span></div>)}</div> : <div className="adm-empty">Aucune activité récente</div>}</div>
    </section>
  </>;
}

const PERIODS = { week: "7 jours", month: "Ce mois", quarter: "3 mois", year: "Cette année", custom: "Dates" };
const dateInput = date => date.toISOString().slice(0, 10);

export function AdminTeam({ request, notify }) {
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState(dateInput(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(dateInput(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError("");
      try {
        const query = period === "custom" ? `period=custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(`${to}T23:59:59`)}` : `period=${period}`;
        const result = await request(`/admin/team?${query}`);
        if (active) setData(result);
      } catch {
        if (active) setError("Impossible de charger les statistiques de l’équipe. Réessaie dans quelques secondes.");
      } finally { if (active) setLoading(false); }
    };
    if (period !== "custom" || (from && to && from <= to)) load();
    return () => { active = false; };
  }, [period, from, to, request]);

  const ranking = data?.technicians || [];
  const filtered = useMemo(() => ranking.filter(tech => !search || `${tech.name} ${tech.code}`.toLowerCase().includes(search.toLowerCase())), [ranking, search]);
  const maxVolume = Math.max(1, ...ranking.map(tech => tech.visits + tech.actions));
  const totals = ranking.reduce((sum, tech) => ({ visits: sum.visits + tech.visits, actions: sum.actions + tech.actions, sites: sum.sites + tech.unique_sites, days: sum.days + tech.active_days }), { visits: 0, actions: 0, sites: 0, days: 0 });
  const participating = ranking.filter(tech => tech.visits + tech.actions > 0).length;

  const exportCsv = () => {
    const rows = [["Nom", "Code", "Statut", "Visites", "Sites uniques", "Jours actifs", "Modifications", "Photos", "Notes", "Période précédente"], ...ranking.map(tech => [tech.name, tech.code, tech.active === false ? "Désactivé" : "Actif", tech.visits, tech.unique_sites, tech.active_days, tech.edits, tech.photos, tech.notes, tech.previous_visits + tech.previous_actions])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `equipe-drive-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
    notify?.("Export équipe téléchargé ✓");
  };

  return <>
    <section className="adm-hero"><div className="adm-eyebrow">Analyse consolidée</div><h1>Activité équipe</h1><p>Visites, couverture et contributions calculées par PostgreSQL.</p><div className="adm-sync"><i/>{participating} contributeur{participating > 1 ? "s" : ""} sur la période</div></section>
    <div className="team-toolbar"><div className="team-periods">{Object.entries(PERIODS).map(([key, label]) => <button key={key} className={`team-period ${period === key ? "active" : ""}`} onClick={() => setPeriod(key)}>{label}</button>)}</div><button className="team-export" onClick={exportCsv} disabled={!ranking.length}>CSV</button></div>
    {period === "custom" && <div className="team-custom"><label>DU<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>AU<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label></div>}
    {error && <div className="team-error">{error}</div>}
    {loading ? <div className="team-loading"><div><i/><div>Calcul des statistiques…</div></div></div> : <>
      <section className="team-summary"><div><strong>{participating}</strong><span>Contributeurs</span></div><div><strong>{totals.visits}</strong><span>Visites</span></div><div><strong>{totals.actions}</strong><span>Contributions</span></div><div><strong>{totals.days}</strong><span>Journées terrain</span></div></section>
      <input className="team-search" placeholder="Rechercher un technicien…" value={search} onChange={event => setSearch(event.target.value)}/>
      <section className="team-list">{filtered.map((tech, index) => { const volume = tech.visits + tech.actions; const previous = tech.previous_visits + tech.previous_actions; const delta = trend(volume, previous); return <article className="team-person" key={tech.id || tech.code}><div className="team-person-top"><div className="team-rank">#{ranking.indexOf(tech) + 1}</div><div className="adm-avatar">{(tech.name || tech.code || "?").slice(0, 2).toUpperCase()}</div><div className="team-person-info"><b>{tech.name || tech.code}<span className={`team-state ${tech.active === false ? "off" : "on"}`}>{tech.active === false ? "INACTIF" : "ACTIF"}</span></b><span>{tech.code} · {tech.last_activity ? `dernière activité ${timeAgo(tech.last_activity)}` : "aucune activité sur la période"}</span></div><div className="team-score"><strong>{tech.visits}</strong><span>VISITES · {trendLabel(delta)}</span></div></div><div className="team-person-track"><i style={{ width: `${volume / maxVolume * 100}%` }}/></div><div className="team-metrics"><div className="team-metric"><b>{tech.unique_sites}</b><span>Sites</span></div><div className="team-metric"><b>{tech.active_days}</b><span>Jours</span></div><div className="team-metric"><b>{tech.edits}</b><span>Modifs</span></div><div className="team-metric"><b>{tech.photos}</b><span>Photos</span></div><div className="team-metric"><b>{tech.notes}</b><span>Notes</span></div><div className="team-metric"><b>{previous}</b><span>Avant</span></div></div></article>; })}</section>
      {!filtered.length && <div className="adm-empty">Aucun technicien correspondant</div>}
    </>}
  </>;
}
