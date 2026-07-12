import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, updateDoc, onSnapshot,
  serverTimestamp, query, orderBy, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const CATEGORY_ORDER=["文定準備","迎娶與車隊","婚宴現場","新人隨身物品","其他"];
const ICONS={"文定準備":"💍","迎娶與車隊":"🚗","婚宴現場":"🥂","新人隨身物品":"🧳","其他":"📌"};
const seed=[
["文定準備","十二禮與紅包確認完成","紹廷","7/16 前"],
["文定準備","奉茶名單最終確認","媒人","7/17 前"],
["文定準備","喜餅與茶具送達","女方家人","7/17 前"],
["文定準備","好命婆與引鳳時間確認","筱彤","7/17 前"],
["迎娶與車隊","六台禮車司機確認","紹廷","7/16 前"],
["迎娶與車隊","車隊路線與集合時間傳送","國哥","7/17 前"],
["迎娶與車隊","鳴炮人員與炮竹準備","明松叔叔","7/17 前"],
["迎娶與車隊","攝影團隊抵達時間確認","倆好攝影","7/17 前"],
["婚宴現場","Candy Bar 尾款確認","紹廷","7/17 前"],
["婚宴現場","冰淇淋 41 桌數量確認","筱彤","7/17 前"],
["婚宴現場","主持人流程最終版","主持人","7/17 前"],
["婚宴現場","收禮、招待、工作人員分工表","紹廷","7/16 前"],
["新人隨身物品","婚戒","伴郎","婚禮當天"],
["新人隨身物品","身分證與紅包袋","紹廷","婚禮當天"],
["新人隨身物品","備用襯衫、襪子、行動電源","筱彤","婚禮當天"]
];

const $=s=>document.querySelector(s);
let displayName=localStorage.getItem("weddingDisplayName")||"";
let items=[]; let db, auth; let currentUser=null;

function configReady(){return firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_")}
function askName(){ $("#displayName").value=displayName; $("#nameDialog").showModal(); }
function updateWho(){ $("#who").textContent=displayName?`目前使用者：${displayName}`:"尚未設定使用者"; }

$("#changeName").onclick=askName;
$("#nameForm").addEventListener("submit",e=>{
  if(e.submitter?.value!=="ok") return;
  const v=$("#displayName").value.trim(); if(!v){e.preventDefault();return}
  displayName=v; localStorage.setItem("weddingDisplayName",v); updateWho();
});
$("#addBtn").onclick=()=>{if(!displayName)return askName();$("#newOwner").value=displayName;$("#addDialog").showModal()};
$("#addForm").addEventListener("submit",async e=>{
  if(e.submitter?.value!=="ok")return;
  e.preventDefault();
  const title=$("#newTitle").value.trim(); if(!title)return;
  await addDoc(collection(db,"weddingChecklist"),{
    category:$("#newCategory").value,title,owner:$("#newOwner").value.trim(),
    due:$("#newDue").value.trim(),done:false,createdAt:serverTimestamp(),
    updatedAt:serverTimestamp(),updatedBy:displayName,updatedByUid:currentUser.uid
  });
  $("#newTitle").value=""; $("#newDue").value=""; $("#addDialog").close();
});

function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function fmtTime(ts){try{return ts?.toDate().toLocaleString("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})||""}catch{return""}}

function render(){
  const groups={}; CATEGORY_ORDER.forEach(c=>groups[c]=[]);
  items.forEach(x=>(groups[x.category]||(groups[x.category]=[])).push(x));
  const total=items.length, done=items.filter(x=>x.done).length, pct=total?Math.round(done/total*100):0;
  $("#bar").style.width=pct+"%"; $("#pct").textContent=pct+"%";
  $("#list").innerHTML=Object.entries(groups).filter(([,arr])=>arr.length).map(([cat,arr])=>{
    const d=arr.filter(x=>x.done).length;
    return `<section class="section"><div class="head"><div class="title">${ICONS[cat]||"📌"} ${esc(cat)}</div><div class="count">${d} / ${arr.length}</div></div>
    ${arr.map(x=>`<label class="item ${x.done?"done":""}">
      <input type="checkbox" data-id="${x.id}" ${x.done?"checked":""}>
      <div class="main"><div class="name">${esc(x.title)}</div>
      <div class="meta">負責人：${esc(x.owner||"未指定")} ${x.due?`・${esc(x.due)}`:""}
      ${x.updatedBy?`<br>最後更新：${esc(x.updatedBy)} ${fmtTime(x.updatedAt)}`:""}</div></div>
      <div class="badge">${x.done?"已完成":"待完成"}</div></label>`).join("")}</section>`;
  }).join("") || `<div class="empty">目前沒有待辦事項</div>`;

  document.querySelectorAll('input[type="checkbox"][data-id]').forEach(cb=>{
    cb.onchange=async()=>{
      if(!displayName){cb.checked=!cb.checked;return askName()}
      cb.disabled=true;
      try{await updateDoc(doc(db,"weddingChecklist",cb.dataset.id),{
        done:cb.checked,updatedAt:serverTimestamp(),updatedBy:displayName,updatedByUid:currentUser.uid
      })}catch(err){alert("更新失敗："+err.message);cb.checked=!cb.checked}
      cb.disabled=false;
    };
  });
}

async function seedIfEmpty(){
  const snap=await getDocs(collection(db,"weddingChecklist"));
  if(!snap.empty)return;
  const batch=writeBatch(db);
  seed.forEach(([category,title,owner,due],i)=>{
    const ref=doc(collection(db,"weddingChecklist"));
    batch.set(ref,{category,title,owner,due,done:false,sort:i,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:"系統建立",updatedByUid:currentUser.uid});
  });
  await batch.commit();
}

async function start(){
  updateWho(); if(!displayName)askName();
  if(!configReady()){
    $("#setupWarn").hidden=false; $("#list").innerHTML='<div class="error">請先完成 Firebase 設定。</div>'; return;
  }
  try{
    const app=initializeApp(firebaseConfig); auth=getAuth(app); db=getFirestore(app);
    await signInAnonymously(auth);
    onAuthStateChanged(auth,async user=>{
      if(!user)return; currentUser=user;
      $("#sync").className="sync online"; $("#sync").textContent="已連線・多人即時同步";
      await seedIfEmpty();
      const q=query(collection(db,"weddingChecklist"),orderBy("createdAt","asc"));
      onSnapshot(q,snap=>{items=snap.docs.map(d=>({id:d.id,...d.data()}));render()},
        err=>{$("#list").innerHTML=`<div class="error">讀取失敗：${esc(err.message)}</div>`});
    });
  }catch(err){
    $("#sync").className="sync offline";$("#sync").textContent="連線失敗";
    $("#list").innerHTML=`<div class="error">Firebase 連線失敗：${esc(err.message)}</div>`;
  }
}
start();
