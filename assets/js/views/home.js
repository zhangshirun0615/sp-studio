import data from '../data.js';
import store from '../store.js';
import { esc, icon, fmtDur, pct } from '../ui.js';

function statItem(num, unit, label) {
  return `<div class="stat-item reveal">
    <div class="num">${num}${unit ? `<small>${unit}</small>` : ''}</div>
    <div class="lbl">${label}</div>
  </div>`;
}

function featureCard(ico, title, desc, href, linkText) {
  return `<a class="card hoverable feature-card reveal" href="${href}">
    <span class="f-icon">${icon(ico, 20)}</span>
    <h3>${title}</h3>
    <p>${desc}</p>
    <span class="f-link">${linkText} ${icon('arrow-right', 13)}</span>
  </a>`;
}

export default {
  async render() {
    const course = await data.course();
    const meta = course.meta;
    const modules = course.modules;
    const lessons = await data.flatLessons();
    const done = store.doneCount();

    let quizTotal = 0;
    try {
      const q = await data.quiz();
      quizTotal = Object.values(q.modules).reduce((n, m) => n + m.questions.length, 0);
    } catch (e) { /* 题库可能未就绪 */ }

    let kbTotal = 0;
    try {
      const k = await data.kb();
      kbTotal = (k.terms || []).length;
    } catch (e) { /* 忽略 */ }

    const last = store.get().lastLesson;
    const nextLesson = last ? lessons.find(l => l.no === last) : lessons[0];
    const nextNo = nextLesson ? nextLesson.no : 1;

    const stats = [
      statItem(meta.totalLessons, '节', '视频课程'),
      statItem(meta.moduleCount, '大', '学习模块'),
      statItem(meta.totalHours, '小时', '课程总时长'),
      statItem(quizTotal || '120', '+', '闯关练习题')
    ].join('');

    const features = [
      featureCard('map', '课程地图', '7 大模块、58 节课按学习路径排好，学完一节自动打勾，进度一目了然。', '#/map', '查看路线'),
      featureCard('bot', 'AI 答疑助教', '概念讲不清、参数看不懂、报错不会解？用中文提问，即时给出结构化解答与相关课程。', '#/assistant', '开始提问'),
      featureCard('sparkles', 'AIGC 工具箱', '材质参考、PBR 描述、UV 方案、排错清单——把提示词直接复制到你的 AI 工具里用。', '#/toolbox', '打开工具箱'),
      featureCard('book', '术语知识库', kbTotal ? `${kbTotal} 条 SP 专业术语，中英对照、分类检索，随手查、随堂记。` : 'SP 专业术语中英对照、分类检索，随手查、随堂记。', '#/kb', '进入知识库'),
      featureCard('bolt', '闯关练习', '按模块刷题，答完即看解析，错题可重练，把“看懂了”变成“做对了”。', '#/quiz', '开始闯关')
    ].join('');

    const moduleCards = modules.map(m => {
      const mDone = m.lessons.filter(l => store.isDone(l.no)).length;
      const p = pct(mDone, m.lessons.length);
      const mins = Math.round(m.lessons.reduce((s, l) => s + l.durationSec, 0) / 60);
      return `<a class="card hoverable module-card reveal" href="#/map" style="--m-color:${m.color}">
        <div class="m-top">
          <span class="module-num"><b>模块 ${String(m.index).padStart(2, '0')}</b> · ${m.lessons.length} 节</span>
          <span class="tag ${p === 100 ? 'teal' : ''}">${p}%</span>
        </div>
        <h3>${esc(m.title)}</h3>
        <p class="m-sub">${esc(m.subtitle)}</p>
        <div class="module-progress"><i style="width:${p}%"></i></div>
        <div class="m-meta"><span>${icon('clock', 13)} ${mins} 分钟</span><span>${icon('play', 12)} ${m.lessons.length} 节视频</span></div>
      </a>`;
    }).join('');

    const steps = [
      ['看', '跟着视频学', '按模块顺序观看 58 节录屏课，遇到不懂的暂停、记笔记。'],
      ['练', '动手做一遍', '每节课都有小练习，打开 SP 跟着做，素材和参数都记下来。'],
      ['问', '不懂就问 AI', '把疑问交给 AI 助教，用中文描述现象，拿到排查思路与相关课程。'],
      ['测', '闯关查漏', '按模块刷题，用解析补上知识盲点，再把错题重练一遍。']
    ].map((s, i) => `<div class="card step-card reveal">
      ${i < 3 ? '<span class="s-line"></span>' : ''}
      <span class="tag copper">${s[0]}</span>
      <h3>${s[1]}</h3>
      <p>${s[2]}</p>
    </div>`).join('');

    const continueText = last
      ? `继续学习：第 ${nextLesson.no} 课 · ${esc(nextLesson.title)}`
      : `从第 1 课开始：${esc(lessons[0] ? lessons[0].title : '认识 Substance Painter')}`;

    return `
<section class="hero">
  <div class="container hero-inner">
    <div>
      <div class="hero-badge"><b>AI 学习空间</b><span>数字媒体技术 · 专业核心课</span></div>
      <h1>
        <span class="line">让材质，</span>
        <span class="line gradient-text">自己会说话。</span>
      </h1>
      <p class="hero-lead">
        以 <strong>琅泽 · 老高课堂《Substance Painter 2019》</strong> 58 节系统课为主干，
        配合 AI 助教、术语知识库与闯关练习，陪你从界面与烘焙出发，
        一路走到图层、特效、笔刷、UV 与复杂材质表现。
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/map">${icon('play', 16)} 进入课程地图</a>
        <a class="btn btn-ghost" href="#/assistant">${icon('bot', 16)} 问问 AI 助教</a>
      </div>
      <div class="hero-meta">
        <span>${icon('layers', 15)} ${meta.moduleCount} 大模块</span>
        <span>${icon('play', 14)} ${meta.totalLessons} 节视频</span>
        <span>${icon('clock', 15)} 约 ${meta.totalHours} 小时</span>
        <span>${icon('bolt', 15)} ${quizTotal || 120} 道练习</span>
      </div>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="material-orbit">
        <span class="sphere s-teal"></span>
        <span class="sphere s-gold"></span>
        <span class="sphere s-steel"></span>
        <span class="sphere s-blush"></span>
        <span class="sphere s-main"></span>
        <span class="orbit-label l1">metallic · 铜</span>
        <span class="orbit-label l2">roughness · 0.4</span>
        <span class="orbit-label l3">normal · 法线</span>
      </div>
    </div>
  </div>
</section>

<section class="section tight">
  <div class="container">
    <div class="stat-strip">${stats}</div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div>
        <div class="eyebrow">Learning Suite</div>
        <h2 class="section-title">为这门课，准备了五位一体的学习装备</h2>
        <p class="section-sub">课程地图带你走完知识线，AI 助教与知识库负责答疑查漏，工具箱与闯关练习负责把知识变成能力。</p>
      </div>
      <a class="link-arrow" href="#/map">全部装备 ${icon('arrow-right', 14)}</a>
    </div>
    <div class="feature-grid">${features}</div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div>
        <div class="eyebrow">Course Map</div>
        <h2 class="section-title">七大模块，一条从“会用”到“会做”的路</h2>
        <p class="section-sub">课程按软件认知 → 数据贴图 → 图层材质 → 光照特效 → 遮罩置换 → 映射笔刷 → UV 拆分递进，每一模块都有明确的能力目标。</p>
      </div>
      <a class="link-arrow" href="#/map">打开完整地图 ${icon('arrow-right', 14)}</a>
    </div>
    <div class="module-grid">${moduleCards}</div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div>
        <div class="eyebrow">Study Loop</div>
        <h2 class="section-title">看 · 练 · 问 · 测，四步一个循环</h2>
        <p class="section-sub">不必一次学会全部，按循环推进：看完一小节就动手，卡住就问，最后用练习确认掌握。</p>
      </div>
    </div>
    <div class="steps">${steps}</div>
  </div>
</section>

<section class="section tight">
  <div class="container">
    <div class="card reveal" style="display:flex;flex-wrap:wrap;align-items:center;gap:24px;padding:32px 34px;background:linear-gradient(120deg,rgba(255,138,61,.12),rgba(255,255,255,.02) 55%);border-color:rgba(255,138,61,.22)">
      <div style="flex:1;min-width:260px">
        <div class="eyebrow" style="margin-bottom:8px">Continue</div>
        <h2 style="font-size:clamp(22px,2.6vw,30px)">${done > 0 ? `已学完 ${done} / ${meta.totalLessons} 节课` : '准备好了吗？从第一课开始'}</h2>
        <p style="color:var(--muted);margin-top:8px;font-size:14px">${continueText}</p>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a class="btn btn-primary" href="#/lesson/${nextNo}">${icon('play', 15)} 继续学习</a>
        <a class="btn btn-ghost" href="#/quiz">${icon('bolt', 15)} 去闯关</a>
      </div>
    </div>
  </div>
</section>`;
  }
};
