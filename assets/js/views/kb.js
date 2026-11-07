import data from '../data.js';
import store from '../store.js';
import { esc, icon, debounce } from '../ui.js';

let cache = null;

function termCard(t) {
  return `<article class="card hoverable kb-card reveal" data-term="${esc(t.term)}" tabindex="0" role="button" aria-label="查看术语：${esc(t.term)}">
    <h3>${esc(t.term)}${t.en ? `<small>${esc(t.en)}</small>` : ''}</h3>
    <p>${esc(t.def)}</p>
    <div class="kb-foot">
      <span class="cat">${esc(t.cat)}</span>
      ${(t.lessonRefs || []).length ? `<span style="font-size:11.5px;color:var(--muted);margin-left:auto">见于第 ${t.lessonRefs.slice(0, 3).join('、')} 课</span>` : ''}
    </div>
  </article>`;
}

function openTerm(terms, name, onNavigate) {
  const t = terms.find(x => x.term === name);
  if (!t) return;
  store.kbView(t.term);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop show';
  const related = (t.related || []).map(r => `<button class="chip" data-related="${esc(r)}">${esc(r)}</button>`).join('');
  const refs = (t.lessonRefs || []).map(no => `<a class="chip" href="#/lesson/${no}">${icon('play', 12)} 第 ${no} 课</a>`).join('');
  backdrop.innerHTML = `<div class="modal" style="position:relative">
    <button class="icon-btn m-close" aria-label="关闭">${icon('close', 16)}</button>
    <span class="tag copper">${esc(t.cat)}</span>
    <h2 style="margin-top:12px">${esc(t.term)}</h2>
    ${t.en ? `<div class="m-en">${esc(t.en)}</div>` : ''}
    <div class="m-body">${esc(t.def)}</div>
    ${related ? `<div class="m-sec"><h4>相关术语</h4><div class="chips">${related}</div></div>` : ''}
    ${refs ? `<div class="m-sec"><h4>对应课程</h4><div class="chips">${refs}</div></div>` : ''}
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector('.m-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-related]').forEach(btn => {
    btn.addEventListener('click', () => {
      close();
      if (onNavigate) onNavigate(btn.dataset.related);
    });
  });
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

export default {
  async preload() { cache = await data.kb(); },

  async render() {
    const kb = cache || await data.kb();
    const terms = kb.terms || [];
    const cats = [...new Set(terms.map(t => t.cat))];
    const catChips = cats.map(c => {
      const n = terms.filter(t => t.cat === c).length;
      return `<button class="chip" data-cat="${esc(c)}">${esc(c)} <span style="opacity:.6">${n}</span></button>`;
    }).join('');

    return `<div class="container">
  <div class="page-head">
    <div class="eyebrow">知识库</div>
    <h1>术语知识库</h1>
    <p class="lead">${terms.length} 条 Substance Painter 核心术语，按“基础概念 → 工作流 → 贴图 → 图层 → 材质 → 笔刷 → UV → 光照导出”分类整理。点击术语查看完整定义、相关术语与对应课程。</p>
  </div>
  <div class="kb-toolbar">
    <div class="search-box">${icon('search', 16)}
      <input id="kbSearch" type="search" placeholder="搜索术语，如：锚点 / 生成器 / UDIM" autocomplete="off" aria-label="搜索术语">
    </div>
    <span class="kb-count" id="kbCount">共 ${terms.length} 条</span>
  </div>
  <div class="kb-cats" id="kbCats">
    <button class="chip active" data-cat="all">全部 <span style="opacity:.6">${terms.length}</span></button>
    ${catChips}
  </div>
  <div class="kb-grid" id="kbGrid">${terms.map(termCard).join('')}</div>
  <div class="kb-empty" id="kbEmpty" style="display:none">没有找到相关术语，换个关键词试试。</div>
</div>`;
  },

  mount() {
    const kb = cache;
    const terms = kb.terms || [];
    const grid = document.getElementById('kbGrid');
    const cats = document.getElementById('kbCats');
    const search = document.getElementById('kbSearch');
    const count = document.getElementById('kbCount');
    const empty = document.getElementById('kbEmpty');
    let activeCat = 'all';
    let query = '';

    const apply = () => {
      let shown = 0;
      grid.querySelectorAll('.kb-card').forEach(card => {
        const t = terms.find(x => x.term === card.dataset.term);
        const hitCat = activeCat === 'all' || (t && t.cat === activeCat);
        const q = query.toLowerCase();
        const hitQ = !q || (t && (t.term + ' ' + (t.en || '') + ' ' + t.def + ' ' + (t.related || []).join(' ')).toLowerCase().includes(q));
        const show = hitCat && hitQ;
        card.style.display = show ? '' : 'none';
        if (show) shown++;
      });
      count.textContent = `共 ${shown} 条`;
      empty.style.display = shown ? 'none' : '';
    };

    cats.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      cats.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      activeCat = btn.dataset.cat;
      apply();
    });

    search.addEventListener('input', debounce(() => { query = search.value.trim(); apply(); }, 140));

    const open = (name) => openTerm(terms, name, (next) => open(next));
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.kb-card');
      if (card) open(card.dataset.term);
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.kb-card');
        if (card) { e.preventDefault(); open(card.dataset.term); }
      }
    });

    // 支持 #/kb?term=xxx 深链
    const hash = decodeURIComponent(location.hash);
    const m = hash.match(/\?term=([^&]+)/);
    if (m) setTimeout(() => open(m[1]), 120);
  }
};
