import data from '../data.js';
import store from '../store.js';
import { esc, icon, fmtDur, pct, debounce } from '../ui.js';

let courseCache = null;

export default {
  async preload() { courseCache = await data.course(); },

  async render() {
    const course = courseCache || await data.course();
    const modules = course.modules;
    const meta = course.meta;
    const done = store.doneCount();
    const progress = pct(done, meta.totalLessons);
    const last = store.get().lastLesson;
    const lastLesson = last ? modules.flatMap(m => m.lessons).find(l => l.no === last) : null;

    const moduleHtml = modules.map((m, idx) => {
      const mDone = m.lessons.filter(l => store.isDone(l.no)).length;
      const mp = pct(mDone, m.lessons.length);
      const mins = Math.round(m.lessons.reduce((s, l) => s + l.durationSec, 0) / 60);
      const open = idx === 0 || (lastLesson && m.lessons.some(l => l.no === lastLesson.no));
      const rows = m.lessons.map(l => {
        const isDone = store.isDone(l.no);
        return `<a class="lesson-row ${isDone ? 'done' : ''}" href="#/lesson/${l.no}" data-search="${esc((l.title + ' ' + (l.tags || []).join(' ') + ' ' + (l.summary || '')).toLowerCase())}">
          <span class="l-no">${String(l.no).padStart(2, '0')}</span>
          <span class="l-title">${esc(l.title)}<small>${esc(l.summary || '').slice(0, 46)}${(l.summary || '').length > 46 ? '…' : ''}</small></span>
          <span class="l-dur">${fmtDur(l.durationSec)}</span>
          <span class="l-state"><span class="check-dot">${isDone ? icon('check', 11) : ''}</span></span>
        </a>`;
      }).join('');
      return `<section class="map-module ${open ? 'open' : ''}" data-module="${m.id}">
        <div class="map-module-head" role="button" tabindex="0" aria-expanded="${open}">
          <span class="mm-index" style="--m-color:${m.color}">${String(m.index).padStart(2, '0')}</span>
          <div>
            <h3>${esc(m.title)}</h3>
            <div class="mm-sub">${esc(m.description || m.subtitle)}</div>
          </div>
          <div class="mm-right">
            <span class="tag">${m.lessons.length} 节 · ${mins} 分钟</span>
            <span>${mp}%</span>
            <span class="chev">${icon('chevron-down', 18)}</span>
          </div>
        </div>
        <div class="map-module-body">
          <div class="module-progress" style="margin-bottom:14px"><i style="width:${mp}%;--m-color:${m.color}"></i></div>
          ${rows}
        </div>
      </section>`;
    }).join('');

    return `<div class="container">
  <div class="page-head">
    <div class="eyebrow">课程目录</div>
    <h1>课程地图</h1>
    <p class="lead">7 大模块 · ${meta.totalLessons} 节课 · 约 ${meta.totalHours} 小时。点击模块展开课时，学完自动记录进度；也可以直接搜索关键词。</p>
  </div>
  <div class="map-toolbar">
    <div class="search-box">
      ${icon('search', 16)}
      <input id="mapSearch" type="search" placeholder="搜索课时、知识点，如：锚点 / 烘焙 / UV" autocomplete="off" aria-label="搜索课程">
    </div>
    <a class="btn btn-ghost btn-sm" href="#/quiz">${icon('bolt', 15)} 去闯关</a>
    <div class="progress-ring-wrap">
      <div class="progress-ring" style="--p:${progress}"><b>${progress}%</b></div>
      <span>已完成 ${done} / ${meta.totalLessons} 节</span>
    </div>
  </div>
  <div id="mapList">${moduleHtml}</div>
  <div id="mapEmpty" class="kb-empty" style="display:none">没有找到匹配的课时，换个关键词试试。</div>
</div>`;
  },

  mount() {
    const list = document.getElementById('mapList');
    const empty = document.getElementById('mapEmpty');
    const search = document.getElementById('mapSearch');

    const toggle = (head) => {
      const mod = head.closest('.map-module');
      mod.classList.toggle('open');
      head.setAttribute('aria-expanded', String(mod.classList.contains('open')));
    };
    list.addEventListener('click', (e) => {
      const head = e.target.closest('.map-module-head');
      if (head && !e.target.closest('a')) toggle(head);
    });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const head = e.target.closest('.map-module-head');
        if (head) { e.preventDefault(); toggle(head); }
      }
    });

    search.addEventListener('input', debounce(() => {
      const q = search.value.trim().toLowerCase();
      let visible = 0;
      document.querySelectorAll('.map-module').forEach(mod => {
        let matchCount = 0;
        mod.querySelectorAll('.lesson-row').forEach(row => {
          const hit = !q || row.dataset.search.includes(q);
          row.style.display = hit ? '' : 'none';
          if (hit) matchCount++;
        });
        const show = !q || matchCount > 0;
        mod.style.display = show ? '' : 'none';
        if (show) visible++;
        if (q) {
          mod.classList.toggle('open', matchCount > 0);
          mod.querySelector('.map-module-head').setAttribute('aria-expanded', String(matchCount > 0));
        } else {
          mod.classList.remove('open');
        }
      });
      empty.style.display = visible ? 'none' : '';
      if (!q) {
        const first = document.querySelector('.map-module');
        if (first) first.classList.add('open');
      }
    }, 160));
  }
};
