import data from '../data.js';
import store from '../store.js';
import { esc, icon, fmtDur, levelClass, toast, debounce, copyText } from '../ui.js';

/* 视频来源解析：direct=直链播放，pan=网盘跳转，none=无可用来源 */
function resolveSource(videos, v) {
  const settings = store.getSettings();
  const mode = settings.videoSource || videos.sourceMode || 'auto';
  const isMirror = /\.github\.io$/i.test(location.hostname);
  const panCfg = videos.pan || {};
  let panUrl = v.pan || panCfg.url || '';
  const panPwd = (v.panPwd != null && v.panPwd !== '') ? v.panPwd : (panCfg.pwd || '');
  if (panUrl && panPwd && !/[?&]pwd=/.test(panUrl)) {
    panUrl += (panUrl.includes('?') ? '&' : '?') + 'pwd=' + encodeURIComponent(panPwd);
  }
  const directOk = !isMirror && !!v.src;
  let source = 'none';
  if (mode === 'pan') source = panUrl ? 'pan' : 'none';
  else if (mode === 'local') source = directOk ? 'direct' : (panUrl ? 'pan' : 'none');
  else source = directOk ? 'direct' : (panUrl ? 'pan' : 'none');
  return {
    mode,
    source,
    directSrc: directOk ? v.src : '',
    poster: v.poster || '',
    panUrl,
    panPwd,
    panLabel: panCfg.label || '百度网盘',
    panNote: panCfg.note || ''
  };
}

function panPlayerHtml(lesson, s) {
  const fileName = lesson.file || ('第' + lesson.no + '课.mp4');
  return `<div class="pan-player" id="panPlayer">
    <span class="tag copper">${icon('info', 13)} ${esc(s.panLabel)} · 外部观看</span>
    <h3>本节视频在${esc(s.panLabel)}</h3>
    <p>点击下方按钮打开课程分享文件夹，按文件名找到本课视频播放。网盘观看需登录百度账号，倍速可能需要会员；平台内的学习目标、知识点、笔记和练习不受影响。</p>
    <div class="pan-file">${icon('play', 13)} <code>${esc(fileName)}</code></div>
    <div class="pan-actions">
      <a class="btn btn-primary" href="${esc(s.panUrl)}" target="_blank" rel="noopener">${icon('external', 15)} 打开${esc(s.panLabel)}</a>
      <button class="btn btn-ghost" id="copyPanLink">${icon('copy', 15)} 复制链接</button>
      ${s.panPwd ? `<span class="pan-pwd">提取码：<b>${esc(s.panPwd)}</b></span>` : ''}
    </div>
    <p class="pan-tip">${esc(s.panNote || '')}</p>
  </div>`;
}

function playerHtml(lesson, s) {
  if (s.source === 'direct') {
    return `<div class="player-wrap" id="playerWrap">
      <video id="lessonVideo" controls playsinline preload="metadata" ${s.poster ? `poster="${esc(s.poster)}"` : ''}>
        <source src="${esc(s.directSrc)}" type="video/mp4">
      </video>
    </div>`;
  }
  if (s.source === 'pan') {
    return `<div class="player-wrap pan-wrap" id="playerWrap">${panPlayerHtml(lesson, s)}</div>`;
  }
  const isMirror = /\.github\.io$/i.test(location.hostname);
  const localPath = `D:\\课程资源\\琅泽_老高课堂_SP教程(Substance Painter2019教程)中文版\\${lesson.file || ''}`;
  return `<div class="player-wrap" id="playerWrap"><div class="player-fallback show">
    <span class="tag gold">${icon('info', 13)} ${isMirror ? '镜像版 · 不含视频' : '暂无可用视频源'}</span>
    <h3>${isMirror ? '这是在线镜像页面' : '这一课还没有可播放的视频源'}</h3>
    <p>${isMirror
      ? '在线镜像只同步了课程、知识库、题库与练习。请在运行「启动学习平台」的电脑上打开，或用分享页里的地址访问，即可在线播放。'
      : '请确认 media/encoded 下的视频文件存在，或在 data/videos.json 中配置直链 / 网盘地址。'}</p>
    ${isMirror ? '' : `<code>${esc(localPath)}</code>`}
  </div></div>`;
}

function zoneHtml(lesson, s, mod, v, isDone) {
  const sources = [
    ['auto', '自动'],
    ['local', '直连'],
    ['pan', '网盘']
  ];
  return `${playerHtml(lesson, s)}
    <div class="video-actions">
      <button class="btn ${isDone ? 'btn-ghost' : 'btn-primary'} btn-sm" id="markDone">
        ${icon(isDone ? 'check' : 'target', 15)} ${isDone ? '已完成（点击取消）' : '标记为已学完'}
      </button>
      <a class="btn btn-ghost btn-sm" href="#/quiz/${mod.id}">${icon('bolt', 15)} 本模块闯关</a>
      <button class="btn btn-ghost btn-sm" id="askLesson">${icon('bot', 15)} 问 AI 助教</button>
      ${s.source === 'pan' ? `<a class="btn btn-ghost btn-sm" href="${esc(s.panUrl)}" target="_blank" rel="noopener">${icon('external', 14)} 网盘观看</a>` : ''}
      <div class="source-switch" title="切换视频来源">
        <span>视频源</span>
        ${sources.map(([k, label]) => `<button class="chip ${s.mode === k ? 'active' : ''}" data-source="${k}">${label}</button>`).join('')}
      </div>
      ${v.sizeBytes && s.source === 'direct' ? `<span class="video-size">视频 ${Math.round(v.sizeBytes / 1048576)} MB · 720P</span>` : ''}
    </div>`;
}

function bindZone(lesson, s, mod) {
  const no = lesson.no;
  const video = document.getElementById('lessonVideo');
  const markBtn = document.getElementById('markDone');

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
        <p>可能是网络波动或视频文件缺失。可以切换上方「视频源」改用网盘观看，或稍后刷新重试。</p>
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

  const copyBtn = document.getElementById('copyPanLink');
  if (copyBtn && s.panUrl) {
    copyBtn.addEventListener('click', () => copyText(s.panUrl, '网盘链接已复制'));
  }

  document.querySelectorAll('[data-source]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextMode = btn.dataset.source;
      store.setSetting('videoSource', nextMode);
      const videos = (ctx && ctx.videos) || data.__videosCache || {};
      const zone = document.getElementById('videoZone');
      if (!zone) return;
      const vv = (videos.videos || {})[no] || {};
      const newS = resolveSource(videos, vv);
      zone.innerHTML = zoneHtml(lesson, newS, mod, vv, store.isDone(no));
      ctx = { lesson, mod, v: vv, s: newS, videos, isDone: store.isDone(no) };
      bindZone(lesson, newS, mod);
      const names = { auto: '自动', local: '直连', pan: '网盘' };
      toast('视频源已切换为「' + names[nextMode] + '」');
    });
  });

  const askBtn = document.getElementById('askLesson');
  if (askBtn) {
    askBtn.addEventListener('click', () => {
      try {
        sessionStorage.setItem('spstudio.ask', `我想了解第${no}课的「${lesson.title}」，请帮我梳理重点。`);
      } catch (e) { }
      location.hash = '#/assistant';
    });
  }
}

/* 当前页面上下文（render 时写入，mount 与视频源切换复用） */
let ctx = null;

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
    data.__videosCache = videos;
    const v = (videos.videos || {})[lesson.no] || {};
    const course = await data.course();
    const mod = course.modules.find(m => m.id === lesson.moduleId);
    const idxInMod = mod.lessons.findIndex(l => l.no === lesson.no);
    const prev = lessons.find(l => l.no === lesson.no - 1) || null;
    const next = lessons.find(l => l.no === lesson.no + 1) || null;
    const isDone = store.isDone(lesson.no);
    const s = resolveSource(videos, v);
    ctx = { lesson, mod, v, s, videos, isDone };

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

      <div id="videoZone">${zoneHtml(lesson, s, mod, v, isDone)}</div>

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
          ${quickAsks.map((q) => `<button class="chip" data-ask="${esc(q)}">${icon('bot', 13)} ${esc(q.length > 22 ? q.slice(0, 22) + '…' : q)}</button>`).join('')}
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
    if (ctx && ctx.lesson && ctx.lesson.no === no) {
      bindZone(ctx.lesson, ctx.s, ctx.mod);
    }

    const noteArea = document.getElementById('noteArea');
    const noteState = document.getElementById('noteState');
    if (noteArea) {
      const save = debounce(() => {
        store.setNote(no, noteArea.value);
        if (noteState) noteState.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      }, 400);
      noteArea.addEventListener('input', save);
    }

    document.querySelectorAll('[data-ask]').forEach(btn => {
      btn.addEventListener('click', () => {
        try { sessionStorage.setItem('spstudio.ask', btn.dataset.ask); } catch (e) { }
        location.hash = '#/assistant';
      });
    });
  }
};
