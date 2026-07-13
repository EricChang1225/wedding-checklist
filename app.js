import {firebaseConfig} from "./firebase-config.js";
import {initializeApp} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {getAuth,signInAnonymously} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {getFirestore,collection,doc,addDoc,setDoc,updateDoc,deleteDoc,onSnapshot,serverTimestamp,query,orderBy,getDoc,getDocs,writeBatch} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $=s=>document.querySelector(s), esc=(v="")=>String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
let db,view="dashboard",tasks=[],taskItems=[],categories=[],groups=[],flows=[],checks=[],people=[],settings={title:"駿瑋 & 忞靜 婚禮工作中心",weddingDate:"",initialized:false},taskFlowSelection=new Set();

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
 document.body.classList.toggle("admin-mode",admin);
 const btn=$("#adminModeButton");
 if(btn){btn.textContent=admin?"👑":"🔒";btn.classList.toggle("active",admin);btn.title=admin?"點擊退出管理模式":"長按標題或點擊輸入管理密碼";}
 const blocked=new Set(["new-category","new-task","add-subitem","edit-subitem","delete-subitem","edit-task","delete-task","new-group","edit-group","delete-group","new-flow","edit-flow","delete-flow","add-check","edit-check","delete-check","new-person","edit-person","delete-person","move-category-up","move-category-down","move-group-up","move-group-down","move-flow-up","move-flow-down","save-settings","export-csv","change-admin-password"]);
 document.querySelectorAll("[data-action]").forEach(el=>{if(blocked.has(el.dataset.action))el.classList.add("admin-hidden")});
 document.querySelectorAll(".toolbar").forEach(el=>el.classList.toggle("admin-hidden",!admin));
 const settingsTab=document.querySelector('[data-view="settings"]');if(settingsTab)settingsTab.classList.toggle("admin-hidden",!admin);
 $("#fab")?.classList.toggle("admin-hidden",!admin||view==="banquet");
}
function requestAdmin(){
 if(isAdmin()){localStorage.removeItem("wccAdminUntil");applyPermissions();render();return}
 $("#adminLoginPassword").value="";$("#adminLoginError").textContent="";$("#adminLoginDialog").showModal();
}
let currentUser=localStorage.getItem("wccUser")||"",
 collapsedGroups=new Set(JSON.parse(localStorage.getItem("wccCollapsedGroups")||"[]")),
 collapsedTasks=new Set(JSON.parse(localStorage.getItem("wccCollapsedTasks")||"[]")),
 collapsedFlows=new Set(JSON.parse(localStorage.getItem("wccCollapsedFlows")||"[]")),
 collapsedFlowPackages=new Set(JSON.parse(localStorage.getItem("wccCollapsedFlowPackages")||"[]"));
const defaults={categories:[["文定準備","💍"],["迎娶準備","🚗"],["婚宴準備","🥂"],["攝影錄影","📸"]],groups:[["集合與準備","📍"],["文定","💍"],["迎娶","🚗"],["婚宴","🥂"],["送客與收尾","🧹"]],flows:[["08:00","集合","📍","集合與準備"],["09:00","文定","💍","文定"],["11:00","迎娶","🚗","迎娶"],["18:00","婚宴","🥂","婚宴"]]};
const category=id=>categories.find(x=>x.id===id), linkedTask=id=>tasks.find(x=>x.id===id), group=id=>groups.find(x=>x.id===id), flow=id=>flows.find(x=>x.id===id);
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
const taskProgress=t=>{const list=itemsForTask(t.id);const done=list.filter(x=>x.done).length;return {list,done,total:list.length,complete:list.length>0&&done===list.length};};

function setView(v){view=v;document.body.classList.toggle("banquet-mode",v==="banquet");document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.view===v));document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id===v));render()}
$("#tabs").onclick=e=>{const b=e.target.closest("[data-view]");if(b)setView(b.dataset.view)};
function renderHeader(){$("#appTitle").textContent=settings.title||"駿瑋 & 忞靜 婚禮工作中心";$("#currentUser").textContent=currentUser?`目前使用者：${currentUser}`:"尚未設定使用者";$("#peopleList").innerHTML=people.map(p=>`<option value="${esc(p.name)}">`).join("")}
function pct(list){return list.length?Math.round(list.filter(x=>x.done).length/list.length*100):0}
function daysLeft(){if(!settings.weddingDate)return "未設定";const n=new Date();n.setHours(0,0,0,0);return Math.ceil((new Date(settings.weddingDate+"T00:00:00")-n)/86400000)}
function renderDashboard(){$("#dashboard").innerHTML=`<div class="grid"><div class="stat"><div class="meta">距離婚禮</div><div class="big">${daysLeft()}${typeof daysLeft()==="number"?" 天":""}</div></div><div class="stat"><div class="meta">前置完成率</div><div class="big">${pct(tasks)}%</div><div class="progress"><span style="width:${pct(tasks)}%"></span></div></div><div class="stat"><div class="meta">流程確認率</div><div class="big">${pct(checks)}%</div><div class="progress"><span style="width:${pct(checks)}%"></span></div></div><div class="stat"><div class="meta">我的未完成</div><div class="big">${tasks.filter(x=>x.owner===currentUser&&!x.done).length}</div></div></div><div class="quick"><button data-jump="prepare">📋 前置準備</button><button data-jump="timeline">🎬 婚禮流程</button><button data-jump="mine">👤 我的任務</button><button data-jump="people">👥 人員</button></div>`}
function taskRow(t){
 const c=category(t.categoryId),p=taskProgress(t),collapsed=collapsedTasks.has(t.id);
 const effectiveDone=p.total?p.complete:t.done;
 return `<div class="task-shell ${effectiveDone?"done":""}">
  <div class="row">
   <input class="check" type="checkbox" data-action="toggle-task" data-id="${t.id}" ${effectiveDone?"checked":""}>
   <div class="main">
    <div class="name">${esc(t.title)}</div>
    <div class="meta">${c?`${esc(c.icon)} ${esc(c.name)}・`:""}${esc(t.type||"工作")}<br>DRI：${esc(t.owner||"未指定")}${(t.flowIds||[]).length?`<br>連動流程：${(t.flowIds||[]).map(id=>esc(flow(id)?.name||"已刪除")).join("、")}`:""}${t.notes?`<br>${esc(t.notes)}`:""}</div>
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
function renderPrepare(){$("#prepare").innerHTML=`<div class="toolbar"><button class="primary" data-action="new-category">新增分類</button><button class="primary" data-action="new-task">新增項目</button></div>${categories.map(c=>{const list=tasks.filter(t=>t.categoryId===c.id);return `<div class="card"><div class="card-head"><div><div class="card-title">${esc(c.icon||"📂")} ${esc(c.name)}</div><div class="meta">${list.filter(x=>x.done).length}/${list.length}</div></div><div class="actions"><button class="small" data-action="move-category-up" data-id="${c.id}">上移</button><button class="small" data-action="move-category-down" data-id="${c.id}">下移</button><button class="small" data-action="edit-category" data-id="${c.id}">修改</button></div></div>${list.map(taskRow).join("")||'<div class="empty">此分類沒有項目</div>'}</div>`}).join("")}`}
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
    <div class="meta">負責：${esc(ch.owner||t.owner||"未指定")}・前置狀態：${ready?"✅ 已準備":"⚠️ 尚未準備"}${p.total?`（${p.done}/${p.total}）`:""}</div>
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
    <div class="meta">負責人：${esc(f.owner||"未指定")}・確認 ${completed}/${list.length}${f.location?`<br>地點：${esc(f.location)}`:""}${f.address?`<br>地址：${esc(f.address)}`:""}</div>
    ${list.length?`<div class="progress compact-progress"><span style="width:${Math.round(completed/list.length*100)}%"></span></div>`:""}
    ${url?`<a class="map-link" href="${esc(url)}" target="_blank" rel="noopener">🗺️ 開啟 Google 地圖</a>`:""}
    ${f.notes?`<div class="meta">${esc(f.notes)}</div>`:""}
   </div>
   <div class="actions">
    <button class="small" data-action="toggle-all-packages" data-id="${f.id}">全部展開／收合</button>
    <button class="small" data-action="move-flow-up" data-id="${f.id}">上移</button>
    <button class="small" data-action="move-flow-down" data-id="${f.id}">下移</button>
    <button class="small" data-action="add-check" data-id="${f.id}">加確認項</button>
    <button class="small" data-action="edit-flow" data-id="${f.id}">修改</button>
    <button class="small danger" data-action="delete-flow" data-id="${f.id}">刪除</button>
   </div>
  </div>
  <div class="flow-body ${collapsed?"collapsed":""}">
   ${list.map(linkedPreparationCard).join("")||'<div class="empty">尚未建立確認項目</div>'}
  </div>
 </div>`;
}

function renderTimeline(){
 const ungrouped=flows.filter(f=>!f.groupId||!group(f.groupId));
 $("#timeline").innerHTML=`<div class="toolbar"><button class="primary" data-action="new-group">新增階段</button><button class="primary" data-action="new-flow">新增流程</button></div>
 ${groups.map(g=>{
  const list=flows.filter(f=>f.groupId===g.id),collapsed=collapsedGroups.has(g.id);
  const stageChecks=checks.filter(c=>list.some(f=>f.id===c.flowId));
  return `<div class="group-card">
   <div class="group-head">
    <button class="group-toggle" data-action="toggle-group" data-id="${g.id}">${collapsed?"▶":"▼"}</button>
    <div class="main"><div class="card-title">${esc(g.icon||"🗂️")} ${esc(g.name)}</div><div class="meta">${list.length} 個流程・確認 ${stageChecks.filter(c=>c.done).length}/${stageChecks.length}</div></div>
    <div class="actions">
     <button class="small" data-action="move-group-up" data-id="${g.id}">上移</button>
     <button class="small" data-action="move-group-down" data-id="${g.id}">下移</button>
     <button class="small" data-action="edit-group" data-id="${g.id}">修改</button>
     <button class="small danger" data-action="delete-group" data-id="${g.id}">刪除</button>
    </div>
   </div>
   <div class="group-body ${collapsed?"collapsed":""}"><div class="timeline-line">${list.map(flowCard).join("")||'<div class="empty">此階段尚無流程</div>'}</div></div>
  </div>`;
 }).join("")}
 ${ungrouped.length?`<div class="ungrouped-flows">${ungrouped.map(flowCard).join("")}</div>`:""}`;
}
function renderMine(){const work=tasks.filter(x=>x.owner===currentUser&&x.type==="工作"),items=tasks.filter(x=>x.owner===currentUser&&x.type==="物品");$("#mine").innerHTML=`<div class="card"><div class="card-head"><div class="card-title">📝 我的工作</div><div class="pill ${work.length&&work.every(x=>x.done)?"ok":""}">${work.filter(x=>x.done).length}/${work.length}</div></div>${work.map(taskRow).join("")||'<div class="empty">目前沒有工作</div>'}</div><div class="card"><div class="card-head"><div class="card-title">📦 我的準備物品</div><div class="pill ${items.length&&items.every(x=>x.done)?"ok":""}">${items.filter(x=>x.done).length}/${items.length}</div></div>${items.map(taskRow).join("")||'<div class="empty">目前沒有準備物品</div>'}</div>`}
function renderPeople(){$("#people").innerHTML=`<div class="toolbar"><button class="primary" data-action="new-person">新增人員</button></div><div id="peopleSortList">${people.map(p=>`<div class="person-card" data-person-card="${p.id}"><div class="drag-handle" data-drag-person="${p.id}" title="拖曳排序">☰</div><div class="main"><strong>${esc(p.name)}</strong><div class="meta">${esc(p.role||"未設定角色")}・工作 ${tasks.filter(x=>x.owner===p.name&&x.type==="工作").length}・物品 ${tasks.filter(x=>x.owner===p.name&&x.type==="物品").length}</div></div><div class="actions"><button class="small" data-action="show-person" data-id="${p.id}">查看</button><button class="small" data-action="edit-person" data-id="${p.id}">修改</button><button class="small danger" data-action="delete-person" data-id="${p.id}">刪除</button></div></div>`).join("")||'<div class="empty">尚未建立人員</div>'}</div>`;initPersonDrag()}
function renderSettings(){$("#settings").innerHTML=`<div class="card"><div class="card-head"><div class="card-title">設定</div></div><div style="padding:16px"><label>網站名稱<input id="settingTitle" value="${esc(settings.title||"")}"></label><label>婚禮日期<input id="settingDate" type="date" value="${esc(settings.weddingDate||"")}"></label><div class="actions"><button class="primary" data-action="save-settings">儲存設定</button><button id="changeUser">更改目前使用者</button><button data-action="change-admin-password">修改管理密碼</button><button data-action="logout-admin">退出管理模式</button><button data-action="export-csv">匯出 CSV</button><button data-action="print">列印</button></div></div></div>`;$("#changeUser").onclick=openUser}
function render(){renderHeader();const renderer={dashboard:renderDashboard,prepare:renderPrepare,timeline:renderTimeline,mine:renderMine,people:renderPeople,settings:renderSettings,banquet:()=>{}}[view];if(renderer)renderer();applyPermissions();if(view==="banquet")$("#banquetFrame")?.contentWindow?.postMessage({type:"wcc-admin",admin:isAdmin()},"*")}
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
$("#appTitle").addEventListener("pointerdown",()=>{logoPressTimer=setTimeout(requestAdmin,1800)});
["pointerup","pointercancel","pointerleave"].forEach(ev=>$("#appTitle").addEventListener(ev,()=>clearTimeout(logoPressTimer)));

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

function openUser(){$("#userName").value=currentUser;$("#userDialog").showModal()}$("#userForm").onsubmit=e=>{e.preventDefault();currentUser=$("#userName").value.trim();localStorage.setItem("wccUser",currentUser);close("userDialog");render()};

function fillCategorySelect(){$("#taskCategory").innerHTML=categories.map(c=>`<option value="${c.id}">${esc(c.icon)} ${esc(c.name)}</option>`).join("")}
function renderTaskFlowPicker(){$("#taskFlowPicker").innerHTML=flows.map(f=>`<button type="button" class="chip ${taskFlowSelection.has(f.id)?"selected":""}" data-task-flow="${f.id}">${esc(formatFlowTime(f))} ${esc(f.name)}</button>`).join("")}
$("#taskFlowPicker").onclick=e=>{const b=e.target.closest("[data-task-flow]");if(!b)return;taskFlowSelection.has(b.dataset.taskFlow)?taskFlowSelection.delete(b.dataset.taskFlow):taskFlowSelection.add(b.dataset.taskFlow);renderTaskFlowPicker()};
function openTask(t=null){$("#taskDialogTitle").textContent=t?"修改前置項目":"新增前置項目";$("#taskId").value=t?.id||"";fillCategorySelect();$("#taskCategory").value=t?.categoryId||categories[0]?.id||"";$("#taskTitle").value=t?.title||"";$("#taskType").value=t?.type||"工作";$("#taskOwner").value=t?.owner||"";$("#taskNotes").value=t?.notes||"";taskFlowSelection=new Set(t?.flowIds||[]);renderTaskFlowPicker();$("#taskDialog").showModal()}
async function syncTaskChecks(taskId,payload,oldFlowIds=[]){const newIds=payload.flowIds||[],batch=writeBatch(db),existing=checks.filter(c=>c.autoFromTask&&c.taskId===taskId);for(const fId of newIds){if(!existing.some(c=>c.flowId===fId)){const r=doc(collection(db,"wccFlowChecks"));batch.set(r,{flowId:fId,title:payload.title,owner:payload.owner||"",taskId,done:false,autoFromTask:true,sort:checks.filter(c=>c.flowId===fId).length,createdAt:serverTimestamp()})}else{existing.filter(c=>c.flowId===fId).forEach(c=>batch.update(doc(db,"wccFlowChecks",c.id),{title:payload.title,owner:payload.owner||"",updatedAt:serverTimestamp()}))}}existing.filter(c=>!newIds.includes(c.flowId)).forEach(c=>batch.delete(doc(db,"wccFlowChecks",c.id)));await batch.commit()}
$("#taskForm").onsubmit=async e=>{e.preventDefault();const id=$("#taskId").value,p={title:$("#taskTitle").value.trim(),categoryId:$("#taskCategory").value,type:$("#taskType").value,owner:$("#taskOwner").value.trim(),notes:$("#taskNotes").value.trim(),flowIds:[...taskFlowSelection],updatedAt:serverTimestamp()};if(id){const old=tasks.find(x=>x.id===id);await updateDoc(doc(db,"wccTasks",id),p);await syncTaskChecks(id,p,old?.flowIds||[])}else{const ref=await addDoc(collection(db,"wccTasks"),{...p,done:false,sort:tasks.length,createdAt:serverTimestamp()});await syncTaskChecks(ref.id,p,[])}close("taskDialog")};


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

function openGroup(g=null){$("#groupDialogTitle").textContent=g?"修改流程群組":"新增流程群組";$("#groupId").value=g?.id||"";$("#groupName").value=g?.name||"";$("#groupIcon").value=g?.icon||"🗂️";$("#groupDialog").showModal()}$("#groupForm").onsubmit=async e=>{e.preventDefault();const id=$("#groupId").value,p={name:$("#groupName").value.trim(),icon:$("#groupIcon").value.trim()||"🗂️",updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccFlowGroups",id),p):await addDoc(collection(db,"wccFlowGroups"),{...p,sort:groups.length,createdAt:serverTimestamp()});close("groupDialog")};
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
 $("#flowOwner").value=f?.owner||"";
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
  owner:$("#flowOwner").value.trim(),
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
function openCheck(ch=null,flowId=""){$("#checkDialogTitle").textContent=ch?"修改流程確認項目":"新增流程確認項目";$("#checkId").value=ch?.id||"";$("#checkFlowId").value=ch?.flowId||flowId;$("#checkTitle").value=ch?.title||"";$("#checkOwner").value=ch?.owner||"";$("#checkTaskLink").innerHTML='<option value="">不連結</option>'+tasks.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join("");$("#checkTaskLink").value=ch?.taskId||"";$("#checkDialog").showModal()}$("#checkForm").onsubmit=async e=>{e.preventDefault();const id=$("#checkId").value,p={flowId:$("#checkFlowId").value,title:$("#checkTitle").value.trim(),owner:$("#checkOwner").value.trim(),taskId:$("#checkTaskLink").value,autoFromTask:false,updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccFlowChecks",id),p):await addDoc(collection(db,"wccFlowChecks"),{...p,done:false,sort:checks.filter(x=>x.flowId===p.flowId).length,createdAt:serverTimestamp()});close("checkDialog")};
function openPerson(p=null){$("#personDialogTitle").textContent=p?"修改人員":"新增人員";$("#personId").value=p?.id||"";$("#personName").value=p?.name||"";$("#personRole").value=p?.role||"";$("#personDialog").showModal()}$("#personForm").onsubmit=async e=>{e.preventDefault();const id=$("#personId").value,p={name:$("#personName").value.trim(),role:$("#personRole").value.trim(),updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccPeople",id),p):await addDoc(collection(db,"wccPeople"),{...p,sort:people.length,createdAt:serverTimestamp()});close("personDialog")};
function openCategory(c=null){$("#categoryDialogTitle").textContent=c?"修改分類":"新增分類";$("#categoryId").value=c?.id||"";$("#categoryName").value=c?.name||"";$("#categoryIcon").value=c?.icon||"📂";$("#categoryDialog").showModal()}$("#categoryForm").onsubmit=async e=>{e.preventDefault();const id=$("#categoryId").value,p={name:$("#categoryName").value.trim(),icon:$("#categoryIcon").value.trim()||"📂",updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccCategories",id),p):await addDoc(collection(db,"wccCategories"),{...p,sort:categories.length,createdAt:serverTimestamp()});close("categoryDialog")};

async function swapOrder(list,coll,id,dir){const i=list.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=list.length)return;const a=list[i],b=list[j],batch=writeBatch(db);batch.update(doc(db,coll,a.id),{sort:b.sort??j});batch.update(doc(db,coll,b.id),{sort:a.sort??i});await batch.commit()}
function csvExport(){const rows=[["類型","名稱","分類/流程","負責人","完成"]];tasks.forEach(t=>{const p=taskProgress(t);rows.push([t.type,t.title,category(t.categoryId)?.name||"",t.owner||"",(p.total?p.complete:t.done)?"是":"否"]);p.list.forEach(i=>rows.push(["細項",`↳ ${i.title}`,t.title,t.owner||"",i.done?"是":"否"]))});checks.forEach(c=>rows.push(["流程確認",c.title,flow(c.flowId)?.name||"",c.owner||"",c.done?"是":"否"]));const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="wedding-control-center.csv";a.click();URL.revokeObjectURL(a.href)}

function initPersonDrag(){let draggedId=null,startY=0;document.querySelectorAll("[data-drag-person]").forEach(h=>{h.onpointerdown=e=>{draggedId=h.dataset.dragPerson;startY=e.clientY;h.setPointerCapture(e.pointerId);document.querySelector(`[data-person-card="${draggedId}"]`)?.classList.add("dragging")};h.onpointermove=e=>{if(!draggedId)return;const cards=[...document.querySelectorAll("[data-person-card]")];cards.forEach(c=>c.classList.remove("drop-target"));const target=cards.find(c=>{const r=c.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom&&c.dataset.personCard!==draggedId});target?.classList.add("drop-target")};h.onpointerup=async e=>{if(!draggedId)return;const target=document.querySelector(".drop-target");document.querySelectorAll("[data-person-card]").forEach(c=>c.classList.remove("dragging","drop-target"));if(target){const from=people.findIndex(p=>p.id===draggedId),to=people.findIndex(p=>p.id===target.dataset.personCard);if(from!==to&&from>=0&&to>=0){const reordered=[...people],moved=reordered.splice(from,1)[0];reordered.splice(to,0,moved);const batch=writeBatch(db);reordered.forEach((p,i)=>batch.update(doc(db,"wccPeople",p.id),{sort:i}));await batch.commit()}}draggedId=null}})}

document.body.addEventListener("click",async e=>{const b=e.target.closest("[data-action]");if(!b)return;
if(b.classList.contains("flow-click-area")&&e.target.closest("a,button,input,select,textarea"))return;
const a=b.dataset.action,id=b.dataset.id;
const managementActions=new Set(["new-category","new-task","add-subitem","edit-subitem","delete-subitem","edit-task","delete-task","new-group","edit-group","delete-group","new-flow","edit-flow","delete-flow","add-check","edit-check","delete-check","new-person","edit-person","delete-person","move-category-up","move-category-down","move-group-up","move-group-down","move-flow-up","move-flow-down","save-settings","export-csv","change-admin-password"]);
if(managementActions.has(a)&&!isAdmin()){requestAdmin();return}
if(isAdmin())refreshAdminSession();
if(a==="change-admin-password"){$("#adminSetupTitle").textContent="修改管理密碼";$("#adminSetupPassword").value="";$("#adminSetupConfirm").value="";$("#adminSetupDialog").showModal();return}
if(a==="logout-admin"){localStorage.removeItem("wccAdminUntil");setView("dashboard");return}

if(a==="new-task")openTask();
if(a==="edit-task")openTask(tasks.find(x=>x.id===id));
if(a==="add-subitem")openSubItem(null,id);
if(a==="edit-subitem")openSubItem(taskItems.find(x=>x.id===id));
if(a==="delete-subitem"&&confirm("刪除此細項？")){const item=taskItems.find(x=>x.id===id);await deleteDoc(doc(db,"wccTaskItems",id));if(item)setTimeout(()=>refreshParentTask(item.taskId),300)}
if(a==="toggle-subitem"){const item=taskItems.find(x=>x.id===id);await updateDoc(doc(db,"wccTaskItems",id),{done:b.checked,updatedAt:serverTimestamp(),updatedBy:currentUser});if(item)setTimeout(()=>refreshParentTask(item.taskId),300)}
if(a==="toggle-task-expand"){collapsedTasks.has(id)?collapsedTasks.delete(id):collapsedTasks.add(id);localStorage.setItem("wccCollapsedTasks",JSON.stringify([...collapsedTasks]));render()}
if(a==="delete-task"&&confirm("刪除此項目與所有細項？")){const batch=writeBatch(db);checks.filter(c=>c.taskId===id&&c.autoFromTask).forEach(c=>batch.delete(doc(db,"wccFlowChecks",c.id)));itemsForTask(id).forEach(i=>batch.delete(doc(db,"wccTaskItems",i.id)));batch.delete(doc(db,"wccTasks",id));await batch.commit()}
if(a==="toggle-task"){const list=itemsForTask(id);if(list.length){const batch=writeBatch(db);list.forEach(i=>batch.update(doc(db,"wccTaskItems",i.id),{done:b.checked,updatedAt:serverTimestamp(),updatedBy:currentUser}));batch.update(doc(db,"wccTasks",id),{done:b.checked,updatedAt:serverTimestamp(),updatedBy:currentUser});await batch.commit()}else await updateDoc(doc(db,"wccTasks",id),{done:b.checked,updatedAt:serverTimestamp(),updatedBy:currentUser});}
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
if(a==="new-group")openGroup();if(a==="edit-group")openGroup(groups.find(x=>x.id===id));if(a==="delete-group"&&confirm("刪除此群組？流程會移到未分組。")){const batch=writeBatch(db);flows.filter(f=>f.groupId===id).forEach(f=>batch.update(doc(db,"wccFlows",f.id),{groupId:""}));batch.delete(doc(db,"wccFlowGroups",id));await batch.commit()}if(a==="toggle-group"){collapsedGroups.has(id)?collapsedGroups.delete(id):collapsedGroups.add(id);localStorage.setItem("wccCollapsedGroups",JSON.stringify([...collapsedGroups]));renderTimeline()}
if(a==="new-flow")openFlow();if(a==="edit-flow")openFlow(flows.find(x=>x.id===id));if(a==="delete-flow"&&confirm("刪除此流程與確認項目？")){const batch=writeBatch(db);checks.filter(x=>x.flowId===id).forEach(x=>batch.delete(doc(db,"wccFlowChecks",x.id)));tasks.filter(t=>(t.flowIds||[]).includes(id)).forEach(t=>batch.update(doc(db,"wccTasks",t.id),{flowIds:(t.flowIds||[]).filter(x=>x!==id)}));batch.delete(doc(db,"wccFlows",id));await batch.commit()}
if(a==="add-check")openCheck(null,id);if(a==="edit-check")openCheck(checks.find(x=>x.id===id));if(a==="delete-check"&&confirm("刪除此確認項目？"))await deleteDoc(doc(db,"wccFlowChecks",id));if(a==="toggle-check")await updateDoc(doc(db,"wccFlowChecks",id),{done:b.checked,updatedAt:serverTimestamp(),checkedBy:currentUser});
if(a==="new-person")openPerson();if(a==="edit-person")openPerson(people.find(x=>x.id===id));if(a==="delete-person"&&confirm("刪除此人員？"))await deleteDoc(doc(db,"wccPeople",id));if(a==="show-person"){const p=people.find(x=>x.id===id);if(p){currentUser=p.name;localStorage.setItem("wccUser",p.name);setView("mine")}}
if(a==="new-category")openCategory();if(a==="edit-category")openCategory(categories.find(x=>x.id===id));if(a==="move-category-up")await swapOrder(categories,"wccCategories",id,-1);if(a==="move-category-down")await swapOrder(categories,"wccCategories",id,1);
if(a==="move-group-up")await swapOrder(groups,"wccFlowGroups",id,-1);if(a==="move-group-down")await swapOrder(groups,"wccFlowGroups",id,1);
if(a==="move-flow-up"){const list=flows.filter(f=>f.groupId===(flow(id)?.groupId||""));await swapOrder(list,"wccFlows",id,-1)}if(a==="move-flow-down"){const list=flows.filter(f=>f.groupId===(flow(id)?.groupId||""));await swapOrder(list,"wccFlows",id,1)}
if(a==="save-settings")await setDoc(doc(db,"wccSettings","main"),{title:$("#settingTitle").value.trim(),weddingDate:$("#settingDate").value,initialized:true},{merge:true});if(a==="export-csv")csvExport();if(a==="print")window.print();
});
$("#fab").onclick=()=>{if(view==="banquet")return;view==="prepare"?openTask():view==="timeline"?openFlow():view==="people"?openPerson():openTask()};

async function bootstrap(){const ref=doc(db,"wccSettings","main"),snap=await getDoc(ref);if(snap.exists()&&snap.data().initialized)return;const cs=await getDocs(collection(db,"wccCategories"));if(!cs.empty){await setDoc(ref,{initialized:true,title:"駿瑋 & 忞靜 婚禮工作中心"},{merge:true});return}const batch=writeBatch(db),catRefs={},groupRefs={};defaults.categories.forEach(([n,i],x)=>{const r=doc(collection(db,"wccCategories"));catRefs[n]=r;batch.set(r,{name:n,icon:i,sort:x,createdAt:serverTimestamp()})});defaults.groups.forEach(([n,i],x)=>{const r=doc(collection(db,"wccFlowGroups"));groupRefs[n]=r;batch.set(r,{name:n,icon:i,sort:x,createdAt:serverTimestamp()})});defaults.flows.forEach(([time,n,i,g],x)=>{const r=doc(collection(db,"wccFlows"));batch.set(r,{timeMode:"single",time,startTime:"",endTime:"",name:n,icon:i,groupId:groupRefs[g].id,owner:"",location:"",address:"",mapUrl:"",notes:"",sort:x,createdAt:serverTimestamp()})});batch.set(ref,{initialized:true,title:"駿瑋 & 忞靜 婚禮工作中心",weddingDate:""});await batch.commit()}
async function start(){if(!currentUser)openUser();const app=initializeApp(firebaseConfig),auth=getAuth(app);db=getFirestore(app);await signInAnonymously(auth);$("#syncState").className="sync ok";$("#syncState").textContent="已連線・多人即時同步";await bootstrap();onSnapshot(query(collection(db,"wccTasks"),orderBy("sort","asc")),s=>{tasks=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccTaskItems"),orderBy("sort","asc")),s=>{taskItems=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccCategories"),orderBy("sort","asc")),s=>{categories=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccFlowGroups"),orderBy("sort","asc")),s=>{groups=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccFlows"),orderBy("sort","asc")),s=>{flows=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccFlowChecks"),orderBy("sort","asc")),s=>{checks=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(query(collection(db,"wccPeople"),orderBy("sort","asc")),s=>{people=s.docs.map(d=>({id:d.id,...d.data()}));render()});onSnapshot(doc(db,"wccSettings","main"),s=>{if(s.exists())settings={...settings,...s.data()};render();if(!settings.adminPasswordHash&&!adminSetupShown){adminSetupShown=true;setTimeout(()=>{$("#adminSetupTitle").textContent="建立管理密碼";$("#adminSetupDialog").showModal()},300)}})}
start().catch(err=>{$("#syncState").className="sync bad";$("#syncState").textContent="連線失敗";alert(err.message)});
