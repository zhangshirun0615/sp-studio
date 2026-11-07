import data from '../data.js';
import { esc, icon, copyText, toast } from '../ui.js';

let cache = null;

function renderTools(list, cats) {
  return list.map(t => {
    const cat = cats.find(c => c.id === t.cat) || { name: '工具' };
    const ref = (t.lessonRefs || [])[0];
    return `<article class="card tool-card reveal" data-cat="${t.cat}">
      <div class="t-head">
        <span class="t-icon">${icon('sparkles', 18)}</span>
        <div>
          <h3>${esc(t.title)}</h3>
          <span style="font-size:11.5px;color:var(--copper-2);letter-spacing:.06em">${esc(cat.name)}</span>
        </div>
      </div>
      <p class="t-desc">${esc(t.desc)}</p>
      <div class="prompt-box">${esc(t.prompt)}</div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" data-copy="${esc(t.id)}">${icon('copy', 14)} 复制提示词</button>
        ${ref ? `<a class="btn btn-ghost btn-sm" href="#/lesson/${ref}">相关课程</a>` : ''}
        <span class="tag">${(t.tags || []).slice(0, 1).map(esc).join('')}</span>
      </div>
    </article>`;
  }).join('');
}

export default {
  async preload() { cache = await data.toolbox(); },

  async render() {
    const tb = cache || await data.toolbox();
    const cats = tb.categories || [];
    const filters = [{ id: 'all', name: '全部' }].concat(cats).map((c, i) =>
      `<button class="chip ${i === 0 ? 'active' : ''}" data-filter="${c.id}">${c.id === 'all' ? '' : icon(c.icon || 'box', 13)} ${esc(c.name)} <span style="opacity:.6">${c.id === 'all' ? tb.tools.length : tb.tools.filter(t => t.cat === c.id).length}</span></button>`
    ).join('');

    return `<div class="container">
  <div class="page-head">
    <div class="eyebrow">AIGC 工具箱</div>
    <h1>AIGC 创作工具箱</h1>
    <p class="lead">把 AI 变成你的材质助手：生成参考图、拆解 PBR 参数、规划 UV 策略、排查报错、写作品文案。每条提示词都可以直接复制到豆包、即梦、DeepSeek、ChatGPT 等工具里使用。</p>
  </div>
  <div class="tool-filters" id="toolFilters">${filters}</div>
  <div class="tool-grid" id="toolGrid">${renderTools(tb.tools, cats)}</div>
  <p style="color:var(--muted);font-size:12px;margin-top:22px">提示词中的【】内容请按你的项目替换；生成结果仍需你自己判断，AI 不替代动手练习。</p>
</div>`;
  },

  mount() {
    const grid = document.getElementById('toolGrid');
    const filters = document.getElementById('toolFilters');
    const tb = cache;
    const cats = tb.categories || [];

    const apply = (catId) => {
      const items = catId === 'all' ? tb.tools : tb.tools.filter(t => t.cat === catId);
      grid.innerHTML = renderTools(items, cats);
      grid.querySelectorAll('.reveal').forEach(e => e.classList.add('in'));
    };

    filters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      filters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      apply(btn.dataset.filter);
    });

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy]');
      if (!btn) return;
      const tool = tb.tools.find(t => t.id === btn.dataset.copy);
      if (tool) copyText(tool.prompt, '提示词已复制，去 AI 工具里粘贴吧');
    });
    grid.querySelectorAll('.reveal').forEach(e => e.classList.add('in'));
  }
};
