import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ============================================================
// CONFIG
// ============================================================
const SB="https://cicndnlxwjitxroqtbnr.supabase.co";
const APP_VERSION="5.4.0";
const APP_BUILD="2026-03-31";
const SK="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpY25kbmx4d2ppdHhyb3F0Ym5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDMzNjcsImV4cCI6MjA4OTY3OTM2N30.x-hxZBMPGzpDSWmbekQAxMQ6BD3R1EUzkB1noHBlEoQ";
const H={"apikey":SK,"Authorization":`Bearer ${SK}`,"Content-Type":"application/json"};
const SDAYS=30;

// API
async function db(method,t,opts={}){
  const{data,filter,prefer}=opts;
  const url=`${SB}/rest/v1/${t}${filter?'?'+filter:''}`;
  const h={...H};
  if(prefer)h.Prefer=prefer;
  if(method==='GET')h.Accept="application/json";
  const r=await fetch(url,{method,headers:h,...(data?{body:JSON.stringify(data)}:{})});
  if(!r.ok)throw new Error(await r.text());
  if(method==='DELETE')return;
  return r.json();
}
const dbGet=(t,f="")=>db('GET',t,{filter:f});
const dbPost=(t,d)=>db('POST',t,{data:d,prefer:"return=representation"});
const dbPatch=(t,d,f)=>db('PATCH',t,{data:d,filter:f,prefer:"return=representation"});
const dbDel=(t,f)=>db('DELETE',t,{filter:f});

// Photo helpers
async function compressImg(file,max=1200){return new Promise(res=>{const img=new Image();img.onload=()=>{const c=document.createElement("canvas");const r=Math.min(max/img.width,max/img.height,1);c.width=img.width*r;c.height=img.height*r;c.getContext("2d").drawImage(img,0,0,c.width,c.height);c.toBlob(b=>res(b),"image/jpeg",0.8);};img.src=URL.createObjectURL(file);});}
async function upPhoto(file,sid){const c=await compressImg(file);const p=`${sid}/${Date.now()}.jpg`;const r=await fetch(`${SB}/storage/v1/object/site-photos/${p}`,{method:"POST",headers:{"apikey":SK,"Authorization":`Bearer ${SK}`,"Content-Type":"image/jpeg"},body:c});if(!r.ok)throw new Error("fail");return`${SB}/storage/v1/object/public/site-photos/${p}`;}
async function delPhoto(url){const p=url.split('/site-photos/')[1];await fetch(`${SB}/storage/v1/object/site-photos/${p}`,{method:"DELETE",headers:{"apikey":SK,"Authorization":`Bearer ${SK}`}});}

// Geolocation hook
function useGeo(){const[p,setP]=useState(null);const w=useRef(null);
  const start=useCallback(()=>{if(!navigator.geolocation)return;w.current=navigator.geolocation.watchPosition(pos=>setP({lat:pos.coords.latitude,lng:pos.coords.longitude,acc:pos.coords.accuracy}),()=>{},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});},[]);
  const stop=useCallback(()=>{if(w.current)navigator.geolocation.clearWatch(w.current);},[]);
  return{p,start,stop};}

// Distance
function dist(a,b,c,d){if(!a||!b||!c||!d||(c===0&&d===0))return null;const R=6371,dL=(c-a)*Math.PI/180,dN=(d-b)*Math.PI/180;const x=Math.sin(dL/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dN/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}

// Local storage helpers
const ls={
  get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},
  set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},
  del:k=>{try{localStorage.removeItem(k)}catch(e){}},
  json:k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},
};
const getFavs=()=>ls.json("drv_favs")||[];
const setFavs=f=>ls.set("drv_favs",JSON.stringify(f));
const togFav=id=>{const f=getFavs();f.includes(id)?setFavs(f.filter(x=>x!==id)):setFavs([...f,id]);};
const checkSession=()=>{const d=ls.get("drv_date");if(!d)return true;return(Date.now()-parseInt(d))/(1e3*60*60*24)<SDAYS;};
const touchSession=()=>ls.set("drv_date",Date.now().toString());

// Log activity
const logAct=async(sid,tech,action,details="")=>{try{await dbPost("activity_log",{site_id:sid,technician_code:tech,action,details});}catch(e){}};

// PIN hashing (SHA-256)
async function hashPin(pin){const enc=new TextEncoder().encode(pin);const buf=await crypto.subtle.digest("SHA-256",enc);return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");}
const isHashed=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);

// ============================================================
// LOGO
// ============================================================
const Logo=({s=1})=>(
  <div style={{display:"flex",alignItems:"flex-end",fontSize:38*s,fontWeight:900,fontFamily:"'Helvetica Neue',-apple-system,sans-serif",color:"#FF7900",letterSpacing:-2*s,lineHeight:1}}>
    <span>DR</span>
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",margin:`0 ${-1*s}px`}}>
      <svg width={12*s} height={16*s} viewBox="0 0 12 16" style={{marginBottom:-2*s}}><path d="M6 0C3 0 0 2.5 0 6c0 4 6 10 6 10s6-6 6-10c0-3.5-3-6-6-6z" fill="#4ECDC4"/><circle cx="6" cy="5.5" r="2" fill="#0a2e24"/></svg>
      <span style={{fontSize:38*s,lineHeight:1}}>I</span>
    </div>
    <span>VE</span>
  </div>
);

// ============================================================
// ICONS
// ============================================================
const ic=(d,w=20)=><svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const I={
  Search:()=>ic(<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>),
  Back:()=>ic(<path d="m15 18-6-6 6-6"/>,22),
  Pin:()=>ic(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,18),
  Nav:()=>ic(<polygon points="3 11 22 2 13 21 11 13 3 11"/>,18),
  Ant:()=>ic(<><path d="M8.5 14.5A2 2 0 0 1 7 11.5"/><path d="M15.5 14.5a2 2 0 0 0 1.5-3"/><path d="M5 18a7 7 0 0 1 1.5-10"/><path d="M19 18a7 7 0 0 0-1.5-10"/><line x1="12" y1="9" x2="12" y2="22"/><circle cx="12" cy="7" r="2"/></>),
  Bld:()=>ic(<><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></>),
  Edit:()=>ic(<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>,16),
  Plus:()=>ic(<><path d="M5 12h14"/><path d="M12 5v14"/></>),
  X:()=>ic(<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>),
  Save:()=>ic(<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></>,16),
  Globe:()=>ic(<><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></>,18),
  Out:()=>ic(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,18),
  Ref:()=>ic(<><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></>,16),
  Chev:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>,
  Del:()=>ic(<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,16),
  Cam:()=>ic(<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></>,20),
  Trash:()=>ic(<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></>,16),
  Star:()=>ic(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,16),
  StarF:()=><svg width="16" height="16" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Locate:()=>ic(<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></>),
  Near:()=>ic(<><circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 2a10 10 0 0 0-10 10"/><path d="M12 22a10 10 0 0 0 10-10"/><path d="M12 22a10 10 0 0 1-10-10"/></>),
  Clock:()=>ic(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,14),
  Users:()=>ic(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,18),
  Link:()=>ic(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,16),
  Act:()=>ic(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,16),
  Dash:()=>ic(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,18),
  Shield:()=>ic(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,18),
  Bar:()=>ic(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,18),
  DL:()=>ic(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,16),
  Up:()=>ic(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,16),
  Set:()=>ic(<><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></>,18),
};

// ============================================================
// STYLES INJECTION
// ============================================================
const Styles=()=>{useEffect(()=>{const el=document.createElement("style");el.textContent=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes countUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
input::placeholder,textarea::placeholder{color:rgba(150,150,150,.5)!important}
input:focus,textarea:focus{border-color:#1B8A6B!important;box-shadow:0 0 0 3px rgba(27,138,107,.12)!important}
button{transition:transform .1s}button:active{transform:scale(.97)}
::-webkit-scrollbar{width:0}*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
body{margin:0;background:#0a2e24}html,body{overflow-x:hidden;width:100%}
.lb{position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column}
.lb img{max-width:95vw;max-height:80vh;object-fit:contain;border-radius:8px}
.drv-list{display:flex;flex-direction:column;overflow:hidden}
.drv-detail-grid{display:flex;flex-direction:column}
.drv-admin-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.drv-admin-body{display:flex;flex-direction:column}
.drv-photos-grid{display:flex;gap:8px;flex-wrap:wrap}
.drv-photos-grid>div,.drv-photos-grid>label{width:85px;height:85px}
.drv-list>*{min-width:0}
@media(min-width:600px){
  .drv-list{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .drv-photos-grid>div,.drv-photos-grid>label{width:110px;height:110px}
  .drv-ov{align-items:center!important}
  .drv-modal{border-radius:22px!important;max-height:85vh!important;margin:20px}
  .drv-detail-pad{padding:0 24px!important}
  .drv-header{padding:14px 20px 12px!important}
  .drv-admin-pad{padding:16px 24px 40px!important}
}
@media(min-width:900px){
  .drv-list{grid-template-columns:1fr 1fr 1fr}
  .drv-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
  .drv-detail-grid>.drv-full{grid-column:1/-1}
  .drv-admin-stats{grid-template-columns:repeat(4,1fr)}
  .drv-admin-body{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
  .drv-admin-body>.drv-full{grid-column:1/-1}
  .drv-photos-grid>div,.drv-photos-grid>label{width:130px;height:130px}
  .drv-detail-pad{padding:0 32px!important}
  .drv-header{padding:16px 28px 12px!important}
  .drv-admin-pad{padding:20px 32px 40px!important}
  .drv-modal{max-width:640px!important}
}
@media(min-width:1200px){
  .drv-list{grid-template-columns:repeat(4,1fr)}
  .drv-detail-pad{padding:0 48px!important}
  .drv-header{padding:16px 40px 12px!important}
  .drv-admin-pad{padding:20px 48px 40px!important}
  .drv-modal{max-width:700px!important}
}
`;document.head.appendChild(el);return()=>document.head.removeChild(el);},[]);return null;};

const P="#1B8A6B";

const S={
  ctr:{minHeight:"100vh",background:"#F7F7F8",fontFamily:"'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif",maxWidth:1400,margin:"0 auto",position:"relative",overflowX:"hidden",width:"100%"},
  loginW:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"linear-gradient(145deg,#0a2e24 0%,#0d1b2a 100%)"},
  loginB:{width:"100%",maxWidth:340,padding:28,borderRadius:24,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"},
  errB:{background:"rgba(231,76,60,.15)",color:"#E74C3C",padding:"10px 14px",borderRadius:10,fontSize:13,marginBottom:16,border:"1px solid rgba(231,76,60,.2)",textAlign:"center"},
  codeIn:{width:"100%",padding:"16px",borderRadius:14,border:"2px solid rgba(255,255,255,.15)",background:"rgba(0,0,0,.3)",color:"#fff",fontSize:24,fontWeight:800,fontFamily:"'DM Sans',monospace",textAlign:"center",letterSpacing:6,outline:"none",boxSizing:"border-box"},
  linkBtn:{display:"block",width:"100%",textAlign:"center",background:"none",border:"none",color:"#4ECDC4",fontSize:12,marginTop:16,cursor:"pointer",padding:8},
  header:{background:"linear-gradient(145deg,#0a2e24 0%,#0d1b2a 100%)",padding:"12px 14px 10px",position:"sticky",top:0,zIndex:100},
  hTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4},
  hBtn:{background:"rgba(255,255,255,.1)",border:"none",borderRadius:11,width:42,height:42,display:"flex",alignItems:"center",justifyContent:"center",color:"#4ECDC4",cursor:"pointer"},
  sub:{color:"rgba(255,255,255,.3)",fontSize:11,margin:"0 0 8px"},
  sBox:{position:"relative",marginBottom:8},
  sIcW:{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,.3)",display:"flex"},
  sIn:{width:"100%",padding:"11px 42px",borderRadius:14,border:"none",background:"rgba(255,255,255,.08)",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box"},
  clr:{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#666",cursor:"pointer",display:"flex",padding:4},
  chip:{padding:"5px 11px",borderRadius:14,border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"rgba(255,255,255,.4)",fontSize:10,fontWeight:700,cursor:"pointer"},
  chipA:{background:P,color:"#fff",borderColor:P},
  list:{padding:"6px 12px 80px",gap:4},
  loadR:{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:40,color:"#999",fontSize:13},
  empty:{display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 20px",color:"#CCC",fontSize:14,gap:6},
  sCard:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 10px",background:"#fff",borderRadius:11,border:"1px solid #EEE",cursor:"pointer",width:"100%",textAlign:"left",animation:"fadeUp .3s ease both",minWidth:0,overflow:"hidden"},
  sIcB:{width:34,height:34,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0},
  sNm:{fontSize:12,fontWeight:700,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  sAd:{fontSize:10,color:"#999",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  topBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",background:"linear-gradient(145deg,#0a2e24,#0d1b2a)"},
  backBtn:{background:"none",border:"none",color:"#4ECDC4",cursor:"pointer",display:"flex",padding:4},
  topT:{color:"#fff",fontSize:14,fontWeight:700},
  hero:{display:"flex",flexDirection:"column",alignItems:"center",padding:"16px 0 10px",gap:4},
  bigIc:{width:46,height:46,borderRadius:13,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"},
  heroN:{fontSize:17,fontWeight:800,color:"#1A1A1A",margin:0,textAlign:"center"},
  tag:{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:12},
  editAllBtn:{display:"flex",alignItems:"center",gap:5,background:"none",border:`1.5px solid ${P}`,borderRadius:9,padding:"6px 14px",fontSize:11,color:P,fontWeight:700,cursor:"pointer",marginTop:3},
  card:{background:"#fff",borderRadius:12,padding:11,marginBottom:8,border:"1px solid #F0F0F0"},
  row:{display:"flex",alignItems:"center",gap:8,padding:"4px 0",color:"#666"},
  rowT:{fontSize:12,color:"#333",flex:1},
  editG:{display:"flex",alignItems:"center",gap:4,background:"none",border:`1px solid ${P}33`,borderRadius:7,padding:"2px 8px",fontSize:10,color:P,fontWeight:700,cursor:"pointer"},
  sec:{fontSize:10,fontWeight:800,color:"#1A1A1A",margin:"0 0 8px",textTransform:"uppercase",letterSpacing:.7,display:"flex",alignItems:"center",gap:5},
  tLg:{fontSize:11,fontWeight:700,padding:"4px 11px",borderRadius:7,background:"#F0FAF7",color:P},
  navB:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"9px 5px",borderRadius:9,color:"#fff",textDecoration:"none",fontSize:11,fontWeight:700},
  dkBtn:{display:"flex",alignItems:"center",gap:5,background:"#1A1A1A",color:"#fff",border:"none",borderRadius:9,padding:"7px 14px",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:6},
  subBtn:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"12px",borderRadius:11,border:"none",background:P,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"},
  canBtn:{flex:1,padding:"11px",borderRadius:11,border:"1px solid #E0E0E0",background:"#fff",fontSize:13,fontWeight:700,color:"#666",cursor:"pointer"},
  iBtn:{background:"none",border:"none",color:"#999",cursor:"pointer",display:"flex",padding:4},
  delBtn:{display:"flex",alignItems:"center",justifyContent:"center",gap:5,width:"100%",padding:"11px",borderRadius:11,border:"1px solid #FCC",background:"#FFF5F5",color:"#E74C3C",fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:8},
  geoBtn:{display:"flex",alignItems:"center",justifyContent:"center",gap:7,width:"100%",padding:"10px",borderRadius:11,border:"2px solid #4ECDC4",background:"rgba(78,205,196,.06)",color:"#4ECDC4",fontSize:13,fontWeight:700,cursor:"pointer"},
  fg:{marginBottom:11,flex:1},
  fl:{display:"block",fontSize:10,fontWeight:700,color:"#999",marginBottom:3,textTransform:"uppercase",letterSpacing:.4},
  fi:{width:"100%",padding:"10px 11px",borderRadius:9,border:"1px solid #E8E8E8",fontSize:13,outline:"none",boxSizing:"border-box",background:"#fff",color:"#1A1A1A"},
  tBtn:{flex:1,padding:"8px",borderRadius:9,border:"2px solid #E8E8E8",background:"#fff",fontSize:11,fontWeight:700,color:"#888",cursor:"pointer"},
  tM:{borderColor:P,background:"#E8F8F5",color:P},
  tF:{borderColor:"#2E86C1",background:"#EBF5FB",color:"#2E86C1"},
  to:{padding:"5px 11px",borderRadius:7,border:"1px solid #E8E8E8",background:"#fff",fontSize:10,fontWeight:700,color:"#888",cursor:"pointer"},
  toA:{background:P,color:"#fff",borderColor:P},
  ov:{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)"},
  modal:{width:"100%",maxWidth:560,maxHeight:"90vh",background:"#fff",borderRadius:"22px 22px 0 0",display:"flex",flexDirection:"column",animation:"slideUp .3s ease"},
  ovCls:"drv-ov",
  modalCls:"drv-modal",
  mH:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px 8px",borderBottom:"1px solid #F0F0F0"},
  mB:{padding:"10px 16px",overflowY:"auto",flex:1},
  mF:{display:"flex",gap:10,padding:"10px 16px 18px",borderTop:"1px solid #F0F0F0"},
  spin:{width:16,height:16,border:"2px solid #EEE",borderTopColor:P,borderRadius:"50%",animation:"spin .6s linear infinite"},
  toast:{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1A1A1A",color:"#fff",padding:"9px 20px",borderRadius:11,fontSize:12,fontWeight:600,zIndex:2000,animation:"fadeUp .3s ease",boxShadow:"0 8px 30px rgba(0,0,0,.25)"},
  lbBtn:{background:"rgba(255,255,255,.15)",border:"none",borderRadius:22,width:44,height:44,color:"#fff",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
};

// ============================================================
// MAIN APP - Router
// ============================================================
export default function App(){
  const[auth,setAuth]=useState(null); // {code,role,name}
  const[page,setPage]=useState("home"); // home|site|editGps|admin
  const[authStep,setAuthStep]=useState("code"); // code|pin|setup_pin

  // Restore session
  useEffect(()=>{
    const saved=ls.json("drv_auth");
    if(saved&&checkSession()){setAuth(saved);touchSession();}
    else if(saved){ls.del("drv_auth");ls.del("drv_date");}
  },[]);

  const handleLogin=async(code)=>{
    try{
      const r=await dbGet("technicians",`code=eq.${code}&select=*`);
      if(r.length===0){await dbPost("login_logs",{technician_code:code,success:false});return{error:"Code inconnu"};}
      const tech=r[0];
      if(tech.active===false)return{error:"Compte désactivé"};
      // Update last_login
      try{await dbPatch("technicians",{last_login:new Date().toISOString()},`code=eq.${code}`);}catch(e){}
      await dbPost("login_logs",{technician_code:code,success:true});
      if(!tech.pin)return{needPin:true,tech};
      return{tech};
    }catch(e){return{error:"Erreur de connexion"};}
  };

  const handleAuth=(tech)=>{
    const a={code:tech.code,role:tech.role||"tech",name:tech.name||""};
    setAuth(a);ls.set("drv_auth",JSON.stringify(a));touchSession();
  };

  const logout=()=>{ls.del("drv_auth");ls.del("drv_date");setAuth(null);setPage("home");};

  if(!auth)return<div style={S.ctr}><Styles/><AuthScreen onLogin={handleLogin} onAuth={handleAuth}/></div>;

  if(page==="admin"&&auth.role==="admin")return<div style={S.ctr}><Styles/><AdminPanel auth={auth} onBack={()=>setPage("home")} logout={logout}/></div>;

  return<div style={S.ctr}><Styles/><MainApp auth={auth} page={page} setPage={setPage} logout={logout}/></div>;
}

// ============================================================
// AUTH SCREEN - Code + PIN
// ============================================================
function AuthScreen({onLogin,onAuth}){
  const[step,setStep]=useState("code"); // code|pin|setup
  const[code,setCode]=useState("");
  const[pin,setPin]=useState("");
  const[tech,setTech]=useState(null);
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");
  const ref=useRef(null);

  useEffect(()=>{ref.current?.focus();},[step]);

  const submitCode=async()=>{
    const c=code.trim().toUpperCase();if(!c)return setErr("Entrez votre code");
    setBusy(true);setErr("");
    const res=await onLogin(c);setBusy(false);
    if(res.error)return setErr(res.error);
    setTech(res.tech);
    if(res.needPin){setStep("setup");return;}
    // Has PIN — check cached hash
    const cached=ls.get(`drv_pin_${c}`);
    if(cached&&cached===res.tech.pin){onAuth(res.tech);return;}
    setStep("pin");
  };

  const submitPin=async()=>{
    if(pin.length!==4)return setErr("4 chiffres requis");
    const h=await hashPin(pin);
    // Support both hashed and legacy plain PINs
    if(isHashed(tech.pin)?h!==tech.pin:pin!==tech.pin){setErr("PIN incorrect");setPin("");return;}
    // Migrate plain PIN to hashed on successful login
    if(!isHashed(tech.pin)){try{await dbPatch("technicians",{pin:h},`code=eq.${tech.code}`);}catch(e){}}
    ls.set(`drv_pin_${tech.code}`,h);
    onAuth(tech);
  };

  const setupPin=async()=>{
    if(pin.length!==4)return setErr("4 chiffres requis");
    setBusy(true);
    try{
      const h=await hashPin(pin);
      await dbPatch("technicians",{pin:h},`code=eq.${tech.code}`);
      ls.set(`drv_pin_${tech.code}`,h);
      tech.pin=h;
      onAuth(tech);
    }catch(e){setErr("Erreur");}
    setBusy(false);
  };

  return(
    <div style={S.loginW}><div style={S.loginB}>
      <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><Logo s={1.1}/></div>

      {step==="code"&&<>
        {err&&<div style={S.errB}>{err}</div>}
        <input ref={ref} type="text" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&submitCode()} placeholder="CODE" maxLength={20} style={S.codeIn} autoComplete="off"/>
        <button style={{...S.subBtn,opacity:busy?.6:1,marginTop:16}} onClick={submitCode} disabled={busy}>{busy?"...":"Entrer"}</button>
      </>}

      {step==="pin"&&<>
        <p style={{textAlign:"center",color:"#999",fontSize:13,margin:"0 0 16px"}}>Entrez votre PIN</p>
        {err&&<div style={S.errB}>{err}</div>}
        <input ref={ref} type="password" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} onKeyDown={e=>e.key==="Enter"&&submitPin()} placeholder="● ● ● ●" maxLength={4} style={{...S.codeIn,letterSpacing:16,fontSize:28}}/>
        <button style={{...S.subBtn,marginTop:16}} onClick={submitPin}>Valider</button>
        <button style={S.linkBtn} onClick={()=>{setStep("code");setCode("");setPin("");setErr("");}}>Changer de compte</button>
      </>}

      {step==="setup"&&<>
        <p style={{textAlign:"center",color:"#4ECDC4",fontSize:13,margin:"0 0 4px",fontWeight:700}}>Première connexion</p>
        <p style={{textAlign:"center",color:"#999",fontSize:12,margin:"0 0 16px"}}>Choisissez un PIN à 4 chiffres</p>
        {err&&<div style={S.errB}>{err}</div>}
        <input ref={ref} type="password" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} onKeyDown={e=>e.key==="Enter"&&setupPin()} placeholder="● ● ● ●" maxLength={4} style={{...S.codeIn,letterSpacing:16,fontSize:28}}/>
        <button style={{...S.subBtn,marginTop:16,opacity:busy?.6:1}} onClick={setupPin} disabled={busy}>Créer mon PIN</button>
      </>}
      <p style={{textAlign:"center",color:"rgba(255,255,255,.15)",fontSize:10,marginTop:20}}>v{APP_VERSION}</p>
    </div></div>
  );
}

// ============================================================
// MAIN APP (Tech view)
// ============================================================
function MainApp({auth,page,setPage,logout}){
  const[sites,setSites]=useState([]);
  const[sel,setSel]=useState(null);
  const[q,setQ]=useState("");
  const[filt,setFilt]=useState("all");
  const[loading,setLoading]=useState(false);
  const[comments,setComments]=useState([]);
  const[nc,setNc]=useState("");
  const[photos,setPhotos]=useState([]);
  const[editing,setEditing]=useState(false);
  const[toast,setToast]=useState(null);
  const[upl,setUpl]=useState(false);
  const[favs,setFavs2]=useState(getFavs());
  const[nearby,setNearby]=useState(false);
  const[theme,setTheme]=useState(ls.get("drv_theme")||"forest");
  const[tab,setTab2]=useState("list"); // list|map
  const[weather,setWeather]=useState(null);
  const[radius,setRadius]=useState(5);
  const[lb,setLb]=useState(null);
  const[actLog,setActLog]=useState([]);
  const[sortBy,setSort]=useState("name");
  const[showAdd,setShowAdd]=useState(false);
  const[showAbout,setShowAbout]=useState(false);
  const[anfr,setAnfr]=useState([]);
  const[anfrLoading,setAnfrLoading]=useState(false);
  const pullRef=useRef(null);
  const[pulling,setPulling]=useState(false);
  const geo=useGeo();

  const flash=m=>{setToast(m);setTimeout(()=>setToast(null),2500);};

  useEffect(()=>{fetchSites();geo.start();return()=>geo.stop();},[]);

  const fetchSites=async()=>{setLoading(true);try{const d=await dbGet("sites","order=name.asc");setSites(d);ls.set("drv_cache",JSON.stringify(d));}catch(e){const c=ls.json("drv_cache");if(c){setSites(c);flash("Mode hors-ligne");}else flash("Erreur");}setLoading(false);};
  const fetchComments=async id=>{try{setComments(await dbGet("notes",`site_id=eq.${id}&order=created_at.asc`));}catch(e){setComments([]);}};
  const fetchPhotos=async id=>{try{setPhotos(await dbGet("photos",`site_id=eq.${id}&order=created_at.desc`));}catch(e){setPhotos([]);}};
  const fetchAct=async id=>{try{setActLog(await dbGet("activity_log",`site_id=eq.${id}&order=created_at.desc&limit=10`));}catch(e){setActLog([]);}};

  // Weather (#météo) - Open-Meteo free API
  const fetchWeather=async(la,ln)=>{
    if(!la||!ln||(la===0&&ln===0))return;
    try{
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation&timezone=auto`);
      const d=await r.json();
      if(d.current)setWeather(d.current);
    }catch(e){setWeather(null);}
  };

  // ANFR Open Data - fetch nearby systems (operator, generation, frequency, status)
  const fetchAnfr=async(la,ln)=>{
    if(!la||!ln||(la===0&&ln===0))return;
    setAnfrLoading(true);setAnfr([]);
    try{
      // Try multiple ANFR API endpoints (v1 classic, then d4c v1)
      const urls=[
        `https://data.anfr.fr/api/records/1.0/search/?dataset=observatoire_2g_3g_4g&geofilter.distance=${la},${ln},1500&rows=200`,
        `https://data.anfr.fr/d4c/api/records/1.0/search/?dataset=observatoire_2g_3g_4g&geofilter.distance=${la},${ln},1500&rows=200`,
      ];
      let recs=[];
      for(const url of urls){
        try{
          const r=await fetch(url);
          if(!r.ok)continue;
          const d=await r.json();
          recs=d.records||d.results||[];
          if(recs.length>0)break;
        }catch(e){continue;}
      }
      setAnfr(recs.map(r=>r.fields||r));
    }catch(e){console.log("ANFR fetch error:",e);setAnfr([]);}
    setAnfrLoading(false);
  };

  // Voice search
  const voiceSearch=()=>{
    if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)){flash("Reconnaissance vocale non disponible");return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const rec=new SR();rec.lang="fr-FR";rec.interimResults=false;
    rec.onresult=e=>{const t=e.results[0][0].transcript;setQ(t);flash(`"${t}"`);};
    rec.onerror=()=>flash("Erreur micro");
    rec.start();
  };

  // Theme config
  const themes={
    forest:{header:"linear-gradient(145deg,#0a2e24 0%,#0d1b2a 100%)",primary:"#1B8A6B",accent:"#4ECDC4",bg:"#F7F7F8",card:"#fff",text:"#1A1A1A"},
    orange:{header:"#000",primary:"#FF7900",accent:"#FF7900",bg:"#F5F5F5",card:"#fff",text:"#1A1A1A"},
    midnight:{header:"linear-gradient(145deg,#0f1729,#1a2744)",primary:"#4A90D9",accent:"#6CB4EE",bg:"#F0F4F8",card:"#fff",text:"#1A1A1A"},
    amoled:{header:"#000",primary:"#1B8A6B",accent:"#4ECDC4",bg:"#000",card:"#111",text:"#EEE"},
  };
  const th=themes[theme]||themes.forest;
  const changeTheme=t=>{setTheme(t);ls.set("drv_theme",t);};

  // Sync body background to theme to avoid side bars on wide Android screens
  useEffect(()=>{document.body.style.background=th.bg;},[th.bg]);

  // Weather icon from WMO code
  const wmoIcon=c=>{if(c<=1)return"☀️";if(c<=3)return"⛅";if(c<=49)return"🌫️";if(c<=59)return"🌧️";if(c<=69)return"🌨️";if(c<=79)return"❄️";if(c<=82)return"🌧️";if(c<=86)return"🌨️";if(c>=95)return"⛈️";return"🌤️";};
  const openSite=s=>{setSel(s);setNc("");setComments([]);setPhotos([]);setActLog([]);setEditing(false);setWeather(null);setAnfr([]);setPage("site");fetchComments(s.id);fetchPhotos(s.id);fetchAct(s.id);fetchWeather(s.lat,s.lng);
    if(s.type==="mobile")fetchAnfr(s.lat,s.lng);
    // Log visit
    try{dbPost("visits",{site_id:s.id,technician_code:auth.code});}catch(e){}};

  const addComment=async()=>{if(!nc.trim())return;try{await dbPost("notes",{site_id:sel.id,content:nc.trim(),technician_code:auth.code});logAct(sel.id,auth.code,"comment",nc.trim());setNc("");flash("Ajouté ✓");fetchComments(sel.id);}catch(e){flash("Erreur");}};

  const saveEdit=async f=>{try{await dbPatch("sites",f,`id=eq.${sel.id}`);logAct(sel.id,auth.code,"edit",JSON.stringify(f));const u={...sel,...f};setSel(u);setSites(sites.map(s=>s.id===sel.id?u:s));setEditing(false);flash("Mis à jour ✓");}catch(e){flash("Erreur");}};
  const addSite=async d=>{try{const ins=await dbPost("sites",d);logAct(ins[0]?.id,auth.code,"create",d.name);setSites([...sites,...ins]);setShowAdd(false);flash("Ajouté ✓");}catch(e){flash("Erreur");}};
  const deleteSite=async id=>{if(!confirm("Supprimer ?"))return;try{await dbDel("sites",`id=eq.${id}`);setSites(sites.filter(s=>s.id!==id));setPage("home");flash("Supprimé");}catch(e){flash("Erreur");}};

  const handlePhoto=async e=>{const f=e.target.files[0];if(!f)return;if(photos.length>=5){flash("Max 5");return;}setUpl(true);try{const url=await upPhoto(f,sel.id);await dbPost("photos",{site_id:sel.id,url,filename:f.name,technician_code:auth.code});logAct(sel.id,auth.code,"photo","upload");flash("Photo ✓");fetchPhotos(sel.id);}catch(e){flash("Erreur");}setUpl(false);e.target.value="";};
  const rmPhoto=async p=>{if(!confirm("Supprimer ?"))return;try{await delPhoto(p.url);await dbDel("photos",`id=eq.${p.id}`);fetchPhotos(sel.id);flash("Supprimée");}catch(e){flash("Erreur");}};

  const handleFav=id=>{togFav(id);setFavs2(getFavs());};

  // Filter + sort
  const list=useMemo(()=>{
    let l=sites.filter(s=>{const lq=q.toLowerCase();const mq=!lq||s.name?.toLowerCase().includes(lq)||s.address?.toLowerCase().includes(lq)||s.code_nidt?.toLowerCase().includes(lq);return mq&&(filt==="all"||s.type===filt);});
    if(nearby&&geo.p)l=l.filter(s=>{const d=dist(geo.p.lat,geo.p.lng,s.lat,s.lng);return d!==null&&d<=radius;});
    l=l.map(s=>({...s,_d:geo.p?dist(geo.p.lat,geo.p.lng,s.lat,s.lng):null,_f:favs.includes(s.id)}));
    if(sortBy==="dist")l.sort((a,b)=>(a._d||9999)-(b._d||9999));
    else l.sort((a,b)=>{if(a._f&&!b._f)return -1;if(!a._f&&b._f)return 1;return a.name.localeCompare(b.name);});
    return l;
  },[sites,q,filt,nearby,radius,geo.p,favs,sortBy]);

  // Swipe back gesture
  const swipeRef=useRef(null);
  const onSwipeStart=e=>{swipeRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY};};
  const onSwipeEnd=(e,backFn)=>{if(!swipeRef.current)return;const dx=e.changedTouches[0].clientX-swipeRef.current.x;const dy=Math.abs(e.changedTouches[0].clientY-swipeRef.current.y);swipeRef.current=null;if(dx>80&&dy<60&&e.changedTouches[0].clientX>120)backFn();};

  // ---- GPS EDIT ----
  if(page==="editGps"&&sel)return<div onTouchStart={onSwipeStart} onTouchEnd={e=>onSwipeEnd(e,()=>setPage("site"))}>
    <TopBar t="Modifier GPS" onBack={()=>setPage("site")}/>
    <div style={{padding:"0 16px 40px"}} className="drv-detail-pad">
      <h3 style={{fontSize:18,fontWeight:800,margin:"16px 0 8px",color:"#1A1A1A"}}>{sel.name}</h3>
      <GpsEditor site={sel} myPos={geo.p} onSave={(la,ln,addr)=>{const updates={lat:la,lng:ln};if(addr)updates.address=addr;saveEdit(updates).then(()=>setPage("site"));}} onCancel={()=>setPage("site")}/>
    </div>{toast&&<Toasty m={toast}/>}
  </div>;

  // ---- SITE DETAIL ----
  if(page==="site"&&sel){
    const gps=sel.lat&&sel.lng&&sel.lat!==0&&sel.lng!==0;
    const dest=gps?`${sel.lat},${sel.lng}`:encodeURIComponent(sel.address||sel.name);
    const d=geo.p&&sel.lat&&sel.lng?dist(geo.p.lat,geo.p.lng,sel.lat,sel.lng):null;
    const goBack=()=>{if(editing)setEditing(false);else{setPage("home");fetchSites();}};
    return<div onTouchStart={onSwipeStart} onTouchEnd={e=>onSwipeEnd(e,goBack)}>
      <TopBar t={editing?"Modifier":"Détail"} onBack={goBack}/>      <div style={{padding:"0 14px",overflowY:"auto"}} className="drv-detail-pad">
        {editing?<EditForm site={sel} onSave={saveEdit} onCancel={()=>setEditing(false)}/>:<>
          {/* Hero */}
          <div style={S.hero}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{...S.bigIc,background:sel.type==="mobile"?P:"#2E86C1"}}>{sel.type==="mobile"?<I.Ant/>:<I.Bld/>}</div>
              <button onClick={()=>handleFav(sel.id)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>{favs.includes(sel.id)?<I.StarF/>:<I.Star/>}</button>
            </div>
            <h2 style={S.heroN}>{sel.name}</h2>
            {sel.code_nidt&&<span style={{fontSize:12,color:"#999",fontFamily:"monospace"}}>{sel.type==="fixe"?"Tri: ":""}{sel.code_nidt}</span>}
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{...S.tag,background:sel.type==="mobile"?"#E8F8F5":"#EBF5FB",color:sel.type==="mobile"?P:"#2E86C1"}}>{sel.type==="mobile"?"Mobile":"Fixe"}</span>
              {d!==null&&d<999&&<span style={{fontSize:11,color:"#999"}}>{d<1?`${Math.round(d*1000)}m`:`${d.toFixed(1)}km`}</span>}
            </div>
            <div style={{display:"flex",gap:4,marginTop:2}}>
              <span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:gps?"#E8F8F5":"#FFF3E0",color:gps?P:"#E65100",fontWeight:700}}>{gps?"GPS ✓":"GPS —"}</span>
              {photos.length>0&&<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"#EDE7F6",color:"#5E35B1",fontWeight:700}}>{photos.length} photo{photos.length>1?"s":""}</span>}
              {comments.length>0&&<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:"#E3F2FD",color:"#1565C0",fontWeight:700}}>{comments.length} note{comments.length>1?"s":""}</span>}
            </div>
            <button style={S.editAllBtn} onClick={()=>setEditing(true)}><I.Edit/> Modifier</button>
          </div>

          {/* Address */}
          <div className="drv-detail-grid">
          <div className="drv-full"><Card><div style={S.row}><I.Pin/><span style={S.rowT}>{sel.address||"—"}</span></div>
            <div style={S.row}><I.Globe/><span style={{...S.rowT,fontFamily:"monospace",fontSize:12}}>{gps?`${(sel.lat||0).toFixed(6)}, ${(sel.lng||0).toFixed(6)}`:"Non renseigné"}</span><button style={S.editG} onClick={()=>setPage("editGps")}><I.Edit/> GPS</button></div>
          </Card></div>

          {sel.technologies?.length>0&&<Card><h3 style={S.sec}>Technologies</h3><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{sel.technologies.map(t=><span key={t} style={S.tLg}>{t}</span>)}</div></Card>}

          {/* Nav */}
          <Card><h3 style={S.sec}>Navigation {!gps&&<span style={{color:"#FFAA00",fontSize:9,fontWeight:600,textTransform:"none"}}>(adresse)</span>}</h3><div style={{display:"flex",gap:8}}>
            <a href={gps?`https://waze.com/ul?ll=${sel.lat},${sel.lng}&navigate=yes`:`https://waze.com/ul?q=${encodeURIComponent(sel.address||sel.name)}&navigate=yes`} target="_blank" rel="noopener noreferrer" style={{...S.navB,background:"#33CCFF"}}><I.Nav/> Waze</a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noopener noreferrer" style={{...S.navB,background:"#34A853"}}><I.Pin/> Maps</a>
            <a href={gps?`http://maps.apple.com/?daddr=${sel.lat},${sel.lng}`:`http://maps.apple.com/?daddr=${encodeURIComponent(sel.address||sel.name)}`} target="_blank" rel="noopener noreferrer" style={{...S.navB,background:"#555"}}><I.Pin/> Apple</a>
          </div></Card>

          {/* Weather */}
          {weather&&<Card>
            <h3 style={S.sec}>Météo sur site</h3>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:36}}>{wmoIcon(weather.weather_code)}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:22,fontWeight:800,color:"#1A1A1A"}}>{Math.round(weather.temperature_2m)}°C</div>
                <div style={{fontSize:11,color:"#999"}}>Vent {Math.round(weather.wind_speed_10m)} km/h · Humidité {weather.relative_humidity_2m}%</div>
              </div>
              {weather.precipitation>0&&<div style={{background:"#E3F2FD",borderRadius:10,padding:"6px 12px",textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:800,color:"#1565C0"}}>{weather.precipitation}mm</div>
                <div style={{fontSize:9,color:"#1565C0"}}>Précip.</div>
              </div>}
            </div>
          </Card>}


          {/* ANFR Sectors (mobile sites only) */}
          {sel.type==="mobile"&&<Card>
            <h3 style={S.sec}><I.Near/> ANFR — Secteurs antennes</h3>
            {anfrLoading?<div style={S.loadR}><div style={S.spin}/>Chargement ANFR...</div>
            :anfr.length>0?<AnfrSectors data={anfr} siteLat={sel.lat} siteLng={sel.lng}/>
            :(!sel.lat||!sel.lng||(sel.lat===0&&sel.lng===0))?<p style={{color:"#CCC",fontSize:12,textAlign:"center",padding:8}}>Renseignez le GPS pour charger les données ANFR</p>
            :<div style={{textAlign:"center",padding:8}}><p style={{color:"#CCC",fontSize:12,margin:"0 0 8px"}}>Aucune antenne ANFR trouvée à 1km</p><button onClick={()=>fetchAnfr(sel.lat,sel.lng)} style={{...S.editG,margin:"0 auto"}}>Réessayer</button></div>}
          </Card>}

          {/* Photos */}
          <div className="drv-full"><Card>
            <h3 style={S.sec}>Photos ({photos.length}/5)</h3>
            <div className="drv-photos-grid">
              {photos.map((p,i)=><div key={p.id} style={{position:"relative",borderRadius:10,overflow:"hidden",cursor:"pointer"}} onClick={()=>setLb(i)}>
                <img src={p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.6)",padding:"2px 4px",fontSize:7,color:"#fff"}}>{p.technician_code} · {new Date(p.created_at).toLocaleDateString("fr")}</div>
                <button onClick={e=>{e.stopPropagation();rmPhoto(p);}} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.6)",border:"none",borderRadius:10,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer",padding:0,fontSize:10}}>×</button>
              </div>)}
              {photos.length<5&&<label style={{borderRadius:10,border:"2px dashed #DDD",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#BBB",fontSize:10,gap:4}}>{upl?<div style={S.spin}/>:<><I.Cam/><span>Ajouter</span></>}<input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/></label>}
            </div>
          </Card></div>

          {/* Comments */}
          <div className="drv-full"><Card>
            <h3 style={S.sec}>Notes & commentaires</h3>
            <div style={{maxHeight:280,overflowY:"auto",marginBottom:8}}>
              {comments.length===0&&<p style={{color:"#CCC",fontSize:13,textAlign:"center",padding:12}}>Aucun commentaire</p>}
              {comments.map(c=><div key={c.id} style={{padding:"6px 0",borderBottom:"1px solid #F5F5F5"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                  <span style={{fontSize:11,fontWeight:700,color:P}}>{c.technician_code}</span>
                  <span style={{fontSize:10,color:"#BBB"}}>{new Date(c.created_at).toLocaleString("fr",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <p style={{fontSize:13,color:"#333",margin:0,lineHeight:1.4}}>{c.content}</p>
              </div>)}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input type="text" value={nc} onChange={e=>setNc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addComment()} placeholder="Ajouter..." style={{...S.fi,flex:1,fontSize:13}}/>
              <button onClick={addComment} style={{...S.subBtn,flex:"none",padding:"10px 14px",fontSize:13}}>OK</button>
            </div>
          </Card></div>

          {/* Activity */}
          {actLog.length>0&&<div className="drv-full"><Card>
            <h3 style={S.sec}><I.Act/> Activité</h3>
            {actLog.slice(0,5).map(a=><div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #F8F8F8",fontSize:11}}>
              <span style={{color:"#666"}}>{a.technician_code} — {a.action}</span>
              <span style={{color:"#BBB"}}>{new Date(a.created_at).toLocaleDateString("fr")}</span>
            </div>)}
          </Card></div>}

          <div className="drv-full"><button style={S.delBtn} onClick={()=>deleteSite(sel.id)}><I.Del/> Supprimer</button></div>
          </div>{/* end drv-detail-grid */}
        </>}
        <div style={{height:40}}/>
      </div>

      {lb!==null&&<div className="lb" onClick={()=>setLb(null)}>
        <button onClick={e=>{e.stopPropagation();setLb(null);}} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"#fff",fontSize:28,cursor:"pointer"}}>×</button>
        <img src={photos[lb]?.url} alt="" onClick={e=>e.stopPropagation()}/>
        <div style={{display:"flex",gap:20,marginTop:16}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setLb(Math.max(0,lb-1))} style={S.lbBtn}>‹</button>
          <span style={{color:"#999",fontSize:13}}>{lb+1}/{photos.length}</span>
          <button onClick={()=>setLb(Math.min(photos.length-1,lb+1))} style={S.lbBtn}>›</button>
        </div>
      </div>}

      {toast&&<Toasty m={toast}/>}
    </div>;
  }

  // ---- HOME ----
  // Pull to refresh
  const onTouchStart=e=>{pullRef.current=e.touches[0].clientY;};
  const onTouchEnd=e=>{if(pullRef.current&&e.changedTouches[0].clientY-pullRef.current>100&&window.scrollY===0){setPulling(true);fetchSites().then(()=>{setPulling(false);flash("Actualisé ✓");});}pullRef.current=null;};

  return<div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    {pulling&&<div style={{textAlign:"center",padding:"10px 0",background:th.header,color:th.accent,fontSize:11}}><div style={S.spin}/></div>}
    <div style={{...S.header,background:th.header}} className="drv-header">
      <div style={{...S.hTop,marginBottom:8}}>
        <Logo s={.7}/>
        <div style={{display:"flex",gap:6}}>
          <button style={{...S.hBtn,background:nearby?th.accent+"33":"rgba(255,255,255,.1)",color:th.accent}} onClick={()=>setNearby(!nearby)}><I.Near/></button>
          <button style={{...S.hBtn,color:th.accent}} onClick={fetchSites}><I.Ref/></button>
          <button style={{...S.hBtn,color:th.accent}} onClick={()=>setShowAdd(true)}><I.Plus/></button>
          {auth.role==="admin"&&<button style={{...S.hBtn,color:"#FF7900"}} onClick={()=>setPage("admin")}><I.Dash/></button>}
          <button style={{...S.hBtn,color:th.accent}} onClick={logout}><I.Out/></button>
        </div>
      </div>
      <p style={S.sub}>{list.length}{nearby?` < ${radius}km`:""} sites · {auth.code} · <button onClick={()=>setShowAbout(true)} style={{background:"none",border:"none",color:"rgba(255,255,255,.25)",fontSize:10,cursor:"pointer",padding:0}}>v{APP_VERSION}</button></p>

      {nearby&&<div style={{display:"flex",gap:6,marginBottom:8}}>
        {[1,5,10,25].map(r=><button key={r} onClick={()=>setRadius(r)} style={{...S.chip,...(radius===r?{background:th.primary,color:"#fff",borderColor:th.primary}:{}),fontSize:10,padding:"4px 10px"}}>{r}km</button>)}
        {!geo.p&&<span style={{fontSize:10,color:"#FFAA00",animation:"pulse 1.5s infinite"}}>GPS...</span>}
      </div>}

      {/* Search with voice */}
      <div style={{...S.sBox,display:"flex",gap:6}}>
        <div style={{position:"relative",flex:1}}>
          <div style={S.sIcW}><I.Search/></div>
          <input type="text" placeholder="Nom, NIDT/Trigramme, adresse..." value={q} onChange={e=>setQ(e.target.value)} style={S.sIn}/>
          {q&&<button style={S.clr} onClick={()=>setQ("")}><I.X/></button>}
        </div>
        <button onClick={voiceSearch} style={{...S.hBtn,width:42,height:42,flexShrink:0,color:th.accent}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        </button>
      </div>

      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {["all","mobile","fixe"].map(f=><button key={f} onClick={()=>setFilt(f)} style={{...S.chip,...(filt===f?{background:th.primary,color:"#fff",borderColor:th.primary}:{})}}>{f==="all"?"Tous":f==="mobile"?"Mobile":"Fixe"}</button>)}
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {[["name","A-Z"],["dist","km"]].map(([k,l])=><button key={k} onClick={()=>setSort(k)} style={{...S.chip,...(sortBy===k?{background:th.accent+"33",borderColor:th.accent,color:th.accent}:{}),fontSize:9,padding:"3px 8px"}}>{l}</button>)}
        </div>
      </div>

      {/* Theme selector */}
      <div style={{display:"flex",gap:6,marginTop:8}}>
        {[["forest","🌲"],["orange","🟠"],["midnight","🌙"],["amoled","⚫"]].map(([k,e])=>
          <button key={k} onClick={()=>changeTheme(k)} style={{width:28,height:28,borderRadius:14,border:theme===k?`2px solid ${th.accent}`:"2px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.08)",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{e}</button>
        )}
      </div>
    </div>

    {/* Tab bar: List / Map */}
    <div style={{display:"flex",background:th.card,borderBottom:`1px solid ${theme==="amoled"?"#222":"#EEE"}`,position:"sticky",top:0,zIndex:50}}>
      <button onClick={()=>setTab2("list")} style={{flex:1,padding:"10px",border:"none",background:"none",fontSize:12,fontWeight:700,color:tab==="list"?th.primary:"#999",borderBottom:tab==="list"?`2px solid ${th.primary}`:"2px solid transparent",cursor:"pointer"}}>Liste</button>
      <button onClick={()=>setTab2("map")} style={{flex:1,padding:"10px",border:"none",background:"none",fontSize:12,fontWeight:700,color:tab==="map"?th.primary:"#999",borderBottom:tab==="map"?`2px solid ${th.primary}`:"2px solid transparent",cursor:"pointer"}}>Carte</button>
    </div>

    {/* MAP VIEW */}
    {tab==="map"?<MapView sites={list} onSelect={openSite} myPos={geo.p} th={th}/>:

    /* LIST VIEW */
    <div style={{...S.list,background:th.bg}} className="drv-list">
      {loading?<div style={{...S.loadR,gridColumn:"1/-1"}}><div style={S.spin}/>Chargement...</div>
      :list.length===0?<div style={{...S.empty,gridColumn:"1/-1"}}><I.Search/><p>Aucun site</p></div>
      :list.map((s,i)=>{const gps=s.lat&&s.lng&&!(s.lat===0&&s.lng===0);
        return<button key={s.id} style={{...S.sCard,background:th.card,animationDelay:`${Math.min(i,15)*20}ms`}} onClick={()=>openSite(s)}>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
            {s._f&&<span style={{fontSize:11,flexShrink:0}}>★</span>}
            <div style={{...S.sIcB,background:s.type==="mobile"?th.primary:"#2E86C1"}}>{s.type==="mobile"?<I.Ant/>:<I.Bld/>}</div>
            <div style={{display:"flex",flexDirection:"column",gap:1,minWidth:0}}>
              <span style={{...S.sNm,color:th.text}}>{s.name}</span>
              <span style={S.sAd}>{s.code_nidt?s.code_nidt+" · ":""}{s.address||""}</span>
              <div style={{display:"flex",gap:3,marginTop:1}}>
                {!gps&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:4,background:"#FFF3E0",color:"#E65100",fontWeight:700,animation:"pulse 2s infinite"}}>GPS manquant</span>}
                {s._d!==null&&s._d<999&&<span style={{fontSize:8,color:"#999"}}>{s._d<1?`${Math.round(s._d*1000)}m`:`${s._d.toFixed(1)}km`}</span>}
              </div>
            </div>
          </div><I.Chev/>
        </button>;
      })}
    </div>}

    {showAdd&&<SiteForm title="Nouveau site" onClose={()=>setShowAdd(false)} onSave={addSite} myPos={geo.p}/>}
    {showAbout&&<AboutModal onClose={()=>setShowAbout(false)}/>}
    {toast&&<Toasty m={toast}/>}
  </div>;
}

// ============================================================
// ADMIN PANEL
// ============================================================
function AdminPanel({auth,onBack,logout}){
  const[tab,setTab]=useState("dash"); // dash|techs|sites|logs
  const[sites,setSites]=useState([]);
  const[techs,setTechs]=useState([]);
  const[visits,setVisits]=useState([]);
  const[logs,setLogs]=useState([]);
  const[activity,setActivity]=useState([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{loadAll();},[]);

  const loadAll=async()=>{
    setLoading(true);
    try{
      const[s,t,v,l,a]=await Promise.all([
        dbGet("sites","select=id,name,type,lat,lng,address,code_nidt&order=name.asc"),
        dbGet("technicians","order=code.asc"),
        dbGet("visits","order=visited_at.desc&limit=500"),
        dbGet("login_logs","order=created_at.desc&limit=100"),
        dbGet("activity_log","order=created_at.desc&limit=50"),
      ]);
      setSites(s);setTechs(t);setVisits(v);setLogs(l);setActivity(a);
    }catch(e){}
    setLoading(false);
  };

  const gpsCount=sites.filter(s=>s.lat&&s.lng&&!(s.lat===0&&s.lng===0)).length;
  const thisMonth=visits.filter(v=>{const d=new Date(v.visited_at);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();});

  // Visits per day (last 7 days)
  const last7=useMemo(()=>{
    const days=[];const now=new Date();
    for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);days.push({date:d.toLocaleDateString("fr",{weekday:"short",day:"numeric"}),count:visits.filter(v=>{const vd=new Date(v.visited_at);return vd.toDateString()===d.toDateString();}).length});}
    return days;
  },[visits]);

  // Top techs
  const topTechs=useMemo(()=>{
    const map={};thisMonth.forEach(v=>{map[v.technician_code]=(map[v.technician_code]||0)+1;});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
  },[thisMonth]);

  const maxBar=Math.max(...last7.map(d=>d.count),1);

  if(loading)return<><TopBar t="Admin" onBack={onBack}/><div style={S.loadR}><div style={S.spin}/>Chargement...</div></>;

  return<>
    <TopBar t="Admin" onBack={onBack}/>

    {/* Tab bar */}
    <div style={{display:"flex",background:"#fff",borderBottom:"1px solid #EEE",position:"sticky",top:48,zIndex:50}}>
      {[["dash","Dashboard"],["techs","Techniciens"],["sites","Sites"],["logs","Logs"],["backup","Backup"]].map(([k,l])=>
        <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"10px 0",border:"none",background:"none",fontSize:12,fontWeight:700,color:tab===k?P:"#999",borderBottom:tab===k?`2px solid ${P}`:"2px solid transparent",cursor:"pointer"}}>{l}</button>
      )}
    </div>

    <div style={{padding:"12px 14px 40px"}} className="drv-admin-pad">

      {/* DASHBOARD */}
      {tab==="dash"&&<>
        {/* Stat cards */}
        <div className="drv-admin-stats" style={{marginBottom:12}}>
          {[[sites.length,"Sites total","#E8F8F5",P],[gpsCount,"GPS renseignés","#E3F2FD","#1565C0"],[thisMonth.length,"Visites ce mois","#FFF3E0","#E65100"],[techs.filter(t=>t.active!==false).length,"Techniciens actifs","#EDE7F6","#5E35B1"]].map(([val,label,bg,color],i)=>
            <div key={i} style={{background:bg,borderRadius:12,padding:"14px 12px",textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:800,color,animation:"countUp .5s ease",animationDelay:`${i*100}ms`,animationFillMode:"both"}}>{val}</div>
              <div style={{fontSize:10,color,fontWeight:600,marginTop:2}}>{label}</div>
            </div>
          )}
        </div>

        <div className="drv-admin-body">
        {/* GPS progress bar (#6) */}
        <div className="drv-full"><Card>
          <h3 style={S.sec}>Complétion GPS</h3>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
            <span style={{color:"#666"}}>{gpsCount}/{sites.length} sites</span>
            <span style={{fontWeight:700,color:P}}>{sites.length?Math.round(gpsCount/sites.length*100):0}%</span>
          </div>
          <div style={{height:10,borderRadius:5,background:"#E8E8E8",overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:5,background:`linear-gradient(90deg,${P},#4ECDC4)`,width:`${sites.length?gpsCount/sites.length*100:0}%`,transition:"width 1s ease"}}/>
          </div>
        </Card></div>

        {/* Activity chart (#3) */}
        <Card>
          <h3 style={S.sec}>Activité 7 jours</h3>
          <div style={{display:"flex",alignItems:"flex-end",gap:6,height:100}}>
            {last7.map((d,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <span style={{fontSize:10,fontWeight:700,color:P}}>{d.count||""}</span>
              <div style={{width:"100%",borderRadius:4,background:d.count>0?P:"#E8E8E8",height:`${Math.max(d.count/maxBar*70,4)}px`,transition:"height .5s ease"}}/>
              <span style={{fontSize:8,color:"#999"}}>{d.date}</span>
            </div>)}
          </div>
        </Card>

        {/* Type chart (#4) */}
        <Card>
          <h3 style={S.sec}>Répartition</h3>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <div style={{width:80,height:80,borderRadius:40,background:`conic-gradient(${P} 0% ${sites.length?sites.filter(s=>s.type==="mobile").length/sites.length*100:50}%, #2E86C1 ${sites.length?sites.filter(s=>s.type==="mobile").length/sites.length*100:50}% 100%)`,position:"relative"}}>
              <div style={{position:"absolute",inset:12,borderRadius:40,background:"#fff"}}/>
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:P}}/><span style={{fontSize:12}}>{sites.filter(s=>s.type==="mobile").length} Mobile</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:"#2E86C1"}}/><span style={{fontSize:12}}>{sites.filter(s=>s.type==="fixe").length} Fixe</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Top techs (#5) */}
        <Card>
          <h3 style={S.sec}>Top techniciens ce mois</h3>
          {topTechs.length===0?<p style={{color:"#CCC",fontSize:13}}>Aucune visite</p>:
          topTechs.map(([code,count],i)=><div key={code} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid #F5F5F5"}}>
            <span style={{width:20,height:20,borderRadius:10,background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#E8E8E8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:i<3?"#fff":"#999"}}>{i+1}</span>
            <span style={{flex:1,fontSize:13,fontWeight:600}}>{code}</span>
            <span style={{fontSize:13,fontWeight:700,color:P}}>{count} visites</span>
          </div>)}
        </Card>

        {/* Live timeline (#7) */}
        <div className="drv-full"><Card>
          <h3 style={S.sec}><I.Act/> Activité récente</h3>
          {activity.slice(0,10).map(a=><div key={a.id} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid #F8F8F8",fontSize:11}}>
            <span style={{fontWeight:700,color:P,flexShrink:0}}>{a.technician_code}</span>
            <span style={{color:"#666",flex:1}}>{a.action}{a.details?` — ${a.details.slice(0,30)}`:""}</span>
            <span style={{color:"#BBB",flexShrink:0}}>{new Date(a.created_at).toLocaleString("fr",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
          </div>)}
        </Card></div>
        </div>{/* end drv-admin-body */}
      </>}

      {/* TECHNICIENS */}
      {tab==="techs"&&<TechsAdmin techs={techs} reload={loadAll}/>}

      {/* SITES TABLE */}
      {tab==="sites"&&<SitesAdmin sites={sites} reload={loadAll}/>}

      {/* LOGS */}
      {tab==="logs"&&<>
        <Card>
          <h3 style={S.sec}><I.Shield/> Connexions récentes</h3>
          {logs.map(l=><div key={l.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #F8F8F8",fontSize:11}}>
            <span style={{fontWeight:600,color:l.success?P:"#E74C3C"}}>{l.technician_code||"?"}</span>
            <span style={{color:l.success?"#999":"#E74C3C"}}>{l.success?"✓":"✗"} {new Date(l.created_at).toLocaleString("fr",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
          </div>)}
        </Card>
      </>}

      {/* BACKUP */}
      {tab==="backup"&&<BackupPanel/>}
    </div>
  </>;
}

// ============================================================
// BACKUP PANEL
// ============================================================
const BACKUP_TABLES=["sites","technicians","notes","photos","activity_log","visits","login_logs"];

function BackupPanel(){
  const[busy,setBusy]=useState(false);
  const[status,setStatus]=useState(null);
  const[counts,setCounts]=useState({});
  const[restoring,setRestoring]=useState(false);

  useEffect(()=>{loadCounts();},[]);

  const loadCounts=async()=>{
    const c={};
    for(const t of BACKUP_TABLES){
      try{const r=await dbGet(t,"select=id&limit=1&order=id.desc");c[t]=r.length>0?"✓":"vide";}catch(e){c[t]="?";}
    }
    // Get actual counts
    for(const t of BACKUP_TABLES){
      try{
        const r=await fetch(`${SB}/rest/v1/${t}?select=id`,{headers:{...H,Accept:"application/json",Prefer:"count=exact","Range":"0-0"}});
        const ct=r.headers.get("content-range");
        if(ct){const m=ct.match(/\/(\d+)/);if(m)c[t]=parseInt(m[1]);}
      }catch(e){}
    }
    setCounts(c);
  };

  // Export all tables as single JSON
  const exportAll=async(includeApp=true)=>{
    setBusy(true);setStatus("Export en cours...");
    try{
      const backup={_meta:{version:APP_VERSION,date:new Date().toISOString(),type:"full"},tables:{}};
      for(const t of BACKUP_TABLES){
        setStatus(`Export ${t}...`);
        try{
          // Paginate to get all records (Supabase returns max 1000 per request)
          let all=[];let offset=0;const PAGE=1000;
          while(true){
            const r=await dbGet(t,`select=*&order=id.asc&offset=${offset}&limit=${PAGE}`);
            all=[...all,...r];
            if(r.length<PAGE)break;
            offset+=PAGE;
          }
          backup.tables[t]=all;
        }catch(e){backup.tables[t]=[];}
      }
      // Include app source code
      if(includeApp){
        setStatus("Export code source...");
        try{
          // Fetch the app's own source from the hosting origin
          const appUrls=["drive.jsx","index.html","index.jsx","main.jsx","App.jsx"];
          backup.app_source={};
          for(const f of appUrls){
            try{
              const r=await fetch(`${window.location.origin}/${f}`);
              if(r.ok&&r.headers.get("content-type")?.includes("text")||r.headers.get("content-type")?.includes("javascript")){
                backup.app_source[f]=await r.text();
              }
            }catch(e){}
          }
          // Fallback: embed current component source via document scripts
          if(Object.keys(backup.app_source).length===0){
            // Grab all script/module tags from DOM as fallback
            const scripts=document.querySelectorAll('script[src]');
            for(const s of scripts){
              try{
                const r=await fetch(s.src);
                if(r.ok){const name=s.src.split("/").pop().split("?")[0];backup.app_source[name]=await r.text();}
              }catch(e){}
            }
          }
        }catch(e){backup.app_source={_error:"Could not capture source"};}
      }
      const json=JSON.stringify(backup,null,2);
      const blob=new Blob([json],{type:"application/json"});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=`drive-backup-full-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      const totalRows=Object.values(backup.tables).reduce((s,t)=>s+t.length,0);
      const appFiles=backup.app_source?Object.keys(backup.app_source).filter(k=>!k.startsWith("_")).length:0;
      setStatus(`✓ Export terminé — ${BACKUP_TABLES.length} tables, ${totalRows.toLocaleString()} enregistrements${appFiles?`, ${appFiles} fichier${appFiles>1?"s":""} source`:""}`);
    }catch(e){setStatus("Erreur: "+e.message);}
    setBusy(false);
  };

  // Export app source code as standalone zip-like download
  const exportAppSource=async()=>{
    setBusy(true);setStatus("Téléchargement du code source...");
    try{
      const files={};
      // Try fetching common filenames from origin
      const candidates=["drive.jsx","index.html","index.jsx","main.jsx","App.jsx","style.css","package.json","vite.config.js"];
      for(const f of candidates){
        try{
          const r=await fetch(`${window.location.origin}/${f}`);
          if(r.ok){const ct=r.headers.get("content-type")||"";if(ct.includes("text")||ct.includes("javascript")||ct.includes("json")||ct.includes("css")){files[f]=await r.text();}}
        }catch(e){}
      }
      // Also grab all script modules from DOM
      const scripts=document.querySelectorAll('script[src]');
      for(const s of scripts){
        try{const r=await fetch(s.src);if(r.ok){const name=s.src.split("/").pop().split("?")[0];if(!files[name])files[name]=await r.text();}}catch(e){}
      }
      if(Object.keys(files).length===0){setStatus("Aucun fichier source trouvé à l'origine");setBusy(false);return;}
      // Download each file
      for(const[name,content] of Object.entries(files)){
        const blob=new Blob([content],{type:"text/plain"});
        const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
        await new Promise(r=>setTimeout(r,300)); // Petit délai entre téléchargements
      }
      setStatus(`✓ ${Object.keys(files).length} fichier(s) source téléchargé(s): ${Object.keys(files).join(", ")}`);
    }catch(e){setStatus("Erreur: "+e.message);}
    setBusy(false);
  };

  // Export single table as CSV
  const exportCSV=async(table)=>{
    try{
      let all=[];let offset=0;
      while(true){
        const r=await dbGet(table,`select=*&order=id.asc&offset=${offset}&limit=1000`);
        all=[...all,...r];if(r.length<1000)break;offset+=1000;
      }
      if(all.length===0)return;
      const keys=Object.keys(all[0]);
      const csv=[keys.join(";"),...all.map(r=>keys.map(k=>{const v=r[k];return typeof v==="object"?JSON.stringify(v):String(v??"").replace(/;/g,",");}).join(";"))].join("\n");
      const blob=new Blob([csv],{type:"text/csv"});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`drive-${table}-${new Date().toISOString().slice(0,10)}.csv`;a.click();
    }catch(e){}
  };

  // Restore from JSON backup
  const handleRestore=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    if(!confirm("⚠️ Restaurer va ÉCRASER les données existantes. Continuer ?"))return;
    setRestoring(true);setStatus("Lecture du fichier...");
    try{
      const text=await file.text();
      const backup=JSON.parse(text);
      if(!backup.tables||!backup._meta){throw new Error("Format de backup invalide");}
      for(const t of BACKUP_TABLES){
        if(!backup.tables[t]||backup.tables[t].length===0)continue;
        setStatus(`Restauration ${t} (${backup.tables[t].length} lignes)...`);
        // Upsert in batches of 200
        const rows=backup.tables[t];
        for(let i=0;i<rows.length;i+=200){
          const batch=rows.slice(i,i+200);
          await fetch(`${SB}/rest/v1/${t}`,{method:"POST",headers:{...H,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(batch)});
        }
      }
      setStatus(`✓ Restauration terminée — ${backup._meta.date}`);
      loadCounts();
    }catch(e){setStatus("Erreur: "+e.message);}
    setRestoring(false);e.target.value="";
  };

  return<>
    <Card>
      <h3 style={S.sec}><I.DL/> Sauvegarde complète</h3>
      <p style={{fontSize:12,color:"#666",margin:"0 0 12px",lineHeight:1.5}}>Exporte toutes les tables + le code source de l'application en un fichier JSON unique.</p>
      <button onClick={()=>exportAll(true)} disabled={busy} style={{...S.subBtn,opacity:busy?.6:1,width:"100%"}}>{busy?<><div style={S.spin}/> {status}</>:<><I.DL/> Exporter tout (BDD + App)</>}</button>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <button onClick={()=>exportAll(false)} disabled={busy} style={{...S.canBtn,fontSize:11,flex:1}}>BDD seule</button>
        <button onClick={exportAppSource} disabled={busy} style={{...S.canBtn,fontSize:11,flex:1,color:P,borderColor:P+"55"}}>Code source seul</button>
      </div>
      {status&&!busy&&<p style={{fontSize:11,color:status.startsWith("✓")?P:"#E74C3C",marginTop:8,textAlign:"center"}}>{status}</p>}
    </Card>

    <Card>
      <h3 style={S.sec}><I.Bar/> Tables individuelles</h3>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {BACKUP_TABLES.map(t=><div key={t} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #F5F5F5"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,fontWeight:600}}>{t}</span>
            <span style={{fontSize:10,color:"#999",fontFamily:"monospace"}}>{typeof counts[t]==="number"?counts[t].toLocaleString()+" lignes":counts[t]||"..."}</span>
          </div>
          <button onClick={()=>exportCSV(t)} style={{...S.editG,fontSize:9}}><I.DL/> CSV</button>
        </div>)}
      </div>
    </Card>

    <Card>
      <h3 style={S.sec}><I.Up/> Restaurer</h3>
      <p style={{fontSize:11,color:"#999",margin:"0 0 8px",lineHeight:1.4}}>Restaure depuis un fichier JSON exporté précédemment. Les données existantes seront fusionnées (upsert par ID).</p>
      <label style={{...S.geoBtn,cursor:"pointer",opacity:restoring?.6:1}}>
        {restoring?<><div style={S.spin}/> {status}</>:<><I.Up/> Charger un backup JSON</>}
        <input type="file" accept=".json" onChange={handleRestore} disabled={restoring} style={{display:"none"}}/>
      </label>
      {status&&restoring===false&&status.startsWith("✓")&&<p style={{fontSize:11,color:P,marginTop:8,textAlign:"center"}}>{status}</p>}
    </Card>

    <Card>
      <h3 style={S.sec}><I.Set/> Backup automatique</h3>
      <p style={{fontSize:12,color:"#666",margin:"0 0 8px",lineHeight:1.5}}>Pour un backup automatique quotidien, configure le GitHub Actions workflow fourni. Il exporte toutes les tables + le code source et commit dans un repo privé.</p>
      <div style={{background:"#F7F7F8",borderRadius:10,padding:"10px 12px",fontSize:11,fontFamily:"monospace",color:"#555",lineHeight:1.6,overflowX:"auto",whiteSpace:"pre"}}>
{`# .github/workflows/backup.yml
name: DRIVE Backup
on:
  schedule:
    - cron: '0 2 * * *'  # 2h du matin
  workflow_dispatch:       # + bouton manuel
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Backup app source
        run: |
          mkdir -p backups/app-source
          cp *.jsx *.html *.css *.json \\
            backups/app-source/ 2>/dev/null || true
      - name: Export tables
        env:
          SB_URL: \${{ secrets.SUPABASE_URL }}
          SB_KEY: \${{ secrets.SUPABASE_KEY }}
        run: |
          mkdir -p backups/db
          for T in sites technicians notes \\
            photos activity_log visits login_logs
          do
            curl -s "\$SB_URL/rest/v1/\$T?select=*" \\
              -H "apikey: \$SB_KEY" \\
              -H "Authorization: Bearer \$SB_KEY" \\
              > "backups/db/\$T.json"
          done
      - name: Commit backup
        run: |
          git config user.name "backup-bot"
          git config user.email "bot@drive.app"
          git add backups/
          git commit -m "backup \$(date +%F)" || true
          git push`}
      </div>
      <p style={{fontSize:10,color:"#BBB",margin:"8px 0 0",lineHeight:1.4}}>Ajoute SUPABASE_URL et SUPABASE_KEY dans les secrets du repo GitHub. Le workflow tourne chaque nuit à 2h et peut être déclenché manuellement.</p>
    </Card>
  </>;
}

// ============================================================
// ADMIN SUB-PANELS
// ============================================================
function TechsAdmin({techs,reload}){
  const[nc,setNc]=useState("");
  const[nn,setNn]=useState("");
  const[nr,setNr]=useState("tech");
  const[toast,setToast]=useState(null);
  const flash=m=>{setToast(m);setTimeout(()=>setToast(null),2500);};

  const add=async()=>{if(!nc.trim())return;try{await dbPost("technicians",{code:nc.trim().toUpperCase(),name:nn.trim(),role:nr});setNc("");setNn("");flash("Ajouté ✓");reload();}catch(e){flash("Erreur (code existant ?)");}};
  const toggle=async(t)=>{try{await dbPatch("technicians",{active:!t.active},`id=eq.${t.id}`);reload();}catch(e){}};
  const del=async(t)=>{if(!confirm(`Supprimer ${t.code} ?`))return;try{await dbDel("technicians",`id=eq.${t.id}`);reload();}catch(e){}};
  const resetPin=async(t)=>{if(!confirm(`Réinitialiser le PIN de ${t.code} ? Il devra en créer un nouveau à la prochaine connexion.`))return;try{await dbPatch("technicians",{pin:null},`id=eq.${t.id}`);flash(`PIN de ${t.code} réinitialisé`);reload();}catch(e){flash("Erreur");}};

  return<>
    <Card>
      <h3 style={S.sec}>Créer un profil</h3>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input type="text" placeholder="CODE" value={nc} onChange={e=>setNc(e.target.value.toUpperCase())} style={{...S.fi,flex:1}} maxLength={20}/>
        <input type="text" placeholder="Nom" value={nn} onChange={e=>setNn(e.target.value)} style={{...S.fi,flex:1}}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        {["tech","admin"].map(r=><button key={r} onClick={()=>setNr(r)} style={{...S.chip,...(nr===r?S.chipA:{}),flex:1,textAlign:"center"}}>{r==="admin"?"Admin":"Technicien"}</button>)}
      </div>
      <button onClick={add} style={{...S.subBtn,width:"100%"}}><I.Plus/> Créer le profil</button>
    </Card>

    <Card>
      <h3 style={S.sec}>{techs.length} techniciens</h3>
      {techs.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #F5F5F5",opacity:t.active===false?.5:1}}>
        <div style={{width:8,height:8,borderRadius:4,background:t.active===false?"#CCC":P,flexShrink:0}}/>
        <div style={{flex:1}}>
          <span style={{fontWeight:700,fontSize:13}}>{t.code}</span>
          {t.name&&<span style={{color:"#999",fontSize:11,marginLeft:6}}>{t.name}</span>}
          <span style={{fontSize:9,color:t.role==="admin"?"#FF7900":"#999",marginLeft:6,fontWeight:700}}>{t.role}</span>
        </div>
        <span style={{fontSize:9,color:"#BBB"}}>{t.last_login?new Date(t.last_login).toLocaleDateString("fr"):""}</span>
        {t.pin&&<button onClick={()=>resetPin(t)} style={{background:"none",border:"none",fontSize:9,color:"#999",cursor:"pointer",fontWeight:600}} title="Reset PIN">PIN ↺</button>}
        <button onClick={()=>toggle(t)} style={{background:"none",border:"none",fontSize:10,color:t.active===false?P:"#FFAA00",cursor:"pointer",fontWeight:700}}>{t.active===false?"Activer":"Désact."}</button>
        <button onClick={()=>del(t)} style={{background:"none",border:"none",color:"#E74C3C",cursor:"pointer",padding:2}}><I.Trash/></button>
      </div>)}
    </Card>
    {toast&&<Toasty m={toast}/>}
  </>;
}

function SitesAdmin({sites,reload}){
  const[q,setQ]=useState("");
  const[filt,setFilt]=useState("all"); // all|nogps|mobile|fixe
  const filtered=sites.filter(s=>{
    const mq=!q||s.name?.toLowerCase().includes(q.toLowerCase())||s.code_nidt?.toLowerCase().includes(q.toLowerCase());
    if(filt==="nogps")return mq&&(!s.lat||!s.lng||(s.lat===0&&s.lng===0));
    if(filt==="mobile")return mq&&s.type==="mobile";
    if(filt==="fixe")return mq&&s.type==="fixe";
    return mq;
  });
  const nogps=sites.filter(s=>!s.lat||!s.lng||(s.lat===0&&s.lng===0)).length;

  // Export CSV
  const exportCSV=()=>{
    const hdr="name;code_nidt;type;lat;lng;address\n";
    const rows=sites.map(s=>`${s.name};${s.code_nidt||""};${s.type};${s.lat||0};${s.lng||0};${(s.address||"").replace(/;/g,",")}`).join("\n");
    const blob=new Blob([hdr+rows],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="drive-sites.csv";a.click();
  };

  return<>
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <input type="text" placeholder="Rechercher..." value={q} onChange={e=>setQ(e.target.value)} style={{...S.fi,flex:1,fontSize:12}}/>
      <button onClick={exportCSV} style={{...S.hBtn,background:P,color:"#fff",width:"auto",padding:"0 12px",borderRadius:8}}><I.DL/></button>
    </div>
    <div style={{display:"flex",gap:5,marginBottom:10}}>
      {[["all",`Tous (${sites.length})`],["nogps",`Sans GPS (${nogps})`],["mobile","Mobile"],["fixe","Fixe"]].map(([k,l])=>
        <button key={k} onClick={()=>setFilt(k)} style={{...S.chip,...(filt===k?S.chipA:{}),fontSize:10,padding:"3px 8px"}}>{l}</button>
      )}
    </div>
    <p style={{fontSize:11,color:"#999",marginBottom:8}}>{filtered.length} résultats</p>
    <div style={{maxHeight:400,overflowY:"auto"}}>
      {filtered.slice(0,100).map(s=>{
        const gps=s.lat&&s.lng&&!(s.lat===0&&s.lng===0);
        return<div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderBottom:"1px solid #F5F5F5",fontSize:11}}>
          <div style={{width:6,height:6,borderRadius:3,background:gps?P:"#E65100",flexShrink:0}}/>
          <span style={{fontWeight:600,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</span>
          <span style={{color:"#999",fontFamily:"monospace",fontSize:9}}>{s.code_nidt||""}</span>
          <span style={{fontSize:9,color:s.type==="mobile"?P:"#2E86C1",fontWeight:700}}>{s.type}</span>
        </div>;
      })}
      {filtered.length>100&&<p style={{color:"#999",fontSize:11,textAlign:"center",padding:8}}>... et {filtered.length-100} de plus</p>}
    </div>
  </>;
}

// ============================================================
// SHARED COMPONENTS
// ============================================================
// ============================================================
// INTERACTIVE MAP COMPONENT (Leaflet)
// Full touch: click to place, pinch zoom, rotate, address search
// ============================================================
function InteractiveMap({lat,lng,onLatLngChange,onAddressChange,myPos,height=300}){
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const markerRef=useRef(null);
  const layersRef=useRef({});
  const[search,setSearch]=useState("");
  const[searching,setSearching]=useState(false);
  const[sat,setSat]=useState(false);

  // Keep callbacks in refs to avoid stale closures in Leaflet event handlers
  const onLatLngChangeRef=useRef(onLatLngChange);
  const onAddressChangeRef=useRef(onAddressChange);
  useEffect(()=>{onLatLngChangeRef.current=onLatLngChange;},[onLatLngChange]);
  useEffect(()=>{onAddressChangeRef.current=onAddressChange;},[onAddressChange]);

  // Reverse geocode: get address from coordinates
  const reverseTimer=useRef(null);
  const reverseGeocode=async(la,ln)=>{
    if(!onAddressChangeRef.current)return;
    // Debounce 500ms to avoid spamming Nominatim
    if(reverseTimer.current)clearTimeout(reverseTimer.current);
    reverseTimer.current=setTimeout(async()=>{
      try{
        const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${ln}&zoom=18&addressdetails=1`,{
          headers:{"Accept":"application/json","Accept-Language":"fr"}
        });
        if(!r.ok)return;
        const d=await r.json();
        if(d&&d.address){
          const a=d.address;
          let parts=[];
          if(a.house_number&&a.road)parts.push(`${a.house_number} ${a.road}`);
          else if(a.road)parts.push(a.road);
          else if(a.hamlet)parts.push(a.hamlet);
          const ville=a.city||a.town||a.village||a.municipality||a.county||"";
          const cp=a.postcode||"";
          if(cp||ville)parts.push(`${cp} ${ville}`.trim());
          const addr=parts.join(", ")||d.display_name?.split(",").slice(0,3).join(",").trim()||"";
          if(addr)onAddressChangeRef.current(addr);
        }
      }catch(e){console.log("Reverse geocode error:",e);}
    },500);
  };

  // Handle map click or drag — update coords + reverse geocode
  const handleNewPos=(la,ln)=>{
    onLatLngChangeRef.current(la,ln);
    reverseGeocode(la,ln);
  };

  // Init map
  useEffect(()=>{
    if(mapInst.current)return;
    if(!document.getElementById("leaflet-css")){
      const link=document.createElement("link");link.id="leaflet-css";link.rel="stylesheet";
      link.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }
    const loadLeaflet=()=>{
      if(window.L)return initMap();
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload=()=>initMap();
      document.head.appendChild(s);
    };
    const initMap=()=>{
      if(!mapRef.current||mapInst.current)return;
      const L=window.L;
      const initLat=lat||47.75;const initLng=lng||7.34;
      const map=L.map(mapRef.current,{zoomControl:true,attributionControl:false}).setView([initLat,initLng],lat?15:10);

      // Two tile layers: street + satellite
      const street=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19});
      const satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19});
      street.addTo(map);
      layersRef.current={street,satellite,current:"street"};

      const icon=L.divIcon({className:"",html:`<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center"><svg width="32" height="32" viewBox="0 0 24 24"><path d="M12 0C7.6 0 4 3.6 4 8c0 6 8 16 8 16s8-10 8-16c0-4.4-3.6-8-8-8z" fill="#FF7900" stroke="#fff" stroke-width="1"/><circle cx="12" cy="8" r="3.5" fill="#fff"/></svg></div>`,iconSize:[32,32],iconAnchor:[16,32]});

      const marker=L.marker([initLat,initLng],{icon,draggable:true}).addTo(map);
      marker.on("dragend",()=>{const p=marker.getLatLng();handleNewPos(+p.lat.toFixed(6),+p.lng.toFixed(6));});

      map.on("click",e=>{marker.setLatLng(e.latlng);handleNewPos(+e.latlng.lat.toFixed(6),+e.latlng.lng.toFixed(6));});

      if(myPos){
        L.circleMarker([myPos.lat,myPos.lng],{radius:8,color:"#4ECDC4",fillColor:"#4ECDC4",fillOpacity:.6,weight:2}).addTo(map);
      }

      mapInst.current=map;
      markerRef.current=marker;
    };
    loadLeaflet();
    return()=>{if(mapInst.current){mapInst.current.remove();mapInst.current=null;}};
  },[]);

  // Update marker when lat/lng change externally
  useEffect(()=>{
    if(markerRef.current&&mapInst.current&&lat&&lng){
      markerRef.current.setLatLng([lat,lng]);
      mapInst.current.setView([lat,lng],mapInst.current.getZoom());
    }
  },[lat,lng]);

  // Toggle satellite
  const toggleSat=()=>{
    if(!mapInst.current||!layersRef.current.street)return;
    const L=window.L;
    if(layersRef.current.current==="street"){
      mapInst.current.removeLayer(layersRef.current.street);
      layersRef.current.satellite.addTo(mapInst.current);
      layersRef.current.current="satellite";
      setSat(true);
    }else{
      mapInst.current.removeLayer(layersRef.current.satellite);
      layersRef.current.street.addTo(mapInst.current);
      layersRef.current.current="street";
      setSat(false);
    }
  };

  // Address search
  const searchAddr=async()=>{
    if(!search.trim())return;
    setSearching(true);
    try{
      const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(search)}&limit=1&countrycodes=fr`,{headers:{"Accept":"application/json","Accept-Language":"fr"}});
      const d=await r.json();
      if(d.length>0){
        const newLat=+parseFloat(d[0].lat).toFixed(6);
        const newLng=+parseFloat(d[0].lon).toFixed(6);
        handleNewPos(newLat,newLng);
        if(mapInst.current){
          mapInst.current.setView([newLat,newLng],16);
          if(markerRef.current)markerRef.current.setLatLng([newLat,newLng]);
        }
      }
    }catch(e){}
    setSearching(false);
  };

  return<div style={{marginBottom:12}}>
    {/* Search bar */}
    <div style={{display:"flex",gap:6,marginBottom:8}}>
      <input type="text" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&searchAddr()} placeholder="Chercher une adresse, ville..." style={{...S.fi,flex:1,fontSize:12,padding:"8px 10px"}}/>
      <button onClick={searchAddr} disabled={searching} style={{background:P,color:"#fff",border:"none",borderRadius:9,padding:"0 12px",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
        {searching?<div style={S.spin}/>:<I.Search/>}
      </button>
    </div>
    {/* Map container */}
    <div style={{position:"relative"}}>
      <div ref={mapRef} style={{height,borderRadius:14,overflow:"hidden",border:"1px solid #E0E0E0",background:"#f0f0f0"}}/>
      {/* Satellite toggle */}
      <button onClick={toggleSat} style={{position:"absolute",top:10,right:10,zIndex:1000,background:sat?"#FF7900":"rgba(255,255,255,.9)",border:sat?"none":"1px solid #DDD",borderRadius:8,padding:"6px 10px",fontSize:10,fontWeight:700,color:sat?"#fff":"#333",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.15)",display:"flex",alignItems:"center",gap:4}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10"/><path d="M12 2a15 15 0 0 0-4 10 15 15 0 0 0 4 10"/><path d="M2 12h20"/></svg>
        {sat?"Plan":"Satellite"}
      </button>
    </div>
    <p style={{fontSize:9,color:"#BBB",marginTop:4}}>Touchez pour placer · Glissez le marqueur · L'adresse se remplit auto</p>
  </div>;
}

function GpsEditor({site,myPos,onSave,onCancel,onAddressChange}){
  const[lat,setLat]=useState(site.lat||0);
  const[lng,setLng]=useState(site.lng||0);
  const[addr,setAddr]=useState(site.address||"");
  const[locating,setLoc]=useState(false);

  const getPos=()=>{if(!navigator.geolocation)return;setLoc(true);navigator.geolocation.getCurrentPosition(p=>{setLat(+p.coords.latitude.toFixed(6));setLng(+p.coords.longitude.toFixed(6));setLoc(false);},()=>setLoc(false),{enableHighAccuracy:true,timeout:10000});};

  return<>
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <button onClick={getPos} disabled={locating} style={{...S.geoBtn,flex:1}}>{locating?<div style={S.spin}/>:<I.Locate/>} Ma position</button>
      {myPos&&<button onClick={()=>{setLat(+myPos.lat.toFixed(6));setLng(+myPos.lng.toFixed(6));}} style={{...S.geoBtn,flex:1,borderColor:"#FF7900",color:"#FF7900",background:"rgba(255,121,0,.06)"}}><I.Pin/> Suivi GPS</button>}
    </div>

    <InteractiveMap lat={lat} lng={lng} onLatLngChange={(a,n)=>{setLat(a);setLng(n);}} onAddressChange={a=>setAddr(a)} myPos={myPos} height={280}/>

    {addr&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"#F8FFF8",borderRadius:9,marginBottom:10,border:"1px solid #E0F0E0"}}>
      <I.Pin/><span style={{fontSize:12,color:"#333",flex:1}}>{addr}</span>
    </div>}

    <div style={{display:"flex",gap:10,marginBottom:14}}>
      <div style={S.fg}><label style={S.fl}>Lat</label><input type="number" step="0.000001" value={lat} onChange={e=>setLat(+(e.target.value)||0)} style={S.fi}/></div>
      <div style={S.fg}><label style={S.fl}>Lng</label><input type="number" step="0.000001" value={lng} onChange={e=>setLng(+(e.target.value)||0)} style={S.fi}/></div>
    </div>
    <div style={{display:"flex",gap:10}}>
      <button style={S.canBtn} onClick={onCancel}>Annuler</button>
      <button style={{...S.subBtn,flex:2}} onClick={()=>onSave(lat,lng,addr)}><I.Save/> Valider</button>
    </div>
  </>;
}

function EditForm({site,onSave,onCancel}){
  const[f,sF]=useState({name:site.name||"",type:site.type||"mobile",address:site.address||"",code_nidt:site.code_nidt||"",code_anfr:site.code_anfr||"",technologies:site.technologies||[],lat:site.lat||0,lng:site.lng||0});
  const T=["2G","3G","4G","5G","DSL","FTTH","FTTB","FH"];
  return<div style={{padding:"14px 0"}}>
    <div style={S.fg}><label style={S.fl}>Nom</label><input type="text" value={f.name} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,name:v}));}} style={S.fi}/></div>
    <div style={S.fg}><label style={S.fl}>Type</label><div style={{display:"flex",gap:8}}>{["mobile","fixe"].map(t=><button key={t} onClick={()=>sF(prev=>({...prev,type:t}))} style={{...S.tBtn,...(f.type===t?(t==="mobile"?S.tM:S.tF):{})}}>{t}</button>)}</div></div>
    <div style={S.fg}><label style={S.fl}>{f.type==="fixe"?"Trigramme site":"NIDT"}</label><input type="text" value={f.code_nidt} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,code_nidt:v}));}} style={S.fi} placeholder={f.type==="fixe"?"Ex: ABC":"Ex: 0751234"}/></div>
    <div style={S.fg}><label style={S.fl}>Adresse</label><input type="text" value={f.address} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,address:v}));}} style={S.fi}/></div>
    <div style={S.fg}><label style={S.fl}>ANFR</label><input type="text" value={f.code_anfr} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,code_anfr:v}));}} style={S.fi}/></div>
    <div style={S.fg}><label style={S.fl}>Techno</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{T.map(t=><button key={t} style={{...S.to,...(f.technologies?.includes(t)?S.toA:{})}} onClick={()=>sF(prev=>{const a=prev.technologies?.includes(t)?prev.technologies.filter(x=>x!==t):[...(prev.technologies||[]),t];return{...prev,technologies:a};})}>{t}</button>)}</div></div>

    <div style={S.fg}><label style={S.fl}>Position GPS</label>
      <InteractiveMap lat={f.lat} lng={f.lng} onLatLngChange={(la,ln)=>sF(prev=>({...prev,lat:la,lng:ln}))} onAddressChange={a=>sF(prev=>({...prev,address:a}))} height={240}/>
      <div style={{display:"flex",gap:10}}>
        <div style={S.fg}><label style={S.fl}>Lat</label><input type="number" step="0.000001" value={f.lat} onChange={e=>{const v=+(e.target.value)||0;sF(prev=>({...prev,lat:v}));}} style={S.fi}/></div>
        <div style={S.fg}><label style={S.fl}>Lng</label><input type="number" step="0.000001" value={f.lng} onChange={e=>{const v=+(e.target.value)||0;sF(prev=>({...prev,lng:v}));}} style={S.fi}/></div>
      </div>
    </div>

    <div style={{display:"flex",gap:10,marginTop:6}}><button style={S.canBtn} onClick={onCancel}>Annuler</button><button style={{...S.subBtn,flex:2}} onClick={()=>onSave(f)}><I.Save/> Enregistrer</button></div>
  </div>;
}

function SiteForm({title,onClose,onSave,myPos}){
  const[f,sF]=useState({name:"",type:"mobile",lat:0,lng:0,address:"",code_nidt:"",technologies:[]});
  const T=["2G","3G","4G","5G","DSL","FTTH","FTTB","FH"];
  const go=()=>{if(!f.name)return;onSave({...f,lat:f.lat||0,lng:f.lng||0});};

  const getPos=()=>{if(!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(p=>{sF(prev=>({...prev,lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6)}));},{},{enableHighAccuracy:true,timeout:10000});};

  return<div style={S.ov} className="drv-ov" onClick={onClose}><div style={S.modal} className="drv-modal" onClick={e=>e.stopPropagation()}>
    <div style={S.mH}><h2 style={{fontSize:18,fontWeight:800,margin:0}}>{title}</h2><button style={S.iBtn} onClick={onClose}><I.X/></button></div>
    <div style={S.mB}>
      <div style={S.fg}><label style={S.fl}>Nom *</label><input type="text" value={f.name} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,name:v}));}} style={S.fi} placeholder="Nom du site"/></div>
      <div style={S.fg}><label style={S.fl}>Type</label><div style={{display:"flex",gap:8}}>{["mobile","fixe"].map(t=><button key={t} onClick={()=>sF(prev=>({...prev,type:t}))} style={{...S.tBtn,...(f.type===t?(t==="mobile"?S.tM:S.tF):{})}}>{t}</button>)}</div></div>
      <div style={S.fg}><label style={S.fl}>{f.type==="fixe"?"Trigramme site":"NIDT"}</label><input type="text" value={f.code_nidt} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,code_nidt:v}));}} style={S.fi} placeholder={f.type==="fixe"?"Ex: ABC":"Ex: 0751234"}/></div>
      <div style={S.fg}><label style={S.fl}>Adresse</label><input type="text" value={f.address} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,address:v}));}} style={S.fi} placeholder="Adresse du site"/></div>

      <div style={S.fg}><label style={S.fl}>Position GPS</label>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={getPos} style={{...S.geoBtn,flex:1,fontSize:11,padding:"7px"}}><I.Locate/> Ma position</button>
          {myPos&&<button onClick={()=>sF(prev=>({...prev,lat:+myPos.lat.toFixed(6),lng:+myPos.lng.toFixed(6)}))} style={{...S.geoBtn,flex:1,fontSize:11,padding:"7px",borderColor:"#FF7900",color:"#FF7900",background:"rgba(255,121,0,.06)"}}><I.Pin/> Suivi</button>}
        </div>
        <InteractiveMap lat={f.lat} lng={f.lng} onLatLngChange={(la,ln)=>sF(prev=>({...prev,lat:la,lng:ln}))} onAddressChange={a=>sF(prev=>({...prev,address:a}))} myPos={myPos} height={220}/>
        <div style={{display:"flex",gap:10}}>
          <div style={S.fg}><label style={S.fl}>Lat</label><input type="number" step="0.000001" value={f.lat} onChange={e=>{const v=+(e.target.value)||0;sF(prev=>({...prev,lat:v}));}} style={S.fi}/></div>
          <div style={S.fg}><label style={S.fl}>Lng</label><input type="number" step="0.000001" value={f.lng} onChange={e=>{const v=+(e.target.value)||0;sF(prev=>({...prev,lng:v}));}} style={S.fi}/></div>
        </div>
      </div>

      <div style={S.fg}><label style={S.fl}>Techno</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{T.map(t=><button key={t} style={{...S.to,...(f.technologies.includes(t)?S.toA:{})}} onClick={()=>sF(prev=>{const a=prev.technologies.includes(t)?prev.technologies.filter(x=>x!==t):[...prev.technologies,t];return{...prev,technologies:a};})}>{t}</button>)}</div></div>
    </div>
    <div style={S.mF}><button style={S.canBtn} onClick={onClose}>Annuler</button><button style={{...S.subBtn,flex:2,opacity:f.name?1:.5}} onClick={go} disabled={!f.name}>Ajouter</button></div>
  </div></div>;
}

// Global map view showing all sites
function MapView({sites,onSelect,myPos,th}){
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const markersRef=useRef([]);
  const initDone=useRef(false);

  // Init map only once
  useEffect(()=>{
    if(initDone.current)return;
    const loadL=()=>{
      if(window.L)return init();
      if(!document.getElementById("leaflet-css")){const l=document.createElement("link");l.id="leaflet-css";l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);}
      const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=init;document.head.appendChild(s);
    };
    const init=()=>{
      if(!mapRef.current||mapInst.current)return;
      initDone.current=true;
      const L=window.L;
      const center=myPos?[myPos.lat,myPos.lng]:[47.75,7.34];
      const map=L.map(mapRef.current,{zoomControl:true,attributionControl:false}).setView(center,10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
      if(myPos)L.circleMarker([myPos.lat,myPos.lng],{radius:10,color:"#4ECDC4",fillColor:"#4ECDC4",fillOpacity:.5,weight:3}).addTo(map);
      mapInst.current=map;
      addMarkers(map,sites);
    };
    loadL();
    return()=>{if(mapInst.current){mapInst.current.remove();mapInst.current=null;initDone.current=false;}};
  },[]);

  // Add markers helper
  const addMarkers=(map,list)=>{
    const L=window.L;if(!L||!map)return;
    markersRef.current.forEach(m=>map.removeLayer(m));
    markersRef.current=[];
    list.forEach(s=>{
      if(!s.lat||!s.lng||(s.lat===0&&s.lng===0))return;
      const color=s.type==="mobile"?"#1B8A6B":"#2E86C1";
      const icon=L.divIcon({className:"",html:`<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 0C7.6 0 4 3.6 4 8c0 6 8 16 8 16s8-10 8-16c0-4.4-3.6-8-8-8z" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="8" r="3" fill="#fff"/></svg></div>`,iconSize:[24,24],iconAnchor:[12,24]});
      const m=L.marker([s.lat,s.lng],{icon}).addTo(map);
      m.bindPopup(`<div style="font-family:sans-serif;font-size:12px"><b>${s.name}</b><br/><span style="color:#999">${s.code_nidt||""}</span></div>`);
      m.on("click",()=>setTimeout(()=>onSelect(s),300));
      markersRef.current.push(m);
    });
  };

  // Update markers when sites list changes (but don't reinit map)
  useEffect(()=>{
    if(mapInst.current&&window.L)addMarkers(mapInst.current,sites);
  },[sites.length]);

  return<div ref={mapRef} style={{height:"calc(100vh - 220px)",width:"100%"}}/>;
}

// ============================================================
// ANFR SECTORS COMPONENT
// ============================================================
const OP_COLORS={"ORANGE":"#FF7900","FREE MOBILE":"#CD1E25","SFR":"#E2001A","BOUYGUES TELECOM":"#0055A4","DIGICEL":"#E4002B","SRR":"#009688","OUTREMER":"#00BCD4"};
const GEN_COLORS={"5G":"#9C27B0","4G":"#1B8A6B","3G":"#2196F3","2G":"#FF9800"};

function AnfrSectors({data,siteLat,siteLng}){
  const[filtOp,setFiltOp]=useState("all");
  const[filtGen,setFiltGen]=useState("all");

  const operators=useMemo(()=>[...new Set(data.map(d=>d.adm_lb_nom).filter(Boolean))].sort(),[data]);
  const generations=useMemo(()=>[...new Set(data.map(d=>d.generation).filter(Boolean))].sort(),[data]);

  const filtered=useMemo(()=>data.filter(d=>{
    if(filtOp!=="all"&&d.adm_lb_nom!==filtOp)return false;
    if(filtGen!=="all"&&d.generation!==filtGen)return false;
    return true;
  }),[data,filtOp,filtGen]);

  // Group by operator then by generation
  const byOp=useMemo(()=>{
    const m={};
    filtered.forEach(d=>{
      const op=d.adm_lb_nom||"?";
      if(!m[op])m[op]={};
      const gen=d.generation||"?";
      if(!m[op][gen])m[op][gen]=[];
      m[op][gen].push(d);
    });
    return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0]));
  },[filtered]);

  // Summary for donut chart
  const genCounts=useMemo(()=>{
    const c={};filtered.forEach(d=>{const g=d.generation||"?";c[g]=(c[g]||0)+1;});
    return Object.entries(c).sort((a,b)=>b[1]-a[1]);
  },[filtered]);
  const total=filtered.length;

  return<div>
    {/* Filters */}
    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
      <button onClick={()=>setFiltOp("all")} style={{...S.chip,...(filtOp==="all"?S.chipA:{}),fontSize:9,padding:"3px 8px"}}>Tous op.</button>
      {operators.map(op=><button key={op} onClick={()=>setFiltOp(filtOp===op?"all":op)} style={{...S.chip,...(filtOp===op?{background:OP_COLORS[op]||P,color:"#fff",borderColor:OP_COLORS[op]||P}:{}),fontSize:9,padding:"3px 8px"}}>{op.split(" ")[0]}</button>)}
    </div>
    <div style={{display:"flex",gap:4,marginBottom:10}}>
      <button onClick={()=>setFiltGen("all")} style={{...S.chip,...(filtGen==="all"?S.chipA:{}),fontSize:9,padding:"3px 8px"}}>Toutes</button>
      {generations.map(g=><button key={g} onClick={()=>setFiltGen(filtGen===g?"all":g)} style={{...S.chip,...(filtGen===g?{background:GEN_COLORS[g]||"#999",color:"#fff",borderColor:GEN_COLORS[g]||"#999"}:{}),fontSize:9,padding:"3px 8px"}}>{g}</button>)}
    </div>

    {/* Generation summary bar */}
    {total>0&&<div style={{marginBottom:10}}>
      <div style={{display:"flex",borderRadius:6,overflow:"hidden",height:8}}>
        {genCounts.map(([g,c])=><div key={g} style={{flex:c,background:GEN_COLORS[g]||"#999"}} title={`${g}: ${c}`}/>)}
      </div>
      <div style={{display:"flex",gap:10,marginTop:6,justifyContent:"center"}}>
        {genCounts.map(([g,c])=><div key={g} style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{width:8,height:8,borderRadius:2,background:GEN_COLORS[g]||"#999"}}/>
          <span style={{fontSize:10,color:"#666"}}>{g} <strong>{c}</strong></span>
        </div>)}
      </div>
    </div>}

    {/* Systems list by operator */}
    <div style={{fontSize:11}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{color:"#999",fontWeight:600}}>{filtered.length} systèmes · {operators.length} opérateurs</span>
        <a href="https://data.anfr.fr" target="_blank" rel="noopener noreferrer" style={{fontSize:9,color:"#BBB",textDecoration:"none"}}>data.anfr.fr</a>
      </div>
      {byOp.map(([op,gens])=><div key={op} style={{marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
          <div style={{width:8,height:8,borderRadius:2,background:OP_COLORS[op]||"#999"}}/>
          <span style={{fontWeight:700,fontSize:12}}>{op}</span>
          <span style={{fontSize:9,color:"#BBB"}}>{Object.values(gens).reduce((s,a)=>s+a.length,0)} sys.</span>
        </div>
        {Object.entries(gens).sort((a,b)=>a[0].localeCompare(b[0])).map(([gen,systems])=><div key={gen} style={{marginLeft:14,marginBottom:4}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
            <span style={{fontWeight:700,color:GEN_COLORS[gen]||"#999",fontSize:11}}>{gen}</span>
            <span style={{fontSize:9,color:"#BBB"}}>{systems.length} système{systems.length>1?"s":""}</span>
          </div>
          {systems.map((s,i)=><div key={i} style={{display:"flex",gap:6,padding:"2px 0 2px 8px",borderLeft:`2px solid ${GEN_COLORS[gen]||"#EEE"}`,fontSize:10,color:"#666",marginBottom:1}}>
            <span style={{flex:1}}>{s.emr_lb_systeme||gen}</span>
            <span style={{color:s.statut?.includes("service")||s.statut?.includes("opérationnel")?P:"#FFAA00",fontWeight:600,fontSize:9}}>{s.statut?.includes("service")?"En service":s.statut?.includes("opérationnel")?"Opérationnel":s.statut||"—"}</span>
          </div>)}
        </div>)}
      </div>)}
      {filtered.length===0&&<p style={{color:"#CCC",textAlign:"center",padding:8}}>Aucun système trouvé</p>}
    </div>
  </div>;
}

function AboutModal({onClose}){
  return<div style={S.ov} className="drv-ov" onClick={onClose}><div style={{...S.modal,maxHeight:"70vh"}} className="drv-modal" onClick={e=>e.stopPropagation()}>
    <div style={S.mH}><h2 style={{fontSize:18,fontWeight:800,margin:0}}>À propos</h2><button style={S.iBtn} onClick={onClose}><I.X/></button></div>
    <div style={{...S.mB,textAlign:"center",padding:"20px 24px"}}>
      <div style={{marginBottom:16}}><Logo s={.9}/></div>
      <p style={{fontSize:13,color:"#999",margin:"0 0 4px"}}>Version <strong style={{color:"#1A1A1A"}}>{APP_VERSION}</strong></p>
      <p style={{fontSize:11,color:"#BBB",margin:"0 0 20px"}}>Build {APP_BUILD}</p>
      <div style={{background:"#F7F7F8",borderRadius:12,padding:"14px 16px",textAlign:"left",marginBottom:16}}>
        <p style={{fontSize:12,color:"#666",margin:"0 0 8px",lineHeight:1.5}}>Application de gestion des sites techniques pour les équipes terrain. Consultez, modifiez et géolocalisez vos sites directement depuis le mobile.</p>
        <p style={{fontSize:12,color:"#666",margin:0,lineHeight:1.5}}>Données stockées sur Supabase. Photos compressées automatiquement. Fonctionne hors-ligne.</p>
      </div>
      <div style={{borderTop:"1px solid #F0F0F0",paddingTop:14}}>
        <p style={{fontSize:11,color:"#BBB",margin:"0 0 4px"}}>Développé pour les équipes Orange</p>
        <p style={{fontSize:10,color:"#CCC",margin:0}}>© 2025 — Application non officielle</p>
        <p style={{fontSize:10,color:"#CCC",margin:"4px 0 0"}}>Usage interne uniquement</p>
      </div>
    </div>
  </div></div>;
}

function TopBar({t,onBack}){return<div style={S.topBar} className="drv-header"><button style={S.backBtn} onClick={onBack}><I.Back/></button><span style={S.topT}>{t}</span><div style={{width:40}}/></div>;}
function Card({children}){return<div style={S.card}>{children}</div>;}
function Toasty({m}){return<div style={S.toast}>{m}</div>;}

// ============================================================
// STYLES
// ============================================================
