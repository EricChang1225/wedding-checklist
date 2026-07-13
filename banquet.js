import {firebaseConfig} from "./firebase-config.js";
import {INITIAL_SEATING_DATA} from "./seating-data.js";
import {initializeApp} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {getAuth,signInAnonymously} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {getFirestore,collection,doc,setDoc,addDoc,updateDoc,deleteDoc,onSnapshot,serverTimestamp,getDocs,writeBatch,query,orderBy} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $=s=>document.querySelector(s);
const esc=(v="")=>String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
let db,tables=[],menu=[],vendors=[],settings={},allExpanded=false;

$("#banquetTabs").onclick=e=>{
 const b=e.target.closest("[data-view]");if(!b)return;
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
 document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id===b.dataset.view));
 render();
};

function splitGuests(text){
 return String(text||"").split(/[,，、\n]+/).map(x=>x.trim()).filter(Boolean);
}
function renderSummary(){
 const people=tables.reduce((s,t)=>s+(Number(t.count)||0),0);
 $("#seatingSummary").innerHTML=`
  <div class="summary-card"><strong>${tables.length}</strong><span>桌次資料</span></div>
  <div class="summary-card"><strong>${people}</strong><span>總人數</span></div>
  <div class="summary-card"><strong>${new Set(tables.map(t=>t.relation).filter(Boolean)).size}</strong><span>賓客關係分類</span></div>`;
}
function tableCard(t){
 const guests=splitGuests(t.guests);
 return `<article class="table-card" data-table="${t.id}">
  <div class="table-head">
   <div><div class="table-title">第 ${esc(t.tableNo)} 桌｜${esc(t.tableName||"未命名")}</div><div class="meta">${esc(t.relation||"未分類")}・${esc(t.count||0)} 人</div></div>
   <button class="toggle" data-toggle-table="${t.id}">${allExpanded?"收合":"查看名單"}</button>
  </div>
  <div class="table-body ${allExpanded?"":"collapsed"}" id="body-${t.id}">
   <div class="guest-chips">${guests.map(g=>`<span class="guest-chip">${esc(g)}</span>`).join("")}</div>
   ${t.notes?`<div class="notes">備註：${esc(t.notes)}</div>`:""}
  </div>
 </article>`;
}
function renderTables(list=tables){
 $("#tableList").innerHTML=list.map(tableCard).join("")||'<div class="placeholder">沒有符合的桌次資料</div>';
}
function search(){
 const q=$("#guestSearch").value.trim().toLowerCase();
 if(!q){$("#searchResult").innerHTML="";renderTables();return}
 const found=tables.filter(t=>[t.tableNo,t.tableName,t.relation,t.guests,t.notes].some(v=>String(v||"").toLowerCase().includes(q)));
 $("#searchResult").innerHTML=found.slice(0,15).map(t=>`<div class="result-card"><strong>第 ${esc(t.tableNo)} 桌｜${esc(t.tableName)}</strong><div class="meta">${esc(t.relation)}・${esc(t.count)} 人</div><div class="meta">${esc(t.guests)}</div></div>`).join("")||'<div class="placeholder">找不到符合的賓客或桌次</div>';
 renderTables(found);
}
$("#guestSearch").oninput=search;
$("#clearSearch").onclick=()=>{$("#guestSearch").value="";search()};
$("#toggleAllTables").onclick=()=>{allExpanded=!allExpanded;renderTables($("#guestSearch").value.trim()?tables.filter(t=>[t.tableNo,t.tableName,t.relation,t.guests,t.notes].some(v=>String(v||"").toLowerCase().includes($("#guestSearch").value.trim().toLowerCase()))):tables)};
document.body.addEventListener("click",e=>{
 const b=e.target.closest("[data-toggle-table]");if(!b)return;
 const body=$("#body-"+b.dataset.toggleTable);body.classList.toggle("collapsed");b.textContent=body.classList.contains("collapsed")?"查看名單":"收合";
});

function renderMap(){
 const url=settings.tableMapUrl||"";
 $("#tableMapArea").innerHTML=url?`<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="婚宴桌圖"></a>`:'<div class="placeholder">尚未設定桌圖。請在「更多設定」輸入桌圖檔名或網址。</div>';
 $("#tableMapUrl").value=url;
}
function renderMenu(){
 $("#menuList").innerHTML=menu.map(m=>`<article class="menu-card"><div class="list-head"><div><div class="table-title">${esc(m.order||"-")}．${esc(m.name)}</div><div class="meta">${esc(m.type||"未分類")}${m.diet?`・${esc(m.diet)}`:""}${m.notes?`<br>${esc(m.notes)}`:""}</div></div><div class="actions"><button class="small" data-action="edit-menu" data-id="${m.id}">修改</button><button class="small danger" data-action="delete-menu" data-id="${m.id}">刪除</button></div></div></article>`).join("")||'<div class="placeholder">尚未建立婚宴菜單</div>';
}
function vendorMap(v){return v.address?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}`:""}
function renderVendors(){
 $("#vendorList").innerHTML=vendors.map(v=>`<article class="vendor-card"><div class="list-head"><div><div class="table-title">${esc(v.type||"廠商")}｜${esc(v.name)}</div><div class="meta">聯絡人：${esc(v.contact||"未設定")}${v.arrival?`・到場 ${esc(v.arrival)}`:""}${v.duty?`<br>負責：${esc(v.duty)}`:""}${v.notes?`<br>${esc(v.notes)}`:""}</div>${v.phone?`<a class="phone" href="tel:${esc(v.phone)}">☎ ${esc(v.phone)}</a>`:""} ${v.address?`<a class="map" href="${vendorMap(v)}" target="_blank">🗺️ 地圖</a>`:""}</div><div class="actions"><button class="small" data-action="edit-vendor" data-id="${v.id}">修改</button><button class="small danger" data-action="delete-vendor" data-id="${v.id}">刪除</button></div></div></article>`).join("")||'<div class="placeholder">尚未建立協同廠商</div>';
}
function renderStatus(){
 $("#dataStatus").innerHTML=`<p>桌位：${tables.length} 桌</p><p>菜色：${menu.length} 道</p><p>廠商：${vendors.length} 家</p>`;
}
function render(){renderSummary();renderMap();renderMenu();renderVendors();renderStatus()}

function close(id){const d=document.getElementById(id);if(d?.open)d.close()}
document.body.addEventListener("click",e=>{const c=e.target.closest("[data-close]");if(c)close(c.dataset.close);if(e.target.tagName==="DIALOG")e.target.close()});

function openMenu(m=null){
 $("#menuDialogTitle").textContent=m?"修改菜色":"新增菜色";$("#menuId").value=m?.id||"";$("#menuOrder").value=m?.order||menu.length+1;$("#menuName").value=m?.name||"";$("#menuType").value=m?.type||"";$("#menuDiet").value=m?.diet||"";$("#menuNotes").value=m?.notes||"";$("#menuDialog").showModal();
}
$("#menuForm").onsubmit=async e=>{e.preventDefault();const id=$("#menuId").value,p={order:Number($("#menuOrder").value)||menu.length+1,name:$("#menuName").value.trim(),type:$("#menuType").value.trim(),diet:$("#menuDiet").value.trim(),notes:$("#menuNotes").value.trim(),updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccMenu",id),p):await addDoc(collection(db,"wccMenu"),{...p,createdAt:serverTimestamp()});close("menuDialog")};

function openVendor(v=null){
 $("#vendorDialogTitle").textContent=v?"修改廠商":"新增協同廠商";$("#vendorId").value=v?.id||"";$("#vendorType").value=v?.type||"";$("#vendorName").value=v?.name||"";$("#vendorContact").value=v?.contact||"";$("#vendorPhone").value=v?.phone||"";$("#vendorLine").value=v?.line||"";$("#vendorArrival").value=v?.arrival||"";$("#vendorAddress").value=v?.address||"";$("#vendorDuty").value=v?.duty||"";$("#vendorNotes").value=v?.notes||"";$("#vendorDialog").showModal();
}
$("#vendorForm").onsubmit=async e=>{e.preventDefault();const id=$("#vendorId").value,p={type:$("#vendorType").value.trim(),name:$("#vendorName").value.trim(),contact:$("#vendorContact").value.trim(),phone:$("#vendorPhone").value.trim(),line:$("#vendorLine").value.trim(),arrival:$("#vendorArrival").value,address:$("#vendorAddress").value.trim(),duty:$("#vendorDuty").value.trim(),notes:$("#vendorNotes").value.trim(),updatedAt:serverTimestamp()};id?await updateDoc(doc(db,"wccVendors",id),p):await addDoc(collection(db,"wccVendors"),{...p,createdAt:serverTimestamp()});close("vendorDialog")};

document.body.addEventListener("click",async e=>{
 const b=e.target.closest("[data-action]");if(!b)return;const a=b.dataset.action,id=b.dataset.id;
 if(a==="new-menu")openMenu();if(a==="edit-menu")openMenu(menu.find(x=>x.id===id));if(a==="delete-menu"&&confirm("刪除此菜色？"))await deleteDoc(doc(db,"wccMenu",id));
 if(a==="new-vendor")openVendor();if(a==="edit-vendor")openVendor(vendors.find(x=>x.id===id));if(a==="delete-vendor"&&confirm("刪除此廠商？"))await deleteDoc(doc(db,"wccVendors",id));
});

$("#saveBanquetSettings").onclick=async()=>{await setDoc(doc(db,"wccSettings","main"),{tableMapUrl:$("#tableMapUrl").value.trim(),updatedAt:serverTimestamp()},{merge:true});alert("已儲存")};

async function replaceSeating(data){
 const old=await getDocs(collection(db,"wccSeatingTables")),batch=writeBatch(db);
 old.docs.forEach(d=>batch.delete(d.ref));
 data.forEach((t,i)=>batch.set(doc(db,"wccSeatingTables",`table_${String(t.tableNo).replace(/\W/g,"_")}_${i}`),{...t,sort:Number(t.tableNo)||i,updatedAt:serverTimestamp()}));
 await batch.commit();
}
$("#importExcel").onclick=async()=>{
 const file=$("#excelFile").files[0];if(!file)return alert("請先選擇 Excel");
 const data=await file.arrayBuffer(),book=XLSX.read(data),sheet=book.Sheets[book.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{defval:""});
 const normalized=rows.filter(r=>r["桌次"]!==""&&r["姓名"]!=="").map(r=>({tableNo:Number(r["桌次"]),guests:String(r["姓名"]),relation:String(r["關係"]||""),count:Number(r["人數"]||0),tableName:String(r["桌名"]||""),notes:String(r["備註"]||"")}));
 if(!normalized.length)return alert("找不到桌次資料");
 if(confirm(`將以 ${normalized.length} 筆桌次覆蓋目前資料，確定嗎？`)){await replaceSeating(normalized);alert("匯入完成")}
};
$("#exportSeatingCsv").onclick=()=>{
 const rows=[["桌次","姓名","關係","人數","桌名","備註"],...tables.map(t=>[t.tableNo,t.guests,t.relation,t.count,t.tableName,t.notes])];
 const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="婚宴桌位.csv";a.click();URL.revokeObjectURL(a.href);
};

async function bootstrap(){
 const snap=await getDocs(collection(db,"wccSeatingTables"));
 if(snap.empty)await replaceSeating(INITIAL_SEATING_DATA);
}
async function start(){
 const app=initializeApp(firebaseConfig),auth=getAuth(app);db=getFirestore(app);await signInAnonymously(auth);await bootstrap();
 onSnapshot(query(collection(db,"wccSeatingTables"),orderBy("sort","asc")),s=>{tables=s.docs.map(d=>({id:d.id,...d.data()}));render()});
 onSnapshot(query(collection(db,"wccMenu"),orderBy("order","asc")),s=>{menu=s.docs.map(d=>({id:d.id,...d.data()}));render()});
 onSnapshot(collection(db,"wccVendors"),s=>{vendors=s.docs.map(d=>({id:d.id,...d.data()}));render()});
 onSnapshot(doc(db,"wccSettings","main"),s=>{if(s.exists())settings=s.data();render()});
}
start().catch(e=>alert("婚宴中心連線失敗："+e.message));
