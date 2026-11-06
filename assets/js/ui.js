/* UI 工具：转义、格式化、图标、Toast、滚动动画 */

export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function fmtDur(sec) {
  if (!sec && sec !== 0) return '--:--';
  const m = Math.round(sec / 60);
  return `${m} 分钟`;
}

export function fmtClock(sec) {
  const s = Math.round(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtNum(n) {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

const PATHS = {
  'arrow-right': '<path d="M5 12h14M13 5l7 7-7 7"/>',
  'arrow-left': '<path d="M19 12H5M11 19l-7-7 7-7"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="M2 12l10 5 10-5M2 17l10 5 10-5"/>',
  brush: '<path d="M18 3l3 3-9.5 9.5a3 3 0 0 1-1.5.8l-4 .8.8-4a3 3 0 0 1 .8-1.5z"/><path d="M9 15l-6 6"/>',
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  bolt: '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  lightbulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V17h5v-1.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bot: '<rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 4v4M8 14h.01M16 14h.01M9 18h6"/>',
  notes: '<path d="M4 3h12l4 4v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  star: '<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  fire: '<path d="M12 22c4 0 7-2.9 7-7 0-5-4-7-4-11-3 2-4 4-4 6-1-1-2-2-2-4-2 2-4 5-4 9 0 4.1 3 7 7 7z"/>',
  refresh2: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>'
};

export function icon(name, size = 18, cls = '') {
  const p = PATHS[name] || PATHS.info;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

let toastTimer = null;
export function toast(msg, type = '') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `${type === 'ok' ? icon('check', 16) : icon('info', 16)}<span>${esc(msg)}</span>`;
  stack.appendChild(el);
  clearTimeout(toastTimer);
  setTimeout(() => el.remove(), 2600);
}

export async function copyText(text, okMsg = '已复制到剪贴板') {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, 'ok');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(okMsg, 'ok'); } catch (err) { toast('复制失败，请手动选择'); }
    ta.remove();
  }
}

export function observeReveal() {
  const els = document.querySelectorAll('.reveal:not(.in)');
  if (!els.length) return;
  const staticMode = /[?&]static=1/.test(location.hash) || /[?&]static=1/.test(location.search);
  if (staticMode || !('IntersectionObserver' in window)) {
    els.forEach(e => e.classList.add('in'));
    return;
  }
  // 首屏内元素立即显示，避免等待观察器回调造成闪白
  const vh = window.innerHeight || 800;
  els.forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.top < vh - 30) e.classList.add('in');
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -30px 0px' });
  els.forEach(e => { if (!e.classList.contains('in')) io.observe(e); });
}

export function debounce(fn, wait = 200) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function levelClass(d) {
  if (d === '入门') return 'teal';
  if (d === '进阶') return 'gold';
  return 'violet';
}

export function setVarStyle(el, name, val) { el.style.setProperty(name, val); }

export function dayLabel(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
