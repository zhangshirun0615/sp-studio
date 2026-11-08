import data from '../data.js';
import store from '../store.js';
import { esc, icon, fmtDur, levelClass, toast, debounce, copyText } from '../ui.js';

let ctx = null;
const isMirrorHost = () => /\.github\.io$/i.test(location.hostname);

function resolveSource(course, lesson) {
  const settings = store.getSettings();
  const mode = settings.videoSource || 'auto';
  const meta = course.meta;
  const isMirror = isMirrorHost();
  const panLinks = (meta.panLinks || []).filter(x => x && x.url);
  let panUrl = (meta.pan && meta.pan.url) ? meta.pan.url : (panLinks[0] ? panLinks[0].url : '');
  let panPwd = (meta.pan && meta.pan.pwd) || '';
  if (!panPwd && panLinks[0]) panPwd = panLinks[0].pwd || '';
  if (panUrl && panPwd && !/[?&]pwd=/.test(panUrl)) panUrl += (panUrl.includes('?') ? '&' : '?') + 'pwd=' + encodeURIComponent(panPwd);

  let directSrc = '';
  if (meta.type === 'sp' && ctx && ctx.spVideo && ctx.spVideo.src) directSrc = ctx.spVideo.src;
  if (meta.type === 'video' && lesson.file) directSrc = data.mediaUrl(meta.id, lesson.file, lesson.rootIndex);
  if (isMirror) directSrc = '';

  let source = 'none';
  if (meta.type === 'bilibili') source = 'bilibili';
  else if (mode === 'pan') source = panUrl ? 'pan' : (directSrc ? 'direct' : 'none');
  else if (mode === 'local') source = directSrc ? 'direct' : (panUrl ? 'pan' : 'none');
  else source = directSrc ? 'direct' : (panUrl ? 'pan' : 'none');

  return { mode, source, directSrc, panUrl, panPwd, panLinks, isMirror };
}

function bilibiliPlayer(lesson) {
  const embed = data.bilibiliEmbedUrl(lesson.bvid, lesson.page);
  const watch = 'https://www.bilibili.com/video/' + lesson.bvid + '?p=' + (lesson.page || 1);
  return `<div class="bili-wrap">
    <iframe src="${esc(embed)}" allowfullscreen="allowfullscreen" scrolling="no" frameborder="0" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"></iframe>
  </div>
  <div class="video-actions">
    <a class="btn btn-primary btn-sm" href="${esc(watch)}" target="_blank" rel="noopener">${icon('external', 15)} 在 B 站打开本课</a>
    <span class="video-size">B 站外链播放 · 清晰度取决于 B 站账号</span>
  </div>`;
}

function panPlayer(course, lesson, s) {
  return `<div class="pan-player" id="panPlayer">
    <span class="tag copper">${icon('info', 13)} 网盘 / 外部资源</span>
    <h3>本课视频在外部网盘</h3>
    <p>点击下方按钮打开课程资源，按文件名找到本课视频。网盘观看需登录对应账号，速度取决于网盘。</p>
    <div class="pan-file">${icon('play', 13)} <code>${esc(lesson.file ? lesson.file.split('/').pop() : lesson.title)}</code></div>
    <div class="pan-actions" style="flex-wrap:wrap">
      ${(s.panLinks && s.panLinks.length ? s.panLinks : [{ label: '打开网盘', url: s.panUrl, pwd: s.panPwd }]).map((l, i) => `<a class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}" href="${esc(l.url)}" target="_blank" rel="noopener">${icon('external', 15)} ${esc(l.label || '打开网盘')}${l.pwd ? '（提取码 ' + esc(l.pwd) + '）' : ''}</a>`).join('')}
      <button class="btn btn-ghost" id="copyPanLink">${icon('copy', 15)} 复制链接</button>
    </div>
    <p class="pan-tip">如果本机已运行「启动学习平台」，切换到「直连」可以直接内嵌播放本地视频。</p>
  </div>`;
}

function playerHtml(course, lesson, s) {
  if (s.source === 'bilibili') return `<div class="player-wrap bili-player" id="playerWrap">${bilibiliPlayer(lesson)}</div>`;
  if (s.source === 'direct') {
    const track = lesson.subtitle
      ? `<track kind="subtitles" src="${esc(data.mediaUrl(course.meta.id, lesson.subtitle.path, lesson.subtitle.rootIndex))}" srclang="zh" label="${esc(lesson.subtitle.label || '中英字幕')}" default>`
      : '';
    return `<div class="player-wrap" id="playerWrap"><video id="lessonVideo" controls playsinline preload="metadata" crossorigin="anonymous">
      <source src="${esc(s.directSrc)}" type="video/mp4">${track}</video></div>`;
  }
  if (s.source === 'pan') return `<div class="player-wrap pan-wrap" id="playerWrap">${panPlayer(course, lesson, s)}</div>`;
  if (s.isMirror) {
    return `<div class="player-wrap" id="playerWrap"><div class="player-fallback show">
      <span class="tag gold">${icon('info', 13)} 本地视频</span>
      <h3>本课视频在本地服务器上</h3>
      <p>这门课程的视频存放在教师电脑上。请在运行「启动学习平台」的电脑上打开，或用教师分享的局域网 / IPv6 地址访问，即可直接播放。</p>
      <p style="font-size:12px;color:var(--muted)">在线镜像只同步课程目录与资料，不含大体积视频。</p>
    </div></div>`;
  }
  return `<div class="player-wrap" id="playerWrap"><div class="player-fallback show">
    <span class="tag gold">${icon('info', 13)} 暂无可用视频源</span>
    <h3>这一课还没有可播放的视频</h3>
    <p>请在教师端「课程管理」中检查文件路径，或在课程详情页查看资料。</p>
  </div></div>`;
}

function zoneHtml(course, lesson, s, isDone) {
  const sources = [['auto', '自动'], ['local', '直连'], ['pan', '网盘']];
  const showSwitch = course.meta.type !== 'bilibili' && (s.panUrl || s.directSrc);
  return `${playerHtml(course, lesson, s)}
    <div class="video-actions">
      <button class="btn ${isDone ? 'btn-ghost' : 'btn-primary'} btn-sm" id="markDone">
        ${icon(isDone ? 'check' : 'target', 15)} ${isDone ? '已完成（点击取消）' : '标记为已学完'}
      </button>
      <a class="btn btn-ghost btn-sm" href="#/course/${course.meta.id}">${icon('map', 15)} 课程目录</a>
      ${course.meta.type === 'sp' ? `<a class="btn btn-ghost btn-sm" href="#/quiz">${icon('bolt', 15)} 闯关练习</a>` : ''}
      <button class="btn btn-ghost btn-sm" id="askLesson">${icon('bot', 15)} 问 AI 助教</button>
      ${showSwitch ? `<div class="source-switch" title="切换视频来源"><span>视频源</span>${sources.map(([k, label]) => `<button class="chip ${s.mode === k ? 'active' : ''}" data-source="${k}">${label}</button>`).join('')}</div>` : ''}
      ${lesson.sizeMB ? `<span class="video-size">${Math.round(lesson.sizeMB)} MB</span>` : ''}
    </div>`;
}

function bindZone(course, lesson, s) {
  const cid = course.meta.id;
  const key = String(lesson.no);
  const video = document.getElementById('lessonVideo');
  const markBtn = document.getElementById('markDone');

  store.setLastIn(cid, key);

  if (video) {
    video.addEventListener('ended', () => {
      store.markIn(cid, key);
      toast('本节已完成，进度已记录', 'ok');
      if (markBtn) { markBtn.className = 'btn btn-ghost btn-sm'; markBtn.innerHTML = `${icon('check', 15)} 已完成（点击取消）`; }
    });
    video.addEventListener('error', () => {
      const wrap = document.getElementById('playerWrap');
      if (!wrap) return;
      wrap.innerHTML = `<div class="player-fallback show">
        <span class="tag gold">视频加载失败</span>
        <h3>暂时无法播放本节视频</h3>
        <p>可能是本地服务未运行，或视频文件路径变化。请确认已双击「启动学习平台」，也可以切换视频源或使用网盘。</p>
      </div>`;
    }, { once: true });
  }

  if (markBtn) {
    markBtn.addEventListener('click', () => {
      if (store.isDoneIn(cid, key)) {
        store.unmarkIn(cid, key);
        markBtn.className = 'btn btn-primary btn-sm';
        markBtn.innerHTML = `${icon('target', 15)} 标记为已学完`;
        toast('已取消完成标记');
      } else {
        store.markIn(cid, key);
        markBtn.className = 'btn btn-ghost btn-sm';
        markBtn.innerHTML = `${icon('check', 15)} 已完成（点击取消）`;
        toast('本节已完成，进度已记录', 'ok');
      }
    });
  }

  const copyBtn = document.getElementById('copyPanLink');
  if (copyBtn && s.panUrl) copyBtn.addEventListener('click', () => copyText(s.panUrl, '链接已复制'));

  document.querySelectorAll('[data-source]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextMode = btn.dataset.source;
      store.setSetting('videoSource', nextMode);
      const zone = document.getElementById('videoZone');
      if (!zone || !ctx) return;
      const newS = resolveSource(course, lesson);
      zone.innerHTML = zoneHtml(course, lesson, newS, store.isDoneIn(cid, key));
      ctx.s = newS;
      bindZone(course, lesson, newS);
      toast('视频源已切换为「' + ({ auto: '自动', local: '直连', pan: '网盘' })[nextMode] + '」');
    });
  });

  const askBtn = document.getElementById('askLesson');
  if (askBtn) {
    askBtn.addEventListener('click', () => {
      const q = course.meta.type === 'sp'
        ? `我想了解第${lesson.no}课的「${lesson.title}」，请帮我梳理重点。`
        : `我在学《${course.meta.title}》里的「${lesson.title}」，请用通俗的方式讲讲这一课的核心概念和练习建议。`;
      try { sessionStorage.setItem('spstudio.ask', q); } catch (e) { }
      location.hash = '#/assistant';
    });
  }
}

export default {
  async render(params) {
    const cid = params.courseId || 'sp';
    const no = params.no;
    const course = await data.courseById(cid);
    if (!course) {
      return `<div class="container" style="padding:80px 24px"><div class="card" style="text-align:center;padding:50px">
        <h2>课程不存在</h2><a class="btn btn-primary" href="#/courses" style="margin-top:16px">返回课程中心</a></div></div>`;
    }
    const lessons = await data.lessonsOf(cid);
    const idx = lessons.findIndex(l => String(l.no) === String(no));
    const lesson = idx >= 0 ? lessons[idx] : null;
    if (!lesson) {
      return `<div class="container" style="padding:80px 24px"><div class="card" style="text-align:center;padding:50px">
        <h2>没有找到这一课</h2><p style="color:var(--muted);margin:10px 0 22px">课程目录可能已更新。</p>
        <a class="btn btn-primary" href="#/course/${cid}">返回课程目录</a></div></div>`;
    }
    const meta = course.meta;
    const d = course.data;
    const mod = (d.modules || []).find(m => m.id === lesson.moduleId) || { title: '', lessons };
    const prev = idx > 0 ? lessons[idx - 1] : null;
    const next = idx < lessons.length - 1 ? lessons[idx + 1] : null;
    const isSP = meta.type === 'sp';
    const isDone = store.isDoneIn(cid, String(lesson.no));
    const spVideo = isSP ? ((await data.videos()).videos || {})[lesson.no] || {} : {};
    ctx = { course, lesson, spVideo, s: null };

    const s = resolveSource(course, lesson);
    ctx.s = s;

    const sideLessons = (mod.lessons || []).map(l => `<a class="side-lesson ${String(l.no) === String(lesson.no) ? 'current' : ''}" href="#/lesson/${cid}/${l.no}">
      <span class="sno">${String(l.no).padStart(2, '0')}</span><span>${esc(l.title)}</span></a>`).join('');

    const objectives = (lesson.objectives || []).map((o, i) => `<li><span class="dot">${i + 1}</span><span>${esc(o)}</span></li>`).join('');
    const keypoints = (lesson.keypoints || []).map((k, i) => `<div class="kp-item"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(k)}</span></div>`).join('');
    const tags = (lesson.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const moduleDone = (mod.lessons || []).filter(l => store.isDoneIn(cid, String(l.no))).length;
    const modPct = mod.lessons && mod.lessons.length ? Math.round(moduleDone / mod.lessons.length * 100) : 0;
    const courseDone = store.doneCountIn(cid);
    const coursePct = lessons.length ? Math.round(courseDone / lessons.length * 100) : 0;
    const resources = (d.resources || []);
    const quickAsks = isSP ? [
      `第${lesson.no}课「${lesson.title}」的核心要点是什么？`,
      `第${lesson.no}课里的操作容易出错的地方有哪些？`,
      `怎么练习「${lesson.title}」这一课的内容？`
    ] : [
      `《${meta.title}》这门课的学习路线是什么？`,
      `「${lesson.title}」这一课的核心概念是什么？`,
      `学完这一课，我应该做哪些练习？`
    ];

    return `<div class="container">
  <div class="lesson-layout">
    <div>
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="#/">首页</a> ${icon('chevron-right', 12)}
        <a href="#/courses">课程中心</a> ${icon('chevron-right', 12)}
        <a href="#/course/${cid}">${esc(meta.title)}</a> ${icon('chevron-right', 12)}
        <span>第 ${lesson.no} 课</span>
      </nav>

      <div class="lesson-head">
        <h1>${esc(lesson.title)}</h1>
        <div class="lh-meta">
          <span class="tag copper">${esc(mod.title || meta.category)}</span>
          ${isSP && lesson.difficulty ? `<span class="tag ${levelClass(lesson.difficulty)}">${esc(lesson.difficulty)}</span>` : ''}
          ${lesson.durationSec ? `<span class="tag">${icon('clock', 12)} ${fmtDur(lesson.durationSec)}</span>` : ''}
          <span class="tag">第 ${lesson.no} / ${lessons.length} 节</span>
          ${lesson.subtitle ? `<span class="tag teal">${icon('book', 12)} 中英字幕</span>` : ''}
          ${isDone ? `<span class="tag teal">${icon('check', 12)} 已完成</span>` : ''}
        </div>
      </div>

      <div id="videoZone">${zoneHtml(course, lesson, s, isDone)}</div>

      ${isSP ? `
      <section class="lesson-section"><h2>本节要讲什么</h2>
        <p style="color:var(--text-2);line-height:1.85;font-size:14.5px">${esc(lesson.summary || '')}</p></section>
      <section class="lesson-section"><h2>学习目标</h2><ul class="obj-list">${objectives || '<li style="color:var(--muted)">暂无</li>'}</ul></section>
      <section class="lesson-section"><h2>核心知识点</h2><div class="kp-grid">${keypoints || '<div style="color:var(--muted)">暂无</div>'}</div></section>
      ${lesson.practice ? `<section class="lesson-section"><h2>动手练一练</h2><div class="practice-box">${esc(lesson.practice)}</div></section>` : ''}`
        : `<section class="lesson-section"><h2>本节知识点</h2>
        ${(lesson.keypoints || []).length ? `<div class="kp-grid">${keypoints}</div>` : `<div class="kp-inline">${(mod.keypoints || []).slice(0, 4).map(k => `<span class="chip">${esc(k)}</span>`).join('') || '<span style="color:var(--muted)">知识点整理中</span>'}</div>`}
      </section>
      <section class="lesson-section"><h2>课程信息</h2>
        <p style="color:var(--text-2);line-height:1.9">本课属于《${esc(meta.title)}》${esc(mod.title ? '· ' + mod.title : '')}。${esc(meta.description || '')}</p>
        ${resources.length ? `<p style="margin-top:10px"><a class="link-arrow" href="#/course/${cid}">查看课程资料（${resources.length} 份）${icon('arrow-right', 13)}</a></p>` : ''}
      </section>`}

      <section class="lesson-section">
        <h2>我的笔记</h2>
        <div class="note-box">
          <textarea id="noteArea" placeholder="记下笔记、参数、踩过的坑……笔记只保存在本机浏览器。">${esc(store.getNoteIn(cid, String(lesson.no)))}</textarea>
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
        ${prev ? `<a href="#/lesson/${cid}/${prev.no}"><span class="nl">${icon('arrow-left', 12)} 上一课</span><span class="nt">${esc(prev.title)}</span></a>` : '<span></span>'}
        ${next ? `<a class="next" href="#/lesson/${cid}/${next.no}"><span class="nl">下一课 ${icon('arrow-right', 12)}</span><span class="nt">${esc(next.title)}</span></a>` : '<span></span>'}
      </nav>
    </div>

    <aside class="lesson-side">
      <div class="card side-card">
        <h3>课程进度</h3>
        <div style="display:flex;align-items:center;gap:14px">
          <div class="progress-ring" style="--p:${coursePct}"><b>${coursePct}%</b></div>
          <div style="font-size:13px;color:var(--muted)">${esc(meta.title)}<br>${courseDone} / ${lessons.length} 节已学</div>
        </div>
      </div>
      <div class="card side-card">
        <h3>当前模块</h3>
        <div class="module-progress" style="margin-bottom:10px"><i style="width:${modPct}%;--m-color:${meta.accent}"></i></div>
        <div style="font-size:13px;color:var(--muted)">${esc(mod.title || '')} · ${moduleDone}/${(mod.lessons || []).length} 节</div>
      </div>
      <div class="card side-card">
        <h3>本模块课时</h3>
        <div class="side-lessons">${sideLessons}</div>
      </div>
      ${isSP ? `<div class="card side-card"><h3>标签</h3><div style="display:flex;flex-wrap:wrap;gap:7px">${tags || '<span style="color:var(--muted);font-size:13px">暂无</span>'}</div></div>` : ''}
      ${resources.length ? `<div class="card side-card"><h3>课程资料</h3><a class="link-arrow" href="#/course/${cid}">${resources.length} 份资料 ${icon('arrow-right', 13)}</a></div>` : ''}
      <div class="card side-card"><h3>知识图谱</h3>
        <a class="link-arrow" href="#/graph/${cid}">查看本课知识图谱 ${icon('arrow-right', 13)}</a>
        ${meta.hasQuiz ? `<div style="margin-top:8px"><a class="link-arrow" href="#/quiz/${cid}">${icon('bolt', 13)} 本课闯关练习</a></div>` : ''}
      </div>
    </aside>
  </div>
</div>`;
  },

  mount(params) {
    bindZone(ctx.course, ctx.lesson, ctx.s);
    const noteArea = document.getElementById('noteArea');
    const noteState = document.getElementById('noteState');
    const cid = ctx.course.meta.id;
    const key = String(ctx.lesson.no);
    if (noteArea) {
      const save = debounce(() => {
        store.setNoteIn(cid, key, noteArea.value);
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
