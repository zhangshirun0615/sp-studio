import data from '../data.js';
import { esc, icon } from '../ui.js';

function flatten(resources) {
  const list = [];
  (resources || []).forEach(r => {
    if (r && r.section) (r.items || []).forEach(x => list.push(x));
    else if (r) list.push(r);
  });
  return list;
}

export default {
  async render(params) {
    const id = params.id;
    const c = await data.courseById(id);
    if (!c) return `<div class="container" style="padding:80px 24px"><div class="card">课程不存在</div></div>`;
    const meta = c.meta;
    const dir = (params.query && params.query.dir) || '';
    const root = params.query && params.query.root != null ? String(params.query.root) : '';
    const isMirror = /\.github\.io$/i.test(location.hostname);
    const all = flatten(c.data.resources);
    const groups = all.filter(r => r.kind === 'images');
    let group = groups.find(g => g.dir === dir && String(g.rootIndex || 0) === (root || '0'))
      || groups.find(g => g.dir === dir)
      || null;
    const title = group ? (group.label || group.name) : '图片资料';
    return `<div class="container" style="padding:34px 0 70px">
      <div class="breadcrumb">
        <a href="#/courses">课程中心</a> ${icon('chevron-right', 12)}
        <a href="#/course/${id}">${esc(meta.title)}</a> ${icon('chevron-right', 12)}
        <span>${esc(title)}</span>
      </div>
      <div class="section-head" style="margin-bottom:18px">
        <div>
          <div class="eyebrow">图片资料</div>
          <h1 style="font-size:clamp(24px,3vw,34px)">${esc(title)}</h1>
          <p class="section-sub">${group ? `${group.count} 张图片 · 共 ${group.totalMB} MB · 点击图片查看大图` : '选择要浏览的图片资料'}</p>
        </div>
      </div>
      ${isMirror ? '<div style="padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:rgba(255,191,94,.06);color:#ffe0b0;font-size:13px;margin-bottom:14px">在线镜像只同步课程目录；完整图片资料请在运行「启动学习平台」的电脑上访问。</div>' : ''}
      ${!group ? `<div class="gallery-groups">${groups.map(g => `<a class="res-item" href="#/gallery/${id}?dir=${encodeURIComponent(g.dir)}&root=${encodeURIComponent(g.rootIndex || 0)}">
          <span class="res-icon">${icon('grid', 16)}</span>
          <span class="res-name">${esc(g.label || g.name)}</span>
          <span class="res-size">${g.count} 张</span>
          <span class="res-open">${icon('arrow-right', 14)}</span>
        </a>`).join('')}</div>`
        : `<div class="gallery-grid">${(group.files || []).map(f => `<a class="gallery-item" href="${data.mediaUrl(id, f, group.rootIndex)}" target="_blank" rel="noopener">
            <img src="${data.mediaUrl(id, f, group.rootIndex)}" alt="${esc(f.split('/').pop())}" loading="lazy">
            <span>${esc(f.split('/').pop())}</span>
          </a>`).join('')}</div>`}
      <div class="lesson-nav" style="margin-top:26px">
        <a href="#/course/${id}"><span class="nl">${icon('arrow-left', 12)} 返回</span><span class="nt">${esc(meta.title)}</span></a>
        <span></span>
      </div>
    </div>`;
  }
};
