const DB_NAME = "daily-discipline-db";
const DB_VERSION = 1;
const STORE = "state";
const STATE_KEY = "main";
const defaultTasks = [
  { id: crypto.randomUUID(), name: "早起，不賴床", done: false },
  { id: crypto.randomUUID(), name: "運動或健身", done: false },
  { id: crypto.randomUUID(), name: "閱讀 20 分鐘", done: false },
  { id: crypto.randomUUID(), name: "完成今日工作目標", done: false },
  { id: crypto.randomUUID(), name: "睡前整理與反省", done: false }
];
let state;
let db;
const $ = (id) => document.getElementById(id);
const localDateKey = (date = new Date()) => {
  const y = date.getFullYear(), m = String(date.getMonth()+1).padStart(2,"0"), d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
};
const prettyDate = (key) => {
  const [y,m,d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"long",day:"numeric",weekday:"short"}).format(new Date(y,m-1,d));
};
function openDB() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function readState() {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readonly");
    const req = tx.objectStore(STORE).get(STATE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
function writeState() {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(state,STATE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function ensureToday() {
  const today = localDateKey();
  if (!state) {
    state = { version:1, date:today, tasks:defaultTasks, history:[] };
    await writeState();
  } else if (state.date !== today) {
    // 跨日自動封存前一天，不覆蓋既有紀錄。
    const previous = snapshot(state.date, state.tasks);
    if (!state.history.some(item => item.date === state.date)) state.history.push(previous);
    state.date = today;
    state.tasks = state.tasks.map(task => ({...task, done:false}));
    await writeState();
  }
}
function snapshot(date,tasks) {
  const total = tasks.length, completed = tasks.filter(t=>t.done).length;
  return { date, total, completed, percent: total ? Math.round(completed/total*100) : 0,
    items: tasks.map(t=>({name:t.name,done:!!t.done})) };
}
function showToast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(()=>el.classList.remove("show"),2200);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
async function saveAndRender() { await writeState(); render(); }
function render() {
  $("todayLabel").textContent = prettyDate(state.date);
  const total = state.tasks.length, completed = state.tasks.filter(t=>t.done).length;
  const percent = total ? Math.round(completed/total*100) : 0;
  $("progressPercent").textContent = `${percent}%`;
  $("progressBar").style.width = `${percent}%`;
  $("progressCaption").textContent = `已完成 ${completed} / ${total} 項任務`;
  $("taskCount").textContent = `${total} / 20`;
  $("addBtn").disabled = total >= 20;
  const list = $("taskList");
  if (!total) list.innerHTML = `<div class="empty-state">目前還沒有任務。<br>新增第一個自律目標，開始你的每日計畫吧！</div>`;
  else list.innerHTML = state.tasks.map(task => `
    <div class="task-card">
      <input class="task-check" type="checkbox" aria-label="完成 ${escapeHTML(task.name)}" data-check="${task.id}" ${task.done?"checked":""}>
      <span class="task-name ${task.done?"done":""}">${escapeHTML(task.name)}</span>
      <button class="icon-btn" type="button" aria-label="修改任務" data-edit="${task.id}">✎</button>
      <button class="icon-btn" type="button" aria-label="刪除任務" data-delete="${task.id}">×</button>
    </div>`).join("");
  $("historyCount").textContent = `${state.history.length} 天`;
  const history = [...state.history].sort((a,b)=>b.date.localeCompare(a.date));
  $("historyList").innerHTML = history.length ? history.map(item => `
    <article class="history-card">
      <div class="history-top"><span class="history-date">${prettyDate(item.date)}</span><span class="percent-tag">${item.percent}%</span></div>
      <p class="history-meta">完成 ${item.completed} / ${item.total} 項任務</p>
      <div class="mini-track"><div class="mini-fill" style="width:${item.percent}%"></div></div>
      <div class="history-items">${(item.items||[]).map(task=>`<div class="history-item"><span class="mark">${task.done?"✓":"○"}</span><span>${escapeHTML(task.name)}</span></div>`).join("")}</div>
    </article>`).join("") : `<div class="empty-state">還沒有歷史紀錄。<br>每日完成後封存，或隔天開啟時會自動保存前一天紀錄。</div>`;
}
function switchView(view) {
  document.querySelectorAll(".tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===view));
  ["today","history","settings"].forEach(name=>$(`${name}View`).classList.toggle("hidden",name!==view));
}
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>switchView(btn.dataset.view)));
$("addForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const input = $("newTask"), name = input.value.trim();
  if (!name) return;
  if (state.tasks.length >= 20) return showToast("最多只能設定 20 項任務");
  state.tasks.push({id:crypto.randomUUID(),name,done:false}); input.value="";
  await saveAndRender(); showToast("已新增任務");
});
$("taskList").addEventListener("change",async event=>{
  const id = event.target.dataset.check; if (!id) return;
  const task = state.tasks.find(t=>t.id===id); if (task) task.done=event.target.checked;
  await saveAndRender();
});
$("taskList").addEventListener("click",async event=>{
  const editId = event.target.dataset.edit, deleteId = event.target.dataset.delete;
  if (editId) {
    const task = state.tasks.find(t=>t.id===editId); if (!task) return;
    const next = prompt("修改任務名稱：",task.name);
    if (next === null) return;
    if (!next.trim()) return showToast("任務名稱不可空白");
    task.name=next.trim().slice(0,60); await saveAndRender(); showToast("已更新任務");
  }
  if (deleteId) {
    const task = state.tasks.find(t=>t.id===deleteId); if (!task) return;
    if (!confirm(`確定刪除「${task.name}」？`)) return;
    state.tasks=state.tasks.filter(t=>t.id!==deleteId); await saveAndRender(); showToast("已刪除任務");
  }
});
$("resetBtn").addEventListener("click",async()=>{
  if (!confirm("確定取消今天所有任務的勾選？歷史紀錄不會受到影響。")) return;
  state.tasks=state.tasks.map(t=>({...t,done:false})); await saveAndRender(); showToast("今日進度已重置");
});
$("archiveBtn").addEventListener("click",async()=>{
  if (state.history.some(item=>item.date===state.date)) return showToast("今天的紀錄已經封存");
  state.history.push(snapshot(state.date,state.tasks));
  const previousDate=state.date;
  state.date=localDateKey();
  if (state.date===previousDate) state.tasks=state.tasks.map(t=>({...t,done:false}));
  else state.tasks=state.tasks.map(t=>({...t,done:false}));
  await saveAndRender(); showToast("今日紀錄已封存，新的打卡進度已開始");
});
$("exportBtn").addEventListener("click",()=>{
  const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=`每日自律備份_${localDateKey()}.json`; a.click(); URL.revokeObjectURL(url);
  showToast("備份檔已匯出");
});
$("importFile").addEventListener("change",async event=>{
  const file=event.target.files[0]; if (!file) return;
  try {
    const imported=JSON.parse(await file.text());
    if (!imported || !Array.isArray(imported.tasks) || !Array.isArray(imported.history) || imported.tasks.length>20) throw new Error("格式不正確");
    if (!confirm("匯入備份會取代目前的任務與紀錄，確定繼續嗎？")) return;
    state={version:1,date:localDateKey(),tasks:imported.tasks.map(t=>({id:t.id||crypto.randomUUID(),name:String(t.name||"").slice(0,60),done:!!t.done})),history:imported.history};
    await ensureToday(); await saveAndRender(); showToast("備份還原成功");
  } catch (error) { alert(`無法匯入：${error.message}`); }
  finally { event.target.value=""; }
});
(async function init(){
  try {
    db=await openDB(); state=await readState(); await ensureToday(); render();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
    }
  } catch(error) {
    console.error(error);
    document.body.innerHTML='<main style="padding:30px;font-family:sans-serif">無法啟動資料庫。請使用 Safari 或 Chrome 的一般瀏覽模式開啟，並確認瀏覽器允許網站儲存資料。</main>';
  }
})();
