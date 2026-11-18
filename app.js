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
    state = { version:2, date:today, tasks:defaultTasks, history:[], reminders:[] };
    await writeState();
  } else if (!Array.isArray(state.reminders)) {
    // Upgrade existing V1 IndexedDB without deleting task or history data.
    state.reminders = [];
    state.version = 2;
    await writeState();
    if (state.date !== today) await ensureToday();
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
  renderReminders();
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
  ["today","reminders","history","settings"].forEach(name=>$(`${name}View`).classList.toggle("hidden",name!==view));
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
    const reminders = Array.isArray(imported.reminders) ? imported.reminders : [];
    if (reminders.length > 30) throw new Error("提醒最多 30 筆");
    const validatedReminders = reminders.map(r => {
      if (typeof r.text !== "string" || !r.text.trim() ||
          !["once", "daily"].includes(r.repeat) ||
          typeof r.at !== "string" || !Number.isFinite(new Date(r.at).getTime())) throw new Error("提醒資料格式不正確");
      return { id: crypto.randomUUID(), text: r.text.trim().slice(0,80), at: r.at, repeat: r.repeat };
    });
    state={version:2,date:localDateKey(),tasks:imported.tasks.map(t=>({id:t.id||crypto.randomUUID(),name:String(t.name||"").slice(0,60),done:!!t.done})),history:imported.history,reminders:validatedReminders};
    await ensureToday(); await saveAndRender();
    if (pushConfig.enabled) await queuePushSync();
    showToast("備份還原成功");
  } catch (error) { alert(`無法匯入：${error.message}`); }
  finally { event.target.value=""; }
});
(async function init(){
  try {
    db=await openDB(); state=await readState(); await ensureToday(); render();
    checkForegroundReminders().catch(console.error);
    if (pushConfig.enabled) queuePushSync();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
    }
  } catch(error) {
    console.error(error);
    document.body.innerHTML='<main style="padding:30px;font-family:sans-serif">無法啟動資料庫。請使用 Safari 或 Chrome 的一般瀏覽模式開啟，並確認瀏覽器允許網站儲存資料。</main>';
  }
})();

// --- Reminder UI, foreground reminders and optional Web Push integration ---
const PUSH_STORAGE_KEY = "daily-discipline-push-v2";
const DEVICE_STORAGE_KEY = "daily-discipline-device-v2";
const MAX_REMINDERS = 30;
let editingReminderId = null;
let pushSyncChain = Promise.resolve();
let pushSyncError = "";
let pushConfig = loadPushConfig();

function loadPushConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUSH_STORAGE_KEY) || "{}");
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      token: typeof parsed.token === "string" ? parsed.token : "",
      enabled: parsed.enabled === true
    };
  } catch (_) { return { url: "", token: "", enabled: false }; }
}
function storePushConfig() {
  localStorage.setItem(PUSH_STORAGE_KEY, JSON.stringify(pushConfig));
}
function deviceId() {
  let id = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_STORAGE_KEY, id); }
  return id;
}
function toLocalInput(date) {
  const two = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth()+1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`;
}
function defaultReminderDate() {
  const date = new Date(Date.now() + 10 * 60000);
  date.setSeconds(0, 0);
  return toLocalInput(date);
}
function resetReminderEditor() {
  editingReminderId = null;
  $("reminderForm").reset();
  $("reminderDateTime").value = defaultReminderDate();
  $("reminderEditorTitle").textContent = "新增提醒";
  $("saveReminderBtn").textContent = "新增提醒";
  $("cancelReminderEditBtn").classList.add("hidden");
}
function nextOccurrence(reminder, now = Date.now()) {
  const start = new Date(reminder.at);
  if (!Number.isFinite(start.getTime())) return Infinity;
  if (reminder.repeat !== "daily") return start.getTime();
  if (start.getTime() > now) return start.getTime();
  const next = new Date(now);
  next.setHours(start.getHours(), start.getMinutes(), 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}
function reminderDateLabel(reminder) {
  const date = new Date(nextOccurrence(reminder));
  if (!Number.isFinite(date.getTime())) return "日期錯誤";
  const options = { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false };
  return new Intl.DateTimeFormat("zh-TW", options).format(date);
}
function renderReminders() {
  const list = Array.isArray(state.reminders) ? state.reminders : [];
  $("reminderCount").textContent = `${list.length} / ${MAX_REMINDERS}`;
  $("saveReminderBtn").disabled = list.length >= MAX_REMINDERS && !editingReminderId;
  const ordered = [...list].sort((a, b) => nextOccurrence(a) - nextOccurrence(b));
  $("reminderList").innerHTML = ordered.length ? ordered.map(item => {
    const expired = item.repeat === "once" && new Date(item.at).getTime() < Date.now();
    return `<article class="reminder-card">
      <div class="reminder-copy">
        <div class="reminder-name">${escapeHTML(item.text)}</div>
        <div class="reminder-meta">
          <span class="reminder-frequency">${item.repeat === "daily" ? "每日" : "單次"}</span>
          <span class="${expired ? "reminder-expired" : ""}">${expired ? "已過提醒時間" : reminderDateLabel(item)}</span>
        </div>
      </div>
      <div class="reminder-actions">
        <button class="icon-btn" type="button" aria-label="修改提醒" data-reminder-edit="${item.id}">✎</button>
        <button class="icon-btn" type="button" aria-label="刪除提醒" data-reminder-delete="${item.id}">×</button>
      </div>
    </article>`;
  }).join("") : '<div class="empty-state">尚未設定提醒。<br>輸入事項和時間，就能建立第一則提醒。</div>';
  renderPushStatus();
}
function renderPushStatus() {
  const badge = $("pushBadge"), status = $("pushStatus");
  if (!badge || !status) return;
  badge.classList.toggle("connected", pushConfig.enabled && !pushSyncError);
  badge.textContent = pushConfig.enabled ? (pushSyncError ? "同步異常" : "已啟用") : "未啟用";
  if (pushConfig.enabled) {
    status.textContent = pushSyncError ? `推播已啟用，但提醒清單尚未同步：${pushSyncError}。請確認網路或重新開啟 App。` :
      "手機推播已啟用。提醒時間將同步至 Cloudflare 排程服務；關閉 App 後仍可收到推播（需連線且允許通知）。";
  } else if (pushConfig.url && pushConfig.token) {
    status.textContent = "推播服務資訊已儲存。請按「啟用手機推播」，授權通知並完成訂閱。啟用前僅能在 App 開啟期間提醒。";
  } else {
    status.textContent = "尚未設定推播後端。你仍可建立提醒，但只能在 App 開啟時提醒。要讓鎖定的 iPhone 收到通知，請先按照部署說明建立 Cloudflare Worker。";
  }
  $("disablePushBtn").disabled = !pushConfig.enabled;
}
function normalizeAPIUrl(text) {
  const url = new URL(text.trim());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("推播服務網址必須使用 HTTPS");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("請只輸入 Worker 的主網址，不要附加 /api、帳密或其他路徑");
  }
  return url.href.replace(/\/+$/, "");
}
async function apiRequest(path, options = {}) {
  if (!pushConfig.url || !pushConfig.token) throw new Error("請先儲存推播服務網址與連線金鑰");
  const response = await fetch(`${pushConfig.url}/api/${path}`, {
    method: options.method || "GET",
    headers: { "X-API-Key": pushConfig.token, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });
  let data = {};
  try { data = await response.json(); } catch (_) { /* preserve HTTP status */ }
  if (!response.ok) throw new Error(data.error || `連線失敗（HTTP ${response.status}）`);
  return data;
}
function bytesFromBase64URL(string) {
  const padding = "=".repeat((4 - string.length % 4) % 4);
  const decoded = atob(string.replace(/-/g, "+").replace(/_/g, "/") + padding);
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
function sameBufferKey(buffer, other) {
  const a = new Uint8Array(buffer), b = new Uint8Array(other);
  return a.length === b.length && a.every((num, i) => num === b[i]);
}
function makeServerReminders() {
  const now = Date.now();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return state.reminders.map(reminder => {
    const start = new Date(reminder.at);
    const dueAt = nextOccurrence(reminder, now);
    return {
      id: reminder.id,
      text: reminder.text,
      dueAt,
      repeat: reminder.repeat,
      timeZone,
      localTime: `${String(start.getHours()).padStart(2,"0")}:${String(start.getMinutes()).padStart(2,"0")}`
    };
  }).filter(item => Number.isFinite(item.dueAt) &&
    (item.repeat === "once" ? item.dueAt > now - 120000 : item.dueAt > now));
}
async function syncPushReminders() {
  if (!pushConfig.enabled || !state) return false;
  try {
    await apiRequest("sync", { method: "POST", body: { deviceId: deviceId(), reminders: makeServerReminders() } });
    pushSyncError = "";
    renderPushStatus();
    return true;
  } catch (error) {
    pushSyncError = error.message || "未知錯誤";
    renderPushStatus();
    return false;
  }
}
function queuePushSync() {
  pushSyncChain = pushSyncChain.catch(() => {}).then(syncPushReminders);
  return pushSyncChain;
}
async function saveReminderAndSync() {
  await saveAndRender();
  if (pushConfig.enabled && !(await queuePushSync())) showToast("提醒已儲存，但尚未同步到手機推播服務");
  else showToast("提醒已儲存");
}
function isIOSNotHomeScreen() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIOS && !(window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true);
}
async function getServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("此瀏覽器不支援 Service Worker");
  await navigator.serviceWorker.register("./service-worker.js");
  return navigator.serviceWorker.ready;
}
async function showLocalNotification(title, body, tag) {
  const reg = await getServiceWorker();
  await reg.showNotification(title, {
    body, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag, renotify: false
  });
}
function notificationTimeNow(reminder, now) {
  const start = new Date(reminder.at);
  if (!Number.isFinite(start.getTime())) return null;
  if (reminder.repeat !== "daily") return start.getTime();
  const today = new Date(now);
  today.setHours(start.getHours(), start.getMinutes(), 0, 0);
  return today.getTime() >= start.getTime() ? today.getTime() : null;
}
async function checkForegroundReminders() {
  if (!state || pushConfig.enabled || document.visibilityState !== "visible") return;
  const now = Date.now();
  for (const reminder of state.reminders) {
    const due = notificationTimeNow(reminder, now);
    if (due === null || due > now || now - due > 60000) continue;
    const key = `daily-discipline-alert-${reminder.id}`;
    if (localStorage.getItem(key) === String(due)) continue;
    localStorage.setItem(key, String(due));
    if ("Notification" in window && Notification.permission === "granted") {
      try { await showLocalNotification("每日自律 · 提醒", reminder.text, `local-${reminder.id}-${due}`); }
      catch (_) { showToast(`提醒：${reminder.text}`); }
    } else {
      showToast(`提醒：${reminder.text}`);
    }
  }
}

$("reminderForm").addEventListener("submit", async event => {
  event.preventDefault();
  const text = $("reminderText").value.trim();
  const at = $("reminderDateTime").value;
  const repeat = $("reminderRepeat").value;
  const due = new Date(at).getTime();
  if (!text) return showToast("請輸入提醒內容");
  if (!Number.isFinite(due) || due <= Date.now() + 15000) return showToast("請選擇未來的提醒日期與時間");
  if (!["once", "daily"].includes(repeat)) return showToast("提醒頻率不正確");
  if (editingReminderId) {
    const old = state.reminders.find(item => item.id === editingReminderId);
    if (!old) return showToast("找不到要修改的提醒");
    Object.assign(old, { text: text.slice(0, 80), at, repeat });
  } else {
    if (state.reminders.length >= MAX_REMINDERS) return showToast("最多可設定 30 則提醒");
    state.reminders.push({ id: crypto.randomUUID(), text: text.slice(0, 80), at, repeat });
  }
  resetReminderEditor();
  await saveReminderAndSync();
});
$("cancelReminderEditBtn").addEventListener("click", resetReminderEditor);
$("reminderList").addEventListener("click", async event => {
  const editId = event.target.dataset.reminderEdit;
  const deleteId = event.target.dataset.reminderDelete;
  if (editId) {
    const reminder = state.reminders.find(item => item.id === editId);
    if (!reminder) return;
    editingReminderId = editId;
    $("reminderText").value = reminder.text;
    $("reminderDateTime").value = reminder.at;
    $("reminderRepeat").value = reminder.repeat;
    $("reminderEditorTitle").textContent = "修改提醒";
    $("saveReminderBtn").textContent = "儲存修改";
    $("cancelReminderEditBtn").classList.remove("hidden");
    $("saveReminderBtn").disabled = false;
    $("reminderText").focus();
  }
  if (deleteId) {
    const reminder = state.reminders.find(item => item.id === deleteId);
    if (!reminder || !confirm(`確定刪除提醒「${reminder.text}」？`)) return;
    state.reminders = state.reminders.filter(item => item.id !== deleteId);
    if (editingReminderId === deleteId) resetReminderEditor();
    await saveReminderAndSync();
  }
});

$("pushConfigForm").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const url = normalizeAPIUrl($("pushApiUrl").value);
    const token = $("pushApiKey").value.trim();
    if (token.length < 16) throw new Error("連線金鑰至少需要 16 個字元");
    if (pushConfig.enabled && (url !== pushConfig.url || token !== pushConfig.token)) {
      throw new Error("請先停用舊推播，再修改網址或金鑰");
    }
    pushConfig = { ...pushConfig, url, token };
    storePushConfig();
    renderPushStatus();
    showToast("推播連線設定已儲存");
  } catch (error) { showToast(error.message); }
});
$("enablePushBtn").addEventListener("click", async () => {
  const button = $("enablePushBtn");
  if (pushConfig.enabled) return showToast("手機推播已啟用");
  if (!pushConfig.url || !pushConfig.token) return showToast("請先填寫並儲存推播連線設定");
  if (isIOSNotHomeScreen()) return alert("iPhone 請先用 Safari 將本網站「加入主畫面」，再從主畫面圖示開啟 App，才能啟用推播。");
  if (!("PushManager" in window) || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return alert("目前瀏覽器或使用方式不支援 Web Push。iPhone 需 iOS 16.4 以上的主畫面 PWA。");
  }
  // Must start requesting permission directly from the user's button tap on iOS.
  let permissionPromise;
  try { permissionPromise = Notification.permission === "granted" ? Promise.resolve("granted") : Notification.requestPermission(); }
  catch (error) { return alert(`無法要求通知權限：${error.message}`); }
  button.disabled = true;
  try {
    const permission = await permissionPromise;
    if (permission !== "granted") throw new Error("通知權限未開啟，請在手機設定中允許「每日自律」通知");
    const { publicKey } = await apiRequest("config");
    if (!publicKey) throw new Error("伺服器尚未設定 VAPID 公開金鑰");
    const reg = await getServiceWorker();
    const applicationServerKey = bytesFromBase64URL(publicKey);
    let subscription = await reg.pushManager.getSubscription();
    if (subscription && subscription.options && subscription.options.applicationServerKey &&
        !sameBufferKey(subscription.options.applicationServerKey, applicationServerKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    await apiRequest("subscribe", { method: "POST", body: { deviceId: deviceId(), subscription: subscription.toJSON() } });
    pushConfig.enabled = true;
    storePushConfig();
    pushSyncError = "";
    const synced = await queuePushSync();
    showToast(synced ? "手機推播已啟用" : "已訂閱推播，但提醒同步失敗，請稍後重試");
  } catch (error) {
    alert(`啟用失敗：${error.message}\n\n請確認 Worker 已部署，且 iPhone 通知權限已開啟。`);
  } finally { button.disabled = false; renderPushStatus(); }
});
$("testPushBtn").addEventListener("click", async () => {
  const button = $("testPushBtn");
  button.disabled = true;
  try {
    if (pushConfig.enabled) {
      await apiRequest("test", { method: "POST", body: { deviceId: deviceId() } });
      showToast("伺服器已接受測試推播，請確認手機通知");
    } else {
      if (isIOSNotHomeScreen()) throw new Error("iPhone 請先從主畫面圖示開啟 App");
      if (!("Notification" in window)) throw new Error("此瀏覽器不支援通知");
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("請先允許通知權限");
      await showLocalNotification("每日自律 · 測試通知", "這是本機通知測試；App 關閉時的提醒仍需啟用雲端推播。", "daily-discipline-local-test");
      showToast("已送出本機測試通知");
    }
  } catch (error) { alert(`測試失敗：${error.message}`); }
  finally { button.disabled = false; }
});
$("disablePushBtn").addEventListener("click", async () => {
  if (!pushConfig.enabled) return;
  if (!confirm("確定停用這台裝置的手機推播？已設定的提醒仍會留在 App 裡。")) return;
  const button = $("disablePushBtn");
  button.disabled = true;
  try {
    await apiRequest("unsubscribe", { method: "POST", body: { deviceId: deviceId() } });
    const reg = await getServiceWorker();
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    pushConfig.enabled = false;
    pushSyncError = "";
    storePushConfig();
    showToast("已停用手機推播，仍可使用前景提醒");
  } catch (error) {
    alert(`停用失敗：${error.message}。為避免手機持續收到舊提醒，請確認可以連上推播服務後再停用。`);
  } finally { button.disabled = false; renderPushStatus(); }
});

$("pushApiUrl").value = pushConfig.url;
$("pushApiKey").value = pushConfig.token;
resetReminderEditor();
setInterval(() => {
  checkForegroundReminders().catch(console.error);
  if (state && state.date !== localDateKey()) ensureToday().then(render).catch(console.error);
}, 15000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state) return;
  ensureToday().then(() => {
    render();
    checkForegroundReminders();
    if (pushConfig.enabled && pushSyncError) queuePushSync();
  }).catch(console.error);
});
window.addEventListener("online", () => { if (pushConfig.enabled) queuePushSync(); });
