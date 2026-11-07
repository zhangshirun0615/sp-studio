import data from '../data.js';
import store from '../store.js';
import { esc, icon, fmtDur, pct } from '../ui.js';

function hours(sec) { return (sec / 3600).toFixed(1); }

export default {
  async render(params) {
    const id = params.id;
    const c = await data.courseById(id);
    if (!c) {
      return `<div class="container" style="padding:80px 24px"><div class="card" style="text-align:center;padding:50px">
        <h2>没有找到这门课程</h2><p style="color:var(--muted);margin:10px 0 22px">课程可能已下架或地址有误。</p>
        <a class="btn btn-primary" href="#/courses">返回课程中心</a></div></div>`;
    }
    const meta = c.meta;
    const d = c.data;
    const isSP = meta.type === 'sp';
    const isGallery = meta.type === 'gallery' || (d.modules || []).every(m => !(m.lessons || []).length);
    const lessons = await data.lessonsOf(id);
    const done = store.doneCountIn(id);
    const total = lessons.length;
    const progress = total ? pct(done, total) : 0;
    const lastKey = store.lastIn(id);
    const last = lastKey ? lessons.find(l => l.key === lastKey) : null;
    const startLesson = last || lessons[0] || null;
    const resources = d.resources || [];
    const pan = (meta.pan && meta.pan.url) ? meta.pan : null;

    const modulesHtml = (d.modules || []).map((m, idx) => {
      const ls = m.lessons || [];
      if (!ls.length) return '';
      const mDone = ls.filter(l => store.isDoneIn(id, String(l.no))).length;
      const mp = pct(mDone, ls.length);
      const open = idx === 0 || (last && ls.some(l => String(l.no) === lastKey));
      return `<section class="map-module ${open ? 'open' : ''}" data-module="${esc(m.id)}">
        <div class="map-module-head" role="button" tabindex="0" aria-expanded="${open}">
          <span class="mm-index" style="--m-color:${meta.accent}">${String(m.index).padStart(2, '0')}</span>
          <div><h3>${esc(m.title)}</h3><div class="mm-sub">${ls.length} 节 · ${Math.round(ls.reduce((s, l) => s + (l.durationSec || 0), 0) / 60)} 分钟</div></div>
          <div class="mm-right"><span class="tag">${mp}%</span><span class="chev">${icon('chevron-down', 18)}</span></div>
        </div>
        <div class="map-module-body">
          <div class="module-progress" style="margin-bottom:12px"><i style="width:${mp}%;--m-color:${meta.accent}"></i></div>
          ${ls.map(l => {
            const isDone = store.isDoneIn(id, String(l.no));
            return `<a class="lesson-row ${isDone ? 'done' : ''}" href="#/lesson/${id}/${l.no}">
              <span class="l-no">${String(l.no).padStart(2, '0')}</span>
              <span class="l-title">${esc(l.title)}</span>
              <span class="l-dur">${l.durationSec ? fmtDur(l.durationSec) : (l.sizeMB ? Math.round(l.sizeMB) + ' MB' : '')}</span>
              <span class="l-state"><span class="check-dot">${isDone ? icon('check', 11) : ''}</span></span>
            </a>`;
          }).join('')}
        </div>
      </section>`;
    }).join('');

    const pdfs = resources.filter(r => r.kind === 'pdf' || r.kind === 'file');
    const imageDirs = resources.filter(r => r.kind === 'images');
    const resHtml = (pdfs.length || imageDirs.length) ? `<section class="lesson-section" id="resources-${id}">
      <h2>课程资料</h2>
      <div class="resource-list">
        ${pdfs.map(r => `<a class="res-item" href="${data.mediaUrl(id, r.path)}" target="_blank" rel="noopener">
          <span class="res-icon">${icon('book', 16)}</span><span class="res-name">${esc(r.name)}</span><span class="res-size">${r.sizeMB} MB</span><span class="res-open">${icon('external', 14)}</span>
        </a>`).join('')}
        ${imageDirs.map(r => `<a class="res-item" href="#/gallery/${id}?dir=${encodeURIComponent(r.dir)}">
          <span class="res-icon">${icon('grid', 16)}</span><span class="res-name">${esc(r.name)}</span><span class="res-size">${r.count} 张 · ${r.totalMB} MB</span><span class="res-open">${icon('arrow-right', 14)}</span>
        </a>`).join('')}
      </div>
    </section>` : '';

    return `<div class="course-hero" style="--accent:${meta.accent || '#ff8a3d'}">
      ${meta.cover ? `<div class="ch-bg" style="background-image:url('${esc(meta.cover)}')"></div>` : ''}
      <div class="container ch-inner">
        <div class="breadcrumb" style="margin:0 0 14px">
          <a href="#/">首页</a> ${icon('chevron-right', 12)} <a href="#/courses">课程中心</a> ${icon('chevron-right', 12)} <span>${esc(meta.title)}</span>
        </div>
        <div class="ch-badges">
          <span class="tag copper">${esc(meta.category)}</span>
          <span class="tag">${meta.type === 'bilibili' ? 'B 站课程' : meta.type === 'gallery' ? '图文资料' : '视频课程'}</span>
          ${(meta.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
        <h1>${esc(meta.title)}</h1>
        <p class="ch-sub">${esc(meta.subtitle || '')}</p>
        <p class="ch-desc">${esc(meta.description || '')}</p>
        <div class="ch-stats">
          <span>${icon('play', 14)} ${total} 课时</span>
          <span>${icon('clock', 14)} ${hours(meta.durationSec || 0)} 小时</span>
          ${meta.hasQuiz ? `<span>${icon('bolt', 14)} 配套闯关练习</span>` : ''}
          ${imageDirs.length + pdfs.length ? `<span>${icon('book', 14)} ${imageDirs.length + pdfs.length} 份资料</span>` : ''}
        </div>
        <div class="ch-actions">
          ${startLesson ? `<a class="btn btn-primary" href="#/lesson/${id}/${startLesson.no}">${icon('play', 16)} ${last ? '继续学习' : '开始学习'}</a>` : ''}
          ${pan ? `<a class="btn btn-ghost" href="${esc(pan.url)}" target="_blank" rel="noopener">${icon('external', 15)} 网盘资源</a>` : ''}
          ${resources.length ? `<a class="btn btn-ghost" href="#resources-${id}">${icon('book', 15)} 课程资料</a>` : ''}
          <span class="ch-progress">已学 ${done} / ${total} · ${progress}%</span>
        </div>
        ${total ? `<div class="module-progress" style="margin-top:16px;max-width:420px"><i style="width:${progress}%;--m-color:${meta.accent}"></i></div>` : ''}
      </div>
    </div>
    <div class="container" style="padding:34px 0 70px">
      ${isGallery ? `<section class="lesson-section" style="margin-top:0">
        <h2>课程内容</h2>
        <p style="color:var(--muted);line-height:1.9">这门课程以图文资料为主（PDF 与逐页图片），点击下方资料即可在线阅读或浏览图片。</p>
      </section>` : `<div class="section-head" style="margin-bottom:18px"><div><div class="eyebrow">Course Map</div><h2 class="section-title" style="font-size:26px">课程目录</h2></div></div>${modulesHtml}`}
      ${resHtml}
      <div class="lesson-nav" style="margin-top:26px">
        <a href="#/courses"><span class="nl">${icon('arrow-left', 12)} 返回</span><span class="nt">课程中心</span></a>
        ${pan ? `<a class="next" href="${esc(pan.url)}" target="_blank" rel="noopener"><span class="nl">外部资源 ${icon('external', 12)}</span><span class="nt">${esc(meta.title)} · 网盘</span></a>` : '<span></span>'}
      </div>
    </div>`;
  },

  mount() {
    const list = document.querySelectorAll('.map-module');
    const toggle = (head) => {
      const mod = head.closest('.map-module');
      mod.classList.toggle('open');
      head.setAttribute('aria-expanded', String(mod.classList.contains('open')));
    };
    list.forEach(mod => {
      const head = mod.querySelector('.map-module-head');
      head.addEventListener('click', (e) => { if (!e.target.closest('a')) toggle(head); });
      head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(head); } });
    });
  }
};
