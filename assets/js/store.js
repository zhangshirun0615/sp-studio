/* 本地状态：进度、笔记、答题、AI 提问、活动记录（localStorage） */

const KEY = 'spstudio.v1';

const defaults = () => ({
  name: '',
  completed: {},          // { lessonNo: timestamp }
  notes: {},              // { lessonNo: text }
  quiz: {},               // { moduleId: { best, total, attempts, lastAt } }
  ai: { asked: 0, history: [] },
  kb: { views: {} },      // { term: count }
  activity: [],           // [{ type, ts, lesson?, module? }]
  settings: { apiBase: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
  lastLesson: null,
  createdAt: Date.now()
});

let state = null;

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
    // 结构兜底
    state.completed = state.completed || {};
    state.notes = state.notes || {};
    state.quiz = state.quiz || {};
    state.activity = Array.isArray(state.activity) ? state.activity : [];
    state.settings = Object.assign({ apiBase: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' }, state.settings || {});
    state.ai = Object.assign({ asked: 0, history: [] }, state.ai || {});
    state.kb = Object.assign({ views: {} }, state.kb || {});
  } catch (e) {
    state = defaults();
  }
  return state;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 忽略配额错误 */ }
}

const store = {
  get() { return load(); },
  save,

  update(fn) { fn(load()); save(); return state; },

  complete(no) {
    const s = load();
    s.completed[no] = Date.now();
    s.lastLesson = no;
    store.activity('complete', { lesson: no });
    save();
  },
  uncomplete(no) {
    const s = load();
    delete s.completed[no];
    save();
  },
  isDone(no) { return !!load().completed[no]; },
  doneCount() { return Object.keys(load().completed).length; },

  setNote(no, text) {
    const s = load();
    if (text && text.trim()) s.notes[no] = text; else delete s.notes[no];
    save();
  },
  getNote(no) { return load().notes[no] || ''; },

  setLast(no) { const s = load(); s.lastLesson = no; save(); },

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
