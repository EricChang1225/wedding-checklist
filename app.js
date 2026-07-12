import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, getDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const esc = (v = "") => String(v).replace(/[&<>"']/g, (m) => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[m]));

let db;
let view = "tasks";
let tasks = [];
let people = [];
let categories = [];
let settings = { title:"婚禮 Checklist", initialized:false };
let selectedAssigneeNames = [];
let displayName = localStorage.getItem("weddingDisplayName") || "";

const defaults = {
  categories:[
    ["文定準備","💍"],
    ["迎娶與車隊","🚗"],
    ["婚宴現場","🥂"],
    ["攝影錄影","📸"],
    ["新人隨身物品","🧳"]
  ],
  tasks:[
    ["十二禮與紅包確認完成","工作","文定準備"],
    ["奉茶名單最終確認","工作","文定準備"],
    ["禮車司機與集合時間確認","工作","迎娶與車隊"],
    ["主持流程最終版","工作","婚宴現場"],
    ["攝影團隊抵達時間確認","工作","攝影錄影"],
    ["婚戒","物品","新人隨身物品"]
  ]
};

const categoryById = (id) => categories.find((x) => x.id === id);
const personByName = (name) => people.find((x) => x.name === name);

function setView(nextView){
  view = nextView;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.view === nextView));
  document.querySelectorAll(".panel").forEach((x) => x.classList.toggle("active", x.id === nextView));
  render();
}

$("#tabs").addEventListener("click", (event) => {
  const button = event.target.closest(".tab");
  if(button) setView(button.dataset.view);
});

function renderHeader(){
  const done = tasks.filter((x) => x.done).length;
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  $("#appTitle").textContent = settings.title || "婚禮 Checklist";
  $("#who").textContent = displayName ? `目前使用者：${displayName}` : "尚未設定姓名";
  $("#bar").style.width = pct + "%";
  $("#pct").textContent = pct + "%";
}

function taskCard(task){
  const category = categoryById(task.categoryId);
  const names = Array.isArray(task.assignees) ? task.assignees : [];
  return `<div class="item ${task.done ? "done" : ""}">
    <input class="check" type="checkbox" data-action="toggle" data-id="${task.id}" ${task.done ? "checked" : ""}>
    <div class="main">
      <div class="name">${esc(task.title)}</div>
      <div class="meta">
        ${category ? `${esc(category.icon || "📌")} ${esc(category.name)}・` : ""}${esc(task.type || "工作")}
        ${names.length ? `<br>負責人：${esc(names.join("、"))}` : "<br>負責人：未指定"}
        ${task.notes ? `<br>備註：${esc(task.notes)}` : ""}
      </div>
    </div>
    <div class="actions">
      <button class="btn small" data-action="edit-task" data-id="${task.id}">修改</button>
      <button class="btn small danger" data-action="delete-task" data-id="${task.id}">刪除</button>
    </div>
  </div>`;
}

function renderTasks(){
  const groups = categories
    .map((category) => ({ category, list:tasks.filter((task) => task.categoryId === category.id) }))
    .filter((group) => group.list.length);

  const uncategorized = tasks.filter((task) => !categoryById(task.categoryId));

  $("#tasks").innerHTML = `
    <div class="toolbar"><button class="btn primary" data-action="new-task">新增任務</button></div>
    ${groups.map((group) => `<section class="section">
      <div class="head">
        <div class="title">${esc(group.category.icon || "📌")} ${esc(group.category.name)}</div>
        <div class="count">${group.list.filter((task) => task.done).length}/${group.list.length}</div>
      </div>
      ${group.list.map(taskCard).join("")}
    </section>`).join("")}
    ${uncategorized.length ? `<section class="section">
      <div class="head"><div class="title">📌 未分類</div><div class="count">${uncategorized.filter((task)=>task.done).length}/${uncategorized.length}</div></div>
      ${uncategorized.map(taskCard).join("")}
    </section>` : ""}
    ${tasks.length ? "" : '<div class="empty">目前沒有任務</div>'}
  `;
}

function renderMine(){
  if(!displayName){
    $("#mine").innerHTML = '<div class="notice">請先到設定頁設定目前使用者姓名。</div>';
    return;
  }
  const mine = tasks.filter((task) => (task.assignees || []).includes(displayName));
  const work = mine.filter((task) => task.type === "工作");
  const items = mine.filter((task) => task.type === "物品");

  $("#mine").innerHTML = `
    <section class="section">
      <div class="head"><div class="title">工作內容</div><div class="count">${work.filter((task) => task.done).length}/${work.length}</div></div>
      ${work.map(taskCard).join("") || '<div class="empty">沒有工作內容</div>'}
    </section>
    <section class="section">
      <div class="head"><div class="title">準備物品</div><div class="count">${items.filter((task) => task.done).length}/${items.length}</div></div>
      ${items.map(taskCard).join("") || '<div class="empty">沒有準備物品</div>'}
    </section>
  `;
}

function renderPeople(){
  $("#people").innerHTML = `
    <div class="toolbar"><button class="btn primary" data-action="new-person">新增人員</button></div>
    <div class="cardlist">
      ${people.map((person) => `
        <div class="person">
          <div><strong>${esc(person.name)}</strong><div class="meta">${esc(person.role || "未設定角色")}</div></div>
          <div class="actions">
            <button class="btn small" data-action="show-person" data-id="${person.id}">查看</button>
            <button class="btn small" data-action="edit-person" data-id="${person.id}">修改</button>
            <button class="btn small danger" data-action="delete-person" data-id="${person.id}">刪除</button>
          </div>
        </div>`).join("") || '<div class="empty">尚未建立人員</div>'}
    </div>
  `;
}

function renderCategories(){
  $("#categories").innerHTML = `
    <div class="toolbar"><button class="btn primary" data-action="new-category">新增分類</button></div>
    <div class="cardlist">
      ${categories.map((category) => `
        <div class="category">
          <div><strong>${esc(category.icon || "📌")} ${esc(category.name)}</strong><div class="meta">任務 ${tasks.filter((task) => task.categoryId === category.id).length} 項</div></div>
          <div class="actions">
            <button class="btn small" data-action="edit-category" data-id="${category.id}">修改</button>
            <button class="btn small danger" data-action="delete-category" data-id="${category.id}">刪除</button>
          </div>
        </div>`).join("") || '<div class="empty">尚未建立分類</div>'}
    </div>
  `;
}

function renderSettings(){
  $("#settings").innerHTML = `
    <section class="section">
      <div class="head"><div class="title">設定</div></div>
      <div style="padding:16px">
        <div class="field"><label>網站名稱</label><input id="settingTitle" value="${esc(settings.title || "")}"></div>
        <button class="btn primary" data-action="save-settings">儲存名稱</button>
        <button class="btn" id="changeName">更改目前姓名</button>
      </div>
    </section>
  `;
  $("#changeName").addEventListener("click", openNameDialog);
}

function render(){
  renderHeader();
  ({
    tasks:renderTasks,
    mine:renderMine,
    people:renderPeople,
    categories:renderCategories,
    settings:renderSettings
  }[view])();
}

function closeDialog(id){
  const dialog = document.getElementById(id);
  if(dialog?.open) dialog.close();
}

document.body.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close]");
  if(closeButton){
    closeDialog(closeButton.dataset.close);
    return;
  }
  if(event.target.tagName === "DIALOG"){
    event.target.close();
  }
});

function openNameDialog(){
  $("#displayName").value = displayName;
  $("#nameDialog").showModal();
}

$("#nameForm").addEventListener("submit", (event) => {
  event.preventDefault();
  displayName = $("#displayName").value.trim();
  if(!displayName) return;
  localStorage.setItem("weddingDisplayName", displayName);
  closeDialog("nameDialog");
  render();
});

function renderAssigneeTags(){
  $("#assigneeTags").innerHTML = selectedAssigneeNames.map((name) => `
    <span class="tag">${esc(name)}<button type="button" data-remove-assignee="${esc(name)}">×</button></span>
  `).join("");
}

function renderAssigneeSuggestions(){
  const input = $("#assigneeInput");
  const container = $("#assigneeSuggestions");
  if(!input || !container) return;

  const text = input.value.trim().toLowerCase();
  const available = people
    .filter((person) => !selectedAssigneeNames.includes(person.name))
    .filter((person) => !text || person.name.toLowerCase().includes(text))
    .slice(0,8);

  container.innerHTML = available.map((person) => `
    <button type="button" class="suggestion" data-suggest-assignee="${esc(person.name)}">${esc(person.name)}</button>
  `).join("");
}

function addAssigneeName(rawName){
  const name = rawName.trim();
  if(!name || selectedAssigneeNames.includes(name)) return;
  selectedAssigneeNames.push(name);
  $("#assigneeInput").value = "";
  renderAssigneeTags();
  renderAssigneeSuggestions();
}

$("#addAssignee").addEventListener("click", () => addAssigneeName($("#assigneeInput").value));

$("#assigneeInput").addEventListener("input", renderAssigneeSuggestions);
$("#assigneeInput").addEventListener("keydown", (event) => {
  if(event.key === "Enter"){
    event.preventDefault();
    addAssigneeName($("#assigneeInput").value);
  }
});

$("#assigneeSuggestions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-suggest-assignee]");
  if(button) addAssigneeName(button.dataset.suggestAssignee);
});

$("#assigneeTags").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-assignee]");
  if(!button) return;
  selectedAssigneeNames = selectedAssigneeNames.filter((name) => name !== button.dataset.removeAssignee);
  renderAssigneeTags();
  renderAssigneeSuggestions();
});

function openTaskDialog(task = null){
  $("#taskDialogTitle").textContent = task ? "修改任務" : "新增任務";
  $("#taskId").value = task?.id || "";
  $("#taskTitle").value = task?.title || "";
  $("#taskType").value = task?.type || "工作";
  $("#taskCategory").innerHTML = categories.map((category) => `
    <option value="${category.id}">${esc(category.icon || "📌")} ${esc(category.name)}</option>
  `).join("");
  $("#taskCategory").value = task?.categoryId || categories[0]?.id || "";
  $("#taskNotes").value = task?.notes || "";
  selectedAssigneeNames = [...(task?.assignees || [])];
  $("#assigneeInput").value = "";
  renderAssigneeTags();
  renderAssigneeSuggestions();
  $("#taskDialog").showModal();
}

async function ensurePeopleExist(names){
  for(const name of names){
    if(!personByName(name)){
      await addDoc(collection(db,"weddingPeople"),{
        name,
        role:"",
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      });
    }
  }
}

$("#taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#taskId").value;
  const payload = {
    title:$("#taskTitle").value.trim(),
    type:$("#taskType").value,
    categoryId:$("#taskCategory").value,
    assignees:[...selectedAssigneeNames],
    notes:$("#taskNotes").value.trim(),
    updatedAt:serverTimestamp(),
    updatedBy:displayName
  };
  if(!payload.title) return;

  await ensurePeopleExist(payload.assignees);

  if(id){
    await updateDoc(doc(db,"weddingTasks",id),payload);
  }else{
    await addDoc(collection(db,"weddingTasks"),{
      ...payload,
      done:false,
      createdAt:serverTimestamp()
    });
  }

  event.target.reset();
  selectedAssigneeNames = [];
  closeDialog("taskDialog");
});

function openPersonDialog(person = null){
  $("#personDialogTitle").textContent = person ? "修改人員" : "新增人員";
  $("#personId").value = person?.id || "";
  $("#personName").value = person?.name || "";
  $("#personRole").value = person?.role || "";
  $("#personDialog").showModal();
}

$("#personForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#personId").value;
  const oldPerson = people.find((person) => person.id === id);
  const payload = {
    name:$("#personName").value.trim(),
    role:$("#personRole").value.trim(),
    updatedAt:serverTimestamp()
  };
  if(!payload.name) return;

  if(id){
    await updateDoc(doc(db,"weddingPeople",id),payload);

    if(oldPerson && oldPerson.name !== payload.name){
      const batch = writeBatch(db);
      tasks
        .filter((task) => (task.assignees || []).includes(oldPerson.name))
        .forEach((task) => {
          batch.update(doc(db,"weddingTasks",task.id),{
            assignees:(task.assignees || []).map((name) => name === oldPerson.name ? payload.name : name)
          });
        });
      await batch.commit();
    }
  }else{
    await addDoc(collection(db,"weddingPeople"),{
      ...payload,
      createdAt:serverTimestamp()
    });
  }

  event.target.reset();
  closeDialog("personDialog");
});

function openCategoryDialog(category = null){
  $("#categoryDialogTitle").textContent = category ? "修改分類" : "新增分類";
  $("#categoryId").value = category?.id || "";
  $("#categoryName").value = category?.name || "";
  $("#categoryIcon").value = category?.icon || "";
  $("#categoryDialog").showModal();
}

$("#categoryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#categoryId").value;
  const payload = {
    name:$("#categoryName").value.trim(),
    icon:$("#categoryIcon").value.trim() || "📌",
    updatedAt:serverTimestamp()
  };
  if(!payload.name) return;

  if(id){
    await updateDoc(doc(db,"weddingCategories",id),payload);
  }else{
    await addDoc(collection(db,"weddingCategories"),{
      ...payload,
      createdAt:serverTimestamp()
    });
  }

  event.target.reset();
  closeDialog("categoryDialog");
});

document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if(!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if(action === "new-task") openTaskDialog();
  if(action === "edit-task") openTaskDialog(tasks.find((task) => task.id === id));

  if(action === "toggle"){
    await updateDoc(doc(db,"weddingTasks",id),{
      done:button.checked,
      updatedAt:serverTimestamp(),
      updatedBy:displayName
    });
  }

  if(action === "delete-task"){
    const task = tasks.find((task) => task.id === id);
    if(task && confirm(`刪除「${task.title}」？`)){
      await deleteDoc(doc(db,"weddingTasks",id));
    }
  }

  if(action === "new-person") openPersonDialog();
  if(action === "edit-person") openPersonDialog(people.find((person) => person.id === id));

  if(action === "delete-person"){
    const person = people.find((person) => person.id === id);
    if(person && confirm(`刪除「${person.name}」？其任務仍會保留姓名。`)){
      await deleteDoc(doc(db,"weddingPeople",id));
    }
  }

  if(action === "show-person"){
    const person = people.find((person) => person.id === id);
    if(person){
      displayName = person.name;
      localStorage.setItem("weddingDisplayName",person.name);
      setView("mine");
    }
  }

  if(action === "new-category") openCategoryDialog();
  if(action === "edit-category") openCategoryDialog(categories.find((category) => category.id === id));

  if(action === "delete-category"){
    const category = categories.find((category) => category.id === id);
    if(category && confirm(`刪除分類「${category.name}」？該分類任務會變成未分類。`)){
      const batch = writeBatch(db);
      tasks
        .filter((task) => task.categoryId === id)
        .forEach((task) => {
          batch.update(doc(db,"weddingTasks",task.id),{categoryId:""});
        });
      batch.delete(doc(db,"weddingCategories",id));
      await batch.commit();
    }
  }

  if(action === "save-settings"){
    await setDoc(doc(db,"weddingSettings","main"),{
      title:$("#settingTitle").value.trim(),
      initialized:true
    },{merge:true});
  }
});

$("#fab").addEventListener("click", () => {
  if(view === "people"){
    openPersonDialog();
  }else if(view === "categories"){
    openCategoryDialog();
  }else{
    openTaskDialog();
  }
});

async function bootstrap(){
  const settingsRef = doc(db,"weddingSettings","main");
  const settingsSnap = await getDoc(settingsRef);

  if(settingsSnap.exists() && settingsSnap.data().initialized){
    return;
  }

  const categorySnap = await getDocs(collection(db,"weddingCategories"));
  if(!categorySnap.empty){
    await setDoc(settingsRef,{
      initialized:true,
      title:"婚禮 Checklist"
    },{merge:true});
    return;
  }

  const batch = writeBatch(db);
  const refs = {};

  defaults.categories.forEach(([name,icon],index) => {
    const ref = doc(collection(db,"weddingCategories"));
    refs[name] = ref;
    batch.set(ref,{
      name,
      icon,
      sort:index,
      createdAt:serverTimestamp()
    });
  });

  defaults.tasks.forEach(([title,type,category],index) => {
    const ref = doc(collection(db,"weddingTasks"));
    batch.set(ref,{
      title,
      type,
      categoryId:refs[category].id,
      assignees:[],
      notes:"",
      done:false,
      sort:index,
      createdAt:serverTimestamp()
    });
  });

  batch.set(settingsRef,{
    initialized:true,
    title:"婚禮 Checklist"
  });

  await batch.commit();
}

async function start(){
  if(!displayName){
    openNameDialog();
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getFirestore(app);

  await signInAnonymously(auth);

  $("#sync").className = "sync ok";
  $("#sync").textContent = "已連線・多人即時同步";

  await bootstrap();

  onSnapshot(query(collection(db,"weddingTasks"),orderBy("createdAt","asc")), (snapshot) => {
    tasks = snapshot.docs.map((item) => ({id:item.id,...item.data()}));
    render();
  });

  onSnapshot(query(collection(db,"weddingPeople"),orderBy("createdAt","asc")), (snapshot) => {
    people = snapshot.docs.map((item) => ({id:item.id,...item.data()}));
    renderAssigneeSuggestions();
    render();
  });

  onSnapshot(query(collection(db,"weddingCategories"),orderBy("createdAt","asc")), (snapshot) => {
    categories = snapshot.docs.map((item) => ({id:item.id,...item.data()}));
    render();
  });

  onSnapshot(doc(db,"weddingSettings","main"), (snapshot) => {
    if(snapshot.exists()){
      settings = {...settings,...snapshot.data()};
    }
    render();
  });
}

start().catch((error) => {
  $("#sync").className = "sync bad";
  $("#sync").textContent = "連線失敗";
  alert(error.message);
});
