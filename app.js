const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbw3GyI4cK4WlbiHsKcUSIQuiHIJ0cYUISgSrOGniAsRw8Z0l6-Jn6uQ_9Gne4l-8oMc4Q/exec",
  YEARS: [],
  CATEGORIES: ["Surat Keluar","Surat Masuk","Minit Mesyuarat","Program PIBG","Sumbangan PIBG","Galeri"]
};

let state = {year:2026, category:"ALL", docs:[], stats:{}, token:null, user:null};
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minit; mesti sepadan dengan TOKEN_TTL di Apps Script
let sessionTimer = null;
const $ = id => document.getElementById(id);
document.querySelectorAll(".yearNow").forEach(x=>x.textContent=new Date().getFullYear());

function startSessionTimer(expiresAt){
  clearTimeout(sessionTimer);
  const remaining = Number(expiresAt) - Date.now();
  if(!Number.isFinite(remaining) || remaining <= 0){
    forceLogout("Sesi log masuk telah tamat. Sila log masuk semula.");
    return;
  }
  sessionTimer = setTimeout(()=>forceLogout("Sesi log masuk telah tamat. Sila log masuk semula."), remaining);
}

function checkSessionExpiry(){
  const expiresAt = Number(sessionStorage.getItem("pibg_expires_at") || 0);
  if(expiresAt && Date.now() >= expiresAt){
    forceLogout("Sesi log masuk telah tamat. Sila log masuk semula.");
    return false;
  }
  if(expiresAt) startSessionTimer(expiresAt);
  return true;
}

function forceLogout(message){
  clearTimeout(sessionTimer);
  sessionTimer = null;
  sessionStorage.removeItem("pibg_token");
  sessionStorage.removeItem("pibg_user");
  sessionStorage.removeItem("pibg_expires_at");
  if(message) sessionStorage.setItem("pibg_logout_reason", message);
  location.reload();
}

function jsonp(params){
  return new Promise((resolve,reject)=>{
    if(params.token && !checkSessionExpiry()){
      reject(new Error("Sesi log masuk telah tamat. Sila log masuk semula."));
      return;
    }
    const cb="cb"+Date.now()+Math.random().toString(36).slice(2);
    const s=document.createElement("script");
    const q=new URLSearchParams({...params,callback:cb});
    s.src=CONFIG.API_URL+"?"+q.toString();
    const timer=setTimeout(()=>{cleanup();reject(new Error("Server tidak memberi respons."))},15000);
    window[cb]=data=>{
      cleanup();
      if(params.token && data && data.ok===false && /sesi log masuk diperlukan/i.test(data.message||"")){
        forceLogout("Sesi log masuk telah tamat. Sila log masuk semula.");
        return;
      }
      resolve(data);
    };
    s.onerror=()=>{cleanup();reject(new Error("Gagal menyambung ke server."))};
    document.body.appendChild(s);
    function cleanup(){clearTimeout(timer);delete window[cb];s.remove()}
  });
}

async function sha256Hex(text){
  const data=new TextEncoder().encode(String(text));
  const hash=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function login(e){
  e.preventDefault();
  $("loginMsg").textContent="Menyemak...";
  try{
    const username=$("username").value.trim();
    const password=$("password").value;
    if(!username||!password) throw new Error("Username dan password diperlukan.");

    // Password tidak dihantar ke server. Server beri nonce sekali guna;
    // browser menghantar proof = SHA256(SHA256(password) + ":" + nonce).
    const challenge=await jsonp({action:"challenge",username});
    if(!challenge.ok) throw new Error(challenge.message||"Gagal memulakan log masuk.");
    const passwordHash=await sha256Hex(password);
    const proof=await sha256Hex(passwordHash+":"+challenge.nonce);
    const data=await jsonp({action:"login",username,nonce:challenge.nonce,proof});
    if(!data.ok) throw new Error(data.message||"Username atau password salah.");
    state.token=data.token;state.user=data.user;
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessionStorage.setItem("pibg_token",state.token);
    sessionStorage.setItem("pibg_user",JSON.stringify(state.user));
    sessionStorage.setItem("pibg_expires_at",String(expiresAt));
    startSessionTimer(expiresAt);
    $("password").value="";
    showApp();
  }catch(err){$("loginMsg").textContent=err.message}
}

async function loadYears(){
  const data = await jsonp({action:"years",token:state.token});
  if(!data.ok) throw new Error(data.message||"Gagal mendapatkan senarai tahun.");
  CONFIG.YEARS = (data.years||[]).map(Number).filter(y=>Number.isInteger(y));
  if(!CONFIG.YEARS.length) CONFIG.YEARS=[new Date().getFullYear()];
  if(!CONFIG.YEARS.includes(Number(state.year))) state.year=CONFIG.YEARS[0];
}

async function showApp(){
  $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
  $("userRole").textContent=(state.user?.role||"USER").toUpperCase();
  $("adminBtn").classList.toggle("hidden", state.user?.role !== "Admin");
  await loadYears();
  buildYears();buildSideNav();await load();
}
function buildYears(){
  $("yearTabs").innerHTML=CONFIG.YEARS.map(y=>`<button class="${y===state.year?"active":""}" onclick="setYear(${y})">${y}</button>`).join("");
  $("sideYears").innerHTML=CONFIG.YEARS.map(y=>`<button class="${y===state.year?"active":""}" onclick="setYear(${y})">${y}</button>`).join("");
}
function buildSideNav(){
  document.querySelectorAll("#sideNav button").forEach(b=>{
    b.classList.toggle("active",b.dataset.cat===state.category);
    b.onclick=()=>{state.category=b.dataset.cat;document.body.classList.toggle("category-mode",state.category!=="ALL");buildSideNav();load();closeSidebarMobile()};
  });
  document.body.classList.toggle("category-mode",state.category!=="ALL");
}
function closeSidebarMobile(){if(window.innerWidth<=760)document.querySelector(".sidebar")?.classList.remove("open")}
function setYear(y){state.year=y;buildYears();load()}
async function load(){
  const search=$("searchInput").value.trim();
  $("documentTable").innerHTML='<tr><td colspan="6" style="text-align:center;padding:30px">Memuatkan rekod...</td></tr>';
  try{
    const data=await jsonp({action:"documents",year:state.year,category:state.category,search,token:state.token});
    if(!data.ok) throw new Error(data.message||"Gagal mendapatkan data.");
    state.docs=data.documents||[];state.stats=data.stats||{};renderStats();renderDocs();
    $("sectionTitle").textContent=state.category==="ALL"?"Dokumen Terkini":state.category;
  }catch(err){
    $("documentTable").innerHTML="";$("empty").classList.remove("hidden");$("empty").textContent=err.message;
  }
}
const catMeta={"Surat Keluar":["➤"],"Surat Masuk":["▣"],"Minit Mesyuarat":["▤"],"Program PIBG":["▦"],"Sumbangan PIBG":["♡"],"Galeri":["▧"]};
function renderStats(){
  $("stats").innerHTML=CONFIG.CATEGORIES.map(c=>{
    const n=state.stats[c]||0;return `<div class="stat" onclick="state.category='${c}';buildSideNav();load()"><div class="ico">${catMeta[c][0]}</div><h4>${c}</h4><b>${n}</b><small>${c==="Galeri"?"item":"dokumen"}</small></div>`
  }).join("");
}
function renderDocs(){
  const tbody=$("documentTable");tbody.innerHTML="";
  const home=$("homeDocuments");home.innerHTML="";
  $("resultCount").textContent=state.docs.length?`${state.docs.length} rekod`:"";

  if(!state.docs.length){
    $("empty").classList.remove("hidden");
    home.innerHTML='<div class="home-doc-empty">Tiada rekod untuk pilihan semasa.</div>';
    return;
  }
  $("empty").classList.add("hidden");

  if(state.category==="ALL"){
    state.docs.slice(0,5).forEach((d)=>{
      const ext=(d.format||"PDF").toUpperCase();
      const card=document.createElement("article");
      card.className="home-doc-card";
      card.innerHTML=`
        <div class="doc-card-top">
          <div class="doc-type ${ext.toLowerCase()}">${esc(ext.slice(0,3))}</div>
          <span class="doc-arrow">›</span>
        </div>
        <h4>${esc(d.title||"Tanpa tajuk")}</h4>
        <div class="doc-ref-line">${esc(d.ref||"Tiada rujukan")}</div>
        <div class="doc-date">▣ ${esc(d.date||"—")}</div>
        <span class="doc-tag">${esc(d.category||"Dokumen")}</span>`;
      card.onclick=()=>openViewer(d);
      home.appendChild(card);
    });
  }

  state.docs.slice(0,100).forEach((d,i)=>{
    const ext=(d.format||"PDF").toUpperCase();const tr=document.createElement("tr");
    tr.innerHTML=`<td>${i+1}</td><td><div class="file-mini"><div class="file-mini-icon">${esc(ext.slice(0,3))}</div><div><div class="doc-name">${esc(d.title||"Tanpa tajuk")}</div><div class="doc-ref">${esc(d.keywords||"")}</div></div></div></td><td>${esc(d.date||"")}</td><td>${esc(d.ref||"—")}</td><td><span class="tag">${esc(d.category||"")}</span></td><td><button class="table-open">Buka</button></td>`;
    tr.onclick=()=>openViewer(d);tbody.appendChild(tr);
  });
}
function openViewer(d){$("viewerTitle").textContent=d.title||"Dokumen";$("viewerMeta").textContent=[d.ref,d.date,d.category].filter(Boolean).join(" · ");$("openDoc").href=d.link||"#";$("viewerFrame").src=d.link||"about:blank";$("viewer").classList.remove("hidden")}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

// ADMIN PANEL
function openAdmin(){if(state.user?.role!=="Admin")return;$("adminModal").classList.remove("hidden");populateAdminForm();loadAdminDocs();loadAdminUsers()}
function closeAdmin(){$("adminModal").classList.add("hidden")}
function populateAdminForm(){
  $("docYear").innerHTML=CONFIG.YEARS.map(y=>`<option value="${y}" ${y===state.year?"selected":""}>${y}</option>`).join("");
  $("docCategory").innerHTML=CONFIG.CATEGORIES.map(c=>`<option>${c}</option>`).join("");
}
function resetDocForm(){$("docForm").reset();$("docId").value="";populateAdminForm();$("docYear").value=state.year;$("docFormat").value="PDF";$("docMsg").textContent=""}
async function loadAdminDocs(){
  const box=$("adminDocList");box.innerHTML="<div class='admin-loading'>Memuatkan...</div>";
  try{
    const data=await jsonp({action:"documents",year:state.year,category:"ALL",search:"",token:state.token});
    if(!data.ok)throw new Error(data.message||"Gagal memuatkan.");
    if(!data.documents?.length){box.innerHTML="<div class='admin-empty'>Tiada dokumen untuk tahun ini.</div>";return}
    box.innerHTML=data.documents.map(d=>`<div class="admin-item"><div><strong>${esc(d.title)}</strong><small>${esc(d.category)} · ${esc(d.date||"")}</small></div><div class="admin-item-actions"><button class="mini-btn" onclick='editDoc(${JSON.stringify(d).replace(/'/g,"&#39;")})'>Edit</button><button class="mini-btn danger" onclick="deleteDoc('${esc(d.id)}')">Nyahaktif</button></div></div>`).join("");
  }catch(e){box.innerHTML=`<div class='admin-empty'>${esc(e.message)}</div>`}
}
function editDoc(d){
  $("docId").value=d.id||"";$("docYear").value=d.year||state.year;$("docCategory").value=d.category||CONFIG.CATEGORIES[0];$("docTitle").value=d.title||"";$("docDate").value=d.date||"";$("docRef").value=d.ref||"";$("docFormat").value=d.format||"PDF";$("docLink").value=d.link||"";$("docKeywords").value=d.keywords||"";$("docMsg").textContent="Mod edit: sila simpan perubahan.";
}
async function saveDoc(e){
  e.preventDefault();$("docMsg").textContent="Menyimpan...";
  const p={action:$("docId").value?"updateDocument":"addDocument",token:state.token,id:$("docId").value,year:$("docYear").value,category:$("docCategory").value,title:$("docTitle").value,date:$("docDate").value,ref:$("docRef").value,format:$("docFormat").value,link:$("docLink").value,keywords:$("docKeywords").value};
  try{const data=await jsonp(p);if(!data.ok)throw new Error(data.message||"Gagal menyimpan.");$("docMsg").textContent="Berjaya disimpan.";resetDocForm();await load();await loadAdminDocs()}catch(e){$("docMsg").textContent=e.message}
}
async function deleteDoc(id){if(!confirm("Nyahaktifkan dokumen ini?"))return;try{const data=await jsonp({action:"deleteDocument",id,token:state.token});if(!data.ok)throw new Error(data.message||"Gagal.");await load();await loadAdminDocs()}catch(e){alert(e.message)}}
async function loadAdminUsers(){
  const box=$("adminUserList");box.innerHTML="<div class='admin-loading'>Memuatkan...</div>";
  try{
    const data=await jsonp({action:"users",token:state.token});
    if(!data.ok)throw new Error(data.message||"Gagal memuatkan.");
    box.innerHTML=(data.users||[]).map(u=>`<div class="admin-item"><div><strong>${esc(u.username)}</strong><small>${esc(u.role)} · ${esc(u.status)}</small></div><div class="admin-item-actions"><span class="status-dot">●</span><button class="mini-btn" onclick="changeUserPassword('${esc(u.username)}')">Tukar Password</button></div></div>`).join("");
  }catch(e){box.innerHTML=`<div class='admin-empty'>${esc(e.message)}</div>`}
}
async function changeUserPassword(username){
  const p1=prompt(`Masukkan password baru untuk ${username}:`);
  if(p1===null)return;
  if(p1.length<10){alert("Password mesti sekurang-kurangnya 10 aksara.");return;}
  const p2=prompt("Masukkan semula password baru untuk pengesahan:");
  if(p2===null)return;
  if(p1!==p2){alert("Password tidak sepadan.");return;}
  try{
    const passwordHash=await sha256Hex(p1);
    const data=await jsonp({action:"changeUserPassword",token:state.token,username,passwordHash});
    if(!data.ok)throw new Error(data.message||"Gagal menukar password.");
    alert(`Password ${username} berjaya ditukar.`);
  }catch(e){alert(e.message)}
}
async function addUser(e){
  e.preventDefault();$("userMsg").textContent="Menyimpan...";
  try{
    const username=$("newUsername").value.trim();
    const password=$("newPassword").value;
    if(password.length<10) throw new Error("Gunakan password sekurang-kurangnya 10 aksara.");
    const passwordHash=await sha256Hex(password);
    const data=await jsonp({action:"addUser",token:state.token,username,passwordHash,role:$("newRole").value});
    if(!data.ok)throw new Error(data.message||"Gagal menambah pengguna.");
    $("userMsg").textContent="Pengguna berjaya ditambah.";$("userForm").reset();await loadAdminUsers()
  }catch(e){$("userMsg").textContent=e.message}
}

$("loginForm").addEventListener("submit",login);
$("searchBtn").onclick=load;$("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")load()});
$("clearFilter").onclick=()=>{state.category="ALL";$("searchInput").value="";document.body.classList.remove("category-mode");buildSideNav();load()};
$("closeViewer").onclick=$("closeViewer2").onclick=()=>{$("viewer").classList.add("hidden");$("viewerFrame").src="about:blank"};
$("menuBtn").onclick=()=>$("appView").querySelector(".sidebar").classList.toggle("open");
$("logoutBtn").onclick=()=>forceLogout();
$("adminBtn").onclick=openAdmin;$("closeAdmin").onclick=closeAdmin;$("docForm").addEventListener("submit",saveDoc);$("resetDoc").onclick=resetDocForm;$("userForm").addEventListener("submit",addUser);
document.querySelectorAll(".admin-tab").forEach(tab=>tab.onclick=()=>{document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));tab.classList.add("active");const docs=tab.dataset.adminTab==="docs";$("adminDocs").classList.toggle("hidden",!docs);$("adminUsers").classList.toggle("hidden",docs)});

(function init(){
  const reason=sessionStorage.getItem("pibg_logout_reason");
  if(reason){
    sessionStorage.removeItem("pibg_logout_reason");
    $("loginMsg").textContent=reason;
  }
  const token=sessionStorage.getItem("pibg_token"),user=sessionStorage.getItem("pibg_user"),expiresAt=sessionStorage.getItem("pibg_expires_at");
  if(token&&user&&expiresAt){
    if(!checkSessionExpiry()){
      return;
    }
    try{
      state.token=token;
      state.user=JSON.parse(user);
      showApp();
    }catch(e){
      sessionStorage.clear();
    }
  }else if(token||user||expiresAt){
    sessionStorage.clear();
  }
  window.addEventListener("focus",checkSessionExpiry);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkSessionExpiry()});
})();
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}
