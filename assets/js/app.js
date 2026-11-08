/* 应用入口：哈希路由 + 导航 + 全局交互 */
import home from './views/home.js';
import courses from './views/courses.js';
import course from './views/course.js';
import gallery from './views/gallery.js';
import graph from './views/graph.js';
import lessonView from './views/lesson.js';
import assistant from './views/assistant.js';
import toolbox from './views/toolbox.js';
import kb from './views/kb.js';
import quiz from './views/quiz.js';
import admin from './views/admin.js';
import student from './views/student.js';
import data from './data.js';
import { observeReveal, icon, esc, clearCourseTheme } from './ui.js';

const routes = [
  { re: /^\/?$/, view: home, nav: 'home' },
  { re: /^\/courses\/?$/, view: courses, nav: 'courses' },
  { re: /^\/map\/?$/, view: courses, nav: 'courses' },                 // 旧地址兼容
  { re: /^\/course\/([\w-]+)\/?$/, view: course, nav: 'courses', keys: ['id'] },
  { re: /^\/lesson\/([\w-]+)\/(\d+)\/?$/, view: lessonView, nav: 'courses', keys: ['courseId', 'no'] },
  { re: /^\/lesson\/(\d+)\/?$/, view: lessonView, nav: 'courses', keys: ['no'] },  // 旧地址 → SP
  { re: /^\/gallery\/([\w-]+)\/?$/, view: gallery, nav: 'courses', keys: ['id'] },
  { re: /^\/assistant\/?$/, view: assistant, nav: 'assistant' },
  { re: /^\/toolbox\/?$/, view: toolbox, nav: 'toolbox' },
  { re: /^\/kb\/?$/, view: kb, nav: 'kb' },
  { re: /^\/quiz\/?$/, view: quiz, nav: 'quiz' },
  { re: /^\/quiz\/([\w-]+)\/?$/, view: quiz, nav: 'quiz', keys: ['courseId'] },
  { re: /^\/graph\/([\w-]+)\/?$/, view: graph, nav: 'courses', keys: ['id'] },
  { re: /^\/admin\/?$/, view: admin, nav: 'admin' },
  { re: /^\/student\/?$/, view: student, nav: 'student' },
  // 教师端：不在导航中显示，按需加载（学生端不会请求这段代码）
  { re: /^\/teacher\/?$/, nav: '', loader: () => import('./views/teacher.js').then(m => m.default) }
];

const app = document.getElementById('app');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const siteNav = document.getElementById('siteNav');

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const qi = raw.indexOf('?');
  const path = qi >= 0 ? raw.slice(0, qi) : raw;
  const query = {};
  if (qi >= 0) {
    new URLSearchParams(raw.slice(qi + 1)).forEach((v, k) => { query[k] = v; });
  }
  return { path: path || '/', query };
}

function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = {};
      (r.keys || []).forEach((k, i) => { params[k] = m[i + 1]; });
      return { route: r, params };
    }
  }
  return null;
}

function setActiveNav(nav) {
  document.querySelectorAll('.nav-links a[data-nav]').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === nav);
  });
}

function closeMobileNav() {
  navLinks.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}

navToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});
navLinks.addEventListener('click', (e) => {
  if (e.target.closest('a')) closeMobileNav();
});
window.addEventListener('scroll', () => {
  if (siteNav) siteNav.classList.toggle('scrolled', window.scrollY > 12);
}, { passive: true });

const loadingHtml = `<div class="container" style="padding-top:60px;padding-bottom:80px">
  <div class="card" style="text-align:center;padding:60px 24px">
    <div class="typing" style="justify-content:center"><i></i><i></i><i></i></div>
    <p style="color:var(--muted);margin-top:14px">正在加载学习空间…</p>
  </div></div>`;

let renderToken = 0;

function syncTeacherReturn(path) {
  let el = document.getElementById('teacherReturn');
  let active = false;
  try { active = sessionStorage.getItem('spstudio.teacherActive') === '1'; } catch (e) { }
  if (active && path !== '/teacher') {
    if (!el) {
      el = document.createElement('a');
      el.id = 'teacherReturn';
      el.className = 'teacher-return';
      el.href = '#/teacher';
      el.innerHTML = '教师端';
      document.body.appendChild(el);
    }
  } else if (el) {
    el.remove();
  }
}

async function renderRoute() {
  clearCourseTheme();
  const token = ++renderToken;
  const { path, query } = parseHash();
  syncTeacherReturn(path);
  const m = match(path);
  const target = m ? m.route : routes[0];
  const params = m ? m.params : {};
  setActiveNav(target.nav);
  app.innerHTML = loadingHtml;
  window.scrollTo(0, 0);
  try {
    let view = target.view;
    if (!view && target.loader) view = await target.loader();
    if (token !== renderToken) return;
    const merged = Object.assign({ query }, params);
    if (view.preload) await view.preload(merged);
    const html = await view.render(merged);
    if (token !== renderToken) return;
    app.innerHTML = html;
    if (view.mount) await view.mount(merged);
    observeReveal();
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    app.innerHTML = `<div class="container" style="padding:80px 24px">
      <div class="card" style="text-align:center;padding:56px 24px">
        <h2 style="font-size:22px">页面加载遇到问题</h2>
        <p style="color:var(--muted);margin:12px 0 22px">${esc(err.message || '未知错误')}</p>
        <button class="btn btn-primary" id="reloadBtn">${icon('refresh', 16)} 重新加载</button>
      </div></div>`;
    const rb = document.getElementById('reloadBtn');
    if (rb) rb.addEventListener('click', () => location.reload());
  }
}

window.addEventListener('hashchange', renderRoute);

/* 在线镜像（GitHub Pages）提示条：视频走百度网盘 */
function maybeMirrorBanner() {
  if (!/\.github\.io$/i.test(location.hostname)) return;
  try { if (localStorage.getItem('spstudio.mirrorBannerDismissed') === '1') return; } catch (e) {}
  fetch('data/videos.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(v => {
      const urls = (v && v.pan && v.pan.url) ? v.pan.url : '';
      if (!urls || document.getElementById('mirrorBanner')) return;
      const bar = document.createElement('div');
      bar.className = 'mirror-banner';
      bar.id = 'mirrorBanner';
      bar.innerHTML = `<span>${icon('info', 14)} 在线镜像版：视频请通过「百度网盘」观看</span>
        <a href="${esc(urls)}" target="_blank" rel="noopener">打开网盘</a>
        <button class="mb-close" aria-label="关闭提示">${icon('close', 14)}</button>`;
      if (siteNav && siteNav.parentNode) siteNav.insertAdjacentElement('afterend', bar);
      bar.querySelector('.mb-close').addEventListener('click', () => {
        bar.remove();
        try { localStorage.setItem('spstudio.mirrorBannerDismissed', '1'); } catch (e) {}
      });
    })
    .catch(() => {});
}

async function syncBranding() {
  try {
    const cat = await data.catalog();
    const p = cat.platform || {};
    const title = p.title || '';
    if (!title) return;
    document.title = title + ' · 课程中心';
    const strong = document.querySelector('.brand-text strong');
    const em = document.querySelector('.brand-text em');
    const mark = document.querySelector('.footer-mark');
    if (strong) strong.textContent = title;
    if (em) em.textContent = p.subtitle || '课程学习平台';
    if (mark) mark.textContent = title;
  } catch (e) { /* 品牌同步失败不影响使用 */ }
}

function boot() {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
  syncBranding();
  maybeMirrorBanner();
  renderRoute();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
