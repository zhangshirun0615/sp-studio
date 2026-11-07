import data from '../data.js';
import store from '../store.js';
import { esc, icon, fmtDur, pct } from '../ui.js';

function hours(sec) { return (sec / 3600).toFixed(1); }

function resLink(id, r) {
  const href = data.mediaUrl(id, r.path, r.rootIndex);
  const label = esc(r.label || r.name);
  const size = r.sizeMB ? `${r.sizeMB} MB` : '';
  return `<a class="res-item" href="${href}" target="_blank" rel="noopener">
    <span class="res-icon">${icon(r.kind === 'video' ? 'play' : 'book', 16)}</span>
    <span class="res-name">${label}</span>
    <span class="res-size">${size}</span>
    <span class="res-open">${icon('external', 14)}</span>
  </a>`;
}

function resImageLink(id, r) {
  const href = `#/gallery/${id}?dir=${encodeURIComponent(r.dir)}&root=${encodeURIComponent(r.rootIndex || 0)}`;
  return `<a class="res-item" href="${href}">
    <span class="res-icon">${icon('grid', 16)}</span>
    <span class="res-name">${esc(r.label || r.name)}</span>
    <span class="res-size">${r.count} 张 · ${r.totalMB} MB</span>
    <span class="res-open">${icon('arrow-right', 14)}</span>
  </a>`;
}

function resGroup(id, items) {
  return (items || []).map(r => r.kind === 'images' ? resImageLink(id, r) : resLink(id, r)).join('');
}

function chaptersHtml(id, chapters, meta) {
  if (!chapters || !chapters.length) return '';
  return `<section class="lesson-section" id="chapters-${id}">
    <h2>章节考核</h2>
    <p style="color:var(--muted);font-size:13px;line-height:1.8;margin-bottom:14px">按章节阅读教材并完成考核任务，章节题库可在「闯关练习」中作答。</p>
    <div class="chapter-grid">
      ${chapters.map(ch => `<article class="chapter-card">
        <h3>${esc(ch.title)}</h3>
        ${ch.goal ? `<p class="ch-goal">${esc(ch.goal)}</p>` : ''}
        ${(ch.lessons || []).length ? `<h5>本章要点</h5><ul>${ch.lessons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(ch.assessment || []).length ? `<h5>考核任务</h5><ul>${ch.assessment.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(ch.questions || []).length ? `<a class="btn btn-ghost btn-sm ch-quiz" href="#/quiz/${id}">${icon('bolt', 14)} 本章 ${ch.questions.length} 题闯关</a>` : ''}
      </article>`).join('')}
    </div>
  </section>`;
}

function outlineHtml(o, courseId) {
  if (!o) return '';
  const blocks = [];
  if (o.objectives && o.objectives.length) blocks.push(`<div class="outline-block"><h4>学习目标</h4><ul class="obj-list">${o.objectives.map((x, i) => `<li><span class="dot">${i + 1}</span><span>${esc(x)}</span></li>`).join('')}</ul></div>`);
  if (o.keypoints && o.keypoints.length) blocks.push(`<div class="outline-block"><h4>核心知识点</h4><div class="kp-grid">${o.keypoints.map((x, i) => `<div class="kp-item"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(x)}</span></div>`).join('')}</div></div>`);
  if (o.assessment && o.assessment.length) blocks.push(`<div class="outline-block"><h4>考查方式</h4><ul class="outline-list">${o.assessment.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`);
  const tasks = [];
  if (o.theoryTasks && o.theoryTasks.length) tasks.push(`<div class="task-card"><h4>理论任务</h4><ul>${o.theoryTasks.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`);
  if (o.practiceTasks && o.practiceTasks.length) tasks.push(`<div class="task-card"><h4>实操任务</h4><ul>${o.practiceTasks.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`);
  if (tasks.length) blocks.push(`<div class="outline-tasks">${tasks.join('')}</div>`);
  if (!blocks.length) return '';
  return `<section class="lesson-section outline-section" id="outline-${courseId}">
    <h2>课程体系</h2>
    <div class="outline-grid">${blocks.join('')}</div>
  </section>`;
}

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
    const isGallery = meta.type === 'gallery' || (d.modules || []).every(m => !(m.lessons || []).length);
    const lessons = await data.lessonsOf(id);
    const done = store.doneCountIn(id);
    const total = lessons.length;
    const progress = total ? pct(done, total) : 0;
    const lastKey = store.lastIn(id);
    const last = lastKey ? lessons.find(l => l.key === lastKey) : null;
    const startLesson = last || lessons[0] || null;
    const resources = d.resources || [];
    const sections = resources.filter(r => r && r.section);
    const flatRes = resources.filter(r => r && !r.section);
    const pan = (meta.pan && meta.pan.url) ? meta.pan : null;
    const isMirror = /\.github\.io$/i.test(location.hostname);
    const outline = d.outline || meta.outline || null;
    const resCount = flatRes.length + sections.reduce((a, s) => a + (s.items || []).length, 0);

    const modulesHtml = (d.modules || []).map((m, idx) => {
      const ls = m.lessons || [];
      if (!ls.length) return '';
      const mDone = ls.filter(l => store.isDoneIn(id, String(l.no))).length;
      const mp = pct(mDone, ls.length);
      const open = idx === 0 || (last && ls.some(l => String(l.no) === lastKey));
      return `<section class="map-module ${open ? 'open' : ''}" data-module="${esc(m.id)}">
        <div class="map-module-head" role="button" tabindex="0" aria-expanded="${open}">
          <span class="mm-index" style="--m-color:${meta.accent}">${String(m.index).padStart(2, '0')}</span>
          <div><h3>${esc(m.title)}</h3><div class="mm-sub">${ls.length} 节 · ${Math.round(ls.reduce((s, l) => s + (l.durationSec || 0), 0) / 60)} 分钟${m.goal ? ' · ' + esc(m.goal) : ''}</div></div>
          <div class="mm-right"><span class="tag">${mp}%</span><span class="chev">${icon('chevron-down', 18)}</span></div>
        </div>
        <div class="map-module-body">
          <div class="module-progress" style="margin-bottom:12px"><i style="width:${mp}%;--m-color:${meta.accent}"></i></div>
          ${m.keypoints && m.keypoints.length ? `<div class="module-kps">${m.keypoints.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
          ${ls.map(l => {
            const isDone = store.isDoneIn(id, String(l.no));
            return `<a class="lesson-row ${isDone ? 'done' : ''}" href="#/lesson/${id}/${l.no}">
              <span class="l-no">${String(l.no).padStart(2, '0')}</span>
              <span class="l-title">${esc(l.title)}</span>
              <span class="l-dur">${l.durationSec ? fmtDur(l.durationSec) : (l.sizeMB ? Math.round(l.sizeMB) + ' MB' : '')}</span>
              <span class="l-state"><span class="check-dot">${isDone ? icon('check', 11) : ''}</span></span>
            </a>`;
          }).join('')}
          ${(m.theory || m.practice) ? `<div class="module-tasks">${m.theory ? `<span><b>理论</b>${esc(m.theory)}</span>` : ''}${m.practice ? `<span><b>实操</b>${esc(m.practice)}</span>` : ''}</div>` : ''}
        </div>
      </section>`;
    }).join('');

    const resHtml = (flatRes.length || sections.length) ? `<section class="lesson-section" id="resources-${id}">
      <h2>课程资料</h2>
      ${isMirror ? '<p style="color:var(--muted);font-size:12.5px;margin-bottom:10px">在线镜像不包含本地视频与图片资料，完整资料请在运行启动器的电脑上查看。</p>' : ''}
      ${sections.length ? sections.map(s => `<div class="res-section"><h4>${esc(s.section)}</h4><div class="resource-list">${resGroup(id, s.items || [])}</div></div>`).join('') : ''}
      ${flatRes.length ? `<div class="resource-list">${resGroup(id, flatRes)}</div>` : ''}
    </section>` : '';

    return `<div class="course-hero" style="--accent:${meta.accent || '#ff8a3d'}">
      ${meta.cover ? `<div class="ch-bg" style="background-image:url('${esc(meta.cover)}')"></div>` : ''}
      <div class="container ch-inner">
        <div class="breadcrumb" style="margin:0 0 14px">
          <a href="#/">首页</a> ${icon('chevron-right', 12)} <a href="#/courses">课程中心</a> ${icon('chevron-right', 12)} <span>${esc(meta.title)}</span>
        </div>
        <div class="ch-badges">
          <span class="tag copper">${esc(meta.category)}</span>
          <span class="tag">${meta.type === 'bilibili' ? 'B 站课程' : meta.type === 'gallery' ? '图文资料' : meta.type === 'external' ? '外部课程' : '视频课程'}</span>
          ${(meta.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
        <h1>${esc(meta.title)}</h1>
        <p class="ch-sub">${esc(meta.subtitle || '')}</p>
        <p class="ch-desc">${esc(meta.description || '')}</p>
        <div class="ch-stats">
          ${total ? `<span>${icon('play', 14)} ${total} 课时</span>` : ''}
          <span>${icon('clock', 14)} ${hours(meta.durationSec || 0)} 小时</span>
          ${meta.hasQuiz ? `<span>${icon('bolt', 14)} 配套闯关练习</span>` : ''}
          ${resCount ? `<span>${icon('book', 14)} ${resCount} 份资料</span>` : ''}
        </div>
        <div class="ch-actions">
          ${startLesson ? `<a class="btn btn-primary" href="#/lesson/${id}/${startLesson.no}">${icon('play', 16)} ${last ? '继续学习' : '开始学习'}</a>` : ''}
          ${pan ? `<a class="btn btn-ghost" href="${esc(pan.url)}" target="_blank" rel="noopener">${icon('external', 15)} 网盘资源</a>` : ''}
          ${meta.type === 'external' && meta.url ? `<a class="btn btn-primary" href="${esc(meta.url)}" target="_blank" rel="noopener">${icon('external', 15)} 打开课程</a>` : ''}
          ${resources.length ? `<a class="btn btn-ghost" href="#resources-${id}">${icon('book', 15)} 课程资料</a>` : ''}
          ${meta.hasQuiz ? `<a class="btn btn-ghost" href="#/quiz/${id}">${icon('bolt', 15)} 闯关练习</a>` : ''}
          <a class="btn btn-ghost" href="#/graph/${id}">${icon('target', 15)} 知识图谱</a>
          ${total ? `<span class="ch-progress">已学 ${done} / ${total} · ${progress}%</span>` : ''}
        </div>
        ${total ? `<div class="module-progress" style="margin-top:16px;max-width:420px"><i style="width:${progress}%;--m-color:${meta.accent}"></i></div>` : ''}
      </div>
    </div>
    <div class="container" style="padding:34px 0 70px">
      ${outlineHtml(outline, id)}
      ${isGallery ? `<section class="lesson-section" style="margin-top:0">
        <h2>课程内容</h2>
        <p style="color:var(--muted);line-height:1.9">这门课程以图文教材为主，点击下方资料在线阅读，或进入图片资料逐页浏览。</p>
      </section>` : `<div class="section-head" style="margin-bottom:18px"><div><div class="eyebrow">课程目录</div><h2 class="section-title" style="font-size:26px">课程目录</h2></div></div>${modulesHtml}`}
      ${chaptersHtml(id, d.chapters, meta)}
      ${resHtml}
      <div class="lesson-nav" style="margin-top:26px">
        <a href="#/courses"><span class="nl">${icon('arrow-left', 12)} 返回</span><span class="nt">课程中心</span></a>
        ${pan ? `<a class="next" href="${esc(pan.url)}" target="_blank" rel="noopener"><span class="nl">外部资源 ${icon('external', 12)}</span><span class="nt">${esc(meta.title)} · 网盘</span></a>` : '<span></span>'}
      </div>
    </div>`;
  },

  mount() {
    document.querySelectorAll('.map-module').forEach(mod => {
      const head = mod.querySelector('.map-module-head');
      const toggle = () => {
        mod.classList.toggle('open');
        head.setAttribute('aria-expanded', String(mod.classList.contains('open')));
      };
      head.addEventListener('click', (e) => { if (!e.target.closest('a')) toggle(); });
      head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  }
};
