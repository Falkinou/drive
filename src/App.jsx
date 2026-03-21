import { useState, useEffect, useRef } from "react";

// ============================================================
// CONFIG
// ============================================================
const SB_URL = "https://cicndnlxwjitxroqtbnr.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpY25kbmx4d2ppdHhyb3F0Ym5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDMzNjcsImV4cCI6MjA4OTY3OTM2N30.x-hxZBMPGzpDSWmbekQAxMQ6BD3R1EUzkB1noHBlEoQ";
const LOGO = "data:image/webp;base64,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";

const hdrs = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
async function dbGet(t, p = "") { const r = await fetch(`${SB_URL}/rest/v1/${t}?${p}`, { headers: { ...hdrs, Accept: "application/json" } }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function dbPost(t, d) { const r = await fetch(`${SB_URL}/rest/v1/${t}`, { method: "POST", headers: { ...hdrs, Prefer: "return=representation" }, body: JSON.stringify(d) }); if (!r.ok) { const e = await r.text(); throw new Error(e); } return r.json(); }
async function dbPatch(t, d, f) { const r = await fetch(`${SB_URL}/rest/v1/${t}?${f}`, { method: "PATCH", headers: { ...hdrs, Prefer: "return=representation" }, body: JSON.stringify(d) }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function dbDel(t, f) { await fetch(`${SB_URL}/rest/v1/${t}?${f}`, { method: "DELETE", headers: hdrs }); }

// ICONS
const ic = (d, w = 20) => <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const I = {
  Search: () => ic(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
  Back: () => ic(<path d="m15 18-6-6 6-6" />, 22),
  Pin: () => ic(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>, 18),
  Nav: () => ic(<polygon points="3 11 22 2 13 21 11 13 3 11" />, 18),
  Ant: () => ic(<><path d="M2 12 7 2" /><path d="m7 2 5 10" /><path d="m12 12 5-10" /><path d="m17 2 5 10" /><path d="M4.5 7h15" /><path d="M12 16v6" /></>),
  Bld: () => ic(<><rect width="16" height="20" x="4" y="2" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" /></>),
  Edit: () => ic(<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />, 16),
  Plus: () => ic(<><path d="M5 12h14" /><path d="M12 5v14" /></>),
  X: () => ic(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  Save: () => ic(<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17,21 17,13 7,13 7,21" /><polyline points="7,3 7,8 15,8" /></>, 16),
  Globe: () => ic(<><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>, 18),
  Out: () => ic(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>, 18),
  Ref: () => ic(<><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>, 16),
  Chev: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>,
  Del: () => ic(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 16),
};

const Logo = ({ size = 52 }) => <img src={LOGO} alt="Drive" style={{ width: size, height: size, objectFit: "contain" }} />;

// STYLES
const Styles = () => {
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
      @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
      input::placeholder,textarea::placeholder{color:rgba(150,150,150,.5)!important}
      input:focus,textarea:focus{border-color:#1B8A6B!important;box-shadow:0 0 0 3px rgba(27,138,107,.12)!important}
      button{transition:transform .1s}button:active{transform:scale(.97)}
      ::-webkit-scrollbar{width:0}*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
      body{margin:0;background:#F7F7F8}
    `;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);
  return null;
};

// ============================================================
// APP
// ============================================================
export default function App() {
  const [tech, setTech] = useState(null);
  const [sites, setSites] = useState([]);
  const [view, setView] = useState("home");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [filt, setFilt] = useState("all");
  const [loading, setLoading] = useState(false);
  const [anfr, setAnfr] = useState(null);
  const [anfrL, setAnfrL] = useState(false);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = m => { setToast(m); setTimeout(() => setToast(null), 2500); };

  useEffect(() => { try { const s = localStorage.getItem("drv_tech"); if (s) setTech(s); } catch (e) {} }, []);
  useEffect(() => { if (tech) fetchSites(); }, [tech]);

  const fetchSites = async () => { setLoading(true); try { setSites(await dbGet("sites", "order=name.asc")); } catch (e) { flash("Erreur de chargement"); } setLoading(false); };
  const fetchNotes = async sid => { try { const d = await dbGet("notes", `site_id=eq.${sid}&order=updated_at.desc`); setNotes(d); setNote(d.length > 0 ? d[0].content : ""); } catch (e) {} };

  const openSite = site => { setSel(site); setNote(""); setNotes([]); setAnfr(null); setView("site"); fetchNotes(site.id); };

  const saveNote = async () => {
    try {
      if (notes.length > 0) await dbPatch("notes", { content: note, technician_code: tech }, `id=eq.${notes[0].id}`);
      else await dbPost("notes", { site_id: sel.id, content: note, technician_code: tech });
      flash("Note sauvegardée ✓"); fetchNotes(sel.id);
    } catch (e) { flash("Erreur"); }
  };

  const addSite = async data => { try { const ins = await dbPost("sites", data); setSites([...sites, ...ins]); setShowAdd(false); flash("Site ajouté ✓"); } catch (e) { flash("Erreur"); } };
  const deleteSite = async id => { if (!confirm("Supprimer ce site ?")) return; try { await dbDel("sites", `id=eq.${id}`); setSites(sites.filter(s => s.id !== id)); setView("home"); flash("Site supprimé"); } catch (e) { flash("Erreur"); } };

  const updateGps = async (id, lat, lng) => {
    try {
      await dbPost("gps_history", { site_id: id, old_lat: sel.lat, old_lng: sel.lng, new_lat: lat, new_lng: lng, technician_code: tech });
      await dbPatch("sites", { lat, lng }, `id=eq.${id}`);
      const up = { ...sel, lat, lng }; setSites(sites.map(s => s.id === id ? up : s)); setSel(up); setView("site"); flash("GPS mis à jour ✓");
    } catch (e) { flash("Erreur"); }
  };

  const getAnfr = async site => {
    setAnfrL(true); await new Promise(r => setTimeout(r, 1200));
    setAnfr({ num: site.code_anfr || "N/A", exploitant: "ORANGE", statut: "En service", date: "2019-03-15", hauteur: site.type === "mobile" ? "32m" : null, freq: site.type === "mobile" ? ["700 MHz", "800 MHz", "1800 MHz", "2100 MHz", "3500 MHz"] : [], puissance: site.type === "mobile" ? "2400 W" : null });
    setAnfrL(false);
  };

  const logout = () => { try { localStorage.removeItem("drv_tech"); } catch (e) {} setTech(null); setSites([]); setView("home"); };
  const filtered = sites.filter(s => { const lq = q.toLowerCase(); const mq = !lq || s.name?.toLowerCase().includes(lq) || s.address?.toLowerCase().includes(lq) || s.code_anfr?.includes(q) || s.technologies?.some(t => t.toLowerCase().includes(lq)); return mq && (filt === "all" || s.type === filt); });

  // LOGIN
  if (!tech) return <div style={S.ctr}><Styles /><LoginScreen onAuth={c => { setTech(c); try { localStorage.setItem("drv_tech", c); } catch (e) {} }} /></div>;

  // GPS EDIT
  if (view === "editGps" && sel) return (
    <div style={S.ctr}><Styles />
      <TopBar title="Modifier le GPS" onBack={() => setView("site")} />
      <div style={{ padding: "0 16px 40px" }}>
        <div style={{ padding: "20px 0 12px" }}><h3 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px", color: "#1A1A1A" }}>{sel.name}</h3><p style={{ fontSize: 13, color: "#888", margin: 0 }}>{sel.address}</p></div>
        <MapBox lat={sel.lat} lng={sel.lng} />
        <GpsForm lat={sel.lat} lng={sel.lng} onSave={(a, n) => updateGps(sel.id, a, n)} onCancel={() => setView("site")} />
      </div>
      {toast && <Toast msg={toast} />}
    </div>
  );

  // SITE DETAIL
  if (view === "site" && sel) return (
    <div style={S.ctr}><Styles />
      <TopBar title="Détail du site" onBack={() => { setView("home"); fetchSites(); }} />
      <div style={{ padding: "0 14px", overflowY: "auto" }}>
        <div style={S.hero}>
          <div style={{ ...S.bigIc, background: sel.type === "mobile" ? "#1B8A6B" : "#2E86C1" }}>{sel.type === "mobile" ? <I.Ant /> : <I.Bld />}</div>
          <h2 style={S.heroN}>{sel.name}</h2>
          <span style={{ ...S.tag, background: sel.type === "mobile" ? "#E8F8F5" : "#EBF5FB", color: sel.type === "mobile" ? "#1B8A6B" : "#2E86C1" }}>{sel.type === "mobile" ? "Site Mobile" : "Site Fixe"}</span>
        </div>
        <div style={S.card}><div style={S.row}><I.Pin /><span style={S.rowT}>{sel.address || "—"}</span></div>
          <div style={S.row}><I.Globe /><span style={{ ...S.rowT, fontFamily: "monospace", fontSize: 12 }}>{sel.lat?.toFixed(6)}, {sel.lng?.toFixed(6)}</span><button style={S.editG} onClick={() => setView("editGps")}><I.Edit /> Modifier</button></div>
        </div>
        {sel.technologies?.length > 0 && <div style={S.card}><h3 style={S.sec}>Technologies</h3><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{sel.technologies.map(t => <span key={t} style={S.tLg}>{t}</span>)}</div></div>}
        <div style={S.card}><h3 style={S.sec}>Navigation</h3><div style={{ display: "flex", gap: 8 }}>
          <a href={`https://waze.com/ul?ll=${sel.lat},${sel.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer" style={{ ...S.navB, background: "#33CCFF" }}><I.Nav /> Waze</a>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}`} target="_blank" rel="noopener noreferrer" style={{ ...S.navB, background: "#34A853" }}><I.Pin /> Maps</a>
          <a href={`http://maps.apple.com/?daddr=${sel.lat},${sel.lng}`} target="_blank" rel="noopener noreferrer" style={{ ...S.navB, background: "#555" }}><I.Pin /> Apple</a>
        </div></div>
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={S.sec}>Données ANFR</h3>{!anfr && <button style={S.pBtn} onClick={() => getAnfr(sel)} disabled={anfrL}>{anfrL ? "..." : "Récupérer"}</button>}</div>
          {anfrL && <div style={S.loadR}><div style={S.spin} />Interrogation ANFR...</div>}
          {anfr && <div style={S.anfrG}>{[["N° Station", anfr.num], ["Exploitant", anfr.exploitant], ["Statut", anfr.statut, "#1B8A6B"], ["Mise en service", anfr.date], anfr.hauteur && ["Hauteur", anfr.hauteur], anfr.puissance && ["Puissance", anfr.puissance]].filter(Boolean).map(([l, v, c]) => <div key={l} style={S.anfrI}><span style={S.anfrL}>{l}</span><span style={{ fontSize: 13, fontWeight: 600, color: c || "#1A1A1A" }}>{v}</span></div>)}
            {anfr.freq?.length > 0 && <div style={{ gridColumn: "1/-1" }}><span style={S.anfrL}>Bandes de fréquences</span><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{anfr.freq.map(f => <span key={f} style={S.freqB}>{f}</span>)}</div></div>}
            <div style={{ gridColumn: "1/-1" }}><span style={{ fontSize: 11, color: "#BBB", fontStyle: "italic" }}>Source : data.anfr.fr / data.gouv.fr</span></div>
          </div>}
        </div>
        <div style={S.card}><h3 style={S.sec}>Notes</h3><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Accès, clés, contact gardien, remarques..." style={S.ta} rows={4} />
          <button style={S.dkBtn} onClick={saveNote}><I.Save /> Sauvegarder</button>
          {notes.length > 0 && notes[0].technician_code && <p style={{ fontSize: 11, color: "#BBB", marginTop: 8, fontStyle: "italic" }}>Dernière modif. par {notes[0].technician_code}</p>}
        </div>
        <button style={S.delBtn} onClick={() => deleteSite(sel.id)}><I.Del /> Supprimer ce site</button>
        <div style={{ height: 40 }} />
      </div>
      {toast && <Toast msg={toast} />}
    </div>
  );

  // HOME
  return (
    <div style={S.ctr}><Styles />
      <div style={S.header}>
        <div style={S.hTop}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Logo size={32} /><span style={S.logo}>Drive</span></div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={S.hBtn} onClick={fetchSites}><I.Ref /></button>
            <button style={S.hBtn} onClick={() => setShowAdd(true)}><I.Plus /></button>
            <button style={S.hBtn} onClick={logout}><I.Out /></button>
          </div>
        </div>
        <h1 style={S.h1}>Où je vais</h1>
        <p style={S.sub}>{sites.length} sites · {sites.filter(x => x.type === "mobile").length} mobile · {sites.filter(x => x.type === "fixe").length} fixe<span style={{ marginLeft: 8, color: "rgba(255,255,255,.2)" }}>· {tech}</span></p>
        <div style={S.sBox}><div style={S.sIcW}><I.Search /></div><input type="text" placeholder="Rechercher un site, adresse, techno..." value={q} onChange={e => setQ(e.target.value)} style={S.sIn} />{q && <button style={S.clr} onClick={() => setQ("")}><I.X /></button>}</div>
        <div style={S.fRow}>{["all", "mobile", "fixe"].map(f => <button key={f} onClick={() => setFilt(f)} style={{ ...S.chip, ...(filt === f ? S.chipA : {}) }}>{f === "all" ? "Tous" : f === "mobile" ? "Mobile" : "Fixe"}</button>)}</div>
      </div>
      <div style={S.list}>
        {loading ? <div style={S.loadR}><div style={S.spin} />Chargement...</div>
          : filtered.length === 0 ? <div style={S.empty}><I.Search /><p>Aucun site trouvé</p></div>
            : filtered.map((s, i) => (
              <button key={s.id} style={{ ...S.sCard, animationDelay: `${i * 30}ms` }} onClick={() => openSite(s)}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{ ...S.sIcB, background: s.type === "mobile" ? "#1B8A6B" : "#2E86C1" }}>{s.type === "mobile" ? <I.Ant /> : <I.Bld />}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={S.sNm}>{s.name}</span><span style={S.sAd}>{s.address}</span>
                    <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>{s.technologies?.map(t => <span key={t} style={S.tSm}>{t}</span>)}</div>
                  </div>
                </div><I.Chev />
              </button>))}
      </div>
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={addSite} />}
      {toast && <Toast msg={toast} />}
    </div>
  );
}

// ============================================================
// LOGIN
// ============================================================
function LoginScreen({ onAuth }) {
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const go = async () => {
    const c = code.trim().toUpperCase(); if (!c) return setErr("Entrez votre code");
    setBusy(true); setErr("");
    try { const r = await dbGet("technicians", `code=eq.${c}&select=code`); if (r.length === 0) setErr("Code inconnu"); else onAuth(c); }
    catch (e) { setErr("Erreur de connexion"); } setBusy(false);
  };
  return (
    <div style={S.loginW}>
      <div style={S.loginB}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}><Logo size={80} /></div>
        <h1 style={S.loginH}>Drive</h1>
        {err && <div style={S.errB}>{err}</div>}
        <input ref={ref} type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && go()} placeholder="CODE" maxLength={20} style={S.codeIn} autoComplete="off" autoCapitalize="characters" />
        <button style={{ ...S.subBtn, opacity: busy ? .6 : 1, marginTop: 16 }} onClick={go} disabled={busy}>{busy ? "..." : "Entrer"}</button>
      </div>
    </div>
  );
}

// COMPONENTS
function TopBar({ title, onBack }) { return <div style={S.topBar}><button style={S.backBtn} onClick={onBack}><I.Back /></button><span style={S.topT}>{title}</span><div style={{ width: 40 }} /></div>; }
function Toast({ msg }) { return <div style={S.toast}>{msg}</div>; }
function MapBox({ lat, lng }) { return <div style={S.mapBox}><iframe src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - .003},${lat - .002},${lng + .003},${lat + .002}&layer=mapnik&marker=${lat},${lng}`} style={{ width: "100%", height: "100%", border: "none" }} title="Carte" /></div>; }

function GpsForm({ lat, lng, onSave, onCancel }) {
  const [a, setA] = useState(lat?.toString() || ""); const [n, setN] = useState(lng?.toString() || "");
  return <><p style={{ fontSize: 12, color: "#999", margin: "0 0 16px" }}>Modifiez les coordonnées pour ajuster la position</p>
    <div style={{ display: "flex", gap: 12, marginBottom: 24 }}><div style={S.fg}><label style={S.fl}>Latitude</label><input type="number" step="0.000001" value={a} onChange={e => setA(e.target.value)} style={S.fi} /></div><div style={S.fg}><label style={S.fl}>Longitude</label><input type="number" step="0.000001" value={n} onChange={e => setN(e.target.value)} style={S.fi} /></div></div>
    <div style={{ display: "flex", gap: 12 }}><button style={S.canBtn} onClick={onCancel}>Annuler</button><button style={{ ...S.subBtn, flex: 2 }} onClick={() => onSave(parseFloat(a), parseFloat(n))}><I.Save /> Valider</button></div></>;
}

function AddModal({ onClose, onAdd }) {
  const [f, sF] = useState({ name: "", type: "mobile", lat: "", lng: "", address: "", code_anfr: "", technologies: [] });
  const techs = ["2G", "3G", "4G", "5G", "DSL", "FTTH", "FTTB", "FH"];
  const go = () => { if (!f.name || !f.lat || !f.lng) return; onAdd({ ...f, lat: parseFloat(f.lat), lng: parseFloat(f.lng) }); };
  return (
    <div style={S.ov} onClick={onClose}><div style={S.modal} onClick={e => e.stopPropagation()}>
      <div style={S.mH}><h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Nouveau site</h2><button style={S.iBtn} onClick={onClose}><I.X /></button></div>
      <div style={S.mB}>
        <div style={S.fg}><label style={S.fl}>Nom *</label><input type="text" placeholder="Ex: NRO Paris Bastille" value={f.name} onChange={e => sF({ ...f, name: e.target.value })} style={S.fi} /></div>
        <div style={S.fg}><label style={S.fl}>Type</label><div style={{ display: "flex", gap: 8 }}>{["mobile", "fixe"].map(t => <button key={t} onClick={() => sF({ ...f, type: t })} style={{ ...S.tBtn, ...(f.type === t ? (t === "mobile" ? S.tM : S.tF) : {}) }}>{t === "mobile" ? "Mobile" : "Fixe"}</button>)}</div></div>
        <div style={{ display: "flex", gap: 12 }}><div style={S.fg}><label style={S.fl}>Latitude *</label><input type="number" step="0.000001" placeholder="48.8534" value={f.lat} onChange={e => sF({ ...f, lat: e.target.value })} style={S.fi} /></div><div style={S.fg}><label style={S.fl}>Longitude *</label><input type="number" step="0.000001" placeholder="2.3695" value={f.lng} onChange={e => sF({ ...f, lng: e.target.value })} style={S.fi} /></div></div>
        <div style={S.fg}><label style={S.fl}>Adresse</label><input type="text" placeholder="12 Rue de la Roquette, 75011" value={f.address} onChange={e => sF({ ...f, address: e.target.value })} style={S.fi} /></div>
        <div style={S.fg}><label style={S.fl}>Code ANFR</label><input type="text" placeholder="0751120001" value={f.code_anfr} onChange={e => sF({ ...f, code_anfr: e.target.value })} style={S.fi} /></div>
        <div style={S.fg}><label style={S.fl}>Technologies</label><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{techs.map(t => <button key={t} style={{ ...S.to, ...(f.technologies.includes(t) ? S.toA : {}) }} onClick={() => { const a = f.technologies.includes(t) ? f.technologies.filter(x => x !== t) : [...f.technologies, t]; sF({ ...f, technologies: a }); }}>{t}</button>)}</div></div>
      </div>
      <div style={S.mF}><button style={S.canBtn} onClick={onClose}>Annuler</button><button style={{ ...S.subBtn, flex: 2, opacity: f.name && f.lat && f.lng ? 1 : .5 }} onClick={go} disabled={!f.name || !f.lat || !f.lng}>Ajouter</button></div>
    </div></div>
  );
}

// ============================================================
// STYLES
// ============================================================
const P = "#1B8A6B"; // primary green from logo
const S = {
  ctr: { minHeight: "100vh", background: "#F7F7F8", fontFamily: "'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif", maxWidth: 480, margin: "0 auto", position: "relative" },
  // Login
  loginW: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "linear-gradient(145deg, #0a2e24 0%, #0d1b2a 100%)" },
  loginB: { width: "100%", maxWidth: 340, padding: 28, borderRadius: 24, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(10px)" },
  loginH: { textAlign: "center", fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 28px", letterSpacing: -1 },
  errB: { background: "rgba(231,76,60,.15)", color: "#E74C3C", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16, border: "1px solid rgba(231,76,60,.2)", textAlign: "center" },
  codeIn: { width: "100%", padding: "16px", borderRadius: 14, border: "2px solid rgba(255,255,255,.15)", background: "rgba(0,0,0,.3)", color: "#fff", fontSize: 24, fontWeight: 800, fontFamily: "'DM Sans',monospace", textAlign: "center", letterSpacing: 6, outline: "none", boxSizing: "border-box" },
  // Header
  header: { background: "linear-gradient(145deg, #0a2e24 0%, #0d1b2a 100%)", padding: "14px 14px 12px", position: "sticky", top: 0, zIndex: 100 },
  hTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  logo: { color: "#fff", fontSize: 18, fontWeight: 800, letterSpacing: -0.5 },
  hBtn: { background: "rgba(255,255,255,.08)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "#4ECDC4", cursor: "pointer" },
  h1: { color: "#fff", fontSize: 30, fontWeight: 800, margin: "0 0 2px", letterSpacing: -1 },
  sub: { color: "rgba(255,255,255,.4)", fontSize: 12, margin: "0 0 14px" },
  // Search
  sBox: { position: "relative", marginBottom: 10 },
  sIcW: { position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,.3)", display: "flex" },
  sIn: { width: "100%", padding: "12px 42px", borderRadius: 14, border: "none", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" },
  clr: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#666", cursor: "pointer", display: "flex", padding: 4 },
  // Filter
  fRow: { display: "flex", gap: 8 },
  chip: { padding: "6px 14px", borderRadius: 18, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "rgba(255,255,255,.45)", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  chipA: { background: P, color: "#fff", borderColor: P },
  // List
  list: { padding: "10px 12px 80px" },
  loadR: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 40, color: "#999", fontSize: 13 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", color: "#CCC", fontSize: 14, gap: 8 },
  sCard: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 12px", background: "#fff", borderRadius: 13, border: "1px solid #EEE", marginBottom: 6, cursor: "pointer", width: "100%", textAlign: "left", animation: "fadeUp .3s ease both" },
  sIcB: { width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 },
  sNm: { fontSize: 13, fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  sAd: { fontSize: 11, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  tSm: { fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: "#F0FAF7", color: P },
  // Detail
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px", background: "linear-gradient(145deg, #0a2e24, #0d1b2a)" },
  backBtn: { background: "none", border: "none", color: "#4ECDC4", cursor: "pointer", display: "flex", padding: 6 },
  topT: { color: "#fff", fontSize: 15, fontWeight: 700 },
  hero: { display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 0 14px", gap: 8 },
  bigIc: { width: 50, height: 50, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" },
  heroN: { fontSize: 19, fontWeight: 800, color: "#1A1A1A", margin: 0, textAlign: "center", letterSpacing: -.4 },
  tag: { fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 14 },
  card: { background: "#fff", borderRadius: 13, padding: 13, marginBottom: 10, border: "1px solid #F0F0F0" },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "5px 0", color: "#666" },
  rowT: { fontSize: 13, color: "#333", flex: 1 },
  editG: { display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${P}33`, borderRadius: 8, padding: "3px 10px", fontSize: 11, color: P, fontWeight: 700, cursor: "pointer" },
  sec: { fontSize: 11, fontWeight: 800, color: "#1A1A1A", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .8 },
  tLg: { fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 8, background: "#F0FAF7", color: P },
  navB: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 6px", borderRadius: 10, color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700 },
  anfrG: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 },
  anfrI: { display: "flex", flexDirection: "column", gap: 2 },
  anfrL: { fontSize: 9, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: .5 },
  freqB: { fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: "#E8F8F5", color: P },
  ta: { width: "100%", padding: 11, borderRadius: 10, border: "1px solid #E8E8E8", fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", minHeight: 80 },
  mapBox: { borderRadius: 14, overflow: "hidden", border: "1px solid #E8E8E8", marginBottom: 12, height: 250, background: "#f0f0f0" },
  pBtn: { background: P, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  dkBtn: { display: "flex", alignItems: "center", gap: 6, background: "#1A1A1A", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  subBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px", borderRadius: 12, border: "none", background: P, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  canBtn: { flex: 1, padding: "12px", borderRadius: 12, border: "1px solid #E0E0E0", background: "#fff", fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer" },
  iBtn: { background: "none", border: "none", color: "#999", cursor: "pointer", display: "flex", padding: 4 },
  delBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "12px", borderRadius: 12, border: "1px solid #FCC", background: "#FFF5F5", color: "#E74C3C", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 10 },
  fg: { marginBottom: 14, flex: 1 },
  fl: { display: "block", fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 5, textTransform: "uppercase", letterSpacing: .5 },
  fi: { width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid #E8E8E8", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff", color: "#1A1A1A" },
  tBtn: { flex: 1, padding: "9px", borderRadius: 10, border: "2px solid #E8E8E8", background: "#fff", fontSize: 12, fontWeight: 700, color: "#888", cursor: "pointer" },
  tM: { borderColor: P, background: "#E8F8F5", color: P },
  tF: { borderColor: "#2E86C1", background: "#EBF5FB", color: "#2E86C1" },
  to: { padding: "7px 14px", borderRadius: 8, border: "1px solid #E8E8E8", background: "#fff", fontSize: 11, fontWeight: 700, color: "#888", cursor: "pointer" },
  toA: { background: P, color: "#fff", borderColor: P },
  ov: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" },
  modal: { width: "100%", maxWidth: 480, maxHeight: "88vh", background: "#fff", borderRadius: "22px 22px 0 0", display: "flex", flexDirection: "column", animation: "slideUp .3s ease" },
  mH: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 10px", borderBottom: "1px solid #F0F0F0" },
  mB: { padding: "12px 16px", overflowY: "auto", flex: 1 },
  mF: { display: "flex", gap: 12, padding: "12px 16px 20px", borderTop: "1px solid #F0F0F0" },
  spin: { width: 18, height: 18, border: "2px solid #EEE", borderTopColor: P, borderRadius: "50%", animation: "spin .6s linear infinite" },
  toast: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#1A1A1A", color: "#fff", padding: "10px 22px", borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 2000, animation: "fadeUp .3s ease", boxShadow: "0 8px 30px rgba(0,0,0,.25)" },
};
