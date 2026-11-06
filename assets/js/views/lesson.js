import data from '../data.js';
import store from '../store.js';
import { esc, icon, fmtDur, levelClass, toast, debounce } from '../ui.js';

export default {
  async render(params) {
    const no = Number(params.no);
    const lessons = await data.flatLessons();
    const lesson = lessons.find(l => l.no === no);
    if (!lesson) {
      return `<div class="container" style="padding:80px 24px"><div class="card" style="text-align:center;padding:50px">
        <h2>没有找到第 ${esc(params.no)} 课</h2>
        <p style="color:var(--muted);margin:10px 0 22px">课程编号可能不在本套教程范围内。</p>
        <a class="btn btn-primary" href="#/map">返回课程地图</a>
      </div></div>`;
    }
    const videos = await data.videos();
    const v = (videos.videos || {})[lesson.no] || {};
    const isMirror = /\.github\.io$/i.test(location.hostname);
    const course = await data.course();
    const mod = course.modules.find(m => m.id === lesson.moduleId);
    const idxInMod = mod.lessons.findIndex(l => l.no === lesson.no);
    const prev = lessons.find(l => l.no === lesson.no - 1) || null;
    const next = lessons.find(l => l.no === lesson.no + 1) || null;
    const isDone = store.isDone(lesson.no);

    const src = isMirror ? '' : (v.src || '');
    const poster = v.poster || '';
    const localPath = `D:\\课程资源\\琅泽_老高课堂_SP教程(Substance Painter2019教程)中文版\\${lesson.file || ''}`;

    const sideLessons = mod.lessons.map(l => `<a class="side-lesson ${l.no === lesson.no ? 'current' : ''}" href="#/lesson/${l.no}">
      <span class="sno">${String(l.no).padStart(2, '0')}</span>
      <span>${esc(l.title)}</span>
    </a>`).join('');

    const objectives = (lesson.objectives || []).map((o, i) => `<li><span class="dot">${i + 1}</span><span>${esc(o)}</span></li>`).join('');
    const keypoints = (lesson.keypoints || []).map((k, i) => `<div class="kp-item"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(k)}</span></div>`).join('');
    const tags = (lesson.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');

    const quickAsks = [
      `第${lesson.no}课「${lesson.title}」的核心要点是什么？`,
      `第${lesson.no}课里的操作容易出错的地方有哪些？`,
      `怎么练习「${lesson.title}」这一课的内容？`
    ];

    return `<div class="container">
  <div class="lesson-layout">
    <div>
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="#/">首页</a> ${icon('chevron-right', 12)}
        <a href="#/map">课程地图</a> ${icon('chevron-right', 12)}
        <a href="#/map">${esc(mod.title)}</a> ${icon('chevron-right', 12)}
        <span>第 ${lesson.no} 课</span>
      </nav>

      <div class="lesson-head">
        <h1>${esc(lesson.title)}</h1>
        <div class="lh-meta">
          <span class="tag copper">模块 ${String(mod.index).padStart(2, '0')} · ${esc(mod.title.split(' · ')[0])}</span>
          <span class="tag ${levelClass(lesson.difficulty)}">${esc(lesson.difficulty || '进阶')}</span>
          <span class="tag">${icon('clock', 12)} ${fmtDur(lesson.durationSec)}</span>
          <span class="tag">第 ${idxInMod + 1} / ${mod.lessons.length} 节</span>
          ${isDone ? `<span class="tag teal">${icon('check', 12)} 已完成</span>` : ''}
        </div>
      </div>

      <div class="player-wrap" id="playerWrap">
        ${src
          ? `<video id="lessonVideo" controls playsinline preload="metadata" ${poster ? `poster="${esc(poster)}"` : ''}>
               <source src="${esc(src)}" type="video/mp4">
             </video>`
          : `<div class="player-fallback show" id="fallback">
               <span class="tag gold">${icon('info', 13)} ${isMirror ? '镜像版 · 不含视频' : '视频未挂载'}</span>
               <h3>${isMirror ? '这是在线镜像页面，视频请用分享链接观看' : '本节视频尚未挂载到服务'}</h3>
               <p>${isMirror
                 ? '在线镜像只同步了课程、知识库、题库与练习，视频文件较大没有上传。请在运行「启动学习平台」的电脑上打开，或用分享页里的地址 / 二维码访问，即可在线播放。'
                 : '启动器会把本地视频目录接通，若仍无法播放，请确认 media/encoded 下的视频文件存在。'}</p>
               ${isMirror ? '' : `<code>${esc(localPath)}</code>`}
             </div>`}
      </div>

      <div class="video-actions">
        <button class="btn ${isDone ? 'btn-ghost' : 'btn-primary'} btn-sm" id="markDone">
          ${icon(isDone ? 'check' : 'target', 15)} ${isDone ? '已完成（点击取消）' : '标记为已学完'}
        </button>
        <a class="btn btn-ghost btn-sm" href="#/quiz/${mod.id}">${icon('bolt', 15)} 本模块闯关</a>
        <button class="btn btn-ghost btn-sm" id="askLesson">${icon('bot', 15)} 问 AI 助教</button>
        ${v.sizeBytes ? `<span style="margin-left:auto;font-size:12px;color:var(--muted)">视频 ${Math.round(v.sizeBytes / 1048576)} MB · 720P</span>` : ''}
      </div>

      <section class="lesson-section">
        <h2>本节要讲什么</h2>
        <p style="color:var(--text-2);line-height:1.85;font-size:14.5px">${esc(lesson.summary || '')}</p>
      </section>

      <section class="lesson-section">
        <h2>学习目标</h2>
        <ul class="obj-list">${objectives || '<li style="color:var(--muted)">暂无</li>'}</ul>
      </section>

      <section class="lesson-section">
        <h2>核心知识点</h2>
        <div class="kp-grid">${keypoints || '<div style="color:var(--muted)">暂无</div>'}</div>
      </section>

      ${lesson.practice ? `<section class="lesson-section">
        <h2>动手练一练</h2>
        <div class="practice-box">${esc(lesson.practice)}</div>
      </section>` : ''}

      <section class="lesson-section">
        <h2>我的笔记</h2>
        <div class="note-box">
          <textarea id="noteArea" placeholder="记下参数、快捷键、踩过的坑……笔记只会保存在本机浏览器。">${esc(store.getNote(lesson.no))}</textarea>
          <div class="note-hint"><span>自动保存 · 仅本机可见</span><span id="noteState"></span></div>
        </div>
      </section>

      <section class="lesson-section">
        <h2>用 AI 助教继续深挖</h2>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${quickAsks.map((q, i) => `<button class="chip" data-ask="${esc(q)}">${icon('bot', 13)} ${esc(q.length > 22 ? q.slice(0, 22) + '…' : q)}</button>`).join('')}
        </div>
      </section>

      <nav class="lesson-nav" aria-label="课时导航">
        ${prev ? `<a href="#/lesson/${prev.no}"><span class="nl">${icon('arrow-left', 12)} 上一课</span><span class="nt">${esc(prev.title)}</span></a>` : '<span></span>'}
        ${next ? `<a class="next" href="#/lesson/${next.no}"><span class="nl">下一课 ${icon('arrow-right', 12)}</span><span class="nt">${esc(next.title)}</span></a>` : '<span></span>'}
      </nav>
    </div>

    <aside class="lesson-side">
      <div class="card side-card">
        <h3>本模块进度</h3>
        <div style="display:flex;align-items:center;gap:14px">
          <div class="progress-ring" style="--p:${Math.round(mod.lessons.filter(l => store.isDone(l.no)).length / mod.lessons.length * 100)}"><b>${Math.round(mod.lessons.filter(l => store.isDone(l.no)).length / mod.lessons.length * 100)}%</b></div>
          <div style="font-size:13px;color:var(--muted)">${esc(mod.title)}<br>${mod.lessons.filter(l => store.isDone(l.no)).length} / ${mod.lessons.length} 节已学</div>
        </div>
      </div>
      <div class="card side-card">
        <h3>阶段目标</h3>
        <ul class="side-list">${(mod.goals || []).map(g => `<li>${icon('target', 14)}<span>${esc(g)}</span></li>`).join('') || '<li style="color:var(--muted)">暂无</li>'}</ul>
      </div>
      <div class="card side-card">
        <h3>本模块课时</h3>
        <div class="side-lessons">${sideLessons}</div>
      </div>
      <div class="card side-card">
        <h3>标签</h3>
        <div style="display:flex;flex-wrap:wrap;gap:7px">${tags || '<span style="color:var(--muted);font-size:13px">暂无</span>'}</div>
      </div>
    </aside>
  </div>
</div>`;
  },

  mount(params) {
    const no = Number(params.no);
    const video = document.getElementById('lessonVideo');
    const markBtn = document.getElementById('markDone');
    const noteArea = document.getElementById('noteArea');
    const noteState = document.getElementById('noteState');

    if (video) {
      store.setLast(no);
      video.addEventListener('ended', () => {
        store.complete(no);
        toast('本节已完成，进度已记录', 'ok');
        if (markBtn) {
          markBtn.className = 'btn btn-ghost btn-sm';
          markBtn.innerHTML = `${icon('check', 15)} 已完成（点击取消）`;
        }
      });
      video.addEventListener('error', () => {
        const wrap = document.getElementById('playerWrap');
        if (!wrap) return;
        wrap.innerHTML = `<div class="player-fallback show">
          <span class="tag gold">视频加载失败</span>
          <h3>暂时无法播放本节视频</h3>
          <p>可能是网络波动或视频仍在部署中。稍后刷新页面重试；也可以先阅读下方的学习目标与知识点。</p>
        </div>`;
      }, { once: true });
    } else {
      store.setLast(no);
    }

    if (markBtn) {
      markBtn.addEventListener('click', () => {
        if (store.isDone(no)) {
          store.uncomplete(no);
          markBtn.className = 'btn btn-primary btn-sm';
          markBtn.innerHTML = `${icon('target', 15)} 标记为已学完`;
          toast('已取消完成标记');
        } else {
          store.complete(no);
          markBtn.className = 'btn btn-ghost btn-sm';
          markBtn.innerHTML = `${icon('check', 15)} 已完成（点击取消）`;
          toast('本节已完成，进度已记录', 'ok');
        }
      });
    }

    if (noteArea) {
      const save = debounce(() => {
        store.setNote(no, noteArea.value);
        if (noteState) noteState.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      }, 400);
      noteArea.addEventListener('input', save);
    }

    document.querySelectorAll('[data-ask]').forEach(btn => {
      btn.addEventListener('click', () => {
        try { sessionStorage.setItem('spstudio.ask', btn.dataset.ask); } catch (e) {}
        location.hash = '#/assistant';
      });
    });

    const askBtn = document.getElementById('askLesson');
    if (askBtn) {
      askBtn.addEventListener('click', () => {
        try { sessionStorage.setItem('spstudio.ask', `我想了解第${no}课的「${document.querySelector('.lesson-head h1').textContent}」，请帮我梳理重点。`); } catch (e) {}
        location.hash = '#/assistant';
      });
    }
  }
};
