import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ============================================================
// CONFIG
// ============================================================
const SB="https://cicndnlxwjitxroqtbnr.supabase.co";
const APP_VERSION="10.18.1";
const APP_BUILD="2026-04-17";
const SK="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpY25kbmx4d2ppdHhyb3F0Ym5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDMzNjcsImV4cCI6MjA4OTY3OTM2N30.x-hxZBMPGzpDSWmbekQAxMQ6BD3R1EUzkB1noHBlEoQ";
const H={"apikey":SK,"Authorization":`Bearer ${SK}`,"Content-Type":"application/json"};
const SDAYS=30;

// Fuel types
const TOTEMBOX_NIDTS=new Set(["00000307S1","00000072S1","00000386S1","TP13372S1","00000315S1","00004946S1","00000223L1","00000306S1","00000321S1","00000375S1","00000064S1","00005019S1","00000172S1","00000314S1","00004938S1","00016073S1","00009277S1","00000071S1","00000320S1","00000503S1","00008649S1","00004986S1","00007531S1","00018499S1","00005151S1","00015332S1","00015044S1","00017601S1","00000310S1","00019698S1","00000495S1","00005029S1","00008337S1","00000048S1"]);
const FUELS=[
  {key:"gazole",label:"Gazole",short:"B7",color:"#FFB300",api:"gazole_prix"},
  {key:"gazole_ex",label:"Gazole Excellium",short:"B7+",color:"#FF8F00",api:"gazole_prix",total:true},
  {key:"sp95",label:"SP95",short:"95",color:"#43A047",api:"sp95_prix"},
  {key:"sp95_ex",label:"SP95 Excellium",short:"95+",color:"#2E7D32",api:"sp95_prix",total:true},
  {key:"e10",label:"E10",short:"E10",color:"#1B8A6B",api:"e10_prix"},
  {key:"sp98",label:"SP98",short:"98",color:"#1565C0",api:"sp98_prix"},
  {key:"sp98_ex",label:"SP98 Excellium",short:"98+",color:"#0D47A1",api:"sp98_prix",total:true},
  {key:"e85",label:"E85",short:"E85",color:"#7B1FA2",api:"e85_prix"},
  {key:"gplc",label:"GPLc",short:"GPL",color:"#00838F",api:"gplc_prix"},
];
const WEX_BRANDS=["LECLERC","ENI","ESSO","ESSO EXPRESS","FAL","FULLI","IDS","ROMPETROL","VITO","E.LECLERC"];
const GR_BRANDS=["TOTALENERGIES","TOTAL ACCESS","TOTAL","TOTALENERGIES ACCESS"];
const getCardType=brand=>{if(!brand)return null;const b=brand.toUpperCase().trim();if(WEX_BRANDS.some(w=>b.includes(w)))return"wex";if(GR_BRANDS.some(g=>b.includes(g)))return"gr";return null;};
const timeAgo=d=>{if(!d)return"";const ms=Date.now()-new Date(d).getTime();if(ms<0)return"";const min=Math.floor(ms/60000);if(min<1)return"à l'instant";if(min<60)return min+"min";const h=Math.floor(min/60);if(h<24)return h+"h";const j=Math.floor(h/24);return j+"j";};
const FUEL_API_URL="https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";

// API
async function db(method,t,opts={}){
  const{data,filter,prefer}=opts;
  const url=`${SB}/rest/v1/${t}${filter?'?'+filter:''}`;
  const h={...H};
  if(prefer)h.Prefer=prefer;
  if(method==='GET')h.Accept="application/json";
  // Track API call for stats (keep last 10000, trimmed to 30 days)
  try{const key="drv_api_log";const log=JSON.parse(localStorage.getItem(key)||"[]");const now=Date.now();const cutoff=now-30*24*3600*1000;const trimmed=log.filter(t=>t>cutoff);trimmed.push(now);if(trimmed.length>10000)trimmed.splice(0,trimmed.length-10000);localStorage.setItem(key,JSON.stringify(trimmed));}catch(e){}
  const r=await fetch(url,{method,headers:h,...(data?{body:JSON.stringify(data)}:{})});
  if(!r.ok)throw new Error(await r.text());
  if(method==='DELETE')return;
  return r.json();
}
const dbGet=(t,f="")=>db('GET',t,{filter:f});
const dbPost=(t,d)=>db('POST',t,{data:d,prefer:"return=representation"});
const dbPatch=(t,d,f)=>db('PATCH',t,{data:d,filter:f,prefer:"return=representation"});
const dbDel=(t,f)=>db('DELETE',t,{filter:f});

// Soft delete: moves the item to the trash table before deleting from original
// Types supported: "site", "note", "notebook", "section", "contact", "comment"
async function softDelete(type,id,data,auth){
  const label=data.name||data.title||"(sans nom)";
  await dbPost("trash",{
    item_type:type,
    original_id:id,
    item_data:data,
    label,
    deleted_by_code:auth?.code,
    deleted_by_name:auth?.name||auth?.code,
  });
  const tableMap={site:"sites",note:"notes_content",notebook:"notebooks",section:"note_sections",contact:"directory",comment:"note_comments"};
  await dbDel(tableMap[type],`id=eq.${id}`);
}

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

// ============================================================
// OFFLINE CACHE — IndexedDB for comments, photos, ANFR, visits
// ============================================================
const IDB_NAME="drv_offline";const IDB_VER=1;
const idbOpen=()=>new Promise((res,rej)=>{const r=indexedDB.open(IDB_NAME,IDB_VER);r.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains("cache"))db.createObjectStore("cache");if(!db.objectStoreNames.contains("queue"))db.createObjectStore("queue",{keyPath:"id",autoIncrement:true});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const idbGet=async(store,key)=>{try{const db=await idbOpen();return new Promise((res)=>{const tx=db.transaction(store,"readonly");const s=tx.objectStore(store);const r=s.get(key);r.onsuccess=()=>res(r.result??null);r.onerror=()=>res(null);});}catch(e){return null;}};
const idbSet=async(store,key,val)=>{try{const db=await idbOpen();const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(val,key);return new Promise(res=>{tx.oncomplete=()=>res(true);tx.onerror=()=>res(false);});}catch(e){return false;}};
const idbDel=async(store,key)=>{try{const db=await idbOpen();const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(key);return new Promise(res=>{tx.oncomplete=()=>res(true);});}catch(e){return false;}};
const idbGetAll=async(store)=>{try{const db=await idbOpen();return new Promise((res)=>{const tx=db.transaction(store,"readonly");const r=tx.objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>res([]);});}catch(e){return[];}};

// Offline write queue — stores pending writes when offline
const queueWrite=async(action)=>{await idbSet("queue","q_"+Date.now(),action);};
const processQueue=async()=>{try{const items=await idbGetAll("queue");if(items.length===0)return 0;const db=await idbOpen();let processed=0;for(const item of items){try{if(item.type==="comment"){await dbPost("notes",item.data);}else if(item.type==="visit"){await dbPost("visits",item.data);}else if(item.type==="activity"){await dbPost("activity_log",item.data);}
const tx=db.transaction("queue","readwrite");tx.objectStore("queue").delete(item.id);await new Promise(r=>{tx.oncomplete=r;});processed++;}catch(e){break;}}return processed;}catch(e){return 0;}};


// Log activity
const logAct=async(sid,tech,action,details="")=>{try{await dbPost("activity_log",{site_id:sid,technician_code:tech,action,details});}catch(e){}};

// Format activity for display
const ACT_CFG={edit:{label:"Modif.",color:"#1565C0",bg:"#E3F2FD",dot:"#42A5F5"},comment:{label:"Note",color:"#2E7D32",bg:"#E8F5E9",dot:"#66BB6A"},photo:{label:"Photo",color:"#7B1FA2",bg:"#F3E5F5",dot:"#AB47BC"},create:{label:"Nouveau",color:"#E65100",bg:"#FFF3E0",dot:"#FF9800"}};
const parseActFields=(detail)=>{try{const d=JSON.parse(detail);const m={lat:"GPS",lng:null,address:"Adresse",needs_4x4:"4x4",needs_terrasse:"Terrasse",needs_binome:"Binôme",technologies:"Techno",name:"Nom",type:"Type",code_nidt:"NIDT",access_key:"Clé accès",anfr_support_id:"ANFR",poi_category:"Catégorie",has_wc:"WC",has_abloy:"Chargeur Abloy"};const p=[];for(const k of Object.keys(d)){if(m[k]!==undefined&&m[k]!==null)p.push(m[k]);}return p.length>0?p:["Infos"];}catch{return null;}};

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
  Ant:()=>ic(<><polygon points="10,22 11,4 13,4 14,22" fill="currentColor" opacity=".12" strokeWidth="1.5"/><line x1="10.5" y1="16" x2="13.5" y2="16" strokeWidth=".8"/><line x1="11" y1="10" x2="13" y2="10" strokeWidth=".8"/><line x1="11.5" y1="6" x2="12.5" y2="6" strokeWidth=".8"/><rect x="10" y="1" width="4" height="2.5" rx=".5" fill="currentColor" stroke="none"/><path d="M7,5 A4,4 0 0,0 7,10" fill="none" strokeWidth="1.5" strokeLinecap="round"/><path d="M4.5,4 A7,7 0 0,0 4.5,11" fill="none" strokeWidth="1" strokeLinecap="round" opacity=".45"/><path d="M17,5 A4,4 0 0,1 17,10" fill="none" strokeWidth="1.5" strokeLinecap="round"/><path d="M19.5,4 A7,7 0 0,1 19.5,11" fill="none" strokeWidth="1" strokeLinecap="round" opacity=".45"/></>,18),
  Bld:()=>ic(<><rect x="5" y="3" width="14" height="19" rx="1.5" strokeWidth="1.5"/><rect x="8" y="6" width="3" height="3" rx=".5" fill="currentColor" opacity=".15" strokeWidth=".5"/><rect x="13" y="6" width="3" height="3" rx=".5" fill="currentColor" opacity=".15" strokeWidth=".5"/><rect x="8" y="11" width="3" height="3" rx=".5" fill="currentColor" opacity=".15" strokeWidth=".5"/><rect x="13" y="11" width="3" height="3" rx=".5" fill="currentColor" opacity=".15" strokeWidth=".5"/><rect x="10" y="17" width="4" height="5" rx=".5" fill="currentColor" stroke="none"/></>,18),
  Poi:()=>ic(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>),
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
  Gear:()=>ic(<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></>,18),
  Fuel:()=>ic(<><path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M3 22h12"/><rect x="6" y="8" width="6" height="5" rx=".5" fill="currentColor" opacity=".15"/><path d="M15 10h1.5a1.5 1.5 0 0 1 1.5 1.5V17a2 2 0 0 0 4 0V9l-3-3"/></>,18),
  Drop:()=>ic(<><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></>,16),
  Shield:()=>ic(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,18),
  Bar:()=>ic(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,18),
  DL:()=>ic(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,16),
  Up:()=>ic(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,16),
  Set:()=>ic(<><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></>,18),
  // Brand nav icons (inline SVG, no CDN)
  Waze:({c="#33CCFF",s=20}={})=><svg width={s} height={s} viewBox="0 0 48 48"><path d="M24 4C13.5 4 5 11.8 5 21.4c0 5.1 2.3 9.7 6 13 0 0-.5 3.8-3 6.6 0 0 5.2-.8 8.8-3.4 2.2.8 4.6 1.2 7.2 1.2 10.5 0 19-7.8 19-17.4S34.5 4 24 4z" fill="#fff"/><circle cx="18" cy="20" r="2.8" fill={c}/><circle cx="30" cy="20" r="2.8" fill={c}/><path d="M17 28c0 0 3 4 7 4s7-4 7-4" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"/></svg>,
  GMaps:({c="#34A853",s=20}={})=><svg width={s} height={s} viewBox="0 0 48 48"><path d="M24 4c-7.7 0-14 6.3-14 14 0 10.5 14 26 14 26s14-15.5 14-26c0-7.7-6.3-14-14-14z" fill="#fff"/><circle cx="24" cy="18" r="5" fill={c}/></svg>,
  Apple:({s=16}={})=><svg width={s} height={s} viewBox="0 0 24 24" fill="#fff"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>,
};

// ============================================================
// STYLES INJECTION
// ============================================================
const Styles=()=>{useEffect(()=>{const el=document.createElement("style");el.textContent=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes voicePulse{0%{box-shadow:0 0 0 0 rgba(78,205,196,.6)}70%{box-shadow:0 0 0 12px rgba(78,205,196,0)}100%{box-shadow:0 0 0 0 rgba(78,205,196,0)}}
@keyframes countUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
@keyframes slideInRight{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
@keyframes slideInLeft{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@keyframes greetFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes logoPop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes skPulse{0%,100%{opacity:.06}50%{opacity:.12}}
@keyframes headerBtns{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
@keyframes subFade{from{opacity:0}to{opacity:1}}
@keyframes popIn{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
@keyframes starBounce{0%{transform:scale(1)}30%{transform:scale(1.35)}60%{transform:scale(.9)}100%{transform:scale(1)}}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

@keyframes toastOut{from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(10px)}}
@keyframes pullSpin{to{transform:rotate(360deg)}}
@keyframes slideOutLeft{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-30px)}}
@keyframes slideInFromLeft{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:translateX(0)}}
@keyframes gridFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
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

// ============================================================
// DARK MODE — Aurora Neon overlay
// Globally tweaks backgrounds, cards, text, and adds animated aurora bg.
// Activates when localStorage['drv_dark']==='1'.
// ============================================================
const DarkOverlay=()=>{
  useEffect(()=>{
    const el=document.createElement("style");
    el.id="drv-dark-style";
    el.textContent=`
@keyframes auroraA{0%,100%{transform:translate(0,0) rotate(0deg)}50%{transform:translate(60px,80px) rotate(20deg)}}
@keyframes auroraB{0%,100%{transform:translate(0,0) rotate(0deg)}50%{transform:translate(-50px,-60px) rotate(-15deg)}}
@keyframes auroraC{0%,100%{transform:translate(0,0)}50%{transform:translate(40px,-50px)}}

body{background:#050510 !important}
html,body{color-scheme:dark}

/* ====== Aurora animated background (covers entire app) ====== */
#drv-aurora-bg{
  position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;
  background:
    radial-gradient(at 20% 0%,#1a0d3d 0%,transparent 40%),
    radial-gradient(at 80% 30%,#3d0d3d 0%,transparent 40%),
    radial-gradient(at 50% 80%,#0d1a3d 0%,transparent 40%),
    #050510;
}
#drv-aurora-bg::before{content:"";position:absolute;top:-30%;left:-20%;width:80%;height:60%;
  background:radial-gradient(ellipse,rgba(157,134,255,.4) 0%,transparent 60%);
  filter:blur(40px);animation:auroraA 18s ease-in-out infinite}
#drv-aurora-bg::after{content:"";position:absolute;bottom:-30%;right:-20%;width:80%;height:60%;
  background:radial-gradient(ellipse,rgba(76,205,196,.35) 0%,transparent 60%);
  filter:blur(40px);animation:auroraB 22s ease-in-out infinite}

/* ====== Hide aurora on full-screen game canvases ====== */
body.drv-game-active #drv-aurora-bg{display:none}

/* ====== Make app shell transparent so aurora shows through ====== */
body[data-dark="1"] > div > div[style*="background:\\"#F7F7F8\\""],
body[data-dark="1"] [style*="background:\\"#F7F7F8\\""],
body[data-dark="1"] [style*="background: rgb(247, 247, 248)"],
body[data-dark="1"] [style*="background:\\"#FAFAFA\\""],
body[data-dark="1"] [style*="background: rgb(250, 250, 250)"],
body[data-dark="1"] [style*="background:\\"#F5F5F5\\""],
body[data-dark="1"] [style*="background:\\"#FFFFFF\\""],
body[data-dark="1"] [style*="background:\\"#FFF\\""],
body[data-dark="1"] [style*="background: rgb(255, 255, 255)"]{
  background:transparent !important;
}

/* ====== Cards: glass treatment ====== */
body[data-dark="1"] [style*="background:\\"#fff\\""],
body[data-dark="1"] [style*="background: white"]{
  background:rgba(255,255,255,.04) !important;
  backdrop-filter:blur(24px) saturate(140%);
  -webkit-backdrop-filter:blur(24px) saturate(140%);
  border:1px solid rgba(255,255,255,.08) !important;
}

/* ====== Borders neutralized ====== */
body[data-dark="1"] [style*="border:\\"1px solid #F0F0F0\\""],
body[data-dark="1"] [style*="border:\\"1px solid #E0E0E0\\""],
body[data-dark="1"] [style*="border:\\"1px solid #EEE\\""],
body[data-dark="1"] [style*="border:\\"1px solid #E8E8E8\\""],
body[data-dark="1"] [style*="border-bottom: 1px solid rgb(240, 240, 240)"],
body[data-dark="1"] [style*="border-bottom: 1px solid rgb(245, 245, 245)"],
body[data-dark="1"] [style*="borderBottom: 1px solid #F0F0F0"]{
  border-color:rgba(255,255,255,.08) !important;
}

/* ====== Text colors ====== */
body[data-dark="1"]{color:#E5E5E5}
body[data-dark="1"] [style*="color:\\"#1A1A1A\\""],
body[data-dark="1"] [style*="color:\\"#000\\""]{color:#F5F5F5 !important}
body[data-dark="1"] [style*="color:\\"#666\\""]{color:#B5B5B5 !important}
body[data-dark="1"] [style*="color:\\"#999\\""]{color:#888 !important}
body[data-dark="1"] [style*="color:\\"#CCC\\""],
body[data-dark="1"] [style*="color:\\"#BBB\\""]{color:#555 !important}

/* ====== Inputs ====== */
body[data-dark="1"] input,body[data-dark="1"] textarea,body[data-dark="1"] select{
  background:rgba(255,255,255,.04) !important;
  color:#E5E5E5 !important;
  border-color:rgba(255,255,255,.1) !important;
}
body[data-dark="1"] input::placeholder,body[data-dark="1"] textarea::placeholder{color:rgba(180,180,180,.4) !important}

/* ====== Sticky headers / panels ====== */
body[data-dark="1"] [style*="position: sticky"]{
  background:rgba(10,5,16,.7) !important;
  backdrop-filter:blur(24px) saturate(140%);
  -webkit-backdrop-filter:blur(24px) saturate(140%);
  border-bottom-color:rgba(255,255,255,.08) !important;
}

/* ====== Avatars / accent circles keep their own colors ====== */
/* (handled naturally by inline gradients) */

/* ====== Scrollbar tweak ====== */
body[data-dark="1"] *::-webkit-scrollbar{width:0}

/* ====== Photos & media: subtle border instead of bright ====== */
body[data-dark="1"] [style*="background:\\"#F0F0F0\\""],
body[data-dark="1"] [style*="background:\\"#EEE\\""]{
  background:rgba(255,255,255,.06) !important;
}
`;
    document.head.appendChild(el);
    document.body.setAttribute("data-dark","1");
    // Aurora background div
    let bg=document.getElementById("drv-aurora-bg");
    if(!bg){
      bg=document.createElement("div");
      bg.id="drv-aurora-bg";
      document.body.insertBefore(bg,document.body.firstChild);
    }
    return()=>{
      try{document.head.removeChild(el);}catch(e){}
      try{document.body.removeAttribute("data-dark");}catch(e){}
      try{const b=document.getElementById("drv-aurora-bg");if(b)b.remove();}catch(e){}
    };
  },[]);
  return null;
};


const P="#1B8A6B";
const A="#4ECDC4";

const S={
  ctr:{minHeight:"100vh",background:"#F7F7F8",fontFamily:"'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif",maxWidth:1400,margin:"0 auto",position:"relative",overflowX:"hidden",width:"100%"},
  loginW:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"linear-gradient(145deg,#0a2e24 0%,#0d1b2a 100%)"},
  loginB:{width:"100%",maxWidth:340,padding:28,borderRadius:24,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"},
  errB:{background:"rgba(231,76,60,.15)",color:"#E74C3C",padding:"10px 14px",borderRadius:10,fontSize:13,marginBottom:16,border:"1px solid rgba(231,76,60,.2)",textAlign:"center"},
  codeIn:{width:"100%",padding:"16px",borderRadius:14,border:"2px solid rgba(255,255,255,.15)",background:"rgba(0,0,0,.3)",color:"#fff",fontSize:24,fontWeight:800,fontFamily:"'DM Sans',monospace",textAlign:"center",letterSpacing:6,outline:"none",boxSizing:"border-box"},
  linkBtn:{display:"block",width:"100%",textAlign:"center",background:"none",border:"none",color:"#4ECDC4",fontSize:12,marginTop:16,cursor:"pointer",padding:8},
  header:{background:"linear-gradient(145deg,rgba(10,46,36,.92) 0%,rgba(13,27,42,.92) 100%)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",padding:"12px 14px 10px",position:"sticky",top:0,zIndex:100},
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
  navB:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"9px 5px",borderRadius:9,color:"#fff",textDecoration:"none",fontSize:11,fontWeight:700,backgroundImage:"linear-gradient(180deg,rgba(255,255,255,.15) 0%,transparent 100%)"},
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
  tP:{borderColor:"#E67E22",background:"#FEF5E7",color:"#E67E22"},
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
  toast:{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1A1A1A",color:"#fff",padding:"9px 20px",borderRadius:11,fontSize:12,fontWeight:600,zIndex:2000,boxShadow:"0 8px 30px rgba(0,0,0,.25)",pointerEvents:"none"},
  lbBtn:{background:"rgba(255,255,255,.15)",border:"none",borderRadius:22,width:44,height:44,color:"#fff",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
};

// Haptic feedback
const haptic=(ms=15)=>{try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}};

// Debounce helper
const useDebounce=(val,ms=150)=>{const[d,sD]=useState(val);useEffect(()=>{const t=setTimeout(()=>sD(val),ms);return()=>clearTimeout(t);},[val,ms]);return d;};

// Skeleton loading cards
function SkeletonList({count=6,th={card:"#fff"}}){
  const shimStyle={background:`linear-gradient(90deg,#E8E8E8 25%,#F5F5F5 50%,#E8E8E8 75%)`,backgroundSize:"400px",animation:"shimmer 1.5s infinite"};
  return<>{Array.from({length:count},(_,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px",background:th.card,borderRadius:11,border:"1px solid #EEE",animationDelay:`${i*60}ms`}}>
    <div style={{width:34,height:34,borderRadius:9,...shimStyle,animationDelay:`${i*60}ms`}}/>
    <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
      <div style={{height:10,borderRadius:5,width:"70%",...shimStyle,animationDelay:`${i*60+100}ms`}}/>
      <div style={{height:8,borderRadius:4,width:"45%",...shimStyle,animationDelay:`${i*60+200}ms`}}/>
    </div>
  </div>)}</>;
}

// Confirm modal (replaces native confirm())
// Global confirm host — replaces window.confirm() with dark premium modal
let _confirmResolver=null;
let _confirmSetOpen=null;
let _confirmConfig=null;
function GlobalConfirmHost(){
  const[open,setOpen]=useState(false);
  const[cfg,setCfg]=useState(null);
  useEffect(()=>{_confirmSetOpen=(c)=>{setCfg(c);setOpen(!!c);};return()=>{_confirmSetOpen=null;};},[]);
  if(!open||!cfg)return null;
  return<ConfirmModal msg={cfg.msg} hint={cfg.hint} danger={cfg.danger} yesLabel={cfg.yesLabel} noLabel={cfg.noLabel} onYes={()=>{setOpen(false);if(_confirmResolver){_confirmResolver(true);_confirmResolver=null;}}} onNo={()=>{setOpen(false);if(_confirmResolver){_confirmResolver(false);_confirmResolver=null;}}}/>;
}
function confirmDark(msg,options={}){
  return new Promise(resolve=>{
    _confirmResolver=resolve;
    if(_confirmSetOpen)_confirmSetOpen({msg,...options});
    else resolve(window.confirm(msg));
  });
}

function ConfirmModal({msg,onYes,onNo,danger=false,yesLabel,noLabel,hint}){
  const color=danger?"#EF5350":A;
  return<div onClick={onNo} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,animation:"fadeIn .2s ease"}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:340,background:"linear-gradient(170deg,#0a2e24 0%,#0d1b2a 100%)",borderRadius:18,border:"1px solid rgba(255,255,255,.08)",boxShadow:"0 20px 60px rgba(0,0,0,.6)",overflow:"hidden",position:"relative",animation:"popIn .25s cubic-bezier(.34,1.56,.64,1) both"}}>
      {/* Aurora glow */}
      <div style={{position:"absolute",top:-30,right:-30,width:140,height:140,background:`radial-gradient(circle,${color}44,transparent 70%)`,filter:"blur(35px)",pointerEvents:"none"}}/>
      <div style={{padding:"22px 20px 14px",textAlign:"center",position:"relative"}}>
        <div style={{width:54,height:54,borderRadius:16,background:`linear-gradient(135deg,${color},${color}cc)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:`0 6px 20px ${color}55, inset 0 1px 0 rgba(255,255,255,.25)`}}>
          {danger?<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>}
        </div>
        <p style={{fontSize:14,fontWeight:700,color:"#fff",margin:"0 0 6px",lineHeight:1.4}}>{msg}</p>
        {hint&&<p style={{fontSize:11,color:"rgba(255,255,255,.5)",margin:0,lineHeight:1.4}}>{hint}</p>}
      </div>
      <div style={{display:"flex",gap:8,padding:"6px 16px 16px"}}>
        <button onClick={onNo} style={{flex:1,padding:"11px",borderRadius:11,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.04)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>{noLabel||"Annuler"}</button>
        <button onClick={()=>{haptic(25);onYes();}} style={{flex:1.2,padding:"11px",borderRadius:11,border:"none",background:`linear-gradient(135deg,${color},${color}dd)`,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",boxShadow:`0 4px 14px ${color}66`}}>{yesLabel||(danger?"Supprimer":"Confirmer")}</button>
      </div>
    </div>
  </div>;
}



// Tech Avatar with photo or initials fallback
function TechAvatar({name,code,url,size=34,fontSize=12}){
  const initials=((name||code||"?").split(" ").map(w=>w[0]).join("").slice(0,2)).toUpperCase();
  const colors=["#1B8A6B","#E67E22","#2E86C1","#7B1FA2","#E53935","#00897B","#D4A017","#5E35B1"];
  const bg=colors[((code||"").charCodeAt(0)||0)%colors.length];
  if(url)return<img src={url} alt="" style={{width:size,height:size,borderRadius:size*.35,objectFit:"cover",flexShrink:0}}/>;
  return<div style={{width:size,height:size,borderRadius:size*.35,background:bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize,fontWeight:700,flexShrink:0,letterSpacing:-.3}}>{initials}</div>;
}

// Site Icon — Glassmorphism 3D
function SiteIcon({type,size=48}){
  const cfg={mobile:{bg:"linear-gradient(135deg,#1B8A6B,#4ECDC4)",shadow:"0 4px 12px rgba(27,138,107,.4), inset 0 1px 0 rgba(255,255,255,.3)"},fixe:{bg:"linear-gradient(135deg,#E65100,#FF9800)",shadow:"0 4px 12px rgba(230,81,0,.4), inset 0 1px 0 rgba(255,255,255,.3)"},poi:{bg:"linear-gradient(135deg,#FF8F00,#FFC107)",shadow:"0 4px 12px rgba(255,143,0,.4), inset 0 1px 0 rgba(255,255,255,.3)"}};
  const c=cfg[type]||cfg.mobile;const is=size*.45;
  return<div style={{width:size,height:size,borderRadius:size*.3,background:c.bg,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:c.shadow,position:"relative",overflow:"hidden",flexShrink:0}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:"50%",background:"linear-gradient(180deg,rgba(255,255,255,.25),transparent)",borderRadius:`${size*.3}px ${size*.3}px 0 0`}}/>
    {type==="mobile"?<svg width={is} height={is} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"relative",zIndex:1,filter:"drop-shadow(0 1px 2px rgba(0,0,0,.2))"}}>
      <polygon points="10,22 11,4 13,4 14,22" fill="rgba(255,255,255,.15)" strokeWidth="1.5"/><rect x="10" y="1" width="4" height="2.5" rx=".5" fill="#fff" stroke="none"/><path d="M7,5 A4,4 0 0,0 7,10" strokeWidth="1.5"/><path d="M4.5,4 A7,7 0 0,0 4.5,11" strokeWidth="1" opacity=".5"/><path d="M17,5 A4,4 0 0,1 17,10" strokeWidth="1.5"/><path d="M19.5,4 A7,7 0 0,1 19.5,11" strokeWidth="1" opacity=".5"/>
    </svg>
    :type==="fixe"?<svg width={is} height={is} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" style={{position:"relative",zIndex:1,filter:"drop-shadow(0 1px 2px rgba(0,0,0,.2))"}}>
      <rect x="5" y="3" width="14" height="19" rx="1.5"/><rect x="8" y="6" width="3" height="3" rx=".5" fill="rgba(255,255,255,.3)"/><rect x="13" y="6" width="3" height="3" rx=".5" fill="rgba(255,255,255,.3)"/><rect x="8" y="11" width="3" height="3" rx=".5" fill="rgba(255,255,255,.3)"/><rect x="13" y="11" width="3" height="3" rx=".5" fill="rgba(255,255,255,.3)"/><rect x="10" y="17" width="4" height="5" rx=".5" fill="#fff" stroke="none"/>
    </svg>
    :<svg width={is} height={is} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{position:"relative",zIndex:1,filter:"drop-shadow(0 1px 2px rgba(0,0,0,.2))"}}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="rgba(255,255,255,.15)"/><circle cx="12" cy="10" r="3" fill="#fff"/>
    </svg>}
  </div>;
}

// ============================================================
// MAIN APP - Router
// ============================================================
export default function App(){
  const[auth,setAuth]=useState(null); // {code,role,name}
  const[page,setPage]=useState("home"); // home|site|editGps|admin|notes|notebook|section|note|directory|game|td|bacteria|myactivity
  const[authStep,setAuthStep]=useState("code"); // code|pin|setup_pin
  const[prefetchedData,setPrefetchedData]=useState(null);
  const[darkMode,setDarkMode]=useState(()=>{try{return localStorage.getItem("drv_dark")==="1";}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem("drv_dark",darkMode?"1":"0");}catch{}},[darkMode]);

  // Restore session + prefetch
  useEffect(()=>{
    const saved=ls.json("drv_auth");
    if(saved&&checkSession()){
      setAuth(saved);touchSession();
      Promise.all([
        dbGet("sites","order=name.asc").catch(()=>null),
        fetch(`${SB}/functions/v1/fuel-prices?deps=67,68`,{headers:{"apikey":SK,"Authorization":`Bearer ${SK}`}}).then(r=>r.ok?r.json():null).catch(()=>null),
        dbGet("technicians","select=code,name,avatar_url").catch(()=>null),
      ]).then(([sites,stData,techs])=>{setPrefetchedData({sites,stData,techs});});
    }
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
    const a={code:tech.code,role:tech.role||"tech",name:tech.name||"",avatar_url:tech.avatar_url||""};
    setAuth(a);ls.set("drv_auth",JSON.stringify(a));touchSession();
  };

  const logout=()=>{ls.del("drv_auth");ls.del("drv_date");setAuth(null);setPage("home");};

  if(!auth)return<div style={S.ctr}><Styles/><AuthScreen onLogin={handleLogin} onAuth={handleAuth}/><GlobalConfirmHost/></div>;

  if(page==="admin"&&auth.role==="admin")return<div style={S.ctr}><Styles/>{darkMode&&<DarkOverlay/>}<AdminPanel auth={auth} onBack={()=>setPage("home")} logout={logout}/><GlobalConfirmHost/></div>;

  return<div style={S.ctr}><Styles/>{darkMode&&<DarkOverlay/>}<MainApp auth={auth} setAuth={setAuth} page={page} setPage={setPage} logout={logout} prefetchedData={prefetchedData} darkMode={darkMode} setDarkMode={setDarkMode}/><GlobalConfirmHost/></div>;
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
function MainApp({auth,setAuth,page,setPage,logout,prefetchedData,darkMode,setDarkMode}){
  const[sites,setSites]=useState([]);
  const[sel,setSel]=useState(null);
  const[q,setQ]=useState("");
  const[showSuggestions,setShowSuggestions]=useState(false);
  const searchHistory=ls.json("drv_search_hist")||[];
  const addSearchHist=t=>{if(!t||t.length<2)return;const h=[t,...(ls.json("drv_search_hist")||[]).filter(x=>x!==t)].slice(0,10);ls.set("drv_search_hist",JSON.stringify(h));};
  const[filt,setFilt]=useState("all");
  const[loading,setLoading]=useState(false);
  const[comments,setComments]=useState([]);
  const[nc,setNc]=useState("");
  const[photos,setPhotos]=useState([]);
  const[editing,setEditing]=useState(false);
  const[toast,setToast]=useState(null);
  const[toastKey,setToastKey]=useState(0);
  const[upl,setUpl]=useState(false);
  const[favs,setFavs2]=useState(getFavs());
  const[starAnim,setStarAnim]=useState(null);
  const[pageAnim,setPageAnim]=useState("");
  const[nearby,setNearby]=useState(false);
  const[theme,setTheme]=useState(ls.get("drv_theme")||"forest");
  const[tab,setTab2]=useState("list"); // list|map
  const[weather,setWeather]=useState(null);
  const[radius,setRadius]=useState(5);
  const[lb,setLb]=useState(null);
  const[actLog,setActLog]=useState([]);
  const[sortBy,setSort]=useState("name");
  const[showAdd,setShowAdd]=useState(false);
  const[activeAnnonce,setActiveAnnonce]=useState(null);
  const[annonceDismissed,setAnnonceDismissed]=useState(false);
  const[showAbout,setShowAbout]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[showDrawer,setShowDrawer]=useState(false);
  const[anfr,setAnfr]=useState([]);
  const[anfrLoading,setAnfrLoading]=useState(false);
  const[ratings,setRatings]=useState([]);
  const[myRating,setMyRating]=useState(0);
  const[travelTime,setTravelTime]=useState(null);
  const[confirmDlg,setConfirmDlg]=useState(null);
  const pullRef=useRef(null);
  const swipeDownRef=useRef(null);
  const[scrollY,setScrollY]=useState(0);
  const[showBackTop,setShowBackTop]=useState(false);
  useEffect(()=>{const onScroll=()=>{setScrollY(window.scrollY);setShowBackTop(window.scrollY>600);};window.addEventListener('scroll',onScroll,{passive:true});return()=>window.removeEventListener('scroll',onScroll);},[]);
  // Toggle game-active body class so DarkOverlay aurora hides on game/td (they have own dark)
  useEffect(()=>{
    const games=["game","td","bacteria"];
    if(games.includes(page))document.body.classList.add("drv-game-active");
    else document.body.classList.remove("drv-game-active");
    return()=>document.body.classList.remove("drv-game-active");
  },[page]);
  const scrollToTop=()=>window.scrollTo({top:0,behavior:'smooth'});
  
  const[stations,setStations]=useState([]);
  const[stationsLoading,setStationsLoading]=useState(false);
  const[stationCard,setStationCard]=useState("all"); // all|wex|gr
  const[fuelPref,setFuelPref]=useState(ls.get("drv_fuel")||"gazole");
  const[windThreshold,setWindThreshold]=useState(parseInt(ls.get("drv_wind_thr"))||80);
  const changeWindThr=v=>{setWindThreshold(v);ls.set("drv_wind_thr",v.toString());};
  const[selStation,setSelStation]=useState(null);
  const changeFuel=f=>{setFuelPref(f);ls.set("drv_fuel",f);};
  const[techAvatars,setTechAvatars]=useState({});
  const loadAvatars=async()=>{try{const t=await dbGet("technicians","select=code,name,avatar_url");const m={};t.forEach(x=>{m[x.code]={url:x.avatar_url||"",name:x.name||x.code};});setTechAvatars(m);}catch(e){}};
  const geo=useGeo();

  const uploadAvatar=async(file)=>{
    try{
      const c=await compressImg(file,400);
      const path=`avatars/${auth.code}_${Date.now()}.jpg`;
      const r=await fetch(`${SB}/storage/v1/object/site-photos/${path}`,{method:"POST",headers:{"apikey":SK,"Authorization":`Bearer ${SK}`,"Content-Type":"image/jpeg"},body:c});
      if(!r.ok)throw new Error("Upload failed");
      const url=`${SB}/storage/v1/object/public/site-photos/${path}`;
      await dbPatch("technicians",{avatar_url:url},`code=eq.${auth.code}`);
      const newAuth={...auth,avatar_url:url};
      setAuth(newAuth);ls.set("drv_auth",JSON.stringify(newAuth));
      setTechAvatars(prev=>({...prev,[auth.code]:{url,name:auth.name||auth.code}}));
      return url;
    }catch(e){throw e;}
  };

  const flash=m=>{haptic(10);setToastKey(k=>k+1);setToast(m);setTimeout(()=>setToast(null),2500);};

  useEffect(()=>{
    // Use prefetched data from splash if available
    if(prefetchedData){
      if(prefetchedData.sites){setSites(prefetchedData.sites);ls.set("drv_cache",JSON.stringify(prefetchedData.sites));try{idbSet("cache","sites",prefetchedData.sites);}catch(e){}}
      if(prefetchedData.stData&&prefetchedData.stData.results){
        // Process station data same as fetchStations
        const list=(prefetchedData.stData.results||[]).map(s=>{
          const brand=s.marque||"";const card=getCardType(brand);if(!card)return null;
          const indispo=(s.carburants_indisponibles||[]).map(x=>x.toLowerCase());
          const defStr=(s.carburants_rupture_definitive||"").toLowerCase();
          const tempStr=(s.carburants_rupture_temporaire||"").toLowerCase();
          const ruptures=[];const nonPropose=[];
          ["gazole","sp95","sp98","e10","e85","gplc"].forEach(k=>{if(!indispo.includes(k))return;const type=s[k+"_rupture_type"];if(type==="temporaire"||tempStr.includes(k))ruptures.push(k);else nonPropose.push(k);});
          return{_station:true,id:`st_${s.id}`,name:brand||"Station",brand,card,address:`${s.adresse}, ${s.cp} ${s.ville}`.trim(),lat:s.lat,lng:s.lon,
            gazole_prix:s.gazole_prix,sp95_prix:s.sp95_prix,sp98_prix:s.sp98_prix,e10_prix:s.e10_prix,e85_prix:s.e85_prix,gplc_prix:s.gplc_prix,
            gazole_maj:s.gazole_maj,sp95_maj:s.sp95_maj,sp98_maj:s.sp98_maj,e10_maj:s.e10_maj,e85_maj:s.e85_maj,gplc_maj:s.gplc_maj,
            gazole_rupture_debut:s.gazole_rupture_debut,gazole_rupture_type:s.gazole_rupture_type,sp95_rupture_debut:s.sp95_rupture_debut,sp95_rupture_type:s.sp95_rupture_type,sp98_rupture_debut:s.sp98_rupture_debut,sp98_rupture_type:s.sp98_rupture_type,e10_rupture_debut:s.e10_rupture_debut,e10_rupture_type:s.e10_rupture_type,e85_rupture_debut:s.e85_rupture_debut,e85_rupture_type:s.e85_rupture_type,gplc_rupture_debut:s.gplc_rupture_debut,gplc_rupture_type:s.gplc_rupture_type,
            ruptures,nonPropose,type:"station",horaires_automate_24_24:s.horaires_automate_24_24,carburants_rupture_definitive:s.carburants_rupture_definitive||"",carburants_rupture_temporaire:s.carburants_rupture_temporaire||""};
        }).filter(Boolean);
        setStations(list);if(list.length>0){ls.set("drv_stations",JSON.stringify(list));ls.set("drv_stations_ts",Date.now().toString());}
      }else{fetchStations();}
      if(prefetchedData.techs){const m={};prefetchedData.techs.forEach(x=>{m[x.code]={url:x.avatar_url||"",name:x.name||x.code};});setTechAvatars(m);}
      else{loadAvatars();}
      setLoading(false);
    }else{fetchSites();fetchStations();loadAvatars();}
    // Fetch active announcement
    (async()=>{try{const a=await dbGet("announcements",`expires_at=gt.${new Date().toISOString()}&order=created_at.desc&limit=1`);if(a&&a.length>0)setActiveAnnonce(a[0]);}catch(e){}})();
    geo.start();return()=>geo.stop();
  },[]);

  const fetchSites=async()=>{setLoading(true);try{const d=await dbGet("sites","order=name.asc");setSites(d||[]);ls.set("drv_cache",JSON.stringify(d));try{idbSet("cache","sites",d);}catch(e){}
try{const synced=await processQueue();if(synced>0)flash(`${synced} action${synced>1?"s":""} synchronisée${synced>1?"s":""} ✓`);}catch(e){}}catch(e){
try{const idbC=await idbGet("cache","sites");if(idbC&&idbC.length>0){setSites(idbC);flash("Mode hors-ligne (IDB)");return;}}catch(e2){}
const c=ls.json("drv_cache");if(c){setSites(c);flash("Mode hors-ligne");}else flash("Erreur");}setLoading(false);};

  // Fetch fuel stations via Supabase Edge Function (proxy CORS + marques OSM)
  const fetchStations=async()=>{
    const cached=ls.json("drv_stations");const cachedTs=ls.get("drv_stations_ts");
    if(cached&&cached.length>0&&cachedTs&&(Date.now()-parseInt(cachedTs))<900000){setStations(cached);return;} // 15min cache
    setStationsLoading(true);
    try{
      const r=await fetch(`${SB}/functions/v1/fuel-prices?deps=67,68`,{headers:{"apikey":SK,"Authorization":`Bearer ${SK}`}});
      if(!r.ok)throw new Error(`Edge fn ${r.status}`);
      const d=await r.json();
      if(d.error)throw new Error(d.error);
      console.log("[DRIVE] Stations:",d.total_count,"sample:",JSON.stringify(d.results?.[0]).slice(0,300));
      const list=(d.results||[]).map(s=>{
        const brand=s.marque||"";
        const card=getCardType(brand);
        if(!card)return null; // Only WEX/GR
        // Separate temporary ruptures from permanently unavailable fuels
        const indispo=(s.carburants_indisponibles||[]).map(x=>x.toLowerCase());
        const defStr=(s.carburants_rupture_definitive||"").toLowerCase();
        const tempStr=(s.carburants_rupture_temporaire||"").toLowerCase();
        const ruptures=[]; // Temporary = real alert
        const nonPropose=[]; // Definitive = station doesn't sell this fuel
        const fuelKeys=["gazole","sp95","sp98","e10","e85","gplc"];
        fuelKeys.forEach(k=>{
          if(!indispo.includes(k))return;
          const type=s[k+"_rupture_type"];
          if(type==="temporaire"||tempStr.includes(k)){ruptures.push(k);}
          else if(type==="definitive"||defStr.includes(k)){nonPropose.push(k);}
          else{nonPropose.push(k);} // Default to non-proposé if no type info
        });
        return{
          _station:true,id:`st_${s.id}`,name:brand||"Station",brand,card,
          address:`${s.adresse}, ${s.cp} ${s.ville}`.trim(),
          lat:s.lat,lng:s.lon,
          gazole_prix:s.gazole_prix,sp95_prix:s.sp95_prix,sp98_prix:s.sp98_prix,
          e10_prix:s.e10_prix,e85_prix:s.e85_prix,gplc_prix:s.gplc_prix,
          gazole_maj:s.gazole_maj,sp95_maj:s.sp95_maj,sp98_maj:s.sp98_maj,
          e10_maj:s.e10_maj,e85_maj:s.e85_maj,gplc_maj:s.gplc_maj,
          gazole_rupture_debut:s.gazole_rupture_debut,gazole_rupture_type:s.gazole_rupture_type,
          sp95_rupture_debut:s.sp95_rupture_debut,sp95_rupture_type:s.sp95_rupture_type,
          sp98_rupture_debut:s.sp98_rupture_debut,sp98_rupture_type:s.sp98_rupture_type,
          e10_rupture_debut:s.e10_rupture_debut,e10_rupture_type:s.e10_rupture_type,
          e85_rupture_debut:s.e85_rupture_debut,e85_rupture_type:s.e85_rupture_type,
          gplc_rupture_debut:s.gplc_rupture_debut,gplc_rupture_type:s.gplc_rupture_type,
          ruptures,nonPropose,type:"station",
          horaires_automate_24_24:s.horaires_automate_24_24,
          carburants_rupture_definitive:s.carburants_rupture_definitive||"",
          carburants_rupture_temporaire:s.carburants_rupture_temporaire||"",
        };
      }).filter(Boolean);
      console.log("[DRIVE] WEX/GR stations:",list.length);
      setStations(list);
      if(list.length>0){
        ls.set("drv_stations",JSON.stringify(list));
        ls.set("drv_stations_ts",Date.now().toString());
      }
    }catch(e){
      console.error("[DRIVE] Edge Function failed:",e.message);
      const cached2=ls.json("drv_stations");
      if(cached2&&cached2.length>0)setStations(cached2);
    }
    setStationsLoading(false);
  };
  const fetchComments=async id=>{try{const data=await dbGet("notes",`site_id=eq.${id}&order=created_at.asc`);setComments(data||[]);try{idbSet("cache",`comments_${id}`,data);}catch(e){}}catch(e){try{const cached=await idbGet("cache",`comments_${id}`);setComments(cached||[]);}catch(e2){setComments([]);}}};
  const fetchPhotos=async id=>{try{const data=await dbGet("photos",`site_id=eq.${id}&order=created_at.desc`);setPhotos(data||[]);try{idbSet("cache",`photos_${id}`,data);}catch(e){}}catch(e){try{const cached=await idbGet("cache",`photos_${id}`);setPhotos(cached||[]);}catch(e2){setPhotos([]);}}};
  const fetchAct=async id=>{try{const data=await dbGet("activity_log",`site_id=eq.${id}&order=created_at.desc&limit=10`);setActLog(data||[]);try{idbSet("cache",`activity_${id}`,data);}catch(e){}}catch(e){try{const cached=await idbGet("cache",`activity_${id}`);setActLog(cached||[]);}catch(e2){setActLog([]);}}};

  // Weather (#météo) - Open-Meteo free API
  const fetchWeather=async(la,ln)=>{
    if(!la||!ln||(la===0&&ln===0))return;
    try{
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m&timezone=auto&forecast_hours=13`);
      const d=await r.json();
      if(d.current){
        const hourly=[];
        const storms=[];
        if(d.hourly&&d.hourly.time){
          const now=new Date(d.current.time);
          for(let i=0;i<d.hourly.time.length;i++){
            const t=new Date(d.hourly.time[i]);
            if(t<=now)continue;
            const code=d.hourly.weather_code[i];
            const wind=d.hourly.wind_speed_10m?.[i]??null;
            if(hourly.length<4){
              hourly.push({time:t,temp:d.hourly.temperature_2m[i],code,precip_prob:d.hourly.precipitation_probability?.[i]??null,wind});
            }
            // Storm detection: WMO 95+=thunderstorm, also flag severe wind >60km/h
            if(code>=95||wind>=60){
              storms.push({time:t,code,wind,severe:code>=96||wind>=80});
            }
          }
        }
        // Also check current conditions
        const currentStorm=d.current.weather_code>=95||d.current.wind_speed_10m>=60;
        setWeather({...d.current,hourly,storms,currentStorm});
      }
    }catch(e){setWeather(null);}
  };

  // ANFR — fetch by support_id (exact) or GPS fallback, cached in IDB
  const fetchAnfr=async(la,ln,supportId)=>{
    if(!supportId&&(!la||!ln||(la===0&&ln===0)))return;
    setAnfrLoading(true);setAnfr([]);
    const cacheKey=supportId?`anfr_${supportId}`:`anfr_${la}_${ln}`;
    try{
      let filter;
      if(supportId){
        filter=`support_id=eq.${supportId}&order=generation.asc,systeme.asc&limit=300`;
      }else{
        const dLat=0.3/111.0;const dLng=0.3/(111.0*Math.cos(la*Math.PI/180));
        filter=`lat=gte.${(la-dLat).toFixed(6)}&lat=lte.${(la+dLat).toFixed(6)}&lng=gte.${(ln-dLng).toFixed(6)}&lng=lte.${(ln+dLng).toFixed(6)}&order=generation.asc,systeme.asc&limit=300`;
      }
      const rows=await dbGet("anfr_data",filter);
      const mapped=rows.map(r=>({
        adm_lb_nom:r.operateur||"ORANGE",generation:r.generation,emr_lb_systeme:r.systeme,
        statut:"En service",sup_nm_haut:r.hauteur_support,sta_nm_anfr:r.station_anfr,
        ant_azimut:r.azimut,ant_hauteur:r.hauteur_antenne,
      }));
      setAnfr(mapped);
      try{idbSet("cache",cacheKey,mapped);}catch(e){}
    }catch(e){console.log("ANFR fetch error:",e);try{const cached=await idbGet("cache",cacheKey);if(cached&&cached.length>0){setAnfr(cached);return;}}catch(e2){}setAnfr([]);}
    setAnfrLoading(false);
  };

  // Travel time via OSRM
  const fetchTravelTime=async(la,ln)=>{
    if(!geo.p||!la||!ln||(la===0&&ln===0))return;
    try{const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${geo.p.lng},${geo.p.lat};${ln},${la}?overview=false`);const d=await r.json();if(d.routes&&d.routes[0]){setTravelTime({min:Math.round(d.routes[0].duration/60),km:+(d.routes[0].distance/1000).toFixed(1)});}}catch(e){setTravelTime(null);}
  };

  // Ratings for POI restaurants
  const fetchRatings=async id=>{try{const r=await dbGet("ratings",`site_id=eq.${id}`);if(Array.isArray(r)){setRatings(r);const mine=r.find(x=>x.technician_code===auth.code);setMyRating(mine?mine.score:0);}else{setRatings([]);}}catch(e){setRatings([]);setMyRating(0);}};
  const submitRating=async(score)=>{if(!sel)return;try{const existing=ratings.find(r=>r.technician_code===auth.code);if(existing){await dbPatch("ratings",{score},`id=eq.${existing.id}`);}else{await dbPost("ratings",{site_id:sel.id,technician_code:auth.code,score});}setMyRating(score);fetchRatings(sel.id);flash(`Note ${score}/5 ✓`);}catch(e){flash("Erreur");}};

  // Voice search
  const[voiceListening,setVoiceListening]=useState(false);
  const voiceRef=useRef(null);
  const voiceSearch=()=>{
    // Stop if already listening
    if(voiceListening&&voiceRef.current){try{voiceRef.current.stop();}catch(e){}setVoiceListening(false);return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){flash("Reconnaissance vocale non disponible");return;}
    try{
      const rec=new SR();
      voiceRef.current=rec;
      rec.lang="fr-FR";
      rec.interimResults=false;
      rec.continuous=false;
      rec.maxAlternatives=1;
      // Safety timeout — iOS sometimes hangs
      const timeout=setTimeout(()=>{try{rec.stop();}catch(e){}setVoiceListening(false);flash("Pas de résultat");},8000);
      rec.onresult=e=>{clearTimeout(timeout);const t=e.results[0][0].transcript;setQ(t);addSearchHist(t);setVoiceListening(false);flash(`"${t}"`);};
      rec.onerror=e=>{clearTimeout(timeout);setVoiceListening(false);if(e.error==="not-allowed")flash("Micro non autorisé");else if(e.error==="no-speech")flash("Aucune voix détectée");else flash("Erreur micro");};
      rec.onend=()=>{clearTimeout(timeout);setVoiceListening(false);};
      setVoiceListening(true);
      rec.start();
    }catch(e){setVoiceListening(false);flash("Erreur: "+e.message);}
  };

  // Theme config
  const themes={
    forest:{header:"linear-gradient(155deg,#071a12,#0a2e24,#0d1b2a)",primary:"#1B8A6B",accent:"#4ECDC4",bg:"#F7F7F8",card:"#fff",text:"#1A1A1A"},
    orange:{header:"linear-gradient(155deg,#1a0a00,#331500,#0d0d0d)",primary:"#FF7900",accent:"#FF7900",bg:"#F5F5F5",card:"#fff",text:"#1A1A1A"},
    midnight:{header:"linear-gradient(155deg,#0f1729,#1a2744,#0d1b2a)",primary:"#4A90D9",accent:"#6CB4EE",bg:"#F0F4F8",card:"#fff",text:"#1A1A1A"},
    amoled:{header:"linear-gradient(155deg,#000,#050505,#000)",primary:"#1B8A6B",accent:"#4ECDC4",bg:"#000",card:"#111",text:"#EEE"},
    arctic:{header:"linear-gradient(155deg,#0a1628,#132e4a,#0d2035)",primary:"#2196F3",accent:"#64B5F6",bg:"#F0F6FF",card:"#fff",text:"#1A1A1A"},
    volcano:{header:"linear-gradient(155deg,#1a0505,#2d0a0a,#1a0f05)",primary:"#E53935",accent:"#FF7043",bg:"#FFF5F5",card:"#fff",text:"#1A1A1A"},
    lavender:{header:"linear-gradient(155deg,#1a1028,#251540,#1a1030)",primary:"#7E57C2",accent:"#B39DDB",bg:"#F5F0FF",card:"#fff",text:"#1A1A1A"},
    sahara:{header:"linear-gradient(155deg,#1a1408,#2d2010,#1a1508)",primary:"#D4A017",accent:"#FFD54F",bg:"#FFFDF5",card:"#fff",text:"#1A1A1A"},
    ocean:{header:"linear-gradient(155deg,#041a1a,#0a2e2e,#051e20)",primary:"#00897B",accent:"#4DB6AC",bg:"#F0FDFA",card:"#fff",text:"#1A1A1A"},
    carbon:{header:"linear-gradient(155deg,#141414,#1e1e1e,#0f0f0f)",primary:"#78909C",accent:"#B0BEC5",bg:"#F5F5F5",card:"#fff",text:"#1A1A1A"},
  };
  const th=themes[theme]||themes.forest;
  const changeTheme=t=>{setTheme(t);ls.set("drv_theme",t);};

  // Sync body background to theme (skipped in dark mode — DarkOverlay handles bg)
  useEffect(()=>{if(!darkMode)document.body.style.background=th.bg;else document.body.style.background="#050510";},[th.bg,darkMode]);

  // Weather icon from WMO code
  const wmoIcon=c=>{if(c<=1)return"☀️";if(c<=3)return"⛅";if(c<=49)return"🌫️";if(c<=59)return"🌧️";if(c<=69)return"🌨️";if(c<=79)return"❄️";if(c<=82)return"🌧️";if(c<=86)return"🌨️";if(c>=95)return"⛈️";return"🌤️";};
  const openSite=s=>{setSel(s);setNc("");setComments([]);setPhotos([]);setActLog([]);setEditing(false);setWeather(null);setAnfr([]);setTravelTime(null);setRatings([]);setMyRating(0);setPage("site");fetchComments(s.id);fetchPhotos(s.id);fetchAct(s.id);fetchWeather(s.lat,s.lng);fetchTravelTime(s.lat,s.lng);
    if(s.type==="mobile")fetchAnfr(s.lat,s.lng,s.anfr_support_id);
    if(s.type==="poi"&&s.poi_category==="Restaurant")fetchRatings(s.id);
    try{dbPost("visits",{site_id:s.id,technician_code:auth.code});}catch(e){}};
  const closeSite=()=>{setSel(null);setEditing(false);setPage("home");};
  
  
  
  
  
  





  const addComment=async()=>{if(!nc.trim())return;const data={site_id:sel.id,content:nc.trim(),technician_code:auth.code};try{await dbPost("notes",data);logAct(sel.id,auth.code,"comment",nc.trim());flash("Ajouté ✓");}catch(e){try{await queueWrite({type:"comment",data});flash("Sauvé hors-ligne ↻");}catch(e2){flash("Erreur");}}setNc("");fetchComments(sel.id);};

  const saveEdit=async f=>{try{
    // Only send fields that exist in table and have changed
    const allowed=["name","type","address","code_nidt","technologies","lat","lng","needs_4x4","needs_binome","needs_terrasse","anfr_support_id","poi_category","has_wc","has_abloy"];
    const clean={};for(const k of allowed){if(k in f)clean[k]=f[k];}
    await dbPatch("sites",clean,`id=eq.${sel.id}`);logAct(sel.id,auth.code,"edit",JSON.stringify(clean));const u={...sel,...clean};setSel(u);setSites(sites.map(s=>s.id===sel.id?u:s));setEditing(false);flash("Mis à jour ✓");
  }catch(e){console.error("[DRIVE] saveEdit error:",e.message);flash("Erreur: "+e.message.slice(0,80));}};
  const addSite=async d=>{try{const clean={};for(const[k,v] of Object.entries(d)){if(v===undefined||v===null)continue;if(typeof v==="string"&&v===""&&k!=="name"&&k!=="type")continue;if(Array.isArray(v)&&v.length===0)continue;clean[k]=v;}const ins=await dbPost("sites",clean);logAct(ins[0]?.id,auth.code,"create",d.name);setSites([...sites,...ins]);setShowAdd(false);flash("Ajouté ✓");}catch(e){flash("Erreur: "+e.message);}};
  const deleteSite=async id=>{
    setConfirmDlg({msg:"Ce site va être déplacé dans la corbeille pour 30 jours. Continuer ?",danger:true,onYes:async()=>{
      setConfirmDlg(null);
      try{
        const site=sites.find(s=>s.id===id);
        await softDelete("site",id,site,auth);
        setSites(sites.filter(s=>s.id!==id));
        closeSite();
        flash("Site déplacé dans la corbeille");
      }catch(e){flash("Erreur: "+e.message);}
    }});
  };
  const handlePhoto=async e=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length)return;
    const remaining=5-photos.length;
    if(remaining<=0){flash("Max 5 photos atteint");e.target.value="";return;}
    const toUpload=files.slice(0,remaining);
    const skipped=files.length-toUpload.length;
    setUpl(true);
    let ok=0,err=0;
    for(const f of toUpload){
      try{
        const url=await upPhoto(f,sel.id);
        await dbPost("photos",{site_id:sel.id,url,filename:f.name,technician_code:auth.code});
        logAct(sel.id,auth.code,"photo","upload");
        ok++;
      }catch(e){err++;}
    }
    fetchPhotos(sel.id);
    if(ok>0&&err===0&&skipped===0)flash(`${ok} photo${ok>1?"s":""} ✓`);
    else if(ok>0&&skipped>0)flash(`${ok} ajoutée${ok>1?"s":""}, ${skipped} ignorée${skipped>1?"s":""} (max 5)`);
    else if(err>0&&ok>0)flash(`${ok} ok, ${err} en erreur`);
    else if(err>0)flash("Erreur upload");
    setUpl(false);
    e.target.value="";
  };
  const rmPhoto=async p=>{setConfirmDlg({msg:"Supprimer cette photo ?",danger:true,onYes:async()=>{setConfirmDlg(null);try{await delPhoto(p.url);await dbDel("photos",`id=eq.${p.id}`);fetchPhotos(sel.id);flash("Supprimée");}catch(e){flash("Erreur");}}});};
  const handleFav=id=>{haptic();togFav(id);setFavs2(getFavs());setStarAnim(id);setTimeout(()=>setStarAnim(null),400);};

  // Filter + sort
  const dq=useDebounce(q,150);
  const list=useMemo(()=>{
    if(filt==="station"){
      // Station mode
      const fuelApi=FUELS.find(f=>f.key===fuelPref)?.api||"gazole_prix";
      let l=stations.filter(s=>{
        if(stationCard!=="all"&&s.card!==stationCard)return false;
        if(!dq)return true;
        const lq=dq.toLowerCase();
        return s.name?.toLowerCase().includes(lq)||s.brand?.toLowerCase().includes(lq)||s.address?.toLowerCase().includes(lq);
      });
      if(nearby&&geo.p)l=l.filter(s=>{const d=dist(geo.p.lat,geo.p.lng,s.lat,s.lng);return d!==null&&d<=radius;});
      l=l.map(s=>({...s,_d:geo.p?dist(geo.p.lat,geo.p.lng,s.lat,s.lng):null,_price:s[fuelApi]??null,_rupture:s.ruptures.includes(fuelPref.replace("_ex","")),_nonPropose:s.nonPropose?.includes(fuelPref.replace("_ex",""))}));
      // Always sort by distance for stations (name sort is useless — all "Total" or "Leclerc")
      l.sort((a,b)=>(a._d||9999)-(b._d||9999));
      // Compute price percentiles for coloring
      const prices=l.map(s=>s._price).filter(p=>p!==null&&p>0).sort((a,b)=>a-b);
      const p20=prices[Math.floor(prices.length*0.2)]||0;
      const p80=prices[Math.floor(prices.length*0.8)]||999;
      l=l.map(s=>({...s,_priceColor:s._price==null?null:s._price<=p20?"#1B8A6B":s._price>=p80?"#D32F2F":"#1A1A1A"}));
      return l;
    }
    // Normal site mode
    let l=sites.filter(s=>{const lq=dq.toLowerCase();const mq=!lq||s.name?.toLowerCase().includes(lq)||s.address?.toLowerCase().includes(lq)||s.code_nidt?.toLowerCase().includes(lq);return mq&&(filt==="all"||filt==="fav"?true:s.type===filt)&&(filt==="fav"?favs.includes(s.id):true);});
    if(nearby&&geo.p)l=l.filter(s=>{const d=dist(geo.p.lat,geo.p.lng,s.lat,s.lng);return d!==null&&d<=radius;});
    l=l.map(s=>({...s,_d:geo.p?dist(geo.p.lat,geo.p.lng,s.lat,s.lng):null,_f:favs.includes(s.id)}));
    if(sortBy==="dist")l.sort((a,b)=>(a._d||9999)-(b._d||9999));
    else if(sortBy==="nogps")l.sort((a,b)=>{const aGps=a.lat&&a.lng&&!(a.lat===0&&a.lng===0);const bGps=b.lat&&b.lng&&!(b.lat===0&&b.lng===0);if(!aGps&&bGps)return -1;if(aGps&&!bGps)return 1;return a.name.localeCompare(b.name);});
    else l.sort((a,b)=>{if(a._f&&!b._f)return -1;if(!a._f&&b._f)return 1;return a.name.localeCompare(b.name);});
    return l;
  },[sites,stations,dq,filt,stationCard,nearby,radius,geo.p,favs,sortBy,fuelPref]);

  // Swipe back gesture - only from left edge to avoid conflict with map pan
  const swipeRef=useRef(null);
  const onSwipeStart=e=>{if(e.touches[0].clientX<30)swipeRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY};};
  const onSwipeEnd=(e,backFn)=>{if(!swipeRef.current)return;const dx=e.changedTouches[0].clientX-swipeRef.current.x;const dy=Math.abs(e.changedTouches[0].clientY-swipeRef.current.y);swipeRef.current=null;if(dx>60&&dy<60)backFn();};

  // ---- GPS EDIT ----
  if(page==="editGps"&&sel)return<div onTouchStart={onSwipeStart} onTouchEnd={e=>onSwipeEnd(e,()=>{setPage("site");})}>
    <TopBar t="Modifier GPS" onBack={()=>{setPage("site");}}/>
    <div style={{padding:"0 16px 40px"}} className="drv-detail-pad">
      <h3 style={{fontSize:18,fontWeight:800,margin:"16px 0 8px",color:"#1A1A1A"}}>{sel.name}</h3>
      <GpsEditor site={sel} myPos={geo.p} onSave={(updates)=>{saveEdit(updates).then(()=>{setPage("site");});}} onCancel={()=>{setPage("site");}}/>
    </div>{toast&&<Toasty key={toastKey} m={toast}/>}
  </div>;

  // ---- SITE DETAIL (slide-in page) ----
  if(page==="site"&&sel){
    const gps=sel.lat&&sel.lng&&sel.lat!==0&&sel.lng!==0;
    const hasAccGps=sel.access_lat&&sel.access_lng&&sel.access_lat!==0&&sel.access_lng!==0;
    const dest=gps?`${sel.lat},${sel.lng}`:encodeURIComponent(sel.address||sel.name||"");
    const dd=geo.p&&sel.lat&&sel.lng?dist(geo.p.lat,geo.p.lng,sel.lat,sel.lng):null;
    const ttMin=travelTime?travelTime.min:null;
    const ttStr=ttMin?(ttMin<60?ttMin+" min":Math.floor(ttMin/60)+"h"+String(ttMin%60).padStart(2,"0")):null;
    const avgRating=ratings.length>0?(ratings.reduce((s,r)=>s+(r.score||0),0)/ratings.length).toFixed(1):"0";
    const heroBg=sel.type==="mobile"?"linear-gradient(135deg,#0a2e24,#1B8A6B)":sel.type==="fixe"?"linear-gradient(135deg,#1a0a00,#E65100)":"linear-gradient(135deg,#1a1200,#FF8F00)";
    const dCard={background:"#fff",border:"1px solid #F0F0F0",borderRadius:12,padding:12,marginBottom:6};
    const dSec={fontSize:8,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:1.5,margin:"10px 0 5px",display:"flex",alignItems:"center",gap:8};
    const dNavBtn={flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"12px 6px",borderRadius:10,color:"#fff",fontSize:11,fontWeight:600,textDecoration:"none",border:"none"};
    return<div onTouchStart={onSwipeStart} onTouchEnd={e=>onSwipeEnd(e,closeSite)} style={{animation:"slideInRight .25s ease",background:th.bg||"#F7F7F8",minHeight:"100vh"}}>
      <div style={{padding:"0 14px",overflowY:"auto"}}>
        {editing?<><TopBar t="Modifier" onBack={()=>setEditing(false)}/><EditForm site={sel} onSave={saveEdit} onCancel={()=>setEditing(false)}/></>:<>
          {/* Hero — Stats intégrées avec bouton retour (parallax) */}
          <div style={{background:heroBg,borderRadius:"0 0 14px 14px",overflow:"hidden",marginBottom:8,transform:`translateY(${Math.max(0,scrollY*.3)}px)`,transition:"transform .1s linear"}}>
            <div style={{padding:"12px 14px 0",display:"flex",alignItems:"center"}}>
              <button onClick={closeSite} style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff",flexShrink:0}}><I.Back/></button>
            </div>
            <div style={{padding:"8px 14px 14px",display:"flex",alignItems:"center",gap:12}}>
              <SiteIcon type={sel.type} size={52}/>
              <div style={{flex:1,minWidth:0}}>
                <h2 style={{fontSize:18,fontWeight:800,color:"#fff",margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sel.name}</h2>
                {sel.code_nidt&&<div style={{fontSize:15,fontWeight:800,color:"rgba(255,255,255,.85)",marginTop:2,fontFamily:"monospace",letterSpacing:1}}>{sel.code_nidt}</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                <button onClick={()=>handleFav(sel.id)} style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",borderRadius:9,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{favs.includes(sel.id)?<I.StarF/>:<I.Star/>}</button>
              </div>
            </div>
            <div style={{display:"flex",borderTop:"1px solid rgba(255,255,255,.1)"}}>
              <div style={{flex:1,padding:"8px 4px",textAlign:"center",borderRight:"1px solid rgba(255,255,255,.08)"}}><div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase"}}>Type</div><div style={{fontSize:13,fontWeight:800,color:"#fff",marginTop:2}}>{sel.type==="mobile"?"Mobile":sel.type==="poi"?"POI":"Fixe"}</div></div>
              <div style={{flex:1,padding:"8px 4px",textAlign:"center",borderRight:"1px solid rgba(255,255,255,.08)"}}><div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase"}}>Distance</div><div style={{fontSize:13,fontWeight:800,color:"#4ECDC4",marginTop:2}}>{dd!==null&&dd<999?(dd<1?`${Math.round(dd*1000)}m`:`${dd.toFixed(1)}km`):"—"}</div></div>
              <div style={{flex:1,padding:"8px 4px",textAlign:"center",borderRight:"1px solid rgba(255,255,255,.08)"}}><div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase"}}>Trajet</div><div style={{fontSize:13,fontWeight:800,color:"#fff",marginTop:2}}>{ttStr||"—"}</div></div>
              <div style={{flex:1,padding:"8px 4px",textAlign:"center"}}><div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase"}}>Infos</div><div style={{display:"flex",gap:3,justifyContent:"center",flexWrap:"wrap",marginTop:3}}>
                {sel.has_wc&&<span style={{padding:"2px 5px",borderRadius:4,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",gap:2,animation:"popIn .3s ease both"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M3 9h4l1 12H2L3 9z"/><path d="M17 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M14 9h6l-1.5 6h-3L14 9z"/><path d="M15.5 15l-.5 6m3-6l.5 6"/></svg><span style={{fontSize:8,fontWeight:700,color:"#fff"}}>WC</span></span>}
                {sel.has_abloy&&<span style={{padding:"2px 5px",borderRadius:4,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",gap:2,animation:"popIn .3s ease .05s both"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg><span style={{fontSize:7,fontWeight:700,color:"#fff",lineHeight:1.1,textAlign:"left"}}>Chargeur<br/>Abloy</span></span>}
                {sel.needs_4x4&&<span style={{padding:"2px 5px",borderRadius:4,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",gap:2,animation:"popIn .3s ease .1s both"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M3 11l2-6h14l2 6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg><span style={{fontSize:8,fontWeight:700,color:"#fff"}}>4x4</span></span>}
                {sel.needs_terrasse&&<span style={{padding:"2px 5px",borderRadius:4,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",gap:2,animation:"popIn .3s ease .15s both"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M2 20h20"/><path d="M5 20V8l7-5 7 5v12"/><path d="M9 20v-4h6v4"/></svg><span style={{fontSize:8,fontWeight:700,color:"#fff"}}>Ter.</span></span>}
                {sel.needs_binome&&<span style={{padding:"2px 5px",borderRadius:4,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",gap:2,animation:"popIn .3s ease .2s both"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span style={{fontSize:8,fontWeight:700,color:"#fff"}}>Bin.</span></span>}
                {TOTEMBOX_NIDTS.has(sel.code_nidt)&&<span style={{padding:"2px 5px",borderRadius:4,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",gap:2,animation:"popIn .3s ease .25s both"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg><span style={{fontSize:8,fontWeight:700,color:"#fff"}}>Totem</span></span>}
                {!sel.has_wc&&!sel.has_abloy&&!sel.needs_4x4&&!sel.needs_terrasse&&!sel.needs_binome&&!TOTEMBOX_NIDTS.has(sel.code_nidt)&&<span style={{fontSize:13,fontWeight:800,color:"rgba(255,255,255,.3)"}}>—</span>}
              </div></div>
            </div>
          </div>
          {/* Quick actions */}
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <a href={gps?`https://waze.com/ul?ll=${sel.lat},${sel.lng}&navigate=yes`:`https://waze.com/ul?q=${encodeURIComponent(sel.address||sel.name)}&navigate=yes`} target="_blank" rel="noopener noreferrer" style={{...dNavBtn,background:"#33CCFF",textDecoration:"none"}}><I.Waze s={16}/> Waze</a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noopener noreferrer" style={{...dNavBtn,background:"#34A853",textDecoration:"none"}}><I.GMaps s={16}/> Maps</a>
            <button onClick={()=>setEditing(true)} style={{...dNavBtn,background:th.primary,border:"none",cursor:"pointer"}}><I.Edit/> Modifier</button>
          </div>
          {/* Rating for restaurants */}
          {sel.type==="poi"&&sel.poi_category==="Restaurant"&&<div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center",marginBottom:8}}>
            <div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(n=><button key={n} onClick={()=>submitRating(n)} style={{background:"none",border:"none",cursor:"pointer",padding:2,fontSize:20,color:n<=myRating?"#FFB300":"#DDD"}}>{n<=myRating?"\u2605":"\u2606"}</button>)}</div>
            {ratings.length>0&&<span style={{fontSize:11,fontWeight:700,color:"#FFB300"}}>{avgRating}/5</span>}
            <span style={{fontSize:9,color:"#BBB"}}>({ratings.length})</span>
          </div>}
          {/* Satellite map for fixe sites */}
          {sel.type==="fixe"&&gps&&<div style={{background:"#fff",border:"1px solid #F0F0F0",borderRadius:12,overflow:"hidden",marginBottom:6}}>
            <div style={{fontSize:8,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:.5,padding:"10px 12px 0"}}>Vue satellite</div>
            <div style={{height:160,position:"relative",margin:"6px 0 0",overflow:"hidden",background:"#1a1a1a"}}>
              <iframe src={`https://www.google.com/maps?q=${sel.lat},${sel.lng}&z=18&t=k&output=embed`} style={{width:"100%",height:"100%",border:"none",pointerEvents:"none"}} loading="lazy" referrerPolicy="no-referrer"/>
              <div style={{position:"absolute",bottom:6,right:6,background:"rgba(0,0,0,.6)",borderRadius:6,padding:"3px 8px",fontSize:9,fontWeight:700,color:"#fff",zIndex:2}}>{sel.lat.toFixed(5)}, {sel.lng.toFixed(5)}</div>
            </div>
          </div>}
          {/* Info grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
            <div style={dCard}><div style={{fontSize:8,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Adresse</div><div style={{fontSize:12,fontWeight:500,color:"#333",lineHeight:1.4}}>{sel.address||"\u2014"}</div></div>
            <div style={dCard}><div style={{fontSize:8,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Coordonnées</div><div style={{fontSize:10,fontWeight:500,color:"#666",fontFamily:"monospace",lineHeight:1.6}}>{gps?`${(sel.lat||0).toFixed(6)}\n${(sel.lng||0).toFixed(6)}`:"Non renseigné"}</div><button style={{display:"inline-flex",alignItems:"center",gap:3,background:"none",border:`1px solid ${P}33`,borderRadius:6,padding:"2px 8px",fontSize:9,color:P,fontWeight:600,cursor:"pointer",marginTop:4}} onClick={()=>setPage("editGps")}><I.Edit/> GPS</button></div>
            {weather&&<div style={{...dCard,gridColumn:"1 / -1"}}><div style={{fontSize:8,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Météo</div><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>{wmoIcon(weather.weather_code)}</span><div><div style={{fontSize:18,fontWeight:700,color:"#1A1A1A"}}>{Math.round(weather.temperature_2m)}°C</div><div style={{fontSize:10,color:"#999"}}>Vent {Math.round(weather.wind_speed_10m)} km/h</div></div>{weather.precipitation>0?<div style={{marginLeft:"auto",background:"#E3F2FD",borderRadius:8,padding:"4px 8px",textAlign:"center"}}><div style={{fontSize:13,fontWeight:700,color:"#1565C0"}}>{weather.precipitation}mm</div></div>:<div style={{marginLeft:"auto",background:"#E8F8F5",borderRadius:8,padding:"4px 8px",textAlign:"center"}}><div style={{fontSize:13,fontWeight:700,color:P}}>0mm</div></div>}</div>
            {weather.storms?.length>0||weather.currentStorm?<div style={{background:"#FFF3E0",border:"1px solid #FFB74D",borderRadius:8,padding:"6px 8px",marginTop:6,display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14}}>⚡</span><span style={{fontSize:10,fontWeight:700,color:"#E65100"}}>{weather.currentStorm?"Orage en cours":"Orage prévu"}</span></div>:<div style={{background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:8,padding:"6px 8px",marginTop:6,display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:14}}>✅</span><span style={{fontSize:10,fontWeight:700,color:"#2E7D32"}}>RAS sur 12h</span></div>}
            {weather.hourly?.length>0&&<div style={{display:"flex",gap:0,justifyContent:"space-between",marginTop:6}}>{weather.hourly.map((h,i)=>{const hr=h.time.getHours().toString().padStart(2,"0")+"h";return<div key={i} style={{flex:1,textAlign:"center",padding:"4px 2px",borderRadius:6,background:h.code>=95?"#FFF3E0":i===0?"#F5F5F5":"transparent"}}><div style={{fontSize:9,fontWeight:600,color:"#999"}}>{hr}</div><div style={{fontSize:16,margin:"1px 0"}}>{wmoIcon(h.code)}</div><div style={{fontSize:12,fontWeight:700,color:"#1A1A1A"}}>{Math.round(h.temp)}°</div></div>})}</div>}
            </div>}
            {sel.technologies?.length>0&&<div style={dCard}><div style={{fontSize:8,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Techno</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{sel.technologies.map(t=><span key={t} style={S.tLg}>{t}</span>)}</div></div>}
          </div>
          {/* Access point nav */}
          {sel.type==="mobile"&&hasAccGps&&<><div style={dSec}><span>Accès chemin</span><div style={{flex:1,height:1,background:"#E8E8E8"}}/></div>
          <div style={dCard}><div style={{display:"flex",gap:6}}>
            <a href={`https://waze.com/ul?ll=${sel.access_lat},${sel.access_lng}&navigate=yes`} target="_blank" rel="noopener noreferrer" style={{...dNavBtn,background:"#33CCFF"}}><I.Waze s={16}/> Waze</a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${sel.access_lat},${sel.access_lng}`} target="_blank" rel="noopener noreferrer" style={{...dNavBtn,background:"#34A853"}}><I.GMaps s={16}/> Maps</a>
          </div></div></>}
          {/* Nearby */}
          {gps&&(()=>{const nb=sites.filter(s=>s.id!==sel.id&&s.lat&&s.lng&&!(s.lat===0&&s.lng===0)).map(s=>({...s,_dist:dist(sel.lat,sel.lng,s.lat,s.lng)})).filter(s=>s._dist!==null).sort((a,b)=>a._dist-b._dist).slice(0,3);if(nb.length===0)return null;return<><div style={dSec}><span>À proximité</span><div style={{flex:1,height:1,background:"#E8E8E8"}}/></div><div style={dCard}>{nb.map((s,i)=><div key={s.id} onClick={()=>openSite(s)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:i<nb.length-1?"1px solid #F5F5F5":"none",cursor:"pointer"}}><SiteIcon type={s.type} size={28}/><span style={{fontSize:11,fontWeight:600,color:"#1A1A1A",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</span><span style={{fontSize:11,fontWeight:700,color:P}}>{s._dist<1?`${Math.round(s._dist*1000)}m`:`${s._dist.toFixed(1)}km`}</span></div>)}</div></>;})()}
          {/* ANFR */}
          {sel.type==="mobile"&&<><div style={dSec}><span>ANFR — Secteurs</span><div style={{flex:1,height:1,background:"#E8E8E8"}}/></div><div style={dCard}>{anfrLoading?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:12,color:"#999",fontSize:12}}><div style={S.spin}/>Chargement...</div>:anfr.length>0?<AnfrSectors data={anfr} siteLat={sel.lat} siteLng={sel.lng}/>:<p style={{color:"#CCC",fontSize:12,textAlign:"center",padding:8}}>{(!sel.lat||!sel.lng||(sel.lat===0&&sel.lng===0))?"Renseignez le GPS":"Aucune antenne ANFR"}</p>}</div></>}
          {/* Photos — horizontal carousel (Feature 13) */}
          <div style={dSec}><span>Photos ({photos.length}/5)</span><div style={{flex:1,height:1,background:"#E8E8E8"}}/></div>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,marginBottom:6}}>{photos.map((p,i)=><div key={p.id} style={{width:110,height:85,borderRadius:10,overflow:"hidden",flexShrink:0,position:"relative",cursor:"pointer"}} onClick={()=>setLb(i)}><img src={p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/><button onClick={e=>{e.stopPropagation();rmPhoto(p);}} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.6)",border:"none",borderRadius:10,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer",fontSize:10}}>×</button></div>)}{photos.length<5&&<label style={{width:90,height:85,borderRadius:10,border:"2px dashed #DDD",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#BBB",fontSize:10,gap:4}}>{upl?<div style={S.spin}/>:<><I.Cam/><span>Ajouter</span></>}<input type="file" accept="image/*" multiple onChange={handlePhoto} style={{display:"none"}}/></label>}</div>
          {/* Comments */}
          <div style={dSec}><span>Notes</span><div style={{flex:1,height:1,background:"#E8E8E8"}}/></div>
          <div style={dCard}><div style={{maxHeight:200,overflowY:"auto",marginBottom:6}}>{comments.length===0&&<p style={{color:"#CCC",fontSize:12,textAlign:"center",padding:8}}>Aucun commentaire</p>}{comments.map(c=><div key={c.id} style={{display:"flex",gap:6,padding:"6px 0",borderBottom:"1px solid #F5F5F5"}}><TechAvatar code={c.technician_code} name={techAvatars[c.technician_code]?.name} url={techAvatars[c.technician_code]?.url} size={24} fontSize={9}/><div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,fontWeight:700,color:P}}>{techAvatars[c.technician_code]?.name||c.technician_code}</span><span style={{fontSize:8,color:"#BBB"}}>{new Date(c.created_at).toLocaleString("fr",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span></div><p style={{fontSize:11,color:c.content?.startsWith("TOTEMBOX")?"#D32F2F":"#333",fontWeight:c.content?.startsWith("TOTEMBOX")?700:400,margin:"2px 0 0",lineHeight:1.4}}>{c.content?.startsWith("TOTEMBOX")?"[TOTEMBOX] "+c.content:c.content}</p></div></div>)}</div><div style={{display:"flex",gap:6}}><input type="text" value={nc} onChange={e=>setNc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addComment()} placeholder="Ajouter..." style={{...S.fi,flex:1,fontSize:12}}/><button onClick={addComment} style={{...S.subBtn,flex:"none",padding:"10px 14px",fontSize:12}}>OK</button></div></div>
          {/* History timeline (#9) */}
          <div style={dSec}><span>Historique</span><div style={{flex:1,height:1,background:"#E8E8E8"}}/></div>
          <div style={dCard}><SiteHistorySection siteId={sel.id} techs={Object.entries(techAvatars).map(([code,v])=>({code,name:v?.name}))}/></div>
          {/* Delete */}
          <button style={{...S.delBtn,marginTop:10}} onClick={()=>deleteSite(sel.id)}><I.Del/> Supprimer</button>
        </>}
        <div style={{height:40}}/>
      </div>
      {lb!==null&&photos[lb]&&<div className="lb" onClick={()=>setLb(null)}><button onClick={e=>{e.stopPropagation();setLb(null);}} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"#fff",fontSize:28,cursor:"pointer"}}>×</button><img src={photos[lb]?.url} alt="" onClick={e=>e.stopPropagation()}/><div style={{display:"flex",gap:20,marginTop:16}} onClick={e=>e.stopPropagation()}><button onClick={()=>setLb(Math.max(0,lb-1))} style={S.lbBtn}>‹</button><span style={{color:"#999",fontSize:13}}>{lb+1}/{photos.length}</span><button onClick={()=>setLb(Math.min(photos.length-1,lb+1))} style={S.lbBtn}>›</button></div></div>}
      {confirmDlg&&<ConfirmModal msg={confirmDlg.msg} danger={confirmDlg.danger} onYes={confirmDlg.onYes} onNo={()=>setConfirmDlg(null)}/>}
      {toast&&<Toasty key={toastKey} m={toast}/>}
    </div>;
  }

  // ---- NOTES (4 vues hiérarchiques) ----
  if(page==="notes"||page==="notebook"||page==="section"||page==="note"){
    return<NotesRouter page={page} setPage={setPage} auth={auth} th={th} toast={toast} toastKey={toastKey} flash={flash}/>;
  }

  // ---- DIRECTORY (annuaire) ----
  if(page==="directory"){
    return<DirectoryPanel setPage={setPage} auth={auth} th={th} toast={toast} toastKey={toastKey} flash={flash}/>;
  }

  // ---- GAME (Bloberie) ----
  if(page==="game"){
    return<BloberieGame setPage={setPage} auth={auth} flash={flash}/>;
  }

  // ---- TOWER DEFENSE (Drive TD) ----
  if(page==="td"){
    return<DriveTD setPage={setPage} auth={auth} flash={flash}/>;
  }

  // ---- BACTERIA ----
  if(page==="bacteria"){
    return<DriveBacteria setPage={setPage} auth={auth} flash={flash}/>;
  }

  // ---- MY ACTIVITY (#7) ----
  if(page==="myactivity"){
    return<MyActivityPanel setPage={setPage} auth={auth} flash={flash}/>;
  }


  // ---- HOME ----
  // Pull to refresh — simple approach (disabled when sheet open)
  const onPullStart=e=>{if(page!=="home"||selStation)return;pullRef.current=e.touches[0].clientY;};
  const onPullEnd=e=>{if(!pullRef.current)return;if(page!=="home"||selStation){pullRef.current=null;return;}if(e.changedTouches[0].clientY-pullRef.current>100&&window.scrollY===0){flash("Actualisation...");Promise.all([fetchSites(),fetchStations()]).then(()=>flash("Actualisé ✓"));}pullRef.current=null;};


  return<div onTouchStart={onPullStart} onTouchEnd={onPullEnd}>
    <div style={{position:"sticky",top:0,zIndex:100,overflow:"hidden",background:th.header,padding:"14px 14px 10px"}} className="drv-header">
      {/* Aurora subtle */}
      <div style={{position:"absolute",top:-30,left:"10%",width:"80%",height:60,background:`radial-gradient(ellipse,${th.accent}14,transparent 70%)`,filter:"blur(35px)",pointerEvents:"none"}}/>

      <div style={{position:"relative"}}>
        {/* Welcome + logo */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,animation:"greetFade .5s ease both"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
            <button onClick={()=>{haptic(10);setShowDrawer(true);}} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,animation:"greetFade .4s ease both"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            {(()=>{const prenom=(auth.name||"").split(" ")[0]||auth.code;const h=new Date().getHours();const txt=h<5?"Bonne nuit, ":h<9?"Bonjour, ":h<12?"Bonne matinée, ":h<14?"Bon appétit, ":h<17?"Bon après-midi, ":h<20?"Bonne fin de journée, ":"Bonne soirée, ";return<div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flex:1,animation:"greetFade .5s ease .1s both"}}><p style={{color:"#fff",fontSize:17,fontWeight:700,margin:0,letterSpacing:-.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{txt}<span style={{color:th.accent}}>{prenom}</span></p></div>;})()}
          </div>
          <div style={{animation:"logoPop .5s cubic-bezier(.34,1.56,.64,1) both",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0,marginLeft:8}}><Logo s={.55}/><span style={{fontSize:8,color:"rgba(255,255,255,.2)",fontWeight:600,letterSpacing:.5,animation:"subFade .4s ease .4s both"}}>v{APP_VERSION}</span></div>
        </div>

        {/* Search */}
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <div style={{position:"relative",flex:1}}>
            <div style={S.sIcW}><I.Search/></div>
            <input type="text" placeholder="Nom, NIDT/Trigramme, adresse..." value={q} onChange={e=>setQ(e.target.value)} style={S.sIn}/>
            {q&&<button style={S.clr} onClick={()=>setQ("")}><I.X/></button>}
          </div>
          <button onClick={voiceSearch} style={{...S.hBtn,width:42,height:42,flexShrink:0,color:voiceListening?"#FF4444":th.accent,background:voiceListening?"rgba(255,68,68,.2)":"rgba(255,255,255,.08)",animation:voiceListening?"voicePulse 1.2s infinite":"none",border:voiceListening?"2px solid #FF4444":"1px solid rgba(255,255,255,.06)"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={voiceListening?"#FF4444":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
          </button>
        </div>

        {/* Filters + gear/plus */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",animation:"headerBtns .4s ease .2s both"}}>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {["all","fav","mobile","fixe","poi","station"].map(f=><button key={f} onClick={()=>{haptic(8);setFilt(f);if(f!=="station")setStationCard("all");}} style={{...S.chip,...(filt===f?{background:f==="fav"?"#FFB300":f==="poi"?"#E67E22":f==="station"?"#1565C0":th.primary,color:"#fff",borderColor:f==="fav"?"#FFB300":f==="poi"?"#E67E22":f==="station"?"#1565C0":th.primary}:{}),fontSize:10,padding:"4px 9px"}}>{f==="all"?"Tous":f==="fav"?"★ Favoris":f==="mobile"?"Mobile":f==="fixe"?"Fixe":f==="poi"?"POI":"Station"}</button>)}
          </div>
          <div style={{display:"flex",gap:4}}>
            {filt!=="station"&&<button style={{...S.hBtn,width:34,height:34,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.06)",color:th.accent}} onClick={()=>setShowAdd(true)}><I.Plus/></button>}
          </div>
        </div>
        {/* Station sub-filters */}
        {filt==="station"&&<div style={{display:"flex",gap:4,marginTop:6}}>
          {[["all","Toutes"],["wex","WEX"],["gr","GR"]].map(([k,l])=><button key={k} onClick={()=>setStationCard(k)} style={{padding:"4px 10px",borderRadius:12,border:stationCard===k?`1px solid ${k==="wex"?"#1565C0":k==="gr"?"#D32F2F":th.accent}`:"1px solid rgba(255,255,255,.1)",background:stationCard===k?(k==="wex"?"#1565C0":k==="gr"?"#D32F2F":th.accent+"33"):"transparent",color:stationCard===k?"#fff":"rgba(255,255,255,.4)",fontSize:10,fontWeight:700,cursor:"pointer"}}>{l}</button>)}
          <span style={{marginLeft:"auto",fontSize:9,color:"rgba(255,255,255,.25)",alignSelf:"center"}}>{(FUELS.find(f=>f.key===fuelPref)||{}).label||"Gazole"}</span>
        </div>}
      </div>
    </div>

    {/* Announcement banner */}
    {activeAnnonce&&!annonceDismissed&&<div style={{margin:"0 12px 6px",background:"linear-gradient(135deg,#1565C0,#1976D2)",borderRadius:10,padding:"10px 12px",boxShadow:"0 3px 12px rgba(21,101,192,.25)",display:"flex",gap:8,alignItems:"flex-start"}}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:12,fontWeight:600,color:"#fff",margin:0,lineHeight:1.4}}>{activeAnnonce.message}</p>
        <span style={{fontSize:9,color:"rgba(255,255,255,.5)",marginTop:3,display:"block"}}>{activeAnnonce.author_name||activeAnnonce.author_code}</span>
      </div>
      <button onClick={()=>setAnnonceDismissed(true)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:6,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,cursor:"pointer",flexShrink:0}}>×</button>
    </div>}

    {/* Tab bar: List / Map */}
    <div style={{display:"flex",background:th.card,borderBottom:`1px solid ${theme==="amoled"?"#222":"#EEE"}`,position:"sticky",top:0,zIndex:50}}>
      <div style={{position:"absolute",bottom:0,left:tab==="list"?"0%":"50%",width:"50%",height:2,background:th.primary,transition:"left .25s cubic-bezier(.4,0,.2,1)",borderRadius:1}}/>
      <button onClick={()=>{haptic(10);setTab2("list");if(tab==="list")setSort(sortBy==="name"?"dist":sortBy==="dist"?"nogps":"name");}} style={{flex:1,padding:"10px",border:"none",background:"none",fontSize:12,fontWeight:700,color:tab==="list"?th.primary:"#999",borderBottom:"2px solid transparent",cursor:"pointer",transition:"color .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>Liste <span style={{color:th.accent,fontSize:10}}>{list.length}</span>{tab==="list"&&<span style={{fontSize:9,color:sortBy==="nogps"?"#E65100":"#999",background:sortBy==="nogps"?"#FFF3E0":theme==="amoled"?"#222":"rgba(0,0,0,.05)",padding:"2px 6px",borderRadius:8}}>{sortBy==="name"?"A-Z":sortBy==="dist"?"km":"GPS ?"}</span>}</button>
      <button onClick={()=>{haptic(10);setTab2("map");}} style={{flex:1,padding:"10px",border:"none",background:"none",fontSize:12,fontWeight:700,color:tab==="map"?th.primary:"#999",borderBottom:"2px solid transparent",cursor:"pointer",transition:"color .2s"}}>Carte</button>
    </div>

    {/* MAP VIEW */}
    {tab==="map"?<div style={{animation:"fadeIn .3s ease"}}><MapView sites={list} onSelect={s=>s._station?setSelStation(s):openSite(s)} myPos={geo.p} th={th} fuelPref={fuelPref}/></div>:

    /* LIST VIEW */
    <div style={{...S.list,background:th.bg,animation:"fadeIn .3s ease"}} className="drv-list">
      {(loading||(filt==="station"&&stationsLoading))?<SkeletonList count={8} th={th}/>
      :list.length===0?<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 30px",textAlign:"center",gridColumn:"1/-1"}}>
        <div style={{width:70,height:70,borderRadius:35,background:"#F5F5F5",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6" strokeLinecap="round"/></svg></div>
        <div style={{fontSize:15,fontWeight:800,color:"#1A1A1A",marginBottom:4}}>Aucun résultat</div>
        <div style={{fontSize:12,color:"#999",lineHeight:1.5}}>{q?`Aucun site pour "${q}"`:`Aucun ${filt==="station"?"station":filt==="fav"?"favori":"site"} trouvé`}</div>
        {q&&<button onClick={()=>setQ("")} style={{marginTop:12,padding:"8px 18px",borderRadius:10,border:`1.5px solid ${th.primary}`,background:"#fff",color:th.primary,fontSize:12,fontWeight:700,cursor:"pointer"}}>Effacer la recherche</button>}
      </div>
      :list.map((s,i)=>{
        // Station card
        if(s._station){
          const cardColor=s.card==="wex"?"#1565C0":"#D32F2F";
          const fuelInfo=FUELS.find(f=>f.key===fuelPref);
          const fuelApi=fuelInfo?.api||"gazole_prix";
          const majKey=fuelApi.replace("_prix","_maj");
          const majDate=s[majKey];
          const ago=majDate?timeAgo(majDate):"";
          // Freshness color: green <24h, orange 1-3d, red >3d
          const majMs=majDate?Date.now()-new Date(majDate).getTime():Infinity;
          const freshColor=majMs<86400000?"#1B8A6B":majMs<259200000?"#E67E22":"#D32F2F";
          // Display name: "Marque Ville"
          const displayName=`${s.brand||"Station"} ${s.address.split(",").pop()?.trim()||""}`.trim();
          return<button key={s.id} style={{...S.sCard,background:th.card,animation:`fadeUp .3s ease ${Math.min(i,20)*30}ms both`,border:s._rupture?"1.5px solid #FFCDD2":"1px solid #EEE"}} onClick={()=>setSelStation(s)}>
            <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
              <div style={{width:42,height:42,borderRadius:13,background:s.card==="wex"?"linear-gradient(135deg,#1565C0,#42A5F5)":"linear-gradient(135deg,#D32F2F,#EF5350)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:s.card==="wex"?"0 4px 12px rgba(21,101,192,.4), inset 0 1px 0 rgba(255,255,255,.3)":"0 4px 12px rgba(211,47,47,.4), inset 0 1px 0 rgba(255,255,255,.3)",position:"relative",overflow:"hidden",flexShrink:0}}><div style={{position:"absolute",top:0,left:0,right:0,height:"50%",background:"linear-gradient(180deg,rgba(255,255,255,.25),transparent)"}}/><div style={{position:"relative",zIndex:1,color:"#fff",filter:"drop-shadow(0 1px 2px rgba(0,0,0,.2))"}}><I.Fuel/></div></div>
              <div style={{display:"flex",flexDirection:"column",gap:1,minWidth:0}}>
                <span style={{...S.sNm,color:th.text}}>{displayName}</span>
                <span style={S.sAd}>{s.address}</span>
                <div style={{display:"flex",gap:4,marginTop:1,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:4,background:s.card==="wex"?"#E3F2FD":"#FFEBEE",color:cardColor,border:`1px solid ${s.card==="wex"?"#BBDEFB":"#FFCDD2"}`}}>{s.card==="wex"?"WEX":"GR"}</span>
                  {s._rupture&&<span style={{fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:4,background:"#FFEBEE",color:"#D32F2F",border:"1px solid #FFCDD2"}}>RUPTURE</span>}
                  {s.ruptures.length>0&&!s._rupture&&<span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:4,background:"#FFF8E1",color:"#FF8F00"}}>{s.ruptures.length} rupture{s.ruptures.length>1?"s":""}</span>}
                  {fuelInfo?.total&&GR_BRANDS.some(g=>s.brand?.toUpperCase().includes(g))&&<span style={{fontSize:7,fontWeight:700,padding:"1px 4px",borderRadius:3,background:"#FFF3E0",color:"#E65100"}}>Excellium</span>}
                  {s._d!==null&&s._d<999&&<span style={{fontSize:8,color:"#999",fontWeight:600}}>{s._d<1?`${Math.round(s._d*1000)}m`:`${s._d.toFixed(1)}km`}</span>}
                </div>
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0,marginLeft:6}}>
              {s._rupture?<span style={{fontSize:12,fontWeight:700,color:"#D32F2F"}}>Rupture</span>
              :s._nonPropose?<span style={{fontSize:11,color:"#BBB"}}>Non proposé</span>
              :s._price?<><div style={{fontSize:16,fontWeight:800,color:s._priceColor||"#1A1A1A"}}>{s._price.toFixed(3)}<span style={{fontSize:10}}>€</span></div><div style={{fontSize:8,color:fuelInfo?.color||"#999",fontWeight:700}}>{fuelInfo?.short}</div></>
              :<span style={{fontSize:11,color:"#BBB"}}>—</span>}
              {ago&&<div style={{fontSize:10,color:freshColor,marginTop:2,fontWeight:600}}>màj {ago}</div>}
            </div>
          </button>;
        }
        // Normal site card
        const gps=s.lat&&s.lng&&!(s.lat===0&&s.lng===0);
        return<button key={s.id} style={{...S.sCard,background:th.card,animation:`fadeUp .3s ease ${Math.min(i,20)*30}ms both`}} onClick={()=>openSite(s)}>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
            {s._f&&<span style={{fontSize:11,flexShrink:0}}>★</span>}
            <div style={{position:"relative"}}><SiteIcon type={s.type} size={42}/><div style={{position:"absolute",bottom:-1,right:-1,width:10,height:10,borderRadius:5,background:gps?"#4CAF50":"#F44336",border:"2px solid #fff"}}/></div>
            <div style={{display:"flex",flexDirection:"column",gap:1,minWidth:0}}>
              <span style={{...S.sNm,color:th.text}}>{s.name}</span>
              <span style={S.sAd}>{s.poi_category?s.poi_category+" · ":""}{s.code_nidt?s.code_nidt+" · ":""}{s.address||""}</span>
              <div style={{display:"flex",gap:3,marginTop:1}}>
                {s.needs_4x4&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:4,background:"#FBE9E7",color:"#BF360C",fontWeight:700}}>4x4</span>}
                {s.needs_terrasse&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:4,background:"#E3F2FD",color:"#1565C0",fontWeight:700}}>Terrasse</span>}
                {s.needs_binome&&!s.needs_terrasse&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:4,background:"#FFF8E1",color:"#FF8F00",fontWeight:700}}>Binôme</span>}
                {TOTEMBOX_NIDTS.has(s.code_nidt)&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:4,background:"#D32F2F",color:"#fff",fontWeight:800}}>TOTEM</span>}
                {s.has_wc&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:4,background:"#E8F5E9",color:"#2E7D32",fontWeight:700}}>WC</span>}
                {s.has_abloy&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:4,background:"#E3F2FD",color:"#0D47A1",fontWeight:700}}>Chargeur Abloy</span>}
                {!gps&&<span style={{fontSize:7,padding:"1px 5px",borderRadius:4,background:"#FFF3E0",color:"#E65100",fontWeight:700}}>GPS manquant</span>}
                {s._d!==null&&s._d<999&&<span style={{fontSize:8,color:"#999"}}>{s._d<1?`${Math.round(s._d*1000)}m`:`${s._d.toFixed(1)}km`}</span>}
              </div>
            </div>
          </div><I.Chev/>
        </button>;
      })}
    </div>}

    {showAdd&&<SiteForm title="Nouveau site" onClose={()=>setShowAdd(false)} onSave={addSite} myPos={geo.p}/>}
    {showAbout&&<AboutModal onClose={()=>setShowAbout(false)}/>}
    {showSettings&&<SettingsPanel auth={auth} theme={theme} changeTheme={changeTheme} th={th} nearby={nearby} setNearby={setNearby} radius={radius} setRadius={setRadius} fetchSites={()=>{fetchSites();fetchStations();}} flash={flash} logout={logout} setPage={setPage} onClose={()=>setShowSettings(false)} setShowAbout={()=>{setShowSettings(false);setShowAbout(true);}} fuelPref={fuelPref} changeFuel={changeFuel} windThreshold={windThreshold} changeWindThr={changeWindThr} uploadAvatar={uploadAvatar} techAvatars={techAvatars}/>}
    {showDrawer&&<Drawer auth={auth} th={th} setPage={setPage} setFilt={setFilt} onClose={()=>setShowDrawer(false)} openSettings={()=>{setShowDrawer(false);setShowSettings(true);}} openAbout={()=>{setShowDrawer(false);setShowAbout(true);}} logout={logout} flash={flash} darkMode={darkMode} setDarkMode={setDarkMode}/>}

    {selStation&&<StationDetail station={selStation} fuelPref={fuelPref} th={th} geo={geo} onClose={()=>setSelStation(null)} onRefresh={fetchStations}/>}
    {confirmDlg&&<ConfirmModal msg={confirmDlg.msg} danger={confirmDlg.danger} onYes={confirmDlg.onYes} onNo={()=>setConfirmDlg(null)}/>}
    {toast&&<Toasty key={toastKey} m={toast}/>}
    {scrollY>100&&<div style={{position:"fixed",top:0,left:0,right:0,height:2,zIndex:200,background:"rgba(0,0,0,.05)"}}><div style={{height:"100%",background:th.primary,width:`${Math.min(scrollY/(document.documentElement.scrollHeight-window.innerHeight)*100,100)}%`,transition:"width .1s",borderRadius:1}}/></div>}
    {showBackTop&&<button onClick={scrollToTop} style={{position:"fixed",bottom:20,right:16,width:40,height:40,borderRadius:20,background:th.primary,color:"#fff",border:"none",boxShadow:"0 4px 16px rgba(0,0,0,.2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:150,animation:"fadeUp .3s ease",fontSize:18}}>↑</button>}
  </div>;
}

// ============================================================
// DUPLICATES PANEL — detect and merge duplicate sites
// ============================================================
function DuplicatesPanel({sites,reload,flash,auth}){
  const[threshold,setThreshold]=useState(50); // meters
  const[selPair,setSelPair]=useState(null);
  const[mergedData,setMergedData]=useState({});

  // Haversine distance in meters
  const distM=(a,b)=>{
    if(!a.lat||!a.lng||!b.lat||!b.lng)return Infinity;
    if((a.lat===0&&a.lng===0)||(b.lat===0&&b.lng===0))return Infinity;
    const R=6371000;
    const dLat=(b.lat-a.lat)*Math.PI/180;
    const dLng=(b.lng-a.lng)*Math.PI/180;
    const h=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  };

  // Find duplicate pairs — optimized and safe
  const duplicates=useMemo(()=>{
    if(!sites||!Array.isArray(sites)||sites.length===0)return [];
    try{
      // First pass: index by code_nidt to find NIDT duplicates fast
      const byNidt={};
      const sitesWithGps=[];
      for(const s of sites){
        if(!s||s.deleted_at)continue;
        if(s.code_nidt&&typeof s.code_nidt==="string"&&s.code_nidt.trim()){
          const k=s.code_nidt.trim().toUpperCase();
          (byNidt[k]=byNidt[k]||[]).push(s);
        }
        if(s.lat&&s.lng&&!(s.lat===0&&s.lng===0)){
          sitesWithGps.push(s);
        }
      }
      const pairs=[];
      const seen=new Set();
      // NIDT duplicates (fast)
      for(const k in byNidt){
        const arr=byNidt[k];
        if(arr.length<2)continue;
        for(let i=0;i<arr.length;i++){
          for(let j=i+1;j<arr.length;j++){
            const a=arr[i],b=arr[j];
            const key=[a.id,b.id].sort().join("-");
            if(seen.has(key))continue;
            seen.add(key);
            pairs.push({a,b,reason:"nidt",distance:Math.round(distM(a,b))});
          }
        }
      }
      // GPS duplicates (only sites with valid GPS)
      for(let i=0;i<sitesWithGps.length;i++){
        for(let j=i+1;j<sitesWithGps.length;j++){
          const a=sitesWithGps[i],b=sitesWithGps[j];
          const key=[a.id,b.id].sort().join("-");
          if(seen.has(key))continue;
          // Quick lat/lng box pre-filter (cheap)
          if(Math.abs(a.lat-b.lat)>0.005||Math.abs(a.lng-b.lng)>0.005)continue;
          const d=distM(a,b);
          if(d<threshold){
            seen.add(key);
            pairs.push({a,b,reason:"gps",distance:Math.round(d)});
          }
        }
      }
      return pairs.sort((x,y)=>(x.reason==="nidt"?0:1)-(y.reason==="nidt"?0:1));
    }catch(e){
      console.error("Duplicates calc error:",e);
      return [];
    }
  },[sites,threshold]);

  // Open merge dialog for a pair
  const openMerge=(pair)=>{
    setSelPair(pair);
    // Initialize mergedData: prefer non-null values, prefer A for conflicts
    const fields=["name","type","address","code_nidt","anfr_support_id","lat","lng","technologies","needs_4x4","needs_terrasse","needs_binome","has_wc","has_abloy","poi_category"];
    const merged={};
    for(const f of fields){
      const va=pair.a[f],vb=pair.b[f];
      if(va&&!vb)merged[f]={value:va,from:"a"};
      else if(vb&&!va)merged[f]={value:vb,from:"b"};
      else merged[f]={value:va,from:"a"};
    }
    setMergedData(merged);
  };

  const pickField=(field,from)=>{
    const value=from==="a"?selPair.a[field]:selPair.b[field];
    setMergedData(md=>({...md,[field]:{value,from}}));
  };

  const doMerge=async()=>{
    if(!await confirmDark(`Fusionner ces 2 sites ?`,{danger:true,hint:`Le site "${selPair.b.name}" sera déplacé dans la corbeille. Ses données sélectionnées seront transférées vers "${selPair.a.name}".`,yesLabel:"Fusionner"}))return;
    try{
      // Build final data for site A (the keeper)
      const updates={};
      for(const[field,{value}] of Object.entries(mergedData))updates[field]=value;
      // Update A with merged data
      await dbPatch("sites",updates,`id=eq.${selPair.a.id}`);
      // Transfer related records from B to A
      try{await dbPatch("visits",{site_id:selPair.a.id},`site_id=eq.${selPair.b.id}`);}catch(e){}
      try{await dbPatch("comments",{site_id:selPair.a.id},`site_id=eq.${selPair.b.id}`);}catch(e){}
      try{await dbPatch("photos",{site_id:selPair.a.id},`site_id=eq.${selPair.b.id}`);}catch(e){}
      try{await dbPatch("ratings",{site_id:selPair.a.id},`site_id=eq.${selPair.b.id}`);}catch(e){}
      // Soft-delete B (goes to trash)
      await softDelete("site",selPair.b.id,selPair.b,auth);
      setSelPair(null);
      setMergedData({});
      reload();
      flash("Fusion effectuée ✓");
    }catch(e){flash("Erreur: "+e.message);}
  };

  const ignore=async(pair)=>{
    // Just mark visually as ignored for this session (doesn't persist)
    flash("Paire ignorée pour cette session");
    // Store in local state — for proper persistence, would need a 'ignored_duplicates' table
    pair._ignored=true;
    setSelPair(null);
  };

  // ===== MERGE DIALOG =====
  if(selPair){
    const fields=[
      ["name","Nom"],["type","Type"],["address","Adresse"],["code_nidt","NIDT/Trigramme"],
      ["anfr_support_id","ANFR"],["lat","Latitude"],["lng","Longitude"],
      ["technologies","Technos"],["poi_category","Catégorie POI"],
      ["needs_4x4","4x4"],["needs_terrasse","Terrasse"],["needs_binome","Binôme"],
      ["has_wc","WC"],["has_abloy","Chargeur Abloy"],
    ];
    const fmt=(v)=>{
      if(v===undefined||v===null||v==="")return <span style={{color:"#CCC",fontStyle:"italic"}}>vide</span>;
      if(Array.isArray(v))return v.join(", ")||<span style={{color:"#CCC",fontStyle:"italic"}}>vide</span>;
      if(typeof v==="boolean")return v?"✓":"—";
      return String(v);
    };

    return<>
      <Card>
        <h3 style={S.sec}>Fusion de sites</h3>
        <p style={{fontSize:11,color:"#666",marginBottom:10,lineHeight:1.5}}>
          Pour chaque champ, choisis la valeur à garder. Le site <b style={{color:P}}>A</b> sera conservé avec les valeurs sélectionnées. Le site <b style={{color:"#E65100"}}>B</b> sera déplacé dans la corbeille.
        </p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
          <div style={{background:"#E8F5E9",borderRadius:10,padding:"8px 10px",border:`2px solid ${P}`}}>
            <div style={{fontSize:9,fontWeight:700,color:P,textTransform:"uppercase",letterSpacing:1}}>Site A (gardé)</div>
            <div style={{fontSize:12,fontWeight:800,color:"#1A1A1A",marginTop:2}}>{selPair.a.name}</div>
            <div style={{fontSize:10,color:"#999",fontFamily:"monospace"}}>{selPair.a.code_nidt||"—"}</div>
          </div>
          <div style={{background:"#FFF3E0",borderRadius:10,padding:"8px 10px",border:"2px solid #E65100"}}>
            <div style={{fontSize:9,fontWeight:700,color:"#E65100",textTransform:"uppercase",letterSpacing:1}}>Site B (corbeille)</div>
            <div style={{fontSize:12,fontWeight:800,color:"#1A1A1A",marginTop:2}}>{selPair.b.name}</div>
            <div style={{fontSize:10,color:"#999",fontFamily:"monospace"}}>{selPair.b.code_nidt||"—"}</div>
          </div>
        </div>

        <div style={{maxHeight:400,overflowY:"auto",border:"1px solid #F0F0F0",borderRadius:10}}>
          {fields.map(([k,label])=>{
            const va=selPair.a[k],vb=selPair.b[k];
            const picked=mergedData[k]?.from||"a";
            const sameVal=JSON.stringify(va)===JSON.stringify(vb);
            if(sameVal&&(va===undefined||va===null||va===""))return null;
            return<div key={k} style={{padding:"8px 10px",borderBottom:"1px solid #F5F5F5"}}>
              <div style={{fontSize:9,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{label}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                <button onClick={()=>pickField(k,"a")} style={{textAlign:"left",padding:"6px 8px",borderRadius:7,border:picked==="a"?`2px solid ${P}`:"2px solid #F0F0F0",background:picked==="a"?`${P}12`:"#fff",cursor:"pointer",fontSize:11,color:"#333",wordBreak:"break-word"}}>
                  {fmt(va)}
                </button>
                <button onClick={()=>pickField(k,"b")} style={{textAlign:"left",padding:"6px 8px",borderRadius:7,border:picked==="b"?"2px solid #E65100":"2px solid #F0F0F0",background:picked==="b"?"#FFF3E0":"#fff",cursor:"pointer",fontSize:11,color:"#333",wordBreak:"break-word"}}>
                  {fmt(vb)}
                </button>
              </div>
            </div>;
          })}
        </div>

        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={()=>setSelPair(null)} style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #E8E8E8",background:"#fff",fontSize:12,fontWeight:700,color:"#666",cursor:"pointer"}}>Annuler</button>
          <button onClick={doMerge} style={{flex:2,padding:"10px",borderRadius:10,border:"none",background:P,color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer"}}>Fusionner</button>
        </div>
      </Card>
    </>;
  }

  // ===== LIST VIEW =====
  return<>
    <Card>
      <h3 style={S.sec}>🔍 Détection de doublons ({duplicates.length})</h3>
      <p style={{fontSize:11,color:"#666",marginBottom:10,lineHeight:1.5}}>
        Sites avec un <b>NIDT identique</b> ou une <b>position GPS très proche</b> sont listés ici comme potentiels doublons.
      </p>

      <div style={{marginBottom:12}}>
        <label style={{fontSize:10,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:6}}>Seuil GPS : {threshold}m</label>
        <input type="range" min="10" max="200" step="10" value={threshold} onChange={e=>setThreshold(+e.target.value)} style={{width:"100%"}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#BBB",marginTop:2}}>
          <span>10m</span><span>100m</span><span>200m</span>
        </div>
      </div>

      {duplicates.length===0?<div style={{textAlign:"center",padding:"30px 10px",color:"#CCC"}}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="1.5" style={{marginBottom:8}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <p style={{fontSize:13,fontWeight:700,color:"#4CAF50"}}>Aucun doublon détecté</p>
        <p style={{fontSize:11}}>Base de données saine au seuil de {threshold}m</p>
      </div>:
      duplicates.map((pair,i)=>
        <div key={i} style={{background:"#fff",borderRadius:12,padding:"10px 12px",marginBottom:6,border:"1px solid #F0F0F0",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:pair.reason==="nidt"?"#D32F2F":"#FF8F00"}}/>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:5,background:pair.reason==="nidt"?"#FFEBEE":"#FFF3E0",color:pair.reason==="nidt"?"#D32F2F":"#FF8F00",textTransform:"uppercase"}}>{pair.reason==="nidt"?"NIDT identique":`GPS ${pair.distance}m`}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 20px 1fr",gap:6,alignItems:"center",marginBottom:8}}>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pair.a.name}</div>
              <div style={{fontSize:9,color:"#999",fontFamily:"monospace"}}>{pair.a.code_nidt||"—"} · {pair.a.type}</div>
            </div>
            <div style={{textAlign:"center",color:"#CCC",fontSize:14}}>⇔</div>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pair.b.name}</div>
              <div style={{fontSize:9,color:"#999",fontFamily:"monospace"}}>{pair.b.code_nidt||"—"} · {pair.b.type}</div>
            </div>
          </div>
          <button onClick={()=>openMerge(pair)} style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:P,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Examiner et fusionner</button>
        </div>
      )}
    </Card>
  </>;
}

// ============================================================
// TRASH PANEL — Admin only, 30 day retention, restore or permanent delete
// ============================================================
function TrashPanel({auth,flash}){
  const[items,setItems]=useState([]);
  const[loading,setLoading]=useState(true);
  const[filterType,setFilterType]=useState("all");

  useEffect(()=>{loadTrash();},[]);

  const loadTrash=async()=>{
    setLoading(true);
    try{
      // Auto-purge items older than 30 days first
      const cutoff=new Date(Date.now()-30*24*3600*1000).toISOString();
      try{await dbDel("trash",`deleted_at=lt.${cutoff}`);}catch(e){}
      // Then load remaining
      const data=await dbGet("trash","order=deleted_at.desc&limit=200");
      setItems(data||[]);
    }catch(e){setItems([]);}
    setLoading(false);
  };

  const restore=async(item)=>{
    if(!await confirmDark(`Restaurer "${item.label}" ?`))return;
    try{
      const tableMap={site:"sites",note:"notes_content",notebook:"notebooks",section:"note_sections",contact:"directory",comment:"note_comments"};
      const table=tableMap[item.item_type];
      if(!table){flash("Type inconnu");return;}
      // Remove id from data to avoid conflicts (let DB assign new id)
      const {id,...data}=item.item_data||{};
      await dbPost(table,data);
      await dbDel("trash",`id=eq.${item.id}`);
      await loadTrash();
      flash("Restauré ✓");
    }catch(e){flash("Erreur: "+e.message);}
  };

  const purge=async(item)=>{
    if(!await confirmDark(`Supprimer "${item.label}" ?`,{danger:true,hint:"Action définitive, impossible à annuler",yesLabel:"Supprimer"}))return;
    try{
      await dbDel("trash",`id=eq.${item.id}`);
      await loadTrash();
      flash("Supprimé définitivement");
    }catch(e){flash("Erreur: "+e.message);}
  };

  const purgeAll=async()=>{
    if(!await confirmDark(`Vider la corbeille ?`,{danger:true,hint:`${items.length} éléments seront définitivement supprimés`,yesLabel:"Tout supprimer"}))return;
    try{
      await dbDel("trash","id=gt.0");
      await loadTrash();
      flash("Corbeille vidée");
    }catch(e){flash("Erreur: "+e.message);}
  };

  const filtered=filterType==="all"?items:items.filter(i=>i.item_type===filterType);

  const typeLabel={site:"Site",note:"Note",notebook:"Carnet",section:"Section",contact:"Contact",comment:"Commentaire"};
  const typeColor={site:"#1B8A6B",note:"#7B1FA2",notebook:"#E65100",section:"#FF8F00",contact:"#1565C0",comment:"#546E7A"};

  const counts=items.reduce((acc,i)=>{acc[i.item_type]=(acc[i.item_type]||0)+1;return acc;},{});

  return<>
    <Card>
      <h3 style={S.sec}><I.Del/> Corbeille ({items.length})</h3>
      <p style={{fontSize:11,color:"#999",marginBottom:10,lineHeight:1.5}}>Les éléments supprimés sont conservés ici pendant 30 jours avant suppression automatique. En tant qu'admin, tu peux restaurer ou supprimer définitivement.</p>
      
      {/* Type filter chips */}
      <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
        <button onClick={()=>setFilterType("all")} style={{padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,border:filterType==="all"?`1.5px solid ${P}`:"1.5px solid #E8E8E8",background:filterType==="all"?`${P}15`:"#fff",color:filterType==="all"?P:"#999",cursor:"pointer"}}>Tous ({items.length})</button>
        {Object.entries(counts).map(([type,n])=>
          <button key={type} onClick={()=>setFilterType(type)} style={{padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,border:filterType===type?`1.5px solid ${typeColor[type]}`:"1.5px solid #E8E8E8",background:filterType===type?`${typeColor[type]}15`:"#fff",color:filterType===type?typeColor[type]:"#999",cursor:"pointer"}}>{typeLabel[type]||type} ({n})</button>
        )}
      </div>

      {/* Items list */}
      {loading?<div style={{display:"flex",alignItems:"center",gap:8,padding:20,color:"#999",fontSize:12}}><div style={S.spin}/>Chargement...</div>:
       filtered.length===0?<div style={{textAlign:"center",padding:"30px 10px",color:"#CCC"}}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth="1.5" style={{marginBottom:8}}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <p style={{fontSize:13,fontWeight:600}}>Corbeille vide</p>
        <p style={{fontSize:11}}>Aucun élément supprimé</p>
      </div>:
      <>
        {filtered.map(item=>{
          const daysLeft=30-Math.floor((Date.now()-new Date(item.deleted_at).getTime())/86400000);
          const color=typeColor[item.item_type]||"#999";
          return<div key={item.id} style={{background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:5,border:"1px solid #F0F0F0",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:color}}/>
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:`${color}15`,color,textTransform:"uppercase"}}>{typeLabel[item.item_type]||item.item_type}</span>
                  <span style={{fontSize:8,fontWeight:600,color:daysLeft<=7?"#E65100":"#999"}}>Expire dans {daysLeft}j</span>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:"#1A1A1A",marginBottom:2,wordBreak:"break-word"}}>{item.label}</div>
                <div style={{fontSize:9,color:"#999"}}>Supprimé par {item.deleted_by_name||item.deleted_by_code} · {new Date(item.deleted_at).toLocaleDateString("fr",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                <button onClick={()=>restore(item)} style={{background:P,color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                  Restaurer
                </button>
                <button onClick={()=>purge(item)} style={{background:"#FFEBEE",color:"#D32F2F",border:"1px solid #FFCDD2",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Supprimer</button>
              </div>
            </div>
          </div>;
        })}
        {items.length>0&&<button onClick={purgeAll} style={{width:"100%",marginTop:10,padding:10,borderRadius:10,border:"1px solid #FFCDD2",background:"#FFEBEE",color:"#D32F2F",fontSize:11,fontWeight:700,cursor:"pointer"}}>Vider la corbeille ({items.length} éléments)</button>}
      </>}
    </Card>
  </>;
}

// ============================================================
// STATS PANEL — Top 10 / Audit / API usage
// ============================================================
function StatsPanel({sites,visits,activity,techs}){
  const[auditFilter,setAuditFilter]=useState("all");
  const[apiStats,setApiStats]=useState({today:0,week:0,month:0});

  // Track API calls — simple counter in localStorage
  useEffect(()=>{
    try{
      const key="drv_api_log";
      const log=JSON.parse(localStorage.getItem(key)||"[]");
      const now=Date.now();
      const day=24*3600*1000;
      const today=log.filter(t=>now-t<day).length;
      const week=log.filter(t=>now-t<7*day).length;
      const month=log.filter(t=>now-t<30*day).length;
      setApiStats({today,week,month});
    }catch(e){}
  },[]);

  // Top 10 sites most visited
  const topSites=useMemo(()=>{
    const counts={};
    visits.forEach(v=>{counts[v.site_id]=(counts[v.site_id]||0)+1;});
    return Object.entries(counts).map(([id,n])=>{
      const site=sites.find(s=>s.id===id);
      return{site,count:n};
    }).filter(x=>x.site).sort((a,b)=>b.count-a.count).slice(0,10);
  },[sites,visits]);

  // Audit trail from activity_log
  const audit=useMemo(()=>{
    return activity.filter(a=>auditFilter==="all"||a.action===auditFilter);
  },[activity,auditFilter]);

  // Cost estimate — Supabase free tier: 500MB DB, 50k MAU, 2GB bandwidth
  // Pro tier: $25/month. Estimation based on req count
  const estReqMonth=apiStats.month;
  const estDataPerReq=2; // ~2KB per request on average
  const estBandwidthMB=(estReqMonth*estDataPerReq)/1024;
  const estCost=estBandwidthMB<2048?0:Math.max(0,((estBandwidthMB-2048)/1024)*0.09);

  return<>
    {/* TOP 10 SITES (Feature 78) */}
    <Card>
      <h3 style={S.sec}>🏆 Top 10 sites les plus visités</h3>
      {topSites.length===0?<p style={{fontSize:12,color:"#999",textAlign:"center",padding:10}}>Aucune visite enregistrée</p>:
        topSites.map((x,i)=>{
          const medal=i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#E8E8E8";
          return<div key={x.site.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:i<topSites.length-1?"1px solid #F5F5F5":"none"}}>
            <span style={{width:22,height:22,borderRadius:11,background:medal,color:i<3?"#fff":"#666",fontSize:11,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{x.site.name}</div>
              <div style={{fontSize:9,color:"#999"}}>{x.site.code_nidt||"—"} · {x.site.type}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:16,fontWeight:900,color:P}}>{x.count}</div>
              <div style={{fontSize:8,color:"#BBB"}}>visite{x.count>1?"s":""}</div>
            </div>
          </div>;
        })
      }
    </Card>

    {/* API USAGE (Features 90 + 91) */}
    <Card>
      <h3 style={S.sec}>📊 Consommation API & coûts</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
        <div style={{textAlign:"center",padding:"10px 6px",borderRadius:10,background:"#E8F5E9",border:"1px solid #A5D6A7"}}>
          <div style={{fontSize:20,fontWeight:900,color:"#2E7D32"}}>{apiStats.today.toLocaleString()}</div>
          <div style={{fontSize:8,fontWeight:600,color:"#999"}}>Requêtes aujourd'hui</div>
        </div>
        <div style={{textAlign:"center",padding:"10px 6px",borderRadius:10,background:"#E3F2FD",border:"1px solid #90CAF9"}}>
          <div style={{fontSize:20,fontWeight:900,color:"#1565C0"}}>{apiStats.week.toLocaleString()}</div>
          <div style={{fontSize:8,fontWeight:600,color:"#999"}}>Cette semaine</div>
        </div>
        <div style={{textAlign:"center",padding:"10px 6px",borderRadius:10,background:"#FFF3E0",border:"1px solid #FFCC80"}}>
          <div style={{fontSize:20,fontWeight:900,color:"#E65100"}}>{apiStats.month.toLocaleString()}</div>
          <div style={{fontSize:8,fontWeight:600,color:"#999"}}>Ce mois</div>
        </div>
      </div>
      {/* Cost estimate */}
      <div style={{background:"#F7F7F8",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:11,fontWeight:600,color:"#666"}}>Bande passante estimée</span>
          <span style={{fontSize:13,fontWeight:800,color:"#333"}}>{estBandwidthMB<1024?estBandwidthMB.toFixed(1)+" MB":(estBandwidthMB/1024).toFixed(2)+" GB"}</span>
        </div>
        <div style={{height:6,borderRadius:3,background:"#E8E8E8",overflow:"hidden",marginBottom:4}}>
          <div style={{height:"100%",borderRadius:3,background:estBandwidthMB>2048?"#E65100":estBandwidthMB>1500?"#FF9800":"#4CAF50",width:`${Math.min(100,(estBandwidthMB/2048)*100)}%`,transition:"width .5s"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#999"}}>
          <span>0 MB</span><span>Limite gratuite: 2 GB</span>
        </div>
      </div>
      <div style={{background:estCost>0?"#FFEBEE":"#E8F5E9",borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"#666"}}>Coût mensuel estimé</div>
          <div style={{fontSize:8,color:"#BBB"}}>Plan Supabase {estCost>0?"Pro":"Free tier"}</div>
        </div>
        <div style={{fontSize:22,fontWeight:900,color:estCost>0?"#D32F2F":"#2E7D32"}}>{estCost.toFixed(2)}€</div>
      </div>
      <p style={{fontSize:9,color:"#BBB",marginTop:6,lineHeight:1.4,textAlign:"center"}}>Estimation basée sur le compteur local. Consulte le dashboard Supabase pour les chiffres exacts.</p>
    </Card>

    {/* AUDIT TRAIL (Feature 87) */}
    <Card>
      <h3 style={S.sec}>🔍 Journal d'activité</h3>
      <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
        {[["all","Tout"],["edit","Modif"],["photo","Photo"],["note","Note"],["create","Création"]].map(([k,l])=>
          <button key={k} onClick={()=>setAuditFilter(k)} style={{padding:"3px 10px",borderRadius:8,fontSize:10,fontWeight:700,border:auditFilter===k?`1.5px solid ${P}`:"1.5px solid #E8E8E8",background:auditFilter===k?`${P}15`:"#fff",color:auditFilter===k?P:"#999",cursor:"pointer"}}>{l}</button>
        )}
      </div>
      <div style={{maxHeight:400,overflowY:"auto"}}>
        {audit.length===0?<p style={{fontSize:12,color:"#999",textAlign:"center",padding:10}}>Aucune activité</p>:
          audit.slice(0,50).map(a=>{
            const cfg=ACT_CFG[a.action]||ACT_CFG.edit;
            const site=sites.find(s=>s.id===a.site_id);
            const fields=a.action==="edit"?parseActFields(a.details):null;
            const tech=techs.find(t=>t.code===a.technician_code);
            return<div key={a.id} style={{background:"#fff",borderRadius:10,borderLeft:`3px solid ${cfg.dot}`,padding:"8px 10px",marginBottom:5}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                <TechAvatar code={a.technician_code} name={tech?.name} url={tech?.avatar_url} size={20} fontSize={8}/>
                <span style={{fontSize:11,fontWeight:700,color:"#1A1A1A"}}>{tech?.name||a.technician_code}</span>
                <span style={{fontSize:9,color:cfg.dot,fontWeight:700,padding:"1px 5px",background:cfg.bg,borderRadius:3}}>{cfg.label}</span>
                <span style={{marginLeft:"auto",fontSize:9,color:"#BBB"}}>{new Date(a.created_at).toLocaleString("fr",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
              </div>
              <div style={{fontSize:10,color:"#666",paddingLeft:26}}>
                {site?<><b>{site.name}</b> {site.code_nidt&&<span style={{color:"#BBB",fontFamily:"monospace"}}>({site.code_nidt})</span>}</>:<span style={{color:"#BBB"}}>Site supprimé</span>}
                {fields&&<span style={{marginLeft:6}}>· Champs : {fields.join(", ")}</span>}
              </div>
            </div>;
          })
        }
        {audit.length>50&&<p style={{fontSize:10,color:"#999",textAlign:"center",padding:6}}>... et {audit.length-50} de plus</p>}
      </div>
    </Card>
  </>;
}

// ============================================================
// BLOBERIE GAME — Agar.io-like with bots + realtime multi via Supabase
// ============================================================

const BLOB_NAMES=[
  "Minitel 3615","Bi-Bop","RNIS 64k","Wanadoo 95","Numéris","Ericofon","Modem RTC",
  "ADSL 56k","Itineris","Transpac","Audiotel 3617","Fax Olivetti","Télex",
  "Ola Classic","Vidéotex","X25-Packet","PABX Matra","POTS","Frame-Relay","Alcatel 4400",
  "Inspecteur Câble","Gégé du NRA","Raymond Fibre","Ginette Cuivre","Tonton Huawei",
  "Jacqueline Nokia","Père Noël ADSL","Capitaine Faisceau","Lady Astreinte","Docteur Ping",
  "Le Coupe-Fibre","Madame Rupture","Pic Trafic","Rat des Gaines","Brouilleur Fou","Orage",
  "Mystère-NIDT","Pylône Fantôme","Câble Kaput","Antenne Tombée","Souris-dans-la-baie",
  "👔 Christel La Boss",
];
const BLOB_BAD=new Set(["Le Coupe-Fibre","Madame Rupture","Pic Trafic","Rat des Gaines","Brouilleur Fou","Orage","👔 Christel La Boss"]);
const BLOB_COLORS=["#4ECDC4","#FF8F00","#AB47BC","#66BB6A","#EF5350","#FFD54F","#42A5F5","#EC407A","#FF7043","#7E57C2"];

function BloberieGame({setPage,auth,flash}){
  // Screens: lobby | create | join | waiting | playing | dead
  const[screen,setScreen]=useState("lobby");
  const[color,setColor]=useState(BLOB_COLORS[0]);
  const[sessionCode,setSessionCode]=useState("");
  const[joinCode,setJoinCode]=useState("");
  const[withBots,setWithBots]=useState(true);
  const[weapons,setWeapons]=useState(false);
  const[session,setSession]=useState(null); // {id, code, host_code, status}
  const[lobbyPlayers,setLobbyPlayers]=useState([]);
  const[loading,setLoading]=useState(false);
  const channelRef=useRef(null);
  const pollRef=useRef(null);
  const nameRef=useRef(null);
  nameRef.current=auth.name||auth.code;

  // Cleanup channel on unmount
  useEffect(()=>()=>{if(channelRef.current){channelRef.current.unsubscribe?.();channelRef.current=null;}if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}},[]);

  const genCode=()=>{const L="ABCDEFGHJKMNPQRSTUVWXYZ";return Array.from({length:4},()=>L[Math.floor(Math.random()*L.length)]).join("");};

  const createSession=async(botsEnabled,weaponsEnabled)=>{
    setLoading(true);
    try{
      let code=genCode();
      // Ensure unique
      for(let i=0;i<5;i++){
        const ex=await dbGet("game_sessions",`code=eq.${code}&status=in.(waiting,playing)`);
        if(!ex||ex.length===0)break;
        code=genCode();
      }
      const [s]=await dbPost("game_sessions",{code,host_code:auth.code,status:"waiting",with_bots:botsEnabled,weapons:!!weaponsEnabled});
      // Auto-join as first player
      await dbPost("game_players",{session_id:s.id,player_code:auth.code,name:nameRef.current,color,x:0,y:0,mass:10,alive:true});
      setSession(s);
      setSessionCode(code);
      setWithBots(botsEnabled);
      setWeapons(!!weaponsEnabled);
      setScreen("waiting");
      startLobbyPoll(s.id);
    }catch(e){flash("Erreur : "+e.message);}
    setLoading(false);
  };

  const joinSession=async()=>{
    if(joinCode.length!==4){flash("Code à 4 lettres");return;}
    setLoading(true);
    try{
      const list=await dbGet("game_sessions",`code=eq.${joinCode.toUpperCase()}&status=eq.waiting&limit=1`);
      if(!list||list.length===0){flash("Partie introuvable ou déjà lancée");setLoading(false);return;}
      const s=list[0];
      await dbPost("game_players",{session_id:s.id,player_code:auth.code,name:nameRef.current,color,x:0,y:0,mass:10,alive:true});
      setSession(s);
      setSessionCode(s.code);
      setWithBots(!!s.with_bots);
      setWeapons(!!s.weapons);
      setScreen("waiting");
      startLobbyPoll(s.id);
    }catch(e){flash("Erreur : "+e.message);}
    setLoading(false);
  };

  const startLobbyPoll=(sessionId)=>{
    const poll=async()=>{
      try{
        const [s]=await dbGet("game_sessions",`id=eq.${sessionId}&limit=1`);
        if(!s)return;
        if(s.status==="playing"){
          setSession(s);
          setScreen("playing");
          if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}
          return;
        }
        const players=await dbGet("game_players",`session_id=eq.${sessionId}&order=id.asc`);
        setLobbyPlayers(players||[]);
      }catch(e){}
    };
    poll();
    pollRef.current=setInterval(poll,2000);
  };

  const startGame=async()=>{
    if(!session)return;
    try{
      await dbPatch("game_sessions",{status:"playing"},`id=eq.${session.id}`);
      setScreen("playing");
      if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}
    }catch(e){flash("Erreur : "+e.message);}
  };

  const leaveSession=async()=>{
    try{
      if(session){
        await dbDel("game_players",`session_id=eq.${session.id}&player_code=eq.${auth.code}`);
        // If host leaves, end session
        if(session.host_code===auth.code){
          await dbPatch("game_sessions",{status:"ended"},`id=eq.${session.id}`);
        }
      }
    }catch(e){}
    if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}
    setSession(null);
    setLobbyPlayers([]);
    setScreen("lobby");
  };

  const quitGame=async()=>{
    await leaveSession();
    setPage("home");
  };

  const DARK_BG="linear-gradient(170deg,#0a2e24 0%,#0d1b2a 100%)";

  // ========== PLAYING SCREEN ==========
  if(screen==="playing"&&session){
    return<BloberieArena session={session} auth={auth} color={color} withBots={withBots} weapons={weapons} onQuit={quitGame} onDeath={()=>setScreen("dead")} flash={flash}/>;
  }

  // ========== DEAD SCREEN — show "rejouer" ==========
  if(screen==="dead"){
    const quickRestart=async()=>{
      // Clean up current session state then re-create solo
      if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}
      setSession(null);
      setLobbyPlayers([]);
      // Re-create a solo session with same settings (bots + weapons)
      await createSession(withBots,weapons);
      // Auto-start immediately (host is solo)
      setTimeout(async()=>{
        try{
          // Find the newly created session and start it
          const list=await dbGet("game_sessions",`host_code=eq.${auth.code}&status=eq.waiting&order=created_at.desc&limit=1`);
          if(list&&list[0]){
            await dbPatch("game_sessions",{status:"playing"},`id=eq.${list[0].id}`);
            setSession(list[0]);
            setScreen("playing");
          }
        }catch(e){flash("Erreur relance : "+e.message);}
      },400);
    };
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,color:"#fff",animation:"fadeIn .3s ease"}}>
      <div style={{fontSize:56,marginBottom:10}}>💀</div>
      <div style={{fontSize:24,fontWeight:900,color:"#EF5350",marginBottom:8}}>Tu as été mangé</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:24}}>Fin de partie</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,width:"100%",maxWidth:280}}>
        <button onClick={quickRestart} style={{padding:"13px 22px",borderRadius:11,border:"none",background:"linear-gradient(135deg,#1B8A6B,#4ECDC4)",color:"#fff",fontSize:14,fontWeight:900,cursor:"pointer",boxShadow:"0 4px 14px rgba(27,138,107,.5)",letterSpacing:1,textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Rejouer
        </button>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setScreen("lobby");setSession(null);}} style={{flex:1,padding:"11px",borderRadius:11,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.08)",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer"}}>Retour lobby</button>
          <button onClick={quitGame} style={{flex:1,padding:"11px",borderRadius:11,border:"1px solid rgba(239,83,80,.3)",background:"rgba(239,83,80,.15)",color:"#FF6B6B",fontSize:12,fontWeight:800,cursor:"pointer"}}>Quitter</button>
        </div>
      </div>
    </div>;
  }

  // ========== WAITING ROOM ==========
  if(screen==="waiting"){
    const isHost=session?.host_code===auth.code;
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff",animation:"fadeIn .3s ease"}}>
      <div style={{padding:"12px 14px",position:"relative",flexShrink:0}}>
        <div style={{position:"absolute",top:-20,right:-20,width:140,height:140,background:`radial-gradient(circle,${A}33,transparent 70%)`,filter:"blur(30px)",pointerEvents:"none"}}/>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          <button onClick={leaveSession} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
          <span style={{color:"#fff",fontSize:16,fontWeight:900,flex:1}}>Salle d'attente</span>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 14px"}}>
        <div style={{textAlign:"center",padding:"20px 0",position:"relative"}}>
          <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:200,height:200,background:`radial-gradient(circle,${A}55,transparent 70%)`,filter:"blur(40px)",pointerEvents:"none"}}/>
          <div style={{fontSize:11,color:"rgba(255,255,255,.5)",letterSpacing:2,textTransform:"uppercase",fontWeight:700,marginBottom:6,position:"relative",zIndex:1}}>Code de la partie</div>
          <div style={{fontSize:48,fontWeight:900,letterSpacing:8,background:`linear-gradient(135deg,${A},${P})`,WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",fontFamily:"monospace",position:"relative",zIndex:1}}>{sessionCode}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4,position:"relative",zIndex:1}}>{withBots?"Avec bots":"Sans bots"} · Partage ce code avec tes collègues</div>
        </div>

        <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,border:"1px solid rgba(255,255,255,.06)",padding:12,marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Joueurs connectés ({lobbyPlayers.length})</div>
          {lobbyPlayers.length===0?<div style={{fontSize:12,color:"rgba(255,255,255,.4)",textAlign:"center",padding:10}}>En attente...</div>:
          lobbyPlayers.map(p=>
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <div style={{width:30,height:30,borderRadius:9,background:`linear-gradient(135deg,${p.color},${p.color}cc)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:12,boxShadow:`0 2px 8px ${p.color}55`}}>{(p.name||"?")[0].toUpperCase()}</div>
              <span style={{flex:1,fontSize:13,fontWeight:700}}>{p.name||p.player_code}</span>
              {p.player_code===session.host_code&&<span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:5,background:"rgba(76,205,196,.2)",color:A,textTransform:"uppercase"}}>Hôte</span>}
              {p.player_code===auth.code&&<span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:5,background:"rgba(255,213,79,.2)",color:"#FFD54F",textTransform:"uppercase"}}>Toi</span>}
            </div>
          )}
        </div>

        {isHost?<button onClick={startGame} disabled={lobbyPlayers.length===0} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:lobbyPlayers.length>0?"linear-gradient(135deg,#1B8A6B,#4ECDC4)":"rgba(255,255,255,.08)",color:"#fff",fontSize:14,fontWeight:900,cursor:lobbyPlayers.length>0?"pointer":"not-allowed",boxShadow:lobbyPlayers.length>0?"0 6px 20px rgba(27,138,107,.5)":"none",letterSpacing:1,textTransform:"uppercase"}}>▶ Démarrer la partie</button>:
        <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.5)",padding:10}}>En attente du lancement par l'hôte...</div>}
      </div>
    </div>;
  }

  // ========== CREATE SCREEN ==========
  if(screen==="create"){
    const[botsSel,weaponsSel]=[withBots,weapons];
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
      <div style={{padding:"12px 14px"}}>
        <button onClick={()=>setScreen("lobby")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
      </div>
      <div style={{flex:1,padding:"10px 20px",display:"flex",flexDirection:"column",justifyContent:"center",maxWidth:400,width:"100%",margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:28,fontWeight:900,marginBottom:4}}>Créer une partie</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>Configure ta partie</div>
        </div>

        {/* Bots toggle */}
        <div style={{background:"rgba(255,255,255,.04)",borderRadius:14,padding:14,border:"1px solid rgba(255,255,255,.08)",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:botsSel?`linear-gradient(135deg,${A},${P})`:"rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800}}>Bots IA</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>18 adversaires (Minitel, Christel La Boss...)</div>
            </div>
            <button onClick={()=>setWithBots(!withBots)} style={{width:46,height:26,borderRadius:13,border:"none",background:botsSel?A:"rgba(255,255,255,.1)",position:"relative",cursor:"pointer",transition:"background .2s"}}>
              <div style={{position:"absolute",top:3,left:botsSel?23:3,width:20,height:20,borderRadius:10,background:"#fff",transition:"left .2s",boxShadow:"0 2px 4px rgba(0,0,0,.3)"}}/>
            </button>
          </div>
        </div>

        {/* Weapons toggle */}
        <div style={{background:"rgba(255,255,255,.04)",borderRadius:14,padding:14,border:"1px solid rgba(255,255,255,.08)",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:weaponsSel?"linear-gradient(135deg,#FF6B6B,#EF5350)":"rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🔫</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800}}>Armes</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>Tire au tap, -5 masse à la cible (coût 2)</div>
            </div>
            <button onClick={()=>setWeapons(!weapons)} style={{width:46,height:26,borderRadius:13,border:"none",background:weaponsSel?"#EF5350":"rgba(255,255,255,.1)",position:"relative",cursor:"pointer",transition:"background .2s"}}>
              <div style={{position:"absolute",top:3,left:weaponsSel?23:3,width:20,height:20,borderRadius:10,background:"#fff",transition:"left .2s",boxShadow:"0 2px 4px rgba(0,0,0,.3)"}}/>
            </button>
          </div>
        </div>

        <button onClick={()=>createSession(withBots,weapons)} disabled={loading} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#1B8A6B,#4ECDC4)",color:"#fff",fontSize:14,fontWeight:900,cursor:loading?"wait":"pointer",boxShadow:"0 6px 20px rgba(27,138,107,.5)",letterSpacing:1,textTransform:"uppercase"}}>{loading?"Création...":"▶ Créer la partie"}</button>
      </div>
    </div>;
  }

  // ========== JOIN SCREEN ==========
  if(screen==="join"){
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
      <div style={{padding:"12px 14px"}}>
        <button onClick={()=>setScreen("lobby")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
      </div>
      <div style={{flex:1,padding:"10px 20px",display:"flex",flexDirection:"column",justifyContent:"center",maxWidth:400,width:"100%",margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:28,fontWeight:900,marginBottom:4}}>Rejoindre</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>Entre le code à 4 lettres</div>
        </div>
        <input type="text" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().slice(0,4))} placeholder="ABCD" maxLength={4} style={{width:"100%",padding:"18px",borderRadius:14,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:32,fontWeight:900,textAlign:"center",letterSpacing:10,outline:"none",fontFamily:"monospace",marginBottom:16}}/>
        <button onClick={joinSession} disabled={loading||joinCode.length!==4} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:joinCode.length===4?"linear-gradient(135deg,#1B8A6B,#4ECDC4)":"rgba(255,255,255,.08)",color:"#fff",fontSize:14,fontWeight:900,cursor:joinCode.length===4?"pointer":"not-allowed",boxShadow:joinCode.length===4?"0 6px 20px rgba(27,138,107,.5)":"none",letterSpacing:1,textTransform:"uppercase"}}>{loading?"Recherche...":"Rejoindre"}</button>
      </div>
    </div>;
  }

  // ========== LOBBY (main menu) ==========
  return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
    <div style={{padding:"12px 14px"}}>
      <button onClick={()=>setPage("home")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
    </div>
    <div style={{flex:1,padding:"0 20px 20px",display:"flex",flexDirection:"column",justifyContent:"center",maxWidth:400,width:"100%",margin:"0 auto",position:"relative"}}>
      <div style={{position:"absolute",top:20,left:"50%",transform:"translateX(-50%)",width:300,height:300,background:`radial-gradient(circle,${A}55,transparent 70%)`,filter:"blur(50px)",pointerEvents:"none"}}/>
      <div style={{textAlign:"center",marginBottom:28,position:"relative",zIndex:1}}>
        <div style={{fontSize:44,fontWeight:900,letterSpacing:-1.5,background:`linear-gradient(135deg,${A},${P})`,WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:4}}>Bloberie</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.5)",letterSpacing:2,textTransform:"uppercase",fontWeight:700}}>Agar.io edition Drive</div>
      </div>

      <div style={{background:"rgba(255,255,255,.04)",borderRadius:14,padding:16,border:"1px solid rgba(255,255,255,.08)",marginBottom:12,position:"relative",zIndex:1}}>
        <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Ta couleur</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {BLOB_COLORS.map(c=><button key={c} onClick={()=>setColor(c)} style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${c},${c}cc)`,border:color===c?"2px solid #fff":"2px solid transparent",boxShadow:color===c?`0 0 0 2px ${c}, 0 4px 12px ${c}55`:`0 2px 6px ${c}33`,cursor:"pointer"}}/>)}
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10,position:"relative",zIndex:1}}>
        <button onClick={()=>setScreen("create")} style={{padding:"14px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#1B8A6B,#4ECDC4)",color:"#fff",fontSize:14,fontWeight:900,cursor:"pointer",boxShadow:"0 6px 20px rgba(27,138,107,.5)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,letterSpacing:1,textTransform:"uppercase"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Créer une partie
        </button>
        <button onClick={()=>setScreen("join")} style={{padding:"14px",borderRadius:12,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,letterSpacing:1,textTransform:"uppercase"}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          Rejoindre
        </button>
      </div>

      <div style={{marginTop:18,fontSize:10,color:"rgba(255,255,255,.4)",textAlign:"center",lineHeight:1.6,position:"relative",zIndex:1}}>
        Mange les plus petits, évite les plus gros.<br/>Plus tu grossis, plus tu ralentis.
      </div>
    </div>
  </div>;
}

// ============================================================
// BLOBERIE ARENA — Canvas game loop with realtime sync
// ============================================================
function BloberieArena({session,auth,color,withBots,weapons,onQuit,onDeath,flash}){
  const canvasRef=useRef(null);
  const miniRef=useRef(null);
  const stateRef=useRef({
    player:null,
    others:{}, // {player_code: {name,color,x,y,mass,alive,lastSeen}}
    bots:[],
    pellets:[],
    projectiles:[], // {x,y,vx,vy,ttl,ownerCode,ownerType,color,damage,explosive}
    camera:{x:1200,y:1200,zoom:1},
    pointer:{x:0,y:0}, // screen coords
    running:true,
    lastKiller:null,
    killCount:0,
    lastShot:0,
    isShooting:false, // true while shoot button held
    wantShoot:false, // want to fire once (one-shot)
    currentWeapon:0, // index in WEAPONS array
    lastScaleAt:0, // ts of last passive scaling tick
    nemesisSpawned:false,
  });
  const[massDisplay,setMassDisplay]=useState(10);
  const[leaderboard,setLeaderboard]=useState([]);
  const[toastMsg,setToastMsg]=useState(null);
  const[currentWeaponIdx,setCurrentWeaponIdx]=useState(0);
  const[shootCooldown,setShootCooldown]=useState(0); // 0-1 for UI
  const channelRef=useRef(null);
  const broadcastRef=useRef(0);
  const sessionIdRef=useRef(session.id);
  const authCodeRef=useRef(auth.code);

  const WORLD=2400;
  const PELLET_COUNT=150;
  const BOT_COUNT=18;
  const MIN_EAT_RATIO=1.25; // bigger ratio = harder to eat someone
  const BASE_MASS=20;
  const PELLET_MASS=2;

  const rand=(a,b)=>a+Math.random()*(b-a);
  const randInt=(a,b)=>Math.floor(rand(a,b+1));
  const radiusOf=m=>Math.sqrt(m)*4+2;
  // Player slower overall, big mass penalty heavier
  const speedOf=m=>Math.max(45,240-Math.sqrt(m)*8);
  // Bots speed : slightly faster than player baseline for pressure
  const botSpeedOf=m=>Math.max(55,270-Math.sqrt(m)*7);
  const distSq=(a,b)=>{const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy;};
  // Passive mass decay for big blobs (keeps players moving/hunting)
  const DECAY_PER_SEC=0.002; // 0.2% mass loss per second when > 100 mass
  const DECAY_MIN=100;
  // Bot scaling - they gain 5% mass every 30s passively
  const BOT_SCALE_INTERVAL=30; // seconds
  const BOT_SCALE_FACTOR=1.05;
  // Nemesis spawns when player reaches this mass
  const NEMESIS_THRESHOLD=300;
  const NEMESIS_NAMES=["Le Filet à Loic","Traqueur Orange","Exterminateur Télécom","Chasseur d'Alsace","Nemesis-NIDT"];

  // Weapons — each with different properties
  const WEAPONS=[
    {id:"mg",name:"Mitraillette",emoji:"⚡",unlockAt:0,cost:1,damage:3,speed:550,ttl:1.0,cooldown:400,color:"#FFD54F",projectiles:1,spread:0},
    {id:"shotgun",name:"Fusil à pompe",emoji:"💥",unlockAt:50,cost:8,damage:3,speed:500,ttl:0.5,cooldown:1500,color:"#FF7043",projectiles:5,spread:0.5},
    {id:"sniper",name:"Sniper",emoji:"🎯",unlockAt:150,cost:5,damage:15,speed:900,ttl:2.0,cooldown:1200,color:"#EC407A",projectiles:1,spread:0},
    {id:"bomb",name:"Bombe",emoji:"🧨",unlockAt:300,cost:15,damage:10,speed:350,ttl:1.0,cooldown:3000,color:"#EF5350",projectiles:1,spread:0,explosive:true,explosionRadius:80},
  ];
  const SHOT_MIN_MASS=BASE_MASS+5; // need mass 25 to shoot
  const BOT_SHOT_COOLDOWN=1500;

  useEffect(()=>{
    // Init game state
    const st=stateRef.current;
    st.player={name:auth.name||auth.code,code:auth.code,x:rand(300,WORLD-300),y:rand(300,WORLD-300),mass:BASE_MASS,color,alive:true,invincibleUntil:Date.now()+10000,spawnAt:Date.now()};
    st.camera={x:st.player.x,y:st.player.y,zoom:1};
    // Init pellets with deterministic seed from session.id
    let seed=session.id*9301+49297;
    const rng=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
    st.pellets=[];
    for(let i=0;i<PELLET_COUNT;i++)st.pellets.push({x:rng()*(WORLD-40)+20,y:rng()*(WORLD-40)+20,mass:PELLET_MASS,color:BLOB_COLORS[Math.floor(rng()*BLOB_COLORS.length)]});
    // Init bots if enabled
    st.bots=[];
    if(withBots){
      const used=new Set();
      for(let i=0;i<BOT_COUNT;i++){
        const avail=BLOB_NAMES.filter(n=>!used.has(n));
        const nm=avail[Math.floor(rng()*avail.length)];
        used.add(nm);
        const isBoss=nm==="👔 Christel La Boss";
        const isBad=BLOB_BAD.has(nm);
        st.bots.push({
          name:nm,
          x:rng()*(WORLD-200)+100,
          y:rng()*(WORLD-200)+100,
          // Boss 200-350, Bad guys 50-100, regular 15-45 — much easier start
          mass:isBoss?rng()*150+200:isBad?rng()*50+50:rng()*30+15,
          color:isBoss?"#D32F2F":BLOB_COLORS[Math.floor(rng()*BLOB_COLORS.length)],
          alive:true,
          targetX:rng()*WORLD,targetY:rng()*WORLD,
          nextThink:0,
          respawnAt:0,
          isBot:true,isBoss,isBad,
        });
      }
    }

    // Setup canvas
    const cv=canvasRef.current;
    const ctx=cv.getContext("2d");
    const resize=()=>{
      const dpr=window.devicePixelRatio||1;
      cv.width=window.innerWidth*dpr;
      cv.height=window.innerHeight*dpr;
      cv.style.width=window.innerWidth+"px";
      cv.style.height=window.innerHeight+"px";
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    resize();
    window.addEventListener("resize",resize);

    // Input — pointer follows finger/mouse, relative to screen center
    const onMove=e=>{const x=e.touches?e.touches[0].clientX:e.clientX;const y=e.touches?e.touches[0].clientY:e.clientY;st.pointer.x=x;st.pointer.y=y;};
    cv.addEventListener("mousemove",onMove);
    cv.addEventListener("touchstart",e=>{e.preventDefault();onMove(e);},{passive:false});
    cv.addEventListener("touchmove",e=>{e.preventDefault();onMove(e);},{passive:false});
    // Initial pointer in center (no movement)
    st.pointer.x=window.innerWidth/2;
    st.pointer.y=window.innerHeight/2;

    // Start realtime channel
    startRealtime();

    // Animation loop
    let lastTs=0;
    let rafId=null;
    let uiTimer=0;
    const loop=(ts)=>{
      if(!st.running)return;
      if(!lastTs)lastTs=ts;
      const dt=Math.min(.05,(ts-lastTs)/1000);
      lastTs=ts;
      update(dt);
      render(ctx);
      // UI update every 200ms
      uiTimer+=dt;
      if(uiTimer>.2){uiTimer=0;updateUI();}
      rafId=requestAnimationFrame(loop);
    };
    rafId=requestAnimationFrame(loop);

    return()=>{
      st.running=false;
      if(rafId)cancelAnimationFrame(rafId);
      window.removeEventListener("resize",resize);
      cv.removeEventListener("mousemove",onMove);
      stopRealtime();
    };
  // eslint-disable-next-line
  },[]);

  // ==== REALTIME SYNC ====
  const startRealtime=()=>{
    try{
      if(!window.supabase){
        // Fallback: use raw WebSocket via Supabase Realtime REST
        // For now we use simple polling fallback
        startPollingFallback();
        return;
      }
      const channel=window.supabase.channel(`game:${sessionIdRef.current}`,{config:{broadcast:{self:false}}});
      channel.on("broadcast",{event:"move"},({payload})=>{
        if(payload.code===authCodeRef.current)return;
        const o=stateRef.current.others[payload.code]||{};
        stateRef.current.others[payload.code]={...o,...payload,lastSeen:Date.now()};
      });
      channel.on("broadcast",{event:"kill"},({payload})=>{
        const st=stateRef.current;
        if(payload.victim===authCodeRef.current&&st.player?.alive){
          st.player.alive=false;
          st.lastKiller=payload.killerName;
          setTimeout(onDeath,300);
        }
        if(payload.killer===authCodeRef.current){
          setToastMsg(`+${payload.gain} Mangé : ${payload.victimName}`);
          setTimeout(()=>setToastMsg(null),2000);
        }
      });
      channel.on("broadcast",{event:"shot"},({payload})=>{
        if(payload.ownerCode===authCodeRef.current)return;
        stateRef.current.projectiles.push({
          x:payload.x,y:payload.y,
          vx:payload.vx,vy:payload.vy,
          ttl:payload.ttl||1.0,
          ownerCode:payload.ownerCode,
          ownerName:payload.ownerName,
          color:payload.color,
          damage:payload.damage||4,
          explosive:!!payload.explosive,
          explosionRadius:payload.explosionRadius||0,
        });
      });
      channel.subscribe();
      channelRef.current=channel;
      // Broadcast my position 10 Hz
      broadcastRef.current=setInterval(()=>{
        const p=stateRef.current.player;
        if(!p||!p.alive)return;
        channel.send({type:"broadcast",event:"move",payload:{code:authCodeRef.current,name:p.name,color:p.color,x:Math.round(p.x),y:Math.round(p.y),mass:Math.floor(p.mass),alive:p.alive}});
      },100);
    }catch(e){startPollingFallback();}
  };

  const startPollingFallback=()=>{
    // Fallback: poll game_players table every 500ms
    const poll=async()=>{
      try{
        const others=await dbGet("game_players",`session_id=eq.${sessionIdRef.current}&player_code=neq.${authCodeRef.current}`);
        const st=stateRef.current;
        for(const p of (others||[])){
          st.others[p.player_code]={code:p.player_code,name:p.name,color:p.color,x:p.x,y:p.y,mass:p.mass,alive:p.alive,lastSeen:Date.now()};
        }
      }catch(e){}
    };
    poll();
    broadcastRef.current=setInterval(async()=>{
      poll();
      // Push my position
      const p=stateRef.current.player;
      if(!p||!p.alive)return;
      try{await dbPatch("game_players",{x:Math.round(p.x),y:Math.round(p.y),mass:Math.floor(p.mass),alive:p.alive},`session_id=eq.${sessionIdRef.current}&player_code=eq.${authCodeRef.current}`);}catch(e){}
    },500);
  };

  const stopRealtime=()=>{
    if(broadcastRef.current){clearInterval(broadcastRef.current);broadcastRef.current=0;}
    if(channelRef.current){try{channelRef.current.unsubscribe?.();}catch(e){}channelRef.current=null;}
  };

  const broadcastKill=(victim,victimName,gain)=>{
    const payload={killer:authCodeRef.current,killerName:stateRef.current.player.name,victim,victimName,gain};
    if(channelRef.current){
      try{channelRef.current.send({type:"broadcast",event:"kill",payload});}catch(e){}
    }
  };

  // ==== UPDATE LOOP ====
  const update=(dt)=>{
    const st=stateRef.current;
    const p=st.player;
    if(!p)return;

    // Player shooting (weapons mode) — uses currently selected weapon
    if(weapons&&p.alive&&(st.isShooting||st.wantShoot)){
      const w=WEAPONS[st.currentWeapon]||WEAPONS[0];
      const now=Date.now();
      const canShoot=p.mass>=SHOT_MIN_MASS+w.cost&&p.mass>=w.unlockAt&&now-st.lastShot>=w.cooldown;
      if(canShoot){
        st.lastShot=now;
        st.wantShoot=false; // one-shot consumed
        const cx2=window.innerWidth/2;
        const cy2=window.innerHeight/2;
        let adx=st.pointer.x-cx2;
        let ady=st.pointer.y-cy2;
        const ad=Math.hypot(adx,ady);
        // Default aim direction if pointer near center
        if(ad<5){adx=1;ady=0;}else{adx/=ad;ady/=ad;}
        p.mass-=w.cost;
        const r=radiusOf(p.mass);
        const baseAngle=Math.atan2(ady,adx);
        // Spawn projectile(s)
        for(let k=0;k<w.projectiles;k++){
          let a=baseAngle;
          if(w.projectiles>1){
            const t=(k/(w.projectiles-1))-0.5; // -0.5 to 0.5
            a+=t*w.spread;
          }
          const dx=Math.cos(a),dy=Math.sin(a);
          const proj={
            x:p.x+dx*(r+6),
            y:p.y+dy*(r+6),
            vx:dx*w.speed,
            vy:dy*w.speed,
            ttl:w.ttl,
            ownerCode:authCodeRef.current,
            ownerName:p.name,
            color:w.color,
            damage:w.damage,
            explosive:!!w.explosive,
            explosionRadius:w.explosionRadius||0,
            weaponId:w.id,
          };
          st.projectiles.push(proj);
          // Broadcast shot
          if(channelRef.current){
            try{channelRef.current.send({type:"broadcast",event:"shot",payload:{ownerCode:authCodeRef.current,ownerName:p.name,color:w.color,x:proj.x,y:proj.y,vx:proj.vx,vy:proj.vy,ttl:w.ttl,damage:w.damage,explosive:!!w.explosive,explosionRadius:w.explosionRadius||0,weaponId:w.id}});}catch(e){}
          }
        }
      }
    }

    // Update projectiles
    for(let i=st.projectiles.length-1;i>=0;i--){
      const pr=st.projectiles[i];
      pr.x+=pr.vx*dt;
      pr.y+=pr.vy*dt;
      pr.ttl-=dt;
      // Out of world or expired
      if(pr.ttl<=0||pr.x<0||pr.x>WORLD||pr.y<0||pr.y>WORLD){
        st.projectiles.splice(i,1);
        continue;
      }
      // Collision with blobs (not the shooter)
      const targets=[p,...st.bots,...Object.values(st.others)].filter(b=>b&&b.alive);
      let hit=false;
      for(const t of targets){
        if(!t||!t.alive)continue;
        // Don't hit self
        const tCode=t.code||t.player_code;
        if(tCode===pr.ownerCode)continue;
        // Don't hit own bots shots (bots don't collide with themselves)
        if(t.isBot&&pr.ownerType==="bot"&&t.name===pr.ownerName)continue;
        const tr=radiusOf(t.mass);
        const dx=t.x-pr.x,dy=t.y-pr.y;
        if(dx*dx+dy*dy<tr*tr){
          // Skip if target is player and invincible
          if(t===p&&p.invincibleUntil&&Date.now()<p.invincibleUntil){hit=true;break;}
          // Explosive: damage all targets in radius
          if(pr.explosive){
            const er2=pr.explosionRadius*pr.explosionRadius;
            for(const t2 of targets){
              if(!t2||!t2.alive)continue;
              if((t2.code||t2.player_code)===pr.ownerCode)continue;
              if(t2===p&&p.invincibleUntil&&Date.now()<p.invincibleUntil)continue;
              const ddx=t2.x-pr.x,ddy=t2.y-pr.y;
              const dd=ddx*ddx+ddy*ddy;
              if(dd<er2){
                const falloff=1-(Math.sqrt(dd)/pr.explosionRadius);
                const explDmg=pr.damage*falloff;
                if(t2.mass-explDmg>=BASE_MASS)t2.mass-=explDmg;
                else t2.mass=BASE_MASS;
                // Handle kills from explosion
                if(t2===p&&p.mass<=BASE_MASS+1){
                  p.alive=false;st.lastKiller=pr.ownerName;setTimeout(onDeath,300);
                }else if(t2.isBot&&pr.ownerCode===authCodeRef.current&&t2.mass<=BASE_MASS+1){
                  t2.alive=false;t2.respawnAt=1.5;
                }
              }
            }
            st.explosions=st.explosions||[];
            st.explosions.push({x:pr.x,y:pr.y,r:pr.explosionRadius,ttl:0.4,color:pr.color});
            setToastMsg(`💥 Explosion !`);setTimeout(()=>setToastMsg(null),1000);
          }else{
            // Normal hit
            const dmg=Math.min(pr.damage,t.mass-BASE_MASS);
            if(dmg>0){
              t.mass=Math.max(BASE_MASS,t.mass-pr.damage);
            }
            if(t===p){
              if(p.mass<=BASE_MASS+1){
                p.alive=false;
                st.lastKiller=pr.ownerName;
                setTimeout(onDeath,300);
              }else{
                setToastMsg(`⚠ Touché par ${pr.ownerName} !`);
                setTimeout(()=>setToastMsg(null),1500);
              }
            }
            if(t.isBot&&pr.ownerCode===authCodeRef.current){
              if(t.mass<=BASE_MASS+1){
                t.alive=false;
                t.respawnAt=1.5;
                setToastMsg(`💥 Éliminé : ${t.name}`);
                setTimeout(()=>setToastMsg(null),1500);
              }
            }
          }
          hit=true;
          break;
        }
      }
      if(hit)st.projectiles.splice(i,1);
    }
    // Update explosions (visual)
    if(st.explosions){
      for(let i=st.explosions.length-1;i>=0;i--){
        st.explosions[i].ttl-=dt;
        if(st.explosions[i].ttl<=0)st.explosions.splice(i,1);
      }
    }

    // Player movement — pointer relative to screen center (joystick-like)
    if(p.alive){
      const cx=window.innerWidth/2;
      const cy=window.innerHeight/2;
      let dx=st.pointer.x-cx;
      let dy=st.pointer.y-cy;
      const d=Math.hypot(dx,dy);
      if(d>5){
        dx/=d;dy/=d;
        const sp=speedOf(p.mass);
        const fac=Math.min(d/150,1);
        p.x+=dx*sp*dt*fac;
        p.y+=dy*sp*dt*fac;
        p.x=Math.max(10,Math.min(WORLD-10,p.x));
        p.y=Math.max(10,Math.min(WORLD-10,p.y));
      }
    }

    // Camera follow + zoom
    if(p.alive){
      st.camera.x+=(p.x-st.camera.x)*.1;
      st.camera.y+=(p.y-st.camera.y)*.1;
      const tz=Math.max(.5,1-Math.sqrt(p.mass)/50);
      st.camera.zoom+=(tz-st.camera.zoom)*.05;
    }

    // Bots AI
    for(const b of st.bots){
      if(!b.alive){
        b.respawnAt-=dt;
        if(b.respawnAt<=0){
          b.alive=true;
          b.mass=BASE_MASS+rand(0,15);
          b.x=rand(100,WORLD-100);
          b.y=rand(100,WORLD-100);
          b.targetX=rand(0,WORLD);b.targetY=rand(0,WORLD);
        }
        continue;
      }
      // FAST THREAT CHECK — runs every frame, not just on think tick
      // If a bigger predator is within 250px, override target IMMEDIATELY
      let urgentThreat=null,urgentD=70000; // 264px squared
      const playerInvincibleNow=p&&p.invincibleUntil&&Date.now()<p.invincibleUntil;
      // Check player
      if(p&&p.alive&&!playerInvincibleNow&&p.mass>b.mass*MIN_EAT_RATIO){
        const d=distSq(b,p);
        if(d<urgentD){urgentD=d;urgentThreat=p;}
      }
      // Check other bots
      for(const ob of st.bots){
        if(ob===b||!ob.alive)continue;
        if(ob.mass>b.mass*MIN_EAT_RATIO){
          const d=distSq(b,ob);
          if(d<urgentD){urgentD=d;urgentThreat=ob;}
        }
      }
      // Check other humans
      for(const oc in st.others){
        const oh=st.others[oc];
        if(!oh||!oh.alive)continue;
        if(oh.mass>b.mass*MIN_EAT_RATIO){
          const d=distSq(b,oh);
          if(d<urgentD){urgentD=d;urgentThreat=oh;}
        }
      }
      if(urgentThreat){
        // FLEE NOW — override any chase
        b.targetX=b.x-(urgentThreat.x-b.x)*2.5;
        b.targetY=b.y-(urgentThreat.y-b.y)*2.5;
        b.nextThink=Math.min(b.nextThink,.15); // re-evaluate quickly
      }

      b.nextThink-=dt;
      if(b.nextThink<=0&&!urgentThreat){
        // Faster reaction time (200-600ms)
        b.nextThink=rand(.2,.6);
        let bestPellet=null,bestPD=Infinity;
        for(const pe of st.pellets){const d=distSq(b,pe);if(d<bestPD){bestPD=d;bestPellet=pe;}}
        let chase=null,chaseDist=Infinity;
        const others=Object.values(st.others).filter(o=>o.alive);
        const allBlobs=[p,...st.bots.filter(x=>x!==b&&x.alive),...others];
        // Prefer hunting BOTS over humans (so bots eat each other regularly)
        // Score = distance, but humans get +50% penalty so bots are preferred when close
        for(const o of allBlobs){
          if(!o||!o.alive)continue;
          if(o===p&&playerInvincibleNow)continue;
          const d=distSq(b,o);
          if(d>490000)continue;
          if(b.mass>o.mass*MIN_EAT_RATIO){
            // Prefer bots over humans for variety
            const isHuman=(o===p)||(o.code&&!o.isBot);
            const score=isHuman?d*1.5:d;
            if(score<chaseDist){chaseDist=score;chase=o;}
          }
        }
        if(chase&&chaseDist<240000){ // chase up to ~490px (or 600 for bots)
          // Predictive chasing: aim where prey will be, not where it is
          const dx=chase.x-b.x,dy=chase.y-b.y;
          const ddist=Math.hypot(dx,dy);
          const reactTime=ddist/Math.max(120,botSpeedOf(b.mass));
          const vx=chase.targetX?(chase.targetX-chase.x)*.5:0;
          const vy=chase.targetY?(chase.targetY-chase.y)*.5:0;
          b.targetX=chase.x+vx*reactTime;
          b.targetY=chase.y+vy*reactTime;
          // BOT SHOOTING: only shoot at the human player (not other bots) + per-bot cooldown
          const now=Date.now();
          const isHumanChased=chase===p||(chase.code&&!chase.isBot);
          if(weapons&&isHumanChased&&b.mass>=SHOT_MIN_MASS&&(!b.lastShot||now-b.lastShot>=BOT_SHOT_COOLDOWN)&&Math.random()<(b.isBoss?.35:b.isBad?.2:.1)){
            const sdx=chase.x-b.x,sdy=chase.y-b.y;
            const sd=Math.hypot(sdx,sdy);
            if(sd>30&&sd<500){
              const ndx=sdx/sd,ndy=sdy/sd;
              b.mass-=2; // basic shot cost
              b.lastShot=now;
              const br=radiusOf(b.mass);
              st.projectiles.push({
                x:b.x+ndx*(br+6),
                y:b.y+ndy*(br+6),
                vx:ndx*550,
                vy:ndy*550,
                ttl:1.0,
                ownerCode:"bot:"+b.name,
                ownerName:b.name,
                ownerType:"bot",
                color:b.color,
                damage:4,
              });
            }
          }
        }else if(bestPellet){
          b.targetX=bestPellet.x;b.targetY=bestPellet.y;
        }
        if(b.isBoss&&Math.random()<.25){b.targetX=rand(0,WORLD);b.targetY=rand(0,WORLD);}
      }
      let dx=b.targetX-b.x,dy=b.targetY-b.y;
      const d=Math.hypot(dx,dy);
      if(d>5){
        dx/=d;dy/=d;
        // Bots slightly faster than players (botSpeedOf), boss only a bit slower
        const sp=botSpeedOf(b.mass)*(b.isBoss?.75:1);
        b.x+=dx*sp*dt;
        b.y+=dy*sp*dt;
      }
      b.x=Math.max(10,Math.min(WORLD-10,b.x));
      b.y=Math.max(10,Math.min(WORLD-10,b.y));
    }

    // Passive mass decay when > 50 mass — forces players to keep hunting
    if(p.alive&&p.mass>DECAY_MIN){p.mass=Math.max(DECAY_MIN,p.mass*(1-DECAY_PER_SEC*dt));}
    for(const b of st.bots){if(b.alive&&b.mass>DECAY_MIN)b.mass=Math.max(DECAY_MIN,b.mass*(1-DECAY_PER_SEC*dt));}

    // Eat pellets (player + bots)
    const eaters=[p,...st.bots.filter(b=>b.alive)];
    for(const b of eaters){
      if(!b.alive)continue;
      const r=radiusOf(b.mass);
      const r2=r*r;
      for(let i=st.pellets.length-1;i>=0;i--){
        const pe=st.pellets[i];
        if(distSq(b,pe)<r2){b.mass+=pe.mass;st.pellets.splice(i,1);}
      }
    }
    while(st.pellets.length<PELLET_COUNT)st.pellets.push({x:rand(20,WORLD-20),y:rand(20,WORLD-20),mass:PELLET_MASS,color:BLOB_COLORS[randInt(0,BLOB_COLORS.length-1)]});

    // Player eats bots
    if(p.alive){
      const pr=radiusOf(p.mass);
      for(const b of st.bots){
        if(!b.alive||p.mass<=b.mass*MIN_EAT_RATIO)continue;
        const dr=pr*.85;
        if(distSq(p,b)<dr*dr){
          const gain=Math.floor(b.mass*.8);
          p.mass+=gain;
          b.alive=false;
          b.respawnAt=1.5; // was 3 — faster respawn keeps pressure up
          st.killCount++;
          setToastMsg(`+${gain} Mangé : ${b.name}`);
          setTimeout(()=>setToastMsg(null),1800);
        }
      }
      // Player eats other human players
      for(const o of Object.values(st.others)){
        if(!o.alive||p.mass<=o.mass*MIN_EAT_RATIO)continue;
        const dr=pr*.85;
        if(distSq(p,o)<dr*dr){
          const gain=Math.floor(o.mass*.8);
          p.mass+=gain;
          o.alive=false;
          broadcastKill(o.code,o.name,gain);
          setToastMsg(`+${gain} Mangé : ${o.name}`);
          setTimeout(()=>setToastMsg(null),1800);
        }
      }
      // Bots eat player (skip if invincible)
      const isInvincible=p.invincibleUntil&&Date.now()<p.invincibleUntil;
      if(!isInvincible){
        for(const b of st.bots){
          if(!b.alive||b.mass<=p.mass*MIN_EAT_RATIO)continue;
          const br=radiusOf(b.mass)*.85;
          if(distSq(b,p)<br*br){
            p.alive=false;
            st.lastKiller=b.name;
            setTimeout(onDeath,300);
            break;
          }
        }
      }
    }

    // === BOT CANNIBALISM ===
    // Bots eat each other (same rules as player) — slightly more generous collision
    for(let i=0;i<st.bots.length;i++){
      const eater=st.bots[i];
      if(!eater.alive)continue;
      const erad=radiusOf(eater.mass);
      for(let j=0;j<st.bots.length;j++){
        if(i===j)continue;
        const prey=st.bots[j];
        if(!prey.alive||eater.mass<=prey.mass*MIN_EAT_RATIO)continue;
        const dr=erad*.95; // a bit more generous (was .85)
        if(distSq(eater,prey)<dr*dr){
          eater.mass+=Math.floor(prey.mass*.8);
          prey.alive=false;
          prey.respawnAt=1.5;
          // Show toast for notable kills (boss eaten, or eater is boss)
          if(prey.isBoss||eater.isBoss){
            setToastMsg(`🍴 ${eater.name} a mangé ${prey.name}`);
            setTimeout(()=>setToastMsg(null),1800);
          }
        }
      }
    }

    // === PASSIVE BOT SCALING ===
    // Every BOT_SCALE_INTERVAL seconds, all bots grow by 5%
    const nowMs=Date.now();
    if(!st.lastScaleAt)st.lastScaleAt=nowMs;
    if(nowMs-st.lastScaleAt>=BOT_SCALE_INTERVAL*1000){
      st.lastScaleAt=nowMs;
      for(const b of st.bots){
        if(b.alive)b.mass=Math.min(b.mass*BOT_SCALE_FACTOR,b.mass+Math.max(10,b.mass*0.05));
      }
    }

    // === NEMESIS SPAWN ===
    // When player reaches threshold, spawn a bot 1.5× player mass to keep pressure
    if(p&&p.alive&&p.mass>=NEMESIS_THRESHOLD&&!st.nemesisSpawned){
      st.nemesisSpawned=true;
      const name=NEMESIS_NAMES[randInt(0,NEMESIS_NAMES.length-1)];
      // Respawn an existing dead bot slot, or replace the smallest non-boss bot
      let slot=st.bots.findIndex(b=>!b.alive);
      if(slot<0)slot=st.bots.reduce((mi,b,idx)=>b.mass<st.bots[mi].mass&&!b.isBoss?idx:mi,0);
      // Place far from player
      const angle=Math.random()*Math.PI*2;
      const dist=400+Math.random()*200;
      st.bots[slot]={
        name,
        x:Math.max(100,Math.min(WORLD-100,p.x+Math.cos(angle)*dist)),
        y:Math.max(100,Math.min(WORLD-100,p.y+Math.sin(angle)*dist)),
        mass:Math.floor(p.mass*1.5),
        color:"#8E24AA", // distinctive purple
        alive:true,
        targetX:p.x,targetY:p.y,
        nextThink:0,
        respawnAt:0,
        isBot:true,
        isBoss:false,
        isBad:true,
        isNemesis:true,
      };
      setToastMsg(`⚠ ${name} est apparu !`);
      setTimeout(()=>setToastMsg(null),2500);
    }
    // Reset nemesis flag to allow next spawn cycle (at 2× threshold)
    if(p&&p.alive&&st.nemesisSpawned){
      // Check if nemesis is dead, reset flag
      const nemesis=st.bots.find(b=>b.isNemesis&&b.alive);
      if(!nemesis&&p.mass>=NEMESIS_THRESHOLD*1.5){
        st.nemesisSpawned=false; // allow next spawn
      }
    }

    // Clean stale others (no update in 5s)
    const now=Date.now();
    for(const [code,o] of Object.entries(st.others)){
      if(now-o.lastSeen>5000)delete st.others[code];
    }
  };

  // ==== RENDER ====
  const render=(ctx)=>{
    const st=stateRef.current;
    const W=window.innerWidth,H=window.innerHeight;
    ctx.clearRect(0,0,W,H);
    // BG
    const bgGrad=ctx.createLinearGradient(0,0,0,H);
    bgGrad.addColorStop(0,"#0a2e24");
    bgGrad.addColorStop(1,"#0d1b2a");
    ctx.fillStyle=bgGrad;
    ctx.fillRect(0,0,W,H);

    // Grid
    const zoom=st.camera.zoom;
    const gs=80*zoom;
    ctx.strokeStyle="rgba(255,255,255,.04)";
    ctx.lineWidth=1;
    ctx.beginPath();
    const ox=W/2-st.camera.x*zoom;
    const oy=H/2-st.camera.y*zoom;
    const sx=((ox%gs)+gs)%gs;
    const sy=((oy%gs)+gs)%gs;
    for(let x=sx;x<W;x+=gs){ctx.moveTo(x,0);ctx.lineTo(x,H);}
    for(let y=sy;y<H;y+=gs){ctx.moveTo(0,y);ctx.lineTo(W,y);}
    ctx.stroke();

    // World border
    const tlx=W/2+(-st.camera.x)*zoom;
    const tly=H/2+(-st.camera.y)*zoom;
    ctx.strokeStyle="rgba(76,205,196,.3)";
    ctx.lineWidth=3;
    ctx.strokeRect(tlx,tly,WORLD*zoom,WORLD*zoom);

    const toScr=(wx,wy)=>({x:W/2+(wx-st.camera.x)*zoom,y:H/2+(wy-st.camera.y)*zoom});

    // Pellets
    for(const pe of st.pellets){
      const s=toScr(pe.x,pe.y);
      if(s.x<-10||s.x>W+10||s.y<-10||s.y>H+10)continue;
      ctx.fillStyle=pe.color;
      ctx.beginPath();
      ctx.arc(s.x,s.y,4*zoom,0,Math.PI*2);
      ctx.fill();
    }

    // Projectiles
    for(const pr of st.projectiles){
      const s=toScr(pr.x,pr.y);
      if(s.x<-20||s.x>W+20||s.y<-20||s.y>H+20)continue;
      const prSpd=Math.hypot(pr.vx,pr.vy)||1;
      const isBomb=pr.explosive;
      const size=isBomb?6:3.5;
      // Trail
      const tailLen=(isBomb?10:20)*zoom;
      const tailX=s.x-(pr.vx/prSpd)*tailLen;
      const tailY=s.y-(pr.vy/prSpd)*tailLen;
      const grad=ctx.createLinearGradient(tailX,tailY,s.x,s.y);
      grad.addColorStop(0,pr.color+"00");
      grad.addColorStop(1,pr.color+"ff");
      ctx.strokeStyle=grad;
      ctx.lineWidth=(isBomb?5:3)*zoom;
      ctx.lineCap="round";
      ctx.beginPath();
      ctx.moveTo(tailX,tailY);
      ctx.lineTo(s.x,s.y);
      ctx.stroke();
      // Head
      ctx.fillStyle="#fff";
      ctx.beginPath();
      ctx.arc(s.x,s.y,size*zoom,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle=pr.color;
      ctx.beginPath();
      ctx.arc(s.x,s.y,(size*.6)*zoom,0,Math.PI*2);
      ctx.fill();
      // Pulsing glow for bombs
      if(isBomb){
        const pulse=.5+.5*Math.sin(Date.now()/80);
        ctx.strokeStyle=`rgba(239,83,80,${.6+.4*pulse})`;
        ctx.lineWidth=2*zoom;
        ctx.beginPath();
        ctx.arc(s.x,s.y,(size+3+pulse*2)*zoom,0,Math.PI*2);
        ctx.stroke();
      }
    }

    // Explosions
    if(st.explosions){
      for(const ex of st.explosions){
        const s=toScr(ex.x,ex.y);
        const prog=1-ex.ttl/0.4; // 0 to 1
        const r=ex.r*zoom*(0.3+0.7*prog);
        const alpha=1-prog;
        const grad=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,r);
        grad.addColorStop(0,`rgba(255,220,100,${alpha*.9})`);
        grad.addColorStop(.4,`rgba(255,120,30,${alpha*.7})`);
        grad.addColorStop(1,`rgba(239,83,80,0)`);
        ctx.fillStyle=grad;
        ctx.beginPath();
        ctx.arc(s.x,s.y,r,0,Math.PI*2);
        ctx.fill();
        // Outer ring
        ctx.strokeStyle=`rgba(255,150,50,${alpha})`;
        ctx.lineWidth=3*zoom;
        ctx.beginPath();
        ctx.arc(s.x,s.y,r,0,Math.PI*2);
        ctx.stroke();
      }
    }

    // All blobs sorted by mass (smaller drawn first)
    const all=[st.player,...st.bots,...Object.values(st.others)].filter(b=>b&&b.alive).sort((a,b)=>a.mass-b.mass);
    for(const b of all){
      const s=toScr(b.x,b.y);
      const r=radiusOf(b.mass)*zoom;
      if(s.x<-r||s.x>W+r||s.y<-r||s.y>H+r)continue;
      // Glow
      const grad=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,r*1.5);
      grad.addColorStop(0,b.color+"00");
      grad.addColorStop(.8,b.color+"40");
      grad.addColorStop(1,b.color+"00");
      ctx.fillStyle=grad;
      ctx.beginPath();ctx.arc(s.x,s.y,r*1.5,0,Math.PI*2);ctx.fill();
      // Body
      ctx.fillStyle=b.color;
      ctx.beginPath();ctx.arc(s.x,s.y,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="rgba(0,0,0,.3)";ctx.lineWidth=2;ctx.stroke();
      // Invincibility shield (pulsing golden ring on player)
      if(b===st.player&&b.invincibleUntil&&Date.now()<b.invincibleUntil){
        const pulse=.5+.5*Math.sin(Date.now()/150);
        ctx.strokeStyle=`rgba(255,213,79,${.6+.4*pulse})`;
        ctx.lineWidth=3+pulse*2;
        ctx.beginPath();ctx.arc(s.x,s.y,r+6+pulse*3,0,Math.PI*2);ctx.stroke();
      }
      // Highlight
      ctx.fillStyle="rgba(255,255,255,.15)";
      ctx.beginPath();ctx.arc(s.x-r*.3,s.y-r*.3,r*.4,0,Math.PI*2);ctx.fill();
      // Name + mass
      if(r>15){
        ctx.fillStyle="#fff";
        ctx.strokeStyle="rgba(0,0,0,.7)";
        ctx.lineWidth=3;
        ctx.font=`900 ${Math.min(14,r*.35)}px DM Sans,sans-serif`;
        ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.strokeText(b.name,s.x,s.y-r*.1);
        ctx.fillText(b.name,s.x,s.y-r*.1);
        ctx.font=`700 ${Math.min(11,r*.25)}px DM Sans,sans-serif`;
        ctx.fillStyle="rgba(255,255,255,.85)";
        ctx.strokeText(Math.floor(b.mass),s.x,s.y+r*.25);
        ctx.fillText(Math.floor(b.mass),s.x,s.y+r*.25);
      }
    }

    // Mini-map
    const mm=miniRef.current;
    if(mm){
      const mctx=mm.getContext("2d");
      mctx.clearRect(0,0,110,110);
      mctx.fillStyle="rgba(76,205,196,.08)";
      mctx.fillRect(0,0,110,110);
      mctx.strokeStyle="rgba(76,205,196,.3)";
      mctx.lineWidth=1;
      mctx.strokeRect(.5,.5,109,109);
      const sc=110/WORLD;
      for(const b of st.bots){if(!b.alive)continue;mctx.fillStyle=b.isBoss?"#D32F2F":"rgba(255,255,255,.3)";mctx.fillRect(b.x*sc-1,b.y*sc-1,2,2);}
      for(const o of Object.values(st.others)){if(!o.alive)continue;mctx.fillStyle=o.color;mctx.fillRect(o.x*sc-1.5,o.y*sc-1.5,3,3);}
      if(st.player&&st.player.alive){
        mctx.fillStyle=st.player.color;
        mctx.beginPath();mctx.arc(st.player.x*sc,st.player.y*sc,3,0,Math.PI*2);mctx.fill();
        mctx.strokeStyle="#fff";mctx.lineWidth=1;mctx.stroke();
      }
    }
  };

  // ==== UI UPDATE (throttled) ====
  const[danger,setDanger]=useState(false);
  const[invSecs,setInvSecs]=useState(0);

  const updateUI=()=>{
    const st=stateRef.current;
    setMassDisplay(st.player&&st.player.alive?Math.floor(st.player.mass):0);
    const all=[st.player,...st.bots,...Object.values(st.others)].filter(b=>b&&b.alive).sort((a,b)=>b.mass-a.mass).slice(0,5);
    setLeaderboard(all.map(b=>({name:b.name||b.code,mass:Math.floor(b.mass),isMe:b===st.player,color:b.color})));
    // Invincibility countdown
    const p=st.player;
    if(p&&p.alive&&p.invincibleUntil){
      const remaining=Math.ceil((p.invincibleUntil-Date.now())/1000);
      setInvSecs(remaining>0?remaining:0);
    }else setInvSecs(0);
    // Weapon cooldown progress (0-1)
    if(weapons){
      const w=WEAPONS[st.currentWeapon]||WEAPONS[0];
      const elapsed=Date.now()-st.lastShot;
      const progress=Math.min(1,elapsed/w.cooldown);
      setShootCooldown(progress);
    }
    // Danger detection: any bigger blob within 250px ?
    if(p&&p.alive&&!(p.invincibleUntil&&Date.now()<p.invincibleUntil)){
      let inDanger=false;
      const threshold=250*250;
      for(const b of [...st.bots,...Object.values(st.others)]){
        if(!b.alive)continue;
        if(b.mass>p.mass*MIN_EAT_RATIO&&distSq(b,p)<threshold){inDanger=true;break;}
      }
      setDanger(inDanger);
    }else{setDanger(false);}
  };

  return<div style={{position:"fixed",inset:0,background:"#0a1628",overflow:"hidden",zIndex:999}}>
    <canvas ref={canvasRef} style={{display:"block",width:"100%",height:"100%"}}/>

    {/* Danger warning */}
    {danger&&<div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:5,boxShadow:"inset 0 0 80px rgba(239,83,80,.4), inset 0 0 200px rgba(239,83,80,.15)",animation:"dangerPulse 1s ease-in-out infinite"}}/>}
    {danger&&<div style={{position:"absolute",top:"45%",left:"50%",transform:"translateX(-50%)",pointerEvents:"none",zIndex:6,fontSize:11,fontWeight:900,color:"#fff",background:"rgba(239,83,80,.9)",padding:"4px 12px",borderRadius:8,letterSpacing:2,textTransform:"uppercase",animation:"dangerPulse 1s ease-in-out infinite",boxShadow:"0 4px 20px rgba(239,83,80,.6)"}}>⚠ Danger</div>}
    <style>{`@keyframes dangerPulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>

    {/* HUD — Mass */}
    <div style={{position:"absolute",top:12,left:12,background:"rgba(0,0,0,.5)",backdropFilter:"blur(10px)",padding:"6px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,.1)",pointerEvents:"none",zIndex:10}}>
      <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:1}}>Masse</div>
      <div style={{fontSize:22,fontWeight:900,color:A}}>{massDisplay}</div>
    </div>

    {/* Invincibility badge */}
    {invSecs>0&&<div style={{position:"absolute",top:56,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg,#FFD54F,#FFA726)",padding:"6px 14px",borderRadius:10,color:"#000",fontSize:12,fontWeight:900,letterSpacing:1,textTransform:"uppercase",boxShadow:"0 4px 14px rgba(255,213,79,.5)",pointerEvents:"none",zIndex:15,display:"flex",alignItems:"center",gap:8,animation:"invPulse 1s ease-in-out infinite"}}>
      <span>🛡</span><span>Invincible · {invSecs}s</span>
    </div>}
    <style>{`@keyframes invPulse{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.05)}}`}</style>

    {/* HUD — Leaderboard */}
    <div style={{position:"absolute",top:12,right:12,background:"rgba(0,0,0,.5)",backdropFilter:"blur(10px)",padding:"8px 10px",borderRadius:10,border:"1px solid rgba(255,255,255,.1)",minWidth:140,pointerEvents:"none",zIndex:10}}>
      <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Leaderboard</div>
      {leaderboard.map((r,i)=>
        <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,padding:"2px 0",color:r.isMe?"#FFD54F":"#fff"}}>
          <span style={{width:14,textAlign:"center",color:"rgba(255,255,255,.4)",fontSize:9}}>{i+1}.</span>
          <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}</span>
          <span style={{color:A,fontVariantNumeric:"tabular-nums"}}>{r.mass}</span>
        </div>
      )}
    </div>

    {/* Mini-map */}
    <canvas ref={miniRef} width={110} height={110} style={{position:"absolute",bottom:12,right:12,width:110,height:110,background:"rgba(0,0,0,.6)",backdropFilter:"blur(10px)",borderRadius:8,border:"1px solid rgba(255,255,255,.1)",pointerEvents:"none",zIndex:10}}/>

    {/* Weapon picker (left side vertical rail) */}
    {weapons&&<div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",display:"flex",flexDirection:"column",gap:6,zIndex:10}}>
      {WEAPONS.map((w,idx)=>{
        const unlocked=massDisplay>=w.unlockAt;
        const sel=idx===currentWeaponIdx;
        return<button key={w.id} onClick={()=>{if(unlocked){stateRef.current.currentWeapon=idx;setCurrentWeaponIdx(idx);}}} disabled={!unlocked} style={{
          width:50,height:50,borderRadius:12,
          border:sel?`2px solid ${w.color}`:"1px solid rgba(255,255,255,.1)",
          background:unlocked?(sel?`${w.color}22`:"rgba(0,0,0,.5)"):"rgba(0,0,0,.3)",
          backdropFilter:"blur(10px)",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          cursor:unlocked?"pointer":"not-allowed",
          opacity:unlocked?1:.4,
          boxShadow:sel?`0 0 12px ${w.color}66`:"none",
          padding:2,
          gap:0,
        }}>
          <span style={{fontSize:18,lineHeight:1,filter:unlocked?"none":"grayscale(1)"}}>{w.emoji}</span>
          {!unlocked&&<span style={{fontSize:7,fontWeight:800,color:"rgba(255,255,255,.4)",marginTop:1}}>{w.unlockAt}</span>}
        </button>;
      })}
    </div>}

    {/* Shoot button (bottom-right) */}
    {weapons&&(()=>{
      const w=WEAPONS[currentWeaponIdx]||WEAPONS[0];
      const unlocked=massDisplay>=w.unlockAt;
      const canShoot=unlocked&&massDisplay>=SHOT_MIN_MASS+w.cost&&shootCooldown>=1;
      return<button onTouchStart={e=>{e.preventDefault();stateRef.current.isShooting=true;stateRef.current.wantShoot=true;}} onTouchEnd={e=>{stateRef.current.isShooting=false;}} onMouseDown={e=>{stateRef.current.isShooting=true;stateRef.current.wantShoot=true;}} onMouseUp={e=>{stateRef.current.isShooting=false;}} onMouseLeave={e=>{stateRef.current.isShooting=false;}} style={{
        position:"absolute",bottom:140,right:14,
        width:80,height:80,borderRadius:40,
        border:`3px solid ${canShoot?w.color:"rgba(255,255,255,.15)"}`,
        background:canShoot?`radial-gradient(circle at 30% 30%,${w.color}dd,${w.color}88)`:"rgba(0,0,0,.5)",
        backdropFilter:"blur(10px)",
        display:"flex",alignItems:"center",justifyContent:"center",
        cursor:canShoot?"pointer":"not-allowed",
        boxShadow:canShoot?`0 6px 20px ${w.color}66`:"none",
        zIndex:12,overflow:"hidden",padding:0,
      }}>
        {/* Cooldown ring */}
        {shootCooldown<1&&<div style={{position:"absolute",inset:0,background:`conic-gradient(rgba(255,255,255,.35) ${shootCooldown*360}deg, transparent 0deg)`,borderRadius:"50%",pointerEvents:"none"}}/>}
        <span style={{fontSize:30,position:"relative",zIndex:1,filter:canShoot?"none":"grayscale(1) opacity(.5)"}}>{w.emoji}</span>
      </button>;
    })()}

    {/* Weapons info (mass cost) */}
    {weapons&&<div style={{position:"absolute",bottom:106,right:14,width:80,textAlign:"center",pointerEvents:"none",zIndex:11}}>
      {(()=>{const w=WEAPONS[currentWeaponIdx]||WEAPONS[0];return<>
        <div style={{fontSize:9,fontWeight:800,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,.8)"}}>-{w.cost} masse</div>
      </>})()}
    </div>}

    {/* Quit button */}
    <button onClick={onQuit} style={{position:"absolute",top:12,left:"50%",transform:"translateX(-50%)",zIndex:10,background:"rgba(239,83,80,.2)",border:"1px solid rgba(239,83,80,.4)",color:"#FF6B6B",padding:"5px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer"}}>Quitter</button>

    {/* Toast */}
    {toastMsg&&<div style={{position:"absolute",top:48,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,.7)",backdropFilter:"blur(10px)",color:"#fff",padding:"6px 12px",borderRadius:8,fontSize:11,fontWeight:700,zIndex:20,border:"1px solid rgba(255,255,255,.1)",pointerEvents:"none",whiteSpace:"nowrap"}}>{toastMsg}</div>}
  </div>;
}



// ============================================================
// DRIVE TD v2 — Tower Defense médiéval (solo + multi coop)
// Map 900x900 carrée, SVG tours style app premium, ennemis chibi
// ============================================================

// 12 tours avec 3 upgrades + 2 branches spécialisation finale
const TD_TOWERS=[
  {id:"archer",name:"Archer",cost:50,dmg:8,range:130,cd:500,proj:1,color:"#8B4513",
   upg:[{cost:80,dmg:14,range:145,cd:450},{cost:140,dmg:22,range:160,cd:400}],
   branches:[
     {name:"Précision",desc:"+150% dmg, -20% cadence",mod:{dmg:2.5,cd:1.2}},
     {name:"Rapidité",desc:"+100% cadence, -15% portée",mod:{cd:0.5,range:0.85,dmg:0.9}},
   ]},
  {id:"baliste",name:"Baliste",cost:150,dmg:35,range:200,cd:1600,proj:1,color:"#6B4423",
   upg:[{cost:200,dmg:60,range:220,cd:1400},{cost:400,dmg:100,range:250,cd:1200}],
   branches:[
     {name:"Perce-armure",desc:"Ignore l'armure",mod:{pierce:true,dmg:1.1}},
     {name:"Explosif",desc:"Tirs AOE r=60",mod:{aoe:60,dmg:0.8}},
   ]},
  {id:"arbaletrier",name:"Arbalétrier",cost:100,dmg:20,range:160,cd:900,proj:1,color:"#455A64",pierceArmor:0.5,
   upg:[{cost:140,dmg:32,range:175,cd:800},{cost:260,dmg:50,range:190,cd:700}],
   branches:[
     {name:"Traversant",desc:"Traverse 3 ennemis",mod:{through:3}},
     {name:"Mortel",desc:"+120% dégâts",mod:{dmg:2.2}},
   ]},
  {id:"lancier",name:"Lancier",cost:175,dmg:50,range:90,cd:600,proj:1,color:"#C62828",
   upg:[{cost:200,dmg:80,range:100,cd:500},{cost:400,dmg:130,range:110,cd:400}],
   branches:[
     {name:"Tempête",desc:"Cadence ×2",mod:{cd:0.5}},
     {name:"Empalement",desc:"Bonus ×5 sur boss",mod:{bossDmg:5}},
   ]},
  {id:"catapulte",name:"Catapulte",cost:300,dmg:25,range:170,cd:2200,aoe:60,color:"#5D4037",
   upg:[{cost:400,dmg:45,range:190,cd:2000,aoe:70},{cost:700,dmg:80,range:210,cd:1700,aoe:85}],
   branches:[
     {name:"Bombardement",desc:"3 projectiles",mod:{proj:3,dmg:0.7}},
     {name:"Impact massif",desc:"AOE ×2",mod:{aoe:2}},
   ]},
  {id:"feu",name:"Tour de feu",cost:275,dmg:3,range:120,cd:300,dot:8,color:"#BF360C",
   upg:[{cost:350,dmg:6,range:135,cd:250,dot:14},{cost:600,dmg:10,range:150,cd:200,dot:22}],
   branches:[
     {name:"Inferno",desc:"DoT ×2",mod:{dot:2}},
     {name:"Propagation",desc:"Portée ×1.5",mod:{range:1.5}},
   ]},
  {id:"eclair",name:"Tour éclair",cost:325,dmg:18,range:150,cd:800,chain:3,color:"#F57F17",
   upg:[{cost:450,dmg:30,range:165,cd:700,chain:4},{cost:800,dmg:50,range:180,cd:600,chain:5}],
   branches:[
     {name:"Surtension",desc:"+3 chaînes",mod:{chain:2}},
     {name:"Foudre pure",desc:"Dégâts ×2",mod:{dmg:2}},
   ]},
  {id:"brume",name:"Tour à brume",cost:225,dmg:0,range:150,cd:1500,slow:0.5,slowDur:2.5,color:"#8E24AA",
   upg:[{cost:300,range:170,cd:1300,slow:0.6,slowDur:3},{cost:550,range:190,cd:1100,slow:0.7,slowDur:3.5}],
   branches:[
     {name:"Amnésie",desc:"30% chance ennemi recule",mod:{reverse:0.3}},
     {name:"Engloutie",desc:"Slow 90%",mod:{slow:0.9}},
   ]},
  {id:"mage",name:"Mage de glace",cost:200,dmg:2,range:150,cd:800,slow:0.5,slowDur:1.5,color:"#1976D2",
   upg:[{cost:275,dmg:5,range:170,cd:700,slow:0.6,slowDur:2},{cost:500,dmg:10,range:190,cd:600,slow:0.7,slowDur:2.5}],
   branches:[
     {name:"Gel profond",desc:"Stun 1s",mod:{stun:1}},
     {name:"Éclat glacial",desc:"Dégâts ×4",mod:{dmg:4}},
   ]},
  {id:"banquier",name:"Banquier",cost:250,dmg:0,range:0,cd:3000,goldGen:5,color:"#D4A017",
   upg:[{cost:300,goldGen:9,cd:2500},{cost:500,goldGen:15,cd:2000}],
   branches:[
     {name:"Avare",desc:"+50 or/vague",mod:{waveGold:50}},
     {name:"Prêteur",desc:"+50% production",mod:{goldGen:1.5}},
   ]},
  {id:"visee",name:"Tour de visée",cost:200,dmg:0,range:140,cd:0,boost:1.3,color:"#FFA000",
   upg:[{cost:275,range:160,boost:1.5},{cost:500,range:180,boost:1.75}],
   branches:[
     {name:"Concentration",desc:"Boost ×2",mod:{boost:2}},
     {name:"Commandement",desc:"Rayon ×2",mod:{range:2}},
   ]},
  {id:"autel",name:"Autel saint",cost:300,dmg:0,range:0,cd:30000,heal:1,color:"#FFB74D",
   upg:[{cost:400,cd:25000,heal:2},{cost:700,cd:20000,heal:3}],
   branches:[
     {name:"Salut",desc:"+5 vies/vague",mod:{waveHeal:5}},
     {name:"Gardien",desc:"Heal ×2",mod:{heal:2}},
   ]},
];

const TD_ENEMIES={
  gobelin:{name:"Gobelin",hp:30,speed:90,gold:5,size:18,armor:0,color:"#7B9E3F"},
  orc:{name:"Orc",hp:90,speed:65,gold:10,size:22,armor:0.1,color:"#556B2F"},
  chevalier:{name:"Chevalier",hp:240,speed:55,gold:20,size:21,armor:0.5,color:"#2C3E50"},
  spectre:{name:"Spectre",hp:120,speed:90,gold:25,size:20,armor:0,color:"#9B59B6"},
  sprinter:{name:"Sprinter",hp:50,speed:180,gold:15,size:17,armor:0,color:"#FF7043"},
  sorcier:{name:"Sorcier",hp:100,speed:55,gold:30,size:20,armor:0.1,heal:8,healRange:80,color:"#4A148C"},
  alpha:{name:"Alpha",hp:180,speed:50,gold:40,size:24,armor:0.25,buff:1.3,buffRange:100,color:"#D84315"},
  dragon:{name:"Dragon",hp:2500,speed:40,gold:300,size:34,armor:0.3,boss:true,color:"#C0392B"},
};

// 20 vagues progressives
const TD_WAVES=[
  [{t:"gobelin",n:8,d:800}],
  [{t:"gobelin",n:12,d:700}],
  [{t:"gobelin",n:10,d:500},{t:"orc",n:3,d:1200}],
  [{t:"sprinter",n:5,d:600}],
  [{t:"orc",n:8,d:800}],
  [{t:"gobelin",n:12,d:400},{t:"orc",n:5,d:900}],
  [{t:"chevalier",n:4,d:1500}],
  [{t:"orc",n:10,d:700},{t:"spectre",n:2,d:2000}],
  [{t:"sorcier",n:3,d:1500},{t:"gobelin",n:15,d:400}],
  [{t:"dragon",n:1,d:1}],
  [{t:"chevalier",n:8,d:1200}],
  [{t:"alpha",n:2,d:3000},{t:"orc",n:8,d:600}],
  [{t:"sprinter",n:10,d:500},{t:"chevalier",n:3,d:1500}],
  [{t:"spectre",n:10,d:600}],
  [{t:"dragon",n:1,d:1},{t:"orc",n:10,d:800}],
  [{t:"sorcier",n:5,d:1000},{t:"chevalier",n:6,d:800}],
  [{t:"alpha",n:4,d:2000}],
  [{t:"sprinter",n:20,d:300}],
  [{t:"chevalier",n:10,d:600},{t:"sorcier",n:3,d:1500}],
  [{t:"dragon",n:2,d:3000},{t:"alpha",n:5,d:1500}],
];

// Path serpentin 900x900
const TD_PATH=[
  {x:0,y:130},{x:320,y:130},{x:320,y:350},{x:100,y:350},{x:100,y:550},{x:600,y:550},
  {x:600,y:350},{x:770,y:350},{x:770,y:750},{x:250,y:750},{x:250,y:870},{x:900,y:870}
];

// SVG tour renderers (style app premium)
const TDTowerSVG={
  archer:`<g>
    <ellipse cx="0" cy="32" rx="28" ry="5" fill="#000" opacity=".3"/>
    <path d="M-22 32 L 22 32 L 18 -8 L -18 -8 Z" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <rect x="-20" y="-16" width="40" height="8" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <rect x="-20" y="-16" width="6" height="5" fill="#6B6B6B" stroke="#3a3a3a" stroke-width="1"/>
    <rect x="-3" y="-16" width="6" height="5" fill="#6B6B6B" stroke="#3a3a3a" stroke-width="1"/>
    <rect x="14" y="-16" width="6" height="5" fill="#6B6B6B" stroke="#3a3a3a" stroke-width="1"/>
    <rect x="-5" y="12" width="10" height="15" fill="#4A3820" stroke="#2A1A10" stroke-width="1.5"/>
    <circle cx="-4" cy="-26" r="5" fill="#D4A88C" stroke="#5C3317" stroke-width="1.5"/>
    <rect x="-6" y="-22" width="4" height="6" fill="#6B8E23"/>
    <path d="M-1 -24 Q 4 -20 1 -16" stroke="#5C3317" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="15" y="-20" width="2" height="10" fill="#5C3317"/>
    <path d="M17 -20 L 28 -17 L 17 -14 Z" fill="#FFD54F" stroke="#D4A017" stroke-width="1"/>
  </g>`,
  baliste:`<g>
    <ellipse cx="0" cy="32" rx="28" ry="5" fill="#000" opacity=".3"/>
    <rect x="-26" y="26" width="52" height="6" fill="#5C3317" stroke="#2A1A10" stroke-width="1.5"/>
    <rect x="-22" y="-6" width="44" height="30" fill="url(#t-wood)" stroke="#3a1a10" stroke-width="2"/>
    <line x1="-22" y1="-6" x2="-32" y2="-24" stroke="#3a1a10" stroke-width="3" stroke-linecap="round"/>
    <line x1="22" y1="-6" x2="32" y2="-24" stroke="#3a1a10" stroke-width="3" stroke-linecap="round"/>
    <path d="M-32 -24 Q 0 -14 32 -24" stroke="#E0E0E0" stroke-width="1.5" fill="none"/>
    <line x1="0" y1="-14" x2="0" y2="-30" stroke="#8B6F47" stroke-width="3" stroke-linecap="round"/>
    <polygon points="0,-30 -3,-26 3,-26" fill="#C0C0C0" stroke="#616161" stroke-width="1"/>
  </g>`,
  arbaletrier:`<g>
    <ellipse cx="0" cy="32" rx="26" ry="5" fill="#000" opacity=".3"/>
    <path d="M-22 32 L 22 32 L 20 -10 L -20 -10 Z" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <rect x="-20" y="-18" width="40" height="8" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <circle cx="0" cy="-26" r="5" fill="#D4A88C" stroke="#5C3317" stroke-width="1.5"/>
    <rect x="-4" y="-22" width="8" height="8" fill="#455A64" stroke="#263238" stroke-width="1"/>
    <rect x="-11" y="-23" width="22" height="3" fill="#5C3317" stroke="#3a1a10" stroke-width="1"/>
    <path d="M-13 -23 Q -13 -28 -9 -25 M 13 -23 Q 13 -28 9 -25" stroke="#3a1a10" stroke-width="1.5" fill="none"/>
    <line x1="0" y1="-20" x2="0" y2="-28" stroke="#8B6F47" stroke-width="2"/>
  </g>`,
  lancier:`<g>
    <ellipse cx="0" cy="32" rx="26" ry="5" fill="#000" opacity=".3"/>
    <circle cx="0" cy="16" r="22" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <circle cx="0" cy="16" r="17" fill="none" stroke="#3a3a3a" stroke-width="1" opacity=".5"/>
    <circle cx="0" cy="-6" r="6" fill="#D4A88C" stroke="#5C3317" stroke-width="1.5"/>
    <rect x="-6" y="0" width="12" height="12" fill="#C62828" stroke="#8B0000" stroke-width="1.5"/>
    <path d="M-6 -12 Q 0 -18 6 -12 L 5 -6 L -5 -6 Z" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="1.5"/>
    <line x1="0" y1="-8" x2="0" y2="-30" stroke="#8B6F47" stroke-width="3" stroke-linecap="round"/>
    <polygon points="0,-30 -3,-24 3,-24" fill="#E0E0E0" stroke="#616161" stroke-width="1"/>
  </g>`,
  catapulte:`<g>
    <ellipse cx="0" cy="32" rx="32" ry="6" fill="#000" opacity=".3"/>
    <rect x="-28" y="22" width="56" height="8" fill="#5C3317" stroke="#2A1A10" stroke-width="1.5"/>
    <rect x="-22" y="8" width="6" height="18" fill="#8B6F47" stroke="#5C3317" stroke-width="1.5"/>
    <rect x="16" y="8" width="6" height="18" fill="#8B6F47" stroke="#5C3317" stroke-width="1.5"/>
    <g transform="rotate(-25)">
      <rect x="-3" y="-28" width="6" height="36" fill="url(#t-wood)" stroke="#3a1a10" stroke-width="1.5"/>
      <path d="M-14 -36 Q -6 -42 8 -40 L 12 -28 L -16 -26 Z" fill="#5C3317" stroke="#2A1A10" stroke-width="2"/>
      <circle cx="-3" cy="-33" r="6" fill="#1A0A05"/>
    </g>
    <circle cx="-20" cy="26" r="5" fill="#3a1a10" stroke="#1a0a05" stroke-width="1.5"/>
    <circle cx="20" cy="26" r="5" fill="#3a1a10" stroke="#1a0a05" stroke-width="1.5"/>
  </g>`,
  feu:`<g>
    <ellipse cx="0" cy="32" rx="26" ry="5" fill="#000" opacity=".3"/>
    <path d="M-20 32 L 20 32 L 17 -12 L -17 -12 Z" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <rect x="-18" y="-18" width="36" height="6" fill="#6B6B6B" stroke="#3a3a3a" stroke-width="1.5"/>
    <path d="M-10 -18 Q -14 -30 -7 -26 Q -5 -38 0 -32 Q 5 -38 7 -26 Q 14 -30 10 -18 Z" fill="url(#t-fire)"/>
    <path d="M-6 -20 Q -8 -28 -4 -26 Q -2 -34 0 -30 Q 2 -34 4 -26 Q 8 -28 6 -20 Z" fill="#FFE082"/>
    <circle cx="0" cy="-25" r="3" fill="#FFF9C4"/>
  </g>`,
  eclair:`<g>
    <ellipse cx="0" cy="32" rx="24" ry="5" fill="#000" opacity=".3"/>
    <path d="M-18 32 L 18 32 L 15 -10 L -15 -10 Z" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <circle cx="0" cy="-14" r="12" fill="#212121" stroke="#F57F17" stroke-width="2"/>
    <path d="M0 -22 L -4 -16 L 1 -13 L -3 -6" stroke="url(#t-light)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M0 -22 L 4 -16 L -1 -13 L 3 -6" stroke="url(#t-light)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="0" cy="-14" r="4" fill="#FFF59D"/>
    <line x1="-10" y1="-22" x2="-13" y2="-30" stroke="#757575" stroke-width="1.5"/>
    <line x1="10" y1="-22" x2="13" y2="-30" stroke="#757575" stroke-width="1.5"/>
    <circle cx="-13" cy="-30" r="2" fill="#F57F17"/>
    <circle cx="13" cy="-30" r="2" fill="#F57F17"/>
  </g>`,
  brume:`<g>
    <ellipse cx="0" cy="32" rx="24" ry="5" fill="#000" opacity=".3"/>
    <path d="M-18 32 L 18 32 L 15 -6 L -15 -6 Z" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <ellipse cx="0" cy="-10" rx="16" ry="8" fill="#3E2723" stroke="#1A0A05" stroke-width="2"/>
    <rect x="-16" y="-12" width="32" height="3" fill="#5C3317"/>
    <circle cx="-5" cy="-20" r="7" fill="url(#t-mist)" opacity=".85"/>
    <circle cx="4" cy="-24" r="5" fill="url(#t-mist)" opacity=".75"/>
    <circle cx="-2" cy="-30" r="4" fill="url(#t-mist)" opacity=".65"/>
    <circle cx="6" cy="-32" r="3" fill="url(#t-mist)" opacity=".5"/>
  </g>`,
  mage:`<g>
    <ellipse cx="0" cy="32" rx="24" ry="5" fill="#000" opacity=".3"/>
    <path d="M-18 32 L 18 32 L 15 -10 L -15 -10 Z" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <path d="M-8 10 L -13 -6 Q 0 -14 13 -6 L 8 10 Z" fill="#1976D2" stroke="#0D47A1" stroke-width="1.5"/>
    <polygon points="-7,-11 0,-28 7,-11" fill="#0D47A1" stroke="#082C5E" stroke-width="1.5"/>
    <polygon points="-4,-14 0,-24 4,-14" fill="#1565C0"/>
    <polygon points="0,-21 1.5,-19 3.5,-19 2,-17 2.5,-14.5 0,-15.8 -2.5,-14.5 -2,-17 -3.5,-19 -1.5,-19" fill="#FFD54F"/>
    <circle cx="0" cy="-4" r="4" fill="#D4A88C" stroke="#5C3317" stroke-width="1"/>
    <line x1="12" y1="2" x2="18" y2="-14" stroke="#8B6F47" stroke-width="2.5" stroke-linecap="round"/>
    <polygon points="18,-16 14,-20 18,-26 22,-20" fill="url(#t-ice)" stroke="#0277BD" stroke-width="1"/>
  </g>`,
  banquier:`<g>
    <ellipse cx="0" cy="32" rx="28" ry="5" fill="#000" opacity=".3"/>
    <rect x="-22" y="-4" width="44" height="28" fill="url(#t-wood)" stroke="#3a1a10" stroke-width="2"/>
    <path d="M-22 -4 Q 0 -20 22 -4" fill="url(#t-wood)" stroke="#3a1a10" stroke-width="2"/>
    <rect x="-22" y="3" width="44" height="3" fill="url(#t-gold)" stroke="#8B6F47" stroke-width=".5"/>
    <rect x="-22" y="13" width="44" height="3" fill="url(#t-gold)" stroke="#8B6F47" stroke-width=".5"/>
    <circle cx="0" cy="9" r="4" fill="url(#t-gold)" stroke="#5C3317" stroke-width="1.5"/>
    <rect x="-1" y="8" width="2" height="4" fill="#3a1a10"/>
    <circle cx="-14" cy="-2" r="4" fill="#FFD54F" stroke="#D4A017" stroke-width="1"/>
    <circle cx="-9" cy="-5" r="3" fill="#FFE082" stroke="#D4A017" stroke-width="1"/>
    <circle cx="12" cy="-4" r="3" fill="#FFD54F" stroke="#D4A017" stroke-width="1"/>
    <text x="-14" y="1" text-anchor="middle" font-size="5" font-weight="900" fill="#8B6F47">$</text>
  </g>`,
  visee:`<g>
    <ellipse cx="0" cy="32" rx="22" ry="5" fill="#000" opacity=".3"/>
    <path d="M-14 32 L 14 32 L 12 -8 L -12 -8 Z" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <g transform="rotate(-20)">
      <rect x="-4" y="-18" width="8" height="30" fill="url(#t-gold)" stroke="#8B6F47" stroke-width="1.5"/>
      <rect x="-6" y="-20" width="12" height="5" fill="#FFD54F" stroke="#8B6F47" stroke-width="1"/>
      <rect x="-5" y="10" width="10" height="5" fill="#FFD54F" stroke="#8B6F47" stroke-width="1"/>
      <circle cx="0" cy="-18" r="2" fill="#3a1a10"/>
    </g>
    <text x="-15" y="-15" font-size="7" fill="#FFD54F" stroke="#8B6F47" stroke-width=".3">★</text>
    <text x="13" y="-18" font-size="6" fill="#FFD54F" stroke="#8B6F47" stroke-width=".3">★</text>
  </g>`,
  autel:`<g>
    <ellipse cx="0" cy="32" rx="26" ry="5" fill="#000" opacity=".3"/>
    <rect x="-16" y="8" width="32" height="20" fill="url(#t-stone)" stroke="#3a3a3a" stroke-width="2"/>
    <rect x="-18" y="5" width="36" height="5" fill="#E0E0E0" stroke="#9E9E9E" stroke-width="1"/>
    <circle cx="0" cy="-12" r="16" fill="url(#t-holy)" opacity=".3"/>
    <circle cx="0" cy="-12" r="10" fill="url(#t-holy)" opacity=".45"/>
    <rect x="-1.5" y="-24" width="3" height="26" fill="url(#t-gold)" stroke="#8B6F47" stroke-width=".5"/>
    <rect x="-7" y="-16" width="14" height="3" fill="url(#t-gold)" stroke="#8B6F47" stroke-width=".5"/>
    <rect x="-13" y="0" width="3" height="7" fill="#F4E8C1"/>
    <rect x="10" y="0" width="3" height="7" fill="#F4E8C1"/>
    <ellipse cx="-11.5" cy="-3" rx="2" ry="3" fill="#FFE082"/>
    <ellipse cx="11.5" cy="-3" rx="2" ry="3" fill="#FFE082"/>
  </g>`,
};

// SVG ennemis style chibi (gros yeux expressifs)
const TDEnemySVG={
  gobelin:`<g>
    <ellipse cx="0" cy="14" rx="12" ry="3" fill="#000" opacity=".4"/>
    <ellipse cx="0" cy="2" rx="9" ry="10" fill="#7B9E3F" stroke="#3F5F20" stroke-width="2"/>
    <circle cx="0" cy="-8" r="9" fill="#8FB04A" stroke="#3F5F20" stroke-width="2"/>
    <polygon points="-8,-10 -13,-15 -4,-12" fill="#7B9E3F" stroke="#3F5F20" stroke-width="1.5"/>
    <polygon points="8,-10 13,-15 4,-12" fill="#7B9E3F" stroke="#3F5F20" stroke-width="1.5"/>
    <circle cx="-3" cy="-8" r="2.5" fill="#fff"/>
    <circle cx="3" cy="-8" r="2.5" fill="#fff"/>
    <circle cx="-2.5" cy="-7" r="1.5" fill="#D32F2F"/>
    <circle cx="3.5" cy="-7" r="1.5" fill="#D32F2F"/>
    <path d="M-3 -3 L 0 -1 L 3 -3" stroke="#1a1a1a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <polygon points="-2,-3 -1,0 0,-3" fill="#fff"/>
  </g>`,
  orc:`<g>
    <ellipse cx="0" cy="17" rx="15" ry="4" fill="#000" opacity=".4"/>
    <ellipse cx="0" cy="4" rx="12" ry="12" fill="#556B2F" stroke="#2A3818" stroke-width="2"/>
    <path d="M-10 0 Q 0 -4 10 0 L 10 10 L -10 10 Z" fill="#5D4037" stroke="#3E2723" stroke-width="1.5"/>
    <circle cx="0" cy="-11" r="10" fill="#6B8B3A" stroke="#2A3818" stroke-width="2"/>
    <polygon points="-3,-6 -4,-2 -1,-3" fill="#F4E8C1" stroke="#3E2723" stroke-width=".5"/>
    <polygon points="3,-6 4,-2 1,-3" fill="#F4E8C1" stroke="#3E2723" stroke-width=".5"/>
    <circle cx="-4" cy="-12" r="2.5" fill="#fff"/>
    <circle cx="4" cy="-12" r="2.5" fill="#fff"/>
    <circle cx="-3.5" cy="-11" r="1.5" fill="#FFC107"/>
    <circle cx="4.5" cy="-11" r="1.5" fill="#FFC107"/>
    <path d="M-10 -18 Q 0 -24 10 -18 L 9 -13 L -9 -13 Z" fill="#424242" stroke="#212121" stroke-width="1.5"/>
    <polygon points="0,-24 -2,-18 2,-18" fill="#B71C1C" stroke="#7F0000" stroke-width=".5"/>
  </g>`,
  chevalier:`<g>
    <ellipse cx="0" cy="17" rx="13" ry="3.5" fill="#000" opacity=".4"/>
    <ellipse cx="0" cy="4" rx="10" ry="12" fill="#2C3E50" stroke="#1A252F" stroke-width="2"/>
    <rect x="-10" y="-3" width="20" height="3" fill="#34495E" stroke="#1A252F" stroke-width="1"/>
    <rect x="-10" y="5" width="20" height="3" fill="#34495E" stroke="#1A252F" stroke-width="1"/>
    <polygon points="0,-2 5,3 0,8 -5,3" fill="#B71C1C" stroke="#000" stroke-width=".8"/>
    <path d="M-10 -18 L -10 -12 L -7 -9 L 7 -9 L 10 -12 L 10 -18 Q 0 -24 -10 -18" fill="#37474F" stroke="#1A252F" stroke-width="2"/>
    <rect x="-6" y="-15" width="12" height="2" fill="#000"/>
    <circle cx="-2.5" cy="-14" r=".8" fill="#FFEB3B"/>
    <circle cx="2.5" cy="-14" r=".8" fill="#FFEB3B"/>
    <path d="M0 -24 Q 3 -30 6 -30 Q 2 -27 0 -22" fill="#B71C1C" stroke="#000" stroke-width=".8"/>
  </g>`,
  spectre:`<g>
    <ellipse cx="0" cy="14" rx="13" ry="3" fill="#9B59B6" opacity=".3"/>
    <path d="M-12 -4 Q -14 -14 -8 -20 Q 0 -26 8 -20 Q 14 -14 12 -4 Q 12 8 8 13 Q 4 10 0 13 Q -4 10 -8 13 Q -12 8 -12 -4 Z" 
          fill="#9B59B6" stroke="#6A1B9A" stroke-width="2" opacity=".8"/>
    <circle cx="-4" cy="-10" r="3.5" fill="#fff"/>
    <circle cx="4" cy="-10" r="3.5" fill="#fff"/>
    <circle cx="-4" cy="-10" r="2" fill="#4A148C"/>
    <circle cx="4" cy="-10" r="2" fill="#4A148C"/>
    <circle cx="-3.5" cy="-10.5" r=".7" fill="#fff"/>
    <circle cx="4.5" cy="-10.5" r=".7" fill="#fff"/>
    <ellipse cx="0" cy="-3" rx="2.5" ry="3.5" fill="#4A148C"/>
  </g>`,
  sprinter:`<g>
    <ellipse cx="0" cy="13" rx="12" ry="3" fill="#000" opacity=".4"/>
    <ellipse cx="-2" cy="3" rx="7" ry="10" fill="#FF7043" stroke="#8C2A0C" stroke-width="2"/>
    <circle cx="-2" cy="-9" r="7" fill="#FF8A65" stroke="#8C2A0C" stroke-width="2"/>
    <circle cx="-5" cy="-9" r="2" fill="#fff"/>
    <circle cx="1" cy="-9" r="2" fill="#fff"/>
    <circle cx="-4.5" cy="-8.5" r="1" fill="#000"/>
    <circle cx="1.5" cy="-8.5" r="1" fill="#000"/>
    <line x1="7" y1="-4" x2="14" y2="-5" stroke="#FFD54F" stroke-width="2" stroke-linecap="round"/>
    <line x1="7" y1="1" x2="14" y2="1" stroke="#FFD54F" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="7" y1="5" x2="13" y2="6" stroke="#FFD54F" stroke-width="1.2" stroke-linecap="round"/>
  </g>`,
  sorcier:`<g>
    <ellipse cx="0" cy="15" rx="11" ry="3" fill="#000" opacity=".4"/>
    <path d="M-10 13 L -12 -4 Q 0 -14 12 -4 L 10 13 Z" fill="#4A148C" stroke="#2A0845" stroke-width="2"/>
    <path d="M-12 -2 L -16 6 L -13 7 L -10 2" fill="#6A1B9A" stroke="#2A0845" stroke-width="1"/>
    <path d="M12 -2 L 16 6 L 13 7 L 10 2" fill="#6A1B9A" stroke="#2A0845" stroke-width="1"/>
    <circle cx="0" cy="-4" r="5" fill="#D4A88C" stroke="#5C3317" stroke-width="1.5"/>
    <path d="M-3 -1 Q 0 4 3 -1" fill="#ECEFF1" stroke="#B0BEC5" stroke-width="1"/>
    <circle cx="-1.5" cy="-5" r="1" fill="#000"/>
    <circle cx="1.5" cy="-5" r="1" fill="#000"/>
    <polygon points="-7,-6 0,-24 7,-6" fill="#4A148C" stroke="#2A0845" stroke-width="1.5"/>
    <polygon points="-4,-8 0,-22 4,-8" fill="#6A1B9A"/>
    <circle cx="0" cy="-16" r="1.5" fill="#FFD54F"/>
    <circle cx="-2" cy="-12" r="1" fill="#FFD54F"/>
    <line x1="13" y1="2" x2="16" y2="-12" stroke="#8B6F47" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="16" cy="-12" r="3" fill="#4FC3F7" opacity=".9"/>
    <circle cx="16" cy="-12" r="5" fill="#4FC3F7" opacity=".4"/>
  </g>`,
  alpha:`<g>
    <ellipse cx="0" cy="18" rx="16" ry="4" fill="#000" opacity=".45"/>
    <ellipse cx="0" cy="5" rx="13" ry="13" fill="#D84315" stroke="#3E2723" stroke-width="2"/>
    <circle cx="0" cy="-10" r="10" fill="#E64A19" stroke="#3E2723" stroke-width="2"/>
    <polygon points="-7,-16 -11,-24 -5,-17" fill="#3E2723" stroke="#000" stroke-width="1"/>
    <polygon points="7,-16 11,-24 5,-17" fill="#3E2723" stroke="#000" stroke-width="1"/>
    <circle cx="-3.5" cy="-11" r="2.5" fill="#fff"/>
    <circle cx="3.5" cy="-11" r="2.5" fill="#fff"/>
    <circle cx="-3" cy="-10.5" r="1.5" fill="#FFEB3B"/>
    <circle cx="4" cy="-10.5" r="1.5" fill="#FFEB3B"/>
    <circle cx="-3" cy="-10.5" r=".6" fill="#D32F2F"/>
    <circle cx="4" cy="-10.5" r=".6" fill="#D32F2F"/>
    <polygon points="-3,-6 -1.5,-3 0,-6" fill="#fff"/>
    <polygon points="0,-6 1.5,-3 3,-6" fill="#fff"/>
    <circle cx="0" cy="-2" r="17" fill="none" stroke="#FFD54F" stroke-width="1.5" opacity=".6" stroke-dasharray="3 4"/>
  </g>`,
  dragon:`<g>
    <ellipse cx="0" cy="20" rx="22" ry="5" fill="#000" opacity=".5"/>
    <path d="M-14 -4 Q -30 -10 -24 8 Q -16 2 -14 6 Z" fill="#8B2828" stroke="#500000" stroke-width="1.5" opacity=".9"/>
    <path d="M14 -4 Q 30 -10 24 8 Q 16 2 14 6 Z" fill="#8B2828" stroke="#500000" stroke-width="1.5" opacity=".9"/>
    <ellipse cx="0" cy="4" rx="16" ry="13" fill="#C0392B" stroke="#500000" stroke-width="2"/>
    <path d="M-10 0 Q -5 -3 0 0 Q 5 -3 10 0 M-10 6 Q -5 3 0 6 Q 5 3 10 6" stroke="#8B0000" stroke-width="1" fill="none"/>
    <ellipse cx="0" cy="-13" rx="10" ry="9" fill="#E74C3C" stroke="#500000" stroke-width="2"/>
    <polygon points="-5,-20 -9,-28 -2,-22" fill="#2C1810" stroke="#000" stroke-width="1"/>
    <polygon points="5,-20 9,-28 2,-22" fill="#2C1810" stroke="#000" stroke-width="1"/>
    <ellipse cx="-4" cy="-14" rx="2.5" ry="3" fill="#fff"/>
    <ellipse cx="4" cy="-14" rx="2.5" ry="3" fill="#fff"/>
    <ellipse cx="-4" cy="-14" rx="1.2" ry="2" fill="#FFD54F"/>
    <ellipse cx="4" cy="-14" rx="1.2" ry="2" fill="#FFD54F"/>
    <ellipse cx="-4" cy="-13.5" rx=".6" ry="1.6" fill="#000"/>
    <ellipse cx="4" cy="-13.5" rx=".6" ry="1.6" fill="#000"/>
    <circle cx="-2.5" cy="-10" r="1" fill="#2C1810"/>
    <circle cx="2.5" cy="-10" r="1" fill="#2C1810"/>
    <polygon points="-2,-8 -1.5,-5 -1,-8" fill="#fff"/>
    <polygon points="1,-8 1.5,-5 2,-8" fill="#fff"/>
    <path d="M-2 -7 Q -1 -3 -2 0" stroke="#FF6F00" stroke-width="1.5" fill="none" opacity=".8"/>
    <path d="M2 -7 Q 1 -3 2 0" stroke="#FF6F00" stroke-width="1.5" fill="none" opacity=".8"/>
  </g>`,
};

function DriveTD({setPage,auth,flash}){
  const[screen,setScreen]=useState("lobby");
  const[sessionCode,setSessionCode]=useState("");
  const[joinCode,setJoinCode]=useState("");
  const[session,setSession]=useState(null);
  const[lobbyPlayers,setLobbyPlayers]=useState([]);
  const[loading,setLoading]=useState(false);
  const[mode,setMode]=useState("solo");
  const pollRef=useRef(null);

  useEffect(()=>()=>{if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}},[]);

  const genCode=()=>{const L="ABCDEFGHJKMNPQRSTUVWXYZ";return Array.from({length:4},()=>L[Math.floor(Math.random()*L.length)]).join("");};

  const createSoloSession=async()=>{
    setMode("solo");
    setSession({id:0,host_code:auth.code,solo:true});
    setScreen("playing");
  };

  const createCoopSession=async()=>{
    setLoading(true);
    try{
      let code=genCode();
      for(let i=0;i<5;i++){
        const ex=await dbGet("td_sessions",`code=eq.${code}&status=in.(waiting,playing)`);
        if(!ex||ex.length===0)break;
        code=genCode();
      }
      const[s]=await dbPost("td_sessions",{code,host_code:auth.code,status:"waiting",lives:100,gold:350,wave:0});
      await dbPost("td_players",{session_id:s.id,player_code:auth.code,name:auth.name||auth.code});
      setSession(s);setSessionCode(code);setMode("coop");setScreen("waiting");startLobbyPoll(s.id);
    }catch(e){flash("Erreur: "+e.message);}
    setLoading(false);
  };

  const joinSession=async()=>{
    if(joinCode.length!==4){flash("Code à 4 lettres");return;}
    setLoading(true);
    try{
      const list=await dbGet("td_sessions",`code=eq.${joinCode.toUpperCase()}&status=eq.waiting&limit=1`);
      if(!list||list.length===0){flash("Partie introuvable");setLoading(false);return;}
      const s=list[0];
      await dbPost("td_players",{session_id:s.id,player_code:auth.code,name:auth.name||auth.code});
      setSession(s);setSessionCode(s.code);setMode("coop");setScreen("waiting");startLobbyPoll(s.id);
    }catch(e){flash("Erreur: "+e.message);}
    setLoading(false);
  };

  const startLobbyPoll=(sid)=>{
    const poll=async()=>{
      try{
        const[s]=await dbGet("td_sessions",`id=eq.${sid}&limit=1`);
        if(!s)return;
        if(s.status==="playing"){setSession(s);setScreen("playing");if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}return;}
        const players=await dbGet("td_players",`session_id=eq.${sid}&order=id.asc`);
        setLobbyPlayers(players||[]);
      }catch(e){}
    };
    poll();pollRef.current=setInterval(poll,2000);
  };

  const startGame=async()=>{
    if(!session)return;
    try{
      await dbPatch("td_sessions",{status:"playing"},`id=eq.${session.id}`);
      setScreen("playing");
      if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}
    }catch(e){flash("Erreur: "+e.message);}
  };

  const leaveSession=async()=>{
    try{
      if(session&&!session.solo){
        await dbDel("td_players",`session_id=eq.${session.id}&player_code=eq.${auth.code}`);
        if(session.host_code===auth.code)await dbPatch("td_sessions",{status:"ended"},`id=eq.${session.id}`);
      }
    }catch(e){}
    if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}
    setSession(null);setLobbyPlayers([]);setScreen("lobby");
  };

  const quit=async()=>{await leaveSession();setPage("home");};

  const DARK_BG="linear-gradient(170deg,#0a2e24 0%,#0d1b2a 100%)";

  if(screen==="playing"&&session){
    return<DriveTDArena session={session} mode={mode} auth={auth} onQuit={quit} onGameOver={()=>setScreen("gameover")} onVictory={()=>setScreen("victory")} flash={flash}/>;
  }

  if(screen==="gameover"||screen==="victory"){
    const won=screen==="victory";
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,color:"#fff"}}>
      <div style={{fontSize:64,marginBottom:10}}>{won?"👑":"💀"}</div>
      <div style={{fontSize:28,fontWeight:900,color:won?"#FFD54F":"#EF5350",marginBottom:8}}>{won?"Victoire royale !":"Château tombé..."}</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:24}}>{won?"Toutes les vagues repoussées":"Le Royaume d'Oranje est conquis"}</div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>{setScreen("lobby");setSession(null);}} style={{padding:"11px 22px",borderRadius:11,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.08)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>Retour</button>
        <button onClick={quit} style={{padding:"11px 22px",borderRadius:11,border:"none",background:"linear-gradient(135deg,#8B4513,#D4A017)",color:"#fff",fontSize:13,fontWeight:900,cursor:"pointer"}}>Quitter</button>
      </div>
    </div>;
  }

  if(screen==="waiting"){
    const isHost=session?.host_code===auth.code;
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
      <div style={{padding:"12px 14px"}}>
        <button onClick={leaveSession} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 14px"}}>
        <div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,.5)",letterSpacing:2,textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Code de la partie</div>
          <div style={{fontSize:48,fontWeight:900,letterSpacing:8,color:"#FFD54F",fontFamily:"monospace"}}>{sessionCode}</div>
        </div>
        <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,border:"1px solid rgba(255,255,255,.06)",padding:12,marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Défenseurs ({lobbyPlayers.length})</div>
          {lobbyPlayers.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
            <div style={{width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#8B4513,#D4A017)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:12}}>{(p.name||"?")[0].toUpperCase()}</div>
            <span style={{flex:1,fontSize:13,fontWeight:700}}>{p.name||p.player_code}</span>
            {p.player_code===session.host_code&&<span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:5,background:"rgba(255,213,79,.2)",color:"#FFD54F",textTransform:"uppercase"}}>Châtelain</span>}
          </div>)}
        </div>
        {isHost?<button onClick={startGame} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#8B4513,#D4A017)",color:"#fff",fontSize:14,fontWeight:900,cursor:"pointer",boxShadow:"0 6px 20px rgba(212,160,23,.5)",letterSpacing:1,textTransform:"uppercase"}}>▶ Lancer l'assaut</button>:
        <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.5)"}}>En attente du châtelain...</div>}
      </div>
    </div>;
  }

  if(screen==="join"){
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
      <div style={{padding:"12px 14px"}}>
        <button onClick={()=>setScreen("lobby")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
      </div>
      <div style={{flex:1,padding:"10px 20px",display:"flex",flexDirection:"column",justifyContent:"center",maxWidth:400,width:"100%",margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:28,fontWeight:900,marginBottom:4}}>Rejoindre le fief</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>Entre le code du châtelain</div>
        </div>
        <input type="text" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().slice(0,4))} placeholder="ABCD" maxLength={4} style={{width:"100%",padding:"18px",borderRadius:14,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:32,fontWeight:900,textAlign:"center",letterSpacing:10,outline:"none",fontFamily:"monospace",marginBottom:16}}/>
        <button onClick={joinSession} disabled={loading||joinCode.length!==4} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:joinCode.length===4?"linear-gradient(135deg,#8B4513,#D4A017)":"rgba(255,255,255,.08)",color:"#fff",fontSize:14,fontWeight:900,cursor:joinCode.length===4?"pointer":"not-allowed",letterSpacing:1,textTransform:"uppercase"}}>{loading?"Recherche...":"Rejoindre"}</button>
      </div>
    </div>;
  }

  return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
    <div style={{padding:"12px 14px"}}>
      <button onClick={()=>setPage("home")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
    </div>
    <div style={{flex:1,padding:"0 20px 20px",display:"flex",flexDirection:"column",justifyContent:"center",maxWidth:400,width:"100%",margin:"0 auto",position:"relative"}}>
      <div style={{position:"absolute",top:20,left:"50%",transform:"translateX(-50%)",width:300,height:300,background:"radial-gradient(circle,#D4A01755,transparent 70%)",filter:"blur(50px)",pointerEvents:"none"}}/>
      <div style={{textAlign:"center",marginBottom:28,position:"relative",zIndex:1}}>
        <div style={{fontSize:52,marginBottom:6}}>🏰</div>
        <div style={{fontSize:36,fontWeight:900,letterSpacing:-1,background:"linear-gradient(135deg,#FFD54F,#8B4513)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:4}}>Drive TD</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.5)",letterSpacing:2,textTransform:"uppercase",fontWeight:700}}>Royaume d'Oranje · Tower Defense</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,position:"relative",zIndex:1}}>
        <button onClick={createSoloSession} style={{padding:"14px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#8B4513,#D4A017)",color:"#fff",fontSize:14,fontWeight:900,cursor:"pointer",boxShadow:"0 6px 20px rgba(212,160,23,.5)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,letterSpacing:1,textTransform:"uppercase"}}>
          <span style={{fontSize:18}}>⚔️</span> Partie solo
        </button>
        <button onClick={createCoopSession} disabled={loading} style={{padding:"14px",borderRadius:12,border:"1px solid rgba(255,213,79,.4)",background:"rgba(255,213,79,.1)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,letterSpacing:1,textTransform:"uppercase"}}>
          <span style={{fontSize:18}}>🛡</span> Coop — créer
        </button>
        <button onClick={()=>setScreen("join")} style={{padding:"14px",borderRadius:12,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,letterSpacing:1,textTransform:"uppercase"}}>
          <span style={{fontSize:18}}>🏹</span> Coop — rejoindre
        </button>
      </div>
      <div style={{marginTop:18,fontSize:10,color:"rgba(255,255,255,.4)",textAlign:"center",lineHeight:1.6,position:"relative",zIndex:1}}>
        Défends ton royaume contre 20 vagues.<br/>100 vies, 350 pièces d'or pour commencer.<br/>12 tours · 3 sorts · Drag & drop
      </div>
    </div>
  </div>;
}

// ============================================================
// DriveTD ARENA — SVG-based rendering, drag&drop, 12 towers, spells
// ============================================================
function DriveTDArena({session,mode,auth,onQuit,onGameOver,onVictory,flash}){
  const svgRef=useRef(null);
  const WORLD=900;

  const stateRef=useRef({
    running:true,
    towers:[],
    enemies:[],
    projectiles:[],
    fx:[],
    gold:350,lives:100,wave:0,
    waveState:"idle",
    spawnQueue:[],
    waveStartTime:0,
    selectedTower:null,
    dragType:null,
    dragPos:null,
    speed:1,
    spells:{meteor:{ready:true,at:0,cd:45000},gold:{ready:true,at:0,cd:90000},time:{ready:true,at:0,cd:60000}},
    timeFreezeUntil:0,
    targetingSpell:null,
    toastMsg:null,toastAt:0,
  });

  const[gold,setGold]=useState(350);
  const[lives,setLives]=useState(100);
  const[wave,setWave]=useState(0);
  const[selected,setSelected]=useState(null);
  const[dragging,setDragging]=useState(null);
  const[dragPos,setDragPos]=useState(null);
  const[speed,setSpeed]=useState(1);
  const[waveState,setWaveState]=useState("idle");
  const[renderTick,setRenderTick]=useState(0);
  const[toastMsg,setToastMsg]=useState(null);
  const[spellCds,setSpellCds]=useState({meteor:1,gold:1,time:1});
  const[targetingSpell,setTargetingSpell]=useState(null);
  const channelRef=useRef(null);
  const towerIdRef=useRef(1);
  const enemyIdRef=useRef(1);

  const pathLen=useMemo(()=>{
    let t=0;for(let i=0;i<TD_PATH.length-1;i++)t+=Math.hypot(TD_PATH[i+1].x-TD_PATH[i].x,TD_PATH[i+1].y-TD_PATH[i].y);
    return t;
  },[]);

  const pathAt=(p)=>{
    const target=p*pathLen;let acc=0;
    for(let i=0;i<TD_PATH.length-1;i++){
      const seg=Math.hypot(TD_PATH[i+1].x-TD_PATH[i].x,TD_PATH[i+1].y-TD_PATH[i].y);
      if(acc+seg>=target){const t=(target-acc)/seg;return{x:TD_PATH[i].x+(TD_PATH[i+1].x-TD_PATH[i].x)*t,y:TD_PATH[i].y+(TD_PATH[i+1].y-TD_PATH[i].y)*t};}
      acc+=seg;
    }
    return TD_PATH[TD_PATH.length-1];
  };

  const distToPath=(x,y)=>{
    let minD=Infinity;
    for(let i=0;i<TD_PATH.length-1;i++){
      const a=TD_PATH[i],b=TD_PATH[i+1];
      const dx=b.x-a.x,dy=b.y-a.y;const len=Math.hypot(dx,dy);
      if(len===0)continue;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(len*len)));
      const px=a.x+dx*t,py=a.y+dy*t;const d=Math.hypot(x-px,y-py);
      if(d<minD)minD=d;
    }
    return minD;
  };

  // ==== MULTI BROADCAST ====
  useEffect(()=>{
    if(mode!=="coop"||!session||session.solo)return;
    if(!window.supabase)return;
    const chan=window.supabase.channel(`td:${session.id}`,{config:{broadcast:{self:false}}});
    chan.on("broadcast",{event:"build"},({payload})=>{
      if(payload.player===auth.code)return;
      stateRef.current.towers.push({id:payload.towerId,type:payload.type,x:payload.x,y:payload.y,level:0,branch:null,lastShot:0,goldAt:Date.now(),healAt:Date.now(),kills:0,ownerCode:payload.player});
    });
    chan.on("broadcast",{event:"upgrade"},({payload})=>{
      if(payload.player===auth.code)return;
      const t=stateRef.current.towers.find(x=>x.id===payload.towerId);
      if(t){t.level=payload.level;if(payload.branch)t.branch=payload.branch;}
    });
    chan.on("broadcast",{event:"sell"},({payload})=>{
      if(payload.player===auth.code)return;
      const idx=stateRef.current.towers.findIndex(x=>x.id===payload.towerId);
      if(idx>=0)stateRef.current.towers.splice(idx,1);
    });
    chan.on("broadcast",{event:"gold"},({payload})=>{stateRef.current.gold=payload.gold;setGold(payload.gold);});
    chan.on("broadcast",{event:"startwave"},()=>{startWave();});
    chan.subscribe();
    channelRef.current=chan;
    return()=>{try{chan.unsubscribe();}catch(e){}channelRef.current=null;};
  // eslint-disable-next-line
  },[mode,session?.id,auth.code]);

  const broadcast=(event,payload)=>{
    if(channelRef.current)try{channelRef.current.send({type:"broadcast",event,payload});}catch(e){}
  };

  // Stats calculator
  const computeStats=(t)=>{
    const tw=TD_TOWERS.find(x=>x.id===t.type);
    let s={dmg:tw.dmg,range:tw.range,cd:tw.cd,aoe:tw.aoe||0,dot:tw.dot||0,chain:tw.chain||0,proj:tw.proj||1,slow:tw.slow||0,slowDur:tw.slowDur||0,goldGen:tw.goldGen||0,boost:tw.boost||1,heal:tw.heal||0,pierceArmor:tw.pierceArmor||0};
    for(let i=0;i<t.level;i++)Object.assign(s,tw.upg[i]);
    if(t.branch){
      const b=tw.branches[t.branch==="A"?0:1];
      for(const k in b.mod){
        if(["dmg","range","cd","goldGen","heal"].includes(k))s[k]=s[k]*b.mod[k];
        else if(k==="chain")s.chain+=b.mod[k];
        else if(k==="aoe")s.aoe=s.aoe?s.aoe*b.mod[k]:b.mod[k];
        else if(k==="proj")s.proj=b.mod[k];
        else if(k==="pierce")s.pierce=true;
        else if(k==="slow")s.slow=b.mod[k];
        else if(k==="through")s.through=b.mod[k];
        else if(k==="bossDmg")s.bossDmg=b.mod[k];
        else if(k==="stun")s.stun=b.mod[k];
        else if(k==="reverse")s.reverse=b.mod[k];
      }
    }
    return s;
  };

  const showToast=(msg)=>{setToastMsg(msg);setTimeout(()=>setToastMsg(null),1800);};

  // ==== Event handlers ====
  const screenToWorld=(clientX,clientY)=>{
    const svg=svgRef.current;if(!svg)return null;
    const r=svg.getBoundingClientRect();
    const vb=svg.viewBox.baseVal;
    const scale=Math.min(r.width/vb.width,r.height/vb.height);
    const offX=(r.width-vb.width*scale)/2,offY=(r.height-vb.height*scale)/2;
    const wx=(clientX-r.left-offX)/scale,wy=(clientY-r.top-offY)/scale;
    return{x:wx,y:wy};
  };

  const handleDragStart=(type,e)=>{
    e.preventDefault();
    const tw=TD_TOWERS.find(x=>x.id===type);
    if(stateRef.current.gold<tw.cost){showToast("Pas assez d'or");return;}
    stateRef.current.dragType=type;setDragging(type);
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    stateRef.current.dragPos={screenX:cx,screenY:cy};
    setDragPos({screenX:cx,screenY:cy});
  };

  useEffect(()=>{
    if(!dragging)return;
    const onMove=(e)=>{
      const cx=e.touches?e.touches[0].clientX:e.clientX;
      const cy=e.touches?e.touches[0].clientY:e.clientY;
      stateRef.current.dragPos={screenX:cx,screenY:cy};
      setDragPos({screenX:cx,screenY:cy});
    };
    const onEnd=(e)=>{
      const cx=e.changedTouches?e.changedTouches[0].clientX:e.clientX;
      const cy=e.changedTouches?e.changedTouches[0].clientY:e.clientY;
      const w=screenToWorld(cx,cy);
      if(w&&w.x>=0&&w.x<=WORLD&&w.y>=0&&w.y<=WORLD)placeTower(dragging,w.x,w.y);
      stateRef.current.dragType=null;stateRef.current.dragPos=null;
      setDragging(null);setDragPos(null);
    };
    window.addEventListener("mousemove",onMove);
    window.addEventListener("touchmove",onMove,{passive:false});
    window.addEventListener("mouseup",onEnd);
    window.addEventListener("touchend",onEnd);
    return()=>{
      window.removeEventListener("mousemove",onMove);
      window.removeEventListener("touchmove",onMove);
      window.removeEventListener("mouseup",onEnd);
      window.removeEventListener("touchend",onEnd);
    };
  // eslint-disable-next-line
  },[dragging]);

  const placeTower=(type,x,y)=>{
    const st=stateRef.current;
    const tw=TD_TOWERS.find(t=>t.id===type);
    if(!tw)return;
    if(st.gold<tw.cost){showToast("Pas assez d'or");return;}
    if(distToPath(x,y)<50){showToast("Trop près du chemin");return;}
    for(const t of st.towers){if(Math.hypot(t.x-x,t.y-y)<60){showToast("Trop près d'une tour");return;}}
    st.gold-=tw.cost;setGold(st.gold);
    const tid=`${auth.code}_${towerIdRef.current++}`;
    st.towers.push({id:tid,type,x,y,level:0,branch:null,lastShot:0,goldAt:Date.now(),healAt:Date.now(),kills:0,ownerCode:auth.code});
    broadcast("build",{player:auth.code,towerId:tid,type,x,y});
    broadcast("gold",{gold:st.gold});
  };

  const handleWorldTap=(e)=>{
    const cx=e.clientX;const cy=e.clientY;
    const w=screenToWorld(cx,cy);if(!w)return;
    const st=stateRef.current;
    if(st.targetingSpell==="meteor"){castMeteor(w.x,w.y);st.targetingSpell=null;setTargetingSpell(null);return;}
    for(const t of st.towers){
      if(Math.hypot(t.x-w.x,t.y-w.y)<35){st.selectedTower=t;setSelected(t);return;}
    }
    st.selectedTower=null;setSelected(null);
  };

  const upgradeTower=()=>{
    const t=stateRef.current.selectedTower;if(!t)return;
    const tw=TD_TOWERS.find(x=>x.id===t.type);
    if(t.level>=tw.upg.length){showToast("Choisis une voie");return;}
    const cost=tw.upg[t.level].cost;
    if(stateRef.current.gold<cost){showToast("Pas assez d'or");return;}
    stateRef.current.gold-=cost;setGold(stateRef.current.gold);
    t.level++;setSelected({...t});
    broadcast("upgrade",{player:auth.code,towerId:t.id,level:t.level});
    broadcast("gold",{gold:stateRef.current.gold});
  };

  const pickBranch=(b)=>{
    const t=stateRef.current.selectedTower;if(!t)return;
    t.branch=b;setSelected({...t});
    broadcast("upgrade",{player:auth.code,towerId:t.id,level:t.level,branch:b});
  };

  const sellTower=()=>{
    const t=stateRef.current.selectedTower;if(!t)return;
    const tw=TD_TOWERS.find(x=>x.id===t.type);
    let total=tw.cost;for(let i=0;i<t.level;i++)total+=tw.upg[i].cost;
    stateRef.current.gold+=Math.floor(total*0.5);setGold(stateRef.current.gold);
    const idx=stateRef.current.towers.indexOf(t);
    if(idx>=0)stateRef.current.towers.splice(idx,1);
    stateRef.current.selectedTower=null;setSelected(null);
    broadcast("sell",{player:auth.code,towerId:t.id});
    broadcast("gold",{gold:stateRef.current.gold});
  };

  // ==== Spells ====
  const castSpell=(id)=>{
    const sp=stateRef.current.spells[id];if(!sp.ready)return;
    if(id==="meteor"){stateRef.current.targetingSpell="meteor";setTargetingSpell("meteor");showToast("Tape pour lancer le météore");return;}
    if(id==="gold"){stateRef.current.gold+=250;setGold(stateRef.current.gold);showToast("+250 💰 Ordonnance royale");sp.ready=false;sp.at=Date.now();broadcast("gold",{gold:stateRef.current.gold});}
    if(id==="time"){stateRef.current.timeFreezeUntil=Date.now()+4000;showToast("⏸ Le temps se fige...");sp.ready=false;sp.at=Date.now();}
  };
  const castMeteor=(x,y)=>{
    const sp=stateRef.current.spells.meteor;sp.ready=false;sp.at=Date.now();
    stateRef.current.fx.push({type:"meteor",x,y,ttl:.6,start:Date.now()});
    for(const e of stateRef.current.enemies){
      const d=Math.hypot(e.x-x,e.y-y);
      if(d<=180){const dmg=80*(1-d/220);e.hp-=dmg;}
    }
    showToast("🔥 Météore !");
  };

  const startWave=()=>{
    const st=stateRef.current;
    if(st.waveState!=="idle")return;
    if(st.wave>=TD_WAVES.length){onVictory();return;}
    const comp=TD_WAVES[st.wave];st.wave++;setWave(st.wave);
    st.waveState="spawning";setWaveState("spawning");st.waveStartTime=Date.now();
    st.spawnQueue=[];let t=0;
    for(const g of comp){for(let i=0;i<g.n;i++){st.spawnQueue.push({t:g.t,at:t});t+=g.d;}}
    for(const tw of st.towers){
      if(tw.branch==="A"&&tw.type==="banquier")st.gold+=50;
      if(tw.branch==="A"&&tw.type==="autel"){st.lives=Math.min(100,st.lives+5);setLives(st.lives);}
    }
    setGold(st.gold);
    broadcast("startwave",{wave:st.wave});
  };

  // ==== Game loop ====
  useEffect(()=>{
    let last=0,raf;
    const loop=(ts)=>{
      if(!stateRef.current.running)return;
      if(!last)last=ts;
      const dt=Math.min(.1,(ts-last)/1000)*stateRef.current.speed;
      last=ts;
      update(dt);
      setRenderTick(t=>t+1);
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
    return()=>{stateRef.current.running=false;if(raf)cancelAnimationFrame(raf);};
  // eslint-disable-next-line
  },[]);

  const update=(dt)=>{
    const st=stateRef.current;
    const now=Date.now();
    const frozen=now<st.timeFreezeUntil;

    // Spawn
    if(st.waveState==="spawning"){
      const el=now-st.waveStartTime;
      while(st.spawnQueue.length&&st.spawnQueue[0].at<=el){
        const s=st.spawnQueue.shift();
        const cfg=TD_ENEMIES[s.t];
        const p=pathAt(0);
        st.enemies.push({id:enemyIdRef.current++,type:s.t,hp:cfg.hp,maxHp:cfg.hp,progress:0,x:p.x,y:p.y,slowUntil:0,slowMul:1,stunUntil:0});
      }
      if(st.spawnQueue.length===0){st.waveState="combat";setWaveState("combat");}
    }

    // Move
    if(!frozen){
      for(let i=st.enemies.length-1;i>=0;i--){
        const e=st.enemies[i];const cfg=TD_ENEMIES[e.type];
        if(now<e.stunUntil)continue;
        const slow=now<e.slowUntil?e.slowMul:1;
        e.progress+=(cfg.speed*slow*dt)/pathLen;
        const p=pathAt(e.progress);e.x=p.x;e.y=p.y;
        if(e.progress>=1){
          st.lives-=cfg.boss?10:1;setLives(st.lives);
          st.enemies.splice(i,1);
          if(st.lives<=0){st.running=false;setTimeout(onGameOver,300);return;}
        }
      }
      // Sorcier heals
      for(const e of st.enemies){
        const cfg=TD_ENEMIES[e.type];
        if(cfg.heal){
          for(const t of st.enemies){
            if(t===e||t.hp>=TD_ENEMIES[t.type].maxHp)continue;
            if(Math.hypot(t.x-e.x,t.y-e.y)<cfg.healRange)t.hp=Math.min(TD_ENEMIES[t.type].maxHp,t.hp+cfg.heal*dt*10);
          }
        }
      }
    }

    // Tower shoot
    for(const t of st.towers){
      const tw=TD_TOWERS.find(x=>x.id===t.type);
      const stats=computeStats(t);
      if(tw.goldGen&&now-t.goldAt>=stats.cd){t.goldAt=now;st.gold+=Math.floor(stats.goldGen);setGold(st.gold);broadcast("gold",{gold:st.gold});}
      if(tw.heal&&now-t.healAt>=stats.cd){t.healAt=now;st.lives=Math.min(100,st.lives+Math.floor(stats.heal));setLives(st.lives);showToast(`+${Math.floor(stats.heal)} vie`);}
      if(tw.boost)continue;
      if(stats.dmg===0&&!stats.slow)continue;
      if(now-t.lastShot<stats.cd)continue;
      let boostMul=1;
      for(const o of st.towers){
        if(o===t)continue;
        const otw=TD_TOWERS.find(x=>x.id===o.type);
        if(otw.boost){const os=computeStats(o);if(Math.hypot(o.x-t.x,o.y-t.y)<=os.range)boostMul=Math.max(boostMul,os.boost);}
      }
      let target=null,best=-1;
      for(const e of st.enemies){
        if(e.hp<=0)continue;
        const d=Math.hypot(e.x-t.x,e.y-t.y);
        if(d<=stats.range*boostMul&&e.progress>best){best=e.progress;target=e;}
      }
      if(!target)continue;
      t.lastShot=now;
      const ang=Math.atan2(target.y-t.y,target.x-t.x);
      const speed=700;
      for(let k=0;k<stats.proj;k++){
        let a=ang;if(stats.proj>1)a+=((k/(stats.proj-1))-.5)*.4;
        st.projectiles.push({
          x:t.x,y:t.y-20,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
          target,damage:stats.dmg*boostMul,aoe:stats.aoe,slow:stats.slow,slowDur:stats.slowDur,
          stun:stats.stun,chain:stats.chain,chained:new Set(),
          through:stats.through,hit:0,color:tw.color,pierce:stats.pierce,pierceArmor:stats.pierceArmor,
          bossDmg:stats.bossDmg,reverse:stats.reverse,ttl:2,
        });
      }
    }

    // Projectiles
    for(let i=st.projectiles.length-1;i>=0;i--){
      const pr=st.projectiles[i];
      pr.x+=pr.vx*dt;pr.y+=pr.vy*dt;pr.ttl-=dt;
      if(pr.ttl<=0){st.projectiles.splice(i,1);continue;}
      let hit=false;
      for(const e of st.enemies){
        if(e.hp<=0)continue;
        if(pr.chained&&pr.chained.has(e.id))continue;
        const cfg=TD_ENEMIES[e.type];
        const dh=Math.hypot(e.x-pr.x,e.y-pr.y);
        if(dh<cfg.size+3){
          applyHit(pr,e);hit=true;
          if(pr.through&&pr.hit<pr.through){pr.hit++;pr.chained.add(e.id);hit=false;continue;}
          break;
        }
      }
      if(hit)st.projectiles.splice(i,1);
    }

    // Kill enemies, gold
    for(let i=st.enemies.length-1;i>=0;i--){
      const e=st.enemies[i];
      if(e.hp<=0){
        const cfg=TD_ENEMIES[e.type];
        st.gold+=cfg.gold;setGold(st.gold);
        st.fx.push({type:"coin",x:e.x,y:e.y,ttl:.5,start:now,amount:cfg.gold});
        st.enemies.splice(i,1);
      }
    }

    // Wave end
    if(st.waveState==="combat"&&st.enemies.length===0){
      st.waveState="idle";setWaveState("idle");
      st.gold+=30+st.wave*8;setGold(st.gold);
      if(st.wave>=TD_WAVES.length)setTimeout(onVictory,100);
    }

    // FX cleanup
    for(let i=st.fx.length-1;i>=0;i--){st.fx[i].ttl-=dt;if(st.fx[i].ttl<=0)st.fx.splice(i,1);}

    // Spell cooldowns
    const cds={};
    for(const id of["meteor","gold","time"]){
      const sp=st.spells[id];
      if(!sp.ready&&now-sp.at>=sp.cd)sp.ready=true;
      cds[id]=sp.ready?1:Math.min(1,(now-sp.at)/sp.cd);
    }
    setSpellCds(cds);
  };

  const applyHit=(pr,e)=>{
    const st=stateRef.current;
    const cfg=TD_ENEMIES[e.type];
    let dmg=pr.damage;
    if(pr.bossDmg&&cfg.boss)dmg*=pr.bossDmg;
    let armor=cfg.armor;
    if(pr.pierce)armor=0;
    else if(pr.pierceArmor)armor=Math.max(0,armor-pr.pierceArmor);
    dmg*=(1-armor);
    if(pr.aoe){
      for(const e2 of st.enemies){
        if(e2.hp<=0)continue;
        const d2=Math.hypot(e2.x-pr.x,e2.y-pr.y);
        if(d2<=pr.aoe){
          const falloff=1-(d2/pr.aoe)*.4;
          const cfg2=TD_ENEMIES[e2.type];
          let d=dmg*falloff*(1-(pr.pierce?0:cfg2.armor));
          e2.hp-=d;
        }
      }
      st.fx.push({type:"explosion",x:pr.x,y:pr.y,r:pr.aoe,ttl:.4,start:Date.now(),color:pr.color});
    }else{
      e.hp-=dmg;
    }
    if(pr.slow){e.slowUntil=Date.now()+pr.slowDur*1000;e.slowMul=1-pr.slow;}
    if(pr.stun)e.stunUntil=Date.now()+pr.stun*1000;
    if(pr.reverse&&Math.random()<pr.reverse)e.progress=Math.max(0,e.progress-.05);
    if(pr.chain&&pr.chain>0){
      let lastE=e;const chained=new Set([e.id]);
      for(let c=0;c<pr.chain;c++){
        let next=null,bd=120;
        for(const t of st.enemies){if(chained.has(t.id)||t.hp<=0)continue;const d=Math.hypot(t.x-lastE.x,t.y-lastE.y);if(d<bd){bd=d;next=t;}}
        if(!next)break;
        chained.add(next.id);
        const cfg2=TD_ENEMIES[next.type];
        next.hp-=dmg*(1-cfg2.armor*.5);
        st.fx.push({type:"lightning",x1:lastE.x,y1:lastE.y,x2:next.x,y2:next.y,ttl:.2,start:Date.now()});
        lastE=next;
      }
    }
  };

  // ==== RENDER ====
  const st=stateRef.current;
  const draggingTower=dragging?TD_TOWERS.find(t=>t.id===dragging):null;
  const dragWorld=(()=>{
    if(!dragging||!dragPos)return null;
    return screenToWorld(dragPos.screenX,dragPos.screenY);
  })();
  const selStats=selected?computeStats(selected):null;

  // Static decorations (deterministic)
  const trees=useMemo(()=>{
    let seed=42;const rng=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
    const arr=[];
    for(let i=0;i<55;i++){
      const x=rng()*WORLD,y=rng()*WORLD,sz=10+rng()*7;
      if(distToPath(x,y)<55)continue;
      arr.push({x,y,sz});
    }
    return arr;
  // eslint-disable-next-line
  },[]);
  const rocks=useMemo(()=>{
    let seed=777;const rng=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
    const arr=[];
    for(let i=0;i<14;i++){
      const x=rng()*WORLD,y=rng()*WORLD,sz=5+rng()*4;
      if(distToPath(x,y)<55)continue;
      arr.push({x,y,sz});
    }
    return arr;
  // eslint-disable-next-line
  },[]);
  const flowers=useMemo(()=>{
    let seed=2024;const rng=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
    const arr=[];const cols=["#FF6B9D","#F4D03F","#E74C3C","#FFFFFF","#9B59B6","#64B5F6"];
    for(let i=0;i<40;i++){
      const x=rng()*WORLD,y=rng()*WORLD;
      if(distToPath(x,y)<50)continue;
      arr.push({x,y,c:cols[Math.floor(rng()*cols.length)]});
    }
    return arr;
  // eslint-disable-next-line
  },[]);
  const sheep=useMemo(()=>{
    let seed=333;const rng=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
    const arr=[];
    for(let i=0;i<6;i++){
      const x=rng()*WORLD,y=rng()*WORLD;
      if(distToPath(x,y)<70)continue;
      arr.push({x,y});
    }
    return arr;
  // eslint-disable-next-line
  },[]);

  const pathD=useMemo(()=>{let d=`M ${TD_PATH[0].x} ${TD_PATH[0].y}`;for(let i=1;i<TD_PATH.length;i++)d+=` L ${TD_PATH[i].x} ${TD_PATH[i].y}`;return d;},[]);

  return<div style={{position:"fixed",inset:0,background:"#0a1a0a",zIndex:999,display:"flex",flexDirection:"column",overflow:"hidden",userSelect:"none",WebkitUserSelect:"none",touchAction:"none"}}>
    {/* Top HUD */}
    <div style={{flexShrink:0,padding:"8px 8px",display:"flex",alignItems:"center",gap:5,background:"linear-gradient(180deg,rgba(0,0,0,.7),rgba(0,0,0,.5))",borderBottom:"2px solid #D4A017",backdropFilter:"blur(10px)",zIndex:20}}>
      <button onClick={onQuit} style={{width:28,height:28,borderRadius:7,background:"rgba(239,83,80,.2)",border:"1px solid rgba(239,83,80,.4)",color:"#FF6B6B",fontSize:14,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>✕</button>
      <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(239,83,80,.2)",padding:"4px 8px",borderRadius:7,border:"1px solid rgba(239,83,80,.4)",flexShrink:0}}><span style={{fontSize:12}}>❤️</span><span style={{color:"#fff",fontSize:12,fontWeight:900}}>{lives}</span></div>
      <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,213,79,.2)",padding:"4px 8px",borderRadius:7,border:"1px solid rgba(255,213,79,.4)",flexShrink:0}}><span style={{fontSize:12}}>💰</span><span style={{color:"#fff",fontSize:12,fontWeight:900}}>{gold}</span></div>
      <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(76,205,196,.15)",padding:"4px 8px",borderRadius:7,border:"1px solid rgba(76,205,196,.3)",flexShrink:0}}><span style={{color:"#fff",fontSize:12,fontWeight:900}}>{wave}/{TD_WAVES.length}</span></div>
      <span style={{flex:1,minWidth:0}}/>
      {waveState==="idle"&&wave<TD_WAVES.length&&<button onClick={startWave} style={{background:"linear-gradient(135deg,#66BB6A,#43A047)",border:"none",color:"#fff",padding:"5px 10px",borderRadius:7,fontSize:11,fontWeight:900,cursor:"pointer",boxShadow:"0 2px 8px rgba(76,175,80,.5)",textTransform:"uppercase",flexShrink:0,letterSpacing:.5}}>▶ V{wave+1}</button>}
      <button onClick={()=>{stateRef.current.speed=stateRef.current.speed===1?2:1;setSpeed(stateRef.current.speed);}} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#fff",width:32,height:28,borderRadius:7,fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0,padding:0}}>×{speed}</button>
    </div>

    {/* Stage */}
    <div style={{flex:1,position:"relative",overflow:"hidden",background:"#6B9A5C"}} onClick={handleWorldTap}>
      <svg ref={svgRef} viewBox={`0 0 ${WORLD} ${WORLD}`} preserveAspectRatio="xMidYMid meet" style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}>
        <defs>
          <pattern id="grass" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="#7FA86C"/>
            <circle cx="10" cy="15" r="1.5" fill="#5C8542"/>
            <circle cx="25" cy="8" r="1.2" fill="#8FB87C"/>
            <circle cx="30" cy="30" r="1.3" fill="#6B9A5C"/>
            <circle cx="5" cy="32" r="1" fill="#9CC884"/>
          </pattern>
          <linearGradient id="t-stone" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#B5B5B5"/><stop offset="1" stopColor="#6B6B6B"/></linearGradient>
          <linearGradient id="t-wood" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#A0825A"/><stop offset="1" stopColor="#5C3317"/></linearGradient>
          <linearGradient id="t-roof" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#D4533A"/><stop offset="1" stopColor="#8B2828"/></linearGradient>
          <linearGradient id="t-ice" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#B3E5FC"/><stop offset="1" stopColor="#29B6F6"/></linearGradient>
          <linearGradient id="t-fire" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFD54F"/><stop offset=".5" stopColor="#FF6F00"/><stop offset="1" stopColor="#B71C1C"/></linearGradient>
          <linearGradient id="t-light" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFF59D"/><stop offset="1" stopColor="#F57F17"/></linearGradient>
          <linearGradient id="t-mist" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#E1BEE7"/><stop offset="1" stopColor="#8E24AA"/></linearGradient>
          <linearGradient id="t-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFE082"/><stop offset="1" stopColor="#D4A017"/></linearGradient>
          <linearGradient id="t-holy" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFFFFF"/><stop offset="1" stopColor="#FFD54F"/></linearGradient>
        </defs>
        <rect width={WORLD} height={WORLD} fill="url(#grass)"/>
        {/* Forest patches */}
        {[{x:80,y:100,rx:75,ry:60},{x:820,y:120,rx:80,ry:65},{x:60,y:700,rx:90,ry:55},{x:820,y:700,rx:85,ry:60},{x:450,y:450,rx:45,ry:30}].map((f,i)=><ellipse key={i} cx={f.x} cy={f.y} rx={f.rx} ry={f.ry} fill="#3F7A3A" opacity=".5"/>)}
        {/* Trees */}
        {trees.map((tr,i)=><g key={i} transform={`translate(${tr.x},${tr.y})`}>
          <ellipse cx={tr.sz*.3} cy={tr.sz*.3} rx={tr.sz*.8} ry={tr.sz*.25} fill="#000" opacity=".25"/>
          <rect x={-tr.sz*.15} y={-tr.sz*.1} width={tr.sz*.3} height={tr.sz*.55} fill="#5C3317"/>
          <polygon points={`${-tr.sz*.9},${-tr.sz*.1} 0,${-tr.sz*1.7} ${tr.sz*.9},${-tr.sz*.1}`} fill="#3F7A3A"/>
          <polygon points={`${-tr.sz*.65},${-tr.sz*.4} 0,${-tr.sz*1.7} ${tr.sz*.65},${-tr.sz*.4}`} fill="#5C9C4A"/>
          <polygon points={`${-tr.sz*.35},${-tr.sz*.9} 0,${-tr.sz*1.7} ${tr.sz*.1},${-tr.sz*.9}`} fill="#7BBF6A" opacity=".7"/>
        </g>)}
        {/* Rocks */}
        {rocks.map((rk,i)=><g key={i} transform={`translate(${rk.x},${rk.y})`}>
          <ellipse cx={rk.sz*.3} cy={rk.sz*.3} rx={rk.sz} ry={rk.sz*.4} fill="#000" opacity=".25"/>
          <ellipse cx="0" cy="0" rx={rk.sz} ry={rk.sz*.7} fill="#8E8E8E"/>
          <polygon points={`${-rk.sz*.6},0 0,${-rk.sz*.7} ${rk.sz*.6},0`} fill="#A5A5A5"/>
        </g>)}
        {/* Flowers */}
        {flowers.map((fl,i)=><g key={i} transform={`translate(${fl.x},${fl.y})`}><circle r="3" fill={fl.c}/><circle r="1" fill="#F4D03F"/></g>)}
        {/* Sheep */}
        {sheep.map((sh,i)=><g key={i} transform={`translate(${sh.x},${sh.y})`}>
          <ellipse cx="2" cy="3" rx="8" ry="2.5" fill="#000" opacity=".25"/>
          <ellipse cx="0" cy="0" rx="8" ry="6" fill="#F4F4F4"/>
          <ellipse cx="0" cy="-2" rx="6" ry="5" fill="#FFFFFF"/>
          <circle cx="-8" cy="-1" r="3" fill="#3a3a3a"/>
          <circle cx="-9" cy="-2" r=".6" fill="#fff"/>
          <rect x="-4" y="4" width="1.5" height="4" fill="#3a3a3a"/>
          <rect x="3" y="4" width="1.5" height="4" fill="#3a3a3a"/>
        </g>)}
        {/* Path */}
        <path d={pathD} stroke="rgba(0,0,0,.3)" strokeWidth="44" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(3,4)"/>
        <path d={pathD} stroke="#7A5836" strokeWidth="40" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={pathD} stroke="#9B7550" strokeWidth="34" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={pathD} stroke="#B89568" strokeWidth="26" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={pathD} stroke="#6B4A2F" strokeWidth="1.5" fill="none" strokeDasharray="8 10" strokeLinecap="round"/>
        {/* Castle */}
        {(()=>{const cp=TD_PATH[TD_PATH.length-1];const cx=cp.x-30,cy=cp.y-50;
          return<g transform={`translate(${cx},${cy})`}>
            <ellipse cx="10" cy="55" rx="65" ry="10" fill="#000" opacity=".3"/>
            <rect x="-50" y="-25" width="20" height="70" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="-50" y="-30" width="5" height="6" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="-43" y="-30" width="5" height="6" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="-36" y="-30" width="5" height="6" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <polygon points="-52,-30 -40,-48 -28,-30" fill="url(#t-roof)" stroke="#4A1A10" strokeWidth="1"/>
            <rect x="-28" y="-10" width="42" height="55" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="-28" y="-15" width="6" height="5" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="-19" y="-15" width="6" height="5" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="-10" y="-15" width="6" height="5" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="-1" y="-15" width="6" height="5" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="8" y="-15" width="6" height="5" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <polygon points="-30,-15 -7,-42 16,-15" fill="url(#t-roof)" stroke="#4A1A10" strokeWidth="1"/>
            <rect x="16" y="-35" width="18" height="80" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="16" y="-40" width="5" height="6" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="23" y="-40" width="5" height="6" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <rect x="30" y="-40" width="5" height="6" fill="url(#t-stone)" stroke="#3a3a3a" strokeWidth="1"/>
            <polygon points="14,-40 25,-58 36,-40" fill="url(#t-roof)" stroke="#4A1A10" strokeWidth="1"/>
            <line x1="25" y1="-58" x2="25" y2="-72" stroke="#5C3317" strokeWidth="1.5"/>
            <path d="M25 -72 Q 38 -70 38 -65 Q 30 -66 25 -64 Z" fill="url(#t-gold)" stroke="#8B6F47" strokeWidth=".5"/>
            <path d="M22 -15 Q 22 -25 25 -25 Q 28 -25 28 -15 L 28 -5 L 22 -5 Z" fill="#FFE082"/>
            <path d="M-6 45 Q -6 25 -1 25 Q 4 25 4 45" fill="#3E2723" stroke="#1A0A05" strokeWidth="1"/>
            <g transform="translate(-7,20)">
              <circle r="8" fill="url(#t-gold)" stroke="#8B6F47" strokeWidth=".8"/>
              <text y="3" textAnchor="middle" fontSize="10" fontFamily="Cinzel" fontWeight="900" fill="#3E2723">C</text>
            </g>
          </g>;
        })()}
        {/* Ordonnance parchment */}
        <g transform="translate(40,860) rotate(-3)">
          <rect width="140" height="30" fill="#F4E8C1" stroke="#8B6F47" strokeWidth="1"/>
          <rect x="3" y="3" width="134" height="24" fill="none" stroke="#C9B27A" strokeWidth=".5"/>
          <text x="70" y="12" textAnchor="middle" fontFamily="Cinzel" fontSize="8" fontWeight="900" fill="#5C3317">⚜ Dame Christel ⚜</text>
          <text x="70" y="20" textAnchor="middle" fontFamily="Cinzel" fontSize="6" fill="#7A5836">Châtelaine d'Oranje · 1247</text>
        </g>
        {/* Range of selected tower */}
        {selected&&selStats&&<circle cx={selected.x} cy={selected.y} r={selStats.range} fill="rgba(76,205,196,.13)" stroke="rgba(76,205,196,.6)" strokeWidth="2" strokeDasharray="6 4"/>}
        {/* Drag preview */}
        {dragging&&dragWorld&&dragWorld.x>=0&&dragWorld.x<=WORLD&&dragWorld.y>=0&&dragWorld.y<=WORLD&&(()=>{
          const dp=distToPath(dragWorld.x,dragWorld.y);
          let tooClose=false;for(const t of st.towers){if(Math.hypot(t.x-dragWorld.x,t.y-dragWorld.y)<60){tooClose=true;break;}}
          const valid=dp>=50&&!tooClose&&st.gold>=draggingTower.cost;
          const rc=valid?"rgba(76,205,196,.25)":"rgba(239,83,80,.3)";
          const sc=valid?"rgba(76,205,196,.8)":"rgba(239,83,80,.9)";
          return<g>
            <circle cx={dragWorld.x} cy={dragWorld.y} r={draggingTower.range} fill={rc} stroke={sc} strokeWidth="2" strokeDasharray="5 3"/>
            <g transform={`translate(${dragWorld.x},${dragWorld.y})`} opacity=".7" dangerouslySetInnerHTML={{__html:TDTowerSVG[dragging]}}/>
          </g>;
        })()}
        {/* Towers */}
        {st.towers.map(t=>{
          const wobble=Math.sin((Date.now()/400)+t.x)*.5;
          return<g key={t.id} transform={`translate(${t.x},${t.y+wobble})`} style={{cursor:"pointer"}}>
            <g dangerouslySetInnerHTML={{__html:TDTowerSVG[t.type]}}/>
            {t.level>0&&<g transform="translate(18,-25)">{Array.from({length:t.level+(t.branch?1:0)}).map((_,i)=><text key={i} x={i*8} y="0" fontSize="11" fill="#FFD54F" stroke="#3E2723" strokeWidth=".7">★</text>)}</g>}
          </g>;
        })}
        {/* Enemies */}
        {st.enemies.map(e=>{
          const cfg=TD_ENEMIES[e.type];
          const walkY=Math.sin((Date.now()/150)+e.progress*20)*1.5;
          const hpp=e.hp/e.maxHp;
          const barCol=hpp>.5?"#66BB6A":(hpp>.25?"#FFA726":"#EF5350");
          const sw=cfg.size*2.2;
          return<g key={e.id} transform={`translate(${e.x},${e.y+walkY})`}>
            <g dangerouslySetInnerHTML={{__html:TDEnemySVG[e.type]}}/>
            {hpp<1&&<g><rect x={-sw/2} y={-cfg.size-10} width={sw} height="3.5" fill="rgba(0,0,0,.7)"/><rect x={-sw/2} y={-cfg.size-10} width={sw*hpp} height="3.5" fill={barCol}/></g>}
            {Date.now()<e.slowUntil&&<circle cx="0" cy="-2" r={cfg.size+3} fill="none" stroke="#4FC3F7" strokeWidth="1.5" opacity=".7"/>}
            {Date.now()<e.stunUntil&&<text x="0" y={-cfg.size-14} textAnchor="middle" fontSize="12">⭐</text>}
          </g>;
        })}
        {/* Projectiles */}
        {st.projectiles.map((pr,i)=><g key={i}>
          <circle cx={pr.x} cy={pr.y} r={pr.aoe?8:5} fill={pr.color} stroke="#fff" strokeWidth="1"/>
          <circle cx={pr.x} cy={pr.y} r={pr.aoe?4:2.5} fill="#FFE082"/>
        </g>)}
        {/* Effects */}
        {st.fx.map((fx,i)=>{
          const el=(Date.now()-fx.start)/1000;
          if(fx.type==="explosion"){const prog=el/.4;const r=fx.r*(.3+.7*prog);
            return<g key={i}><circle cx={fx.x} cy={fx.y} r={r} fill={fx.color} opacity={(1-prog)*.7}/><circle cx={fx.x} cy={fx.y} r={r} fill="none" stroke="#FFE082" strokeWidth="3" opacity={1-prog}/></g>;}
          if(fx.type==="coin"){const prog=el/.5;
            return<text key={i} x={fx.x} y={fx.y-prog*30} fill="#FFD54F" fontSize="16" fontWeight="900" stroke="#3E2723" strokeWidth=".7" opacity={1-prog} textAnchor="middle">+{fx.amount}💰</text>;}
          if(fx.type==="meteor"){const prog=el/.6;const r=180*prog;
            return<g key={i}><circle cx={fx.x} cy={fx.y} r={r} fill="#FF6F00" opacity={(1-prog)*.6}/><circle cx={fx.x} cy={fx.y} r={r} fill="none" stroke="#FFD54F" strokeWidth="4" opacity={1-prog}/></g>;}
          if(fx.type==="lightning"){const prog=el/.2;
            return<line key={i} x1={fx.x1} y1={fx.y1} x2={fx.x2} y2={fx.y2} stroke="#FFF59D" strokeWidth={3*(1-prog)} opacity={1-prog}/>;}
          return null;
        })}
      </svg>

      {/* Spells right side */}
      <div style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",display:"flex",flexDirection:"column",gap:6,zIndex:15}}>
        {[{id:"meteor",icon:"🔥",color:"#FF6F00"},{id:"gold",icon:"💰",color:"#FFD54F"},{id:"time",icon:"⏸",color:"#9C27B0"}].map(sp=>{
          const ready=spellCds[sp.id]>=1;
          const active=targetingSpell===sp.id;
          return<button key={sp.id} onClick={(e)=>{e.stopPropagation();castSpell(sp.id);}} style={{width:50,height:50,borderRadius:12,border:`2px solid ${sp.color}`,background:"rgba(0,0,0,.6)",backdropFilter:"blur(10px)",cursor:ready?"pointer":"not-allowed",position:"relative",overflow:"hidden",padding:0,boxShadow:ready?`0 0 12px ${sp.color}`:"none",outline:active?`2px solid #fff`:"none",outlineOffset:2}}>
            <span style={{fontSize:22,filter:"drop-shadow(0 1px 2px rgba(0,0,0,.8))",opacity:ready?1:.6}}>{sp.icon}</span>
            {spellCds[sp.id]<1&&<div style={{position:"absolute",inset:0,background:`conic-gradient(rgba(0,0,0,.75) ${(1-spellCds[sp.id])*360}deg,transparent 0deg)`,pointerEvents:"none"}}/>}
          </button>;
        })}
      </div>

      {/* Tower panel */}
      {selected&&(()=>{
        const tw=TD_TOWERS.find(x=>x.id===selected.type);
        const stats=selStats;
        const atBranch=selected.level>=2&&!selected.branch;
        const maxed=selected.branch||selected.level>=tw.upg.length&&!selected.branch===false;
        const canUp=selected.level<tw.upg.length;
        return<div style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(180deg,rgba(26,15,8,.97),rgba(15,8,4,.97))",backdropFilter:"blur(14px)",borderRadius:14,border:"2px solid #D4A017",padding:"10px 12px",minWidth:260,maxWidth:"92vw",boxShadow:"0 10px 30px rgba(0,0,0,.7)",zIndex:25}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{width:44,height:44,borderRadius:10,background:"linear-gradient(135deg,#8B4513,#D4A017)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #FFD54F"}}>
              <svg width="36" height="36" viewBox="-30 -35 60 70" dangerouslySetInnerHTML={{__html:TDTowerSVG[selected.type]}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"Cinzel,serif",fontSize:15,fontWeight:900,color:"#FFD54F",letterSpacing:".3px"}}>{tw.name}</div>
              <div style={{fontSize:11,color:"#FFD54F"}}>{"★".repeat(Math.min(4,selected.level+(selected.branch?1:0)))+"☆".repeat(Math.max(0,4-selected.level-(selected.branch?1:0)))}</div>
            </div>
            <button onClick={()=>{stateRef.current.selectedTower=null;setSelected(null);}} style={{width:28,height:28,borderRadius:7,border:"none",background:"rgba(255,255,255,.1)",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:8}}>
            <div style={{background:"rgba(255,255,255,.05)",borderRadius:7,padding:"5px 4px",textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,.5)",fontWeight:700,textTransform:"uppercase"}}>Dégâts</div><div style={{fontSize:13,fontWeight:900,color:"#fff"}}>{Math.round(stats.dmg)||"—"}</div></div>
            <div style={{background:"rgba(255,255,255,.05)",borderRadius:7,padding:"5px 4px",textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,.5)",fontWeight:700,textTransform:"uppercase"}}>Portée</div><div style={{fontSize:13,fontWeight:900,color:"#fff"}}>{Math.round(stats.range)||"—"}</div></div>
            <div style={{background:"rgba(255,255,255,.05)",borderRadius:7,padding:"5px 4px",textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,.5)",fontWeight:700,textTransform:"uppercase"}}>Cadence</div><div style={{fontSize:13,fontWeight:900,color:"#fff"}}>{stats.cd?(1000/stats.cd).toFixed(1)+"/s":"—"}</div></div>
          </div>
          {atBranch?<div>
            <div style={{fontSize:9,color:"#FFD54F",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:5,textAlign:"center"}}>Choisis une voie</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <button onClick={()=>pickBranch("A")} style={{padding:"8px 6px",borderRadius:9,border:"2px solid rgba(66,165,245,.5)",background:"rgba(66,165,245,.15)",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontFamily:"Cinzel,serif",fontSize:11,fontWeight:900,color:"#64B5F6",marginBottom:2}}>{tw.branches[0].name}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,.7)",lineHeight:1.3}}>{tw.branches[0].desc}</div>
              </button>
              <button onClick={()=>pickBranch("B")} style={{padding:"8px 6px",borderRadius:9,border:"2px solid rgba(239,83,80,.5)",background:"rgba(239,83,80,.15)",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontFamily:"Cinzel,serif",fontSize:11,fontWeight:900,color:"#EF5350",marginBottom:2}}>{tw.branches[1].name}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,.7)",lineHeight:1.3}}>{tw.branches[1].desc}</div>
              </button>
            </div>
          </div>:<div style={{display:"flex",gap:5}}>
            {canUp&&<button onClick={upgradeTower} disabled={st.gold<tw.upg[selected.level].cost} style={{flex:1,padding:9,borderRadius:8,border:"none",background:st.gold>=tw.upg[selected.level].cost?"linear-gradient(135deg,#66BB6A,#43A047)":"rgba(255,255,255,.08)",color:"#fff",fontSize:11,fontWeight:900,cursor:st.gold>=tw.upg[selected.level].cost?"pointer":"not-allowed",textTransform:"uppercase",letterSpacing:.5}}>Améliorer · {tw.upg[selected.level].cost}💰</button>}
            <button onClick={sellTower} style={{padding:"9px 12px",borderRadius:8,border:"none",background:"rgba(239,83,80,.3)",color:"#FFB4B4",fontSize:11,fontWeight:800,cursor:"pointer"}}>Vendre</button>
          </div>}
        </div>;
      })()}

      {/* Toast */}
      {toastMsg&&<div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,.8)",backdropFilter:"blur(10px)",color:"#fff",padding:"7px 14px",borderRadius:8,fontSize:11,fontWeight:700,zIndex:30,border:"1px solid rgba(255,213,79,.3)",pointerEvents:"none",whiteSpace:"nowrap"}}>{toastMsg}</div>}

      {/* Drag ghost */}
      {dragging&&dragPos&&<div style={{position:"fixed",left:dragPos.screenX,top:dragPos.screenY,transform:"translate(-50%,-50%)",width:60,height:60,pointerEvents:"none",zIndex:999,opacity:.9}}>
        <svg width="60" height="60" viewBox="-30 -35 60 70" dangerouslySetInnerHTML={{__html:TDTowerSVG[dragging]}}/>
      </div>}
    </div>

    {/* Bottom tower rail */}
    <div style={{flexShrink:0,background:"linear-gradient(180deg,rgba(26,15,8,.98),rgba(10,5,2,1))",borderTop:"2px solid #D4A017",padding:"6px 4px",overflowX:"auto",overflowY:"hidden",display:"flex",gap:5,zIndex:10,scrollbarWidth:"none"}}>
      {TD_TOWERS.map(t=>{
        const affordable=gold>=t.cost;
        return<div key={t.id} onMouseDown={(e)=>handleDragStart(t.id,e)} onTouchStart={(e)=>handleDragStart(t.id,e)} style={{flexShrink:0,width:62,padding:"4px 2px",borderRadius:9,border:`1px solid ${affordable?"rgba(255,213,79,.3)":"rgba(255,255,255,.08)"}`,background:affordable?"linear-gradient(180deg,rgba(139,69,19,.4),rgba(92,51,23,.2))":"rgba(0,0,0,.4)",cursor:affordable?"grab":"not-allowed",touchAction:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:1,opacity:affordable?1:.4,userSelect:"none",WebkitUserSelect:"none"}}>
          <svg width="44" height="44" viewBox="-30 -35 60 70" dangerouslySetInnerHTML={{__html:TDTowerSVG[t.id]}}/>
          <div style={{fontSize:7.5,fontWeight:800,textTransform:"uppercase",letterSpacing:.2,color:"#fff",textAlign:"center",lineHeight:1}}>{t.name}</div>
          <div style={{fontSize:9,fontWeight:900,color:"#FFD54F"}}>{t.cost}💰</div>
        </div>;
      })}
    </div>
  </div>;
}

// ============================================================
// MY ACTIVITY (#7) — Personal dashboard "Mon mois"
// ============================================================
function MyActivityPanel({setPage,auth,flash}){
  const[period,setPeriod]=useState("month"); // month | lastMonth | quarter | year
  const[loading,setLoading]=useState(true);
  const[activity,setActivity]=useState([]);
  const[sites,setSites]=useState([]);

  const periodBounds=useMemo(()=>{
    const now=new Date();
    const start=new Date(now);
    if(period==="month"){start.setDate(1);start.setHours(0,0,0,0);}
    else if(period==="lastMonth"){start.setMonth(start.getMonth()-1);start.setDate(1);start.setHours(0,0,0,0);const end=new Date(start);end.setMonth(end.getMonth()+1);return{from:start,to:end};}
    else if(period==="quarter"){start.setMonth(start.getMonth()-3);start.setHours(0,0,0,0);}
    else if(period==="year"){start.setMonth(0);start.setDate(1);start.setHours(0,0,0,0);}
    return{from:start,to:now};
  },[period]);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true);
      try{
        const fromIso=periodBounds.from.toISOString();
        const toIso=periodBounds.to.toISOString();
        const acts=await dbGet("activity_log",`technician_code=eq.${auth.code}&created_at=gte.${fromIso}&created_at=lt.${toIso}&order=created_at.desc&limit=2000`);
        if(cancelled)return;
        setActivity(acts||[]);
        // Load sites for names lookup
        const allSites=await dbGet("sites","select=id,name,code_nidt,type,lat,lng&deleted_at=is.null&limit=2000");
        if(cancelled)return;
        setSites(allSites||[]);
      }catch(e){flash("Erreur chargement");}
      if(!cancelled)setLoading(false);
    })();
    return()=>{cancelled=true;};
  },[period,auth.code]);

  const stats=useMemo(()=>{
    const uniqueSites=new Set();
    let photos=0,notes=0,edits=0,creates=0;
    for(const a of activity){
      uniqueSites.add(a.site_id);
      if(a.action==="photo")photos++;
      else if(a.action==="comment")notes++;
      else if(a.action==="edit")edits++;
      else if(a.action==="create")creates++;
    }
    return{sites:uniqueSites.size,photos,notes,edits,creates,total:activity.length};
  },[activity]);

  // Daily breakdown for chart
  const dailyData=useMemo(()=>{
    const buckets={};
    for(const a of activity){
      const d=a.created_at.slice(0,10);
      buckets[d]=(buckets[d]||0)+1;
    }
    const days=Object.keys(buckets).sort();
    return days.map(d=>({day:d,count:buckets[d]}));
  },[activity]);

  // Top 5 sites
  const topSites=useMemo(()=>{
    const counts={};
    for(const a of activity){counts[a.site_id]=(counts[a.site_id]||0)+1;}
    return Object.entries(counts).map(([id,n])=>{
      const s=sites.find(x=>x.id===id);
      return{site:s,count:n,id};
    }).filter(x=>x.site).sort((a,b)=>b.count-a.count).slice(0,5);
  },[activity,sites]);

  // Heatmap by day-of-week (0 = Mon, 6 = Sun)
  const dowHeatmap=useMemo(()=>{
    const counts=[0,0,0,0,0,0,0];
    for(const a of activity){
      const d=new Date(a.created_at);
      let dow=d.getDay()-1;if(dow<0)dow=6;
      counts[dow]++;
    }
    return counts;
  },[activity]);

  const exportCSV=()=>{
    const rows=[["Date","Action","Site","Détails"]];
    for(const a of activity){
      const s=sites.find(x=>x.id===a.site_id);
      rows.push([a.created_at,a.action,s?s.name:a.site_id,a.details||""]);
    }
    const csv=rows.map(r=>r.map(c=>`"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`mon-activite-${period}-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    flash("CSV exporté ✓");
  };

  const periodLabels={month:"Ce mois-ci",lastMonth:"Mois dernier",quarter:"3 derniers mois",year:"Cette année"};
  const dowLabels=["L","M","M","J","V","S","D"];
  const maxDow=Math.max(...dowHeatmap,1);

  return<div style={{minHeight:"100vh",background:"#FAFAFA",paddingBottom:60}}>
    <div style={{position:"sticky",top:0,background:"#FFF",borderBottom:"1px solid #F0F0F0",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,zIndex:10}}>
      <button onClick={()=>setPage("home")} style={{background:"#F5F5F5",border:"none",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><I.Back/></button>
      <div style={{flex:1}}>
        <div style={{fontSize:16,fontWeight:900,color:"#1A1A1A"}}>Mon activité</div>
        <div style={{fontSize:10,color:"#999"}}>{periodLabels[period]}</div>
      </div>
      <button onClick={exportCSV} disabled={!activity.length} style={{background:activity.length?P:"#E0E0E0",border:"none",color:"#fff",padding:"7px 12px",borderRadius:8,fontSize:11,fontWeight:800,cursor:activity.length?"pointer":"not-allowed"}}>CSV</button>
    </div>

    <div style={{padding:14}}>
      {/* Period selector */}
      <div style={{display:"flex",gap:5,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {Object.entries(periodLabels).map(([k,l])=><button key={k} onClick={()=>setPeriod(k)} style={{padding:"6px 12px",borderRadius:8,border:period===k?`2px solid ${P}`:"1px solid #E0E0E0",background:period===k?`${P}12`:"#fff",color:period===k?P:"#666",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{l}</button>)}
      </div>

      {loading?<div style={{textAlign:"center",padding:40,color:"#999"}}>Chargement...</div>:<>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          <KpiCard color={P} icon="🏢" label="Sites visités" value={stats.sites}/>
          <KpiCard color="#1976D2" icon="📷" label="Photos" value={stats.photos}/>
          <KpiCard color="#FF9800" icon="📝" label="Notes" value={stats.notes}/>
          <KpiCard color="#9C27B0" icon="✏️" label="Modifs" value={stats.edits}/>
        </div>

        {/* Daily activity chart */}
        {dailyData.length>0&&<Card>
          <h3 style={S.sec}>📈 Activité par jour</h3>
          <DailyChart data={dailyData}/>
        </Card>}

        {/* Day of week heatmap */}
        {stats.total>0&&<Card>
          <h3 style={S.sec}>📅 Activité par jour de la semaine</h3>
          <div style={{display:"flex",gap:4,padding:"8px 0"}}>
            {dowLabels.map((lbl,i)=>{
              const v=dowHeatmap[i];
              const intensity=v/maxDow;
              const bg=v===0?"#F5F5F5":`rgba(27,138,107,${.15+intensity*.7})`;
              return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:"100%",height:44,background:bg,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:intensity>.5?"#fff":"#666"}}>{v||""}</div>
                <span style={{fontSize:10,color:"#999",fontWeight:700}}>{lbl}</span>
              </div>;
            })}
          </div>
        </Card>}

        {/* Top 5 sites */}
        {topSites.length>0&&<Card>
          <h3 style={S.sec}>🏆 Top sites</h3>
          {topSites.map((t,i)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<topSites.length-1?"1px solid #F5F5F5":"none"}}>
            <div style={{width:24,height:24,borderRadius:6,background:i===0?"#FFD54F":"#F5F5F5",color:i===0?"#5C3317":"#999",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,flexShrink:0}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.site.name}</div>
              <div style={{fontSize:10,color:"#999",fontFamily:"monospace"}}>{t.site.code_nidt||"—"}</div>
            </div>
            <div style={{fontSize:13,fontWeight:900,color:P}}>{t.count}</div>
          </div>)}
        </Card>}

        {stats.total===0&&<div style={{textAlign:"center",padding:40,color:"#999"}}>
          <div style={{fontSize:30,marginBottom:8}}>📊</div>
          <div style={{fontSize:13}}>Aucune activité sur cette période</div>
        </div>}

      </>}
    </div>
  </div>;
}

function KpiCard({color,icon,label,value}){
  return<div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid #F0F0F0",display:"flex",alignItems:"center",gap:10}}>
    <div style={{width:38,height:38,borderRadius:10,background:`${color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{icon}</div>
    <div style={{minWidth:0}}>
      <div style={{fontSize:9,color:"#999",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
      <div style={{fontSize:20,fontWeight:900,color:"#1A1A1A",lineHeight:1.1}}>{value}</div>
    </div>
  </div>;
}

function DailyChart({data}){
  const max=Math.max(...data.map(d=>d.count),1);
  const w=300,h=120,p=24;
  const xStep=data.length>1?(w-2*p)/(data.length-1):0;
  const points=data.map((d,i)=>{
    const x=p+i*xStep;
    const y=h-p-(d.count/max)*(h-2*p);
    return[x,y];
  });
  const pathD=points.map((pt,i)=>(i===0?"M":"L")+pt[0]+" "+pt[1]).join(" ");
  const fillD=pathD+` L ${w-p} ${h-p} L ${p} ${h-p} Z`;
  return<svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",height:"auto",display:"block"}}>
    <defs>
      <linearGradient id="dchart" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={P} stopOpacity=".4"/>
        <stop offset="1" stopColor={P} stopOpacity="0"/>
      </linearGradient>
    </defs>
    <line x1={p} y1={h-p} x2={w-p} y2={h-p} stroke="#E0E0E0" strokeWidth="1"/>
    <path d={fillD} fill="url(#dchart)"/>
    <path d={pathD} stroke={P} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    {points.map((pt,i)=><circle key={i} cx={pt[0]} cy={pt[1]} r="3" fill={P} stroke="#fff" strokeWidth="1.5"/>)}
    {data.length<=10&&data.map((d,i)=>{
      const x=p+i*xStep;
      const lbl=d.day.slice(8,10)+"/"+d.day.slice(5,7);
      return<text key={i} x={x} y={h-6} textAnchor="middle" fontSize="9" fill="#999">{lbl}</text>;
    })}
    <text x={p-2} y={p} textAnchor="end" fontSize="9" fill="#999">{max}</text>
    <text x={p-2} y={h-p+3} textAnchor="end" fontSize="9" fill="#999">0</text>
  </svg>;
}

// ============================================================
// TEAM STATS (#8) — Admin tab "Stats équipe"
// ============================================================
function TeamStatsPanel({sites,techs,flash}){
  const[period,setPeriod]=useState("month");
  const[loading,setLoading]=useState(true);
  const[activity,setActivity]=useState([]);

  const periodBounds=useMemo(()=>{
    const now=new Date();
    const start=new Date(now);
    if(period==="month"){start.setDate(1);start.setHours(0,0,0,0);}
    else if(period==="quarter"){start.setMonth(start.getMonth()-3);start.setHours(0,0,0,0);}
    else if(period==="year"){start.setMonth(0);start.setDate(1);start.setHours(0,0,0,0);}
    else if(period==="all"){start.setFullYear(2020);}
    return{from:start,to:now};
  },[period]);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true);
      try{
        const fromIso=periodBounds.from.toISOString();
        const acts=await dbGet("activity_log",`created_at=gte.${fromIso}&order=created_at.desc&limit=10000`);
        if(!cancelled)setActivity(acts||[]);
      }catch(e){flash("Erreur chargement");}
      if(!cancelled)setLoading(false);
    })();
    return()=>{cancelled=true;};
  },[period]);

  // Stats per technician
  const techStats=useMemo(()=>{
    const map={};
    for(const a of activity){
      const k=a.technician_code;
      if(!map[k])map[k]={code:k,total:0,sites:new Set(),photos:0,notes:0,edits:0};
      map[k].total++;
      map[k].sites.add(a.site_id);
      if(a.action==="photo")map[k].photos++;
      else if(a.action==="comment")map[k].notes++;
      else if(a.action==="edit")map[k].edits++;
    }
    return Object.values(map).map(t=>{
      const tech=techs.find(x=>x.code===t.code);
      return{...t,sites:t.sites.size,name:tech?tech.name:t.code};
    }).sort((a,b)=>b.total-a.total);
  },[activity,techs]);

  // Most-visited sites
  const hotSites=useMemo(()=>{
    const counts={};
    for(const a of activity){counts[a.site_id]=(counts[a.site_id]||0)+1;}
    return Object.entries(counts).map(([id,n])=>{
      const s=sites.find(x=>x.id===id);
      return{site:s,count:n,id};
    }).filter(x=>x.site).sort((a,b)=>b.count-a.count).slice(0,8);
  },[activity,sites]);

  // Sites jamais visités
  const coldSites=useMemo(()=>{
    const visitedIds=new Set(activity.map(a=>a.site_id));
    return sites.filter(s=>!visitedIds.has(s.id)&&!s.deleted_at).slice(0,20);
  },[activity,sites]);

  const exportCSV=()=>{
    const rows=[["Technicien","Code","Total actions","Sites uniques","Photos","Notes","Modifs"]];
    for(const t of techStats){rows.push([t.name,t.code,t.total,t.sites,t.photos,t.notes,t.edits]);}
    const csv=rows.map(r=>r.map(c=>`"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`stats-equipe-${period}-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    flash("CSV exporté ✓");
  };

  const periodLabels={month:"Ce mois",quarter:"3 mois",year:"Année",all:"Tout"};
  const maxTotal=Math.max(...techStats.map(t=>t.total),1);

  return<>
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <h3 style={{...S.sec,marginBottom:0,flex:1}}>📊 Stats équipe</h3>
        <button onClick={exportCSV} disabled={!techStats.length} style={{background:techStats.length?P:"#E0E0E0",border:"none",color:"#fff",padding:"5px 10px",borderRadius:7,fontSize:10,fontWeight:800,cursor:techStats.length?"pointer":"not-allowed"}}>CSV</button>
      </div>
      <div style={{display:"flex",gap:5,marginBottom:12,overflowX:"auto",paddingBottom:2}}>
        {Object.entries(periodLabels).map(([k,l])=><button key={k} onClick={()=>setPeriod(k)} style={{padding:"5px 10px",borderRadius:7,border:period===k?`2px solid ${P}`:"1px solid #E0E0E0",background:period===k?`${P}12`:"#fff",color:period===k?P:"#666",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{l}</button>)}
      </div>

      {loading?<div style={{textAlign:"center",padding:30,color:"#999"}}>Chargement...</div>:<>

        {/* Tech ranking with bars */}
        <div style={{marginBottom:8}}>
          {techStats.length===0?<div style={{textAlign:"center",padding:20,color:"#999",fontSize:12}}>Aucune donnée sur la période</div>:
          techStats.map((t,i)=><div key={t.code} style={{padding:"7px 0",borderBottom:i<techStats.length-1?"1px solid #F5F5F5":"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
              <div style={{width:22,height:22,borderRadius:6,background:i===0?"#FFD54F":i===1?"#E0E0E0":i===2?"#FFAB91":"#F5F5F5",color:"#5C3317",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:800,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</div>
                <div style={{fontSize:9,color:"#999",fontFamily:"monospace"}}>{t.code}</div>
              </div>
              <div style={{fontSize:13,fontWeight:900,color:P}}>{t.total}</div>
            </div>
            <div style={{height:5,background:"#F5F5F5",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${(t.total/maxTotal)*100}%`,background:P,borderRadius:3}}/>
            </div>
            <div style={{display:"flex",gap:8,marginTop:3,fontSize:9,color:"#999"}}>
              <span>🏢 {t.sites}</span><span>📷 {t.photos}</span><span>📝 {t.notes}</span><span>✏️ {t.edits}</span>
            </div>
          </div>)}
        </div>

      </>}
    </Card>

    {hotSites.length>0&&<Card>
      <h3 style={S.sec}>🔥 Sites les plus visités</h3>
      <div style={{fontSize:10,color:"#999",marginBottom:8}}>Potentiels problèmes récurrents</div>
      {hotSites.map((s,i)=><div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:i<hotSites.length-1?"1px solid #F5F5F5":"none"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.site.name}</div>
          <div style={{fontSize:9,color:"#999",fontFamily:"monospace"}}>{s.site.code_nidt||"—"} · {s.site.type}</div>
        </div>
        <div style={{fontSize:11,fontWeight:900,color:s.count>=10?"#D32F2F":s.count>=5?"#FF9800":"#666",background:s.count>=10?"#FFEBEE":s.count>=5?"#FFF3E0":"#F5F5F5",padding:"3px 8px",borderRadius:6}}>{s.count}</div>
      </div>)}
    </Card>}

    {coldSites.length>0&&<Card>
      <h3 style={S.sec}>❄️ Sites jamais visités</h3>
      <div style={{fontSize:10,color:"#999",marginBottom:8}}>Aucune activité sur la période ({coldSites.length} affichés)</div>
      {coldSites.slice(0,10).map((s,i)=><div key={s.id} style={{padding:"6px 0",borderBottom:i<Math.min(coldSites.length,10)-1?"1px solid #F5F5F5":"none"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#666",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
        <div style={{fontSize:9,color:"#BBB",fontFamily:"monospace"}}>{s.code_nidt||"—"} · {s.type}</div>
      </div>)}
      {coldSites.length>10&&<div style={{fontSize:10,color:"#999",textAlign:"center",paddingTop:6}}>+{coldSites.length-10} autres</div>}
    </Card>}
  </>;
}

// ============================================================
// SITE HISTORY (#9) — Timeline of site activity
// ============================================================
function SiteHistorySection({siteId,techs}){
  const[loading,setLoading]=useState(true);
  const[history,setHistory]=useState([]);
  const[filter,setFilter]=useState("all");

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true);
      try{
        const data=await dbGet("activity_log",`site_id=eq.${siteId}&order=created_at.desc&limit=200`);
        if(!cancelled)setHistory(data||[]);
      }catch(e){if(!cancelled)setHistory([]);}
      if(!cancelled)setLoading(false);
    })();
    return()=>{cancelled=true;};
  },[siteId]);

  const filtered=useMemo(()=>{
    if(filter==="all")return history;
    return history.filter(h=>h.action===filter);
  },[history,filter]);

  // Visit count last 30 days
  const recent=useMemo(()=>{
    const cutoff=Date.now()-30*24*3600*1000;
    return history.filter(h=>new Date(h.created_at).getTime()>cutoff).length;
  },[history]);

  const recurring=recent>=5;

  const actionMeta={
    photo:{label:"Photo",icon:"📷",color:"#1976D2"},
    comment:{label:"Note",icon:"📝",color:"#FF9800"},
    edit:{label:"Modif",icon:"✏️",color:"#9C27B0"},
    create:{label:"Création",icon:"➕",color:"#4CAF50"},
    rate:{label:"Note ★",icon:"⭐",color:"#FFC107"},
    visit:{label:"Visite",icon:"🚶",color:"#666"},
  };

  const fmtDate=(d)=>{
    const x=new Date(d);
    const now=Date.now();
    const diff=now-x.getTime();
    if(diff<60000)return"À l'instant";
    if(diff<3600000)return Math.floor(diff/60000)+"min";
    if(diff<86400000)return Math.floor(diff/3600000)+"h";
    if(diff<7*86400000)return Math.floor(diff/86400000)+"j";
    return x.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"});
  };

  if(loading)return<div style={{textAlign:"center",padding:14,color:"#999",fontSize:11}}>Chargement historique...</div>;
  if(history.length===0)return<div style={{textAlign:"center",padding:14,color:"#CCC",fontSize:11}}>Aucune activité enregistrée</div>;

  const filters=[
    {k:"all",l:"Tout"},
    {k:"photo",l:"📷"},
    {k:"comment",l:"📝"},
    {k:"edit",l:"✏️"},
    {k:"visit",l:"🚶"},
  ];

  return<div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
      <div style={{fontSize:10,color:"#999",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{history.length} événement{history.length>1?"s":""}</div>
      {recurring&&<span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:5,background:"#FFEBEE",color:"#D32F2F",textTransform:"uppercase",letterSpacing:.5}}>⚠ Site récurrent · {recent}× / 30j</span>}
      {!recurring&&recent>0&&<span style={{fontSize:9,color:"#666"}}>{recent}× sur 30j</span>}
    </div>

    <div style={{display:"flex",gap:4,marginBottom:8,overflowX:"auto",paddingBottom:2}}>
      {filters.map(f=><button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:"4px 10px",borderRadius:6,border:filter===f.k?`2px solid ${P}`:"1px solid #E0E0E0",background:filter===f.k?`${P}12`:"#fff",color:filter===f.k?P:"#666",fontSize:10,fontWeight:800,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{f.l}</button>)}
    </div>

    <div style={{maxHeight:300,overflowY:"auto",border:"1px solid #F0F0F0",borderRadius:10}}>
      {filtered.map((h,i)=>{
        const meta=actionMeta[h.action]||{label:h.action,icon:"·",color:"#999"};
        const tech=techs?.find(t=>t.code===h.technician_code);
        return<div key={h.id||i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 10px",borderBottom:i<filtered.length-1?"1px solid #F8F8F8":"none"}}>
          <div style={{width:26,height:26,borderRadius:7,background:`${meta.color}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:13}}>{meta.icon}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontSize:11,fontWeight:800,color:meta.color}}>{meta.label}</span>
              <span style={{fontSize:10,color:"#999"}}>par {tech?tech.name:h.technician_code}</span>
              <span style={{flex:1,minWidth:0}}/>
              <span style={{fontSize:9,color:"#BBB",flexShrink:0}}>{fmtDate(h.created_at)}</span>
            </div>
            {h.details&&h.details.length<200&&<div style={{fontSize:10,color:"#666",marginTop:2,wordBreak:"break-word"}}>{h.details}</div>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}


// ============================================================
// DRIVE BACTERIA — 8x8 board, duplicate/jump + convert
// Solo vs IA (3 levels) + Multi 1v1 via Supabase Realtime
// ============================================================
const BACT_SIZE=8;
const BACT_OBSTACLES=[[3,3],[3,4],[4,3],[4,4]]; // central blockers
const BACT_GREEN="#1B8A6B";
const BACT_PURPLE="#9D86FF";

// Synthetic sounds via WebAudio
let bactAC=null;
function bactBeep(freq,dur,type="sine",vol=.15){
  try{
    if(!bactAC)bactAC=new(window.AudioContext||window.webkitAudioContext)();
    const o=bactAC.createOscillator(),g=bactAC.createGain();
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(vol,bactAC.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,bactAC.currentTime+dur);
    o.connect(g);g.connect(bactAC.destination);
    o.start();o.stop(bactAC.currentTime+dur);
  }catch(e){}
}
const bactSounds={
  select:()=>bactBeep(660,.12,"square",.1),
  duplicate:()=>{bactBeep(440,.08,"sine",.18);setTimeout(()=>bactBeep(660,.1,"sine",.15),60);},
  jump:()=>{bactBeep(330,.07,"sine",.15);setTimeout(()=>bactBeep(550,.12,"sine",.15),50);},
  convert:()=>bactBeep(880,.06,"triangle",.18),
  win:()=>{bactBeep(523,.15,"sine",.2);setTimeout(()=>bactBeep(659,.15,"sine",.2),120);setTimeout(()=>bactBeep(784,.25,"sine",.2),240);},
  lose:()=>{bactBeep(330,.2,"sawtooth",.15);setTimeout(()=>bactBeep(220,.3,"sawtooth",.15),180);},
  invalid:()=>bactBeep(150,.1,"square",.08),
};

const bactInBounds=(r,c)=>r>=0&&r<BACT_SIZE&&c>=0&&c<BACT_SIZE;
const bactIsObstacle=(r,c)=>BACT_OBSTACLES.some(([or,oc])=>or===r&&oc===c);

function bactInitBoard(){
  // 0 = empty, 1 = green, 2 = purple, -1 = obstacle
  const b=Array.from({length:BACT_SIZE},()=>Array(BACT_SIZE).fill(0));
  for(const[r,c]of BACT_OBSTACLES)b[r][c]=-1;
  b[0][0]=1;
  b[BACT_SIZE-1][BACT_SIZE-1]=2;
  return b;
}

function bactReachable(board,r,c){
  // Returns {dup:[[r,c]...], jump:[[r,c]...]}
  const dup=[],jump=[];
  for(let dr=-2;dr<=2;dr++){
    for(let dc=-2;dc<=2;dc++){
      if(dr===0&&dc===0)continue;
      const nr=r+dr,nc=c+dc;
      if(!bactInBounds(nr,nc))continue;
      if(board[nr][nc]!==0)continue;
      const dist=Math.max(Math.abs(dr),Math.abs(dc));
      if(dist===1)dup.push([nr,nc]);
      else if(dist===2)jump.push([nr,nc]);
    }
  }
  return{dup,jump};
}

function bactApplyMove(board,fromR,fromC,toR,toC){
  // returns {newBoard, mode:"dup"|"jump", converted:[[r,c]...]}
  const newB=board.map(row=>[...row]);
  const player=newB[fromR][fromC];
  const dist=Math.max(Math.abs(toR-fromR),Math.abs(toC-fromC));
  const mode=dist===1?"dup":"jump";
  if(mode==="jump")newB[fromR][fromC]=0;
  newB[toR][toC]=player;
  // Convert adjacent enemies
  const opp=player===1?2:1;
  const converted=[];
  for(let dr=-1;dr<=1;dr++){
    for(let dc=-1;dc<=1;dc++){
      if(dr===0&&dc===0)continue;
      const nr=toR+dr,nc=toC+dc;
      if(!bactInBounds(nr,nc))continue;
      if(newB[nr][nc]===opp){
        newB[nr][nc]=player;
        converted.push([nr,nc]);
      }
    }
  }
  return{board:newB,mode,converted};
}

function bactCount(board){
  let g=0,p=0,e=0;
  for(let r=0;r<BACT_SIZE;r++)for(let c=0;c<BACT_SIZE;c++){
    if(board[r][c]===1)g++;
    else if(board[r][c]===2)p++;
    else if(board[r][c]===0)e++;
  }
  return{green:g,purple:p,empty:e};
}

function bactHasMoves(board,player){
  for(let r=0;r<BACT_SIZE;r++)for(let c=0;c<BACT_SIZE;c++){
    if(board[r][c]!==player)continue;
    const{dup,jump}=bactReachable(board,r,c);
    if(dup.length+jump.length>0)return true;
  }
  return false;
}

function bactGameOver(board){
  const{empty}=bactCount(board);
  const g=bactHasMoves(board,1),p=bactHasMoves(board,2);
  if(empty===0||(!g&&!p))return true;
  if(!g||!p)return true;
  return false;
}

// All possible moves for a player
function bactAllMoves(board,player){
  const moves=[];
  for(let r=0;r<BACT_SIZE;r++)for(let c=0;c<BACT_SIZE;c++){
    if(board[r][c]!==player)continue;
    const{dup,jump}=bactReachable(board,r,c);
    for(const[nr,nc]of dup)moves.push([r,c,nr,nc]);
    for(const[nr,nc]of jump)moves.push([r,c,nr,nc]);
  }
  return moves;
}

// AI scoring (simple greedy + minimax for hard)
function bactScoreMove(board,move,player){
  const opp=player===1?2:1;
  const{board:nb,mode,converted}=bactApplyMove(board,...move);
  let score=converted.length*10;
  if(mode==="dup")score+=2; // gain a piece
  // bonus for staying connected
  const{green,purple}=bactCount(nb);
  score+=(player===1?green-purple:purple-green)*1.5;
  return score;
}

function bactMinimax(board,player,depth,alpha,beta,maximizing){
  if(depth===0||bactGameOver(board)){
    const{green,purple}=bactCount(board);
    return player===1?green-purple:purple-green;
  }
  const current=maximizing?player:(player===1?2:1);
  const moves=bactAllMoves(board,current);
  if(moves.length===0)return bactMinimax(board,player,depth-1,alpha,beta,!maximizing);
  if(maximizing){
    let max=-Infinity;
    for(const m of moves){
      const{board:nb}=bactApplyMove(board,...m);
      const v=bactMinimax(nb,player,depth-1,alpha,beta,false);
      if(v>max)max=v;
      alpha=Math.max(alpha,v);
      if(beta<=alpha)break;
    }
    return max;
  }else{
    let min=Infinity;
    for(const m of moves){
      const{board:nb}=bactApplyMove(board,...m);
      const v=bactMinimax(nb,player,depth-1,alpha,beta,true);
      if(v<min)min=v;
      beta=Math.min(beta,v);
      if(beta<=alpha)break;
    }
    return min;
  }
}

function bactPickAIMove(board,player,level){
  const moves=bactAllMoves(board,player);
  if(moves.length===0)return null;
  if(level==="easy"){
    // 60% random, 40% greedy
    if(Math.random()<.6)return moves[Math.floor(Math.random()*moves.length)];
    return moves.map(m=>({m,s:bactScoreMove(board,m,player)})).sort((a,b)=>b.s-a.s)[0].m;
  }
  if(level==="medium"){
    // greedy with slight randomness
    const scored=moves.map(m=>({m,s:bactScoreMove(board,m,player)})).sort((a,b)=>b.s-a.s);
    const top=scored.slice(0,Math.max(1,Math.floor(scored.length*.3)));
    return top[Math.floor(Math.random()*top.length)].m;
  }
  // hard — minimax depth 2
  let best=null,bestScore=-Infinity;
  for(const m of moves){
    const{board:nb}=bactApplyMove(board,...m);
    const s=bactMinimax(nb,player,2,-Infinity,Infinity,false);
    if(s>bestScore){bestScore=s;best=m;}
  }
  return best||moves[0];
}

// ============================================================
// BACTERIA LOBBY
// ============================================================
function DriveBacteria({setPage,auth,flash}){
  const[screen,setScreen]=useState("lobby");
  const[mode,setMode]=useState("solo"); // solo | coop
  const[aiLevel,setAILevel]=useState("medium");
  const[session,setSession]=useState(null);
  const[sessionCode,setSessionCode]=useState("");
  const[joinCode,setJoinCode]=useState("");
  const[lobbyPlayers,setLobbyPlayers]=useState([]);
  const[loading,setLoading]=useState(false);
  const pollRef=useRef(null);

  useEffect(()=>()=>{if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}},[]);

  const genCode=()=>{const L="ABCDEFGHJKMNPQRSTUVWXYZ";return Array.from({length:4},()=>L[Math.floor(Math.random()*L.length)]).join("");};

  const startSolo=(level)=>{
    setMode("solo");setAILevel(level);
    setSession({id:0,solo:true,host_code:auth.code,ai:level});
    setScreen("playing");
  };

  const createCoop=async()=>{
    setLoading(true);
    try{
      let code=genCode();
      for(let i=0;i<5;i++){
        const ex=await dbGet("bacteria_sessions",`code=eq.${code}&status=in.(waiting,playing)`);
        if(!ex||ex.length===0)break;
        code=genCode();
      }
      const initBoard=bactInitBoard();
      const[s]=await dbPost("bacteria_sessions",{code,host_code:auth.code,host_name:auth.name||auth.code,status:"waiting",board:JSON.stringify(initBoard),turn:1,move_count:0});
      setSession(s);setSessionCode(code);setMode("coop");setScreen("waiting");
      startLobbyPoll(s.id);
    }catch(e){flash("Erreur: "+e.message);}
    setLoading(false);
  };

  const joinCoop=async()=>{
    if(joinCode.length!==4){flash("Code 4 lettres");return;}
    setLoading(true);
    try{
      const list=await dbGet("bacteria_sessions",`code=eq.${joinCode.toUpperCase()}&status=eq.waiting&limit=1`);
      if(!list||list.length===0){flash("Partie introuvable");setLoading(false);return;}
      const s=list[0];
      await dbPatch("bacteria_sessions",{guest_code:auth.code,guest_name:auth.name||auth.code,status:"playing"},`id=eq.${s.id}`);
      setSession({...s,guest_code:auth.code,guest_name:auth.name||auth.code,status:"playing"});
      setSessionCode(s.code);setMode("coop");setScreen("playing");
    }catch(e){flash("Erreur: "+e.message);}
    setLoading(false);
  };

  const startLobbyPoll=(sid)=>{
    const poll=async()=>{
      try{
        const[s]=await dbGet("bacteria_sessions",`id=eq.${sid}&limit=1`);
        if(!s)return;
        if(s.status==="playing"){
          setSession(s);setScreen("playing");
          if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}
          return;
        }
        setLobbyPlayers(s.guest_code?[{code:s.host_code,name:s.host_name},{code:s.guest_code,name:s.guest_name}]:[{code:s.host_code,name:s.host_name}]);
      }catch(e){}
    };
    poll();pollRef.current=setInterval(poll,2000);
  };

  const leaveSession=async()=>{
    try{
      if(session&&!session.solo){
        if(session.host_code===auth.code)await dbPatch("bacteria_sessions",{status:"ended"},`id=eq.${session.id}`);
      }
    }catch(e){}
    if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}
    setSession(null);setLobbyPlayers([]);setScreen("lobby");
  };

  const quit=async()=>{await leaveSession();setPage("home");};

  const DARK_BG="linear-gradient(170deg,#0a1428 0%,#1a0d3d 100%)";

  if(screen==="playing"&&session){
    return<DriveBacteriaArena session={session} mode={mode} aiLevel={aiLevel} auth={auth} onQuit={quit} onBack={()=>setScreen("lobby")} flash={flash}/>;
  }

  if(screen==="waiting"){
    const guestJoined=lobbyPlayers.length>=2;
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
      <div style={{padding:"12px 14px"}}>
        <button onClick={leaveSession} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 14px"}}>
        <div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,.5)",letterSpacing:2,textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Code de la partie</div>
          <div style={{fontSize:48,fontWeight:900,letterSpacing:8,color:BACT_PURPLE,fontFamily:"monospace",textShadow:`0 0 20px ${BACT_PURPLE}80`}}>{sessionCode}</div>
        </div>
        <div style={{background:"rgba(255,255,255,.04)",borderRadius:12,border:"1px solid rgba(255,255,255,.06)",padding:12,marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Joueurs ({lobbyPlayers.length}/2)</div>
          {lobbyPlayers.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<lobbyPlayers.length-1?"1px solid rgba(255,255,255,.04)":"none"}}>
            <div style={{width:30,height:30,borderRadius:9,background:i===0?`linear-gradient(135deg,${BACT_GREEN},#4ECDC4)`:`linear-gradient(135deg,${BACT_PURPLE},#FF6B9D)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:12}}>{(p.name||"?")[0].toUpperCase()}</div>
            <span style={{flex:1,fontSize:13,fontWeight:700}}>{p.name||p.code}</span>
            <span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:5,background:i===0?`${BACT_GREEN}33`:`${BACT_PURPLE}33`,color:i===0?BACT_GREEN:BACT_PURPLE,textTransform:"uppercase"}}>{i===0?"Vert":"Violet"}</span>
          </div>)}
        </div>
        <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.5)"}}>{guestJoined?"L'adversaire a rejoint, partie qui démarre...":"En attente d'un adversaire..."}</div>
      </div>
    </div>;
  }

  if(screen==="join"){
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
      <div style={{padding:"12px 14px"}}>
        <button onClick={()=>setScreen("lobby")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
      </div>
      <div style={{flex:1,padding:"10px 20px",display:"flex",flexDirection:"column",justifyContent:"center",maxWidth:400,width:"100%",margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:28,fontWeight:900,marginBottom:4}}>Rejoindre une partie</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>Entre le code de l'hôte</div>
        </div>
        <input type="text" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().slice(0,4))} placeholder="ABCD" maxLength={4} style={{width:"100%",padding:"18px",borderRadius:14,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:32,fontWeight:900,textAlign:"center",letterSpacing:10,outline:"none",fontFamily:"monospace",marginBottom:16}}/>
        <button onClick={joinCoop} disabled={loading||joinCode.length!==4} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:joinCode.length===4?`linear-gradient(135deg,${BACT_PURPLE},#FF6B9D)`:"rgba(255,255,255,.08)",color:"#fff",fontSize:14,fontWeight:900,cursor:joinCode.length===4?"pointer":"not-allowed",letterSpacing:1,textTransform:"uppercase"}}>{loading?"Recherche...":"Rejoindre"}</button>
      </div>
    </div>;
  }

  return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",color:"#fff"}}>
    <div style={{padding:"12px 14px"}}>
      <button onClick={()=>setPage("home")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
    </div>
    <div style={{flex:1,padding:"0 20px 20px",display:"flex",flexDirection:"column",justifyContent:"center",maxWidth:400,width:"100%",margin:"0 auto",position:"relative"}}>
      <div style={{position:"absolute",top:20,left:"50%",transform:"translateX(-50%)",width:300,height:300,background:`radial-gradient(circle,${BACT_PURPLE}55,transparent 70%)`,filter:"blur(50px)",pointerEvents:"none"}}/>
      <div style={{textAlign:"center",marginBottom:28,position:"relative",zIndex:1}}>
        <div style={{fontSize:52,marginBottom:6}}>🦠</div>
        <div style={{fontSize:36,fontWeight:900,letterSpacing:-1,background:`linear-gradient(135deg,${BACT_GREEN},${BACT_PURPLE})`,WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:4}}>Drive Bacteria</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.5)",letterSpacing:2,textTransform:"uppercase",fontWeight:700}}>Conquête cellulaire · 8×8</div>
      </div>

      <div style={{position:"relative",zIndex:1,marginBottom:18}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Solo vs IA</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
          {[["easy","Facile","#66BB6A"],["medium","Moyen","#FFA726"],["hard","Difficile","#EF5350"]].map(([lv,lbl,col])=><button key={lv} onClick={()=>startSolo(lv)} style={{padding:"11px 6px",borderRadius:11,border:`1px solid ${col}66`,background:`${col}22`,color:"#fff",fontSize:12,fontWeight:900,cursor:"pointer",letterSpacing:.5,textTransform:"uppercase"}}>{lbl}</button>)}
        </div>
      </div>

      <div style={{position:"relative",zIndex:1}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>Multijoueur 1 vs 1</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={createCoop} disabled={loading} style={{padding:"13px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${BACT_GREEN},#4ECDC4)`,color:"#fff",fontSize:13,fontWeight:900,cursor:"pointer",boxShadow:`0 6px 20px ${BACT_GREEN}50`,display:"flex",alignItems:"center",justifyContent:"center",gap:8,letterSpacing:1,textTransform:"uppercase"}}>
            <span style={{fontSize:16}}>🟢</span> Créer une partie
          </button>
          <button onClick={()=>setScreen("join")} style={{padding:"13px",borderRadius:12,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.05)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,letterSpacing:1,textTransform:"uppercase"}}>
            <span style={{fontSize:16}}>🟣</span> Rejoindre
          </button>
        </div>
      </div>

      <div style={{marginTop:18,fontSize:10,color:"rgba(255,255,255,.4)",textAlign:"center",lineHeight:1.6,position:"relative",zIndex:1}}>
        Distance 1 = duplique · Distance 2 = saute<br/>
        Conversion des bactéries adverses adjacentes
      </div>
    </div>
  </div>;
}

// ============================================================
// BACTERIA ARENA
// ============================================================
function DriveBacteriaArena({session,mode,aiLevel,auth,onQuit,onBack,flash}){
  const[board,setBoard]=useState(()=>{
    if(mode==="coop"&&session.board){try{return JSON.parse(session.board);}catch{return bactInitBoard();}}
    return bactInitBoard();
  });
  const[selected,setSelected]=useState(null);
  const[reach,setReach]=useState({dup:[],jump:[]});
  const[turn,setTurn]=useState(session.turn||1); // 1 = green, 2 = purple
  const[moveCount,setMoveCount]=useState(session.move_count||0);
  const[gameEnd,setGameEnd]=useState(null);
  const[anim,setAnim]=useState({converting:[],placing:null,from:null}); // for cascade animation
  const[aiThinking,setAIThinking]=useState(false);
  const[soundsOn,setSoundsOn]=useState(true);
  const channelRef=useRef(null);
  const lastSyncedMoveRef=useRef(session.move_count||0);

  // Determine my color
  const myPlayer=mode==="solo"?1:(session.host_code===auth.code?1:2);
  const oppName=mode==="solo"?({easy:"IA Facile",medium:"IA Moyenne",hard:"IA Difficile"}[aiLevel]):(myPlayer===1?(session.guest_name||"Adversaire"):(session.host_name||"Hôte"));
  const myName=auth.name||auth.code;

  const counts=useMemo(()=>bactCount(board),[board]);

  const playSound=(s)=>{if(soundsOn&&bactSounds[s])bactSounds[s]();};

  // ==== MULTI: Realtime sync via DB polling (works without supabase-js) ====
  const pollIntervalRef=useRef(null);
  useEffect(()=>{
    if(mode!=="coop"||!session||session.solo)return;
    let cancelled=false;
    // Try realtime broadcast first if supabase JS client exists
    if(window.supabase){
      try{
        const chan=window.supabase.channel(`bact:${session.id}`,{config:{broadcast:{self:false}}});
        chan.on("broadcast",{event:"move"},({payload})=>{
          if(payload.player===auth.code)return;
          if(payload.moveCount<=lastSyncedMoveRef.current)return;
          lastSyncedMoveRef.current=payload.moveCount;
          if(payload.skipped){
            setBoard(JSON.parse(payload.board));
            setTurn(payload.turn);
            setMoveCount(payload.moveCount);
          }else{
            animateMove(payload.fromR,payload.fromC,payload.toR,payload.toC,JSON.parse(payload.board),payload.turn,payload.moveCount);
          }
        });
        chan.subscribe();
        channelRef.current=chan;
      }catch(e){console.warn("Realtime fail, fallback to polling",e);}
    }
    // Always also run DB polling as primary (most reliable for turn-based)
    const poll=async()=>{
      if(cancelled)return;
      try{
        const[s]=await dbGet("bacteria_sessions",`id=eq.${session.id}&limit=1`);
        if(!s||cancelled)return;
        if(s.status==="ended"){
          flash("Partie terminée par l'adversaire");
          setTimeout(onQuit,1500);
          return;
        }
        const dbMoveCount=s.move_count||0;
        if(dbMoveCount>lastSyncedMoveRef.current){
          // Opponent played — refresh state
          const newBoard=typeof s.board==="string"?JSON.parse(s.board):s.board;
          // Update without animation if we missed multiple moves; otherwise animate
          lastSyncedMoveRef.current=dbMoveCount;
          setBoard(newBoard);
          setTurn(s.turn||1);
          setMoveCount(dbMoveCount);
          if(bactGameOver(newBoard))setTimeout(()=>checkEnd(newBoard),300);
        }
      }catch(e){}
    };
    pollIntervalRef.current=setInterval(poll,1500);
    return()=>{
      cancelled=true;
      if(pollIntervalRef.current){clearInterval(pollIntervalRef.current);pollIntervalRef.current=null;}
      try{if(channelRef.current)channelRef.current.unsubscribe();}catch(e){}
      channelRef.current=null;
    };
  // eslint-disable-next-line
  },[mode,session?.id,auth.code]);

  const broadcastMove=(fromR,fromC,toR,toC,newBoard,newTurn,newMoveCount,skipped=false)=>{
    // Persist to DB (primary sync)
    dbPatch("bacteria_sessions",{board:JSON.stringify(newBoard),turn:newTurn,move_count:newMoveCount},`id=eq.${session.id}`).catch(()=>{});
    // Also broadcast for instant feedback if available
    if(channelRef.current){
      try{channelRef.current.send({type:"broadcast",event:"move",payload:{
        player:auth.code,fromR,fromC,toR,toC,skipped,
        board:JSON.stringify(newBoard),turn:newTurn,moveCount:newMoveCount,
      }});}catch(e){}
    }
  };

  const animateMove=(fromR,fromC,toR,toC,finalBoard,newTurn,newMoveCount)=>{
    const before=board;
    const player=before[fromR][fromC];
    const dist=Math.max(Math.abs(toR-fromR),Math.abs(toC-fromC));
    const mode2=dist===1?"dup":"jump";
    // intermediate board: just place new piece, no conversions yet
    const placed=before.map(r=>[...r]);
    if(mode2==="jump")placed[fromR][fromC]=0;
    placed[toR][toC]=player;
    setBoard(placed);
    setAnim({placing:[toR,toC],from:[fromR,fromC],converting:[]});
    playSound(mode2==="dup"?"duplicate":"jump");

    // find converted cells
    const opp=player===1?2:1;
    const converted=[];
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if(dr===0&&dc===0)continue;
      const nr=toR+dr,nc=toC+dc;
      if(!bactInBounds(nr,nc))continue;
      if(before[nr][nc]===opp)converted.push([nr,nc]);
    }

    // animate cascade: convert one by one
    let delay=200;
    converted.forEach(([cr,cc],i)=>{
      setTimeout(()=>{
        setBoard(b=>{
          const nb=b.map(r=>[...r]);
          nb[cr][cc]=player;
          return nb;
        });
        setAnim(a=>({...a,converting:[...(a.converting||[]),[cr,cc]]}));
        playSound("convert");
      },delay+i*120);
    });

    // finalize
    setTimeout(()=>{
      setBoard(finalBoard);
      setAnim({placing:null,from:null,converting:[]});
      setTurn(newTurn);
      setMoveCount(newMoveCount);
      // check game over
      if(bactGameOver(finalBoard))setTimeout(()=>checkEnd(finalBoard),300);
    },delay+converted.length*120+200);
  };

  const checkEnd=(b)=>{
    const{green,purple}=bactCount(b);
    let winner=null;
    if(green>purple)winner=1;
    else if(purple>green)winner=2;
    setGameEnd({winner,green,purple});
    if(winner===myPlayer)playSound("win");
    else if(winner)playSound("lose");
  };

  const handleCellClick=(r,c)=>{
    if(gameEnd||anim.placing||aiThinking)return;
    if(turn!==myPlayer)return;
    const v=board[r][c];
    if(v===-1)return;
    if(v===myPlayer){
      setSelected([r,c]);
      setReach(bactReachable(board,r,c));
      playSound("select");
      return;
    }
    if(v===0&&selected){
      // try move
      const[fr,fc]=selected;
      const validDup=reach.dup.some(([nr,nc])=>nr===r&&nc===c);
      const validJump=reach.jump.some(([nr,nc])=>nr===r&&nc===c);
      if(!validDup&&!validJump){playSound("invalid");return;}
      executeMove(fr,fc,r,c);
    }
  };

  const executeMove=(fr,fc,tr,tc)=>{
    const{board:newB}=bactApplyMove(board,fr,fc,tr,tc);
    const newMoveCount=moveCount+1;
    const nextTurn=turn===1?2:1;
    setSelected(null);setReach({dup:[],jump:[]});
    animateMove(fr,fc,tr,tc,newB,nextTurn,newMoveCount);
    if(mode==="coop")broadcastMove(fr,fc,tr,tc,newB,nextTurn,newMoveCount);
    lastSyncedMoveRef.current=newMoveCount;
    // skip turn if next player has no moves
    setTimeout(()=>{
      if(!bactHasMoves(newB,nextTurn)&&bactHasMoves(newB,turn)){
        setTurn(turn); // back to me
      }
    },1500);
  };

  // AI plays
  useEffect(()=>{
    if(mode!=="solo"||gameEnd||anim.placing)return;
    if(turn!==2)return;
    setAIThinking(true);
    const t=setTimeout(()=>{
      const move=bactPickAIMove(board,2,aiLevel);
      setAIThinking(false);
      if(!move){
        // AI has no moves
        if(!bactHasMoves(board,1))checkEnd(board);
        else setTurn(1);
        return;
      }
      const[fr,fc,tr,tc]=move;
      const{board:newB}=bactApplyMove(board,fr,fc,tr,tc);
      const newMoveCount=moveCount+1;
      animateMove(fr,fc,tr,tc,newB,1,newMoveCount);
    },aiLevel==="easy"?500:aiLevel==="medium"?900:1300);
    return()=>clearTimeout(t);
  // eslint-disable-next-line
  },[turn,gameEnd,mode]);

  // Skip if I have no moves (multi or solo as green)
  useEffect(()=>{
    if(gameEnd||anim.placing||aiThinking)return;
    if(turn===myPlayer&&!bactHasMoves(board,myPlayer)){
      if(!bactHasMoves(board,turn===1?2:1))setTimeout(()=>checkEnd(board),300);
      else{
        flash("Aucun coup possible — tour passé");
        setTimeout(()=>{
          const newTurn=turn===1?2:1;
          setTurn(newTurn);
          if(mode==="coop")broadcastMove(-1,-1,-1,-1,board,newTurn,moveCount+1,true);
        },800);
      }
    }
  // eslint-disable-next-line
  },[turn,gameEnd]);

  // ==== RENDER ====
  const isMyTurn=turn===myPlayer&&!gameEnd&&!anim.placing&&!aiThinking;
  const myColor=myPlayer===1?BACT_GREEN:BACT_PURPLE;
  const oppColor=myPlayer===1?BACT_PURPLE:BACT_GREEN;
  const turnColor=turn===1?BACT_GREEN:BACT_PURPLE;

  const DARK_BG="linear-gradient(170deg,#0a1428 0%,#1a0d3d 100%)";

  // Cell size — fit 8 cols on mobile (~360 wide minus padding)
  const board_w=Math.min(380,(typeof window!=="undefined"?window.innerWidth:380)-20);
  const cellSize=Math.floor((board_w-32)/BACT_SIZE);

  return<div style={{position:"fixed",inset:0,background:DARK_BG,zIndex:999,display:"flex",flexDirection:"column",overflow:"hidden",userSelect:"none",WebkitUserSelect:"none",color:"#fff"}}>
    {/* Aurora bg accents */}
    <div style={{position:"absolute",top:"-20%",left:"-10%",width:"60%",height:"40%",background:`radial-gradient(ellipse,${BACT_GREEN}33,transparent 60%)`,filter:"blur(50px)",pointerEvents:"none"}}/>
    <div style={{position:"absolute",bottom:"-20%",right:"-10%",width:"60%",height:"40%",background:`radial-gradient(ellipse,${BACT_PURPLE}33,transparent 60%)`,filter:"blur(50px)",pointerEvents:"none"}}/>

    {/* Top HUD: scores + back */}
    <div style={{flexShrink:0,padding:"10px 12px",display:"flex",alignItems:"center",gap:8,position:"relative",zIndex:5}}>
      <button onClick={onQuit} style={{width:32,height:32,borderRadius:9,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><I.Back/></button>

      <div style={{flex:1,display:"flex",gap:6}}>
        <PlayerBadge color={BACT_GREEN} name={myPlayer===1?myName:oppName} count={counts.green} active={turn===1} you={myPlayer===1}/>
        <PlayerBadge color={BACT_PURPLE} name={myPlayer===2?myName:oppName} count={counts.purple} active={turn===2} you={myPlayer===2}/>
      </div>

      <button onClick={()=>setSoundsOn(!soundsOn)} style={{width:32,height:32,borderRadius:9,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{soundsOn?"🔊":"🔇"}</button>
    </div>

    {/* Turn indicator */}
    <div style={{flexShrink:0,textAlign:"center",padding:"4px 0",fontSize:11,fontWeight:800,color:turnColor,letterSpacing:1.5,textTransform:"uppercase",position:"relative",zIndex:5,minHeight:18}}>
      {gameEnd?(gameEnd.winner===null?"Match nul !":(gameEnd.winner===myPlayer?"Tu as gagné !":"Tu as perdu...")):
        aiThinking?"L'IA réfléchit...":
        anim.placing?" ":
        isMyTurn?"À toi de jouer":
        `Tour de ${oppName}`}
    </div>

    {/* Legend (visible when a bacteria is selected) */}
    {selected&&!gameEnd&&<div style={{flexShrink:0,display:"flex",justifyContent:"center",gap:14,padding:"2px 0 6px",fontSize:9,color:"rgba(255,255,255,.7)",fontWeight:700,position:"relative",zIndex:5}}>
      <span style={{display:"flex",alignItems:"center",gap:4}}>
        <span style={{display:"inline-block",width:14,height:14,borderRadius:7,background:`${myColor}33`,border:`2px solid ${myColor}`}}/> Duplique
      </span>
      <span style={{display:"flex",alignItems:"center",gap:4}}>
        <span style={{display:"inline-block",width:14,height:14,borderRadius:7,background:"transparent",border:`2px dashed ${myColor}AA`}}/> Téléporte
      </span>
    </div>}

    {/* Board */}
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:10,position:"relative",zIndex:5}}>
      <div style={{
        background:"linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02))",
        backdropFilter:"blur(20px)",
        border:"1px solid rgba(255,255,255,.1)",
        borderRadius:18,
        padding:16,
        boxShadow:"0 10px 40px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08)",
      }}>
        <svg viewBox={`0 0 ${BACT_SIZE*60+20} ${BACT_SIZE*60+20}`} width={cellSize*BACT_SIZE+20} height={cellSize*BACT_SIZE+20} style={{display:"block"}}>
          <defs>
            <radialGradient id="bact-cell-empty" cx=".5" cy=".5">
              <stop offset="0" stopColor="rgba(255,255,255,.04)"/>
              <stop offset="1" stopColor="rgba(255,255,255,.02)"/>
            </radialGradient>
            <radialGradient id="bact-cell-reach-dup" cx=".5" cy=".5">
              <stop offset="0" stopColor={`${myColor}55`}/>
              <stop offset="1" stopColor={`${myColor}22`}/>
            </radialGradient>
            <radialGradient id="bact-cell-reach-jump" cx=".5" cy=".5">
              <stop offset="0" stopColor={`${myColor}33`}/>
              <stop offset="1" stopColor={`${myColor}11`}/>
            </radialGradient>
            <radialGradient id="bact-obstacle" cx=".5" cy=".4">
              <stop offset="0" stopColor="#1a0a05"/>
              <stop offset="1" stopColor="#3a1a10"/>
            </radialGradient>
            <radialGradient id="bact-green" cx=".4" cy=".3">
              <stop offset="0" stopColor="#5DD9A7"/>
              <stop offset=".7" stopColor={BACT_GREEN}/>
              <stop offset="1" stopColor="#0F5942"/>
            </radialGradient>
            <radialGradient id="bact-purple" cx=".4" cy=".3">
              <stop offset="0" stopColor="#C4B0FF"/>
              <stop offset=".7" stopColor={BACT_PURPLE}/>
              <stop offset="1" stopColor="#5B47A8"/>
            </radialGradient>
          </defs>

          {/* Grid */}
          {Array.from({length:BACT_SIZE}).map((_,r)=>Array.from({length:BACT_SIZE}).map((_,c)=>{
            const x=10+c*60,y=10+r*60;
            const v=board[r][c];
            const isSelected=selected&&selected[0]===r&&selected[1]===c;
            const isDup=reach.dup.some(([nr,nc])=>nr===r&&nc===c);
            const isJump=reach.jump.some(([nr,nc])=>nr===r&&nc===c);
            const isPlacing=anim.placing&&anim.placing[0]===r&&anim.placing[1]===c;
            const isConverting=anim.converting.some(([nr,nc])=>nr===r&&nc===c);

            return<g key={`${r}-${c}`} onClick={()=>handleCellClick(r,c)} style={{cursor:gameEnd?"default":(v===myPlayer&&isMyTurn)||(v===0&&selected)?"pointer":"default"}}>
              {/* cell base */}
              <ellipse cx={x+30} cy={y+30} rx="26" ry="20"
                fill={v===-1?"url(#bact-obstacle)":(isDup?"url(#bact-cell-reach-dup)":"url(#bact-cell-empty)")}
                stroke={v===-1?"#000":isDup?myColor:isJump?myColor+"AA":"rgba(255,255,255,.1)"}
                strokeWidth={isDup?2.5:isJump?2:1}
                strokeDasharray={isJump?"4 3":""}
              >
                {isDup&&<animate attributeName="stroke-opacity" values="1;.4;1" dur="1.4s" repeatCount="indefinite"/>}
              </ellipse>

              {/* DUPLICATION preview: small bacteria ghost in the cell */}
              {isDup&&<g transform={`translate(${x+30},${y+30})`} opacity=".55" style={{pointerEvents:"none"}}>
                <path d={`M 0,-13 C 11,-13 13,-3 13,2 C 13,9 7,13 0,13 C -7,13 -13,9 -13,2 C -13,-3 -11,-13 0,-13 Z`}
                  fill={myPlayer===1?"url(#bact-green)":"url(#bact-purple)"}/>
                <text x="0" y="3" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fff" stroke="#000" strokeWidth=".4" style={{filter:"drop-shadow(0 1px 1px rgba(0,0,0,.5))"}}>+</text>
                <animate attributeName="opacity" values=".4;.7;.4" dur="1.4s" repeatCount="indefinite"/>
              </g>}

              {/* JUMP/TELEPORT indicator: empty dashed circle + arrow icon */}
              {isJump&&<g transform={`translate(${x+30},${y+30})`} opacity=".75" style={{pointerEvents:"none"}}>
                <circle r="10" fill="none" stroke={myColor} strokeWidth="1.5" strokeDasharray="2 2" opacity=".7"/>
                {/* teleport arrow ↯ */}
                <path d="M -4,-5 L 2,-2 L -1,0 L 4,5 L -2,2 L 1,0 Z" fill={myColor} opacity=".9"/>
                <animate attributeName="opacity" values=".5;.85;.5" dur="1.6s" repeatCount="indefinite"/>
              </g>}

              {/* obstacle hole shadow */}
              {v===-1&&<>
                <ellipse cx={x+30} cy={y+34} rx="22" ry="13" fill="#000" opacity=".7"/>
                <ellipse cx={x+30} cy={y+28} rx="20" ry="9" fill="#5C3317" opacity=".4"/>
              </>}
              {/* selected ring */}
              {isSelected&&<ellipse cx={x+30} cy={y+30} rx="32" ry="26" fill="none" stroke="#FFE082" strokeWidth="2.5" strokeDasharray="4 3"><animate attributeName="stroke-dashoffset" values="0;-14" dur="1s" repeatCount="indefinite"/></ellipse>}

              {/* Bacteria */}
              {(v===1||v===2)&&<g transform={`translate(${x+30},${y+30})`}>
                {/* shadow */}
                <ellipse cx="0" cy="20" rx="20" ry="4" fill="#000" opacity=".4"/>
                {/* body — droplet shape */}
                <path d={`M 0,-22 C 18,-22 22,-6 22,4 C 22,16 12,22 0,22 C -12,22 -22,16 -22,4 C -22,-6 -18,-22 0,-22 Z`}
                  fill={v===1?"url(#bact-green)":"url(#bact-purple)"}
                  stroke={v===1?"#0F5942":"#5B47A8"}
                  strokeWidth="1.5"
                  opacity={isConverting?0.85:1}>
                  {isPlacing&&<animate attributeName="opacity" values="0;1" dur=".25s" fill="freeze"/>}
                  {isPlacing&&<animateTransform attributeName="transform" type="scale" values="0;1.15;1" dur=".35s" fill="freeze"/>}
                  {isConverting&&<animateTransform attributeName="transform" type="scale" values="1;1.25;1" dur=".4s" fill="freeze"/>}
                </path>
                {/* shine */}
                <ellipse cx="-7" cy="-12" rx="6" ry="3" fill="rgba(255,255,255,.5)"/>
                {/* eyes */}
                <circle cx="-6" cy="-3" r="2.5" fill="#fff"/>
                <circle cx="6" cy="-3" r="2.5" fill="#fff"/>
                <circle cx="-5.5" cy="-2.5" r="1.4" fill="#1a1a1a"/>
                <circle cx="6.5" cy="-2.5" r="1.4" fill="#1a1a1a"/>
                <circle cx="-5" cy="-3" r=".5" fill="#fff"/>
                <circle cx="7" cy="-3" r=".5" fill="#fff"/>
                {/* smile */}
                <path d="M-5 6 Q 0 10 5 6" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </g>}
            </g>;
          }))}
        </svg>
      </div>
    </div>

    {/* Game end modal */}
    {gameEnd&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,padding:20}}>
      <div style={{background:"linear-gradient(180deg,rgba(20,15,40,.97),rgba(10,5,20,.97))",backdropFilter:"blur(14px)",border:`2px solid ${gameEnd.winner===myPlayer?BACT_GREEN:gameEnd.winner===null?"#FFD54F":"#EF5350"}`,borderRadius:20,padding:28,minWidth:280,maxWidth:"90vw",textAlign:"center",boxShadow:`0 20px 60px ${gameEnd.winner===myPlayer?BACT_GREEN+"40":"rgba(0,0,0,.6)"}`}}>
        <div style={{fontSize:64,marginBottom:8}}>{gameEnd.winner===null?"🤝":gameEnd.winner===myPlayer?"🏆":"💀"}</div>
        <div style={{fontSize:24,fontWeight:900,color:gameEnd.winner===myPlayer?BACT_GREEN:gameEnd.winner===null?"#FFD54F":"#EF5350",marginBottom:6,letterSpacing:-.5}}>{gameEnd.winner===null?"Match nul !":gameEnd.winner===myPlayer?"Victoire !":"Défaite"}</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginBottom:20}}>Score final · {gameEnd.green} vs {gameEnd.purple}</div>
        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          <button onClick={onBack} style={{padding:"11px 20px",borderRadius:11,border:"1px solid rgba(255,255,255,.15)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>Rejouer</button>
          <button onClick={onQuit} style={{padding:"11px 20px",borderRadius:11,border:"none",background:`linear-gradient(135deg,${BACT_GREEN},${BACT_PURPLE})`,color:"#fff",fontSize:13,fontWeight:900,cursor:"pointer"}}>Quitter</button>
        </div>
      </div>
    </div>}
  </div>;
}

function PlayerBadge({color,name,count,active,you}){
  return<div style={{flex:1,padding:"6px 10px",borderRadius:11,background:active?`${color}22`:"rgba(255,255,255,.04)",border:active?`1.5px solid ${color}`:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"center",gap:8,boxShadow:active?`0 0 16px ${color}66`:"none",transition:"all .2s",minWidth:0}}>
    <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${color},${color}80)`,boxShadow:`0 2px 8px ${color}80`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      <div style={{position:"absolute",top:5,left:7,width:6,height:3,borderRadius:"50%",background:"rgba(255,255,255,.5)"}}/>
    </div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:10,fontWeight:800,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}{you?" (toi)":""}</div>
      <div style={{fontSize:14,fontWeight:900,color}}>{count}</div>
    </div>
  </div>;
}

// ============================================================
// DIRECTORY (Annuaire — flat list, user-chosen color per contact)
// ============================================================
function DirectoryPanel({setPage,auth,th,toast,toastKey,flash}){
  const[contacts,setContacts]=useState([]);
  const[loading,setLoading]=useState(true);
  const[q,setQ]=useState("");
  const[showAdd,setShowAdd]=useState(false);
  const[selContact,setSelContact]=useState(null);
  const[editContact,setEditContact]=useState(null);

  const COLORS=["#4A90E2","#FF8F00","#AB47BC","#26A69A","#66BB6A","#EF5350","#FFD54F","#78909C"];

  useEffect(()=>{loadContacts();},[]);

  const loadContacts=async()=>{
    setLoading(true);
    try{
      const data=await dbGet("directory","order=name.asc");
      setContacts(data||[]);
    }catch(e){setContacts([]);}
    setLoading(false);
  };

  const addContact=async(data)=>{
    try{
      await dbPost("directory",{...data,author_code:auth.code,author_name:auth.name||auth.code});
      await loadContacts();
      setShowAdd(false);
      flash("Contact ajouté ✓");
    }catch(e){flash("Erreur: "+e.message);}
  };

  const saveEditContact=async(data)=>{
    try{
      await dbPatch("directory",data,`id=eq.${editContact.id}`);
      await loadContacts();
      setSelContact(c=>c?{...c,...data}:c);
      setEditContact(null);
      flash("Contact modifié ✓");
    }catch(e){flash("Erreur: "+e.message);}
  };

  const deleteContact=async(contact)=>{
    if(!await confirmDark(`Déplacer "${contact.name}" dans la corbeille ?`,{danger:true,hint:"Récupérable pendant 30 jours par l'admin",yesLabel:"Supprimer"}))return;
    try{
      await softDelete("contact",contact.id,contact,auth);
      setSelContact(null);
      await loadContacts();
      flash("Contact dans la corbeille");
    }catch(e){flash("Erreur: "+e.message);}
  };

  const filtered=contacts.filter(c=>!q||c.name?.toLowerCase().includes(q.toLowerCase())||c.role?.toLowerCase().includes(q.toLowerCase())||c.phone?.includes(q));

  const DARK_BG="linear-gradient(170deg,#0a2e24 0%,#0d1b2a 100%)";

  // DETAIL VIEW
  if(selContact){
    const color=selContact.color||"#4A90E2";
    return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",animation:"slideInRight .25s ease",color:"#fff"}}>
      <div style={{padding:"12px 14px",position:"relative"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,background:`radial-gradient(circle,${color}33,transparent 70%)`,filter:"blur(30px)",pointerEvents:"none"}}/>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          <button onClick={()=>setSelContact(null)} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
          <span style={{flex:1}}/>
          <button onClick={()=>setEditContact(selContact)} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button onClick={()=>deleteContact(selContact)} style={{background:"rgba(244,67,54,.15)",border:"1px solid rgba(244,67,54,.3)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#FF6B6B",cursor:"pointer"}}><I.Del/></button>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 14px"}}>
        <div style={{textAlign:"center",padding:"10px 0 20px",position:"relative"}}>
          <div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",width:140,height:140,background:`radial-gradient(circle,${color}66,transparent 70%)`,filter:"blur(35px)",pointerEvents:"none"}}/>
          <div style={{width:86,height:86,borderRadius:25,background:`linear-gradient(135deg,${color},${color}cc)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:34,color:"#fff",fontWeight:900,boxShadow:`0 8px 32px ${color}66, inset 0 1px 0 rgba(255,255,255,.3)`,position:"relative",zIndex:1}}>{selContact.name[0]?.toUpperCase()}</div>
          <div style={{fontSize:20,fontWeight:900,color:"#fff",position:"relative",zIndex:1}}>{selContact.name}</div>
          {selContact.role&&<div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginTop:3,position:"relative",zIndex:1}}>{selContact.role}</div>}
        </div>

        {/* Big call button + copy */}
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <a href={`tel:${selContact.phone}`} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"16px",borderRadius:14,background:"linear-gradient(135deg,#4CAF50,#43A047)",color:"#fff",textDecoration:"none",fontSize:14,fontWeight:800,boxShadow:"0 6px 20px rgba(76,175,80,.4)"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Appeler {selContact.phone}
          </a>
          <button onClick={async()=>{try{await navigator.clipboard.writeText(selContact.phone);flash("Numéro copié ✓");haptic(15);}catch(e){flash("Erreur copie");}}} style={{width:56,borderRadius:14,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>

        {selContact.email&&<a href={`mailto:${selContact.email}`} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px",borderRadius:12,background:"rgba(255,255,255,.06)",color:"#fff",textDecoration:"none",fontSize:12,fontWeight:700,marginBottom:12,border:"1px solid rgba(255,255,255,.1)"}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>
          {selContact.email}
        </a>}

        {selContact.notes&&<div style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:"12px 14px",border:`1px solid ${color}33`,borderLeft:`3px solid ${color}`,marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Notes</div>
          <div style={{fontSize:12,color:"#fff",lineHeight:1.5,whiteSpace:"pre-wrap"}}>{selContact.notes}</div>
        </div>}

        <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:4}}>
          <TechAvatar name={selContact.author_name} code={selContact.author_code} size={20} fontSize={9}/>
          <span style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>Ajouté par {selContact.author_name||selContact.author_code} · {new Date(selContact.created_at).toLocaleDateString("fr",{day:"2-digit",month:"2-digit",year:"numeric"})}</span>
        </div>
      </div>
      {editContact&&<ContactForm colors={COLORS} initial={editContact} onSave={saveEditContact} onCancel={()=>setEditContact(null)}/>}
      {toast&&<Toasty key={toastKey} m={toast}/>}
    </div>;
  }

  // LIST VIEW
  return<div style={{minHeight:"100vh",background:DARK_BG,display:"flex",flexDirection:"column",animation:"slideInRight .25s ease",color:"#fff"}}>
    <div style={{padding:"12px 14px",position:"relative",flexShrink:0}}>
      <div style={{position:"absolute",top:-20,right:-20,width:140,height:140,background:`radial-gradient(circle,${A}33,transparent 70%)`,filter:"blur(30px)",pointerEvents:"none"}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
        <button onClick={()=>setPage("home")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>
        <span style={{color:"#fff",fontSize:16,fontWeight:900,flex:1}}>Annuaire {contacts.length>0&&<span style={{fontSize:12,color:"rgba(255,255,255,.4)",fontWeight:500}}>· {contacts.length}</span>}</span>
        <button onClick={()=>setShowAdd(true)} style={{background:`linear-gradient(135deg,${P},${A})`,border:"none",borderRadius:9,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer",boxShadow:`0 4px 12px ${P}66`}}><I.Plus/></button>
      </div>
    </div>

    <div style={{padding:"0 14px 10px",flexShrink:0}}>
      <div style={{position:"relative"}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeLinecap="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un contact..." style={{width:"100%",padding:"9px 12px 9px 34px",borderRadius:10,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",fontSize:12,outline:"none",color:"#fff",fontFamily:"inherit"}}/>
      </div>
    </div>

    <div style={{flex:1,overflowY:"auto",padding:"4px 10px 10px"}}>
      {loading?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:30,color:"rgba(255,255,255,.5)",fontSize:12}}><div style={S.spin}/>Chargement...</div>:
       filtered.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:"rgba(255,255,255,.4)"}}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1.5" style={{marginBottom:10}}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <div style={{fontSize:13,fontWeight:700,marginBottom:4,color:"rgba(255,255,255,.6)"}}>{q?"Aucun résultat":"Aucun contact"}</div>
        <div style={{fontSize:11,marginBottom:14}}>{q?"Essaie un autre terme":"Ajoute le premier contact de l'annuaire"}</div>
        {!q&&<button onClick={()=>setShowAdd(true)} style={{padding:"8px 18px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${P},${A})`,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Créer un contact</button>}
      </div>:
      filtered.map((c,i)=>{
        const color=c.color||"#4A90E2";
        return<div key={c.id} onClick={()=>setSelContact(c)} style={{background:"rgba(255,255,255,.04)",borderRadius:12,padding:"12px 14px",marginBottom:6,border:"1px solid rgba(255,255,255,.06)",cursor:"pointer",display:"flex",alignItems:"center",gap:12,animation:`fadeUp .3s ease ${i*25}ms both`,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:color}}/>
          <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${color},${color}cc)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:17,flexShrink:0,boxShadow:`0 2px 8px ${color}55, inset 0 1px 0 rgba(255,255,255,.2)`}}>{c.name[0]?.toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:800,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:2}}>{c.name}</div>
            <div style={{fontSize:15,color,fontWeight:800,fontFamily:"monospace",letterSpacing:.3,marginBottom:c.role?2:0}}>{c.phone}</div>
            {c.role&&<div style={{fontSize:10,color:"rgba(255,255,255,.45)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.role}</div>}
          </div>
          <a href={`tel:${c.phone}`} onClick={e=>e.stopPropagation()} style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#4CAF50,#43A047)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",textDecoration:"none",flexShrink:0,boxShadow:"0 3px 10px rgba(76,175,80,.45)"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </a>
        </div>;
      })}
    </div>

    {showAdd&&<ContactForm colors={COLORS} onSave={addContact} onCancel={()=>setShowAdd(false)}/>}
    {editContact&&<ContactForm colors={COLORS} initial={editContact} onSave={saveEditContact} onCancel={()=>setEditContact(null)}/>}
    {toast&&<Toasty key={toastKey} m={toast}/>}
  </div>;
}

function ContactForm({colors,onSave,onCancel,initial}){
  const[name,setName]=useState(initial?.name||"");
  const[role,setRole]=useState(initial?.role||"");
  const[phone,setPhone]=useState(initial?.phone||"");
  const[email,setEmail]=useState(initial?.email||"");
  const[notes,setNotes]=useState(initial?.notes||"");
  const[color,setColor]=useState(initial?.color||colors[0]);
  const canSave=name.trim()&&phone.trim();
  const isEdit=!!initial;
  return<div style={S.ov} className="drv-ov" onClick={onCancel}>
    <div style={{...S.modal,maxHeight:"85vh"}} className="drv-modal" onClick={e=>e.stopPropagation()}>
      <div style={S.mH}><h2 style={{fontSize:16,fontWeight:800,margin:0}}>{isEdit?"Modifier contact":"Nouveau contact"}</h2><button style={S.iBtn} onClick={onCancel}><I.X/></button></div>
      <div style={S.mB}>
        <label style={S.fl}>Nom *</label>
        <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Supervision NOC Nuit" style={{...S.fi,marginBottom:10}}/>
        <label style={S.fl}>Fonction / Rôle</label>
        <input type="text" value={role} onChange={e=>setRole(e.target.value)} placeholder="Ex: Centre supervision 20h-6h" style={{...S.fi,marginBottom:10}}/>
        <label style={S.fl}>Téléphone *</label>
        <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+33 6 ..." style={{...S.fi,marginBottom:10,fontFamily:"monospace"}}/>
        <label style={S.fl}>Email (optionnel)</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="contact@exemple.fr" style={{...S.fi,marginBottom:10}}/>
        <label style={S.fl}>Couleur</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {colors.map(c=><button key={c} onClick={()=>setColor(c)} style={{width:38,height:38,borderRadius:10,background:`linear-gradient(135deg,${c},${c}cc)`,border:color===c?"3px solid #fff":"3px solid transparent",boxShadow:color===c?`0 0 0 2px ${c}, 0 4px 12px ${c}55`:`0 2px 6px ${c}33`,cursor:"pointer"}}/>)}
        </div>
        <label style={S.fl}>Notes (optionnel)</label>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Infos utiles, horaires, conseils..." style={{...S.fi,marginBottom:12,minHeight:70,resize:"vertical",fontFamily:"inherit"}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={{...S.canBtn,flex:1}}>Annuler</button>
          <button onClick={()=>canSave&&onSave({name:name.trim(),role:role.trim(),phone:phone.trim(),email:email.trim(),notes:notes.trim(),color})} disabled={!canSave} style={{...S.subBtn,flex:2,background:canSave?color:"#CCC",cursor:canSave?"pointer":"not-allowed"}}>{isEdit?"Modifier":"Enregistrer"}</button>
        </div>
      </div>
    </div>
  </div>;
}


function NotesRouter({page,setPage,auth,th,toast,toastKey,flash}){
  const[notebooks,setNotebooks]=useState([]);
  const[sections,setSections]=useState([]);
  const[notes,setNotes]=useState([]);
  const[selNotebook,setSelNotebook]=useState(null);
  const[selSection,setSelSection]=useState(null);
  const[selNote,setSelNote]=useState(null);
  const[comments,setComments]=useState([]);
  const[newComment,setNewComment]=useState("");
  const[editing,setEditing]=useState(false);
  const[loading,setLoading]=useState(true);
  const[showAddNotebook,setShowAddNotebook]=useState(false);
  const[showAddSection,setShowAddSection]=useState(false);
  const[showAddNote,setShowAddNote]=useState(false);

  const ICONS=[
    {k:"fork",svg:<><path d="M8 2v20M8 8c-2 0-4-2-4-4V2M8 8c2 0 4-2 4-4V2"/><path d="M16 2v20M16 8h2v5a2 2 0 0 1-2 2v0"/></>},
    {k:"parking",svg:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></>},
    {k:"bed",svg:<><path d="M2 20V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4h2a2 2 0 0 1 2 2v6"/><circle cx="6" cy="12" r="2"/></>},
    {k:"bulb",svg:<><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.8.7 1 1.3 1 2.3h6c0-1 .2-1.6 1-2.3A7 7 0 0 0 12 2z"/></>},
    {k:"phone",svg:<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></>},
    {k:"tool",svg:<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>},
    {k:"info",svg:<><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>},
    {k:"book",svg:<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>},
  ];
  const COLORS=["#E65100","#1565C0","#7B1FA2","#2E7D32","#C62828","#00838F","#F57C00","#5E35B1"];

  const NotebookIcon=({icon,color,size=22})=>{
    const ic=ICONS.find(i=>i.k===icon)||ICONS[7];
    return<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ic.svg}</svg>;
  };

  useEffect(()=>{loadNotebooks();},[]);
  useEffect(()=>{if(selNotebook)loadSections(selNotebook.id);},[selNotebook]);
  useEffect(()=>{if(selSection)loadNotes(selSection.id===-1?null:selSection.id,selSection.id===-1?selNotebook.id:null);},[selSection]);
  useEffect(()=>{if(selNote)loadComments(selNote.id);},[selNote]);

  const loadNotebooks=async()=>{setLoading(true);try{const data=await dbGet("notebooks","order=position.asc,name.asc");setNotebooks(data||[]);}catch(e){setNotebooks([]);}setLoading(false);};
  const loadSections=async(notebookId)=>{try{const data=await dbGet("note_sections",`notebook_id=eq.${notebookId}&order=position.asc,name.asc`);setSections(data||[]);}catch(e){setSections([]);}};
  const loadNotes=async(sectionId,notebookId)=>{try{const filter=sectionId?`section_id=eq.${sectionId}`:`notebook_id=eq.${notebookId}`;const data=await dbGet("notes_content",`${filter}&order=created_at.desc`);setNotes(data||[]);}catch(e){setNotes([]);}};
  const loadComments=async(noteId)=>{try{const data=await dbGet("note_comments",`note_id=eq.${noteId}&order=created_at.asc`);setComments(data||[]);}catch(e){setComments([]);}};

  const addNotebook=async(data)=>{try{await dbPost("notebooks",{...data,author_code:auth.code,author_name:auth.name||auth.code});await loadNotebooks();setShowAddNotebook(false);flash("Carnet créé ✓");}catch(e){flash("Erreur: "+e.message);}};
  const addSection=async(name)=>{try{await dbPost("note_sections",{notebook_id:selNotebook.id,name:name.trim()});await loadSections(selNotebook.id);setShowAddSection(false);flash("Section créée ✓");}catch(e){flash("Erreur: "+e.message);}};
  const addNote=async(data)=>{try{const payload={...data,notebook_id:selNotebook.id,section_id:selSection.id===-1?null:selSection.id,author_code:auth.code,author_name:auth.name||auth.code,votes:0};await dbPost("notes_content",payload);await loadNotes(selSection.id===-1?null:selSection.id,selSection.id===-1?selNotebook.id:null);setShowAddNote(false);flash("Note créée ✓");}catch(e){flash("Erreur: "+e.message);}};
  const addComment=async()=>{if(!newComment.trim())return;try{await dbPost("note_comments",{note_id:selNote.id,content:newComment.trim(),author_code:auth.code,author_name:auth.name||auth.code});setNewComment("");await loadComments(selNote.id);}catch(e){flash("Erreur: "+e.message);}};
  const voteNote=async()=>{try{const newVotes=(selNote.votes||0)+1;await dbPatch("notes_content",{votes:newVotes},`id=eq.${selNote.id}`);setSelNote({...selNote,votes:newVotes});flash("+1 vote");haptic(15);}catch(e){}};
  const deleteNotebook=async()=>{
    if(!await confirmDark(`Déplacer "${selNotebook.name}" dans la corbeille ?`,{danger:true,hint:"Le carnet et tout son contenu. Récupérable 30j par l'admin",yesLabel:"Supprimer"}))return;
    try{
      await softDelete("notebook",selNotebook.id,selNotebook,auth);
      setPage("notes");
      setSelNotebook(null);
      await loadNotebooks();
      flash("Carnet dans la corbeille");
    }catch(e){flash("Erreur: "+e.message);}
  };

  const BackHdr=({title,breadcrumb,onBack,actions,color})=><div style={{background:"linear-gradient(155deg,#071a12,#0a2e24,#0d1b2a)",padding:"12px 14px",flexShrink:0}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:breadcrumb?4:0}}>
      {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Back/></button>}
      <span style={{color:"#fff",fontSize:15,fontWeight:800,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</span>
      {actions}
    </div>
    {breadcrumb&&<div style={{fontSize:10,color:"rgba(255,255,255,.4)",paddingLeft:onBack?38:0,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{breadcrumb}</div>}
  </div>;

  // VIEW 1 — NOTEBOOKS LIST
  if(page==="notes"){
    return<div style={{minHeight:"100vh",background:th.bg||"#F7F7F8",display:"flex",flexDirection:"column",animation:"slideInRight .25s ease"}}>
      <BackHdr title="Notes" onBack={()=>setPage("home")} actions={
        <button onClick={()=>setShowAddNotebook(true)} style={{background:th.primary,border:"none",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Plus/></button>
      }/>
      <div style={{flex:1,overflowY:"auto",padding:12}}>
        {loading?<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:30,color:"#999",fontSize:12}}><div style={S.spin}/>Chargement...</div>:
         notebooks.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:"#999"}}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth="1.5" style={{marginBottom:10}}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Aucun carnet</div>
          <div style={{fontSize:11}}>Crée ton premier carnet pour partager des infos avec l'équipe</div>
          <button onClick={()=>setShowAddNotebook(true)} style={{marginTop:14,padding:"8px 18px",borderRadius:10,border:"none",background:th.primary,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Créer un carnet</button>
        </div>:<>
          <div style={{fontSize:10,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Carnets ({notebooks.length})</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {notebooks.map((n,i)=>
              <div key={n.id} onClick={()=>{setSelNotebook(n);setPage("notebook");}} style={{background:"#fff",borderRadius:14,padding:12,cursor:"pointer",border:"1px solid #F0F0F0",animation:`fadeUp .3s ease ${i*40}ms both`,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:0,left:0,bottom:0,width:4,background:n.color||"#999"}}/>
                <NotebookIcon icon={n.icon} color={n.color||"#999"} size={24}/>
                <div style={{fontSize:13,fontWeight:800,color:"#1A1A1A",marginTop:6,marginBottom:2}}>{n.name}</div>
                {n.description&&<div style={{fontSize:9,color:"#999",marginBottom:6,lineHeight:1.3,height:24,overflow:"hidden"}}>{n.description}</div>}
                <div style={{fontSize:9,color:n.color||"#999",fontWeight:700}}>{n.note_count||0} notes</div>
              </div>
            )}
            <div onClick={()=>setShowAddNotebook(true)} style={{background:"transparent",borderRadius:14,padding:12,cursor:"pointer",border:"2px dashed #DDD",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:110}}>
              <div style={{width:32,height:32,borderRadius:16,background:"#F5F5F5",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}><I.Plus/></div>
              <div style={{fontSize:10,fontWeight:700,color:"#999"}}>Nouveau carnet</div>
            </div>
          </div>
        </>}
      </div>
      {showAddNotebook&&<NotebookForm onSave={addNotebook} onCancel={()=>setShowAddNotebook(false)} icons={ICONS} colors={COLORS}/>}
      {toast&&<Toasty key={toastKey} m={toast}/>}
    </div>;
  }

  // VIEW 2 — NOTEBOOK OPEN (sections)
  if(page==="notebook"&&selNotebook){
    return<div style={{minHeight:"100vh",background:th.bg||"#F7F7F8",display:"flex",flexDirection:"column",animation:"slideInRight .25s ease"}}>
      <BackHdr title={selNotebook.name} breadcrumb={`Notes › ${selNotebook.name}`} onBack={()=>setPage("notes")} actions={
        <button onClick={()=>setShowAddSection(true)} style={{background:selNotebook.color,border:"none",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Plus/></button>
      }/>
      <div style={{flex:1,overflowY:"auto",padding:12}}>
        <div style={{background:`${selNotebook.color}15`,borderLeft:`3px solid ${selNotebook.color}`,borderRadius:"0 10px 10px 0",padding:"10px 12px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><NotebookIcon icon={selNotebook.icon} color={selNotebook.color} size={20}/><span style={{fontSize:11,fontWeight:700,color:selNotebook.color,textTransform:"uppercase",letterSpacing:.5}}>{selNotebook.name}</span></div>
          {selNotebook.description&&<div style={{fontSize:11,color:"#666"}}>{selNotebook.description}</div>}
        </div>
        <div onClick={()=>{setSelSection({id:-1,name:"Toutes les notes"});setPage("section");}} style={{background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:4,border:"1px solid #F0F0F0",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
          <div style={{width:26,height:26,borderRadius:7,background:"#F5F5F5",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></div>
          <span style={{fontSize:12,fontWeight:700,color:"#333",flex:1}}>Toutes les notes</span>
          <span style={{color:"#CCC",fontSize:14}}>›</span>
        </div>
        <div style={{fontSize:9,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:1,margin:"12px 0 6px"}}>Sections ({sections.length})</div>
        {sections.map((s,i)=>
          <div key={s.id} onClick={()=>{setSelSection(s);setPage("section");}} style={{background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:4,border:"1px solid #F0F0F0",display:"flex",alignItems:"center",gap:8,cursor:"pointer",animation:`fadeUp .3s ease ${i*40}ms both`}}>
            <div style={{width:4,height:28,borderRadius:2,background:selNotebook.color}}/>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:"#1A1A1A"}}>{s.name}</div></div>
            <span style={{color:"#CCC",fontSize:14}}>›</span>
          </div>
        )}
        <div onClick={()=>setShowAddSection(true)} style={{background:"transparent",borderRadius:10,padding:"10px 12px",border:"2px dashed #DDD",display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginTop:4}}>
          <div style={{width:4,height:28}}/><I.Plus/><span style={{fontSize:11,fontWeight:700,color:"#999"}}>Nouvelle section</span>
        </div>
        {auth.role==="admin"&&<button onClick={deleteNotebook} style={{marginTop:16,width:"100%",padding:10,borderRadius:10,border:"1px solid #FFCDD2",background:"#FFEBEE",color:"#D32F2F",fontSize:11,fontWeight:700,cursor:"pointer"}}>Supprimer le carnet</button>}
      </div>
      {showAddSection&&<SimpleInputDialog title="Nouvelle section" placeholder="Nom de la section" onSave={addSection} onCancel={()=>setShowAddSection(false)} color={selNotebook.color}/>}
      {toast&&<Toasty key={toastKey} m={toast}/>}
    </div>;
  }

  // VIEW 3 — SECTION (notes list)
  if(page==="section"&&selNotebook&&selSection){
    return<div style={{minHeight:"100vh",background:th.bg||"#F7F7F8",display:"flex",flexDirection:"column",animation:"slideInRight .25s ease"}}>
      <BackHdr title={selSection.name} breadcrumb={`${selNotebook.name} › ${selSection.name}`} onBack={()=>setPage("notebook")} actions={
        <button onClick={()=>setShowAddNote(true)} style={{background:selNotebook.color,border:"none",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",cursor:"pointer"}}><I.Plus/></button>
      }/>
      <div style={{flex:1,overflowY:"auto",padding:12}}>
        {notes.length===0?<div style={{textAlign:"center",padding:"30px 20px",color:"#999"}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:4}}>Aucune note</div>
          <div style={{fontSize:10,marginBottom:12}}>Ajoute la première note dans cette section</div>
          <button onClick={()=>setShowAddNote(true)} style={{padding:"8px 18px",borderRadius:10,border:"none",background:selNotebook.color,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Créer une note</button>
        </div>:notes.map((n,i)=>
          <div key={n.id} onClick={()=>{setSelNote(n);setPage("note");}} style={{background:"#fff",borderRadius:12,padding:"10px 12px",marginBottom:6,border:"1px solid #F0F0F0",cursor:"pointer",animation:`fadeUp .3s ease ${i*40}ms both`}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#1A1A1A"}}>{n.title}</span>
                  {n.lat&&n.lng&&<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={selNotebook.color} strokeWidth="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>}
                </div>
                <p style={{fontSize:11,color:"#666",margin:0,lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{n.content}</p>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <TechAvatar name={n.author_name} code={n.author_code} size={18} fontSize={8}/>
              <span style={{fontSize:9,color:"#999"}}>{n.author_name||n.author_code} · {new Date(n.created_at).toLocaleDateString("fr",{day:"2-digit",month:"2-digit"})}</span>
              {n.votes>0&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:3,background:"#FFF8E1",padding:"1px 6px",borderRadius:8}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#FFB300" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span style={{fontSize:9,fontWeight:800,color:"#FF8F00"}}>{n.votes}</span>
              </div>}
            </div>
          </div>
        )}
      </div>
      {showAddNote&&<NoteForm onSave={addNote} onCancel={()=>setShowAddNote(false)} color={selNotebook.color}/>}
      {toast&&<Toasty key={toastKey} m={toast}/>}
    </div>;
  }

  // VIEW 4 — NOTE DETAIL
  if(page==="note"&&selNote){
    return<div style={{minHeight:"100vh",background:th.bg||"#F7F7F8",display:"flex",flexDirection:"column",animation:"slideInRight .25s ease"}}>
      <BackHdr title="" breadcrumb={`${selNotebook.name} › ${selSection.name}`} onBack={()=>setPage("section")}/>
      <div style={{flex:1,overflowY:"auto",padding:14}}>
        <h2 style={{fontSize:20,fontWeight:900,color:"#1A1A1A",margin:"0 0 8px",lineHeight:1.2}}>{selNote.title}</h2>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          <TechAvatar name={selNote.author_name} code={selNote.author_code} size={22} fontSize={9}/>
          <span style={{fontSize:11,fontWeight:700,color:"#333"}}>{selNote.author_name||selNote.author_code}</span>
          <span style={{fontSize:10,color:"#999"}}>· {new Date(selNote.created_at).toLocaleDateString("fr",{day:"2-digit",month:"2-digit",year:"numeric"})}</span>
        </div>
        <div style={{background:"#fff",borderRadius:12,padding:14,border:"1px solid #F0F0F0",marginBottom:10}}>
          <p style={{fontSize:13,color:"#333",margin:0,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{selNote.content}</p>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <button onClick={voteNote} style={{flex:1,padding:"10px",borderRadius:10,border:"1.5px solid #E8E8E8",background:"#fff",color:"#FF8F00",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB300" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            {selNote.votes||0} Votes
          </button>
          {selNote.lat&&selNote.lng&&<a href={`https://waze.com/ul?ll=${selNote.lat},${selNote.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:"#33CCFF",color:"#fff",fontSize:11,fontWeight:700,textAlign:"center",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>Waze</a>}
        </div>
        <div style={{fontSize:9,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Commentaires ({comments.length})</div>
        {comments.map(c=>
          <div key={c.id} style={{background:"#fff",borderRadius:10,padding:"8px 10px",marginBottom:5,border:"1px solid #F0F0F0"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <TechAvatar name={c.author_name} code={c.author_code} size={18} fontSize={8}/>
              <span style={{fontSize:10,fontWeight:700,color:selNotebook.color}}>{c.author_name||c.author_code}</span>
              <span style={{fontSize:8,color:"#BBB",marginLeft:"auto"}}>{new Date(c.created_at).toLocaleDateString("fr",{day:"2-digit",month:"2-digit"})}</span>
            </div>
            <p style={{fontSize:11,color:"#333",margin:0,lineHeight:1.4}}>{c.content}</p>
          </div>
        )}
        <div style={{display:"flex",gap:6,marginTop:8}}>
          <input type="text" value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addComment()} placeholder="Ajouter un commentaire..." style={{flex:1,padding:"8px 10px",borderRadius:8,border:"1px solid #E8E8E8",fontSize:11,outline:"none"}}/>
          <button onClick={addComment} style={{padding:"8px 14px",borderRadius:8,border:"none",background:selNotebook.color,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>OK</button>
        </div>
      </div>
      {toast&&<Toasty key={toastKey} m={toast}/>}
    </div>;
  }

  return null;
}

// Notebook creation form
function NotebookForm({onSave,onCancel,icons,colors}){
  const[name,setName]=useState("");
  const[desc,setDesc]=useState("");
  const[icon,setIcon]=useState("book");
  const[color,setColor]=useState(colors[0]);
  return<div style={S.ov} className="drv-ov" onClick={onCancel}>
    <div style={{...S.modal,maxHeight:"80vh"}} className="drv-modal" onClick={e=>e.stopPropagation()}>
      <div style={S.mH}><h2 style={{fontSize:16,fontWeight:800,margin:0}}>Nouveau carnet</h2><button style={S.iBtn} onClick={onCancel}><I.X/></button></div>
      <div style={S.mB}>
        <label style={S.fl}>Nom</label>
        <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Bons plans restauration" style={{...S.fi,marginBottom:10}}/>
        <label style={S.fl}>Description (optionnel)</label>
        <input type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="À quoi sert ce carnet" style={{...S.fi,marginBottom:10}}/>
        <label style={S.fl}>Icône</label>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
          {icons.map(i=>{const ic=i.svg;return<button key={i.k} onClick={()=>setIcon(i.k)} style={{width:40,height:40,borderRadius:10,border:icon===i.k?`2px solid ${color}`:"2px solid #E8E8E8",background:icon===i.k?`${color}15`:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={icon===i.k?color:"#666"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ic}</svg></button>})}
        </div>
        <label style={S.fl}>Couleur</label>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
          {colors.map(c=><button key={c} onClick={()=>setColor(c)} style={{width:36,height:36,borderRadius:10,background:c,border:color===c?"3px solid #fff":"3px solid transparent",boxShadow:color===c?`0 0 0 2px ${c}`:"none",cursor:"pointer"}}/>)}
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={onCancel} style={{...S.canBtn,flex:1}}>Annuler</button>
          <button onClick={()=>name.trim()&&onSave({name:name.trim(),description:desc.trim(),icon,color})} style={{...S.subBtn,flex:2,background:color}}>Créer</button>
        </div>
      </div>
    </div>
  </div>;
}

function SimpleInputDialog({title,placeholder,onSave,onCancel,color=P}){
  const[v,setV]=useState("");
  return<div style={S.ov} className="drv-ov" onClick={onCancel}>
    <div style={{...S.modal}} className="drv-modal" onClick={e=>e.stopPropagation()}>
      <div style={S.mH}><h2 style={{fontSize:16,fontWeight:800,margin:0}}>{title}</h2><button style={S.iBtn} onClick={onCancel}><I.X/></button></div>
      <div style={S.mB}>
        <input type="text" value={v} onChange={e=>setV(e.target.value)} placeholder={placeholder} style={{...S.fi,marginBottom:10}} autoFocus/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={{...S.canBtn,flex:1}}>Annuler</button>
          <button onClick={()=>v.trim()&&onSave(v)} style={{...S.subBtn,flex:2,background:color}}>Créer</button>
        </div>
      </div>
    </div>
  </div>;
}

function NoteForm({onSave,onCancel,color=P}){
  const[title,setTitle]=useState("");
  const[content,setContent]=useState("");
  const[useGps,setUseGps]=useState(false);
  const[gps,setGps]=useState(null);
  const captureGps=()=>{if(!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(p=>{setGps({lat:p.coords.latitude,lng:p.coords.longitude});setUseGps(true);},()=>{});};
  return<div style={S.ov} className="drv-ov" onClick={onCancel}>
    <div style={{...S.modal,maxHeight:"85vh"}} className="drv-modal" onClick={e=>e.stopPropagation()}>
      <div style={S.mH}><h2 style={{fontSize:16,fontWeight:800,margin:0}}>Nouvelle note</h2><button style={S.iBtn} onClick={onCancel}><I.X/></button></div>
      <div style={S.mB}>
        <label style={S.fl}>Titre</label>
        <input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex: Boulangerie Paul — Gare Mulhouse" style={{...S.fi,marginBottom:10}}/>
        <label style={S.fl}>Contenu</label>
        <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Détails, horaires, prix, astuces..." style={{...S.fi,minHeight:120,resize:"vertical",fontFamily:"inherit",marginBottom:10}}/>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:12}}>
          <input type="checkbox" checked={useGps} onChange={e=>{if(e.target.checked)captureGps();else{setUseGps(false);setGps(null);}}}/>
          <span style={{fontSize:12,fontWeight:600,color:"#333"}}>Ajouter ma position GPS</span>
          {gps&&<span style={{fontSize:9,color:"#999",fontFamily:"monospace"}}>{gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}</span>}
        </label>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={{...S.canBtn,flex:1}}>Annuler</button>
          <button onClick={()=>title.trim()&&content.trim()&&onSave({title:title.trim(),content:content.trim(),lat:gps?.lat,lng:gps?.lng})} style={{...S.subBtn,flex:2,background:color}}>Publier</button>
        </div>
      </div>
    </div>
  </div>;
}

// ============================================================
// ANNOUNCEMENTS PANEL
// ============================================================
function AnnouncementsPanel({auth}){
  const[annonces,setAnnonces]=useState([]);
  const[msg,setMsg]=useState("");
  const[expiry,setExpiry]=useState(3);
  const[loading,setLoading]=useState(true);
  const[posting,setPosting]=useState(false);

  useEffect(()=>{loadAnnonces();},[]);

  const loadAnnonces=async()=>{
    setLoading(true);
    try{
      const data=await dbGet("announcements","order=created_at.desc&limit=20");
      setAnnonces(data||[]);
    }catch(e){
      // Table might not exist yet — show empty
      setAnnonces([]);
    }
    setLoading(false);
  };

  const postAnnonce=async()=>{
    if(!msg.trim())return;
    setPosting(true);
    try{
      const expiresAt=new Date();expiresAt.setDate(expiresAt.getDate()+expiry);
      await dbPost("announcements",{message:msg.trim(),author_code:auth.code,author_name:auth.name||auth.code,expires_at:expiresAt.toISOString()});
      setMsg("");
      await loadAnnonces();
    }catch(e){}
    setPosting(false);
  };

  const deleteAnnonce=async(id)=>{
    try{await dbDel("announcements",`id=eq.${id}`);setAnnonces(annonces.filter(a=>a.id!==id));}catch(e){}
  };

  const isExpired=a=>a.expires_at&&new Date(a.expires_at)<new Date();
  const active=annonces.filter(a=>!isExpired(a));
  const expired=annonces.filter(a=>isExpired(a));

  return<>
    {/* Create new */}
    <Card>
      <h3 style={S.sec}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={P} strokeWidth="2" strokeLinecap="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg> Nouvelle annonce</h3>
      <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Écrire un message pour l'équipe..." style={{width:"100%",height:70,border:"1px solid #E8E8E8",borderRadius:10,padding:"10px 12px",fontSize:12,resize:"none",outline:"none",fontFamily:"inherit",marginBottom:8}}/>
      <div style={{display:"flex",gap:6}}>
        <div style={{flex:1,display:"flex",gap:4}}>
          {[1,3,7,30].map(d=><button key={d} onClick={()=>setExpiry(d)} style={{flex:1,padding:"6px",borderRadius:8,border:expiry===d?`1.5px solid ${P}`:"1.5px solid #E8E8E8",background:expiry===d?`${P}10`:"#fff",fontSize:10,fontWeight:700,color:expiry===d?P:"#999",cursor:"pointer"}}>{d}j</button>)}
        </div>
        <button onClick={postAnnonce} disabled={posting||!msg.trim()} style={{padding:"6px 16px",borderRadius:8,border:"none",background:posting||!msg.trim()?"#CCC":P,color:"#fff",fontSize:12,fontWeight:700,cursor:posting?"wait":"pointer"}}>Publier</button>
      </div>
    </Card>

    {/* Active announcements */}
    {active.length>0&&<>
      <h3 style={{...S.sec,marginTop:12}}>Actives ({active.length})</h3>
      {active.map(a=>{
        const ago=((Date.now()-new Date(a.created_at).getTime())<3600000?Math.round((Date.now()-new Date(a.created_at).getTime())/60000)+" min":(Date.now()-new Date(a.created_at).getTime())<86400000?Math.round((Date.now()-new Date(a.created_at).getTime())/3600000)+"h":Math.round((Date.now()-new Date(a.created_at).getTime())/86400000)+"j");
        const daysLeft=a.expires_at?Math.max(0,Math.ceil((new Date(a.expires_at)-new Date())/86400000)):null;
        return<Card key={a.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <p style={{fontSize:13,fontWeight:500,color:"#333",margin:0,lineHeight:1.5,flex:1}}>{a.message}</p>
            <button onClick={()=>deleteAnnonce(a.id)} style={{background:"none",border:"none",color:"#CCC",fontSize:14,cursor:"pointer",marginLeft:8,flexShrink:0}}>×</button>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
            <span style={{fontSize:9,color:"#999"}}>{a.author_name||a.author_code} · il y a {ago}</span>
            {daysLeft!==null&&<span style={{fontSize:8,fontWeight:600,color:daysLeft<=1?"#E65100":"#999",background:daysLeft<=1?"#FFF3E0":"#F5F5F5",padding:"2px 6px",borderRadius:4}}>Expire dans {daysLeft}j</span>}
          </div>
        </Card>;
      })}
    </>}

    {/* Expired */}
    {expired.length>0&&<>
      <h3 style={{...S.sec,marginTop:12,color:"#CCC"}}>Expirées ({expired.length})</h3>
      {expired.slice(0,5).map(a=>
        <div key={a.id} style={{background:"#fff",borderRadius:10,padding:"8px 12px",marginBottom:4,border:"1px solid #F0F0F0",opacity:.5}}>
          <p style={{fontSize:11,color:"#999",margin:0,lineHeight:1.4}}>{a.message}</p>
          <span style={{fontSize:8,color:"#CCC"}}>{a.author_name||a.author_code} · {new Date(a.created_at).toLocaleDateString("fr",{day:"2-digit",month:"2-digit"})}</span>
        </div>
      )}
    </>}

    {annonces.length===0&&!loading&&<div style={{textAlign:"center",padding:"30px 20px",color:"#CCC"}}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth="1.5" style={{marginBottom:8}}><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>
      <p style={{fontSize:13,fontWeight:600}}>Aucune annonce</p>
      <p style={{fontSize:11}}>Publie un message pour toute l'équipe</p>
    </div>}
  </>;
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
        dbGet("sites","select=id,name,type,lat,lng,address,code_nidt,needs_4x4,needs_binome,needs_terrasse,anfr_support_id,technologies&order=name.asc"),
        dbGet("technicians","order=code.asc"),
        dbGet("visits","order=visited_at.desc&limit=500"),
        dbGet("login_logs","order=created_at.desc&limit=200"),
        dbGet("activity_log","order=created_at.desc&limit=50"),
      ]);
      setSites(s);setTechs(t);setVisits(v);setLogs(l);setActivity(a);
    }catch(e){}
    setLoading(false);
  };

  const gpsCount=sites.filter(s=>s.lat&&s.lng&&!(s.lat===0&&s.lng===0)).length;
  const anfrCount=sites.filter(s=>s.anfr_support_id).length;
  const mobileSites=sites.filter(s=>s.type==="mobile");
  const fixeSites=sites.filter(s=>s.type==="fixe");
  const poiSites=sites.filter(s=>s.type==="poi");
  const sites4x4=sites.filter(s=>s.needs_4x4).length;
  const sitesTer=sites.filter(s=>s.needs_terrasse).length;
  const sitesBin=sites.filter(s=>s.needs_binome).length;
  const thisMonth=visits.filter(v=>{const d=new Date(v.visited_at);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();});

  // Techno distribution
  const techStats=useMemo(()=>{
    const m={};
    sites.forEach(s=>(s.technologies||[]).forEach(t=>{m[t]=(m[t]||0)+1;}));
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[sites]);

  // Sites without visit in 30 days
  const staleCount=useMemo(()=>{
    const cutoff=Date.now()-30*24*3600*1000;
    const lastVisit={};
    visits.forEach(v=>{const d=new Date(v.visited_at).getTime();if(!lastVisit[v.site_id]||d>lastVisit[v.site_id])lastVisit[v.site_id]=d;});
    return mobileSites.filter(s=>!lastVisit[s.id]||lastVisit[s.id]<cutoff).length;
  },[mobileSites,visits]);

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
      {[["dash","Dashboard"],["annonces","Annonces"],["stats","Stats"],["team","Équipe"],["techs","Techniciens"],["sites","Sites"],["duplicates","Doublons"],["logs","Logs"],["trash","Corbeille"],["health","Santé"],["backup","Backup"]].map(([k,l])=>
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

        {/* Second row of stat cards */}
        <div className="drv-admin-stats" style={{marginBottom:12}}>
          {[[anfrCount,"ANFR matchés","#F3E5F5","#7B1FA2"],[sites4x4,"Sites 4x4","#FBE9E7","#BF360C"],[sitesTer,"Terrasse","#E3F2FD","#1565C0"],[staleCount,"Sans visite 30j","#FFF3E0","#E65100"]].map(([val,label,bg,color],i)=>
            <div key={i} style={{background:bg,borderRadius:12,padding:"14px 12px",textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:800,color}}>{val}</div>
              <div style={{fontSize:10,color,fontWeight:600,marginTop:2}}>{label}</div>
            </div>
          )}
        </div>

        <div className="drv-admin-body">
        {/* GPS Completion Tracker — Enhanced */}
        <div className="drv-full"><Card>
          <h3 style={S.sec}>Complétion GPS</h3>
          {(()=>{const noGps=sites.length-gpsCount;const pct=sites.length?Math.round(gpsCount/sites.length*100):0;
            const mGps=mobileSites.filter(s=>s.lat&&s.lng&&!(s.lat===0&&s.lng===0)).length;
            const fGps=fixeSites.filter(s=>s.lat&&s.lng&&!(s.lat===0&&s.lng===0)).length;
            const pGps=poiSites.filter(s=>s.lat&&s.lng&&!(s.lat===0&&s.lng===0)).length;
            return<>
            {/* Big countdown number */}
            <div style={{textAlign:"center",margin:"8px 0 12px"}}>
              <div style={{fontSize:48,fontWeight:900,color:noGps>50?"#FF7900":noGps>10?"#E65100":"#4CAF50",lineHeight:1}}>{noGps}</div>
              <div style={{fontSize:11,color:"#999",marginTop:2}}>sites sans GPS sur {sites.length}</div>
            </div>
            {/* Main progress bar */}
            <div style={{height:10,borderRadius:5,background:"#E8E8E8",overflow:"hidden",marginBottom:4}}>
              <div style={{height:"100%",borderRadius:5,background:`linear-gradient(90deg,${P},#4ECDC4)`,width:`${pct}%`,transition:"width 1s ease"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#999",marginBottom:10}}>
              <span>{gpsCount} renseignés</span><span style={{fontWeight:700,color:P}}>{pct}%</span>
            </div>
            {/* Per type */}
            {[[`Mobile`,mGps,mobileSites.length,P],[`Fixe`,fGps,fixeSites.length,"#E65100"],[`POI`,pGps,poiSites.length,"#FF8F00"]].map(([type,done,total,color])=>{
              const p=total?Math.round(done/total*100):0;const rest=total-done;
              return<div key={type} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                <div style={{width:8,height:8,borderRadius:4,background:color,flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:600,width:45}}>{type}</span>
                <div style={{flex:1,height:6,borderRadius:3,background:"#F0F0F0",overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,background:color,width:`${p}%`}}/></div>
                <span style={{fontSize:10,fontWeight:700,color,width:32,textAlign:"right"}}>{done}/{total}</span>
                {rest>0&&<span style={{fontSize:8,color:"#E65100",fontWeight:600,width:40,textAlign:"right"}}>{rest} rest.</span>}
                {rest===0&&<span style={{fontSize:8,color:"#4CAF50",fontWeight:600,width:40,textAlign:"right"}}>Complet</span>}
              </div>;
            })}
            {/* Objective */}
            {noGps>0&&<div style={{marginTop:8,padding:"6px 10px",background:noGps<=50?"#E8F5E9":"#FFF8E1",borderRadius:8,textAlign:"center"}}>
              <span style={{fontSize:10,fontWeight:700,color:noGps<=50?"#2E7D32":"#E65100"}}>{noGps<=10?"Presque fini ! Plus que "+noGps+" !":noGps<=50?"Objectif atteint : sous les 50 ! Continue !":"Prochain objectif : passer sous 50 (encore "+(noGps-50)+")"}</span>
            </div>}
          </>;})()}
        </Card></div>

        {/* ANFR match progress */}
        <div className="drv-full"><Card>
          <h3 style={S.sec}>Correspondance ANFR</h3>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
            <span style={{color:"#666"}}>{anfrCount}/{mobileSites.length} sites mobile</span>
            <span style={{fontWeight:700,color:"#7B1FA2"}}>{mobileSites.length?Math.round(anfrCount/mobileSites.length*100):0}%</span>
          </div>
          <div style={{height:10,borderRadius:5,background:"#E8E8E8",overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:5,background:"linear-gradient(90deg,#9C27B0,#CE93D8)",width:`${mobileSites.length?anfrCount/mobileSites.length*100:0}%`,transition:"width 1s ease"}}/>
          </div>
        </Card></div>

        {/* Techno distribution */}
        <Card>
          <h3 style={S.sec}>Technologies déployées</h3>
          {techStats.map(([tech,count])=>{const pct=sites.length?Math.round(count/sites.length*100):0;return<div key={tech} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
            <span style={{fontSize:12,fontWeight:600,width:42}}>{tech}</span>
            <div style={{flex:1,height:8,borderRadius:4,background:"#F0F0F0",overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:4,background:tech.includes("5G")?"#9C27B0":tech.includes("4G")||tech.includes("LTE")?"#1B8A6B":tech.includes("3G")?"#2196F3":tech.includes("2G")?"#FF9800":tech.includes("FH")?"#78909C":"#666",width:`${pct}%`,transition:"width .5s"}}/>
            </div>
            <span style={{fontSize:11,color:"#999",width:30,textAlign:"right"}}>{count}</span>
          </div>;})}
        </Card>

        {/* Terrain constraints */}
        <Card>
          <h3 style={S.sec}>Contraintes terrain</h3>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1,textAlign:"center",padding:10,background:"#FBE9E7",borderRadius:10}}>
              <div style={{fontSize:22,fontWeight:800,color:"#BF360C"}}>{sites4x4}</div>
              <div style={{fontSize:9,fontWeight:600,color:"#E64A19"}}>4x4</div>
            </div>
            <div style={{flex:1,textAlign:"center",padding:10,background:"#E3F2FD",borderRadius:10}}>
              <div style={{fontSize:22,fontWeight:800,color:"#1565C0"}}>{sitesTer}</div>
              <div style={{fontSize:9,fontWeight:600,color:"#1976D2"}}>Terrasse</div>
            </div>
            <div style={{flex:1,textAlign:"center",padding:10,background:"#FFF8E1",borderRadius:10}}>
              <div style={{fontSize:22,fontWeight:800,color:"#FF8F00"}}>{sitesBin}</div>
              <div style={{fontSize:9,fontWeight:600,color:"#FFA000"}}>Binôme</div>
            </div>
          </div>
        </Card>

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
            <div style={{width:80,height:80,borderRadius:40,background:`conic-gradient(${P} 0% ${sites.length?mobileSites.length/sites.length*100:33}%, #2E86C1 ${sites.length?mobileSites.length/sites.length*100:33}% ${sites.length?(mobileSites.length+fixeSites.length)/sites.length*100:66}%, #E67E22 ${sites.length?(mobileSites.length+fixeSites.length)/sites.length*100:66}% 100%)`,position:"relative"}}>
              <div style={{position:"absolute",inset:12,borderRadius:40,background:"#fff"}}/>
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <div style={{width:10,height:10,borderRadius:2,background:P}}/><span style={{fontSize:12,fontWeight:600}}>{mobileSites.length}</span><span style={{fontSize:11,color:"#999"}}>Mobile</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <div style={{width:10,height:10,borderRadius:2,background:"#2E86C1"}}/><span style={{fontSize:12,fontWeight:600}}>{fixeSites.length}</span><span style={{fontSize:11,color:"#999"}}>Fixe</span>
              </div>
              {poiSites.length>0&&<div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:2,background:"#E67E22"}}/><span style={{fontSize:12,fontWeight:600}}>{poiSites.length}</span><span style={{fontSize:11,color:"#999"}}>POI</span>
              </div>}
            </div>
          </div>
        </Card>

        {/* Top techs (#5) */}
        <Card>
          <h3 style={S.sec}>Top techniciens ce mois</h3>
          {topTechs.length===0?<p style={{color:"#CCC",fontSize:13}}>Aucune visite</p>:
          topTechs.map(([code,count],i)=><div key={code} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid #F5F5F5"}}>
            <span style={{width:20,height:20,borderRadius:10,background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#E8E8E8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:i<3?"#fff":"#999"}}>{i+1}</span>
            <TechAvatar code={code} size={22} fontSize={9}/>
            <span style={{flex:1,fontSize:13,fontWeight:600}}>{code}</span>
            <span style={{fontSize:13,fontWeight:700,color:P}}>{count} visites</span>
          </div>)}
        </Card>

        {/* Live timeline (#7) */}
        <div className="drv-full"><Card>
          <h3 style={S.sec}><I.Act/> Activité récente</h3>
          {activity.slice(0,10).map(a=>{const ac=ACT_CFG[a.action]||ACT_CFG.edit;const fields=a.action==="edit"?parseActFields(a.details):null;const site=sites.find(s=>s.id===a.site_id);return<div key={a.id} style={{background:"#fff",borderRadius:10,borderLeft:`3px solid ${ac.dot}`,padding:"8px 10px",marginBottom:5}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <TechAvatar code={a.technician_code} size={20} fontSize={7}/>
                <span style={{fontSize:10,fontWeight:700,color:"#1A1A1A"}}>{techs.find(t=>t.code===a.technician_code)?.name||a.technician_code}</span>
                <span style={{fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:5,background:ac.bg,color:ac.color}}>{ac.label}</span>
              </div>
              <span style={{fontSize:8,color:"#CCC"}}>{new Date(a.created_at).toLocaleString("fr",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
            </div>
            <div style={{fontSize:12,fontWeight:800,color:ac.color}}>{site?.name||"Site inconnu"}</div>
            {fields&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:3}}>{fields.map((f,j)=><span key={j} style={{fontSize:8,fontWeight:600,padding:"2px 6px",borderRadius:5,background:"#F5F5F5",color:"#666"}}>{f}</span>)}</div>}
            {a.action==="comment"&&a.details&&<p style={{fontSize:10,color:"#666",margin:"3px 0 0",lineHeight:1.4,borderLeft:"2px solid #C8E6C9",paddingLeft:8}}>"{a.details.slice(0,65)}{a.details.length>65?"...":""}"</p>}
            {a.action==="photo"&&<span style={{fontSize:10,color:"#999"}}>Photo ajoutée</span>}
            {a.action==="create"&&<span style={{fontSize:10,color:ac.color,fontWeight:600}}>Site créé</span>}
          </div>})}
        </Card></div>
        </div>{/* end drv-admin-body */}
      </>}

      {/* STATS — Top 10 + Audit + API */}
      {tab==="stats"&&<StatsPanel sites={sites} visits={visits} activity={activity} techs={techs}/>}
      {tab==="team"&&<TeamStatsPanel sites={sites} techs={techs} flash={flash}/>}

      {/* ANNONCES */}
      {tab==="annonces"&&<AnnouncementsPanel auth={auth}/>}

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


      {/* TRASH */}
      {tab==="trash"&&<TrashPanel auth={auth} flash={flash}/>}

      {/* DUPLICATES */}
      {tab==="duplicates"&&<DuplicatesPanel sites={sites} reload={loadAll} flash={flash} auth={auth}/>}

      {/* HEALTH */}
      {tab==="health"&&<HealthPanel sites={sites} techs={techs}/>}

      {/* BACKUP */}
      {tab==="backup"&&<BackupPanel/>}
    </div>
  </>;
}


// ============================================================
// HEALTH & MONITORING PANEL
// ============================================================
function HealthPanel({sites,techs}){
  const[checks,setChecks]=useState({});
  const[checking,setChecking]=useState(false);
  const[perf,setPerf]=useState({});
  const[anomalies,setAnomalies]=useState([]);

  useEffect(()=>{detectAnomalies();},[sites]);

  // Data anomaly detection (#188)
  const detectAnomalies=()=>{
    const issues=[];
    sites.forEach(s=>{
      if(!s.lat||!s.lng||(s.lat===0&&s.lng===0))issues.push({type:"gps_missing",site:s.name,id:s.id,msg:"GPS manquant (0,0)",severity:"warning"});
      if(s.lat&&(s.lat<46.5||s.lat>49.5))issues.push({type:"gps_outlier",site:s.name,id:s.id,msg:`Lat ${s.lat?.toFixed(2)} hors Alsace`,severity:"error"});
      if(s.lng&&(s.lng<5.5||s.lng>8.5))issues.push({type:"gps_outlier",site:s.name,id:s.id,msg:`Lng ${s.lng?.toFixed(2)} hors Alsace`,severity:"error"});
      if(!s.name||s.name.trim().length<2)issues.push({type:"name_empty",site:s.name||"(vide)",id:s.id,msg:"Nom vide ou trop court",severity:"warning"});
      if(s.type==="mobile"&&(!s.technologies||s.technologies.length===0))issues.push({type:"no_tech",site:s.name,id:s.id,msg:"Aucune technologie renseignée",severity:"info"});
    });
    // Duplicates check (same name or same GPS within 10m)
    for(let i=0;i<sites.length;i++){
      for(let j=i+1;j<sites.length;j++){
        if(sites[i].name&&sites[j].name&&sites[i].name.toLowerCase()===sites[j].name.toLowerCase()){
          issues.push({type:"duplicate_name",site:sites[i].name,id:sites[i].id,msg:`Doublon de nom avec ID ${sites[j].id}`,severity:"warning"});
        }
      }
    }
    setAnomalies(issues);
  };

  // API health check (#191)
  const runHealthChecks=async()=>{
    setChecking(true);const results={};const timings={};
    // Supabase
    try{
      const t0=performance.now();
      const r=await fetch(`${SB}/rest/v1/sites?select=id&limit=1`,{headers:{...H,Accept:"application/json"}});
      timings.supabase=Math.round(performance.now()-t0);
      results.supabase=r.ok?"ok":"error";
    }catch(e){results.supabase="offline";timings.supabase=null;}
    // Edge Function
    try{
      const t0=performance.now();
      const r=await fetch(`${SB}/functions/v1/fuel-prices?deps=67`,{headers:{"apikey":SK,"Authorization":`Bearer ${SK}`}});
      timings.edge_fn=Math.round(performance.now()-t0);
      results.edge_fn=r.ok?"ok":"error";
    }catch(e){results.edge_fn="offline";timings.edge_fn=null;}
    // Open-Meteo
    try{
      const t0=performance.now();
      const r=await fetch("https://api.open-meteo.com/v1/forecast?latitude=48.5&longitude=7.5&current=temperature_2m&timezone=auto");
      timings.meteo=Math.round(performance.now()-t0);
      results.meteo=r.ok?"ok":"error";
    }catch(e){results.meteo="offline";timings.meteo=null;}
    // Nominatim
    try{
      const t0=performance.now();
      const r=await fetch("https://nominatim.openstreetmap.org/status.php?format=json");
      timings.nominatim=Math.round(performance.now()-t0);
      results.nominatim=r.ok?"ok":"error";
    }catch(e){results.nominatim="offline";timings.nominatim=null;}
    setChecks(results);setPerf(timings);setChecking(false);
  };

  const statusColor=s=>s==="ok"?"#1B8A6B":s==="error"?"#E74C3C":"#999";
  const statusIcon=s=>s==="ok"?"✅":s==="error"?"❌":"⏳";
  const sevColor=s=>s==="error"?"#E74C3C":s==="warning"?"#E67E22":"#2196F3";
  const sevIcon=s=>s==="error"?"🔴":s==="warning"?"🟡":"🔵";

  return<>
    {/* API Health */}
    <Card>
      <h3 style={S.sec}><I.Act/> Santé des APIs</h3>
      <button onClick={runHealthChecks} disabled={checking} style={{...S.subBtn,width:"100%",marginBottom:12,opacity:checking?.6:1}}>{checking?<><div style={S.spin}/> Test en cours...</>:<><I.Ref/> Lancer le diagnostic</>}</button>
      {Object.keys(checks).length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
        {[["supabase","Supabase (BDD)"],["edge_fn","Edge Function (Carburant)"],["meteo","Open-Meteo (Météo)"],["nominatim","Nominatim (Géocodage)"]].map(([k,label])=>
          <div key={k} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:checks[k]==="ok"?"#E8F8F5":"#FFF5F5",border:`1px solid ${checks[k]==="ok"?"#B2DFDB":"#FFCDD2"}`}}>
            <span style={{fontSize:18}}>{statusIcon(checks[k])}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:statusColor(checks[k])}}>{label}</div>
              {perf[k]!=null&&<div style={{fontSize:10,color:"#999"}}>{perf[k]}ms</div>}
            </div>
            <span style={{fontSize:10,fontWeight:700,color:statusColor(checks[k]),textTransform:"uppercase"}}>{checks[k]}</span>
          </div>
        )}
      </div>}
    </Card>

    {/* Performance */}
    {Object.keys(perf).length>0&&<Card>
      <h3 style={S.sec}><I.Bar/> Latence APIs</h3>
      <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
        {[["supabase","Supabase"],["edge_fn","Edge Fn"],["meteo","Météo"],["nominatim","Géocode"]].map(([k,l])=>{
          const ms=perf[k]||0;const maxMs=Math.max(...Object.values(perf).filter(v=>v!=null),100);
          const pct=maxMs>0?ms/maxMs*80:0;
          const color=ms<200?"#1B8A6B":ms<500?"#E67E22":"#E74C3C";
          return<div key={k} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <span style={{fontSize:9,fontWeight:700,color}}>{ms}ms</span>
            <div style={{width:"100%",borderRadius:4,background:color,height:`${Math.max(pct,5)}%`,transition:"height .5s",minHeight:4}}/>
            <span style={{fontSize:7,color:"#999",textAlign:"center"}}>{l}</span>
          </div>;
        })}
      </div>
    </Card>}

    {/* Anomalies */}
    <Card>
      <h3 style={S.sec}>⚠️ Anomalies données ({anomalies.length})</h3>
      {anomalies.length===0?<p style={{color:"#1B8A6B",fontSize:12,textAlign:"center",padding:12}}>✅ Aucune anomalie détectée</p>
      :<div style={{maxHeight:300,overflowY:"auto"}}>
        {anomalies.slice(0,30).map((a,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 0",borderBottom:"1px solid #F5F5F5"}}>
          <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{sevIcon(a.severity)}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.site}</div>
            <div style={{fontSize:10,color:sevColor(a.severity)}}>{a.msg}</div>
          </div>
          <span style={{fontSize:8,color:"#BBB",fontFamily:"monospace",flexShrink:0}}>#{a.id}</span>
        </div>)}
        {anomalies.length>30&&<p style={{fontSize:10,color:"#999",textAlign:"center",padding:8}}>+{anomalies.length-30} autres anomalies</p>}
      </div>}
    </Card>
  </>;
}

// ============================================================
// BACKUP PANEL
// ============================================================
const BACKUP_TABLES=["sites","technicians","notes","photos","activity_log","visits","login_logs","ratings"];

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
        const r=await dbGet(table,`select=*&order=id.asc&offset=${offset}&limit=2000`);
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
    if(!await confirmDark("Restaurer ce backup ?",{danger:true,hint:"Les données actuelles seront ÉCRASÉES",yesLabel:"Restaurer"}))return;
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
  const[toastKey,setToastKey]=useState(0);
  const flash=m=>{setToastKey(k=>k+1);setToast(m);setTimeout(()=>setToast(null),2500);};

  const add=async()=>{if(!nc.trim())return;try{await dbPost("technicians",{code:nc.trim().toUpperCase(),name:nn.trim(),role:nr});setNc("");setNn("");flash("Ajouté ✓");reload();}catch(e){flash("Erreur (code existant ?)");}};
  const toggle=async(t)=>{try{await dbPatch("technicians",{active:!t.active},`id=eq.${t.id}`);reload();}catch(e){}};
  const del=async(t)=>{if(!await confirmDark(`Supprimer ${t.code} ?`,{danger:true,yesLabel:"Supprimer"}))return;try{await dbDel("technicians",`id=eq.${t.id}`);reload();}catch(e){}};
  const resetPin=async(t)=>{if(!await confirmDark(`Réinitialiser le PIN de ${t.code} ?`,{hint:"Il devra en créer un nouveau à la prochaine connexion",yesLabel:"Réinitialiser"}))return;try{await dbPatch("technicians",{pin:null},`id=eq.${t.id}`);flash(`PIN de ${t.code} réinitialisé`);reload();}catch(e){flash("Erreur");}};

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
        <TechAvatar code={t.code} name={t.name} url={t.avatar_url} size={30} fontSize={11}/>
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
    {toast&&<Toasty key={toastKey} m={toast}/>}
  </>;
}

function SitesAdmin({sites,reload}){
  const[q,setQ]=useState("");
  const[filt,setFilt]=useState("all");
  const[sortCol,setSortCol]=useState("name");
  const[sortDir,setSortDir]=useState("asc");
  const filtered=sites.filter(s=>{
    const mq=!q||s.name?.toLowerCase().includes(q.toLowerCase())||s.code_nidt?.toLowerCase().includes(q.toLowerCase());
    if(filt==="nogps")return mq&&(!s.lat||!s.lng||(s.lat===0&&s.lng===0));
    if(filt==="mobile")return mq&&s.type==="mobile";
    if(filt==="fixe")return mq&&s.type==="fixe";
    return mq;
  }).sort((a,b)=>{
    let va=a[sortCol]||"",vb=b[sortCol]||"";
    if(sortCol==="lat"||sortCol==="lng"){va=parseFloat(va)||0;vb=parseFloat(vb)||0;}
    if(typeof va==="string")return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);
    return sortDir==="asc"?va-vb:vb-va;
  });
  const nogps=sites.filter(s=>!s.lat||!s.lng||(s.lat===0&&s.lng===0)).length;

  const toggleSort=col=>{if(sortCol===col)setSortDir(sortDir==="asc"?"desc":"asc");else{setSortCol(col);setSortDir("asc");}};

  const exportCSV=()=>{
    const hdr="name;code_nidt;type;lat;lng;address\n";
    const rows=sites.map(s=>`${s.name};${s.code_nidt||""};${s.type};${s.lat||0};${s.lng||0};${(s.address||"").replace(/;/g,",")}`).join("\n");
    const blob=new Blob([hdr+rows],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="drive-sites.csv";a.click();
  };

  const ThHead=({col,label,w})=>{
    const active=sortCol===col;
    return<th onClick={()=>toggleSort(col)} style={{padding:"6px 8px",fontSize:9,fontWeight:700,color:active?P:"#666",cursor:"pointer",textAlign:"left",background:"#F7F7F8",borderBottom:"1px solid #E8E8E8",textTransform:"uppercase",letterSpacing:.5,width:w,userSelect:"none"}}>
      {label} {active&&<span style={{fontSize:8}}>{sortDir==="asc"?"▲":"▼"}</span>}
    </th>;
  };

  return<>
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <input type="text" placeholder="Rechercher nom, NIDT..." value={q} onChange={e=>setQ(e.target.value)} style={{...S.fi,flex:1,fontSize:12}}/>
      <button onClick={exportCSV} style={{...S.hBtn,background:P,color:"#fff",width:"auto",padding:"0 12px",borderRadius:8,display:"flex",alignItems:"center",gap:4}}><I.DL/> CSV</button>
    </div>
    <div style={{display:"flex",gap:5,marginBottom:10}}>
      {[["all",`Tous (${sites.length})`],["nogps",`Sans GPS (${nogps})`],["mobile","Mobile"],["fixe","Fixe"]].map(([k,l])=>
        <button key={k} onClick={()=>setFilt(k)} style={{...S.chip,...(filt===k?S.chipA:{}),fontSize:10,padding:"3px 8px"}}>{l}</button>
      )}
    </div>
    <div style={{fontSize:10,color:"#999",marginBottom:6}}>{filtered.length} résultats · Clique sur un en-tête pour trier</div>
    <div style={{maxHeight:450,overflowY:"auto",background:"#fff",borderRadius:10,border:"1px solid #EEE"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead style={{position:"sticky",top:0,zIndex:2}}>
          <tr>
            <th style={{width:16,padding:"6px 4px",background:"#F7F7F8",borderBottom:"1px solid #E8E8E8"}}></th>
            <ThHead col="name" label="Nom"/>
            <ThHead col="code_nidt" label="NIDT"/>
            <ThHead col="type" label="Type" w={50}/>
            <ThHead col="lat" label="GPS" w={50}/>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0,200).map(s=>{
            const gps=s.lat&&s.lng&&!(s.lat===0&&s.lng===0);
            return<tr key={s.id} style={{borderBottom:"1px solid #F5F5F5"}}>
              <td style={{padding:"6px 4px",textAlign:"center"}}><div style={{width:6,height:6,borderRadius:3,background:gps?"#4CAF50":"#F44336",margin:"0 auto"}}/></td>
              <td style={{padding:"6px 8px",fontWeight:600,color:"#1A1A1A",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</td>
              <td style={{padding:"6px 8px",color:"#999",fontFamily:"monospace",fontSize:10}}>{s.code_nidt||"—"}</td>
              <td style={{padding:"6px 8px"}}><span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:s.type==="mobile"?"#E8F8F5":s.type==="fixe"?"#FFF3E0":"#FFF8E1",color:s.type==="mobile"?P:s.type==="fixe"?"#E65100":"#FF8F00"}}>{s.type}</span></td>
              <td style={{padding:"6px 8px",fontSize:9,color:gps?"#4CAF50":"#F44336",fontWeight:700}}>{gps?"✓":"×"}</td>
            </tr>;
          })}
        </tbody>
      </table>
      {filtered.length>200&&<p style={{color:"#999",fontSize:11,textAlign:"center",padding:8}}>... et {filtered.length-200} de plus (affine la recherche)</p>}
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
function InteractiveMap({lat,lng,onLatLngChange,onAddressChange,myPos,height=300,defaultSat=false}){
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const markerRef=useRef(null);
  const layersRef=useRef({});
  const[search,setSearch]=useState("");
  const[searching,setSearching]=useState(false);
  const[sat,setSat]=useState(defaultSat);

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
      if(defaultSat){satellite.addTo(map);layersRef.current={street,satellite,current:"satellite"};}
      else{street.addTo(map);layersRef.current={street,satellite,current:"street"};}

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
  const[mode,setMode]=useState("site"); // site|access
  const[lat,setLat]=useState(site.lat||0);
  const[lng,setLng]=useState(site.lng||0);
  const[addr,setAddr]=useState(site.address||"");
  const[accLat,setAccLat]=useState(site.access_lat||0);
  const[accLng,setAccLng]=useState(site.access_lng||0);
  const[locating,setLoc]=useState(false);

  const getPos=()=>{if(!navigator.geolocation)return;setLoc(true);navigator.geolocation.getCurrentPosition(p=>{const la=+p.coords.latitude.toFixed(6),ln=+p.coords.longitude.toFixed(6);if(mode==="site"){setLat(la);setLng(ln);}else{setAccLat(la);setAccLng(ln);}setLoc(false);},()=>setLoc(false),{enableHighAccuracy:true,timeout:10000});};

  const curLat=mode==="site"?lat:accLat;
  const curLng=mode==="site"?lng:accLng;
  const onLL=(a,n)=>{if(mode==="site"){setLat(a);setLng(n);}else{setAccLat(a);setAccLng(n);}};

  return<>
    {site.type==="mobile"&&<div style={{display:"flex",background:"#F0F0F0",borderRadius:10,padding:3,marginBottom:12}}>
      <button onClick={()=>setMode("site")} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",background:mode==="site"?P:"transparent",color:mode==="site"?"#fff":"#888"}}>GPS Site</button>
      <button onClick={()=>setMode("access")} style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",background:mode==="access"?"#E67E22":"transparent",color:mode==="access"?"#fff":"#888"}}>GPS Chemin d'accès</button>
    </div>}

    {mode==="access"&&<p style={{fontSize:11,color:"#E67E22",margin:"0 0 8px",fontWeight:600}}>Placez le point au début de la piste / chemin de terre</p>}

    <button onClick={getPos} disabled={locating} style={{...S.geoBtn,width:"100%",marginBottom:10}}>{locating?<div style={S.spin}/>:<I.Locate/>} Ma position actuelle</button>

    <InteractiveMap lat={curLat} lng={curLng} onLatLngChange={onLL} onAddressChange={mode==="site"?a=>setAddr(a):undefined} myPos={myPos} height={280} defaultSat={true}/>

    {mode==="site"&&addr&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"#F8FFF8",borderRadius:9,marginBottom:10,border:"1px solid #E0F0E0"}}>
      <I.Pin/><span style={{fontSize:12,color:"#333",flex:1}}>{addr}</span>
    </div>}

    <div style={{display:"flex",gap:10,marginBottom:14}}>
      <div style={S.fg}><label style={S.fl}>{mode==="site"?"Lat":"Lat accès"}</label><input type="number" step="0.000001" value={curLat} onChange={e=>{const v=+(e.target.value)||0;if(mode==="site")setLat(v);else setAccLat(v);}} style={S.fi}/></div>
      <div style={S.fg}><label style={S.fl}>{mode==="site"?"Lng":"Lng accès"}</label><input type="number" step="0.000001" value={curLng} onChange={e=>{const v=+(e.target.value)||0;if(mode==="site")setLng(v);else setAccLng(v);}} style={S.fi}/></div>
    </div>

    <div style={{display:"flex",gap:10}}>
      <button style={S.canBtn} onClick={onCancel}>Annuler</button>
      <button style={{...S.subBtn,flex:2}} onClick={()=>{const updates={lat,lng};if(addr)updates.address=addr;if(site.type==="mobile"&&(accLat||accLng)){updates.access_lat=accLat;updates.access_lng=accLng;}onSave(updates);}}><I.Save/> Valider</button>
    </div>
  </>;
}

function EditForm({site,onSave,onCancel}){
  const[f,sF]=useState({name:site.name||"",type:site.type||"mobile",address:site.address||"",code_nidt:site.code_nidt||"",code_anfr:site.anfr_support_id||"",technologies:site.technologies||[],lat:site.lat||0,lng:site.lng||0,poi_category:site.poi_category||"",needs_4x4:site.needs_4x4||false,needs_binome:site.needs_binome||false,needs_terrasse:site.needs_terrasse||false,has_wc:site.has_wc||false,has_abloy:site.has_abloy||false,access_key:site.access_key||""});
  const T=["2G","3G","4G","5G","DSL","FTTH","FTTB","FH"];
  const POI_CATS=["Restaurant","Hôtel","Station-service","Parking","Supermarché","Pharmacie","Poste","Autre"];
  return<div style={{padding:"14px 0"}}>
    <div style={S.fg}><label style={S.fl}>Nom</label><input type="text" value={f.name} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,name:v}));}} style={S.fi}/></div>
    <div style={S.fg}><label style={S.fl}>Type</label><div style={{display:"flex",gap:8}}>{["mobile","fixe","poi"].map(t=><button key={t} onClick={()=>sF(prev=>({...prev,type:t}))} style={{...S.tBtn,...(f.type===t?(t==="mobile"?S.tM:t==="poi"?S.tP:S.tF):{})}}>{t==="poi"?"POI":t}</button>)}</div></div>
    {f.type==="poi"&&<div style={S.fg}><label style={S.fl}>Sous-catégorie</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{POI_CATS.map(c=><button key={c} style={{...S.to,...(f.poi_category===c?{background:"#E67E22",color:"#fff",borderColor:"#E67E22"}:{})}} onClick={()=>sF(prev=>({...prev,poi_category:prev.poi_category===c?"":c}))}>{c}</button>)}</div></div>}
    <div style={S.fg}><label style={S.fl}>{f.type==="fixe"?"Trigramme site":f.type==="poi"?"Référence":"NIDT"}</label><input type="text" value={f.code_nidt} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,code_nidt:v}));}} style={S.fi} placeholder={f.type==="fixe"?"Ex: ABC":f.type==="poi"?"Ex: REF-001":"Ex: 0751234"}/></div>
    <div style={S.fg}><label style={S.fl}>Adresse</label><input type="text" value={f.address} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,address:v}));}} style={S.fi}/></div>
    {f.type!=="poi"&&<><div style={S.fg}><label style={S.fl}>Clé d'accès</label><input type="text" value={f.access_key} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,access_key:v}));}} style={S.fi} placeholder="Ex: Clé triangle, Code portail 1234"/></div>
    <div style={S.fg}><label style={S.fl}>ANFR</label><input type="text" value={f.code_anfr} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,code_anfr:v}));}} style={S.fi}/></div>
    <div style={S.fg}><label style={S.fl}>Techno</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{T.map(t=><button key={t} style={{...S.to,...(f.technologies?.includes(t)?S.toA:{})}} onClick={()=>sF(prev=>{const a=prev.technologies?.includes(t)?prev.technologies.filter(x=>x!==t):[...(prev.technologies||[]),t];return{...prev,technologies:a};})}>{t}</button>)}</div></div></>}
    <div style={S.fg}><button onClick={()=>sF(prev=>({...prev,needs_4x4:!prev.needs_4x4}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:9,border:`2px solid ${f.needs_4x4?"#BF360C":"#E8E8E8"}`,background:f.needs_4x4?"#FBE9E7":"#fff",cursor:"pointer",width:"100%"}}><span style={{fontSize:18}}>{f.needs_4x4?"\u2611":"\u2610"}</span><span style={{fontSize:12,fontWeight:700,color:f.needs_4x4?"#BF360C":"#888"}}>4x4 nécessaire pour accéder au site</span></button></div>
    <div style={{display:"flex",gap:8}}>
      <div style={{flex:1}}><button onClick={()=>sF(prev=>({...prev,needs_terrasse:!prev.needs_terrasse,needs_binome:!prev.needs_terrasse?true:prev.needs_binome}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:9,border:`2px solid ${f.needs_terrasse?"#1565C0":"#E8E8E8"}`,background:f.needs_terrasse?"#E3F2FD":"#fff",cursor:"pointer",width:"100%"}}><span style={{fontSize:18}}>{f.needs_terrasse?"\u2611":"\u2610"}</span><span style={{fontSize:12,fontWeight:700,color:f.needs_terrasse?"#1565C0":"#888"}}>Terrasse</span></button></div>
      <div style={{flex:1}}><button onClick={()=>sF(prev=>({...prev,needs_binome:!prev.needs_binome,needs_terrasse:!prev.needs_binome?prev.needs_terrasse:false}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:9,border:`2px solid ${f.needs_binome?"#FF8F00":"#E8E8E8"}`,background:f.needs_binome?"#FFF8E1":"#fff",cursor:"pointer",width:"100%"}}><span style={{fontSize:18}}>{f.needs_binome?"\u2611":"\u2610"}</span><span style={{fontSize:12,fontWeight:700,color:f.needs_binome?"#FF8F00":"#888"}}>Binôme</span></button></div>
    </div>
    {f.type==="mobile"&&<div style={S.fg}><label style={S.fl}>Point GPS chemin d'accès</label><p style={{fontSize:11,color:"#999",margin:"0 0 4px"}}>Modifiable depuis le bouton GPS de la fiche</p></div>}
    {f.type==="fixe"&&<div style={{display:"flex",gap:8,marginTop:6}}>
      <div style={{flex:1}}><button onClick={()=>sF(prev=>({...prev,has_wc:!prev.has_wc}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:9,border:`2px solid ${f.has_wc?"#2E7D32":"#E8E8E8"}`,background:f.has_wc?"#E8F5E9":"#fff",cursor:"pointer",width:"100%"}}><span style={{fontSize:18}}>{f.has_wc?"\u2611":"\u2610"}</span><span style={{fontSize:12,fontWeight:700,color:f.has_wc?"#2E7D32":"#888"}}>WC</span></button></div>
      <div style={{flex:1}}><button onClick={()=>sF(prev=>({...prev,has_abloy:!prev.has_abloy}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:9,border:`2px solid ${f.has_abloy?"#0D47A1":"#E8E8E8"}`,background:f.has_abloy?"#E3F2FD":"#fff",cursor:"pointer",width:"100%"}}><span style={{fontSize:18}}>{f.has_abloy?"\u2611":"\u2610"}</span><span style={{fontSize:12,fontWeight:700,color:f.has_abloy?"#0D47A1":"#888"}}>Recharge Abloy</span></button></div>
    </div>}

    <div style={S.fg}><label style={S.fl}>Position GPS</label>
      <InteractiveMap lat={f.lat} lng={f.lng} onLatLngChange={(la,ln)=>sF(prev=>({...prev,lat:la,lng:ln}))} onAddressChange={a=>sF(prev=>({...prev,address:a}))} height={240}/>
      <div style={{display:"flex",gap:10}}>
        <div style={S.fg}><label style={S.fl}>Lat</label><input type="number" step="0.000001" value={f.lat} onChange={e=>{const v=+(e.target.value)||0;sF(prev=>({...prev,lat:v}));}} style={S.fi}/></div>
        <div style={S.fg}><label style={S.fl}>Lng</label><input type="number" step="0.000001" value={f.lng} onChange={e=>{const v=+(e.target.value)||0;sF(prev=>({...prev,lng:v}));}} style={S.fi}/></div>
      </div>
    </div>

    <div style={{display:"flex",gap:10,marginTop:6}}><button style={S.canBtn} onClick={onCancel}>Annuler</button><button style={{...S.subBtn,flex:2}} onClick={()=>{const d={name:f.name,type:f.type,address:f.address,code_nidt:f.code_nidt,technologies:f.technologies,lat:f.lat,lng:f.lng,needs_4x4:f.needs_4x4,needs_binome:f.needs_binome,needs_terrasse:f.needs_terrasse,has_wc:f.has_wc,has_abloy:f.has_abloy};if(f.code_anfr)d.anfr_support_id=f.code_anfr;if(f.poi_category)d.poi_category=f.poi_category;onSave(d);}}><I.Save/> Enregistrer</button></div>
  </div>;
}

function SiteForm({title,onClose,onSave,myPos}){
  const[f,sF]=useState({name:"",type:"mobile",lat:0,lng:0,address:"",code_nidt:"",technologies:[],poi_category:"",needs_4x4:false,needs_binome:false,needs_terrasse:false,access_key:""});
  const T=["2G","3G","4G","5G","DSL","FTTH","FTTB","FH"];
  const POI_CATS=["Restaurant","Hôtel","Station-service","Parking","Supermarché","Pharmacie","Poste","Autre"];
  const go=()=>{if(!f.name)return;const d={name:f.name,type:f.type,lat:f.lat||0,lng:f.lng||0,address:f.address,code_nidt:f.code_nidt,technologies:f.technologies};if(f.poi_category)d.poi_category=f.poi_category;if(f.needs_4x4)d.needs_4x4=true;if(f.needs_binome)d.needs_binome=true;if(f.needs_terrasse)d.needs_terrasse=true;onSave(d);};

  const getPos=()=>{if(!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(p=>{sF(prev=>({...prev,lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6)}));},{},{enableHighAccuracy:true,timeout:10000});};

  return<div style={S.ov} className="drv-ov" onClick={onClose}><div style={S.modal} className="drv-modal" onClick={e=>e.stopPropagation()}>
    <div style={S.mH}><h2 style={{fontSize:18,fontWeight:800,margin:0}}>{title}</h2><button style={S.iBtn} onClick={onClose}><I.X/></button></div>
    <div style={S.mB}>
      <div style={S.fg}><label style={S.fl}>Nom *</label><input type="text" value={f.name} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,name:v}));}} style={S.fi} placeholder="Nom du site"/></div>
      <div style={S.fg}><label style={S.fl}>Type</label><div style={{display:"flex",gap:8}}>{["mobile","fixe","poi"].map(t=><button key={t} onClick={()=>sF(prev=>({...prev,type:t}))} style={{...S.tBtn,...(f.type===t?(t==="mobile"?S.tM:t==="poi"?S.tP:S.tF):{})}}>{t==="poi"?"POI":t}</button>)}</div></div>
      {f.type==="poi"&&<div style={S.fg}><label style={S.fl}>Sous-catégorie</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{POI_CATS.map(c=><button key={c} style={{...S.to,...(f.poi_category===c?{background:"#E67E22",color:"#fff",borderColor:"#E67E22"}:{})}} onClick={()=>sF(prev=>({...prev,poi_category:prev.poi_category===c?"":c}))}>{c}</button>)}</div></div>}
      <div style={S.fg}><label style={S.fl}>{f.type==="fixe"?"Trigramme site":f.type==="poi"?"Référence":"NIDT"}</label><input type="text" value={f.code_nidt} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,code_nidt:v}));}} style={S.fi} placeholder={f.type==="fixe"?"Ex: ABC":f.type==="poi"?"Ex: REF-001":"Ex: 0751234"}/></div>
      <div style={S.fg}><label style={S.fl}>Adresse</label><input type="text" value={f.address} onChange={e=>{const v=e.target.value;sF(prev=>({...prev,address:v}));}} style={S.fi} placeholder="Adresse du site"/></div>

      <div style={S.fg}><label style={S.fl}>Position GPS</label>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={getPos} style={{...S.geoBtn,flex:1,fontSize:11,padding:"7px"}}><I.Locate/> Ma position actuelle</button>
        </div>
        <InteractiveMap lat={f.lat} lng={f.lng} onLatLngChange={(la,ln)=>sF(prev=>({...prev,lat:la,lng:ln}))} onAddressChange={a=>sF(prev=>({...prev,address:a}))} myPos={myPos} height={220}/>
        <div style={{display:"flex",gap:10}}>
          <div style={S.fg}><label style={S.fl}>Lat</label><input type="number" step="0.000001" value={f.lat} onChange={e=>{const v=+(e.target.value)||0;sF(prev=>({...prev,lat:v}));}} style={S.fi}/></div>
          <div style={S.fg}><label style={S.fl}>Lng</label><input type="number" step="0.000001" value={f.lng} onChange={e=>{const v=+(e.target.value)||0;sF(prev=>({...prev,lng:v}));}} style={S.fi}/></div>
        </div>
      </div>

      {f.type!=="poi"&&<div style={S.fg}><label style={S.fl}>Techno</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{T.map(t=><button key={t} style={{...S.to,...(f.technologies.includes(t)?S.toA:{})}} onClick={()=>sF(prev=>{const a=prev.technologies.includes(t)?prev.technologies.filter(x=>x!==t):[...prev.technologies,t];return{...prev,technologies:a};})}>{t}</button>)}</div></div>}
      <div style={S.fg}><button onClick={()=>sF(prev=>({...prev,needs_4x4:!prev.needs_4x4}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:9,border:`2px solid ${f.needs_4x4?"#BF360C":"#E8E8E8"}`,background:f.needs_4x4?"#FBE9E7":"#fff",cursor:"pointer",width:"100%"}}><span style={{fontSize:18}}>{f.needs_4x4?"\u2611":"\u2610"}</span><span style={{fontSize:12,fontWeight:700,color:f.needs_4x4?"#BF360C":"#888"}}>4x4 nécessaire</span></button></div>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}><button onClick={()=>sF(prev=>({...prev,needs_terrasse:!prev.needs_terrasse,needs_binome:!prev.needs_terrasse?true:prev.needs_binome}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:9,border:`2px solid ${f.needs_terrasse?"#1565C0":"#E8E8E8"}`,background:f.needs_terrasse?"#E3F2FD":"#fff",cursor:"pointer",width:"100%"}}><span style={{fontSize:18}}>{f.needs_terrasse?"\u2611":"\u2610"}</span><span style={{fontSize:12,fontWeight:700,color:f.needs_terrasse?"#1565C0":"#888"}}>Terrasse</span></button></div>
        <div style={{flex:1}}><button onClick={()=>sF(prev=>({...prev,needs_binome:!prev.needs_binome,needs_terrasse:!prev.needs_binome?prev.needs_terrasse:false}))} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:9,border:`2px solid ${f.needs_binome?"#FF8F00":"#E8E8E8"}`,background:f.needs_binome?"#FFF8E1":"#fff",cursor:"pointer",width:"100%"}}><span style={{fontSize:18}}>{f.needs_binome?"\u2611":"\u2610"}</span><span style={{fontSize:12,fontWeight:700,color:f.needs_binome?"#FF8F00":"#888"}}>Binôme</span></button></div>
      </div>
    </div>
    <div style={S.mF}><button style={S.canBtn} onClick={onClose}>Annuler</button><button style={{...S.subBtn,flex:2,opacity:f.name?1:.5}} onClick={go} disabled={!f.name}>Ajouter</button></div>
  </div></div>;
}

// Colors for generation markers (shared by MapView and AnfrSectors)
const GEN_COLORS={"5G":"#9C27B0","4G":"#1B8A6B","3G":"#2196F3","2G":"#FF9800","FH":"#78909C"};

// Auto sector annotation: S1=lowest azimut, S2=next, S3=highest (FH excluded)
const azToSector=(sectorData)=>{
  // Extract unique non-FH azimuts, sorted ascending
  const azSet=new Set();
  sectorData.forEach(s=>{if(s.generation!=="FH"&&s.azimut!=null)azSet.add(+s.azimut);});
  const sorted=[...azSet].sort((a,b)=>a-b);
  const map={};
  sorted.forEach((az,i)=>{map[az]=`S${i+1}`;});
  return map;
};

// Orange band code mapping: system string → letter code
// Format: "LTE 700"→"K", "NR 3500"→"T", etc.
const BAND_CODE={
  "GSM 900":"G","GSM 1800":"D",
  "UMTS 900":"W","UMTS 2100":"U","W-CDMA 900":"W","W-CDMA 2100":"U",
  "LTE 700":"K","LTE 800":"F","LTE 900":"F9","LTE 1800":"H","LTE 2100":"V","LTE 2600":"E",
  "NR 700":"Y","NR 1800":"M","NR 2100":"X","NR 2600":"B","NR 3500":"T","NR 26000":"Z",
  "5G NR 700":"Y","5G NR 1800":"M","5G NR 2100":"X","5G NR 2600":"B","5G NR 3500":"T","5G NR 26000":"Z",
};
const getBandCode=(sys)=>{
  if(!sys)return null;
  // Direct match
  if(BAND_CODE[sys])return BAND_CODE[sys];
  // Try extracting freq from system string (e.g. "LTE 700 MHz" → "LTE 700")
  const m=sys.match(/^(\S+)\s+(\d+)/);
  if(m){const k=`${m[1]} ${m[2]}`;if(BAND_CODE[k])return BAND_CODE[k];}
  return null;
};

// Global map view showing all sites
function MapView({sites,onSelect,myPos,th,fuelPref}){
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const clusterRef=useRef(null);
  const stationLayerRef=useRef(null);
  const azLayerRef=useRef(null);
  const anfrCache=useRef(null);
  const initDone=useRef(false);
  const[mapLoading,setMapLoading]=useState(true);

  // Fetch all ANFR data once
  const fetchAllAnfr=async()=>{
    if(anfrCache.current)return anfrCache.current;
    try{
      // Get unique support_ids from sites
      const ids=[...new Set(sites.filter(s=>s.anfr_support_id).map(s=>s.anfr_support_id))];
      if(ids.length===0)return{};
      // Batch fetch in chunks of 50
      const all={};
      for(let i=0;i<ids.length;i+=50){
        const batch=ids.slice(i,i+50);
        const filter=`support_id=in.(${batch.join(",")})&select=support_id,azimut,generation,systeme&order=generation.asc&limit=5000`;
        try{
          const rows=await dbGet("anfr_data",filter);
          rows.forEach(r=>{
            if(r.azimut==null)return;
            if(!all[r.support_id])all[r.support_id]=[];
            const key=`${r.azimut}-${r.generation}`;
            if(!all[r.support_id].some(x=>`${x.azimut}-${x.generation}`===key)){
              all[r.support_id].push({azimut:+r.azimut,generation:r.generation||"4G",system:r.systeme||""});
            }
          });
        }catch(e){}
      }
      anfrCache.current=all;
      return all;
    }catch(e){return{};}
  };

  // Draw azimut lines for visible sites with real range
  const drawAzimuts=useCallback(async()=>{
    const map=mapInst.current;const L=window.L;
    if(!map||!L)return;
    if(azLayerRef.current){map.removeLayer(azLayerRef.current);azLayerRef.current=null;}
    const zoom=map.getZoom();
    if(zoom<13)return; // Only show azimuts when zoomed in enough

    const anfrData=await fetchAllAnfr();
    if(!anfrData||Object.keys(anfrData).length===0)return;

    const bounds=map.getBounds();
    const layers=[];
    // Max range cap depending on zoom (avoid super long lines at mid-zoom)
    const maxCap=zoom>=16?5000:zoom>=15?3000:zoom>=14?2000:1500;

    sites.forEach(s=>{
      if(!s.lat||!s.lng||(s.lat===0&&s.lng===0))return;
      if(!bounds.contains([s.lat,s.lng]))return;
      if(!s.anfr_support_id||!anfrData[s.anfr_support_id])return;

      const sectorData=anfrData[s.anfr_support_id];
      const sm=azToSector(sectorData);
      const latRad=s.lat*Math.PI/180;
      const ptAt=(az,dist)=>L.latLng(s.lat+dist*Math.cos(az*Math.PI/180)/111320,s.lng+dist*Math.sin(az*Math.PI/180)/(111320*Math.cos(latRad)));

      // Group by azimut
      const byAz={};
      sectorData.forEach(d=>{if(!byAz[d.azimut])byAz[d.azimut]=[];byAz[d.azimut].push(d);});

      Object.entries(byAz).forEach(([azStr,items])=>{
        const az=+azStr;
        const isFH=items.every(i=>i.generation==="FH");

        if(isFH){
          const fhLen=Math.min(GEN_RANGE["FH"]||8000,maxCap*1.5);
          const endPt=ptAt(az,fhLen);
          layers.push(L.polyline([L.latLng(s.lat,s.lng),endPt],{color:"#78909C",weight:1.2,opacity:.35,dashArray:"6,4",interactive:false}));
        }else{
          // Get max range for this azimut based on systems present
          const ranges=items.filter(i=>i.generation!=="FH").map(i=>getRange(i.generation,i.system));
          const maxRange=Math.min(Math.max(...ranges,500),maxCap);

          // Main line to max range
          const endPt=ptAt(az,maxRange);
          layers.push(L.polyline([L.latLng(s.lat,s.lng),endPt],{color:"#FF7900",weight:1.8,opacity:.5,interactive:false}));

          // Colored range segments per generation (shorter gens = shorter lines)
          const gens=[...new Set(items.filter(i=>i.generation!=="FH").map(i=>i.generation))];
          const go={"5G":0,"4G":1,"3G":2,"2G":3};
          gens.sort((a,b)=>(go[a]??9)-(go[b]??9));
          gens.forEach(g=>{
            const gItems=items.filter(i=>i.generation===g);
            const gRange=Math.min(Math.max(...gItems.map(i=>getRange(i.generation,i.system)),300),maxCap);
            const gEnd=ptAt(az,gRange);
            layers.push(L.polyline([L.latLng(s.lat,s.lng),gEnd],{color:GEN_COLORS[g]||"#999",weight:zoom>=16?3:2,opacity:.4,interactive:false}));
          });

          // Dots per generation at proportional distance
          if(zoom>=14){
            gens.forEach((g,i)=>{
              const gItems=items.filter(it=>it.generation===g);
              const gRange=Math.min(Math.max(...gItems.map(it=>getRange(it.generation,it.system)),300),maxCap);
              const dotDist=Math.min(gRange*0.4,zoom>=16?400:250);
              const dotPos=ptAt(az,dotDist*(i+1));
              layers.push(L.circleMarker(dotPos,{radius:zoom>=16?5:3.5,color:"#fff",weight:1.5,fillColor:GEN_COLORS[g]||"#999",fillOpacity:1,interactive:false}));
            });
          }
        }

        // Label only at higher zoom
        if(zoom>=15){
          const sLabel=sm[az]?`${sm[az]}·`:"";
          const labelRange=isFH?Math.min(GEN_RANGE["FH"]||8000,maxCap*1.5):Math.min(Math.max(...items.filter(i=>i.generation!=="FH").map(i=>getRange(i.generation,i.system)),500),maxCap);
          const labelPos=ptAt(az,labelRange+20);
          layers.push(L.marker(labelPos,{icon:L.divIcon({className:"",html:`<div style="font-size:${zoom>=17?10:8}px;font-weight:700;color:${isFH?"#78909C":"#FF7900"};text-shadow:0 0 3px rgba(0,0,0,.6);white-space:nowrap">${sLabel}${az}°</div>`,iconSize:[45,14],iconAnchor:[22,7]}),interactive:false}));
        }
      });
    });

    if(layers.length>0){
      const group=L.layerGroup(layers);
      group.addTo(map);
      azLayerRef.current=group;
    }
  },[sites]);

  useEffect(()=>{
    if(initDone.current)return;
    const loadL=()=>{
      if(!window.L){
        if(!document.getElementById("leaflet-css")){const l=document.createElement("link");l.id="leaflet-css";l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);}
        const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=()=>loadCluster();document.head.appendChild(s);
      }else loadCluster();
    };
    const loadCluster=()=>{
      if(!document.getElementById("mc-css")){const l=document.createElement("link");l.id="mc-css";l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css";document.head.appendChild(l);}
      if(!document.getElementById("mc-css2")){const l=document.createElement("link");l.id="mc-css2";l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css";document.head.appendChild(l);}
      if(!window.L.MarkerClusterGroup){
        const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js";s.onload=init;document.head.appendChild(s);
      }else init();
    };
    const init=()=>{
      if(!mapRef.current||mapInst.current)return;
      initDone.current=true;
      const L=window.L;
      const center=myPos?[myPos.lat,myPos.lng]:[47.75,7.34];
      const map=L.map(mapRef.current,{zoomControl:true,attributionControl:false}).setView(center,10);
      const osmLayer=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19});
      const topoLayer=L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",{maxZoom:17,attribution:"OpenTopoMap"});
      const satLayer=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19});
      // TomTom Traffic overlay — get free API key at developer.tomtom.com
      const TOMTOM_KEY="YOUR_TOMTOM_API_KEY_HERE";
      const trafficFlow=L.tileLayer(`https://{s}.api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,{subdomains:["a","b","c","d"],maxZoom:18,opacity:.8,attribution:"© TomTom"});
      const trafficIncidents=L.tileLayer(`https://{s}.api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,{subdomains:["a","b","c","d"],maxZoom:18,attribution:"© TomTom"});
      osmLayer.addTo(map);
      const baseLayers={"Plan":osmLayer,"Topo IGN":topoLayer,"Satellite":satLayer};
      const overlays={"🚦 Trafic":trafficFlow,"⚠️ Incidents":trafficIncidents};
      L.control.layers(baseLayers,overlays,{position:"topright",collapsed:true}).addTo(map);
      if(myPos)L.circleMarker([myPos.lat,myPos.lng],{radius:10,color:"#4ECDC4",fillColor:"#4ECDC4",fillOpacity:.5,weight:3}).addTo(map);
      mapInst.current=map;
      addMarkers(map,sites);
      // Fit map to show all sites
      const validSites=sites.filter(s=>s.lat&&s.lng&&!(s.lat===0&&s.lng===0));
      if(validSites.length>1){
        const bounds=L.latLngBounds(validSites.map(s=>[s.lat,s.lng]));
        map.fitBounds(bounds,{padding:[30,30],maxZoom:13});
      }else if(myPos){map.setView([myPos.lat,myPos.lng],12);}
      // Draw azimuts on zoom/move
      map.on("zoomend moveend",()=>drawAzimuts());
      drawAzimuts();
      // Map ready — hide skeleton
      setTimeout(()=>setMapLoading(false),300);
    };
    loadL();
    return()=>{if(mapInst.current){mapInst.current.remove();mapInst.current=null;initDone.current=false;stationLayerRef.current=null;}};
  },[]);

  const[mapSearch,setMapSearch]=useState("");
  const[mapSearching,setMapSearching]=useState(false);
  const flyToSite=(lat,lng)=>{if(mapInst.current)mapInst.current.flyTo([lat,lng],16,{duration:1.2,easeLinearity:.25});};
  const locateMe=()=>{if(myPos&&mapInst.current)mapInst.current.flyTo([myPos.lat,myPos.lng],15,{duration:.8});};
  const searchOnMap=async()=>{if(!mapSearch.trim()||!mapInst.current)return;setMapSearching(true);try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(mapSearch)}&limit=1&countrycodes=fr`,{headers:{"Accept":"application/json","Accept-Language":"fr"}});const d=await r.json();if(d.length>0)mapInst.current.flyTo([+d[0].lat,+d[0].lon],14,{duration:1});}catch(e){}setMapSearching(false);};
    const addMarkers=(map,list)=>{
    const L=window.L;if(!L||!map||!L.MarkerClusterGroup)return;
    if(clusterRef.current)map.removeLayer(clusterRef.current);
    if(stationLayerRef.current)map.removeLayer(stationLayerRef.current);

    // Separate sites from stations
    const normalSites=list.filter(s=>!s._station);
    const stationSites=list.filter(s=>s._station);

    // Normal sites cluster
    const cluster=new L.MarkerClusterGroup({
      maxClusterRadius:50,
      iconCreateFunction:(c)=>{
        const n=c.getChildCount();
        const size=n>50?46:n>20?40:34;
        const color=n>50?"#E65100":n>20?"#1565C0":"#1B8A6B";
        const shadow=n>50?"0 3px 12px rgba(230,81,0,.4)":n>20?"0 3px 12px rgba(21,101,192,.4)":"0 3px 12px rgba(27,138,107,.4)";
        return L.divIcon({html:`<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${n>50?14:12}px;font-weight:800;border:2.5px solid #fff;box-shadow:${shadow};font-family:'DM Sans',sans-serif">${n}</div>`,className:"",iconSize:[size,size]});
      },
    });
    normalSites.forEach(s=>{
      if(!s.lat||!s.lng||(s.lat===0&&s.lng===0))return;
      const color=s.type==="mobile"?"#1B8A6B":s.type==="poi"?"#FF8F00":"#E65100";
      const icon=L.divIcon({className:"",html:`<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 0C7.6 0 4 3.6 4 8c0 6 8 16 8 16s8-10 8-16c0-4.4-3.6-8-8-8z" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="8" r="3" fill="#fff"/></svg></div>`,iconSize:[24,24],iconAnchor:[12,24]});
      const m=L.marker([s.lat,s.lng],{icon});
      m.bindPopup(`<div style="font-family:'DM Sans',sans-serif;font-size:12px;min-width:140px;line-height:1.4"><b style="font-size:13px">${s.name}</b><br/><span style="color:#999;font-size:10px;font-family:monospace">${s.code_nidt||""}</span><br/><div style="display:flex;gap:4;margin-top:4"><span style="font-size:8px;font-weight:700;padding:2px 6px;border-radius:4px;background:${color}18;color:${color}">${s.type==="mobile"?"Mobile":s.type==="poi"?"POI":"Fixe"}</span>${myPos?`<span style="font-size:9px;font-weight:700;color:#1B8A6B">${(dist(myPos.lat,myPos.lng,s.lat,s.lng)||0).toFixed(1)}km</span>`:""}</div><div style="margin-top:6;text-align:right"><span style="font-size:10px;color:#4ECDC4;font-weight:600">Ouvrir →</span></div></div>`);
      m.on("click",()=>setTimeout(()=>onSelect(s),300));
      cluster.addLayer(m);
    });
    map.addLayer(cluster);
    clusterRef.current=cluster;

    // Station markers — separate layer (not clustered)
    const stationGroup=L.layerGroup();
    const fuelApi=FUELS.find(f=>f.key===fuelPref)?.api||"gazole_prix";
    stationSites.forEach(s=>{
      if(!s.lat||!s.lng)return;
      const color=s.card==="wex"?"#1565C0":"#D32F2F";
      const label=s.card==="wex"?"WEX":"GR";
      // Pin style A — text centered
      const pinSvg=`<svg width="32" height="43" viewBox="0 0 40 54"><path d="M20 0C11 0 4 7 4 15.5c0 11.5 16 33.5 16 33.5s16-22 16-33.5C36 7 29 0 20 0z" fill="${color}" stroke="#fff" stroke-width="2"/><text x="20" y="19" text-anchor="middle" fill="#fff" font-size="10" font-weight="800" font-family="-apple-system,sans-serif">${label}</text></svg>`;
      const icon=L.divIcon({className:"",html:`<div style="width:32px;height:43px">${pinSvg}</div>`,iconSize:[32,43],iconAnchor:[16,43]});
      const m=L.marker([s.lat,s.lng],{icon});
      // Popup with price
      const price=s[fuelApi];
      const fuelInfo=FUELS.find(f=>f.key===fuelPref);
      const displayName=`${s.brand||"Station"} ${s.address.split(",").pop()?.trim()||""}`.trim();
      const priceStr=price?`<b style="font-size:15px">${price.toFixed(3)}€</b> <span style="color:${fuelInfo?.color||"#999"};font-size:10px">${fuelInfo?.short||""}</span>`:`<span style="color:#BBB">—</span>`;
      const ruptStr=s.ruptures?.length>0?`<br/><span style="color:#D32F2F;font-size:10px">Rupture: ${s.ruptures.map(r=>(FUELS.find(f=>f.key===r)||{}).label||r).join(", ")}</span>`:"";
      m.bindPopup(`<div style="font-family:sans-serif;font-size:12px;min-width:120px"><b>${displayName}</b><br/><span style="color:#999;font-size:10px">${s.address}</span><br/>${priceStr}${ruptStr}</div>`);
      m.on("click",()=>setTimeout(()=>onSelect(s),300));
      // Permanent tooltip with price at zoom 13+
      if(price){
        m.bindTooltip(`<span style="font-weight:800;font-size:11px">${price.toFixed(3)}€</span>`,{permanent:false,direction:"top",offset:[0,-44],className:"drv-price-tip"});
      }
      stationGroup.addLayer(m);
    });
    stationGroup.addTo(map);
    stationLayerRef.current=stationGroup;

    // Show/hide price tooltips based on zoom
    const priceLabelLayerRef={current:null};
    const updatePriceLabels=()=>{
      const zoom=map.getZoom();
      // Remove existing price labels
      if(priceLabelLayerRef.current){map.removeLayer(priceLabelLayerRef.current);priceLabelLayerRef.current=null;}
      if(zoom<13)return;
      const bounds=map.getBounds();
      const labels=[];
      stationSites.forEach(s=>{
        if(!s.lat||!s.lng||!bounds.contains([s.lat,s.lng]))return;
        const price=s[fuelApi];
        if(!price)return;
        const priceColor=s._priceColor||(s.card==="wex"?"#1565C0":"#D32F2F");
        const label=L.marker([s.lat,s.lng],{
          icon:L.divIcon({
            className:"",
            html:`<div style="background:#fff;border:1px solid ${priceColor};border-radius:6px;padding:1px 5px;font-size:10px;font-weight:800;color:${priceColor};white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.15)">${price.toFixed(3)}€</div>`,
            iconSize:[55,18],iconAnchor:[27,-2],
          }),
          interactive:false,
        });
        labels.push(label);
      });
      if(labels.length>0){
        priceLabelLayerRef.current=L.layerGroup(labels);
        priceLabelLayerRef.current.addTo(map);
      }
    };
    map.on("zoomend moveend",updatePriceLabels);
    updatePriceLabels();
  };

  useEffect(()=>{
    if(mapInst.current&&window.L&&window.L.MarkerClusterGroup){addMarkers(mapInst.current,sites);drawAzimuts();}
  },[sites.length]);

  return<div style={{position:"relative",zIndex:1}}>
    <div ref={mapRef} style={{height:"calc(100vh - 140px)",width:"100%"}}/>
    {/* Map skeleton loading */}
    {mapLoading&&<div style={{position:"absolute",inset:0,background:"#E8E8E8",display:"flex",alignItems:"center",justifyContent:"center",zIndex:399}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{width:40,height:40,borderRadius:20,border:`3px solid ${th.primary}33`,borderTopColor:th.primary,animation:"spin 1s linear infinite"}}/>
        <span style={{fontSize:11,color:"#999",fontWeight:600}}>Chargement de la carte...</span>
      </div>
      {/* Ghost pins */}
      {[[20,30],[70,25],[35,55],[60,45],[80,65],[25,75]].map(([x,y],i)=>
        <div key={i} style={{position:"absolute",left:`${x}%`,top:`${y}%`,opacity:.15,animation:`skPulse 1.5s ease infinite ${i*100}ms`}}>
          <svg width="24" height="32" viewBox="0 0 24 32"><path d="M12 0C6.5 0 2 4.5 2 10c0 7.4 10 21 10 21s10-13.6 10-21C22 4.5 17.5 0 12 0z" fill="#888"/></svg>
        </div>
      )}
    </div>}
    {/* Map search bar */}
    <div style={{position:"absolute",top:10,left:10,right:60,zIndex:400,display:"flex",gap:4}}>
      <input type="text" value={mapSearch} onChange={e=>setMapSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&searchOnMap()} placeholder="Ville, adresse..." style={{flex:1,padding:"8px 12px",borderRadius:10,border:"none",background:"rgba(255,255,255,.95)",fontSize:12,outline:"none",boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}/>
      <button onClick={searchOnMap} disabled={mapSearching} style={{width:36,height:36,borderRadius:10,border:"none",background:"rgba(255,255,255,.95)",boxShadow:"0 2px 8px rgba(0,0,0,.15)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:th.primary}}>{mapSearching?<div style={{...S.spin,width:14,height:14}}/>:<I.Search/>}</button>
    </div>
    {/* Locate me button */}
    <button onClick={locateMe} style={{position:"absolute",top:10,right:10,zIndex:400,width:36,height:36,borderRadius:10,border:"none",background:"rgba(255,255,255,.95)",boxShadow:"0 2px 8px rgba(0,0,0,.15)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:myPos?"#4ECDC4":"#999"}}>
      <I.Locate/>
    </button>
    {/* Legend */}
    <div style={{position:"absolute",bottom:10,left:10,zIndex:400,background:"rgba(255,255,255,.92)",borderRadius:10,padding:"6px 10px",boxShadow:"0 2px 8px rgba(0,0,0,.1)",display:"flex",gap:8,fontSize:9,fontWeight:600}}>
      <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:4,background:"#1B8A6B"}}/> Mobile</span>
      <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:4,background:"#2E86C1"}}/> Fixe</span>
      <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:4,background:"#E67E22"}}/> POI</span>
      <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:4,background:"#1565C0"}}/> WEX</span>
      <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:4,background:"#E65100"}}/> GR</span>
    </div>
  </div>;
}

// ============================================================
// ANFR SECTORS COMPONENT
// ============================================================
const OP_COLORS={"ORANGE":"#FF7900","FREE MOBILE":"#CD1E25","SFR":"#E2001A","BOUYGUES TELECOM":"#0055A4","DIGICEL":"#E4002B","SRR":"#009688","OUTREMER":"#00BCD4"};

// Theoretical max range per system (meters) — based on frequency/technology
const SYS_RANGE={"5G NR 3500":500,"5G NR 2100":1200,"5G NR 700":3000,"LTE 700":5000,"LTE 800":4500,"LTE 900":4000,"LTE 1800":2500,"LTE 2100":2000,"LTE 2600":1500,"UMTS 900":5000,"UMTS 2100":2000,"W-CDMA 900":5000,"W-CDMA 2100":2000,"GSM 900":10000,"GSM 1800":5000};
const GEN_RANGE={"5G":1000,"4G":3000,"3G":5000,"2G":10000,"FH":20000};
const getRange=(gen,sys)=>{if(SYS_RANGE[sys])return SYS_RANGE[sys];return GEN_RANGE[gen]||2000;};

function AnfrSectors({data,siteLat,siteLng}){
  const[selAz,setSelAz]=useState(null);
  const mapRef=useRef(null);
  const mapInst=useRef(null);
  const layerRef=useRef(null);
  const initDone=useRef(false);

  // Dedupe by azimut+generation+system
  const sectors=useMemo(()=>{
    const map=new Map();
    data.forEach(d=>{
      const az=d.ant_azimut!=null?+d.ant_azimut:null;
      if(az===null)return;
      const key=`${az}-${d.generation}-${d.emr_lb_systeme}`;
      if(!map.has(key))map.set(key,{azimut:az,generation:d.generation||"?",system:d.emr_lb_systeme||""});
    });
    return[...map.values()];
  },[data]);

  // Group by azimut
  const byAzimut=useMemo(()=>{
    const m={};
    sectors.forEach(s=>{if(!m[s.azimut])m[s.azimut]=[];m[s.azimut].push(s);});
    // Sort each azimut's systems by gen priority
    const go={"5G":0,"4G":1,"3G":2,"2G":3,"FH":4};
    Object.values(m).forEach(arr=>arr.sort((a,b)=>(go[a.generation]??9)-(go[b.generation]??9)));
    return m;
  },[sectors]);

  const azimuts=useMemo(()=>Object.keys(byAzimut).map(Number).sort((a,b)=>a-b),[byAzimut]);

  // Sector annotation (S1, S2, S3)
  const sectorMap=useMemo(()=>azToSector(sectors),[sectors]);

  // Unique generations per azimut (for dots on line)
  const azGens=useMemo(()=>{
    const m={};
    azimuts.forEach(az=>{
      const gens=[];const seen=new Set();
      byAzimut[az].forEach(s=>{if(!seen.has(s.generation)){seen.add(s.generation);gens.push(s.generation);}});
      m[az]=gens;
    });
    return m;
  },[azimuts,byAzimut]);

  // Draw lines + dots on map
  const drawLayers=useCallback(()=>{
    const map=mapInst.current;const L=window.L;
    if(!map||!L||!siteLat||!siteLng)return;
    if(layerRef.current)map.removeLayer(layerRef.current);

    const layers=[];
    const latRad=siteLat*Math.PI/180;
    const ptAt=(azimut,dist)=>{
      const rad=azimut*Math.PI/180;
      // Azimut: 0°=N(lat+), 90°=E(lng+), 180°=S(lat-), 270°=W(lng-)
      return L.latLng(siteLat+dist*Math.cos(rad)/111320,siteLng+dist*Math.sin(rad)/(111320*Math.cos(latRad)));
    };

    // Line length on screen = fixed visual length based on zoom
    const zoom=map.getZoom();
    const lineLen=300*Math.pow(2,17-zoom); // ~300m at zoom 17, scales with zoom

    azimuts.forEach(az=>{
      const gens=azGens[az]||[];
      const isFH=gens.length===1&&gens[0]==="FH";
      const isSelected=selAz===az;

      // Draw the azimut line — orange for mobile, grey dashed for FH
      const endPt=ptAt(az,isFH?lineLen*3:lineLen);
      if(isFH){
        const line=L.polyline([L.latLng(siteLat,siteLng),endPt],{
          color:"#78909C",weight:isSelected?3:1.5,opacity:isSelected?.9:.5,dashArray:"8,5",
        });
        line.on("click",()=>setSelAz(prev=>prev===az?null:az));
        layers.push(line);
      }else{
        const line=L.polyline([L.latLng(siteLat,siteLng),endPt],{
          color:"#FF7900",weight:isSelected?3.5:2.5,opacity:isSelected?1:.75,
        });
        line.on("click",()=>setSelAz(prev=>prev===az?null:az));
        layers.push(line);

        // Dots: one per generation, fixed close to tower
        const mobileGens=gens.filter(g=>g!=="FH");
        const dotCount=mobileGens.length;
        if(dotCount>0){
          // Fixed spacing in meters — stays close to pylone at any zoom
          const dotSpacing=30*Math.pow(2,17-zoom); // ~30m at zoom 17
          mobileGens.forEach((g,i)=>{
            const dist=dotSpacing*(i+1);
            const dotPos=ptAt(az,dist);
            const dot=L.circleMarker(dotPos,{
              radius:isSelected?7:5.5,
              color:"#fff",weight:2,
              fillColor:GEN_COLORS[g]||"#999",fillOpacity:1,
            });
            dot.on("click",()=>setSelAz(prev=>prev===az?null:az));
            layers.push(dot);
          });
        }
      }

      // Azimut label at end of line
      const sLabel=sectorMap[az]?`${sectorMap[az]} · `:"";
      const labelPos=ptAt(az,isFH?lineLen*3+30:lineLen+30);
      const labelIcon=L.divIcon({
        className:"",
        html:`<div style="font-size:11px;font-weight:700;color:${isFH?"#78909C":"#FF7900"};text-shadow:0 0 4px rgba(0,0,0,.7),0 0 2px rgba(0,0,0,.5);white-space:nowrap">${sLabel}${az}°${isFH?" FH":""}</div>`,
        iconSize:[55,16],iconAnchor:[28,8],
      });
      layers.push(L.marker(labelPos,{icon:labelIcon,interactive:false}));
    });

    const group=L.layerGroup(layers);
    group.addTo(map);
    layerRef.current=group;
  },[azimuts,azGens,selAz,siteLat,siteLng,sectorMap]);

  // Init Leaflet
  useEffect(()=>{
    if(!siteLat||!siteLng||initDone.current)return;
    const doInit=()=>{
      if(!window.L||!mapRef.current)return;
      initDone.current=true;
      const L=window.L;
      const map=L.map(mapRef.current,{zoomControl:false,attributionControl:false,center:[siteLat,siteLng],zoom:17,minZoom:14,maxZoom:19});
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19}).addTo(map);
      L.circleMarker([siteLat,siteLng],{radius:7,color:"#fff",weight:2.5,fillColor:"#FF7900",fillOpacity:1}).addTo(map);
      mapInst.current=map;
      drawLayers();
      map.on("zoomend",()=>drawLayers());
    };
    if(window.L)doInit();
    else{
      if(!document.getElementById("leaflet-css")){const l=document.createElement("link");l.id="leaflet-css";l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(l);}
      if(!document.getElementById("leaflet-js")){const s=document.createElement("script");s.id="leaflet-js";s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=doInit;document.head.appendChild(s);}
      else doInit();
    }
    return()=>{if(mapInst.current){mapInst.current.remove();mapInst.current=null;initDone.current=false;}};
  },[siteLat,siteLng]);

  useEffect(()=>{if(mapInst.current)drawLayers();},[drawLayers]);

  // Group systems by gen for the detail row
  const genSystems=(az)=>{
    const items=byAzimut[az]||[];
    const m={};
    items.forEach(s=>{if(!m[s.generation])m[s.generation]=[];if(!m[s.generation].includes(s.system))m[s.generation].push(s.system);});
    const go={"5G":0,"4G":1,"3G":2,"2G":3,"FH":4};
    return Object.entries(m).sort((a,b)=>(go[a[0]]??9)-(go[b[0]]??9));
  };

  return<div>
    {/* Map */}
    {sectors.length>0&&<div style={{borderRadius:12,overflow:"hidden",marginBottom:8}}>
      <div ref={mapRef} style={{height:280,width:"100%"}}/>
    </div>}

    {/* Legend */}
    {sectors.length>0&&<div style={{display:"flex",gap:10,marginBottom:10,fontSize:10,color:"#999",justifyContent:"center"}}>
      {["5G","4G","3G","2G"].filter(g=>sectors.some(s=>s.generation===g)).map(g=><span key={g} style={{display:"flex",alignItems:"center",gap:3}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:GEN_COLORS[g],display:"inline-block"}}/>
        {g}
      </span>)}
      {sectors.some(s=>s.generation==="FH")&&<span style={{display:"flex",alignItems:"center",gap:3}}>
        <span style={{width:14,height:0,borderTop:"1.5px dashed #78909C",display:"inline-block"}}/>
        FH
      </span>}
    </div>}

    {/* Detail table per azimut */}
    {sectors.length>0&&<div>
      {azimuts.map(az=>{
        const isSelected=selAz===az;
        const isFH=azGens[az]?.length===1&&azGens[az][0]==="FH";
        const gs=genSystems(az);
        return<div key={az} onClick={()=>setSelAz(selAz===az?null:az)} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 0",borderBottom:"1px solid #F0F0F0",cursor:"pointer",background:isSelected?"#FFF8F0":"transparent",marginLeft:-4,marginRight:-4,paddingLeft:4,paddingRight:4,borderRadius:isSelected?8:0}}>
          <div style={{flexShrink:0,width:48}}>
            {sectorMap[az]&&<span style={{fontSize:9,fontWeight:800,color:"#fff",background:isFH?"#78909C":"#FF7900",borderRadius:4,padding:"1px 5px",marginRight:4}}>{sectorMap[az]}</span>}
            <span style={{fontSize:13,fontWeight:700,color:isFH?"#78909C":"#FF7900"}}>{az}°</span>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,flex:1}}>
            {gs.map(([gen,sysList])=><div key={gen} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:GEN_COLORS[gen]||"#999",flexShrink:0}}/>
              <span style={{fontSize:11,fontWeight:700,color:GEN_COLORS[gen]||"#555"}}>{gen}</span>
              <span style={{fontSize:11,color:"#555"}}>{sysList.map(sys=>{const code=getBandCode(sys);const sn=sectorMap[az]?sectorMap[az].replace("S",""):"";return code?(sn?`${code}${sn}`:`${code}`)+` ${sys.split(" ").pop()||""}`:sys;}).join(", ")}</span>
            </div>)}
          </div>
        </div>;
      })}
    </div>}

    {sectors.length===0&&<p style={{color:"#CCC",textAlign:"center",padding:12,fontSize:12}}>Aucun système Orange à proximité</p>}
  </div>;
}


// StationDetail
function StationDetail({station,fuelPref,th,geo,onClose,onRefresh}){
  const[s,setS]=useState(station);
  const[refreshing,setRefreshing]=useState(false);
  const[lastRefresh,setLastRefresh]=useState(null);
  const[shPos,setShPos]=useState("full");
  const dragR=useRef(null);
  const[dragH,setDragH]=useState(null);
  const[dragging,setDragging]=useState(false);
  const contentR=useRef(null);
  const sheetR=useRef(null);

  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};},[]);
  useEffect(()=>{const el=sheetR.current;if(!el)return;const h=e=>{if(dragR.current&&dragging)e.preventDefault();};el.addEventListener("touchmove",h,{passive:false});return()=>el.removeEventListener("touchmove",h);});

  const closeSheet=()=>{document.body.style.overflow="";onClose();};

  const doRefresh=async()=>{
    setRefreshing(true);
    try{
      const dep=s.address?.match(/\b(67|68)\d{3}\b/)?.[0]?.slice(0,2)||"68";
      const r=await fetch(`${SB}/functions/v1/fuel-prices?deps=${dep}`,{headers:{"apikey":SK,"Authorization":`Bearer ${SK}`}});
      if(!r.ok)throw new Error(`${r.status}`);
      const d=await r.json();
      const stId=String(s.id).replace("st_","");
      const fresh=(d.results||[]).find(x=>String(x.id)===stId);
      if(fresh){
        const indispo=(fresh.carburants_indisponibles||[]).map(x=>x.toLowerCase());
        const defStr=(fresh.carburants_rupture_definitive||"").toLowerCase();
        const tempStr=(fresh.carburants_rupture_temporaire||"").toLowerCase();
        const ruptures=[];const nonPropose=[];
        ["gazole","sp95","sp98","e10","e85","gplc"].forEach(k=>{
          if(!indispo.includes(k))return;
          const type=fresh[k+"_rupture_type"];
          if(type==="temporaire"||tempStr.includes(k))ruptures.push(k);
          else nonPropose.push(k);
        });
        setS(prev=>({...prev,
          gazole_prix:fresh.gazole_prix,sp95_prix:fresh.sp95_prix,sp98_prix:fresh.sp98_prix,
          e10_prix:fresh.e10_prix,e85_prix:fresh.e85_prix,gplc_prix:fresh.gplc_prix,
          gazole_maj:fresh.gazole_maj,sp95_maj:fresh.sp95_maj,sp98_maj:fresh.sp98_maj,
          e10_maj:fresh.e10_maj,e85_maj:fresh.e85_maj,gplc_maj:fresh.gplc_maj,
          ruptures,nonPropose,
        }));
        setLastRefresh(new Date());
        ls.del("drv_stations_ts");
        if(onRefresh)onRefresh();
      }
    }catch(e){}
    setRefreshing(false);
  };

  const cardColor=s.card==="wex"?"#1565C0":"#D32F2F";
  const fuelApi=FUELS.find(f=>f.key===fuelPref)?.api||"gazole_prix";
  const dCard={background:"#fff",border:"1px solid #F0F0F0",borderRadius:12,padding:12,marginBottom:6};
  const dNavBtn={flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"12px 6px",borderRadius:10,color:"#fff",fontSize:11,fontWeight:600,textDecoration:"none",border:"none"};
  const dest=s.lat&&s.lng?`${s.lat},${s.lng}`:encodeURIComponent(s.address||s.name||"");
  const dd=geo?.p?dist(geo.p.lat,geo.p.lng,s.lat,s.lng):null;

  const vh=window.innerHeight;const FULL=vh*.93;
  const getH=()=>FULL;
  const curH=dragH!==null?dragH:getH();

  const onTS=e=>{const isH=e.target.closest("[data-handle]");const atTop=contentR.current&&contentR.current.scrollTop<=1;dragR.current={startY:e.touches[0].clientY,startH:getH(),time:Date.now(),lastY:e.touches[0].clientY,lastTime:Date.now(),vel:0,isHandle:!!isH,atTop:!!atTop,activated:!!isH};};
  const onTM=e=>{if(!dragR.current)return;const y=e.touches[0].clientY;const dy=y-dragR.current.startY;if(!dragR.current.activated){if(dragR.current.atTop&&dy>8){dragR.current.activated=true;setDragging(true);}else return;}const now=Date.now();const dt=now-dragR.current.lastTime;if(dt>0)dragR.current.vel=(y-dragR.current.lastY)/dt;dragR.current.lastY=y;dragR.current.lastTime=now;setDragH(Math.max(60,dragR.current.startH-(dragR.current.startY-y)));};
  const onTE=()=>{if(!dragR.current||!dragR.current.activated){dragR.current=null;setDragging(false);return;}const vel=dragR.current.vel;const h=dragH||getH();if(vel>0.5||h<FULL*.35){closeSheet();}else{setShPos("full");}setDragH(null);dragR.current=null;setDragging(false);};

  const heroBg=s.card==="wex"?"linear-gradient(135deg,#0D1B2A,#1565C0)":"linear-gradient(135deg,#1a0505,#D32F2F)";

  return<>
    <div onClick={closeSheet} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>{e.preventDefault();e.stopPropagation();}} onTouchEnd={e=>e.stopPropagation()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",zIndex:9998,touchAction:"none"}}/>
    <div ref={sheetR} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE} style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9999,height:Math.max(curH,0),background:th.bg||"#F7F7F8",borderRadius:"18px 18px 0 0",boxShadow:"0 -4px 30px rgba(0,0,0,.12)",transition:dragging?"none":"height .3s cubic-bezier(.22,1,.36,1)",display:"flex",flexDirection:"column"}}>
      <div data-handle="true" style={{padding:"10px 0 4px",cursor:"grab",flexShrink:0}}><div style={{width:36,height:4,borderRadius:2,background:"#DDD",margin:"0 auto"}}/></div>
      {/* Hero */}
      <div data-handle="true" style={{padding:"2px 14px 10px",flexShrink:0,cursor:"grab"}}>
        <div style={{background:heroBg,borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"14px",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:52,height:52,borderRadius:16,background:s.card==="wex"?"linear-gradient(135deg,#1565C0,#42A5F5)":"linear-gradient(135deg,#D32F2F,#EF5350)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 12px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.3)",position:"relative",overflow:"hidden",flexShrink:0}}><div style={{position:"absolute",top:0,left:0,right:0,height:"50%",background:"linear-gradient(180deg,rgba(255,255,255,.25),transparent)"}}/><div style={{position:"relative",zIndex:1,color:"#fff"}}><I.Fuel/></div></div>
            <div style={{flex:1,minWidth:0}}>
              <h2 style={{fontSize:18,fontWeight:800,color:"#fff",margin:0}}>{s.brand||s.name}</h2>
              <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:2}}>{s.address}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
              <span style={{fontSize:8,fontWeight:800,padding:"4px 8px",borderRadius:6,background:"rgba(255,255,255,.2)",color:"#fff",textAlign:"center"}}>{s.card==="wex"?"WEX":"GR"}</span>
              <button onClick={closeSheet} style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",borderRadius:9,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff"}}><I.X/></button>
            </div>
          </div>
          <div style={{display:"flex",borderTop:"1px solid rgba(255,255,255,.1)"}}>
            <div style={{flex:1,padding:"8px 4px",textAlign:"center",borderRight:"1px solid rgba(255,255,255,.08)"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase"}}>Carte</div>
              <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{s.card==="wex"?"WEX":"GR"}</div>
            </div>
            <div style={{flex:1,padding:"8px 4px",textAlign:"center",borderRight:"1px solid rgba(255,255,255,.08)"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase"}}>Distance</div>
              <div style={{fontSize:13,fontWeight:800,color:"#4ECDC4"}}>{dd!==null&&dd<999?(dd<1?`${Math.round(dd*1000)}m`:`${dd.toFixed(1)}km`):"—"}</div>
            </div>
            <div style={{flex:1,padding:"8px 4px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase"}}>Refresh</div>
              <button onClick={doRefresh} disabled={refreshing} style={{background:"none",border:"none",color:"#4ECDC4",fontSize:13,fontWeight:800,cursor:"pointer"}}>{refreshing?"...":"↻"}</button>
            </div>
          </div>
        </div>
      </div>
      {/* Content */}
      <div ref={contentR} style={{flex:1,overflowY:"auto",padding:"0 14px 30px",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"}}>
        {/* Quick nav */}
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <a href={s.lat?`https://waze.com/ul?ll=${s.lat},${s.lng}&navigate=yes`:`https://waze.com/ul?q=${encodeURIComponent(s.address)}&navigate=yes`} target="_blank" rel="noopener noreferrer" style={{...dNavBtn,background:"#33CCFF",textDecoration:"none"}}><I.Waze s={16}/> Waze</a>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noopener noreferrer" style={{...dNavBtn,background:"#34A853",textDecoration:"none"}}><I.GMaps s={16}/> Maps</a>
          <a href={s.lat?`http://maps.apple.com/?daddr=${s.lat},${s.lng}`:`http://maps.apple.com/?daddr=${encodeURIComponent(s.address)}`} target="_blank" rel="noopener noreferrer" style={{...dNavBtn,background:"#555",textDecoration:"none"}}><I.Apple/> Apple</a>
        </div>

        {/* Stale warning */}
        {(()=>{const majDates=["gazole_maj","sp95_maj","sp98_maj","e10_maj","e85_maj","gplc_maj"].map(k=>s[k]).filter(Boolean).map(d=>new Date(d).getTime());if(majDates.length===0)return null;const newest=Math.max(...majDates);const daysOld=Math.floor((Date.now()-newest)/(1000*60*60*24));if(daysOld<3)return null;return<div style={{background:"#FFF3E0",borderLeft:"4px solid #FF9800",borderRadius:"0 10px 10px 0",padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:15,background:"#FF9800",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:15,color:"#fff",fontWeight:900}}>!</span></div>
          <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:"#E65100"}}>Pas de mise à jour depuis {daysOld} jours</div><div style={{fontSize:10,color:"#BF6B00",marginTop:2,lineHeight:1.4}}>Prix et ruptures déclarés par la station. Possiblement obsolètes.</div></div>
        </div>;})()}

        {/* Prices */}
        <div style={dCard}>
          <div style={{fontSize:8,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Prix du jour</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
            {[{k:"gazole",l:"Gazole",c:"#FFB300"},{k:"sp95",l:"SP95",c:"#43A047"},{k:"e10",l:"E10",c:"#1B8A6B"},{k:"sp98",l:"SP98",c:"#1565C0"},{k:"e85",l:"E85",c:"#7B1FA2"},{k:"gplc",l:"GPLc",c:"#00838F"}].map(f=>{
              const price=s[f.k+"_prix"];const maj=s[f.k+"_maj"];const isSel=fuelApi===f.k+"_prix";
              const isRupt=s.ruptures?.includes(f.k);const isNP=s.nonPropose?.includes(f.k);
              return<div key={f.k} style={{padding:"8px 6px",borderRadius:10,textAlign:"center",background:isRupt?"#FFEBEE":isNP?"#F5F5F5":isSel?`${f.c}10`:"#FAFAFA",border:isRupt?"1.5px solid #FFCDD2":isSel?`1.5px solid ${f.c}`:"1px solid #F0F0F0"}}>
                <div style={{fontSize:9,fontWeight:700,color:isRupt?"#D32F2F":isNP?"#BBB":f.c,marginBottom:2}}>{f.l}</div>
                {isRupt?<div style={{fontSize:12,fontWeight:800,color:"#D32F2F"}}>RUPTURE</div>
                :isNP?<div style={{fontSize:11,color:"#CCC"}}>Non proposé</div>
                :price?<div style={{fontSize:16,fontWeight:800,color:"#1A1A1A"}}>{price.toFixed(3)}<span style={{fontSize:10,color:"#999"}}>€</span></div>
                :<div style={{fontSize:12,color:"#CCC"}}>—</div>}
                {maj&&!isRupt&&!isNP&&<div style={{fontSize:9,color:"#999",marginTop:2}}>{timeAgo(maj)}</div>}
              </div>;
            })}
          </div>
        </div>

        {/* Rupture alert */}
        {s.ruptures?.length>0&&<div style={{background:"#FFEBEE",border:"1.5px solid #FFCDD2",borderRadius:12,padding:"12px 14px",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:16}}>⚠️</span><span style={{fontSize:13,fontWeight:700,color:"#D32F2F"}}>Rupture de stock</span></div>
          {s.ruptures.map(r=><div key={r} style={{fontSize:11,color:"#C62828",padding:"3px 0"}}>{(FUELS.find(x=>x.key===r)||{}).label||r} <span style={{fontSize:9,color:"#E57373"}}>temporaire</span></div>)}
        </div>}

        {/* Address */}
        <div style={dCard}>
          <div style={{fontSize:8,fontWeight:600,color:"#999",textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Adresse</div>
          <div style={{fontSize:12,fontWeight:500,color:"#333",lineHeight:1.4}}>{s.address}</div>
        </div>

        {/* Card compatibility */}
        <div style={{...dCard,borderLeft:`3px solid ${cardColor}`}}>
          <div style={{fontSize:8,fontWeight:600,color:cardColor,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Carte compatible</div>
          <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{s.card==="wex"?"Carte WEX":"Carte GR"}</div>
          <div style={{fontSize:10,color:"#999",marginTop:2}}>{s.card==="wex"?"Leclerc, Eni, Esso, FAL, Fulli, IDS, Rompetrol, Vito":"TotalEnergies, Total Access"}</div>
        </div>
        <div style={{height:30}}/>
      </div>
    </div>
  </>;
}

// ============================================================
// OFFLINE PANEL — Full offline sync
// ============================================================
function OfflinePanel({auth,flash,fetchSites}){
  const[syncing,setSyncing]=useState(false);
  const[status,setStatus]=useState(null);
  const[online,setOnline]=useState(navigator.onLine);
  const[stats,setStats]=useState({sites:0,comments:0,stations:0,photos:0,queue:0,lastSync:null});

  useEffect(()=>{checkStats();const h1=()=>setOnline(true);const h2=()=>setOnline(false);window.addEventListener("online",h1);window.addEventListener("offline",h2);return()=>{window.removeEventListener("online",h1);window.removeEventListener("offline",h2);};},[]);

  const checkStats=async()=>{
    try{
      const cachedSites=await idbGet("cache","sites");
      const cachedStations=await idbGet("cache","stations");
      const cachedPhotos=await idbGet("cache","all_photos");
      const queue=await idbGetAll("queue");
      const lastSync=ls.get("drv_offline_sync");
      setStats({
        sites:cachedSites?.length||0,
        comments:(await idbGet("cache","all_comments"))?.length||0,
        stations:cachedStations?.length||0,
        photos:cachedPhotos?.length||0,
        queue:queue?.length||0,
        lastSync:lastSync?new Date(parseInt(lastSync)):null,
      });
    }catch(e){}
  };

  const syncAll=async()=>{
    setSyncing(true);setStatus("Synchronisation des sites...");
    try{
      // 1. Sites
      const sites=await dbGet("sites","order=name.asc");
      if(sites&&sites.length>0){
        await idbSet("cache","sites",sites);
        ls.set("drv_cache",JSON.stringify(sites));
        setStatus(`✓ ${sites.length} sites — Commentaires...`);
      }
      // 2. All comments
      let allComments=[];let offset=0;
      while(true){
        const batch=await dbGet("notes",`order=created_at.desc&limit=1000&offset=${offset}`);
        if(!batch||batch.length===0)break;
        allComments=[...allComments,...batch];
        if(batch.length<1000)break;
        offset+=1000;
      }
      await idbSet("cache","all_comments",allComments);
      setStatus(`✓ ${allComments.length} notes — Photos...`);
      // 3. Photos metadata (not images themselves)
      let allPhotos=[];offset=0;
      while(true){
        const batch=await dbGet("photos",`select=id,site_id,url,technician_code,created_at&order=created_at.desc&limit=1000&offset=${offset}`);
        if(!batch||batch.length===0)break;
        allPhotos=[...allPhotos,...batch];
        if(batch.length<1000)break;
        offset+=1000;
      }
      await idbSet("cache","all_photos",allPhotos);
      setStatus(`✓ ${allPhotos.length} photos — Stations...`);
      // 4. Stations
      try{
        const r=await fetch(`${SB}/functions/v1/fuel-prices?deps=67,68`,{headers:{"apikey":SK,"Authorization":`Bearer ${SK}`}});
        if(r.ok){const d=await r.json();if(d.results){await idbSet("cache","stations",d.results);ls.set("drv_stations",JSON.stringify(d.results));ls.set("drv_stations_ts",Date.now().toString());}}
      }catch(e){}
      setStatus(`✓ Sync complète — Envoi des modifs...`);
      // 5. Process offline queue
      const sent=await processQueue();
      ls.set("drv_offline_sync",Date.now().toString());
      await checkStats();
      setStatus(`✓ Synchronisation terminée${sent>0?` (${sent} modifs envoyées)`:""}`);
    }catch(e){
      setStatus("Erreur: "+e.message);
    }
    setSyncing(false);
  };

  const ago=stats.lastSync?((Date.now()-stats.lastSync.getTime())<3600000?`il y a ${Math.round((Date.now()-stats.lastSync.getTime())/60000)} min`:(Date.now()-stats.lastSync.getTime())<86400000?`il y a ${Math.round((Date.now()-stats.lastSync.getTime())/3600000)}h`:`le ${stats.lastSync.toLocaleDateString("fr",{day:"2-digit",month:"2-digit"})} à ${stats.lastSync.toLocaleTimeString("fr",{hour:"2-digit",minute:"2-digit"})}`):"jamais";

  return<div style={{padding:"10px 12px"}}>
    {/* Network indicator */}
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,padding:"6px 10px",borderRadius:8,background:online?"#E8F5E9":"#FFEBEE",border:online?"1px solid #A5D6A7":"1px solid #FFCDD2"}}>
      <div style={{width:10,height:10,borderRadius:5,background:online?"#4CAF50":"#F44336"}}/>
      <span style={{fontSize:10,fontWeight:700,color:online?"#2E7D32":"#D32F2F"}}>{online?"En ligne — connecté":"Hors ligne — mode local"}</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
      {[[stats.sites,"Sites","#1B8A6B"],[stats.comments,"Notes","#FF7900"],[stats.photos,"Photos","#7B1FA2"],[stats.stations,"Stations","#1565C0"]].map(([v,l,c],i)=>
        <div key={i} style={{textAlign:"center",padding:"8px 4px",borderRadius:8,background:`${c}08`,border:`1px solid ${c}18`}}>
          <div style={{fontSize:16,fontWeight:900,color:v>0?c:"#CCC"}}>{v||"—"}</div>
          <div style={{fontSize:8,fontWeight:600,color:"#999"}}>{l} en cache</div>
        </div>
      )}
    </div>
    {stats.queue>0&&<div style={{background:"#FFF8E1",borderRadius:8,padding:"6px 10px",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
      <span style={{fontSize:12}}>⚠️</span>
      <span style={{fontSize:10,fontWeight:700,color:"#FF8F00"}}>{stats.queue} modification{stats.queue>1?"s":""} en attente de sync</span>
    </div>}
    <button onClick={syncAll} disabled={syncing||!online} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:syncing?"#999":!online?"#CCC":"#1B8A6B",color:"#fff",fontSize:12,fontWeight:700,cursor:syncing||!online?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
      {syncing?<><div style={{width:14,height:14,border:"2px solid #fff",borderTopColor:"transparent",borderRadius:7,animation:"spin .8s linear infinite"}}/>{status?.startsWith("✓")?status:"Sync en cours..."}</>:!online?"Connexion requise":"Synchroniser tout"}
    </button>
    <div style={{fontSize:9,color:"#BBB",textAlign:"center",marginTop:6}}>Dernière sync : {ago}</div>
    {status&&!syncing&&status.startsWith("✓")&&<div style={{background:"#E8F5E9",borderRadius:8,padding:"6px 10px",marginTop:6,fontSize:10,fontWeight:600,color:"#2E7D32",textAlign:"center"}}>{status}</div>}
    {status&&!syncing&&!status.startsWith("✓")&&status.startsWith("Erreur")&&<div style={{background:"#FFEBEE",borderRadius:8,padding:"6px 10px",marginTop:6,fontSize:10,fontWeight:600,color:"#D32F2F",textAlign:"center"}}>{status}</div>}
  </div>;
}

// ============================================================
// DRAWER — Dark premium side menu
// ============================================================
function Drawer({auth,th,setPage,setFilt,onClose,openSettings,openAbout,logout,flash,darkMode,setDarkMode}){
  const[stats,setStats]=useState({visits:0,photos:0,gps:0});

  useEffect(()=>{
    if(!auth?.code)return;
    const now=new Date();
    const from=new Date(now.getFullYear(),now.getMonth(),1).toISOString();
    // Independent fetches — any failure doesn't block the others
    (async()=>{try{const v=await dbGet("visits",`technician_code=eq.${auth.code}&visited_at=gte.${from}&select=id`);setStats(s=>({...s,visits:v?.length||0}));}catch(e){}})();
    (async()=>{try{const p=await dbGet("site_photos",`uploader_code=eq.${auth.code}&created_at=gte.${from}&select=id`);setStats(s=>({...s,photos:p?.length||0}));}catch(e){}})();
    (async()=>{try{const a=await dbGet("activity_log",`technician_code=eq.${auth.code}&created_at=gte.${from}&action=eq.edit&select=details`);const gpsUpdates=(a||[]).filter(x=>{try{const d=JSON.parse(x.details);return d.lat!==undefined||d.lng!==undefined;}catch{return false;}}).length;setStats(s=>({...s,gps:gpsUpdates}));}catch(e){}})();
  },[auth?.code]);

  const prenom=(auth.name||"").split(" ")[0]||auth.code;

  const Ic=({k,s=16,c="rgba(255,255,255,.7)",sw=2})=>{
    const paths={
      home:<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
      phone:<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>,
      game:<><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="4" y1="12" x2="8" y2="12"/><circle cx="16" cy="11" r="1"/><circle cx="18" cy="13" r="1"/></>,
      castle:<><path d="M3 21h18M5 21V11l3-1v-3l3 1V6l2-1 2 1v2l3-1v3l3 1v10"/><path d="M9 21v-5h2v5M13 21v-5h2v5"/></>,
      bact:<><circle cx="9" cy="10" r="4"/><circle cx="15" cy="14" r="3"/><circle cx="11" cy="9" r=".7" fill="currentColor"/><circle cx="13" cy="11" r=".7" fill="currentColor"/></>,
      chart:<><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-5"/></>,
      notes:<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>,
      star:<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
      clock:<><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
      photo:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></>,
      search:<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
      traffic:<><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 2"/></>,
      cloud:<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>,
      fuel:<><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2v0a2 2 0 0 0 2-2V9l-3-3"/></>,
      bell:<><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></>,
      stats:<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
      admin:<><path d="M3 3h18v18H3z"/><path d="M9 3v18M3 9h6"/></>,
      settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
      info:<><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
      logout:<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    };
    return<svg width={s} height={s} viewBox="0 0 24 24" fill={k==="star"?c:"none"} stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{paths[k]}</svg>;
  };

  const goto=(action)=>{haptic(8);onClose();setTimeout(action,100);};

  const Item=({k,label,badge,badgeColor,onClick,highlight})=><div onClick={onClick} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 10px",borderRadius:8,color:highlight?A:"#fff",background:"transparent",fontWeight:500,fontSize:12.5,cursor:"pointer",marginBottom:1}}>
    <Ic k={k} s={16} c={highlight?A:"rgba(255,255,255,.7)"}/>
    <span style={{flex:1}}>{label}</span>
    {badge!=null&&<span style={{background:badgeColor||"#FF3B30",color:"#fff",fontSize:9,padding:"2px 7px",borderRadius:10,fontWeight:900,boxShadow:`0 2px 6px ${badgeColor||"#FF3B30"}66`}}>{badge}</span>}
  </div>;

  const SectionLabel=({t})=><div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.3)",textTransform:"uppercase",letterSpacing:1.5,padding:"8px 8px 4px"}}>{t}</div>;

  return<>
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9998,animation:"fadeIn .2s ease",backdropFilter:"blur(4px)"}}/>
    <div style={{position:"fixed",top:0,left:0,bottom:0,width:"82%",maxWidth:320,background:"linear-gradient(170deg,#0a2e24 0%,#0d1b2a 100%)",zIndex:9999,animation:"slideInLeft .25s ease",boxShadow:"4px 0 40px rgba(0,0,0,.5)",display:"flex",flexDirection:"column",color:"#fff",overflow:"hidden"}}>
      {/* Aurora blur decorative */}
      <div style={{position:"absolute",top:20,right:-40,width:140,height:140,background:`radial-gradient(circle,${A}40,transparent 70%)`,filter:"blur(40px)",pointerEvents:"none"}}/>

      {/* Profile header */}
      <div style={{padding:"22px 18px 16px",position:"relative"}}>
        <div style={{width:52,height:52,borderRadius:16,background:`linear-gradient(135deg,${P},${A})`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10,boxShadow:`0 4px 20px ${P}66`,overflow:"hidden"}}>
          {auth.avatar_url?<img src={auth.avatar_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={prenom}/>:<span style={{color:"#fff",fontSize:20,fontWeight:900}}>{prenom[0]?.toUpperCase()}</span>}
        </div>
        <div style={{fontSize:16,fontWeight:900}}>{auth.name||auth.code}</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,.5)",display:"flex",alignItems:"center",gap:6,marginTop:2}}>
          <span>{auth.code}</span>
          <span style={{width:4,height:4,borderRadius:2,background:"#4CAF50"}}/>
          <span style={{color:auth.role==="admin"?"#4CAF50":"rgba(255,255,255,.5)",fontWeight:700}}>{auth.role==="admin"?"Admin":"Technicien"}</span>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{display:"flex",gap:6,padding:"0 14px 14px"}}>
        <div style={{flex:1,background:"rgba(255,255,255,.05)",borderRadius:10,padding:"6px 4px",textAlign:"center",border:"1px solid rgba(255,255,255,.08)"}}>
          <div style={{fontSize:16,fontWeight:900,color:A}}>{stats.visits}</div>
          <div style={{fontSize:8,color:"rgba(255,255,255,.4)"}}>Visites</div>
        </div>
        <div style={{flex:1,background:"rgba(255,255,255,.05)",borderRadius:10,padding:"6px 4px",textAlign:"center",border:"1px solid rgba(255,255,255,.08)"}}>
          <div style={{fontSize:16,fontWeight:900,color:"#FFD700"}}>{stats.photos}</div>
          <div style={{fontSize:8,color:"rgba(255,255,255,.4)"}}>Photos</div>
        </div>
        <div style={{flex:1,background:"rgba(255,255,255,.05)",borderRadius:10,padding:"6px 4px",textAlign:"center",border:"1px solid rgba(255,255,255,.08)"}}>
          <div style={{fontSize:16,fontWeight:900,color:"#FF7900"}}>{stats.gps}</div>
          <div style={{fontSize:8,color:"rgba(255,255,255,.4)"}}>GPS</div>
        </div>
      </div>

      {/* Menu */}
      <div style={{flex:1,overflowY:"auto",padding:"0 10px"}}>
        <SectionLabel t="Navigation"/>
        <Item k="home" label="Accueil" onClick={()=>goto(()=>setPage("home"))}/>
        <Item k="notes" label="Notes & bons plans" highlight onClick={()=>goto(()=>setPage("notes"))}/>
        <Item k="phone" label="Annuaire" onClick={()=>goto(()=>setPage("directory"))}/>
        <Item k="star" label="Favoris" onClick={()=>goto(()=>{setPage("home");setFilt("fav");})}/>
        <Item k="chart" label="Mon activité 📊" onClick={()=>goto(()=>setPage("myactivity"))}/>

        <SectionLabel t="Filtres rapides"/>
        <Item k="traffic" label="Mobile" onClick={()=>goto(()=>{setPage("home");setFilt("mobile");})}/>
        <Item k="cloud" label="Fixe" onClick={()=>goto(()=>{setPage("home");setFilt("fixe");})}/>
        <Item k="fuel" label="Stations carburant" onClick={()=>goto(()=>{setPage("home");setFilt("station");})}/>

        <SectionLabel t="Fun"/>
        <Item k="game" label="Bloberie 🎮" highlight onClick={()=>goto(()=>setPage("game"))}/>
        <Item k="castle" label="Drive TD 🏰" highlight onClick={()=>goto(()=>setPage("td"))}/>
        <Item k="bact" label="Bacteria 🦠" highlight onClick={()=>goto(()=>setPage("bacteria"))}/>

        {auth.role==="admin"&&<>
          <SectionLabel t="Administration"/>
          <Item k="admin" label="Dashboard admin" onClick={()=>goto(()=>setPage("admin"))}/>
          <Item k="stats" label="Statistiques" onClick={()=>goto(()=>setPage("admin"))}/>
          <Item k="bell" label="Annonces" onClick={()=>goto(()=>setPage("admin"))}/>
        </>}
      </div>

      {/* Footer */}
      <div style={{borderTop:"1px solid rgba(255,255,255,.08)",padding:"6px 10px",position:"relative",zIndex:1}}>
        <div onClick={()=>setDarkMode&&setDarkMode(!darkMode)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:8,fontSize:12.5,fontWeight:500,cursor:"pointer",color:"rgba(255,255,255,.85)"}}>
          <span style={{fontSize:14,width:15,display:"flex",justifyContent:"center"}}>{darkMode?"🌙":"☀️"}</span>
          <span style={{flex:1}}>{darkMode?"Mode sombre Aurora":"Mode clair"}</span>
          <span style={{width:32,height:18,borderRadius:9,background:darkMode?"linear-gradient(135deg,#9D86FF,#4ECDC4)":"rgba(255,255,255,.15)",position:"relative",transition:"all .25s",boxShadow:darkMode?"0 0 12px rgba(157,134,255,.5)":"none"}}>
            <span style={{position:"absolute",top:2,left:darkMode?16:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .25s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
          </span>
        </div>
        <Item k="settings" label="Paramètres" onClick={openSettings}/>
        <Item k="info" label="À propos" onClick={openAbout}/>
        <div onClick={()=>{if(confirm("Se déconnecter ?")){onClose();logout();}}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:8,color:"#FF6B6B",fontSize:12.5,fontWeight:500,cursor:"pointer"}}>
          <Ic k="logout" s={15} c="#FF6B6B"/>
          <span>Déconnexion</span>
        </div>
        <div style={{textAlign:"center",fontSize:9,color:"rgba(255,255,255,.2)",padding:"6px 0"}}>DRIVE v{APP_VERSION}</div>
      </div>
    </div>
  </>;
}


function SettingsPanel({auth,theme,changeTheme,th,nearby,setNearby,radius,setRadius,fetchSites,flash,logout,setPage,onClose,setShowAbout,fuelPref,changeFuel,windThreshold=80,changeWindThr=()=>{},uploadAvatar,techAvatars={}}){
  const[showFuels,setShowFuels]=useState(false);
  const[myStats,setMyStats]=useState({visits:0,photos:0,edits:0});
  useEffect(()=>{(async()=>{try{
    const now=new Date();const m1=new Date(now.getFullYear(),now.getMonth(),1).toISOString();
    const[v,p,e]=await Promise.all([
      dbGet("visits",`technician_code=eq.${auth.code}&visited_at=gte.${m1}&select=id`),
      dbGet("photos",`technician_code=eq.${auth.code}&select=id`),
      dbGet("activity_log",`technician_code=eq.${auth.code}&action=eq.edit&created_at=gte.${m1}&select=id`),
    ]);
    setMyStats({visits:v?.length||0,photos:p?.length||0,edits:e?.length||0});
  }catch(e){}})();},[]);
  const selFuel=FUELS.find(f=>f.key===fuelPref)||FUELS[0];
  const themeList=[
    {key:"forest",name:"Forêt",bg:"linear-gradient(135deg,#071a12,#0a2e24)",primary:"#1B8A6B",accent:"#4ECDC4"},
    {key:"orange",name:"Orange",bg:"linear-gradient(135deg,#1a0a00,#331500)",primary:"#FF7900",accent:"#FF7900"},
    {key:"midnight",name:"Nuit",bg:"linear-gradient(135deg,#0f1729,#1a2744)",primary:"#4A90D9",accent:"#6CB4EE"},
    {key:"amoled",name:"AMOLED",bg:"linear-gradient(135deg,#000,#050505)",primary:"#1B8A6B",accent:"#4ECDC4"},
    {key:"arctic",name:"Arctique",bg:"linear-gradient(135deg,#0a1628,#132e4a)",primary:"#2196F3",accent:"#64B5F6"},
    {key:"volcano",name:"Volcan",bg:"linear-gradient(135deg,#1a0505,#2d0a0a)",primary:"#E53935",accent:"#FF7043"},
    {key:"lavender",name:"Lavande",bg:"linear-gradient(135deg,#1a1028,#251540)",primary:"#7E57C2",accent:"#B39DDB"},
    {key:"sahara",name:"Sahara",bg:"linear-gradient(135deg,#1a1408,#2d2010)",primary:"#D4A017",accent:"#FFD54F"},
    {key:"ocean",name:"Océan",bg:"linear-gradient(135deg,#041a1a,#0a2e2e)",primary:"#00897B",accent:"#4DB6AC"},
    {key:"carbon",name:"Carbone",bg:"linear-gradient(135deg,#141414,#1e1e1e)",primary:"#78909C",accent:"#B0BEC5"},
  ];
  const Sec=({t,children})=><div style={{marginBottom:16}}><p style={{fontSize:10,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:1,margin:"0 0 8px",padding:"0 4px"}}>{t}</p><div style={{background:"#fff",borderRadius:14,border:"1px solid #F0F0F0",overflow:"hidden"}}>{children}</div></div>;
  const Row=({icon,label,sub,right,last,onClick,danger})=><div onClick={onClick} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:last?"none":"1px solid #F5F5F5",cursor:onClick?"pointer":"default"}}><span style={{color:danger?"#E74C3C":th.primary,display:"flex"}}>{icon}</span><div style={{flex:1}}><span style={{fontSize:13,fontWeight:500,color:danger?"#E74C3C":"#1A1A1A"}}>{label}</span>{sub&&<div style={{fontSize:10,color:"#999",marginTop:1}}>{sub}</div>}</div>{right||<I.Chev/>}</div>;
  const Tog=({on,fn})=><div onClick={fn} style={{width:44,height:26,borderRadius:13,background:on?th.primary:"#DDD",padding:2,cursor:"pointer",transition:"background .2s"}}><div style={{width:22,height:22,borderRadius:11,background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.2)",transform:on?"translateX(18px)":"translateX(0)",transition:"transform .2s"}}/></div>;

  return<div style={S.ov} className="drv-ov" onClick={onClose}><div style={{...S.modal,maxHeight:"85vh",background:"#F7F7F8"}} className="drv-modal" onClick={e=>e.stopPropagation()}>
    <div style={S.mH}><h2 style={{fontSize:17,fontWeight:800,margin:0}}>Paramètres</h2><button style={S.iBtn} onClick={onClose}><I.X/></button></div>
    <div style={{...S.mB,padding:"14px 16px"}}>

      {/* Profile */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"#fff",borderRadius:14,border:"1px solid #F0F0F0",marginBottom:16}}>
        <div style={{position:"relative"}}>
          <TechAvatar name={auth.name} code={auth.code} url={auth.avatar_url} size={48} fontSize={16}/>
          <label style={{position:"absolute",bottom:-2,right:-2,width:20,height:20,borderRadius:10,background:th.primary,border:"2px solid #fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            <input type="file" accept="image/*" onChange={async e=>{const f=e.target.files[0];if(!f)return;try{await uploadAvatar(f);flash("Photo mise à jour ✓");}catch(err){flash("Erreur upload");}e.target.value="";}} style={{display:"none"}}/>
          </label>
        </div>
        <div style={{flex:1}}><p style={{fontSize:14,fontWeight:700,color:"#1A1A1A",margin:0}}>{auth.name||auth.code}</p><p style={{fontSize:11,color:"#999",margin:"1px 0 0"}}>{auth.code}{auth.role==="admin"?" · Admin":""}</p></div>
      </div>

      {/* Stats perso (Feature 27) */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:16}}>
        <div style={{background:"#fff",borderRadius:12,padding:"10px 6px",textAlign:"center",border:"1px solid #F0F0F0"}}><div style={{fontSize:20,fontWeight:900,color:th.primary}}>{myStats.visits}</div><div style={{fontSize:8,fontWeight:600,color:"#999",marginTop:2}}>Visites ce mois</div></div>
        <div style={{background:"#fff",borderRadius:12,padding:"10px 6px",textAlign:"center",border:"1px solid #F0F0F0"}}><div style={{fontSize:20,fontWeight:900,color:"#1565C0"}}>{myStats.edits}</div><div style={{fontSize:8,fontWeight:600,color:"#999",marginTop:2}}>Modifs ce mois</div></div>
        <div style={{background:"#fff",borderRadius:12,padding:"10px 6px",textAlign:"center",border:"1px solid #F0F0F0"}}><div style={{fontSize:20,fontWeight:900,color:"#7B1FA2"}}>{myStats.photos}</div><div style={{fontSize:8,fontWeight:600,color:"#999",marginTop:2}}>Photos total</div></div>
      </div>

      {/* Carburant */}
      <Sec t="Carburant">
        <Row icon={<I.Drop/>} label="Mon carburant" sub={selFuel.label} onClick={()=>setShowFuels(!showFuels)} right={<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11,fontWeight:700,color:selFuel.color,background:`${selFuel.color}15`,padding:"3px 8px",borderRadius:8}}>{selFuel.short}</span><I.Chev/></div>}/>
        {showFuels&&<div style={{padding:"8px 10px 12px"}}>
          {FUELS.map(f=><div key={f.key} onClick={()=>{changeFuel(f.key);setShowFuels(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px",borderRadius:10,cursor:"pointer",marginBottom:2,background:fuelPref===f.key?`${f.color}10`:"transparent",border:fuelPref===f.key?`1.5px solid ${f.color}`:"1.5px solid transparent"}}>
            <div style={{width:10,height:10,borderRadius:5,background:f.color,flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:800,color:"#fff",background:f.color,padding:"2px 7px",borderRadius:5,minWidth:28,textAlign:"center",flexShrink:0}}>{f.short}</span>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#1A1A1A"}}>{f.label}</div><div style={{fontSize:10,color:"#999"}}>{f.total?"Premium Total":"Standard"}</div></div>
            {f.total&&<span style={{fontSize:7,fontWeight:800,padding:"2px 5px",borderRadius:4,background:"#FFF3E0",color:"#E65100",border:"1px solid #FFE0B2"}}>TOTAL</span>}
            {fuelPref===f.key&&<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={f.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>)}
          <p style={{fontSize:9,color:"#BBB",margin:"8px 0 0",padding:"0 10px",lineHeight:1.4}}>Les prix Excellium ne sont pas distingués dans l'API. Le prix du carburant de base sera affiché avec la mention "Excellium" sur les stations Total.</p>
        </div>}
        <Row icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={th.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>} label="Mes cartes" sub="WEX · GR" last right={<div style={{display:"flex",gap:4}}><span style={{fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4,background:"#E3F2FD",color:"#1565C0",border:"1px solid #BBDEFB"}}>WEX</span><span style={{fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4,background:"#FFF3E0",color:"#E65100",border:"1px solid #FFE0B2"}}>GR</span></div>}/>
      </Sec>

      {/* Affichage */}
      <Sec t="Affichage">
        <Row icon={<I.Near/>} label="Mode proximité" right={<Tog on={nearby} fn={()=>setNearby(!nearby)}/>}/>
        {nearby&&<div style={{padding:"8px 14px 12px",borderBottom:"1px solid #F5F5F5",display:"flex",gap:6}}>
          {[1,5,10,25].map(r=><button key={r} onClick={()=>setRadius(r)} style={{padding:"5px 12px",borderRadius:14,border:radius===r?`1px solid ${th.primary}`:"1px solid #E8E8E8",background:radius===r?th.primary:"#fff",color:radius===r?"#fff":"#888",fontSize:11,fontWeight:700,cursor:"pointer"}}>{r}km</button>)}
        </div>}
        <div style={{padding:"10px 14px",borderBottom:"1px solid #F5F5F5"}}>
          <p style={{fontSize:10,fontWeight:600,color:"#999",margin:"0 0 8px"}}>Thème</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
            {themeList.map(t=><div key={t.key} onClick={()=>changeTheme(t.key)} style={{textAlign:"center",cursor:"pointer"}}>
              <div style={{width:"100%",aspectRatio:"1",borderRadius:10,background:t.bg,border:theme===t.key?`2.5px solid ${th.accent}`:"2.5px solid #E8E8E8",boxShadow:theme===t.key?`0 0 8px ${th.accent}33`:"none",overflow:"hidden",position:"relative"}}>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:"30%",display:"flex"}}>
                  <div style={{flex:1,background:t.primary||"#1B8A6B"}}/><div style={{flex:1,background:t.accent||"#4ECDC4"}}/>
                </div>
              </div>
              <span style={{fontSize:8,color:theme===t.key?th.primary:"#999",fontWeight:600,marginTop:3,display:"block"}}>{t.name}</span>
            </div>)}
          </div>
        </div>
        <Row icon={<I.Globe/>} label="À propos" onClick={setShowAbout} last/>
      </Sec>


      <Sec t="Sécurité">
        <Row icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={th.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>} label={`Alerte vent: ${windThreshold}km/h`} sub="Seuil pour alerte rafales"/>
        <div style={{padding:"8px 14px 12px",borderBottom:"1px solid #F5F5F5",display:"flex",gap:6}}>
          {[60,70,80,90,100].map(v=><button key={v} onClick={()=>changeWindThr(v)} style={{padding:"5px 10px",borderRadius:14,border:windThreshold===v?`1px solid ${th.primary}`:"1px solid #E8E8E8",background:windThreshold===v?th.primary:"#fff",color:windThreshold===v?"#fff":"#888",fontSize:11,fontWeight:700,cursor:"pointer"}}>{v}</button>)}
        </div>
      </Sec>

      {/* Hors-ligne */}
      <Sec t="Mode hors-ligne">
        <OfflinePanel auth={auth} flash={flash} fetchSites={fetchSites}/>
      </Sec>

      {/* Données */}
      <Sec t="Données">
        <Row icon={<I.Ref/>} label="Actualiser les sites" onClick={()=>{onClose();fetchSites();flash("Actualisation...");}}/>
        <Row icon={<I.Del/>} label="Vider le cache" onClick={()=>{ls.del("drv_cache");ls.del("drv_favs");ls.del("drv_stations");ls.del("drv_stations_ts");try{idbOpen().then(db=>{const tx=db.transaction("cache","readwrite");tx.objectStore("cache").clear();});}catch(e){}onClose();flash("Cache vidé ✓");}} last/>
      </Sec>

      {/* Admin */}
      {auth.role==="admin"&&<Sec t="Administration">
        <Row icon={<I.Dash/>} label="Dashboard admin" onClick={()=>{onClose();setPage("admin");}} last/>
      </Sec>}

      {/* Déconnexion */}
      <div style={{marginBottom:16}}>
        <div style={{background:"#fff",borderRadius:14,border:"1px solid #F0F0F0",overflow:"hidden"}}>
          <Row icon={<I.Out/>} label="Se déconnecter" onClick={()=>{onClose();logout();}} danger last/>
        </div>
      </div>

    </div>
  </div></div>;
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
function Toasty({m}){const[leaving,setLeaving]=useState(false);const[vis,setVis]=useState(true);useEffect(()=>{const t1=setTimeout(()=>setLeaving(true),2000);const t2=setTimeout(()=>setVis(false),2400);return()=>{clearTimeout(t1);clearTimeout(t2);};},[]);if(!vis)return null;return<div style={{...S.toast,animation:leaving?"toastOut .4s ease forwards":"toastIn .3s ease both"}}>{m}</div>;}

// ============================================================
// STYLES
// ============================================================
