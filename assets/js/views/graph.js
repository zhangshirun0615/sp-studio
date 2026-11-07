import data from '../data.js';
import { esc, icon } from '../ui.js';

const PALETTE = ['#ff8a3d', '#ffd166', '#7ee0c3', '#6bc5ff', '#b3a1ff', '#ff9ec7',
  '#ffb347', '#7ee0c3', '#8fd6a8', '#e8b7ff', '#ffb27a', '#9ad6ff'];

export default {
  async preload(params) {
    const c = await data.courseById(params.id);
    this._course = c;
  },

  async render(params) {
    const c = await data.courseById(params.id);
    if (!c) return `<div class="container" style="padding:80px 24px"><div class="card">课程不存在</div></div>`;
    const meta = c.meta;
    const g = c.data.graph;
    if (!g || !g.nodes || g.nodes.length < 2) {
      return `<div class="container" style="padding:80px 24px"><div class="card" style="text-align:center;padding:46px">
        <h2>知识图谱生成中</h2><p style="color:var(--muted);margin:10px 0 20px">本课程的知识点还在整理，稍后刷新即可查看。</p>
        <a class="btn btn-primary" href="#/course/${params.id}">返回课程</a></div></div>`;
    }
    const concepts = g.nodes.filter(n => n.type === 'concept' || n.type === 'chapter').length;
    const modules = g.nodes.filter(n => n.type === 'module' || n.type === 'chapter').length;
    return `<div class="container" style="padding:30px 0 60px">
      <div class="breadcrumb">
        <a href="#/courses">课程中心</a> ${icon('chevron-right', 12)}
        <a href="#/course/${meta.id}">${esc(meta.title)}</a> ${icon('chevron-right', 12)}
        <span>知识图谱</span>
      </div>
      <div class="section-head" style="margin-bottom:16px">
        <div>
          <div class="eyebrow">知识图谱</div>
          <h1 style="font-size:clamp(24px,3vw,34px)">${esc(meta.title)} · 知识图谱</h1>
          <p class="section-sub">${modules} 个章节 · ${concepts} 个知识节点 · 拖拽/点击查看关系，双击画布重置视图</p>
        </div>
        <a class="btn btn-ghost btn-sm" href="#/quiz/${meta.id}">${icon('bolt', 15)} 去闯关练习</a>
      </div>
      <div class="graph-wrap">
        <canvas id="kgCanvas" aria-label="课程知识图谱"></canvas>
        <div class="graph-legend">
          <span><i style="background:#ff8a3d"></i>课程</span>
          <span><i style="background:#6bc5ff"></i>章节 / 模块</span>
          <span><i style="background:#7ee0c3"></i>知识点</span>
          <span class="graph-hint">滚轮缩放 · 拖拽画布平移 · 点击节点高亮</span>
        </div>
      </div>
    </div>`;
  },

  mount(params) {
    const canvas = document.getElementById('kgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const wrap = canvas.parentElement;
    const graph = this._course && this._course.data.graph;
    if (!graph) return;

    const nodes = graph.nodes.map((n, i) => ({
      ...n,
      x: Math.cos(i * 2.399) * 200 + (Math.random() - 0.5) * 40,
      y: Math.sin(i * 2.399) * 200 + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0,
      r: n.type === 'course' ? 16 : n.type === 'module' || n.type === 'chapter' ? 10 : 5
    }));
    const index = new Map(nodes.map(n => [n.id, n]));
    const links = graph.links.map(l => ({ s: index.get(l.source), t: index.get(l.target) }))
      .filter(l => l.s && l.t);

    const adj = new Map();
    links.forEach(l => {
      if (!adj.has(l.s.id)) adj.set(l.s.id, new Set());
      if (!adj.has(l.t.id)) adj.set(l.t.id, new Set());
      adj.get(l.s.id).add(l.t.id);
      adj.get(l.t.id).add(l.s.id);
    });

    let view = { scale: 1, x: 0, y: 0 };
    let hover = null;
    let selected = null;
    let dragging = null;
    let panning = null;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const w = wrap.clientWidth || 900;
      const h = Math.max(520, Math.min(720, Math.round(w * 0.62)));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      graphW = w; graphH = h;
    }
    let graphW = 900, graphH = 600;
    resize();

    function toWorld(mx, my) {
      return { x: (mx - graphW / 2 - view.x) / view.scale, y: (my - graphH / 2 - view.y) / view.scale };
    }

    function fit() {
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      nodes.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
      const w = Math.max(1, maxX - minX + 120), h = Math.max(1, maxY - minY + 120);
      view.scale = Math.min(graphW / w, graphH / h, 1.6);
      view.x = -((minX + maxX) / 2) * view.scale;
      view.y = -((minY + maxY) / 2) * view.scale;
    }

    function tick(alpha) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
          if (d2 > 160000) continue;
          const f = Math.min(1600 / d2, 12) * alpha;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      links.forEach(l => {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const target = l.s.type === 'course' || l.t.type === 'course' ? 150 : 95;
        const f = (d - target) * 0.012 * alpha;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        l.s.vx += fx; l.s.vy += fy;
        l.t.vx -= fx; l.t.vy -= fy;
      });
      nodes.forEach(n => {
        n.vx += -n.x * 0.0016 * alpha;
        n.vy += -n.y * 0.0016 * alpha;
        const damp = n.type === 'concept' ? 0.86 : 0.9;
        n.vx *= damp; n.vy *= damp;
        n.x += n.vx * 0.6; n.y += n.vy * 0.6;
      });
    }

    function draw() {
      ctx.clearRect(0, 0, graphW, graphH);
      // 背景网格
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.035)';
      ctx.lineWidth = 1;
      for (let x = 0; x < graphW; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, graphH); ctx.stroke(); }
      for (let y = 0; y < graphH; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(graphW, y); ctx.stroke(); }
      ctx.restore();

      ctx.save();
      ctx.translate(graphW / 2 + view.x, graphH / 2 + view.y);
      ctx.scale(view.scale, view.scale);

      const focus = selected || hover;
      const neighbors = focus && adj.has(focus.id) ? adj.get(focus.id) : null;

      links.forEach(l => {
        const active = focus && (l.s.id === focus.id || l.t.id === focus.id);
        const dim = focus && !active;
        ctx.strokeStyle = active ? 'rgba(255,138,61,.75)' : (dim ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.14)');
        ctx.lineWidth = active ? 1.6 : 0.8;
        ctx.beginPath();
        ctx.moveTo(l.s.x, l.s.y);
        ctx.lineTo(l.t.x, l.t.y);
        ctx.stroke();
      });

      nodes.forEach(n => {
        const isFocus = focus && (n.id === focus.id || (neighbors && neighbors.has(n.id)));
        const dim = focus && !isFocus;
        const color = n.type === 'course' ? '#ff8a3d' : (n.type === 'module' || n.type === 'chapter')
          ? PALETTE[(n.group || 1) % PALETTE.length] : '#7ee0c3';
        ctx.globalAlpha = dim ? 0.25 : 1;
        if (n.type === 'concept') {
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + (isFocus ? 3 : 0), 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.4; ctx.stroke();
        }
        if (n.type === 'course' || n.type === 'module' || n.type === 'chapter') {
          ctx.globalAlpha = dim ? 0.3 : 1;
          ctx.fillStyle = 'rgba(245,240,232,.92)';
          ctx.font = '600 11px "Noto Sans SC", system-ui, sans-serif';
          ctx.textAlign = 'center';
          const label = n.label.length > 16 ? n.label.slice(0, 15) + '…' : n.label;
          ctx.fillText(label, n.x, n.y - n.r - 6);
        }
        ctx.globalAlpha = 1;
      });
      ctx.restore();
    }

    function hitTest(mx, my) {
      const p = toWorld(mx, my);
      let best = null, bestD = 14 / view.scale + 6;
      nodes.forEach(n => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < Math.max(bestD, n.r + 6)) { best = n; bestD = d; }
      });
      return best;
    }

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { mx: e.clientX - r.left, my: e.clientY - r.top };
    }

    canvas.addEventListener('mousemove', (e) => {
      const { mx, my } = pos(e);
      if (panning) {
        view.x = panning.vx + (mx - panning.mx);
        view.y = panning.vy + (my - panning.my);
        draw();
        return;
      }
      if (dragging) {
        const p = toWorld(mx, my);
        dragging.x = p.x; dragging.y = p.y;
        dragging.vx = 0; dragging.vy = 0;
        for (let i = 0; i < 8; i++) tick(0.6);
        draw();
        return;
      }
      const n = hitTest(mx, my);
      canvas.style.cursor = n ? 'pointer' : 'grab';
      if (n !== hover) { hover = n; draw(); }
    });

    canvas.addEventListener('mousedown', (e) => {
      const { mx, my } = pos(e);
      const n = hitTest(mx, my);
      if (n) dragging = n;
      else panning = { mx, my, vx: view.x, vy: view.y };
    });
    window.addEventListener('mouseup', () => {
      if (dragging) selected = dragging;
      dragging = null;
      panning = null;
      draw();
    });
    canvas.addEventListener('mouseleave', () => { hover = null; draw(); });
    canvas.addEventListener('click', (e) => {
      const { mx, my } = pos(e);
      const n = hitTest(mx, my);
      selected = n;
      draw();
    });
    canvas.addEventListener('dblclick', () => { selected = null; fit(); draw(); });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { mx, my } = pos(e);
      const before = toWorld(mx, my);
      view.scale = Math.max(0.25, Math.min(3, view.scale * (e.deltaY < 0 ? 1.12 : 0.9)));
      const after = toWorld(mx, my);
      view.x += (after.x - before.x) * view.scale;
      view.y += (after.y - before.y) * view.scale;
      draw();
    }, { passive: false });

    window.addEventListener('resize', () => { dpr = Math.min(window.devicePixelRatio || 1, 2); resize(); draw(); });

    // 初始布局
    for (let i = 0; i < 260; i++) tick(1 - i / 320);
    fit();
    draw();
  }
};
