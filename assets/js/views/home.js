import data from '../data.js';
import store from '../store.js';
import { esc, icon, pct } from '../ui.js';

function hours(sec) { return Math.round(sec / 3600); }

function statItem(num, unit, label) {
  return `<div class="stat-item reveal"><div class="num">${num}${unit ? `<small>${unit}</small>` : ''}</div><div class="lbl">${label}</div></div>`;
}

function courseCard(c) {
  const done = store.doneCountIn(c.id);
  const total = c.lessonCount || 0;
  const p = total ? pct(done, total) : 0;
  return `<a class="course-card reveal" href="#/course/${c.id}" style="--accent:${c.accent || '#ff8a3d'}">
    <div class="cc-cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" loading="lazy">` : ''}
      <span class="cc-cat">${esc(c.category)}</span>
      <span class="cc-type">${c.type === 'bilibili' ? 'B 站' : c.type === 'gallery' ? '图文' : '视频课'}</span>
    </div>
    <div class="cc-body">
      <h3>${esc(c.title)}</h3>
      <p class="cc-sub">${esc(c.subtitle || '')}</p>
      <div class="cc-meta"><span>${icon('play', 12)} ${total} 节</span><span>${icon('clock', 12)} ${hours(c.durationSec || 0)} 小时</span></div>
      ${total ? `<div class="cc-progress"><i style="width:${p}%"></i></div>` : ''}
    </div>
  </a>`;
}

export default {
  async render() {
    const cat = await data.catalog();
    const courses = cat.courses || [];
    const totalHours = Math.round(cat.durationTotal / 3600);
    const sp = courses.find(c => c.id === 'sp');
    const others = courses.filter(c => c.id !== 'sp').slice(0, 8);

    // 继续学习：找最近有记录的课程
    let cont = null;
    const lastMap = store.get().last || {};
    for (const cid of Object.keys(lastMap)) {
      const c = courses.find(x => x.id === cid);
      if (!c) continue;
      const lessons = await data.lessonsOf(cid);
      const l = lessons.find(x => String(x.no) === String(lastMap[cid]));
      if (l) { cont = { course: c, lesson: l }; break; }
    }
    if (!cont && courses.length) {
      const c = sp || courses[0];
      const lessons = await data.lessonsOf(c.id);
      if (lessons.length) cont = { course: c, lesson: lessons[0] };
    }

    const featureCards = [
      ['bot', 'AI 答疑助教', '概念、参数、排错，中文提问即时回答（SP 课程内置本地知识引擎）', '#/assistant'],
      ['sparkles', 'AIGC 工具箱', '材质参考、PBR 拆解、作品文案等提示词，一键复制到任意 AI', '#/toolbox'],
      ['book', '术语知识库', '133 条 Substance Painter 术语，中英对照、分类检索', '#/kb'],
      ['bolt', '闯关练习', '119 道 SP 课程练习题，即时解析与错题重练', '#/quiz'],
      ['user', '学生登录', '学号 + 口令查看实训任务、成绩与教师评语（本地服务器）', '#/student']
    ].map(([ic, title, desc, href]) => `<a class="card hoverable feature-card reveal" href="${href}">
      <span class="f-icon">${icon(ic, 20)}</span><h3>${title}</h3><p>${desc}</p>
      <span class="f-link">进入 ${icon('arrow-right', 13)}</span></a>`);
    const features = featureCards.join('');

    return `<section class="hero platform-hero">
      <div class="container hero-inner">
        <div>
          <div class="hero-badge"><b>数字媒体设计</b><span>课程学习 · 实训评估 · AI 辅助</span></div>
          <h1><span class="line">把每一门课，</span><span class="line gradient-text">连成一条成长路径。</span></h1>
          <p class="hero-lead">三维材质、ZBrush 雕刻、影视概念设计、平面构成、色彩、分镜与剪辑——<strong>${courses.length} 门课程、${cat.lessonTotal} 个课时、约 ${totalHours} 小时</strong>，配套 AI 助教、知识库、闯关练习与学生成绩入口。</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/courses">${icon('grid', 16)} 进入课程中心</a>
            <a class="btn btn-ghost" href="#/assistant">${icon('bot', 16)} 问问 AI 助教</a>
          </div>
          <div class="hero-meta">
            <span>${icon('layers', 15)} ${courses.length} 门课程</span>
            <span>${icon('play', 14)} ${cat.lessonTotal} 个课时</span>
            <span>${icon('clock', 15)} 约 ${totalHours} 小时</span>
            <span>${icon('user', 15)} 学生成绩入口</span>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="material-orbit small">
            <span class="sphere s-teal"></span><span class="sphere s-gold"></span>
            <span class="sphere s-steel"></span><span class="sphere s-main"></span>
            <span class="orbit-label l1">3D · 雕刻</span><span class="orbit-label l2">概念 · 分镜</span><span class="orbit-label l3">构成 · 色彩</span>
          </div>
        </div>
      </div>
    </section>

    <section class="section tight"><div class="container"><div class="stat-strip">
      ${statItem(courses.length, '门', '课程')}
      ${statItem(cat.lessonTotal, '节', '课时总数')}
      ${statItem(totalHours, '小时', '课程总时长')}
      ${statItem(courses.filter(c => c.hasQuiz).length, '门', '含闯关练习')}
    </div></div></section>

    ${cont ? `<section class="section tight"><div class="container">
      <div class="card reveal" style="display:flex;flex-wrap:wrap;align-items:center;gap:24px;padding:26px 30px;background:linear-gradient(120deg,rgba(255,138,61,.12),rgba(255,255,255,.02) 55%);border-color:rgba(255,138,61,.22)">
        <div style="flex:1;min-width:240px">
          <div class="eyebrow" style="margin-bottom:6px">继续学习</div>
          <h2 style="font-size:clamp(20px,2.4vw,26px)">${esc(cont.course.title)}</h2>
          <p style="color:var(--muted);font-size:13.5px;margin-top:6px">${esc(cont.lesson.title)}</p>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <a class="btn btn-primary" href="#/lesson/${cont.course.id}/${cont.lesson.no}">${icon('play', 15)} 继续</a>
          <a class="btn btn-ghost" href="#/course/${cont.course.id}">${icon('map', 15)} 课程目录</a>
        </div>
      </div>
    </div></section>` : ''}

    <section class="section">
      <div class="container">
        <div class="section-head">
          <div><div class="eyebrow">课程中心</div>
            <h2 class="section-title">课程中心</h2>
            <p class="section-sub">按方向选择课程：三维与材质、概念设计、影视与分镜、平面构成、色彩与绘画、剪辑。</p></div>
          <a class="link-arrow" href="#/courses">全部 ${courses.length} 门 ${icon('arrow-right', 14)}</a>
        </div>
        <div class="course-grid">${(sp ? [sp, ...others] : courses).slice(0, 5).map(courseCard).join('')}</div>
        <div style="margin-top:18px"><a class="btn btn-ghost" href="#/courses">${icon('grid', 15)} 浏览全部课程</a></div>
      </div>
    </section>

    ${sp ? `<section class="section tight"><div class="container">
      <div class="section-head"><div><div class="eyebrow">核心课程</div>
        <h2 class="section-title" style="font-size:28px">核心课程 · ${esc(sp.title)}</h2>
        <p class="section-sub">${esc(sp.description || '')}</p></div>
        <a class="link-arrow" href="#/course/sp">进入课程 ${icon('arrow-right', 14)}</a></div>
      <div class="feature-grid" style="grid-template-columns:repeat(3,1fr)">
        ${featureCards.slice(0, 3).join('')}
      </div>
    </div></section>` : ''}

    <section class="section">
      <div class="container">
        <div class="section-head"><div><div class="eyebrow">学习工具</div>
          <h2 class="section-title">学习工具</h2>
          <p class="section-sub">课程之外，这些工具帮你把「看懂」变成「学会」。</p></div></div>
        <div class="feature-grid" style="grid-template-columns:repeat(3,1fr)">${features}</div>
      </div>
    </section>

    <section class="section tight"><div class="container">
      <div class="steps" style="grid-template-columns:repeat(4,1fr)">
        <div class="card step-card"><span class="tag copper">看</span><h3>按课程目录学</h3><p>视频 / B 站 / 图文资料，一门课一条线，进度自动记录。</p></div>
        <div class="card step-card"><span class="tag copper">练</span><h3>动手做作品</h3><p>跟着案例练，SP 课程还有 119 道闯关题巩固知识点。</p></div>
        <div class="card step-card"><span class="tag copper">问</span><h3>问 AI 助教</h3><p>概念、参数、报错都能问；教师端还支持 AI 评审作品。</p></div>
        <div class="card step-card"><span class="tag copper">评</span><h3>看成绩与评语</h3><p>学生用学号登录查看实训成绩；教师端做检测与评分。</p></div>
      </div>
    </div></section>`;
  }
};
