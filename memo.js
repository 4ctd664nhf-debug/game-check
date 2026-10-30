/* 每日自律：獨立備忘錄模組 v1.1
 * 不讀取、修改或刪除原本的任務/歷史紀錄 IndexedDB。
 */
(() => {
  'use strict';

  const DB_NAME = 'daily-discipline-memos';
  const DB_VERSION = 1;
  const STORE_NAME = 'notes';
  const MAX_COUNT = 999999;
  const MAX_MEMOS_IN_BACKUP = 5000;
  const ui = {
    view: document.getElementById('memoView'),
    form: document.getElementById('memoForm'),
    type: document.getElementById('memoType'),
    countFields: document.getElementById('memoCountFields'),
    textFields: document.getElementById('memoTextFields'),
    title: document.getElementById('memoTitle'),
    count: document.getElementById('memoNumber'),
    body: document.getElementById('memoText'),
    submit: document.getElementById('memoSubmit'),
    cancel: document.getElementById('memoCancel'),
    countLabel: document.getElementById('memoCount'),
    list: document.getElementById('memoList'),
    exportBtn: document.getElementById('memoExportBtn'),
    importFile: document.getElementById('memoImportFile')
  };
  if (!ui.view || !ui.form) return;

  let dbPromise = null;
  let memos = [];
  let editingId = null;
  let busy = false;
  let toastTimer = null;

  function notify(message) {
    const toast = document.getElementById('toast');
    if (!toast) { window.alert(message); return; }
    if (toastTimer) window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('此瀏覽器不支援 IndexedDB，無法儲存備忘錄。'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('無法開啟備忘錄資料庫。'));
      request.onblocked = () => reject(new Error('資料庫正在被其他分頁使用，請關閉其他分頁再試。'));
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }

  async function readMemos() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('讀取備忘錄失敗。'));
      transaction.onerror = () => reject(transaction.error || new Error('讀取備忘錄失敗。'));
    });
  }

  async function writeMemo(memo) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(memo);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('備忘錄儲存失敗。'));
      transaction.onabort = () => reject(transaction.error || new Error('備忘錄儲存失敗。'));
    });
  }

  async function deleteMemo(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('刪除備忘錄失敗。'));
      transaction.onabort = () => reject(transaction.error || new Error('刪除備忘錄失敗。'));
    });
  }

  async function replaceMemos(items) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      items.forEach(item => store.put(item));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('還原備忘錄失敗。'));
      transaction.onabort = () => reject(transaction.error || new Error('還原備忘錄失敗。'));
    });
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `memo-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
  }

  function setMemoType(type) {
    const isCount = type === 'count';
    ui.type.value = isCount ? 'count' : 'text';
    ui.countFields.hidden = !isCount;
    ui.textFields.hidden = isCount;
  }

  function resetForm() {
    editingId = null;
    ui.form.reset();
    ui.count.value = '1';
    setMemoType('count');
    ui.submit.textContent = '新增備忘錄';
    ui.cancel.classList.add('hidden');
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function displayTime(time) {
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  async function refresh() {
    memos = await readMemos();
    memos.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    renderMemos();
  }

  function renderMemos() {
    ui.countLabel.textContent = `${memos.length} 筆`;
    ui.list.replaceChildren();
    if (memos.length === 0) {
      ui.list.append(make('div', 'empty-state', '還沒有備忘錄。可以新增次數紀錄，或寫下想記住的事情。'));
      return;
    }

    memos.forEach(memo => {
      const item = make('article', 'memo-item');
      if (memo.type === 'count') {
        const row = make('div', 'memo-item-main');
        const title = make('div', 'memo-item-title', memo.title || '未命名');
        const number = make('div', 'memo-item-number');
        const input = make('input');
        input.type = 'number';
        input.min = '0';
        input.max = String(MAX_COUNT);
        input.step = '1';
        input.inputMode = 'numeric';
        input.value = String(memo.value);
        input.setAttribute('aria-label', `${memo.title || '未命名'}的次數`);
        input.addEventListener('change', async () => {
          const newValue = Number(input.value);
          if (input.value.trim() === '' || !validCount(newValue)) {
            input.value = String(memo.value);
            notify('次數請輸入 0～999999 的整數。');
            return;
          }
          if (newValue === memo.value) return;
          input.disabled = true;
          try {
            await writeMemo({ ...memo, value: newValue, updatedAt: Date.now() });
            await refresh();
            notify('次數已更新');
          } catch (error) {
            input.value = String(memo.value);
            input.disabled = false;
            notify(error.message || '更新失敗');
          }
        });
        number.append(input, make('span', '', '次'));
        row.append(title, number);
        item.append(row);
      } else {
        item.append(make('p', 'memo-item-text', memo.content || ''));
      }

      const footer = make('div', 'memo-item-footer');
      const meta = make('span', 'memo-item-time', displayTime(memo.updatedAt || memo.createdAt));
      const actions = make('div', 'memo-item-actions');
      const edit = make('button', 'memo-action', '編輯');
      edit.type = 'button';
      edit.setAttribute('aria-label', '編輯這筆備忘錄');
      edit.addEventListener('click', () => startEditing(memo.id));
      const remove = make('button', 'memo-action danger', '刪除');
      remove.type = 'button';
      remove.setAttribute('aria-label', '刪除這筆備忘錄');
      remove.addEventListener('click', () => removeItem(memo.id));
      actions.append(edit, remove);
      footer.append(meta, actions);
      item.append(footer);
      ui.list.append(item);
    });
  }

  function startEditing(id) {
    const memo = memos.find(item => item.id === id);
    if (!memo) return;
    editingId = memo.id;
    setMemoType(memo.type);
    ui.title.value = memo.title || '';
    ui.count.value = String(memo.value ?? 1);
    ui.body.value = memo.content || '';
    ui.submit.textContent = '儲存修改';
    ui.cancel.classList.remove('hidden');
    ui.form.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (memo.type === 'count') ui.title.focus({ preventScroll: true });
    else ui.body.focus({ preventScroll: true });
  }

  async function removeItem(id) {
    if (!window.confirm('確定要刪除這筆備忘錄嗎？')) return;
    try {
      await deleteMemo(id);
      if (editingId === id) resetForm();
      await refresh();
      notify('已刪除備忘錄');
    } catch (error) {
      notify(error.message || '刪除失敗');
    }
  }

  function getFormData() {
    if (ui.type.value === 'count') {
      const title = ui.title.value.trim();
      if (!title) { ui.title.focus(); throw new Error('請輸入紀錄項目名稱。'); }
      if (title.length > 60) throw new Error('項目名稱最多 60 個字。');
      const value = Number(ui.count.value);
      if (ui.count.value.trim() === '' || !validCount(value)) {
        ui.count.focus();
        throw new Error('次數請輸入 0～999999 的整數。');
      }
      return { type: 'count', title, value };
    }
    const content = ui.body.value.trim();
    if (!content) { ui.body.focus(); throw new Error('請輸入備忘文字。'); }
    if (content.length > 1000) throw new Error('文字內容最多 1000 個字。');
    return { type: 'text', content };
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    let data;
    try { data = getFormData(); }
    catch (error) { notify(error.message); return; }

    busy = true;
    ui.submit.disabled = true;
    const existing = memos.find(item => item.id === editingId);
    const now = Date.now();
    const note = {
      ...data,
      id: existing ? existing.id : newId(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    try {
      await writeMemo(note);
      resetForm();
      await refresh();
      notify(existing ? '備忘錄已修改' : '備忘錄已新增');
    } catch (error) {
      notify(error.message || '儲存失敗');
    } finally {
      busy = false;
      ui.submit.disabled = false;
    }
  }

  async function exportMemos() {
    try {
      const items = await readMemos();
      const payload = {
        format: 'daily-discipline-memo-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        notes: items
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `每日自律-備忘錄-${new Date().toLocaleDateString('sv-SE')}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      notify('備忘錄備份已匯出');
    } catch (error) {
      notify(error.message || '匯出失敗');
    }
  }

  function normalizeBackup(data) {
    if (!data || data.format !== 'daily-discipline-memo-backup' || !Array.isArray(data.notes)) {
      throw new Error('這不是有效的備忘錄備份檔。');
    }
    if (data.notes.length > MAX_MEMOS_IN_BACKUP) throw new Error('單次最多匯入 5000 筆備忘錄。');
    const knownIds = new Set();
    return data.notes.map(raw => {
      if (!raw || (raw.type !== 'count' && raw.type !== 'text')) {
        throw new Error('備份檔包含無效的備忘錄類型。');
      }
      const record = {};
      const id = typeof raw.id === 'string' && raw.id.length <= 120 && raw.id.length > 0
        ? raw.id : newId();
      record.id = knownIds.has(id) ? newId() : id;
      knownIds.add(record.id);
      record.type = raw.type;
      if (raw.type === 'count') {
        if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 60 || !validCount(raw.value)) {
          throw new Error('備份中的名稱或次數不正確。');
        }
        record.title = raw.title.trim();
        record.value = raw.value;
      } else {
        if (typeof raw.content !== 'string' || !raw.content.trim() || raw.content.length > 1000) {
          throw new Error('備份中的文字內容不正確。');
        }
        record.content = raw.content.trim();
      }
      const now = Date.now();
      record.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : now;
      record.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : now;
      return record;
    });
  }

  async function importMemos(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('備份檔過大（上限 4 MB）。');
      const parsed = JSON.parse(await file.text());
      const items = normalizeBackup(parsed);
      if (!window.confirm(`確定要以備份中的 ${items.length} 筆備忘錄取代目前所有備忘錄嗎？\n原本的任務與歷史紀錄不受影響。`)) return;
      await replaceMemos(items);
      resetForm();
      await refresh();
      notify(`已還原 ${items.length} 筆備忘錄`);
    } catch (error) {
      notify(error instanceof SyntaxError ? 'JSON 檔案格式錯誤。' : (error.message || '匯入失敗'));
    } finally {
      ui.importFile.value = '';
    }
  }

  // 補充原有頁籤切換。原本 app.js 仍可照常控制任務與歷史紀錄。
  document.querySelectorAll('.tab[data-view]').forEach(tab => {
    tab.addEventListener('click', () => {
      const next = document.getElementById(`${tab.dataset.view}View`);
      if (!next) return;
      document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
      next.classList.remove('hidden');
      document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item === tab));
    });
  });

  ui.type.addEventListener('change', () => setMemoType(ui.type.value));
  ui.form.addEventListener('submit', onSubmit);
  ui.cancel.addEventListener('click', resetForm);
  ui.exportBtn.addEventListener('click', exportMemos);
  ui.importFile.addEventListener('change', importMemos);

  refresh().catch(error => {
    ui.list.replaceChildren(make('div', 'empty-state', '無法開啟備忘錄儲存空間：' + (error.message || '未知錯誤')));
  });
})();
