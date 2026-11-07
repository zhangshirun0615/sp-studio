import data from '../data.js';
import store from '../store.js';
import { esc, icon, pct, toast } from '../ui.js';

let quizData = null;
let catalogCache = null;
let run = null; // { mid, list, idx, score, wrong, answered, finished }
let currentCourse = null;

const KEYS = ['A', 'B', 'C', 'D'];

function courseBest(cid) {
  const prefix = cid + ':';
  let sum = 0, cnt = 0;
  Object.entries(store.get().quiz || {}).forEach(([k, v]) => {
    if (k.startsWith(prefix)) { sum += pct(v.best, v.total); cnt++; }
  });
  return cnt ? Math.round(sum / cnt) : null;
}

async function getCatalog() {
  if (!catalogCache) catalogCache = await data.catalog();
  return catalogCache;
}

async function coursePicker() {
  const cat = await getCatalog();
  const courses = (cat.courses || []).filter(c => c.hasQuiz);
  let indexMap = {};
  try {
    const res = await fetch('data/quizzes/index.json', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      (j.courses || []).forEach(x => { indexMap[x.id] = x; });
    }
  } catch (e) { /* 忽略 */ }
  const cards = courses.map((c, i) => {
    const best = courseBest(c.id);
    const idx = indexMap[c.id];
    return `<article class="card quiz-module reveal" style="--m-color:${c.accent || '#ff8a3d'}">
      <div class="q-head">
        <span class="q-num" style="color:${c.accent || '#ff8a3d'}">第 ${String(i + 1).padStart(2, '0')} 门</span>
        ${best != null ? `<span class="quiz-score-pill ${best >= 80 ? 'good' : ''}" style="margin-left:auto">最高 ${best}%</span>` : '<span class="tag" style="margin-left:auto">未挑战</span>'}
      </div>
      <h3>${esc(c.title)}</h3>
      <div class="q-meta">
        <span>${icon('book', 13)} ${esc(c.category)}</span>
        <span>${icon('bolt', 13)} ${idx ? idx.questions : '多'} 道题</span>
        <span>${icon('grid', 13)} ${idx ? idx.modules : '多'} 个板块</span>
      </div>
      <a class="btn ${best != null ? 'btn-ghost' : 'btn-primary'} btn-sm" href="#/quiz/${c.id}" style="align-self:flex-start">
        ${icon('play', 14)} ${best != null ? '继续闯关' : '开始闯关'}
      </a>
    </article>`;
  }).join('');

  return `<div class="container">
  <div class="page-head">
    <div class="eyebrow">闯关练习</div>
    <h1>闯关练习</h1>
    <p class="lead">所有课程都配了模块化闯关练习：答完立即看解析，答错的题可以“只练错题”重来。先选一门课程开始。</p>
  </div>
  <div class="quiz-picker" style="margin-top:24px">${cards || '<p style="color:var(--muted)">题库正在生成中…</p>'}</div>
</div>`;
}

function modulePicker() {
  const mods = quizData.modules || {};
  const list = Object.values(mods).sort((a, b) => (a.index || 0) - (b.index || 0));
  let totalQ = 0;
  list.forEach(m => { totalQ += (m.questions || []).length; });
  const prefix = currentCourse.id + ':';
  const attempted = Object.keys(store.get().quiz || {}).filter(k => k.startsWith(prefix)).length;
  const cards = list.map((m, i) => {
    const s = store.get().quiz[prefix + m.id];
    const sp = s ? pct(s.best, s.total) : 0;
    const color = currentCourse.accent || '#ff8a3d';
    return `<article class="card quiz-module reveal" style="--m-color:${color}">
      <div class="q-head">
        <span class="q-num" style="color:${color}">板块 ${String(i + 1).padStart(2, '0')}</span>
        ${s ? `<span class="quiz-score-pill ${sp >= 80 ? 'good' : ''}" style="margin-left:auto">最高 ${sp}%</span>` : '<span class="tag" style="margin-left:auto">未挑战</span>'}
      </div>
      <h3>${esc(m.title)}</h3>
      <div class="q-meta">
        <span>${icon('bolt', 13)} ${(m.questions || []).length} 题</span>
        <span>${icon('target', 13)} 基础 ${(m.questions || []).filter(q => q.level === '基础').length} · 进阶 ${(m.questions || []).filter(q => q.level === '进阶').length}</span>
      </div>
      <div class="module-progress" style="margin:4px 0 6px"><i style="width:${sp}%;--m-color:${color}"></i></div>
      <a class="btn ${s ? 'btn-ghost' : 'btn-primary'} btn-sm" href="#/quiz/${currentCourse.id}?m=${m.id}" style="align-self:flex-start">
        ${icon('play', 14)} ${s ? '再挑战一次' : '开始闯关'}
      </a>
    </article>`;
  }).join('');

  return `<div class="container">
  <div class="breadcrumb"><a href="#/quiz">闯关练习</a> ${icon('chevron-right', 12)} <a href="#/course/${currentCourse.id}">${esc(currentCourse.title)}</a> ${icon('chevron-right', 12)} <span>题库</span></div>
  <div class="page-head">
    <div class="eyebrow">闯关练习</div>
    <h1>${esc(currentCourse.title)} · 闯关练习</h1>
    <p class="lead">共 ${list.length} 个板块、${totalQ} 道题，全部围绕本课程知识点；每个板块独立计分，可反复挑战。</p>
  </div>
  <div class="kpi-grid" style="margin-top:26px;grid-template-columns:repeat(3,1fr)">
    <div class="kpi"><div class="k-lbl">题库总量</div><div class="k-val">${totalQ}<small>题</small></div><div class="k-sub">${list.length} 个板块 · 即时解析</div></div>
    <div class="kpi"><div class="k-lbl">已挑战板块</div><div class="k-val">${attempted}<small>/ ${list.length}</small></div><div class="k-sub">每个板块独立计分</div></div>
    <div class="kpi"><div class="k-lbl">本课最高正确率</div><div class="k-val">${courseBest(currentCourse.id) || 0}<small>%</small></div><div class="k-sub">继续冲 90%+</div></div>
  </div>
  <div class="quiz-picker">${cards}</div>
</div>`;
}

function questionHtml() {
  const q = run.list[run.idx];
  const opts = q.options.map((o, i) => `<button class="quiz-option" data-opt="${i}" data-ans="${q.answer}">
      <span class="opt-key">${KEYS[i]}</span><span>${esc(o)}</span>
    </button>`).join('');
  return `<div class="quiz-card">
    <div class="quiz-q">
      <span class="q-tag">${esc(q.level || '基础')} · 第 ${run.idx + 1} / ${run.list.length} 题</span>
      <div>${esc(q.q)}</div>
    </div>
    <div class="quiz-options" id="quizOptions">${opts}</div>
    <div class="quiz-explain" id="quizExplain"></div>
    <div class="quiz-actions">
      <button class="btn btn-primary btn-sm" id="nextBtn" style="display:none">下一题 ${icon('arrow-right', 14)}</button>
      <span class="hint" id="quizHint">选择你认为正确的答案</span>
    </div>
  </div>`;
}

function resultHtml() {
  const total = run.list.length;
  const p = pct(run.score, total);
  const title = p >= 90 ? '稳了，可以出师了' : p >= 70 ? '不错，再补几个细节' : p >= 50 ? '基础还行，错题要重练' : '别急，先回看对应课程';
  const wrongHtml = run.wrong.length ? `<div class="wrong-list">
    <h3 style="font-size:16px;margin-bottom:4px">错题回顾（${run.wrong.length} 题）</h3>
    ${run.wrong.map(w => `<div class="wrong-item">
      <div class="wi-q">${esc(w.q)}</div>
      <div class="wi-a">正确答案：<b>${esc(w.options[w.answer])}</b></div>
      <div class="wi-e">${esc(w.explain || '')}</div>
    </div>`).join('')}
  </div>` : `<div class="wrong-list"><div class="wrong-item" style="border-color:rgba(99,214,159,.3);background:rgba(99,214,159,.06)">全部答对，太棒了！去课程里找一节还没看的继续吧。</div></div>`;

  return `<div class="container"><div class="quiz-run">
    <div class="quiz-result">
      <div class="score-ring" style="--p:${p}"><div class="sr-inner"><b>${p}%</b><span>正确率</span></div></div>
      <h2>${title}</h2>
      <p class="res-sub">答对 ${run.score} / ${total} 题 · ${run.wrong.length ? `还有 ${run.wrong.length} 个知识点要补` : '本轮全对'}</p>
      <div class="res-actions">
        <a class="btn btn-ghost" href="#/quiz/${currentCourse.id}">${icon('grid', 15)} 返回板块选择</a>
        <button class="btn btn-primary" id="retryWrong" ${run.wrong.length ? '' : 'disabled'}>${icon('refresh', 15)} 只练错题</button>
        <a class="btn btn-ghost" href="#/course/${currentCourse.id}">${icon('map', 15)} 回课程目录</a>
      </div>
    </div>
    ${wrongHtml}
  </div></div>`;
}

function finish() {
  run.finished = true;
  store.quizSave(currentCourse.id, run.mid, run.score, run.list.length);
  document.getElementById('quizStage').innerHTML = resultHtml();
}

function renderQuestionStage() {
  const stage = document.getElementById('quizStage');
  stage.innerHTML = questionHtml();
  const q = run.list[run.idx];
  const p = pct(run.idx, run.list.length);
  const bar = document.getElementById('quizBar');
  if (bar) bar.style.width = p + '%';
  const label = document.getElementById('quizCounter');
  if (label) label.textContent = `${run.idx + 1} / ${run.list.length}`;
  document.getElementById('quizScore').textContent = `${run.score} 分`;

  stage.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (run.answered) return;
      run.answered = true;
      const pick = Number(btn.dataset.opt);
      const correct = pick === q.answer;
      stage.querySelectorAll('.quiz-option').forEach((b, i) => {
        b.classList.add('disabled');
        if (i === q.answer) b.classList.add('correct');
        if (i === pick && !correct) b.classList.add('wrong');
      });
      if (correct) run.score++;
      else run.wrong.push(q);
      const explain = document.getElementById('quizExplain');
      explain.innerHTML = `${correct ? `${icon('check', 14)} <b>回答正确</b>` : `${icon('close', 14)} <b>正确答案：${KEYS[q.answer]} ${esc(q.options[q.answer])}</b>`}<br>${esc(q.explain || '')}`;
      explain.classList.add('show');
      document.getElementById('quizHint').textContent = correct ? '继续保持' : '把解析看完再继续';
      const next = document.getElementById('nextBtn');
      next.style.display = '';
      next.innerHTML = run.idx === run.list.length - 1 ? `查看结果 ${icon('arrow-right', 14)}` : `下一题 ${icon('arrow-right', 14)}`;
      next.focus();
    });
  });
}

function runnerHtml() {
  const m = quizData.modules[run.mid];
  return `<div class="container"><div class="quiz-run">
    <div class="quiz-topbar">
      <a class="icon-btn" href="#/quiz/${currentCourse.id}" aria-label="返回板块选择">${icon('arrow-left', 16)}</a>
      <span style="font-weight:700;color:var(--text)">${esc(m.title)}</span>
      <div class="quiz-progress"><i id="quizBar" style="width:0%"></i></div>
      <span id="quizCounter">1 / ${m.questions.length}</span>
      <span id="quizScore" style="color:var(--copper-2);font-weight:700">0 分</span>
    </div>
    <div id="quizStage"></div>
  </div></div>`;
}

function initRun(mid) {
  const m = quizData.modules[mid];
  run = { mid, list: m.questions.slice(), idx: 0, score: 0, wrong: [], answered: false, finished: false };
}

export default {
  async render(params) {
    const cat = await getCatalog();
    const cid = params.courseId;
    if (!cid) return coursePicker();
    const meta = (cat.courses || []).find(c => c.id === cid);
    if (!meta) return coursePicker();
    currentCourse = meta;
    quizData = await data.quizOf(cid);
    if (!quizData) return coursePicker();
    const mid = params.query && params.query.m;
    if (mid && quizData.modules[mid]) {
      initRun(mid);
      return runnerHtml();
    }
    return modulePicker();
  },

  mount(params) {
    if (!quizData || !currentCourse) return;
    const mid = params.query && params.query.m;
    if (!mid || !quizData.modules[mid]) return;
    renderQuestionStage();
    const stage = document.getElementById('quizStage');
    stage.addEventListener('click', (e) => {
      const next = e.target.closest('#nextBtn');
      if (next) {
        if (run.finished) return;
        if (run.idx === run.list.length - 1) { finish(); return; }
        run.idx++; run.answered = false;
        renderQuestionStage();
        return;
      }
      const retry = e.target.closest('#retryWrong');
      if (retry) {
        run.list = run.wrong.slice();
        run.idx = 0; run.score = 0; run.wrong = []; run.answered = false; run.finished = false;
        renderQuestionStage();
      }
    });
  }
};
