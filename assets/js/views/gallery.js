import data from '../data.js';
import { esc, icon } from '../ui.js';

export default {
  async render(params) {
    const id = params.id;
    const c = await data.courseById(id);
    if (!c) return `<div class="container" style="padding:80px 24px"><div class="card">课程不存在</div></div>`;
    const dir = (params.query && params.query.dir) || '';
    const groups = (c.data.resources || []).filter(r => r.kind === 'images');
    const group = groups.find(g => g.dir === dir);
    const meta = c.meta;
    return `<div class="container" style="padding:34px 0 70px">
      <div class="breadcrumb">
        <a href="#/courses">课程中心</a> ${icon('chevron-right', 12)}
        <a href="#/course/${id}">${esc(meta.title)}</a> ${icon('chevron-right', 12)}
        <span>${esc(group ? group.name : '图片资料')}</span>
      </div>
      <div class="section-head" style="margin-bottom:18px">
        <div>
          <div class="eyebrow">Gallery</div>
          <h1 style="font-size:clamp(24px,3vw,34px)">${esc(group ? group.name : '图片资料')}</h1>
          <p class="section-sub">${group ? `${group.count} 张图片 · 共 ${group.totalMB} MB · 点击图片查看大图` : '选择要浏览的图片资料'}</p>
        </div>
      </div>
      ${!group ? `<div class="gallery-groups">${groups.map(g => `<a class="res-item" href="#/gallery/${id}?dir=${encodeURIComponent(g.dir)}">
          <span class="res-icon">${icon('grid', 16)}</span><span class="res-name">${esc(g.name)}</span><span class="res-size">${g.count} 张</span><span class="res-open">${icon('arrow-right', 14)}</span></a>`).join('')}</div>`
        : `<div class="gallery-grid">${(group.files || []).map(f => `<a class="gallery-item" href="${data.mediaUrl(id, f)}" target="_blank" rel="noopener">
            <img src="${data.mediaUrl(id, f)}" alt="${esc(f.split('/').pop())}" loading="lazy">
            <span>${esc(f.split('/').pop())}</span>
          </a>`).join('')}</div>`}
      <div class="lesson-nav" style="margin-top:26px">
        <a href="#/course/${id}"><span class="nl">${icon('arrow-left', 12)} 返回</span><span class="nt">${esc(meta.title)}</span></a>
        <span></span>
      </div>
    </div>`;
  }
};
