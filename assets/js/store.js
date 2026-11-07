/* 本地状态：按课程记录进度/笔记，答题、AI 提问、活动记录（localStorage） */

const KEY = 'spstudio.v2';

const defaults = () => ({
  name: '',
  progress: {},           // { courseId: { lessonKey: timestamp } }
  notes: {},              // { courseId: { lessonKey: text } }
  last: {},               // { courseId: lessonKey }
  quiz: {},               // { moduleId: { best, total, attempts, lastAt } }
  ai: { asked: 0, history: [] },
  kb: { views: {} },
  activity: [],
  settings: { apiBase: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat', videoSource: 'auto' },
  createdAt: Date.now()
});

let state = null;

function migrate(s) {
  // v1 → v2：旧 completed / notes / lastLesson 归入 sp 课程
  if (s.completed && Object.keys(s.completed).length) {
    s.progress = s.progress || {};
    s.progress.sp = Object.assign({}, s.completed, s.progress.sp || {});
    delete s.completed;
  }
  if (s.notes && s.notes.sp === undefined) {
    // v1 notes 直接以课号为键
    const flat = Object.keys(s.notes).every(k => /^\d+$/.test(k));
    if (flat) { s.notes = { sp: s.notes }; }
  }
  if (s.lastLesson != null) {
    s.last = s.last || {};
    s.last.sp = s.last.sp || s.lastLesson;
    delete s.lastLesson;
  }
  s.progress = s.progress || {};
  s.notes = s.notes || {};
  s.last = s.last || {};
  return s;
}

function load() {
  if (state) return state;
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) raw = localStorage.getItem('spstudio.v1');
    state = raw ? migrate(Object.assign(defaults(), JSON.parse(raw))) : defaults();
    state.progress = state.progress || {};
    state.notes = state.notes || {};
    state.last = state.last || {};
    state.quiz = state.quiz || {};
    state.activity = Array.isArray(state.activity) ? state.activity : [];
    state.settings = Object.assign({ apiBase: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat', videoSource: 'auto' }, state.settings || {});
    state.ai = Object.assign({ asked: 0, history: [] }, state.ai || {});
    state.kb = Object.assign({ views: {} }, state.kb || {});
  } catch (e) {
    state = defaults();
  }
  return state;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 忽略配额 */ }
}

const store = {
  get() { return load(); },
  save,

  update(fn) { fn(load()); save(); return state; },

  /* ---------- 按课程 ---------- */
  markIn(cid, key) {
    const s = load();
    s.progress[cid] = s.progress[cid] || {};
    s.progress[cid][key] = Date.now();
    s.last[cid] = key;
    store.activity('complete', { course: cid, key });
    save();
  },
  unmarkIn(cid, key) {
    const s = load();
    if (s.progress[cid]) delete s.progress[cid][key];
    save();
  },
  isDoneIn(cid, key) {
    const s = load();
    return !!(s.progress[cid] && s.progress[cid][key]);
  },
  doneCountIn(cid) {
    const s = load();
    return Object.keys(s.progress[cid] || {}).length;
  },
  setNoteIn(cid, key, text) {
    const s = load();
    s.notes[cid] = s.notes[cid] || {};
    if (text && text.trim()) s.notes[cid][key] = text; else delete s.notes[cid][key];
    save();
  },
  getNoteIn(cid, key) {
    const s = load();
    return (s.notes[cid] || {})[key] || '';
  },
  setLastIn(cid, key) { const s = load(); s.last[cid] = key; save(); },
  lastIn(cid) { return load().last[cid] || null; },

  /* ---------- 兼容旧接口（SP 课程） ---------- */
  complete(no) { store.markIn('sp', String(no)); },
  uncomplete(no) { store.unmarkIn('sp', String(no)); },
  isDone(no) { return store.isDoneIn('sp', String(no)); },
  doneCount() { return store.doneCountIn('sp'); },
  setNote(no, text) { store.setNoteIn('sp', String(no), text); },
  getNote(no) { return store.getNoteIn('sp', String(no)); },
  setLast(no) { store.setLastIn('sp', String(no)); },

  /* ---------- 答题 / AI / 知识库 ---------- */
  quizSave(moduleId, score, total) {
    const s = load();
    const prev = s.quiz[moduleId];
    s.quiz[moduleId] = {
      best: Math.max(prev ? prev.best : 0, score),
      last: score,
      total,
      attempts: (prev ? prev.attempts : 0) + 1,
      lastAt: Date.now()
    };
    store.activity('quiz', { module: moduleId });
    save();
  },

  aiUsed() {
    const s = load();
    s.ai.asked += 1;
    store.activity('ai');
    save();
  },
  aiHistory() { return load().ai.history || []; },
  pushAi(messages) {
    const s = load();
    s.ai.history = messages.slice(-60);
    save();
  },

  kbView(term) {
    const s = load();
    s.kb.views[term] = (s.kb.views[term] || 0) + 1;
    store.activity('kb');
    save();
  },

  activity(type, meta) {
    const s = load();
    s.activity.push(Object.assign({ type, ts: Date.now() }, meta || {}));
    if (s.activity.length > 800) s.activity = s.activity.slice(-800);
  },

  setSetting(k, v) { const s = load(); s.settings[k] = v; save(); },
  getSettings() { return load().settings; },

  last7days() {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;
      const items = load().activity.filter(a => a.ts >= start && a.ts < end);
      days.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        weekday: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
        total: items.length,
        study: items.filter(a => a.type === 'complete' || a.type === 'quiz').length,
        ai: items.filter(a => a.type === 'ai').length
      });
    }
    return days;
  },

  reset() {
    state = defaults();
    save();
  }
};

export default store;
