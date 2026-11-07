/* 教师端加密存储：口令 → PBKDF2 → AES-GCM 加密 localStorage；解锁后仅在内存中使用 */
const STORE_KEY = 'spstudio.teacher.v1';
const SESSION_KEY = 'spstudio.teacher.session';
const ITER = 150000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unb64(str) {
  const raw = atob(str);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function deriveKey(passcode, salt) {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function defaultData() {
  return {
    version: 1,
    profile: { name: '', school: '' },
    settings: {
      apiBase: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      autoLockMinutes: 30
    },
    classes: [],
    tasks: [],
    evaluations: [],
    courseOverrides: {},
    customCourses: [],
    lastTaskId: null,
    updatedAt: Date.now()
  };
}

const core = {
  data: null,
  key: null,
  salt: null,
  locked: true,
  lastActivity: Date.now(),

  hasStore() {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    try { return !!JSON.parse(raw).ct; } catch (e) { return false; }
  },

  async create(passcode) {
    if (passcode.length < 6) throw new Error('口令至少 6 位');
    const salt = randomBytes(16);
    const key = await deriveKey(passcode, salt);
    this.key = key;
    this.salt = salt;
    this.data = defaultData();
    this.locked = false;
    await this.save();
    this.unlockSession();
  },

  async unlock(passcode) {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) throw new Error('尚未初始化教师数据');
    const payload = JSON.parse(raw);
    const salt = unb64(payload.salt);
    const key = await deriveKey(passcode, salt);
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(payload.iv) },
        key,
        unb64(payload.ct)
      );
      this.data = JSON.parse(dec.decode(plain));
      this.key = key;
      this.salt = salt;
      this.locked = false;
      this.touch();
      this.unlockSession();
      return true;
    } catch (e) {
      throw new Error('口令不正确');
    }
  },

  async save() {
    if (this.locked || !this.key) throw new Error('教师端未解锁');
    this.data.updatedAt = Date.now();
    const iv = randomBytes(12);
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.key,
      enc.encode(JSON.stringify(this.data))
    );
    localStorage.setItem(STORE_KEY, JSON.stringify({
      v: 1,
      iterations: ITER,
      salt: b64(this.salt),
      iv: b64(iv),
      ct: b64(cipher)
    }));
  },

  async changePasscode(oldPass, newPass) {
    await this.unlock(oldPass);
    if (newPass.length < 6) throw new Error('新口令至少 6 位');
    const salt = randomBytes(16);
    const key = await deriveKey(newPass, salt);
    this.salt = salt;
    this.key = key;
    this.locked = false;
    await this.save();
  },

  lock() {
    this.data = null;
    this.key = null;
    this.locked = true;
    sessionStorage.removeItem(SESSION_KEY);
  },

  unlockSession() {
    this.locked = false;
    this.touch();
    sessionStorage.setItem(SESSION_KEY, String(Date.now()));
  },

  touch() {
    this.lastActivity = Date.now();
    sessionStorage.setItem(SESSION_KEY, String(Date.now()));
  },

  sessionValid() {
    const t = Number(sessionStorage.getItem(SESSION_KEY) || 0);
    if (!t) return false;
    const mins = (this.data && this.data.settings && this.data.settings.autoLockMinutes) || 30;
    return Date.now() - t < mins * 60000;
  },

  async restoreSession() {
    if (!this.hasStore()) return false;
    return false; // 加密数据必须每次输入口令解密，会话仅用于体验提示
  },

  exportBackup() {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) throw new Error('没有可导出的数据');
    return JSON.stringify({
      app: 'sp-studio-teacher',
      version: 1,
      exportedAt: new Date().toISOString(),
      teacher: (this.data && this.data.profile && this.data.profile.name) || '',
      payload: JSON.parse(raw)
    }, null, 1);
  },

  normalize(incoming) {
    const d = incoming || {};
    return {
      version: 1,
      profile: Object.assign({ name: '', school: '' }, d.profile || {}),
      settings: Object.assign({ apiBase: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat', autoLockMinutes: 30 }, d.settings || {}),
      classes: Array.isArray(d.classes) ? d.classes : [],
      tasks: Array.isArray(d.tasks) ? d.tasks : [],
      evaluations: Array.isArray(d.evaluations) ? d.evaluations : [],
      courseOverrides: d.courseOverrides || {},
      customCourses: Array.isArray(d.customCourses) ? d.customCourses : [],
      lastTaskId: d.lastTaskId || null,
      updatedAt: Date.now()
    };
  },

  mergeIncoming(incoming) {
    const d = this.data;
    (incoming.classes || []).forEach(c => {
      if (!d.classes.find(x => x.id === c.id || x.name === c.name)) d.classes.push(c);
    });
    (incoming.tasks || []).forEach(t => {
      if (!d.tasks.find(x => x.id === t.id || x.title === t.title)) d.tasks.push(t);
    });
    (incoming.evaluations || []).forEach(e => {
      const i = d.evaluations.findIndex(x => x.taskId === e.taskId && x.folderName === e.folderName);
      if (i < 0) d.evaluations.push(e);
      else if ((e.updatedAt || 0) > (d.evaluations[i].updatedAt || 0)) d.evaluations[i] = e;
    });
    if (!d.profile.name && incoming.profile && incoming.profile.name) d.profile.name = incoming.profile.name;
  },

  /* 导入备份：未解锁时直接以备份口令建立本地数据；已解锁时可 replace | merge，并始终用当前口令重新加密 */
  async importBackup(jsonText, passcode, mode) {
    const obj = JSON.parse(jsonText);
    const payload = obj.payload || obj;
    if (!payload || !payload.ct) throw new Error('备份文件格式不正确');
    const salt = unb64(payload.salt);
    const backupKey = await deriveKey(passcode, salt);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(payload.iv) },
      backupKey,
      unb64(payload.ct)
    );
    const incoming = this.normalize(JSON.parse(dec.decode(plain)));
    if (this.locked || !this.key) {
      this.key = backupKey;
      this.salt = salt;
      this.data = incoming;
      this.locked = false;
    } else if (mode === 'merge') {
      this.mergeIncoming(incoming);
    } else {
      this.data = incoming;
    }
    await this.save();
    this.unlockSession();
    return true;
  },

  uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
};

export default core;
