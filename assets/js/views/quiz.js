import data from '../data.js';
import store from '../store.js';
import { esc, icon, pct, toast } from '../ui.js';

let quizData = null;
let run = null; // { mid, list, idx, score, wrong, answered, finished }

const KEYS = ['A', 'B', 'C', 'D'];

function pickerHtml() {
  const mods = quizData.modules;
  let totalQ = 0;
  Object.values(mods).forEach(m => { totalQ += m.questions.length; });
  const attempted = Object.keys(store.get().quiz).length;
  let sumPct = 0, cnt = 0;
  Object.values(store.get().quiz).forEach(s => { sumPct += pct(s.best, s.total); cnt++; });

  const cards = Object.entries(mods).map(([mid, m], i) => {
    const meta = quizData.moduleMeta && quizData.moduleMeta[mid] ? quizData.moduleMeta[mid] : null;
    const title = meta ? meta.title : `模块 ${i + 1}`;
    const color = meta ? (meta.color || '#ff8a3d') : '#ff8a3d';
    const s = store.get().quiz[mid];
    const sp = s ? pct(s.best, s.total) : 0;
    return `<article class="card quiz-module reveal" style="--m-color:${color}">
      <div class="q-head">
        <span class="q-num" style="color:${color}">MODULE ${String(i + 1).padStart(2, '0')}</span>
        ${s ? `<span class="quiz-score-pill ${sp >= 80 ? 'good' : ''}" style="margin-left:auto">最高 ${sp}%</span>` : '<span class="tag" style="margin-left:auto">未挑战</span>'}
      </div>
      <h3>${esc(title)}</h3>
      <div class="q-meta">
        <span>${icon('bolt', 13)} ${m.questions.length} 题</span>
        <span>${icon('target', 13)} 基础 ${m.questions.filter(q => q.level === '基础').length} · 进阶 ${m.questions.filter(q => q.level === '进阶').length}</span>
        ${s ? `<span>已挑战 ${s.attempts} 次</span>` : ''}
      </div>
      <div class="module-progress" style="margin:4px 0 6px"><i style="width:${sp}%"></i></div>
      <a class="btn ${s ? 'btn-ghost' : 'btn-primary'} btn-sm" href="#/quiz/${mid}" style="align-self:flex-start">
        ${icon('play', 14)} ${s ? '再挑战一次' : '开始闯关'}
      </a>
    </article>`;
  }).join('');

  return `<div class="container">
  <div class="page-head">
    <div class="eyebrow">Quiz Challenge</div>
    <h1>闯关练习</h1>
    <p class="lead">按模块逐个闯关，答完立即看解析；答错的题可以“只练错题”重来。共 ${totalQ} 道题，覆盖 7 大模块的全部核心知识点。</p>
  </div>
  <div class="kpi-grid" style="margin-top:26px;grid-template-columns:repeat(3,1fr)">
    <div class="kpi"><div class="k-lbl">题库总量</div><div class="k-val">${totalQ}<small>题</small></div><div class="k-sub">7 个模块 · 即时解析</div></div>
    <div class="kpi"><div class="k-lbl">已挑战模块</div><div class="k-val">${attempted}<small>/ 7</small></div><div class="k-sub">每个模块独立计分</div></div>
    <div class="kpi"><div class="k-lbl">平均最高正确率</div><div class="k-val">${cnt ? Math.round(sumPct / cnt) : 0}<small>%</small></div><div class="k-sub">${cnt ? '继续冲 90%+' : '先从模块 1 开始'}</div></div>
  </div>
  <div class="quiz-picker">${cards}</div>
</div>`;
}

function questionHtml(mid) {
  const q = run.list[run.idx];
  const m = quizData.modules[mid];
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

function resultHtml(mid) {
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
        <a class="btn btn-ghost" href="#/quiz">${icon('grid', 15)} 返回模块选择</a>
        <button class="btn btn-primary" id="retryWrong" ${run.wrong.length ? '' : 'disabled'}>${icon('refresh', 15)} 只练错题</button>
        <a class="btn btn-ghost" href="#/map">${icon('map', 15)} 回课程地图</a>
      </div>
    </div>
    ${wrongHtml}
  </div></div>`;
}

function finish(mid) {
  run.finished = true;
  store.quizSave(mid, run.score, run.list.length);
  const card = document.getElementById('quizStage');
  card.innerHTML = resultHtml(mid);
}

function renderQuestionStage(mid) {
  const stage = document.getElementById('quizStage');
  stage.innerHTML = questionHtml(mid);
  const q = run.list[run.idx];
  const p = pct(run.idx, run.list.length);
  const bar = document.getElementById('quizBar');
  const label = document.getElementById('quizCounter');
  if (bar) bar.style.width = p + '%';
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

function runnerHtml(mid) {
  const m = quizData.modules[mid];
  const meta = quizData.moduleMeta && quizData.moduleMeta[mid] ? quizData.moduleMeta[mid] : null;
  return `<div class="container"><div class="quiz-run">
    <div class="quiz-topbar">
      <a class="icon-btn" href="#/quiz" aria-label="返回模块选择">${icon('arrow-left', 16)}</a>
      <span style="font-weight:700;color:var(--text)">${esc(meta ? meta.title : mid)}</span>
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
  async preload() { quizData = await data.quiz(); },

  async render(params) {
    const qd = quizData || await data.quiz();
    quizData = qd;
    const mid = params.moduleId;
    if (mid && qd.modules[mid]) {
      initRun(mid);
      return runnerHtml(mid);
    }
    return pickerHtml();
  },

  mount(params) {
    const mid = params.moduleId;
    if (!mid || !quizData.modules[mid]) return;
    renderQuestionStage(mid);
    const stage = document.getElementById('quizStage');
    // 事件委托：题卡会整体重绘，按钮监听需要挂在容器上
    stage.addEventListener('click', (e) => {
      const next = e.target.closest('#nextBtn');
      if (next) {
        if (run.finished) return;
        if (run.idx === run.list.length - 1) { finish(mid); return; }
        run.idx++; run.answered = false;
        renderQuestionStage(mid);
        return;
      }
      const retry = e.target.closest('#retryWrong');
      if (retry) {
        run.list = run.wrong.slice();
        run.idx = 0; run.score = 0; run.wrong = []; run.answered = false; run.finished = false;
        renderQuestionStage(mid);
      }
    });
  }
};


