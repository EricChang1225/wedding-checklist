import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, getDocs, getDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const esc = (v = "") => String(v).replace(/[&<>"']/g, (m) => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[m]));
const fmt = (ts) => {
  try { return ts?.toDate().toLocaleString("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) || ""; }
  catch { return ""; }
};

let db;
let currentUser;
let displayName = localStorage.getItem("weddingDisplayName") || "";
let currentView = "tasks";
let tasks = [];
let categories = [];
let people = [];
let settings = { coupleNames:"婚禮工作中心", weddingDate:"", initialized:false };
let selectedAssigneeNames = [];

const defaults = {
  categories:[
    ["文定準備","💍"],["迎娶與車隊","🚗"],["婚宴現場","🥂"],["攝影錄影","📸"],["新人隨身物品","🧳"]
  ],
  people:[],
  tasks:[
    ["十二禮與紅包確認完成","工作","文定準備","婚禮前二天"],
    ["奉茶名單最終確認","工作","文定準備","婚禮前一天"],
    ["禮車司機與集合時間確認","工作","迎娶與車隊","婚禮前一天"],
    ["車隊路線傳送給所有司機","工作","迎娶與車隊","婚禮前一天"],
    ["主持流程最終版","工作","婚宴現場","婚禮前一天"],
    ["收禮與招待分工確認","工作","婚宴現場","婚禮前二天"],
    ["攝影團隊抵達時間確認","工作","攝影錄影","婚禮前一天"],
    ["婚戒","物品","新人隨身物品","婚禮當天"],
    ["身分證、紅包袋、行動電源","物品","新人隨身物品","婚禮當天"]
  ]
};

function categoryById(id){ return categories.find((x)=>x.id===id); }
function personById(id){ return people.find((x)=>x.id===id); }
function personByName(name){ return people.find((x)=>x.name===name); }
function taskPeople(task){
  if(Array.isArray(task.assignees)) return task.assignees;
  return (task.assigneeIds || []).map((id)=>personById(id)?.name).filter(Boolean);
}

function setView(view){
  currentView = view;
  document.querySelectorAll(".tab").forEach((el)=>el.classList.toggle("active", el.dataset.view === view));
  document.querySelectorAll(".panel").forEach((el)=>el.classList.toggle("active", el.id === view));
  renderAll();
}

$("#tabs").addEventListener("click",(event)=>{
  const tab = event.target.closest(".tab");
  if(tab) setView(tab.dataset.view);
});

function askName(){
  $("#displayName").value = displayName;
  $("#nameDialog").showModal();
}
$("#changeName").addEventListener("click", askName);

$("#nameForm").addEventListener("submit",(event)=>{
  if(event.submitter?.value !== "ok") return;
  const value = $("#displayName").value.trim();
  if(!value){ event.preventDefault(); return; }
  displayName = value;
  localStorage.setItem("weddingDisplayName", value);
  renderHeader();
});

function renderHeader(){
  const total = tasks.length;
  const done = tasks.filter((x)=>x.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("#who").textContent = displayName ? `目前使用者：${displayName}` : "尚未設定姓名";
  $("#heroTitle").textContent = settings.coupleNames || "婚禮工作中心";
  $("#progressBar").style.width = pct + "%";
  $("#progressText").textContent = pct + "%";
}

function taskCard(task){
  const cat = categoryById(task.categoryId);
  const names = taskPeople(task);
  return `<div class="item ${task.done ? "done" : ""}">
    <input class="check" type="checkbox" data-action="toggle-task" data-id="${task.id}" ${task.done ? "checked" : ""}>
    <div class="main">
      <div class="name">${esc(task.title)}</div>
      <div class="meta">
        ${cat ? `${esc(cat.icon || "📌")} ${esc(cat.name)}・` : ""}${esc(task.type || "工作")}
        ${names.length ? `<br>負責人：${esc(names.join("、"))}` : "<br>負責人：未指定"}
        ${task.notes ? `<br>備註：${esc(task.notes)}` : ""}
        ${task.updatedBy ? `<br>最後更新：${esc(task.updatedBy)} ${fmt(task.updatedAt)}` : ""}
      </div>
    </div>
    <div class="actions">
      <span class="badge">${task.done ? "已完成" : "待完成"}</span>
      <button class="btn small" data-action="edit-task" data-id="${task.id}">修改</button>
      <button class="btn small danger" data-action="delete-task" data-id="${task.id}">刪除</button>
    </div>
  </div>`;
}

function renderDashboard(){
  const done = tasks.filter((x)=>x.done).length;
  const work = tasks.filter((x)=>x.type==="工作").length;
  const items = tasks.filter((x)=>x.type==="物品").length;
  const me = people.find((p)=>p.name===displayName);
  const mine = me ? tasks.filter((t)=>(t.assigneeIds||[]).includes(me.id) && !t.done).length : 0;

  $("#dashboard").innerHTML = `
    <div class="grid">
      <div class="stat"><strong>${done}/${tasks.length}</strong><span>整體完成</span></div>
      <div class="stat"><strong>${mine}</strong><span>我的未完成</span></div>
      <div class="stat"><strong>${work}</strong><span>工作內容</span></div>
      <div class="stat"><strong>${items}</strong><span>準備物品</span></div>
    </div>
    ${categories.map((cat)=>{
      const list = tasks.filter((t)=>t.categoryId===cat.id);
      return `<section class="section">
        <div class="head"><div class="title">${esc(cat.icon||"📌")} ${esc(cat.name)}</div><div class="count">${list.filter((t)=>t.done).length}/${list.length}</div></div>
        ${list.filter((t)=>!t.done).slice(0,3).map(taskCard).join("") || '<div class="empty">目前沒有未完成事項</div>'}
      </section>`;
    }).join("") || '<div class="empty">尚未建立分類</div>'}
  `;
}

function renderTasks(){
  const grouped = categories
    .map((cat)=>({cat, list:tasks.filter((t)=>t.categoryId===cat.id)}))
    .filter((x)=>x.list.length);
  const uncat = tasks.filter((t)=>!categoryById(t.categoryId));

  $("#tasks").innerHTML = `
    <div class="toolbar"><div></div><button class="btn primary" data-action="new-task">新增任務</button></div>
    ${grouped.map((group)=>`<section class="section">
      <div class="head"><div class="title">${esc(group.cat.icon||"📌")} ${esc(group.cat.name)}</div><div class="count">${group.list.filter((t)=>t.done).length}/${group.list.length}</div></div>
      ${group.list.map(taskCard).join("")}
    </section>`).join("")}
    ${uncat.length ? `<section class="section"><div class="head"><div class="title">📌 未分類</div></div>${uncat.map(taskCard).join("")}</section>` : ""}
    ${tasks.length ? "" : '<div class="empty">目前沒有任務</div>'}
  `;
}

function renderMine(){
  if(!displayName){
    $("#mine").innerHTML = `<div class="notice">請先設定目前使用者姓名。</div>`;
    return;
  }
  const me = people.find((p)=>p.name===displayName);
  const mine = tasks.filter((t)=>
    (t.assignees||[]).includes(displayName) || (me && (t.assigneeIds||[]).includes(me.id))
  );
  const work = mine.filter((t)=>t.type==="工作");
  const items = mine.filter((t)=>t.type==="物品");

  $("#mine").innerHTML = `
    <section class="section">
      <div class="head"><div class="title">🧑‍💼 ${esc(me.name)}的工作內容</div><div class="count">${work.filter((t)=>t.done).length}/${work.length}</div></div>
      ${work.map(taskCard).join("") || '<div class="empty">目前沒有工作任務</div>'}
    </section>
    <section class="section">
      <div class="head"><div class="title">🧳 ${esc(me.name)}要準備的物品</div><div class="count">${items.filter((t)=>t.done).length}/${items.length}</div></div>
      ${items.map(taskCard).join("") || '<div class="empty">目前沒有物品清單</div>'}
    </section>
  `;
}

function renderPeople(){
  $("#people").innerHTML = `
    <div class="toolbar"><div></div><button class="btn primary" data-action="new-person">新增人員</button></div>
    <div class="cardlist">
      ${people.map((person)=>{
        const assigned = tasks.filter((t)=>(t.assignees||[]).includes(person.name) || (t.assigneeIds||[]).includes(person.id));
        return `<div class="person">
          <div class="person-info"><strong>${esc(person.name)}</strong><small>${esc(person.role||"未設定角色")}・任務 ${assigned.length} 項</small></div>
          <div class="actions">
            <button class="btn small" data-action="show-person" data-id="${person.id}">查看</button>
            <button class="btn small" data-action="edit-person" data-id="${person.id}">修改</button>
            <button class="btn small danger" data-action="delete-person" data-id="${person.id}">刪除</button>
          </div>
        </div>`;
      }).join("") || '<div class="empty">尚未建立人員</div>'}
    </div>
  `;
}

function renderCategories(){
  $("#categories").innerHTML = `
    <div class="toolbar"><div></div><button class="btn primary" data-action="new-category">新增分類</button></div>
    <div class="cardlist">
      ${categories.map((cat)=>{
        const list = tasks.filter((t)=>t.categoryId===cat.id);
        return `<div class="category">
          <div class="category-info"><strong>${esc(cat.icon||"📌")} ${esc(cat.name)}</strong><small>任務 ${list.length} 項・完成 ${list.filter((t)=>t.done).length} 項</small></div>
          <div class="actions">
            <button class="btn small" data-action="edit-category" data-id="${cat.id}">修改</button>
            <button class="btn small danger" data-action="delete-category" data-id="${cat.id}">刪除</button>
          </div>
        </div>`;
      }).join("") || '<div class="empty">尚未建立分類</div>'}
    </div>
  `;
}

function renderSettings(){
  $("#settings").innerHTML = `
    <section class="section">
      <div class="head"><div class="title">⚙️ 基本設定</div></div>
      <div style="padding:16px">
        <div class="field"><label>首頁名稱</label><input id="settingNames" value="${esc(settings.coupleNames||"")}"></div>
        <button class="btn primary" data-action="save-settings">儲存設定</button>
      </div>
    </section>
  `;
}

function renderAll(){
  renderHeader();
  if(currentView==="tasks") renderTasks();
  if(currentView==="mine") renderMine();
  if(currentView==="people") renderPeople();
  if(currentView==="categories") renderCategories();
  if(currentView==="settings") renderSettings();
}

function renderAssigneeTags(){
  $("#assigneeTags").innerHTML = selectedAssigneeNames.map((name)=>`
    <span class="tag">${esc(name)}<button type="button" data-remove-assignee="${esc(name)}">×</button></span>
  `).join("");
}

function renderAssigneeSuggestions(){
  const input = $("#assigneeInput");
  if(!input) return;
  const text = input.value.trim().toLowerCase();
  const list = people.filter((p)=>!selectedAssigneeNames.includes(p.name))
    .filter((p)=>!text || p.name.toLowerCase().includes(text)).slice(0,8);
  $("#assigneeSuggestions").innerHTML = list.map((p)=>`
    <button type="button" class="suggestion" data-suggest-assignee="${esc(p.name)}">${esc(p.name)}</button>
  `).join("");
}

function addAssigneeName(raw){
  const name = raw.trim();
  if(!name || selectedAssigneeNames.includes(name)) return;
  selectedAssigneeNames.push(name);
  $("#assigneeInput").value = "";
  renderAssigneeTags();
  renderAssigneeSuggestions();
}

$("#addAssignee").addEventListener("click",()=>addAssigneeName($("#assigneeInput").value));
$("#assigneeInput").addEventListener("input",renderAssigneeSuggestions);
$("#assigneeInput").addEventListener("keydown",(event)=>{
  if(event.key === "Enter"){ event.preventDefault(); addAssigneeName(event.target.value); }
});
$("#assigneeSuggestions").addEventListener("click",(event)=>{
  const b=event.target.closest("[data-suggest-assignee]");
  if(b) addAssigneeName(b.dataset.suggestAssignee);
});
$("#assigneeTags").addEventListener("click",(event)=>{
  const b=event.target.closest("[data-remove-assignee]");
  if(!b) return;
  selectedAssigneeNames = selectedAssigneeNames.filter((name)=>name!==b.dataset.removeAssignee);
  renderAssigneeTags();
  renderAssigneeSuggestions();
});

function openTaskDialog(task=null){
  $("#taskDialogTitle").textContent = task ? "修改任務" : "新增任務";
  $("#taskId").value = task?.id || "";
  $("#taskTitle").value = task?.title || "";
  $("#taskType").value = task?.type || "工作";
  $("#taskCategory").innerHTML = categories.map((cat)=>`<option value="${cat.id}">${esc(cat.icon||"📌")} ${esc(cat.name)}</option>`).join("");
  $("#taskCategory").value = task?.categoryId || categories[0]?.id || "";
  $("#taskNotes").value = task?.notes || "";
  selectedAssigneeNames = [...(task?.assignees || taskPeople(task) || [])];
  $("#assigneeInput").value = "";
  renderAssigneeTags();
  renderAssigneeSuggestions();
  $("#taskDialog").showModal();
}

function openCategoryDialog(cat=null){
  $("#categoryDialogTitle").textContent = cat ? "修改分類" : "新增分類";
  $("#categoryId").value = cat?.id || "";
  $("#categoryName").value = cat?.name || "";
  $("#categoryIcon").value = cat?.icon || "";
  $("#categoryDialog").showModal();
}

function openPersonDialog(person=null){
  $("#personDialogTitle").textContent = person ? "修改人員" : "新增人員";
  $("#personId").value = person?.id || "";
  $("#personName").value = person?.name || "";
  $("#personRole").value = person?.role || "";
  $("#personPhone").value = person?.phone || "";
  $("#personDialog").showModal();
}

async function ensurePeopleExist(names){
  for(const name of names){
    if(!personByName(name)){
      await addDoc(collection(db,"weddingPeople"),{name,role:"",phone:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    }
  }
}

$("#taskForm").addEventListener("submit",async(event)=>{
  if(event.submitter?.value !== "ok") return;
  event.preventDefault();
  const id = $("#taskId").value;
  const payload = {
    title:$("#taskTitle").value.trim(),
    type:$("#taskType").value,
    categoryId:$("#taskCategory").value,
    assignees:[...selectedAssigneeNames],
    notes:$("#taskNotes").value.trim(),
    updatedAt:serverTimestamp(),
    updatedBy:displayName,
    updatedByUid:currentUser.uid
  };
  if(!payload.title) return;
  await ensurePeopleExist(payload.assignees);
  if(id) await updateDoc(doc(db,"weddingTasks",id),payload);
  else await addDoc(collection(db,"weddingTasks"),{...payload,done:false,createdAt:serverTimestamp()});
  $("#taskForm").reset();
  selectedAssigneeNames = [];
  $("#taskDialog").close();
});

$("#categoryForm").addEventListener("submit",async(event)=>{
  if(event.submitter?.value !== "ok") return;
  event.preventDefault();
  const id = $("#categoryId").value;
  const payload = {
    name:$("#categoryName").value.trim(),
    icon:$("#categoryIcon").value.trim() || "📌",
    updatedAt:serverTimestamp()
  };
  if(!payload.name) return;
  if(id) await updateDoc(doc(db,"weddingCategories",id),payload);
  else await addDoc(collection(db,"weddingCategories"),{...payload,createdAt:serverTimestamp()});
  $("#categoryForm").reset();
  $("#categoryDialog").close();
});

$("#personForm").addEventListener("submit",async(event)=>{
  if(event.submitter?.value !== "ok") return;
  event.preventDefault();
  const id = $("#personId").value;
  const payload = {
    name:$("#personName").value.trim(),
    role:$("#personRole").value.trim(),
    phone:$("#personPhone").value.trim(),
    updatedAt:serverTimestamp()
  };
  if(!payload.name) return;
  if(id) await updateDoc(doc(db,"weddingPeople",id),payload);
  else await addDoc(collection(db,"weddingPeople"),{...payload,createdAt:serverTimestamp()});
  $("#personForm").reset();
  $("#personDialog").close();
});

document.body.addEventListener("click",(event)=>{
  const closeButton = event.target.closest("[data-close]");
  if(closeButton){
    const dialog = closeButton.closest("dialog");
    if(dialog?.open) dialog.close();
    return;
  }
  if(event.target.tagName === "DIALOG" && event.target.open){
    event.target.close();
  }
});

document.body.addEventListener("click",async(event)=>{
  const button = event.target.closest("[data-action]");
  if(!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  try{
    if(action==="new-task") openTaskDialog();
    if(action==="edit-task") openTaskDialog(tasks.find((x)=>x.id===id));

    if(action==="delete-task"){
      const task = tasks.find((x)=>x.id===id);
      if(task && confirm(`確定刪除「${task.title}」嗎？`)) await deleteDoc(doc(db,"weddingTasks",id));
    }

    if(action==="toggle-task"){
      await updateDoc(doc(db,"weddingTasks",id),{
        done:button.checked,
        updatedAt:serverTimestamp(),
        updatedBy:displayName,
        updatedByUid:currentUser.uid
      });
    }

    if(action==="new-category") openCategoryDialog();
    if(action==="edit-category") openCategoryDialog(categoryById(id));

    if(action==="delete-category"){
      const cat = categoryById(id);
      const affected = tasks.filter((t)=>t.categoryId===id);
      if(cat && confirm(affected.length ? `分類內有 ${affected.length} 個任務，刪除後會移到未分類。確定嗎？` : `確定刪除「${cat.name}」嗎？`)){
        const batch = writeBatch(db);
        affected.forEach((task)=>batch.update(doc(db,"weddingTasks",task.id),{categoryId:""}));
        batch.delete(doc(db,"weddingCategories",id));
        await batch.commit();
      }
    }

    if(action==="new-person") openPersonDialog();
    if(action==="edit-person") openPersonDialog(personById(id));

    if(action==="delete-person"){
      const person = personById(id);
      if(person && confirm(`確定刪除「${person.name}」嗎？任務上的姓名仍會保留。`)){
        await deleteDoc(doc(db,"weddingPeople",id));
      }
    }

    if(action==="show-person"){
      const person = personById(id);
      if(person){
        displayName = person.name;
        localStorage.setItem("weddingDisplayName", person.name);
        setView("mine");
      }
    }

    if(action==="save-settings"){
      await setDoc(doc(db,"weddingSettings","main"),{
        coupleNames:$("#settingNames").value.trim(),
        initialized:true,
        updatedAt:serverTimestamp()
      },{merge:true});
    }
  }catch(error){
    alert("操作失敗：" + error.message);
  }
});

$("#fab").addEventListener("click",()=>{
  if(currentView==="people") openPersonDialog();
  else if(currentView==="categories") openCategoryDialog();
  else if(currentView!=="settings") openTaskDialog();
});

async function bootstrap(){
  const settingsRef = doc(db,"weddingSettings","main");
  const settingsSnap = await getDoc(settingsRef);
  if(settingsSnap.exists() && settingsSnap.data().initialized) return;

  const categoriesSnap = await getDocs(collection(db,"weddingCategories"));
  if(!categoriesSnap.empty){
    await setDoc(settingsRef,{initialized:true,coupleNames:"婚禮工作中心",weddingDate:""},{merge:true});
    return;
  }

  const batch = writeBatch(db);
  const categoryRefs = {};

  defaults.categories.forEach(([name,icon],index)=>{
    const ref = doc(collection(db,"weddingCategories"));
    categoryRefs[name] = ref;
    batch.set(ref,{name,icon,sort:index,createdAt:serverTimestamp()});
  });


  defaults.tasks.forEach(([title,type,category,due],index)=>{
    const ref = doc(collection(db,"weddingTasks"));
    batch.set(ref,{
      title,type,categoryId:categoryRefs[category].id,assignees:[],assigneeIds:[],
      due,notes:"",done:false,sort:index,
      createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:"系統建立"
    });
  });

  batch.set(settingsRef,{
    initialized:true,coupleNames:"婚禮工作中心",weddingDate:"",
    createdAt:serverTimestamp()
  });
  await batch.commit();
}

function subscribe(){
  onSnapshot(query(collection(db,"weddingCategories"),orderBy("createdAt","asc")),(snap)=>{
    categories = snap.docs.map((item)=>({id:item.id,...item.data()}));
    renderAll();
  });
  onSnapshot(query(collection(db,"weddingPeople"),orderBy("createdAt","asc")),(snap)=>{
    people = snap.docs.map((item)=>({id:item.id,...item.data()}));
    if($("#taskDialog")?.open) renderAssigneeSuggestions();
    renderAll();
  });
  onSnapshot(query(collection(db,"weddingTasks"),orderBy("createdAt","asc")),(snap)=>{
    tasks = snap.docs.map((item)=>({id:item.id,...item.data()}));
    renderAll();
  });
  onSnapshot(doc(db,"weddingSettings","main"),(snap)=>{
    if(snap.exists()) settings = {...settings,...snap.data()};
    renderAll();
  });
}

async function start(){
  if(!displayName) askName();
  renderHeader();

  try{
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    db = getFirestore(app);

    const credential = await signInAnonymously(auth);
    currentUser = credential.user;

    $("#sync").className = "sync ok";
    $("#sync").textContent = "已連線・多人即時同步";

    await bootstrap();
    subscribe();
  }catch(error){
    $("#sync").className = "sync bad";
    $("#sync").textContent = "連線失敗";
    $("#dashboard").innerHTML = `<div class="error">${esc(error.message)}</div>`;
  }
}
start();
