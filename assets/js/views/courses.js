import data from '../data.js';
import store from '../store.js';
import { esc, icon, pct } from '../ui.js';

function hours(sec) { return (sec / 3600 >= 1) ? (sec / 3600).toFixed(1) + ' 小时' : Math.round(sec / 60) + ' 分钟'; }

function courseCard(c) {
  const done = store.doneCountIn(c.id);
  const total = c.lessonCount || 0;
  const p = total ? pct(done, total) : 0;
  const typeTag = c.type === 'bilibili' ? 'B 站' : c.type === 'gallery' ? '图文资料' : (c.type === 'sp' ? '核心课' : '视频课');
  return `<a class="course-card reveal" href="#/course/${c.id}" style="--accent:${c.accent || '#ff8a3d'}">
    <div class="cc-cover">
      ${c.cover ? `<img src="${esc(c.cover)}" alt="${esc(c.title)}" loading="lazy">` : '<div class="cc-cover-fallback"></div>'}
      <span class="cc-cat">${esc(c.category)}</span>
      <span class="cc-type">${typeTag}</span>
    </div>
    <div class="cc-body">
      <h3>${esc(c.title)}</h3>
      <p class="cc-sub">${esc(c.subtitle || '')}</p>
      <div class="cc-meta">
        <span>${icon('play', 12)} ${total} 节</span>
        <span>${icon('clock', 12)} ${hours(c.durationSec || 0)}</span>
        ${c.hasQuiz ? '<span class="tag copper">含练习</span>' : ''}
      </div>
      ${total ? `<div class="cc-progress"><i style="width:${p}%"></i></div><div class="cc-progress-txt">${done}/${total} · ${p}%</div>` : '<div class="cc-progress-txt">资料型课程</div>'}
    </div>
  </a>`;
}

export default {
  async render(params) {
    const cat = await data.catalog();
    const courses = cat.courses || [];
    const categories = (cat.categories || []).filter(x => x.id !== 'all');
    const q = (params.query && params.query.q) || '';
    return `<div class="container">
      <div class="page-head">
        <div class="eyebrow">Course Center</div>
        <h1>课程中心</h1>
        <p class="lead">${esc(cat.platform.intro || '')} 共 ${courses.length} 门课程、${cat.lessonTotal} 个课时，约 ${Math.round(cat.durationTotal / 3600)} 小时。</p>
      </div>
      <div class="catalog-toolbar">
        <div class="search-box">${icon('search', 16)}<input id="courseSearch" type="search" placeholder="搜索课程，如：ZBrush / 分镜 / 色彩" value="${esc(q)}" aria-label="搜索课程"></div>
        <div class="course-cats" id="courseCats">
          <button class="chip active" data-cat="all">全部 <span>${courses.length}</span></button>
          ${categories.map(c => {
            const n = courses.filter(x => x.category === c.id).length;
            return n ? `<button class="chip" data-cat="${esc(c.id)}">${esc(c.name)} <span>${n}</span></button>` : '';
          }).join('')}
        </div>
      </div>
      <div class="course-grid" id="courseGrid">
        ${courses.map(c => `<div class="course-card-wrap" data-cat="${esc(c.category)}" data-search="${esc((c.title + ' ' + (c.subtitle || '') + ' ' + (c.tags || []).join(' ')).toLowerCase())}">${courseCard(c)}</div>`).join('')}
      </div>
      <div class="kb-empty" id="courseEmpty" style="display:none">没有找到匹配的课程，换个关键词或分类试试。</div>
      <div class="catalog-foot">
        <span>共 ${courses.length} 门课程 · ${cat.lessonTotal} 课时 · 持续更新</span>
        <a class="link-arrow" href="#/">返回首页 ${icon('arrow-right', 13)}</a>
      </div>
    </div>`;
  },

  mount() {
    const grid = document.getElementById('courseGrid');
    const empty = document.getElementById('courseEmpty');
    const search = document.getElementById('courseSearch');
    const cats = document.getElementById('courseCats');
    let activeCat = 'all';
    const apply = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      grid.querySelectorAll('.course-card-wrap').forEach(w => {
        const hitCat = activeCat === 'all' || w.dataset.cat === activeCat;
        const hitQ = !q || w.dataset.search.includes(q);
        const show = hitCat && hitQ;
        w.style.display = show ? '' : 'none';
        if (show) shown++;
      });
      empty.style.display = shown ? 'none' : '';
    };
    cats.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      cats.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      b.classList.add('active');
      activeCat = b.dataset.cat;
      apply();
    });
    search.addEventListener('input', apply);
    grid.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    if (search.value) apply();
  }
};
