import {firebaseConfig} from "./firebase-config.js";
import {INITIAL_SEATING_DATA} from "./seating-data.js";
import {initializeApp} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {getAuth,signInAnonymously} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {getFirestore,collection,doc,addDoc,setDoc,updateDoc,deleteDoc,onSnapshot,serverTimestamp,query,orderBy,getDoc,getDocs,writeBatch} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $=s=>document.querySelector(s), esc=(v="")=>String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
let prepareCategoryFilter=localStorage.getItem("wccPrepareFilter")||"all";
let db,view="dashboard",tasks=[],taskItems=[],categories=[],groups=[],flows=[],checks=[],people=[],rosters=[],rosterMembers=[],settings={title:"駿瑋 & 忞靜 婚禮管家",weddingDate:"",initialized:false},taskFlowSelection=new Set(),taskOwnerSelection=new Set(),flowOwnerSelection=new Set(),flowRosterSelection=new Set(),rosterTableSelection=new Set();

let adminSetupShown=false;
const ADMIN_DURATION_MS=30*60*1000;
const isAdmin=()=>Date.now()<Number(localStorage.getItem("wccAdminUntil")||0);
async function hashPassword(value){
 const bytes=new TextEncoder().encode(value);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function refreshAdminSession(){if(isAdmin())localStorage.setItem("wccAdminUntil",String(Date.now()+ADMIN_DURATION_MS))}
function applyPermissions(){
 const admin=isAdmin();
 const adminOnlyViews=new Set(["taskcenter","prepare","people","settings"]);
 if(!admin&&adminOnlyViews.has(view)){
  view="dashboard";
  document.body.classList.remove("banquet-mode");
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.view==="dashboard"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id==="dashboard"));
 }
 document.body.classList.toggle("admin-mode",admin);
 const btn=$("#adminModeButton");
 if(btn){btn.textContent=admin?"👑":"🔒";btn.classList.toggle("active",admin);btn.title=admin?"點擊退出管理模式":"長按標題或點擊輸入管理密碼";}
 const blocked=new Set(["new-category","new-task","print-prepare-pdf","new-person-task","new-center-task","new-person-item","add-subitem","edit-subitem","delete-subitem","edit-task","delete-task","new-roster","edit-roster","add-roster-member","edit-roster-member","delete-roster-member","delete-roster","delete-roster","add-roster-member","edit-roster-member","delete-roster-member","new-group","edit-group","delete-group","new-flow","edit-flow","delete-flow","add-check","edit-check","delete-check","new-person","edit-person","delete-person","move-category-up","move-category-down","delete-category","move-group-up","move-group-down","move-flow-up","move-flow-down","save-settings","export-csv","change-admin-password"]);
 document.querySelectorAll("[data-action]").forEach(el=>{if(blocked.has(el.dataset.action))el.classList.add("admin-hidden")});
 document.querySelectorAll(".toolbar").forEach(el=>el.classList.toggle("admin-hidden",!admin));
 document.querySelectorAll(".admin-only-tab").forEach(tab=>{
  tab.classList.toggle("admin-hidden",!admin);
  tab.hidden=!admin;
  tab.tabIndex=admin?0:-1;
 })
 $("#fab")?.classList.toggle("admin-hidden",!admin||view==="banquet");
}
function requestAdmin(){
 if(isAdmin()){localStorage.removeItem("wccAdminUntil");applyPermissions();render();return}
 $("#adminLoginPassword").value="";$("#adminLoginError").textContent="";$("#adminLoginDialog").showModal();
}
let currentUser=localStorage.getItem("wccUser")||"",
 collapsedGroups=new Set(JSON.parse(localStorage.getItem("wccCollapsedGroups")||"[]")),
 collapsedRosters=new Set(JSON.parse(localStorage.getItem("wccCollapsedRosters")||"[]")),
 rosterSearch=localStorage.getItem("wccRosterSearch")||"",
 collapsedTasks=new Set(JSON.parse(localStorage.getItem("wccCollapsedTasks")||"[]")),
 collapsedFlows=new Set(JSON.parse(localStorage.getItem("wccCollapsedFlows")||"[]")),
 collapsedFlowPackages=new Set(JSON.parse(localStorage.getItem("wccCollapsedFlowPackages")||"[]"));
const defaults={categories:[["文定準備","💍"],["迎娶準備","🚗"],["婚宴準備","🥂"],["攝影錄影","📸"]],groups:[["集合與準備","📍"],["文定","💍"],["迎娶","🚗"],["婚宴","🥂"],["送客與收尾","🧹"]],flows:[["08:00","集合","📍","集合與準備"],["09:00","文定","💍","文定"],["11:00","迎娶","🚗","迎娶"],["18:00","婚宴","🥂","婚宴"]]};
const category=id=>categories.find(x=>x.id===id), linkedTask=id=>tasks.find(x=>x.id===id), group=id=>groups.find(x=>x.id===id), flow=id=>flows.find(x=>x.id===id);
const taskOwnerNames=t=>{
 const list=Array.isArray(t?.owners)?t.owners.filter(Boolean):[];
 if(list.length)return [...new Set(list)];
 return t?.owner?[t.owner]:[];
};
const taskHasOwner=(t,name)=>Boolean(name&&taskOwnerNames(t).includes(name));
const taskOwnerText=t=>taskOwnerNames(t).join("、")||"未指定";
const flowOwnerNames=f=>{
 const list=Array.isArray(f?.owners)?f.owners.filter(Boolean):[];
 if(list.length)return [...new Set(list)];
 return f?.owner?[f.owner]:[];
};
const flowHasOwner=(f,name)=>Boolean(name&&flowOwnerNames(f).includes(name));
const flowOwnerText=f=>flowOwnerNames(f).join("、")||"未指定";
const normalizeFlowTimeMode=f=>{
 if(f?.timeMode)return f.timeMode;
 if(f?.startTime&&f?.endTime)return "range";
 if(f?.time)return "single";
 return "none";
};
const formatFlowTime=f=>{
 const mode=normalizeFlowTimeMode(f);
 if(mode==="range"){
  const start=f.startTime||f.time||"";
  const end=f.endTime||"";
  return start&&end?`${start}－${end}`:(start||end||"");
 }
 if(mode==="single")return f.time||f.startTime||"";
 return "";
};
function updateFlowTimeFields(){
 const mode=$("#flowTimeMode")?.value||"none";
 $("#flowSingleTimeField")?.classList.toggle("active",mode==="single");
 $("#flowRangeTimeFields")?.classList.toggle("active",mode==="range");
}

const itemsForTask=id=>taskItems.filter(x=>x.taskId===id).sort((a,b)=>(a.sort??0)-(b.sort??0));
const membersForRoster=id=>rosterMembers.filter(x=>x.rosterId===id).sort((a,b)=>(a.order??0)-(b.order??0));
const seatingTables=[...INITIAL_SEATING_DATA].sort((a,b)=>Number(a.tableNo)-Number(b.tableNo));
const tableLabel=no=>{
 const t=seatingTables.find(x=>String(x.tableNo)===String(no));
 return t?`${t.tableNo}桌${t.tableName?`・${t.tableName}`:""}`:`${no}桌`;
};
const memberTables=m=>Array.isArray(m?.tableNos)?m.tableNos.map(String):[];
function renderRosterTablePicker(){
 const box=$("#rosterTablePicker");
 if(!box)return;
 box.innerHTML=seatingTables.map(t=>{
  const no=String(t.tableNo),selected=rosterTableSelection.has(no);
  return `<button type="button" class="table-chip ${selected?"selected":""}" data-table-no="${esc(no)}">
   ${selected?"✓ ":""}${esc(t.tableNo)}桌
   ${t.tableName?`<small>${esc(t.tableName)}</small>`:""}
  </button>`;
 }).join("");
 box.onclick=e=>{
  const b=e.target.closest("[data-table-no]");
  if(!b)return;
  const no=b.dataset.tableNo;
  rosterTableSelection.has(no)?rosterTableSelection.delete(no):rosterTableSelection.add(no);
  $("#rosterMemberTables").value=[...rosterTableSelection].join(",");
  renderRosterTablePicker();
 };
}
const personById=id=>people.find(x=>x.id===id);

const currentPerson=()=>people.find(p=>p.name===currentUser);
const myRosterEntries=()=>{
 const person=currentPerson();
 if(!person)return [];
 return rosters.flatMap(r=>membersForRoster(r.id)
   .filter(m=>m.personId===person.id)
   .map(m=>({roster:r,member:m,flow:flow(r.flowId)})));
};
const scheduleTimeValue=value=>{
 if(!value||!/^\d{2}:\d{2}$/.test(value))return 9999;
 const [h,m]=value.split(":").map(Number);return h*60+m;
};

const taskProgress=t=>{const list=itemsForTask(t.id);const done=list.filter(x=>x.done).length;return {list,done,total:list.length,complete:list.length>0&&done===list.length};};

function setView(v){
 const adminOnlyViews=new Set(["taskcenter","prepare","people","settings"]);
 if(adminOnlyViews.has(v)&&!isAdmin()){requestAdmin();return;}
 view=v;document.body.classList.toggle("banquet-mode",v==="banquet");document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.view===v));document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id===v));render()}
$("#tabs").onclick=e=>{const b=e.target.closest("[data-view]");if(b)setView(b.dataset.view)};
function renderHeader(){
 const title=settings.title||"駿瑋 & 忞靜 婚禮管家";
 const couple=title.replace(/婚禮\s*(Checklist|清單|管家|指揮中心|工作中心)?/gi,"").trim()||"駿瑋 & 忞靜";
 const coupleTitle=$("#coupleTitle");if(coupleTitle)coupleTitle.textContent=`${couple} 婚禮`;

 $("#currentUser").textContent=currentUser?`使用者：${currentUser}`:"尚未設定使用者";

 const left=daysLeft();
 const heroDays=$("#heroDays");if(heroDays)heroDays.textContent=typeof left==="number"?left:"--";
 const heroDate=$("#heroDate");
 if(heroDate)heroDate.textContent=settings.weddingDate
   ? new Date(settings.weddingDate+"T00:00:00").toLocaleDateString("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"})
   : "尚未設定婚禮日期";

 $("#peopleList").innerHTML=people.map(p=>`<option value="${esc(p.name)}">`).join("");

 const select=$("#currentUserSelect");
 if(select){
   select.innerHTML='<option value="">請選擇使用者</option>'+people.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("");
   select.value=people.some(p=>p.name===currentUser)?currentUser:"";
   select.onchange=e=>{
     currentUser=e.target.value;
     if(currentUser)localStorage.setItem("wccUser",currentUser);
     else localStorage.removeItem("wccUser");
     render();
   };
 }
}
function workKindIcon(kind){return {"接送":"🚗","採買":"🛍️","聯絡":"📞","協助":"🛠️","其他":"⭐","一般":"📋"}[kind]||"📋"}
function taskTimeLabel(t){return t.startTime?(t.endTime?`${t.startTime}－${t.endTime}`:t.startTime):"未定"}
function taskOrderValue(t){
 if(t.startTime&&/^\d{2}:\d{2}$/.test(t.startTime))return scheduleTimeValue(t.startTime);
 const linked=(t.flowIds||[]).map(id=>flow(id)).filter(Boolean);
 if(linked.length){
   return Math.min(...linked.map(f=>scheduleTimeValue(formatFlowTime(f))));
 }
 return 999999;
}
function sortTasksBySchedule(list){
 return [...list].sort((a,b)=>{
   const timeDiff=taskOrderValue(a)-taskOrderValue(b);
   if(timeDiff!==0)return timeDiff;
   return String(a.title||"").localeCompare(String(b.title||""),"zh-Hant");
 });
}
function pct(list){return list.length?Math.round(list.filter(x=>x.done).length/list.length*100):0}
function daysLeft(){if(!settings.weddingDate)return "未設定";const n=new Date();n.setHours(0,0,0,0);return Math.ceil((new Date(settings.weddingDate+"T00:00:00")-n)/86400000)}
function renderDashboard(){
 const myTasks=sortTasksBySchedule(tasks.filter(x=>taskHasOwner(x,currentUser)&&x.type==="工作"));
 const myItems=sortTasksBySchedule(tasks.filter(x=>taskHasOwner(x,currentUser)&&x.type==="物品"));

 const relatedFlows=flows
  .filter(f=>flowHasOwner(f,currentUser)||checks.some(c=>c.flowId===f.id&&c.owner===currentUser))
  .sort((a,b)=>scheduleTimeValue(formatFlowTime(a))-scheduleTimeValue(formatFlowTime(b)));

 const today=new Date();
 const todayKey=[
  today.getFullYear(),
  String(today.getMonth()+1).padStart(2,"0"),
  String(today.getDate()).padStart(2,"0")
 ].join("-");
 const weddingDate=settings.weddingDate||"";
 const isWeddingDay=Boolean(weddingDate&&todayKey===weddingDate);

 let realtimeFlow=null;
 let realtimeStatus="";
 let realtimeMinutes=null;

 if(isWeddingDay){
  const candidates=relatedFlows
   .map(f=>({f,min:minutesFromNowForFlow(f)}))
   .filter(x=>x.min!==null)
   .sort((a,b)=>a.min-b.min);

  realtimeFlow=candidates.find(x=>x.min>=0)?.f||relatedFlows[relatedFlows.length-1]||null;
  const matched=candidates.find(x=>x.f?.id===realtimeFlow?.id);
  realtimeMinutes=matched?.min??null;

  if(realtimeMinutes===0)realtimeStatus="🔴 進行中";
  else if(realtimeMinutes>0)realtimeStatus=`⏱️ 還有 ${realtimeMinutes} 分鐘`;
  else realtimeStatus="✅ 今日流程已結束";
 }

 $("#dashboard").innerHTML=`
 <section class="card realtime-card">
  <div class="card-head">
   <div>
    <div class="card-title">📍 7/18 即時行程</div>
    <div class="meta">婚禮當天自動顯示目前或下一個流程</div>
   </div>
  </div>

  ${isWeddingDay&&realtimeFlow?`
   <div class="realtime-main">
    <div class="realtime-time">${esc(formatFlowTime(realtimeFlow)||"未定")}</div>
    <div class="main">
     <div class="realtime-title">${esc(realtimeFlow.icon||"📍")} ${esc(realtimeFlow.name)}</div>
     <div class="meta">${realtimeFlow.location?`📍 ${esc(realtimeFlow.location)}`:"未設定地點"}</div>
     <div class="realtime-status">${esc(realtimeStatus)}</div>
     ${flowRosters(realtimeFlow).length?`<div class="realtime-rosters">📋 ${flowRosters(realtimeFlow).map(r=>esc(r.name)).join("、")}</div>`:""}
     ${mapUrl(realtimeFlow)?`<a class="map-link" href="${esc(mapUrl(realtimeFlow))}" target="_blank" rel="noopener">🗺️ 開啟導航</a>`:""}
    </div>
    <button class="small" data-action="go-flow" data-id="${realtimeFlow.id}">查看流程</button>
   </div>
  `:`<div class="empty">婚禮當天將自動顯示即時行程</div>`}
 </section>

 ${(()=>{
  const person=people.find(p=>p.name===currentUser);
  const assignments=person?rosterMembers.filter(m=>m.personId===person.id&&memberTables(m).length):[];
  if(!assignments.length)return "";
  const rows=assignments.flatMap(m=>{
   const roster=rosters.find(r=>r.id===m.rosterId);
   return memberTables(m).map(no=>({no,roster,m}));
  });
  return `<section class="card assigned-tables-card">
   <div class="card-head">
    <div>
     <div class="card-title">🪑 我的負責桌次</div>
     <div class="meta">招待帶位時可直接查看桌次</div>
    </div>
    <div class="pill">${rows.length} 桌</div>
   </div>
   <div class="assigned-table-grid">
    ${rows.map(x=>`<a class="assigned-table-card" href="./banquet.html#table-${encodeURIComponent(x.no)}" target="_blank" rel="noopener">
      <strong>${esc(x.no)}桌</strong>
      <span>${esc(tableLabel(x.no).replace(`${x.no}桌・`,""))}</span>
      <small>${esc(x.roster?.name||"工作名單")}${x.m.duty?`・${esc(x.m.duty)}`:""}</small>
    </a>`).join("")}
   </div>
  </section>`;
 })()}

 <section class="card compact-detail-card">
  <div class="card-head">
   <div class="card-title">✅ 任務</div>
   <div class="dashboard-card-tools">
    <div class="pill">${myTasks.filter(x=>x.done).length}/${myTasks.length}</div>
    <button class="small primary" data-action="new-person-task">＋新增任務</button>
   </div>
  </div>
  ${myTasks.map(taskRow).join("")||'<div class="empty">目前沒有任務</div>'}
 </section>

 <section class="card compact-detail-card">
  <div class="card-head">
   <div class="card-title">📦 準備物品</div>
   <div class="dashboard-card-tools">
    <div class="pill">${myItems.filter(x=>x.done).length}/${myItems.length}</div>
    <button class="small primary" data-action="new-person-item">＋新增物品</button>
   </div>
  </div>
  ${myItems.map(taskRow).join("")||'<div class="empty">目前沒有準備物品</div>'}
 </section>`;
}
function taskRow(t){
 const c=category(t.categoryId),p=taskProgress(t),collapsed=collapsedTasks.has(t.id);
 const effectiveDone=p.total?p.complete:t.done;
 return `<div class="task-shell ${effectiveDone?"done":""}">
  <div class="row">
   <input class="check" type="checkbox" data-action="toggle-task" data-id="${t.id}" ${effectiveDone?"checked":""}>
   <div class="main">
    <div class="name">${esc(t.title)}</div>
    <div class="meta">
     ${t.startTime?`⏰ ${esc(t.startTime)}${t.endTime?`－${esc(t.endTime)}`:""}<br>`:""}
     ${c?`${esc(c.icon)} ${esc(c.name)}・`:""}${esc(t.type||"工作")}
     <br>DRI：${esc(taskOwnerText(t))}
     ${t.location?`<br>地點：${esc(t.location)}`:""}
     ${t.address?`<br>地址：${esc(t.address)}`:""}
     ${(t.flowIds||[]).length?`<br>連動流程：${(t.flowIds||[]).map(id=>esc(flow(id)?.name||"已刪除")).join("、")}`:""}
     ${t.notes?`<br>${esc(t.notes)}`:""}
    </div>
    ${(t.address||t.location)?`<a class="map-link task-map-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.address||t.location)}" target="_blank" rel="noopener">🗺️ 開啟 Google 地圖</a>`:""}
    ${p.total?`<span class="sub-progress ${p.complete?"ok":""}">細項 ${p.done}/${p.total}</span>`:""}
   </div>
   <div class="actions">
    <button class="small" data-action="add-subitem" data-id="${t.id}">加細項</button>
    ${p.total?`<button class="expand-btn" data-action="toggle-task-expand" data-id="${t.id}">${collapsed?"展開":"收合"}</button>`:""}
    <button class="small" data-action="edit-task" data-id="${t.id}">修改</button>
    <button class="small danger" data-action="delete-task" data-id="${t.id}">刪除</button>
   </div>
  </div>
  ${p.total?`<div class="subitems ${collapsed?"collapsed":""}">
   ${p.list.map(i=>`<div class="sub-row ${i.done?"done":""}">
    <input class="check" type="checkbox" data-action="toggle-subitem" data-id="${i.id}" ${i.done?"checked":""}>
    <div class="main"><div class="name">${esc(i.title)}</div>${i.notes?`<div class="meta">${esc(i.notes)}</div>`:""}</div>
    <div class="actions"><button class="small" data-action="edit-subitem" data-id="${i.id}">修改</button><button class="small danger" data-action="delete-subitem" data-id="${i.id}">刪除</button></div>
   </div>`).join("")}
  </div>`:""}
 </div>`;
}
function renderTaskCenter(){
 const workTasks=tasks.filter(t=>t.type==="工作");
 const linked=new Map();
 const unlinked=[];

 workTasks.forEach(t=>{
   const ids=(t.flowIds||[]).filter(id=>flow(id));
   if(!ids.length){unlinked.push(t);return;}
   ids.forEach(id=>{
     if(!linked.has(id))linked.set(id,[]);
     linked.get(id).push(t);
   });
 });

 const orderedFlows=[...flows].sort((a,b)=>scheduleTimeValue(formatFlowTime(a))-scheduleTimeValue(formatFlowTime(b)));
 const completed=workTasks.filter(t=>t.done).length;

 const taskCard=t=>`<div class="task-center-task ${t.done?"done":""}">
   <input class="check" type="checkbox" data-action="toggle-task" data-id="${t.id}" ${t.done?"checked":""}>
   <div class="main">
    <div class="name">${esc(t.title)}</div>
    <div class="meta">
     負責：${esc(taskOwnerText(t))}
     ${t.startTime?`・${esc(t.startTime)}${t.endTime?`－${esc(t.endTime)}`:""}`:""}
     ${t.location?`<br>地點：${esc(t.location)}`:""}
    </div>
   </div>
   <div class="actions">
    <button class="small" data-action="edit-task" data-id="${t.id}">修改</button>
   </div>
  </div>`;

 $("#taskcenter").innerHTML=`
  <div class="task-center-summary card">
   <div>
    <div class="card-title">📋 任務中心</div>
    <div class="meta">依婚禮流程時間統整所有人的任務</div>
   </div>
   <div class="task-center-progress">
    <strong>${completed}/${workTasks.length}</strong>
    <span>已完成</span>
   </div>
  </div>

  <div class="toolbar">
   <button class="primary" data-action="new-center-task">＋新增任務</button>
  </div>

  ${orderedFlows.map(f=>{
    const list=linked.get(f.id)||[];
    if(!list.length)return "";
    const g=group(f.groupId);
    const done=list.filter(t=>t.done).length;
    return `<section class="card task-center-flow">
      <div class="task-center-flow-head">
       <div class="task-center-time">${esc(formatFlowTime(f)||"未定")}</div>
       <div class="main">
        <div class="card-title">${esc(f.icon||"📍")} ${esc(f.name)}</div>
        <div class="meta">${g?`${esc(g.icon||"🗂️")} ${esc(g.name)}・`:""}${f.location?esc(f.location):"未設定地點"}・任務 ${done}/${list.length}</div>
       </div>
       <button class="small" data-action="go-flow" data-id="${f.id}">查看流程</button>
      </div>
      <div class="task-center-list">${list.sort((a,b)=>(a.startTime||"99:99").localeCompare(b.startTime||"99:99")).map(taskCard).join("")}</div>
    </section>`;
  }).join("")}

  ${unlinked.length?`<section class="card task-center-flow unlinked">
    <div class="task-center-flow-head">
     <div class="task-center-time">尚未安排</div>
     <div class="main">
      <div class="card-title">🧩 尚尚未安排流程</div>
      <div class="meta">這些任務仍會出現在負責人的「我的行程」，但尚未指定婚禮流程時間點。</div>
     </div>
    </div>
    <div class="task-center-list">${unlinked.map(taskCard).join("")}</div>
   </section>`:""}

  ${!workTasks.length?'<div class="empty">尚未建立任務</div>':""}`;
}
function printPreparePdf(){
 const selectedCategoryId=prepareCategoryFilter==="all"?null:prepareCategoryFilter;
 const categoryList=selectedCategoryId
   ? categories.filter(c=>c.id===selectedCategoryId)
   : categories.filter(c=>tasks.some(t=>t.type==="物品"&&t.categoryId===c.id));

 const escPrint=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
 const weddingTitle=settings.title||"婚禮準備工作清單";
 const weddingDate=settings.weddingDate||"";
 const dateText=weddingDate?new Date(`${weddingDate}T00:00:00`).toLocaleDateString("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit"}):"";

 const sections=categoryList.map(c=>{
   const categoryTasks=tasks
     .filter(t=>t.type==="物品"&&t.categoryId===c.id)
     .sort((a,b)=>(a.sort??0)-(b.sort??0));

   if(!categoryTasks.length)return "";

   const rows=categoryTasks.map(t=>{
     const items=taskItems
       .filter(i=>i.taskId===t.id)
       .sort((a,b)=>(a.sort??0)-(b.sort??0));
     const owners=taskOwnerText(t);
     const rowCount=Math.max(items.length,1);

     if(!items.length){
       return `<tr>
         <td class="check-cell">☐</td>
         <td class="main-cell"><strong>${escPrint(t.title)}</strong>${t.notes?`<div class="note">${escPrint(t.notes)}</div>`:""}</td>
         <td class="sub-cell">—</td>
         <td class="owner-cell">${escPrint(owners)}</td>
         <td class="note-cell"></td>
       </tr>`;
     }

     return items.map((i,idx)=>`<tr>
       ${idx===0?`<td class="check-cell" rowspan="${rowCount}">☐</td>`:""}
       ${idx===0?`<td class="main-cell" rowspan="${rowCount}"><strong>${escPrint(t.title)}</strong>${t.notes?`<div class="note">${escPrint(t.notes)}</div>`:""}</td>`:""}
       <td class="sub-cell">☐ ${escPrint(i.title)}${i.notes?`<div class="note">${escPrint(i.notes)}</div>`:""}</td>
       ${idx===0?`<td class="owner-cell" rowspan="${rowCount}">${escPrint(owners)}</td>`:""}
       <td class="note-cell"></td>
     </tr>`).join("");
   }).join("");

   return `<section class="print-section">
     <h2>${escPrint(c.icon||"📦")} ${escPrint(c.name)}</h2>
     <table>
       <thead><tr><th>✓</th><th>準備內容</th><th>細項</th><th>負責人</th><th>備註</th></tr></thead>
       <tbody>${rows}</tbody>
     </table>
   </section>`;
 }).join("");

 if(!sections){
   alert("目前沒有可輸出的婚禮準備內容");
   return;
 }

 const win=window.open("","_blank","noopener,noreferrer");
 if(!win){
   alert("瀏覽器封鎖了列印視窗，請允許彈出式視窗後再試一次。");
   return;
 }

 win.document.write(`<!doctype html>
 <html lang="zh-Hant">
 <head>
  <meta charset="utf-8">
  <title>${escPrint(weddingTitle)}－婚禮準備工作清單</title>
  <style>
   @page{size:A4 portrait;margin:14mm 12mm}
   *{box-sizing:border-box}
   body{
     margin:0;
     color:#3d3032;
     font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC","Microsoft JhengHei",sans-serif;
     font-size:11pt;
     line-height:1.45;
     background:#fff;
   }
   .cover{
     border-bottom:2px solid #d8a9ae;
     margin-bottom:18px;
     padding-bottom:10px;
     display:flex;
     justify-content:space-between;
     align-items:flex-end;
     gap:20px;
   }
   .brand{font-size:10pt;letter-spacing:.18em;color:#9b7d80}
   h1{margin:4px 0 0;font-size:22pt}
   .date{text-align:right;color:#786669}
   .print-section{page-break-before:always}
   .print-section:first-of-type{page-break-before:auto}
   h2{
     margin:0 0 10px;
     padding:8px 12px;
     border-left:6px solid #c97881;
     background:#fbefef;
     font-size:16pt;
   }
   table{
     width:100%;
     border-collapse:collapse;
     table-layout:fixed;
   }
   th,td{
     border:1px solid #cabfc1;
     padding:8px 9px;
     vertical-align:top;
   }
   th{
     background:#f7eeee;
     font-weight:800;
     text-align:left;
   }
   th:nth-child(1),td:nth-child(1){width:7%;text-align:center}
   th:nth-child(2),td:nth-child(2){width:24%}
   th:nth-child(3),td:nth-child(3){width:32%}
   th:nth-child(4),td:nth-child(4){width:20%}
   th:nth-child(5),td:nth-child(5){width:17%}
   .main-cell,.owner-cell{background:#fffafa}
   .main-cell strong{font-size:11.5pt}
   .check-cell{font-size:16pt;font-weight:700}
   .note{margin-top:4px;color:#7e7072;font-size:9pt}
   .note-cell{height:34px}
   .footer{
     margin-top:14px;
     color:#9b898c;
     font-size:9pt;
     text-align:right;
   }
   @media print{
     .print-section{break-inside:auto}
     tr{break-inside:avoid}
   }
  </style>
 </head>
 <body>
  <header class="cover">
   <div>
    <div class="brand">WEDDING BUTLER</div>
    <h1>婚禮準備工作清單</h1>
   </div>
   <div class="date">
    <div>${escPrint(weddingTitle)}</div>
    ${dateText?`<div>${escPrint(dateText)}</div>`:""}
   </div>
  </header>
  ${sections}
  <div class="footer">由 Wedding Butler 產生</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),250);<\/script>
 </body>
 </html>`);
 win.document.close();
}
function renderPrepare(){
 const itemTasks=tasks.filter(t=>t.type==="物品");
 if(prepareCategoryFilter!=="all"&&!categories.some(c=>c.id===prepareCategoryFilter)){
   prepareCategoryFilter="all";
 }
 const visible=prepareCategoryFilter==="all"
   ? itemTasks
   : itemTasks.filter(t=>t.categoryId===prepareCategoryFilter);

 $("#prepare").innerHTML=`
  <div class="prepare-list-toolbar">
   <div class="prepare-filter-scroll" aria-label="婚禮準備大項篩選">
    <button class="prepare-filter ${prepareCategoryFilter==="all"?"active":""}" data-action="filter-prepare" data-id="all">
      全部 <span>${itemTasks.length}</span>
    </button>
    ${categories.map(c=>{
      const count=itemTasks.filter(t=>t.categoryId===c.id).length;
      return `<button class="prepare-filter ${prepareCategoryFilter===c.id?"active":""}" data-action="filter-prepare" data-id="${c.id}">
        ${esc(c.icon||"📦")} ${esc(c.name)} <span>${count}</span>
      </button>`;
    }).join("")}
   </div>

   <div class="prepare-toolbar-second-row">
    <div class="prepare-current-category">
     ${prepareCategoryFilter==="all"
       ? `<span class="prepare-current-label">目前：全部大項</span>`
       : (()=>{const c=categories.find(x=>x.id===prepareCategoryFilter);return `
          <span class="prepare-current-label">目前大項：${esc(c?.icon||"📦")} ${esc(c?.name||"")}</span>
          <details class="prepare-category-menu">
           <summary aria-label="大項操作選單">⋯</summary>
           <div class="prepare-category-menu-panel">
            <button class="small" data-action="move-category-up" data-id="${prepareCategoryFilter}">上移</button>
            <button class="small" data-action="move-category-down" data-id="${prepareCategoryFilter}">下移</button>
            <button class="small" data-action="edit-category" data-id="${prepareCategoryFilter}">修改大項</button>
            <button class="small danger" data-action="delete-category" data-id="${prepareCategoryFilter}">刪除大項</button>
           </div>
          </details>`;
        })()
     }
    </div>

    <div class="prepare-toolbar-actions">
     <button class="primary" data-action="new-category">＋新增大項</button>
     <button class="primary" data-action="new-task">＋新增準備內容</button>
     <button class="small" data-action="print-prepare-pdf">🖨️ PDF 工作清單</button>
    </div>
   </div>
  </div>

  <div class="card prepare-list-card">
   <div class="prepare-list-head">
    <div>完成</div>
    <div>準備內容</div>
    <div>誰準備</div>
    <div>大項</div>
    <div>進度</div>
    <div>操作</div>
   </div>

   <div class="prepare-list-body">
    ${visible.map(t=>{
      const c=category(t.categoryId),p=taskProgress(t),collapsed=collapsedTasks.has(t.id);
      const effectiveDone=p.total?p.complete:t.done;
      return `<div class="prepare-list-item ${effectiveDone?"done":""}">
       <div class="prepare-col-check">
        <input class="check" type="checkbox" data-action="toggle-task" data-id="${t.id}" ${effectiveDone?"checked":""}>
       </div>
       <div class="prepare-col-title">
        <button class="prepare-title-button" data-action="toggle-task-expand" data-id="${t.id}">
         <strong>${esc(t.title)}</strong>
         ${p.total?`<span>${collapsed?"▶":"▼"} ${p.done}/${p.total} 細項</span>`:""}
        </button>
        ${t.notes?`<div class="meta">${esc(t.notes)}</div>`:""}
       </div>
       <div class="prepare-col-owner">${esc(taskOwnerText(t))}</div>
       <div class="prepare-col-category">${c?`${esc(c.icon||"📦")} ${esc(c.name)}`:"未分類"}</div>
       <div class="prepare-col-progress">
        <span class="sub-progress ${effectiveDone?"ok":""}">${p.total?`${p.done}/${p.total}`:(t.done?"完成":"未完成")}</span>
       </div>
       <div class="prepare-col-actions">
        <button class="small" data-action="add-subitem" data-id="${t.id}">加細項</button>
        <button class="small" data-action="edit-task" data-id="${t.id}">修改</button>
        <button class="small danger" data-action="delete-task" data-id="${t.id}">刪除</button>
       </div>
       ${p.total?`<div class="prepare-subitems ${collapsed?"collapsed":""}">
        ${p.list.map(i=>`<div class="prepare-sub-row ${i.done?"done":""}">
          <input class="check" type="checkbox" data-action="toggle-subitem" data-id="${i.id}" ${i.done?"checked":""}>
          <div class="main"><div class="name">${esc(i.title)}</div>${i.notes?`<div class="meta">${esc(i.notes)}</div>`:""}</div>
          <div class="actions">
           <button class="small" data-action="edit-subitem" data-id="${i.id}">修改</button>
           <button class="small danger" data-action="delete-subitem" data-id="${i.id}">刪除</button>
          </div>
        </div>`).join("")}
       </div>`:""}
      </div>`;
    }).join("")||'<div class="empty">這個大項目前沒有準備內容</div>'}
   </div>
  </div>

  <div class="prepare-link-hint">
   指定「負責人」後，該準備內容會自動出現在該使用者的「我的行程 → 準備物品」，不需要重複建立。
  </div>`;
}
function mapUrl(f){if(f.mapUrl)return f.mapUrl;if(f.address)return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}`;return ""}
function linkedPreparationCard(ch){
 const t=linkedTask(ch.taskId);
 if(!t){
  return `<div class="row ${ch.done?"done":""}">
   <input class="check" type="checkbox" data-action="toggle-check" data-id="${ch.id}" ${ch.done?"checked":""}>
   <div class="main"><div class="name">${esc(ch.title)}</div><div class="meta">負責：${esc(ch.owner||"未指定")}</div></div>
   <div class="actions"><button class="small" data-action="edit-check" data-id="${ch.id}">修改</button><button class="small danger" data-action="delete-check" data-id="${ch.id}">刪除</button></div>
  </div>`;
 }
 const p=taskProgress(t),ready=p.total?p.complete:t.done;
 const packageKey=ch.id;
 const collapsed=collapsedFlowPackages.has(packageKey);
 return `<div class="flow-package ${ready?"done":""}">
  <div class="flow-package-head">
   <button class="package-toggle" data-action="toggle-flow-package" data-id="${packageKey}">${collapsed?"▶":"▼"}</button>
   <input class="check" type="checkbox" data-action="toggle-check" data-id="${ch.id}" ${ch.done?"checked":""}>
   <div class="main">
    <div class="name">${esc(ch.title)}</div>
    <div class="meta">負責：${esc(ch.owner||taskOwnerText(t)||"未指定")}・前置狀態：${ready?"✅ 已準備":"⚠️ 尚未準備"}${p.total?`（${p.done}/${p.total}）`:""}</div>
    ${p.total?`<div class="progress compact-progress"><span style="width:${Math.round(p.done/p.total*100)}%"></span></div>`:""}
   </div>
   <div class="actions">
    <button class="small" data-action="edit-check" data-id="${ch.id}">修改</button>
    <button class="small danger" data-action="delete-check" data-id="${ch.id}">刪除</button>
   </div>
  </div>
  <div class="flow-package-body ${collapsed?"collapsed":""}">
   ${p.total?p.list.map(i=>`<div class="sub-row ${i.done?"done":""}">
    <input class="check" type="checkbox" data-action="toggle-subitem" data-id="${i.id}" ${i.done?"checked":""}>
    <div class="main"><div class="name">${esc(i.title)}</div>${i.notes?`<div class="meta">${esc(i.notes)}</div>`:""}</div>
   </div>`).join(""):`<div class="empty small-empty">此準備項目沒有細項</div>`}
  </div>
 </div>`;
}

function flowCard(f){
 const list=checks.filter(x=>x.flowId===f.id),url=mapUrl(f),collapsed=collapsedFlows.has(f.id);
 const completed=list.filter(x=>x.done).length;
 return `<div class="flow-card card">
  <div class="card-head flow-head">
   <button class="flow-toggle" data-action="toggle-flow" data-id="${f.id}" aria-label="${collapsed?"展開流程":"收合流程"}">${collapsed?"▶":"▼"}</button>
   <div class="main flow-click-area" data-action="toggle-flow" data-id="${f.id}" role="button" tabindex="0">
    <div class="card-title">${formatFlowTime(f)?`${esc(formatFlowTime(f))}　`:""}${esc(f.icon||"📍")} ${esc(f.name)} <span class="flow-state-text">${collapsed?"（點擊展開）":"（點擊收合）"}</span></div>
    <div class="meta">負責人：${esc(flowOwnerText(f))}・確認 ${completed}/${list.length}${f.location?`<br>地點：${esc(f.location)}`:""}${f.address?`<br>地址：${esc(f.address)}`:""}</div>
    ${list.length?`<div class="progress compact-progress"><span style="width:${Math.round(completed/list.length*100)}%"></span></div>`:""}
    ${url?`<a class="map-link" href="${esc(url)}" target="_blank" rel="noopener">🗺️ 開啟 Google 地圖</a>`:""}
    ${f.notes?`<div class="meta">${esc(f.notes)}</div>`:""}
   </div>
   <div class="actions flow-desktop-actions">
    <button class="small" data-action="toggle-all-packages" data-id="${f.id}">全部展開／收合</button>
    <button class="small" data-action="move-flow-up" data-id="${f.id}">上移</button>
    <button class="small" data-action="move-flow-down" data-id="${f.id}">下移</button>
    <button class="small" data-action="add-check" data-id="${f.id}">加確認項</button>
    <button class="small" data-action="edit-flow" data-id="${f.id}">修改</button>
    <button class="small danger" data-action="delete-flow" data-id="${f.id}">刪除</button>
   </div>
   <details class="flow-mobile-menu">
    <summary aria-label="流程操作選單">⋯</summary>
    <div class="flow-mobile-menu-panel">
     <button class="small" data-action="toggle-all-packages" data-id="${f.id}">全部展開／收合</button>
     <button class="small" data-action="add-check" data-id="${f.id}">加確認項</button>
     <button class="small" data-action="edit-flow" data-id="${f.id}">修改</button>
     <button class="small" data-action="move-flow-up" data-id="${f.id}">上移</button>
     <button class="small" data-action="move-flow-down" data-id="${f.id}">下移</button>
     <button class="small danger" data-action="delete-flow" data-id="${f.id}">刪除</button>
    </div>
   </details>
  </div>
  <div class="flow-body ${collapsed?"collapsed":""}">
   ${list.map(linkedPreparationCard).join("")||'<div class="empty">尚未建立確認項目</div>'}
  </div>
 </div>`;
}


function renderRosters(){
 const query=rosterSearch.trim().toLowerCase();
 const cards=rosters.map(r=>{
  const members=membersForRoster(r.id);
  const filtered=query
   ? members.filter(m=>{
      const p=personById(m.personId);
      return [p?.name,m.duty,r.duty,m.notes,r.name]
       .filter(Boolean)
       .some(v=>String(v).toLowerCase().includes(query));
     })
   : members;
  const linked=flow(r.flowId);
  const collapsed=collapsedRosters.has(r.id);
  const hasMatches=!query||filtered.length>0||String(r.name||"").toLowerCase().includes(query);
  if(!hasMatches)return "";

  return `<section class="card roster-card roster-accordion ${collapsed?"is-collapsed":""}">
   <header class="roster-summary">
    <button class="roster-toggle" data-action="toggle-roster" data-id="${r.id}" aria-expanded="${!collapsed}">
     <span class="roster-toggle-icon">${collapsed?"▶":"▼"}</span>
     <span class="roster-summary-main">
      <span class="card-title">${esc(r.icon||"📋")} ${esc(r.name)}</span>
      <span class="meta">
       ${members.length} 人
       ${r.time?`・${esc(r.time)}`:""}
       ${r.location?`・📍 ${esc(r.location)}`:""}
       ${linked?`<br>流程：${esc(linked.name)}`:""}
       ${r.duty?`<br>共同工作：${esc(r.duty)}`:""}
      </span>
     </span>
    </button>

    <details class="roster-menu">
     <summary aria-label="名單操作">⋯</summary>
     <div class="roster-menu-panel">
      <button class="small" data-action="add-roster-member" data-id="${r.id}">加入成員</button>
      <button class="small" data-action="edit-roster" data-id="${r.id}">修改名單</button>
      <button class="small danger" data-action="delete-roster" data-id="${r.id}">刪除名單</button>
     </div>
    </details>
   </header>

   <div class="roster-body ${collapsed?"collapsed":""}">
    ${query?`<div class="roster-search-result">符合搜尋：${filtered.length} 人</div>`:""}
    <div class="roster-member-list">
     ${filtered.map(m=>{const p=personById(m.personId);return `<div class="roster-member-row">
       <div class="roster-order">${esc(m.order||"")}</div>
       <div class="main">
        <div class="name">${esc(p?.name||"已刪除人員")}</div>
        <div class="meta">${esc(m.duty||r.duty||"未設定工作")}${m.notes?`<br>${esc(m.notes)}`:""}</div>
        ${memberTables(m).length?`<div class="assigned-table-list">${memberTables(m).map(no=>`<a href="./banquet.html#table-${encodeURIComponent(no)}" target="_blank" rel="noopener">${esc(no)}桌</a>`).join("")}</div>`:""}
       </div>
       <details class="roster-member-menu">
        <summary aria-label="成員操作">⋯</summary>
        <div>
         <button class="small" data-action="edit-roster-member" data-id="${m.id}">修改</button>
         <button class="small danger" data-action="delete-roster-member" data-id="${m.id}">移除</button>
        </div>
       </details>
      </div>`}).join("")||'<div class="empty">沒有符合的成員</div>'}
    </div>
   </div>
  </section>`;
 }).join("");

 $("#rosters").innerHTML=`
  <div class="roster-toolbar">
   <label class="roster-search-box">
    <span>🔍</span>
    <input id="rosterSearchInput" type="search" value="${esc(rosterSearch)}" placeholder="搜尋姓名或工作">
   </label>
   <div class="roster-toolbar-actions">
    <button class="small" data-action="expand-all-rosters">全部展開</button>
    <button class="small" data-action="collapse-all-rosters">全部收合</button>
    <button class="primary" data-action="new-roster">新增名單</button>
   </div>
  </div>
  ${cards||'<div class="empty">尚未建立名單，或沒有符合搜尋的結果</div>'}`;

 const input=$("#rosterSearchInput");
 if(input){
  input.oninput=e=>{
   rosterSearch=e.target.value;
   localStorage.setItem("wccRosterSearch",rosterSearch);
   renderRosters();
   requestAnimationFrame(()=>{
    const next=$("#rosterSearchInput");
    if(next){
     next.focus();
     next.setSelectionRange(next.value.length,next.value.length);
    }
   });
  };
 }

 document.querySelectorAll(".roster-toggle").forEach(btn=>{
  btn.onclick=e=>{
   e.preventDefault();
   e.stopPropagation();
   const id=btn.dataset.id;
   collapsedRosters.has(id)?collapsedRosters.delete(id):collapsedRosters.add(id);
   localStorage.setItem("wccCollapsedRosters",JSON.stringify([...collapsedRosters]));
   renderRosters();
  };
 });
}

function renderTimeline(){
 const orderedGroups=[...groups].sort((a,b)=>(a.sort??0)-(b.sort??0));
 const ungrouped=orderedFlows(flows.filter(f=>!f.groupId||!group(f.groupId)));

 const timelineItem=f=>{
   const list=checks.filter(x=>x.flowId===f.id);
   const done=list.filter(x=>x.done).length;
   const collapsed=collapsedFlows.has(f.id);
   const url=mapUrl(f);
   const time=formatFlowTime(f)||"未定";
   const hasDetails=Boolean(list.length||f.notes||url||f.address);

   return `<article class="clean-timeline-item ${collapsed?"is-collapsed":""}">
    <div class="clean-timeline-time">${esc(time)}</div>
    <div class="clean-timeline-rail"><span></span></div>
    <div class="clean-timeline-card">
     <button class="clean-timeline-main" data-action="toggle-flow" data-id="${f.id}" aria-expanded="${!collapsed}">
      <div class="clean-timeline-title-row">
       <div class="clean-timeline-title">${esc(f.icon||"📍")} ${esc(f.name)}</div>
       ${hasDetails?`<span class="clean-timeline-chevron">${collapsed?"⌄":"⌃"}</span>`:""}
      </div>
      <div class="clean-timeline-meta">
       ${f.location?`<span>📍 ${esc(f.location)}</span>`:""}
       <span>👤 ${esc(flowOwnerText(f))}</span>
       <span>☑ ${done}/${list.length}</span>
       ${flowRosters(f).length?`<span>📋 ${flowRosters(f).length} 份名單</span>`:""}
      </div>
     </button>

     <div class="clean-timeline-details ${collapsed?"collapsed":""}">
      ${url?`<a class="map-link clean-map-link" href="${esc(url)}" target="_blank" rel="noopener">🗺️ 開啟 Google 地圖</a>`:""}
      ${f.notes?`<div class="clean-timeline-note">${esc(f.notes)}</div>`:""}
      ${list.length?`<div class="clean-check-list">
       ${list.map(ch=>`<label class="clean-check-row ${ch.done?"done":""}">
        <input class="check" type="checkbox" data-action="toggle-check" data-id="${ch.id}" ${ch.done?"checked":""}>
        <span>${esc(ch.title)}</span>
        ${ch.owner?`<small>${esc(ch.owner)}</small>`:""}
       </label>`).join("")}
      </div>`:""}

      ${flowRosters(f).length?`<section class="flow-linked-rosters">
       <div class="flow-linked-rosters-title">📋 工作名單（${flowRosters(f).length}）</div>
       ${flowRosters(f).map(r=>{
         const members=membersForRoster(r.id);
         return `<details class="flow-roster-card">
          <summary>
           <span>${esc(r.icon||"📋")} ${esc(r.name)}</span>
           <small>${members.length} 人</small>
          </summary>
          <div class="flow-roster-members">
           ${members.map(m=>{
             const p=personById(m.personId);
             return `<div class="flow-roster-member">
              <span class="flow-roster-order">${esc(m.order||"")}</span>
              <span><strong>${esc(p?.name||"已刪除人員")}</strong>${m.duty?`<small>${esc(m.duty)}</small>`:""}</span>
             </div>`;
           }).join("")||'<div class="empty">尚未加入成員</div>'}
          </div>
         </details>`;
       }).join("")}
       <button class="small" data-action="go-rosters">前往工作名單</button>
      </section>`:""}

      <div class="clean-timeline-admin">
       <button class="small" data-action="add-check" data-id="${f.id}">加確認項</button>
       <button class="small" data-action="move-flow-up" data-id="${f.id}">上移</button>
       <button class="small" data-action="move-flow-down" data-id="${f.id}">下移</button>
       <button class="small" data-action="edit-flow" data-id="${f.id}">修改</button>
       <button class="small danger" data-action="delete-flow" data-id="${f.id}">刪除</button>
      </div>
     </div>
    </div>
   </article>`;
 };

 const stageBlock=g=>{
   const list=orderedFlows(flows.filter(f=>f.groupId===g.id));
   const collapsed=collapsedGroups.has(g.id);
   const stageChecks=checks.filter(c=>list.some(f=>f.id===c.flowId));
   return `<section class="clean-stage">
    <header class="clean-stage-head">
     <button class="group-toggle" data-action="toggle-group" data-id="${g.id}">${collapsed?"▶":"▼"}</button>
     <div>
      <h2>${esc(g.icon||"🗂️")} ${esc(g.name)}</h2>
      <div class="meta">${list.length} 個流程・完成 ${stageChecks.filter(c=>c.done).length}/${stageChecks.length}</div>
     </div>
     <details class="clean-stage-menu">
      <summary>⋯</summary>
      <div>
       <button class="small" data-action="move-group-up" data-id="${g.id}">上移</button>
       <button class="small" data-action="move-group-down" data-id="${g.id}">下移</button>
       <button class="small" data-action="edit-group" data-id="${g.id}">修改</button>
       <button class="small danger" data-action="delete-group" data-id="${g.id}">刪除</button>
      </div>
     </details>
    </header>
    <div class="clean-stage-body ${collapsed?"collapsed":""}">
     ${list.map(timelineItem).join("")||'<div class="empty">此階段尚無流程</div>'}
    </div>
   </section>`;
 };

 $("#timeline").innerHTML=`
  <div class="toolbar clean-timeline-toolbar">
   <button class="primary" data-action="new-group">新增階段</button>
   <button class="primary" data-action="new-flow">新增流程</button>
  </div>
  <div class="clean-timeline">
   ${orderedGroups.map(stageBlock).join("")}
   ${ungrouped.length?`<section class="clean-stage">
    <header class="clean-stage-head"><div><h2>📌 其他流程</h2><div class="meta">${ungrouped.length} 個流程</div></div></header>
    <div class="clean-stage-body">${ungrouped.map(timelineItem).join("")}</div>
   </section>`:""}
  </div>`;
}
function minutesFromNowForFlow(f){
 const mode=normalizeFlowTimeMode(f);
 const raw=mode==="range"?(f.startTime||f.time||""):(mode==="single"?(f.time||f.startTime||""):"");
 if(!raw||!/^\d{2}:\d{2}$/.test(raw))return null;
 const [h,m]=raw.split(":").map(Number),now=new Date(),target=new Date();
 target.setHours(h,m,0,0);
 return Math.round((target-now)/60000);
}
function myFlowRow(f){
 const list=checks.filter(x=>x.flowId===f.id),done=list.filter(x=>x.done).length,url=mapUrl(f);
 return `<div class="row my-flow-row">
  <div class="flow-time-badge">${esc(formatFlowTime(f)||"未定")}</div>
  <div class="main">
   <div class="name">${esc(f.icon||"📍")} ${esc(f.name)}</div>
   <div class="meta">負責：${esc(flowOwnerText(f))}・確認 ${done}/${list.length}${f.location?`<br>地點：${esc(f.location)}`:""}${f.address?`<br>地址：${esc(f.address)}`:""}</div>
   ${list.length?`<div class="progress compact-progress"><span style="width:${Math.round(done/list.length*100)}%"></span></div>`:""}
   ${url?`<a class="map-link" href="${esc(url)}" target="_blank" rel="noopener">🗺️ 開啟 Google 地圖</a>`:""}
  </div>
  <div class="actions"><button class="small" data-action="go-flow" data-id="${f.id}">前往流程</button></div>
 </div>`;
}
function renderMine(){
 const myWork=sortTasksBySchedule(tasks.filter(x=>taskHasOwner(x,currentUser)&&x.type==="工作"));
 const myItems=sortTasksBySchedule(tasks.filter(x=>taskHasOwner(x,currentUser)&&x.type==="物品"));
 const myFlows=flows.filter(x=>x.owner===currentUser);
 const myChecks=checks.filter(x=>x.owner===currentUser);
 const upcoming=myFlows
  .map(f=>({f,min:minutesFromNowForFlow(f)}))
  .filter(x=>x.min!==null&&x.min>=0&&x.min<=60)
  .sort((a,b)=>a.min-b.min);

 $("#mine").innerHTML=`
 <div class="mine-summary grid">
  <div class="stat"><div class="meta">我的前置工作</div><div class="big">${myWork.filter(x=>!x.done).length}</div><div class="meta">未完成</div></div>
  <div class="stat"><div class="meta">我的準備物品</div><div class="big">${myItems.filter(x=>!x.done).length}</div><div class="meta">未完成</div></div>
  <div class="stat"><div class="meta">我的婚禮流程</div><div class="big">${myFlows.length}</div><div class="meta">負責流程</div></div>
  <div class="stat"><div class="meta">我的流程確認</div><div class="big">${myChecks.filter(x=>!x.done).length}</div><div class="meta">未確認</div></div>
 </div>

 ${upcoming.length?`<div class="card upcoming-card">
  <div class="card-head"><div><div class="card-title">⏰ 接下來 1 小時</div><div class="meta">依目前裝置時間計算</div></div></div>
  ${upcoming.map(x=>`<div class="row"><div class="flow-time-badge">${x.min===0?"現在":`${x.min} 分`}</div><div class="main"><div class="name">${esc(x.f.icon||"📍")} ${esc(x.f.name)}</div><div class="meta">${esc(formatFlowTime(x.f))}${x.f.location?`・${esc(x.f.location)}`:""}</div></div><div class="actions"><button class="small" data-action="go-flow" data-id="${x.f.id}">查看</button></div></div>`).join("")}
 </div>`:""}

 <div class="card">
  <div class="card-head"><div class="card-title">📝 我的前置工作</div><div class="pill ${myWork.length&&myWork.every(x=>x.done)?"ok":""}">${myWork.filter(x=>x.done).length}/${myWork.length}</div></div>
  ${myWork.map(taskRow).join("")||'<div class="empty">目前沒有分配的前置工作</div>'}
 </div>

 <div class="card">
  <div class="card-head"><div class="card-title">📦 我的準備物品</div><div class="pill ${myItems.length&&myItems.every(x=>x.done)?"ok":""}">${myItems.filter(x=>x.done).length}/${myItems.length}</div></div>
  ${myItems.map(taskRow).join("")||'<div class="empty">目前沒有分配的準備物品</div>'}
 </div>

 <div class="card">
  <div class="card-head"><div class="card-title">🎬 我的婚禮流程</div><div class="pill">${myFlows.length}</div></div>
  ${myFlows.map(myFlowRow).join("")||'<div class="empty">目前沒有負責的婚禮流程</div>'}
 </div>

 <div class="card">
  <div class="card-head"><div class="card-title">✅ 我的流程確認項目</div><div class="pill ${myChecks.length&&myChecks.every(x=>x.done)?"ok":""}">${myChecks.filter(x=>x.done).length}/${myChecks.length}</div></div>
  ${myChecks.map(ch=>`<div class="row ${ch.done?"done":""}">
   <input class="check" type="checkbox" data-action="toggle-check" data-id="${ch.id}" ${ch.done?"checked":""}>
   <div class="main"><div class="name">${esc(ch.title)}</div><div class="meta">${esc(flow(ch.flowId)?.name||"未指定流程")}</div></div>
   <div class="actions"><button class="small" data-action="go-flow" data-id="${ch.flowId}">前往流程</button></div>
  </div>`).join("")||'<div class="empty">目前沒有分配的流程確認項目</div>'}
 </div>`;
}
function renderPeople(){$("#people").innerHTML=`<div class="toolbar"><button class="primary" data-action="new-person">新增人員</button></div><div id="peopleSortList">${people.map(p=>`<div class="person-card" data-person-card="${p.id}"><div class="drag-handle" data-drag-person="${p.id}" title="拖曳排序">☰</div><div class="main"><strong>${esc(p.name)}</strong><div class="meta">${esc(p.role||"未設定角色")}・工作 ${tasks.filter(x=>x.owner===p.name&&x.type==="工作").length}・物品 ${tasks.filter(x=>x.owner===p.name&&x.type==="物品").length}</div></div><div class="actions"><button class="small" data-action="show-person" data-id="${p.id}">查看</button><button class="small" data-action="edit-person" data-id="${p.id}">修改</button><button class="small danger" data-action="delete-person" data-id="${p.id}">刪除</button></div></div>`).join("")||'<div class="empty">尚未建立人員</div>'}</div>`;initPersonDrag()}

function renderOverview(){
 const unfinishedTasks=tasks.filter(t=>!t.done);
 const incompleteChecks=checks.filter(c=>!c.done);
 $("#overview").innerHTML=`
 <div class="grid">
  <div class="stat"><div class="meta">前置準備</div><div class="big">${pct(tasks)}%</div><div class="progress"><span style="width:${pct(tasks)}%"></span></div></div>
  <div class="stat"><div class="meta">流程確認</div><div class="big">${pct(checks)}%</div><div class="progress"><span style="width:${pct(checks)}%"></span></div></div>
  <div class="stat"><div class="meta">工作名單</div><div class="big">${rosters.length}</div><div class="meta">${rosterMembers.length} 位成員</div></div>
  <div class="stat"><div class="meta">待處理</div><div class="big">${unfinishedTasks.length+incompleteChecks.length}</div><div class="meta">未完成項目</div></div>
 </div>
 ${groups.map(g=>{
   const fs=flows.filter(f=>f.groupId===g.id);
   const cs=checks.filter(c=>fs.some(f=>f.id===c.flowId));
   return `<div class="card"><div class="card-head"><div><div class="card-title">${esc(g.icon||"🗂️")} ${esc(g.name)}</div><div class="meta">${fs.length} 個流程・確認 ${cs.filter(c=>c.done).length}/${cs.length}</div></div></div></div>`;
 }).join("")}
 `;
}

function renderSettings(){$("#settings").innerHTML=`<div class="card"><div class="card-head"><div class="card-title">設定</div></div><div style="padding:16px"><label>網站名稱<input id="settingTitle" value="${esc(settings.title||"")}"></label><label>婚禮日期<input id="settingDate" type="date" value="${esc(settings.weddingDate||"")}"></label><div class="actions"><button class="primary" data-action="save-settings">儲存設定</button><button data-action="change-admin-password">修改管理密碼</button><button data-action="logout-admin">退出管理模式</button><button data-action="export-csv">匯出 CSV</button><button data-action="print">列印</button></div></div></div>`}
function render(){renderHeader();const renderer={dashboard:renderDashboard,taskcenter:renderTaskCenter,prepare:renderPrepare,rosters:renderRosters,timeline:renderTimeline,mine:renderMine,people:renderPeople,settings:renderSettings,banquet:()=>{}}[view];if(renderer)renderer();applyPermissions();if(view==="banquet")$("#banquetFrame")?.contentWindow?.postMessage({type:"wcc-admin",admin:isAdmin()},"*")}
document.body.addEventListener("click",e=>{const j=e.target.closest("[data-jump]");if(j)setView(j.dataset.jump)});
document.body.addEventListener("keydown",e=>{
 const area=e.target.closest?.(".flow-click-area");
 if(!area||!["Enter"," "].includes(e.key))return;
 e.preventDefault();
 area.click();
});

function close(id){const d=document.getElementById(id);if(d?.open)d.close()}document.body.addEventListener("click",e=>{const c=e.target.closest("[data-close]");if(c){close(c.dataset.close);return}if(e.target.tagName==="DIALOG")e.target.close()});

$("#adminModeButton").onclick=requestAdmin;
let logoPressTimer=null;
const appTitleEl=$("#appTitle");
if(appTitleEl){
 appTitleEl.addEventListener("pointerdown",()=>{logoPressTimer=setTimeout(requestAdmin,1800)});
 ["pointerup","pointercancel","pointerleave"].forEach(ev=>appTitleEl.addEventListener(ev,()=>clearTimeout(logoPressTimer)));
}

$("#adminSetupForm").onsubmit=async e=>{
 e.preventDefault();
 const a=$("#adminSetupPassword").value,b=$("#adminSetupConfirm").value;
 if(a.length<4)return alert("密碼至少 4 碼");
 if(a!==b)return alert("兩次密碼不一致");
 const hash=await hashPassword(a);
 await setDoc(doc(db,"wccSettings","main"),{adminPasswordHash:hash,adminPasswordCreatedAt:serverTimestamp()},{merge:true});
 localStorage.setItem("wccAdminUntil",String(Date.now()+ADMIN_DURATION_MS));
 close("adminSetupDialog");render();
};
$("#adminLoginForm").onsubmit=async e=>{
 e.preventDefault();
 const hash=await hashPassword($("#adminLoginPassword").value);
 if(!settings.adminPasswordHash||hash!==settings.adminPasswordHash){$("#adminLoginError").textContent="密碼不正確";return}
 localStorage.setItem("wccAdminUntil",String(Date.now()+ADMIN_DURATION_MS));
 close("adminLoginDialog");render();
};


function fillCategorySelect(){$("#taskCategory").innerHTML=categories.map(c=>`<option value="${c.id}">${esc(c.icon)} ${esc(c.name)}</option>`).join("")}
function renderTaskFlowPicker(){$("#taskFlowPicker").innerHTML=flows.map(f=>`<button type="button" class="chip ${taskFlowSelection.has(f.id)?"selected":""}" data-task-flow="${f.id}">${esc(formatFlowTime(f))} ${esc(f.name)}</button>`).join("")}
$("#taskFlowPicker").onclick=e=>{const b=e.target.closest("[data-task-flow]");if(!b)return;taskFlowSelection.has(b.dataset.taskFlow)?taskFlowSelection.delete(b.dataset.taskFlow):taskFlowSelection.add(b.dataset.taskFlow);renderTaskFlowPicker()};
function updateWorkExtraFields(){
 const box=$("#workExtraFields"),type=$("#taskType");
 if(box&&type)box.style.display=type.value==="工作"?"block":"none";
}
function renderTaskOwnerPicker(){
 const box=$("#taskOwnerPicker");
 if(!box)return;
 box.innerHTML=people.map(p=>{
   const selected=taskOwnerSelection.has(p.name);
   return `<button type="button" class="owner-chip ${selected?"selected":""}" data-owner-name="${esc(p.name)}">
    ${selected?"✓ ":""}${esc(p.name)}
   </button>`;
 }).join("")||'<div class="hint">請先到「人員」新增成員</div>';

 box.onclick=e=>{
   const b=e.target.closest("[data-owner-name]");
   if(!b)return;
   const name=b.dataset.ownerName;
   taskOwnerSelection.has(name)?taskOwnerSelection.delete(name):taskOwnerSelection.add(name);
   $("#taskOwner").value=[...taskOwnerSelection].join("、");
   renderTaskOwnerPicker();
 };
}
function openTask(t=null,forcedType=""){
 const type=forcedType||t?.type||"工作";
 $("#taskDialogTitle").textContent=t?"修改項目":type==="工作"?"新增任務":"新增準備內容";
 $("#taskId").value=t?.id||"";
 fillCategorySelect();
 $("#taskCategory").value=t?.categoryId||categories[0]?.id||"";
 $("#taskTitle").value=t?.title||"";
 $("#taskType").value=type;
 $("#taskWorkKind").value=t?.workKind||"一般";
 $("#taskStartTime").value=t?.startTime||"";
 $("#taskEndTime").value=t?.endTime||"";
 $("#taskLocation").value=t?.location||"";
 $("#taskAddress").value=t?.address||"";
 $("#taskPriority").value=String(t?.priority||1);
 taskOwnerSelection=new Set(
   Array.isArray(t?.owners)&&t.owners.length
     ? t.owners
     : (t?.owner?[t.owner]:(currentUser?[currentUser]:[]))
 );
 $("#taskOwner").value=[...taskOwnerSelection].join("、");
 renderTaskOwnerPicker();
 $("#taskNotes").value=t?.notes||"";
 taskFlowSelection=new Set(t?.flowIds||[]);
 renderTaskFlowPicker();
 updateWorkExtraFields();
 $("#taskDialog").showModal();
}
$("#taskType").onchange=updateWorkExtraFields
async function syncTaskChecks(taskId,payload,oldFlowIds=[]){const newIds=payload.flowIds||[],batch=writeBatch(db),existing=checks.filter(c=>c.autoFromTask&&c.taskId===taskId);for(const fId of newIds){if(!existing.some(c=>c.flowId===fId)){const r=doc(collection(db,"wccFlowChecks"));batch.set(r,{flowId:fId,title:payload.title,owner:(payload.owners||[]).join("、")||payload.owner||"",taskId,done:false,autoFromTask:true,sort:checks.filter(c=>c.flowId===fId).length,createdAt:serverTimestamp()})}else{existing.filter(c=>c.flowId===fId).forEach(c=>batch.update(doc(db,"wccFlowChecks",c.id),{title:payload.title,owner:(payload.owners||[]).join("、")||payload.owner||"",updatedAt:serverTimestamp()}))}}existing.filter(c=>!newIds.includes(c.flowId)).forEach(c=>batch.delete(doc(db,"wccFlowChecks",c.id)));await batch.commit()}
$("#taskForm").onsubmit=async e=>{e.preventDefault();const id=$("#taskId").value,p={
 title:$("#taskTitle").value.trim(),
 categoryId:$("#taskCategory").value,
 type:$("#taskType").value,
 workKind:$("#taskType").value==="工作"?$("#taskWorkKind").value:"",
 startTime:$("#taskType").value==="工作"?$("#taskStartTime").value:"",
 endTime:$("#taskType").value==="工作"?$("#taskEndTime").value:"",
 location:$("#taskType").value==="工作"?$("#taskLocation").value.trim():"",
 address:$("#taskType").value==="工作"?$("#taskAddress").value.trim():"",
 priority:$("#taskType").value==="工作"?Number($("#taskPriority").value)||1:1,
 owners:[...taskOwnerSelection],
 owner:[...taskOwnerSelection][0]||"",
 notes:$("#taskNotes").value.trim(),
 flowIds:[...taskFlowSelection],
 updatedAt:serverTimestamp()
};if(id){const old=tasks.find(x=>x.id===id);await updateDoc(doc(db,"wccTasks",id),p);await syncTaskChecks(id,p,old?.flowIds||[])}else{const ref=await addDoc(collection(db,"wccTasks"),{...p,done:false,sort:tasks.length,createdAt:serverTimestamp()});await syncTaskChecks(ref.id,p,[])}close("taskDialog")};


function openSubItem(item=null,taskId=""){
 $("#subItemDialogTitle").textContent=item?"修改細項":"新增細項";
 $("#subItemId").value=item?.id||"";
 $("#subItemTaskId").value=item?.taskId||taskId;
 $("#subItemTitle").value=item?.title||"";
 $("#subItemNotes").value=item?.notes||"";
 $("#subItemDialog").showModal();
}
async function refreshParentTask(taskId){
 const list=itemsForTask(taskId);
 if(!list.length)return;
 const complete=list.every(x=>x.done);
 await updateDoc(doc(db,"wccTasks",taskId),{done:complete,updatedAt:serverTimestamp(),updatedBy:currentUser});
}
$("#subItemForm").onsubmit=async e=>{
 e.preventDefault();
 const id=$("#subItemId").value,taskId=$("#subItemTaskId").value;
 const p={taskId,title:$("#subItemTitle").value.trim(),notes:$("#subItemNotes").value.trim(),updatedAt:serverTimestamp()};
 if(!p.title)return;
 if(id)await updateDoc(doc(db,"wccTaskItems",id),p);
 else await addDoc(collection(db,"wccTaskItems"),{...p,done:false,sort:itemsForTask(taskId).length,createdAt:serverTimestamp()});
 close("subItemDialog");
};


function openRoster(r=null){
 $("#rosterDialogTitle").textContent=r?"修改名單":"新增名單";
 $("#rosterId").value=r?.id||"";
 $("#rosterName").value=r?.name||"";
 $("#rosterIcon").value=r?.icon||"📋";
 $("#rosterTime").value=r?.time||"";
 $("#rosterLocation").value=r?.location||"";
 $("#rosterFlow").innerHTML='<option value="">不連結流程</option>'+flows.map(f=>`<option value="${f.id}">${esc(formatFlowTime(f))} ${esc(f.name)}</option>`).join("");
 $("#rosterFlow").value=r?.flowId||"";
 $("#rosterDuty").value=r?.duty||"";
 $("#rosterNotes").value=r?.notes||"";
 $("#rosterDialog").showModal();
}
$("#rosterForm").onsubmit=async e=>{
 e.preventDefault();
 const id=$("#rosterId").value,p={name:$("#rosterName").value.trim(),icon:$("#rosterIcon").value.trim()||"📋",time:$("#rosterTime").value,location:$("#rosterLocation").value.trim(),flowId:$("#rosterFlow").value,duty:$("#rosterDuty").value.trim(),notes:$("#rosterNotes").value.trim(),updatedAt:serverTimestamp()};
 if(id)await updateDoc(doc(db,"wccRosters",id),p);else await addDoc(collection(db,"wccRosters"),{...p,sort:rosters.length,createdAt:serverTimestamp()});
 close("rosterDialog");
};
function openRosterMember(m=null,rosterId=""){
 $("#rosterMemberDialogTitle").textContent=m?"修改名單成員":"加入名單成員";
 $("#rosterMemberId").value=m?.id||"";
 $("#rosterMemberRosterId").value=m?.rosterId||rosterId;
 $("#rosterMemberPerson").innerHTML=people.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
 $("#rosterMemberPerson").value=m?.personId||people[0]?.id||"";
 $("#rosterMemberOrder").value=m?.order||membersForRoster(rosterId).length+1;
 $("#rosterMemberDuty").value=m?.duty||"";
 rosterTableSelection=new Set(memberTables(m));
 $("#rosterMemberTables").value=[...rosterTableSelection].join(",");
 renderRosterTablePicker();
 $("#rosterMemberNotes").value=m?.notes||"";
 $("#rosterMemberDialog").showModal();
}
$("#rosterMemberForm").onsubmit=async e=>{
 e.preventDefault();
 const id=$("#rosterMemberId").value,p={rosterId:$("#rosterMemberRosterId").value,personId:$("#rosterMemberPerson").value,order:Number($("#rosterMemberOrder").value)||1,duty:$("#rosterMemberDuty").value.trim(),tableNos:[...rosterTableSelection],notes:$("#rosterMemberNotes").value.trim(),updatedAt:serverTimestamp()};
 if(id)await updateDoc(doc(db,"wccRosterMembers",id),p);else await addDoc(collection(db,"wccRosterMembers"),{...p,createdAt:serverTimestamp()});
 close("rosterMemberDialog");
};

function openGroup(g=null){$("#groupDialogTitle").textContent=g?"修改流程群組":"新增流程群組";$("#groupId").value=g?.id||"";$("#groupName").value=g?.name||"";$("#groupIcon").value=g?.icon||"🗂️";$("#groupDialog").showModal()}$("#groupForm").onsubmit=async e=>{e.preventDefault();const id=$("#groupId").value,p={name:$("#groupName").value.trim(),icon:$("#groupIcon").value.trim()||"🗂️",updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccFlowGroups",id),p):await addDoc(collection(db,"wccFlowGroups"),{...p,sort:groups.length,createdAt:serverTimestamp()});close("groupDialog")};
function renderFlowOwnerPicker(){
 const box=$("#flowOwnerPicker");
 if(!box)return;
 box.innerHTML=people.map(p=>{
   const selected=flowOwnerSelection.has(p.name);
   return `<button type="button" class="owner-chip ${selected?"selected":""}" data-flow-owner="${esc(p.name)}">
    ${selected?"✓ ":""}${esc(p.name)}
   </button>`;
 }).join("")||'<div class="hint">請先到「人員」新增成員</div>';

 box.onclick=e=>{
   const b=e.target.closest("[data-flow-owner]");
   if(!b)return;
   const name=b.dataset.flowOwner;
   flowOwnerSelection.has(name)?flowOwnerSelection.delete(name):flowOwnerSelection.add(name);
   $("#flowOwner").value=[...flowOwnerSelection].join("、");
   renderFlowOwnerPicker();
 };
}
const flowRosterIds=f=>Array.isArray(f?.rosterIds)?f.rosterIds.filter(Boolean):[];
const flowRosters=f=>flowRosterIds(f).map(id=>rosters.find(r=>r.id===id)).filter(Boolean);

function renderFlowRosterPicker(){
 const box=$("#flowRosterPicker");
 if(!box)return;
 box.innerHTML=rosters.map(r=>{
   const selected=flowRosterSelection.has(r.id);
   const count=membersForRoster(r.id).length;
   return `<button type="button" class="flow-roster-chip ${selected?"selected":""}" data-flow-roster="${r.id}">
    <span>${selected?"✓ ":""}${esc(r.icon||"📋")} ${esc(r.name)}</span>
    <small>${count} 人${r.time?`・${esc(r.time)}`:""}</small>
   </button>`;
 }).join("")||'<div class="hint">尚未建立工作名單，請先到「工作名單」新增。</div>';

 box.onclick=e=>{
   const b=e.target.closest("[data-flow-roster]");
   if(!b)return;
   const id=b.dataset.flowRoster;
   flowRosterSelection.has(id)?flowRosterSelection.delete(id):flowRosterSelection.add(id);
   $("#flowRosterIds").value=[...flowRosterSelection].join(",");
   renderFlowRosterPicker();
 };
}

function openFlow(f=null){
 $("#flowDialogTitle").textContent=f?"修改流程":"新增流程";
 $("#flowId").value=f?.id||"";
 $("#flowGroup").innerHTML='<option value="">未分組</option>'+groups.map(g=>`<option value="${g.id}">${esc(g.icon)} ${esc(g.name)}</option>`).join("");
 $("#flowGroup").value=f?.groupId||"";
 const mode=normalizeFlowTimeMode(f);
 $("#flowTimeMode").value=mode;
 $("#flowTime").value=mode==="single"?(f?.time||f?.startTime||""):"";
 $("#flowStartTime").value=mode==="range"?(f?.startTime||f?.time||""):"";
 $("#flowEndTime").value=mode==="range"?(f?.endTime||""):"";
 updateFlowTimeFields();
 $("#flowName").value=f?.name||"";
 $("#flowIcon").value=f?.icon||"📍";
 flowOwnerSelection=new Set(
   Array.isArray(f?.owners)&&f.owners.length
     ? f.owners
     : (f?.owner?[f.owner]:[])
 );
 $("#flowOwner").value=[...flowOwnerSelection].join("、");
 renderFlowOwnerPicker();
 flowRosterSelection=new Set(flowRosterIds(f));
 $("#flowRosterIds").value=[...flowRosterSelection].join(",");
 renderFlowRosterPicker();
 $("#flowLocation").value=f?.location||"";
 $("#flowAddress").value=f?.address||"";
 $("#flowMapUrl").value=f?.mapUrl||"";
 $("#flowNotes").value=f?.notes||"";
 $("#flowDialog").showModal();
}
$("#flowTimeMode").onchange=updateFlowTimeFields;
$("#flowForm").onsubmit=async e=>{
 e.preventDefault();
 const id=$("#flowId").value;
 const timeMode=$("#flowTimeMode").value;
 const singleTime=timeMode==="single"?$("#flowTime").value:"";
 const startTime=timeMode==="range"?$("#flowStartTime").value:"";
 const endTime=timeMode==="range"?$("#flowEndTime").value:"";
 if(timeMode==="range"&&startTime&&endTime&&endTime<startTime){
  alert("結束時間不能早於開始時間");
  return;
 }
 const p={
  groupId:$("#flowGroup").value,
  timeMode,
  time:singleTime,
  startTime,
  endTime,
  name:$("#flowName").value.trim(),
  icon:$("#flowIcon").value.trim()||"📍",
  owners:[...flowOwnerSelection],
  owner:[...flowOwnerSelection][0]||"",
  rosterIds:[...flowRosterSelection],
  location:$("#flowLocation").value.trim(),
  address:$("#flowAddress").value.trim(),
  mapUrl:$("#flowMapUrl").value.trim(),
  notes:$("#flowNotes").value.trim(),
  updatedAt:serverTimestamp()
 };
 if(id)await updateDoc(doc(db,"wccFlows",id),p);
 else await addDoc(collection(db,"wccFlows"),{...p,sort:flows.filter(x=>x.groupId===p.groupId).length,createdAt:serverTimestamp()});
 close("flowDialog");
};
function openCheck(ch=null,flowId=""){$("#checkDialogTitle").textContent=ch?"修改流程確認項目":"新增流程確認項目";$("#checkId").value=ch?.id||"";$("#checkFlowId").value=ch?.flowId||flowId;$("#checkTitle").value=ch?.title||"";
$("#checkOwner").innerHTML='<option value="">未指定</option>'+people.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}${p.role?`（${esc(p.role)}）`:""}</option>`).join("");
if(ch?.owner&&!people.some(p=>p.name===ch.owner)){
 $("#checkOwner").insertAdjacentHTML("beforeend",`<option value="${esc(ch.owner)}">${esc(ch.owner)}（舊資料）</option>`);
}
$("#checkOwner").value=ch?.owner||"";
$("#checkTaskLink").innerHTML='<option value="">不連結</option>'+tasks.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join("");$("#checkTaskLink").value=ch?.taskId||"";$("#checkDialog").showModal()}$("#checkForm").onsubmit=async e=>{e.preventDefault();const id=$("#checkId").value,p={flowId:$("#checkFlowId").value,title:$("#checkTitle").value.trim(),owner:$("#checkOwner").value,taskId:$("#checkTaskLink").value,autoFromTask:false,updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccFlowChecks",id),p):await addDoc(collection(db,"wccFlowChecks"),{...p,done:false,sort:checks.filter(x=>x.flowId===p.flowId).length,createdAt:serverTimestamp()});close("checkDialog")};
function openPerson(p=null){$("#personDialogTitle").textContent=p?"修改人員":"新增人員";$("#personId").value=p?.id||"";$("#personName").value=p?.name||"";$("#personRole").value=p?.role||"";$("#personDialog").showModal()}$("#personForm").onsubmit=async e=>{e.preventDefault();const id=$("#personId").value,p={name:$("#personName").value.trim(),role:$("#personRole").value.trim(),updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccPeople",id),p):await addDoc(collection(db,"wccPeople"),{...p,sort:people.length,createdAt:serverTimestamp()});close("personDialog")};
function openCategory(c=null){$("#categoryDialogTitle").textContent=c?"修改大項":"新增大項";$("#categoryId").value=c?.id||"";$("#categoryName").value=c?.name||"";$("#categoryIcon").value=c?.icon||"📂";$("#categoryDialog").showModal()}$("#categoryForm").onsubmit=async e=>{e.preventDefault();const id=$("#categoryId").value,p={name:$("#categoryName").value.trim(),icon:$("#categoryIcon").value.trim()||"📂",updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccCategories",id),p):await addDoc(collection(db,"wccCategories"),{...p,sort:categories.length,createdAt:serverTimestamp()});close("categoryDialog")};

async function deletePreparationCategory(id){
 const c=categories.find(x=>x.id===id);
 if(!c)return;

 const categoryTasks=tasks.filter(t=>t.categoryId===id);
 const count=categoryTasks.length;
 const message=count
   ? `「${c.name}」底下還有 ${count} 筆準備內容。\n\n按「確定」會連同這些準備內容與細項一起刪除。`
   : `確定刪除大項「${c.name}」？`;

 if(!confirm(message))return;

 const batch=writeBatch(db);
 const taskIds=new Set(categoryTasks.map(t=>t.id));

 taskItems
   .filter(i=>taskIds.has(i.taskId))
   .forEach(i=>batch.delete(doc(db,"wccTaskItems",i.id)));

 checks
   .filter(ch=>ch.autoFromTask&&taskIds.has(ch.taskId))
   .forEach(ch=>batch.delete(doc(db,"wccFlowChecks",ch.id)));

 categoryTasks.forEach(t=>batch.delete(doc(db,"wccTasks",t.id)));
 batch.delete(doc(db,"wccCategories",id));

 await batch.commit();

 prepareCategoryFilter="all";
 localStorage.setItem("wccPrepareFilter","all");
 renderPrepare();
}
async function swapOrder(list,coll,id,dir){const i=list.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=list.length)return;const a=list[i],b=list[j],batch=writeBatch(db);batch.update(doc(db,coll,a.id),{sort:b.sort??j});batch.update(doc(db,coll,b.id),{sort:a.sort??i});await batch.commit()}
const orderedFlows=list=>[...list].sort((a,b)=>{
 const sa=Number.isFinite(Number(a.sort))?Number(a.sort):999999;
 const sb=Number.isFinite(Number(b.sort))?Number(b.sort):999999;
 if(sa!==sb)return sa-sb;
 const ta=scheduleTimeValue(formatFlowTime(a));
 const tb=scheduleTimeValue(formatFlowTime(b));
 if(ta!==tb)return ta-tb;
 return String(a.name||"").localeCompare(String(b.name||""),"zh-Hant");
});

async function moveFlowWithinGroup(id,dir){
 const current=flow(id);
 if(!current)return;
 const groupId=current.groupId||"";
 const list=orderedFlows(flows.filter(f=>(f.groupId||"")===groupId));
 const from=list.findIndex(f=>f.id===id);
 const to=from+dir;
 if(from<0||to<0||to>=list.length)return;

 const reordered=[...list];
 const [moved]=reordered.splice(from,1);
 reordered.splice(to,0,moved);

 const batch=writeBatch(db);
 reordered.forEach((f,index)=>{
  batch.update(doc(db,"wccFlows",f.id),{sort:index,updatedAt:serverTimestamp()});
 });
 await batch.commit();
}
function csvExport(){const rows=[["類型","名稱","分類/流程","負責人","完成"]];tasks.forEach(t=>{const p=taskProgress(t);rows.push([t.type,t.title,category(t.categoryId)?.name||"",taskOwnerText(t),(p.total?p.complete:t.done)?"是":"否"]);p.list.forEach(i=>rows.push(["細項",`↳ ${i.title}`,t.title,taskOwnerText(t),i.done?"是":"否"]))});checks.forEach(c=>rows.push(["流程確認",c.title,flow(c.flowId)?.name||"",c.owner||"",c.done?"是":"否"]));const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="wedding-control-center.csv";a.click();URL.revokeObjectURL(a.href)}

function initPersonDrag(){let draggedId=null,startY=0;document.querySelectorAll("[data-drag-person]").forEach(h=>{h.onpointerdown=e=>{draggedId=h.dataset.dragPerson;startY=e.clientY;h.setPointerCapture(e.pointerId);document.querySelector(`[data-person-card="${draggedId}"]`)?.classList.add("dragging")};h.onpointermove=e=>{if(!draggedId)return;const cards=[...document.querySelectorAll("[data-person-card]")];cards.forEach(c=>c.classList.remove("drop-target"));const target=cards.find(c=>{const r=c.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom&&c.dataset.personCard!==draggedId});target?.classList.add("drop-target")};h.onpointerup=async e=>{if(!draggedId)return;const target=document.querySelector(".drop-target");document.querySelectorAll("[data-person-card]").forEach(c=>c.classList.remove("dragging","drop-target"));if(target){const from=people.findIndex(p=>p.id===draggedId),to=people.findIndex(p=>p.id===target.dataset.personCard);if(from!==to&&from>=0&&to>=0){const reordered=[...people],moved=reordered.splice(from,1)[0];reordered.splice(to,0,moved);const batch=writeBatch(db);reordered.forEach((p,i)=>batch.update(doc(db,"wccPeople",p.id),{sort:i}));await batch.commit()}}draggedId=null}})}

document.body.addEventListener("click",async e=>{const b=e.target.closest("[data-action]");if(!b)return;
if(b.classList.contains("flow-click-area")&&e.target.closest("a,button,input,select,textarea"))return;
const a=b.dataset.action,id=b.dataset.id;
const managementActions=new Set(["new-category","new-task","new-person-task","new-person-item","add-subitem","edit-subitem","delete-subitem","edit-task","delete-task","new-roster","edit-roster","delete-roster","add-roster-member","edit-roster-member","delete-roster-member","new-group","edit-group","delete-group","new-flow","edit-flow","delete-flow","add-check","edit-check","delete-check","new-person","edit-person","delete-person","move-category-up","move-category-down","move-group-up","move-group-down","move-flow-up","move-flow-down","save-settings","export-csv","change-admin-password"]);
if(managementActions.has(a)&&!isAdmin()){requestAdmin();return}
if(isAdmin())refreshAdminSession();
if(a==="filter-prepare"){
 prepareCategoryFilter=id||"all";
 localStorage.setItem("wccPrepareFilter",prepareCategoryFilter);
 renderPrepare();
 return;
}
if(a==="change-admin-password"){$("#adminSetupTitle").textContent="修改管理密碼";$("#adminSetupPassword").value="";$("#adminSetupConfirm").value="";$("#adminSetupDialog").showModal();return}
if(a==="logout-admin"){localStorage.removeItem("wccAdminUntil");setView("dashboard");return}

if(a==="new-person-task")openTask(null,"工作");
if(a==="new-center-task")openTask(null,"工作");
if(a==="print-prepare-pdf"){printPreparePdf();return;}
if(a==="new-person-item")openTask(null,"物品");
if(a==="new-task")openTask(null,"物品");
if(a==="edit-task")openTask(tasks.find(x=>x.id===id));
if(a==="add-subitem")openSubItem(null,id);
if(a==="edit-subitem")openSubItem(taskItems.find(x=>x.id===id));
if(a==="delete-subitem"&&confirm("刪除此細項？")){const item=taskItems.find(x=>x.id===id);await deleteDoc(doc(db,"wccTaskItems",id));if(item)setTimeout(()=>refreshParentTask(item.taskId),300)}
if(a==="toggle-subitem"){const item=taskItems.find(x=>x.id===id);await updateDoc(doc(db,"wccTaskItems",id),{done:b.checked,updatedAt:serverTimestamp(),updatedBy:currentUser});if(item)setTimeout(()=>refreshParentTask(item.taskId),300)}
if(a==="toggle-task-expand"){collapsedTasks.has(id)?collapsedTasks.delete(id):collapsedTasks.add(id);localStorage.setItem("wccCollapsedTasks",JSON.stringify([...collapsedTasks]));render()}
if(a==="delete-task"&&confirm("刪除此項目與所有細項？")){const batch=writeBatch(db);checks.filter(c=>c.taskId===id&&c.autoFromTask).forEach(c=>batch.delete(doc(db,"wccFlowChecks",c.id)));itemsForTask(id).forEach(i=>batch.delete(doc(db,"wccTaskItems",i.id)));batch.delete(doc(db,"wccTasks",id));await batch.commit()}
if(a==="toggle-task"){const list=itemsForTask(id);if(list.length){const batch=writeBatch(db);list.forEach(i=>batch.update(doc(db,"wccTaskItems",i.id),{done:b.checked,updatedAt:serverTimestamp(),updatedBy:currentUser}));batch.update(doc(db,"wccTasks",id),{done:b.checked,updatedAt:serverTimestamp(),updatedBy:currentUser});await batch.commit()}else await updateDoc(doc(db,"wccTasks",id),{done:b.checked,updatedAt:serverTimestamp(),updatedBy:currentUser});}
if(a==="go-flow"){
 collapsedFlows.delete(id);
 localStorage.setItem("wccCollapsedFlows",JSON.stringify([...collapsedFlows]));
 const targetFlow=flow(id);
 if(targetFlow?.groupId){
  collapsedGroups.delete(targetFlow.groupId);
  localStorage.setItem("wccCollapsedGroups",JSON.stringify([...collapsedGroups]));
 }
 setView("timeline");
 setTimeout(()=>document.querySelector(`[data-id="${id}"].flow-toggle`)?.scrollIntoView({behavior:"smooth",block:"center"}),120);
 return;
}
if(a==="toggle-flow"){
 collapsedFlows.has(id)?collapsedFlows.delete(id):collapsedFlows.add(id);
 localStorage.setItem("wccCollapsedFlows",JSON.stringify([...collapsedFlows]));
 renderTimeline();
}
if(a==="toggle-flow-package"){
 collapsedFlowPackages.has(id)?collapsedFlowPackages.delete(id):collapsedFlowPackages.add(id);
 localStorage.setItem("wccCollapsedFlowPackages",JSON.stringify([...collapsedFlowPackages]));
 renderTimeline();
}
if(a==="toggle-all-packages"){
 const packageIds=checks.filter(c=>c.flowId===id&&c.taskId).map(c=>c.id);
 const allCollapsed=packageIds.length&&packageIds.every(x=>collapsedFlowPackages.has(x));
 packageIds.forEach(x=>allCollapsed?collapsedFlowPackages.delete(x):collapsedFlowPackages.add(x));
 localStorage.setItem("wccCollapsedFlowPackages",JSON.stringify([...collapsedFlowPackages]));
 renderTimeline();
}
if(a==="toggle-roster"){
 if(e.defaultPrevented)return;
 collapsedRosters.has(id)?collapsedRosters.delete(id):collapsedRosters.add(id);
 localStorage.setItem("wccCollapsedRosters",JSON.stringify([...collapsedRosters]));
 renderRosters();
 return;
}
if(a==="expand-all-rosters"){
 collapsedRosters.clear();
 localStorage.setItem("wccCollapsedRosters","[]");
 renderRosters();
 return;
}
if(a==="collapse-all-rosters"){
 collapsedRosters=new Set(rosters.map(r=>r.id));
 localStorage.setItem("wccCollapsedRosters",JSON.stringify([...collapsedRosters]));
 renderRosters();
 return;
}
if(a==="go-rosters"){setView("rosters");return;}
if(a==="new-roster")openRoster();
if(a==="edit-roster")openRoster(rosters.find(x=>x.id===id));
if(a==="delete-roster"&&confirm("刪除此名單與所有成員？")){const batch=writeBatch(db);membersForRoster(id).forEach(m=>batch.delete(doc(db,"wccRosterMembers",m.id)));batch.delete(doc(db,"wccRosters",id));await batch.commit()}
if(a==="add-roster-member")openRosterMember(null,id);
if(a==="edit-roster-member")openRosterMember(rosterMembers.find(x=>x.id===id));
if(a==="delete-roster-member"&&confirm("從名單移除此人？"))await deleteDoc(doc(db,"wccRosterMembers",id));
if(a==="new-group")openGroup();if(a==="edit-group")openGroup(groups.find(x=>x.id===id));if(a==="delete-group"&&confirm("刪除此群組？流程會移到未分組。")){const batch=writeBatch(db);flows.filter(f=>f.groupId===id).forEach(f=>batch.update(doc(db,"wccFlows",f.id),{groupId:""}));batch.delete(doc(db,"wccFlowGroups",id));await batch.commit()}if(a==="toggle-group"){collapsedGroups.has(id)?collapsedGroups.delete(id):collapsedGroups.add(id);localStorage.setItem("wccCollapsedGroups",JSON.stringify([...collapsedGroups]));renderTimeline();return;}
if(a==="new-flow")openFlow();if(a==="edit-flow")openFlow(flows.find(x=>x.id===id));if(a==="delete-flow"&&confirm("刪除此流程與確認項目？")){const batch=writeBatch(db);checks.filter(x=>x.flowId===id).forEach(x=>batch.delete(doc(db,"wccFlowChecks",x.id)));tasks.filter(t=>(t.flowIds||[]).includes(id)).forEach(t=>batch.update(doc(db,"wccTasks",t.id),{flowIds:(t.flowIds||[]).filter(x=>x!==id)}));batch.delete(doc(db,"wccFlows",id));await batch.commit()}
if(a==="add-check")openCheck(null,id);if(a==="edit-check")openCheck(checks.find(x=>x.id===id));if(a==="delete-check"&&confirm("刪除此確認項目？"))await deleteDoc(doc(db,"wccFlowChecks",id));if(a==="toggle-check")await updateDoc(doc(db,"wccFlowChecks",id),{done:b.checked,updatedAt:serverTimestamp(),checkedBy:currentUser});
if(a==="new-person")openPerson();if(a==="edit-person")openPerson(people.find(x=>x.id===id));if(a==="delete-person"&&confirm("刪除此人員？"))await deleteDoc(doc(db,"wccPeople",id));if(a==="show-person"){const p=people.find(x=>x.id===id);if(p){currentUser=p.name;localStorage.setItem("wccUser",p.name);setView("mine")}}
if(a==="new-category")openCategory();if(a==="edit-category")openCategory(categories.find(x=>x.id===id));if(a==="delete-category")await deletePreparationCategory(id);if(a==="move-category-up")await swapOrder(categories,"wccCategories",id,-1);if(a==="move-category-down")await swapOrder(categories,"wccCategories",id,1);
if(a==="move-group-up")await swapOrder(groups,"wccFlowGroups",id,-1);if(a==="move-group-down")await swapOrder(groups,"wccFlowGroups",id,1);
if(a==="move-flow-up"){await moveFlowWithinGroup(id,-1);return;}if(a==="move-flow-down"){await moveFlowWithinGroup(id,1);return;}
if(a==="save-settings")await setDoc(doc(db,"wccSettings","main"),{title:$("#settingTitle").value.trim(),weddingDate:$("#settingDate").value,initialized:true},{merge:true});if(a==="export-csv")csvExport();if(a==="print")window.print();
});
$("#fab").onclick=()=>{if(view==="banquet")return;view==="prepare"?openTask():view==="rosters"?openRoster():view==="timeline"?openFlow():view==="people"?openPerson():openTask()};

async function bootstrap(){const ref=doc(db,"wccSettings","main"),snap=await getDoc(ref);if(snap.exists()&&snap.data().initialized)return;const cs=await getDocs(collection(db,"wccCategories"));if(!cs.empty){await setDoc(ref,{initialized:true,title:"駿瑋 & 忞靜 婚禮管家"},{merge:true});return}const batch=writeBatch(db),catRefs={},groupRefs={};defaults.categories.forEach(([n,i],x)=>{const r=doc(collection(db,"wccCategories"));catRefs[n]=r;batch.set(r,{name:n,icon:i,sort:x,createdAt:serverTimestamp()})});defaults.groups.forEach(([n,i],x)=>{const r=doc(collection(db,"wccFlowGroups"));groupRefs[n]=r;batch.set(r,{name:n,icon:i,sort:x,createdAt:serverTimestamp()})});defaults.flows.forEach(([time,n,i,g],x)=>{const r=doc(collection(db,"wccFlows"));batch.set(r,{timeMode:"single",time,startTime:"",endTime:"",name:n,icon:i,groupId:groupRefs[g].id,owner:"",location:"",address:"",mapUrl:"",notes:"",sort:x,createdAt:serverTimestamp()})});batch.set(ref,{initialized:true,title:"駿瑋 & 忞靜 婚禮管家",weddingDate:""});await batch.commit()}
async function start(){const app=initializeApp(firebaseConfig),auth=getAuth(app);db=getFirestore(app);await signInAnonymously(auth);$("#syncState").className="sync ok";$("#syncState").textContent="已連線・多人即時同步";await bootstrap();onSnapshot(query(collection(db,"wccTasks"),orderBy("sort","asc")),s=>{tasks=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccTaskItems"),orderBy("sort","asc")),s=>{taskItems=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccCategories"),orderBy("sort","asc")),s=>{categories=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccFlowGroups"),orderBy("sort","asc")),s=>{groups=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccRosters"),orderBy("sort","asc")),s=>{rosters=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(collection(db,"wccRosterMembers"),s=>{rosterMembers=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccFlows"),orderBy("sort","asc")),s=>{flows=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccFlowChecks"),orderBy("sort","asc")),s=>{checks=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccPeople"),orderBy("sort","asc")),s=>{people=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(doc(db,"wccSettings","main"),s=>{if(s.exists())settings={...settings,...s.data()};render();if(!settings.adminPasswordHash&&!adminSetupShown){adminSetupShown=true;setTimeout(()=>{$("#adminSetupTitle").textContent="建立管理密碼";$("#adminSetupDialog").showModal()},300)}})}
start().catch(err=>{$("#syncState").className="sync bad";$("#syncState").textContent="連線失敗";alert(err.message)});
