/* AI 助教：多课程本地知识检索 + 可选大模型 API（用户自填 Key） */
import data from './data.js';
import store from './store.js';
import { esc } from './ui.js';

const state = {
  ready: false,
  courses: [],
  lessons: [],
  kb: [],
  faqs: [],
  platformDocs: [],
  vocab: new Map(),
  n: 0
};

function tokenize(text) {
  const out = [];
  const latin = String(text).toLowerCase().match(/[a-z0-9][a-z0-9.+#-]{1,}/g) || [];
  out.push(...latin);
  const cjk = String(text).match(/[\u4e00-\u9fa5]+/g) || [];
  for (const seg of cjk) {
    if (seg.length === 1) out.push(seg);
    for (let i = 0; i < seg.length - 1; i++) out.push(seg.slice(i, i + 2));
  }
  return out;
}

function indexDoc(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function addDoc(doc) {
  doc.tf = indexDoc(tokenize(doc.text));
  for (const t of doc.tf.keys()) state.vocab.set(t, (state.vocab.get(t) || 0) + 1);
  state.n += 1;
}

const PLATFORM_DOCS = [
  {
    type: 'platform', title: '平台有哪些课程',
    text: '数字媒体设计学习平台 课程 10 门 三维材质 Substance Painter ZBrush 影视概念设计 平面构成 色彩 绘画渲染 How to Draw How to Render 分镜 Framed Ink 动画大师课 插画魔法课 视听语言 PR 剪辑 知识图谱 题库'
  },
  {
    type: 'platform', title: '知识图谱怎么用',
    text: '知识图谱 课程页 按钮 知识点索引 点击节点 高亮 缩放 拖拽 导出 PNG JSON 教师端 编辑 图谱 修改知识点'
  },
  {
    type: 'platform', title: '闯关练习怎么用',
    text: '闯关练习 题库 选课程 板块 答题 即时解析 错题重练 成绩 记录 每门课 独立题库'
  },
  {
    type: 'platform', title: '学生怎么登录',
    text: '学生登录 学号 密码 默认口令 学号后 6 位 教师端 发布学生名单 成绩 评语 本地服务器'
  },
  {
    type: 'platform', title: '教师端怎么进 / 异地使用',
    text: '教师端 127.0.0.1 8899 teacher 口令 本机 异地 远程桌面 SSH 隧道 隧道 Tailscale 备份 导入'
  },
  {
    type: 'platform', title: '课程视频在哪里看 / 网盘',
    text: '视频 网盘 百度网盘 提取码 本地服务器 播放 字幕 中英字幕 手机 局域网 IPv6'
  }
];

export async function init() {
  if (state.ready) return state;
  const cat = await data.catalog();
  state.courses = cat.courses || [];
  state.platformDocs = PLATFORM_DOCS;
  state.kb = await data.kb().then(k => k.terms || []).catch(() => []);
  state.faqs = await data.faq().then(f => f.faqs || []).catch(() => []);

  for (const c of state.courses) {
    let payload = null;
    try { payload = await data.courseById(c.id); } catch (e) { continue; }
    const lessons = await data.lessonsOf(c.id);
    lessons.forEach(l => {
      const mod = (payload.data.modules || []).find(m => m.id === l.moduleId) || {};
      const text = [
        c.title, c.category, (c.tags || []).join(' '),
        l.moduleTitle, l.title,
        l.summary || '', (l.objectives || []).join(' '),
        (l.keypoints || []).join(' '),
        (mod.keypoints || []).join(' '), mod.goal || ''
      ].join(' ');
      state.lessons.push({
        type: 'lesson', courseId: c.id, courseTitle: c.title,
        moduleTitle: l.moduleTitle, no: l.no, title: l.title,
        text, doc: l
      });
    });
    const outline = payload.data.outline || {};
    if (outline.keypoints || outline.objectives) {
      addDoc({
        type: 'outline', courseId: c.id, courseTitle: c.title,
        title: c.title + ' 课程体系',
        text: [c.title, c.description, (outline.objectives || []).join(' '),
          (outline.keypoints || []).join(' '), (outline.assessment || []).join(' '),
          (outline.theoryTasks || []).join(' '), (outline.practiceTasks || []).join(' ')].join(' '),
        doc: { courseId: c.id, courseTitle: c.title, outline }
      });
    }
    (payload.data.chapters || []).forEach((ch, i) => {
      addDoc({
        type: 'chapter', courseId: c.id, courseTitle: c.title,
        title: c.title + ' · ' + ch.title,
        text: [c.title, ch.title, ch.goal || '', (ch.lessons || []).join(' '), (ch.assessment || []).join(' ')].join(' '),
        doc: { courseId: c.id, courseTitle: c.title, chapter: ch }
      });
    });
  }

  state.lessons.forEach(addDoc);
  state.platformDocs.forEach(addDoc);
  state.kb.forEach(t => addDoc({
    type: 'term', courseId: 'sp', courseTitle: state.courseTitle('sp'),
    title: t.term,
    text: [t.term, t.en, t.cat, t.def, (t.related || []).join(' ')].join(' '),
    doc: t
  }));
  state.faqs.forEach((f, i) => addDoc({
    type: 'faq', courseId: 'sp', courseTitle: state.courseTitle('sp'),
    title: f.title,
    text: [f.q, (f.keywords || []).join(' '), f.title, (f.paras || []).join(' '), (f.points || []).join(' ')].join(' '),
    doc: f
  }));

  state.ready = true;
  return state;
}

state.courseTitle = function (id) {
  const c = (state.courses || []).find(x => x.id === id);
  return c ? c.title : '课程';
};

function idf(token) {
  const df = state.vocab.get(token) || 0;
  return df ? Math.log(1 + state.n / df) : 0;
}

function scoreDoc(doc, qTokens, qText) {
  let s = 0;
  for (const t of new Set(qTokens)) {
    const tf = doc.tf.get(t) || 0;
    if (!tf) continue;
    s += (1 + Math.log(tf)) * idf(t);
    if (doc.title && doc.title.toLowerCase().includes(t)) s += 1.6 * idf(t);
  }
  s = s / Math.sqrt(1 + doc.tf.size * 0.08);
  return s;
}

function detectCourse(qText) {
  let best = null;
  let bestScore = 0;
  for (const c of state.courses) {
    let s = 0;
    const title = (c.title || '').toLowerCase();
    if (title && qText.includes(title)) s += 6;
    for (const piece of [c.subtitle || '', c.category || '', (c.tags || []).join(' ')]) {
      for (const t of tokenize(piece)) {
        if (t.length >= 2 && qText.includes(t)) s += 1;
      }
    }
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return bestScore >= 2 ? best : null;
}

function lessonRefLink(l) {
  if (!l) return '';
  return `<a href="#/lesson/${l.courseId}/${l.no}">${esc(l.courseTitle)} · 第 ${l.no} 课 ${esc(l.title)}</a>`;
}

function refsHtml(lessons, courses) {
  let html = '';
  if (lessons && lessons.length) {
    html += `<div class="refs">${lessons.filter(Boolean).map(lessonRefLink).join('')}</div>`;
  }
  if (courses && courses.length) {
    html += `<div class="refs" style="margin-top:6px">${courses.map(c => `<a href="#/course/${c.id}">${esc(c.title)}</a>`).join('')}</div>`;
  }
  return html;
}

function listCoursesHtml() {
  return `<div class="refs">${state.courses.slice(0, 10).map(c => `<a href="#/course/${c.id}">${esc(c.title)}</a>`).join('')}</div>`;
}

function formatLesson(l) {
  const doc = l.doc || {};
  return `<h4>${esc(l.courseTitle)} · 第 ${l.no} 课 ${esc(l.title)}</h4>
    <p style="color:var(--muted);font-size:12.5px">${esc(l.moduleTitle || '')}</p>
    ${(doc.keypoints || []).length ? `<div style="font-size:13px;line-height:1.9">${doc.keypoints.slice(0, 5).map(k => '· ' + esc(k)).join('<br>')}</div>` : ''}
    ${refsHtml([l])}`;
}

function formatOutline(l) {
  const o = (l.doc || {}).outline || {};
  return `<h4>${esc(l.courseTitle)} · 课程体系</h4>
    ${(o.objectives || []).length ? `<p><b>学习目标</b></p><ul>${o.objectives.slice(0, 5).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${(o.assessment || []).length ? `<p><b>考查方式</b></p><ul>${o.assessment.slice(0, 4).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${refsHtml([], [state.courses.find(c => c.id === l.courseId)])}`;
}

function formatChapter(l) {
  const ch = (l.doc || {}).chapter || {};
  return `<h4>${esc(l.courseTitle)} · ${esc(ch.title)}</h4>
    ${ch.goal ? `<p>${esc(ch.goal)}</p>` : ''}
    ${(ch.assessment || []).length ? `<p><b>考核任务</b></p><ul>${ch.assessment.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${refsHtml([], [state.courses.find(c => c.id === l.courseId)])}`;
}

function formatPlatform(doc) {
  return `<h4>${esc(doc.title)}</h4><p>${esc(doc.text)}</p>
    <p style="color:var(--muted);font-size:12.5px">可以继续问：这门课怎么学、某节课讲什么、题库/学生登录/教师端怎么用。</p>`;
}

function formatTerm(t) {
  return `<h4>${esc(t.term)}${t.en ? ' · ' + esc(t.en) : ''}</h4>
    <p>${esc(t.def)}</p>
    <p style="color:var(--muted);font-size:12.5px">分类：${esc(t.cat)} · 属于 Substance Painter 课程</p>
    ${(t.related || []).length ? `<p style="color:var(--muted);font-size:12.5px">相关：${(t.related || []).map(esc).join('、')}</p>` : ''}`;
}

function formatFaq(f) {
  return `<h4>${esc(f.title)}</h4>
    ${(f.paras || []).map(p => `<p>${esc(p)}</p>`).join('')}
    ${(f.points || []).length ? `<ul>${f.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    <p style="color:var(--muted);font-size:12.5px">来自 Substance Painter 课程 FAQ</p>`;
}

function localAnswer(question) {
  const q = String(question || '').trim();
  const qText = q.toLowerCase();
  const qTokens = tokenize(q);
  if (!qTokens.length) {
    return {
      html: '<p>可以再具体描述一下：想学哪门课、哪一节，或遇到什么操作问题？</p>' + listCoursesHtml(),
      followups: suggestions.slice(0, 4)
    };
  }

  const detected = detectCourse(qText);
  const scored = [];
  const consider = doc => {
    let s = scoreDoc(doc, qTokens, qText);
    if (doc.type === 'lesson') {
      s *= 1.0;
      if (detected && doc.courseId === detected.id) s += 2.2;
    } else if (doc.type === 'outline' || doc.type === 'chapter') {
      if (detected && doc.courseId === detected.id) s += 1.5;
    } else if (doc.type === 'term' || doc.type === 'faq') {
      if (detected && detected.id !== 'sp') s *= 0.6;
    } else if (doc.type === 'platform') {
      s *= 1.0;
    }
    if (s > 0) scored.push({ score: s, doc });
  };
  state.lessons.forEach(consider);
  state.platformDocs.forEach(consider);

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  if (!top || top.score < 2.2) {
    return {
      html: `<h4>这个问题我还没有把握</h4>
        <p>本机知识库暂时没有直接匹配的内容。可以换个说法，或先选一门课程再问，例如「ZBrush 的 Dynamesh 怎么用」「影视概念设计第二阶段学什么」。</p>
        <p style="color:var(--muted);font-size:13px">平台现有课程：</p>${listCoursesHtml()}`,
      followups: ['这门课的学习路线是什么？', '知识图谱怎么用？', '闯关练习怎么开始？']
    };
  }

  const d = top.doc;
  let html = '';
  if (d.type === 'lesson') html = formatLesson(d);
  else if (d.type === 'outline') html = formatOutline(d);
  else if (d.type === 'chapter') html = formatChapter(d);
  else if (d.type === 'platform') html = formatPlatform(d);
  else if (d.type === 'term') html = formatTerm(d.doc);
  else if (d.type === 'faq') html = formatFaq(d.doc);

  const fups = [];
  if (d.type === 'lesson') {
    fups.push(`《${d.courseTitle}》这门课怎么学？`, '这一课的知识点怎么复习？');
  } else if (d.type === 'outline') {
    fups.push('先学哪几章？', '这门课有题库吗？');
  } else {
    fups.push('平台有哪些课程？', '知识图谱怎么用？');
  }
  return { html, followups: fups.slice(0, 3) };
}

/* 可选：调用用户自填的大模型 API（OpenAI 兼容） */
export async function remoteAnswer(question, settings) {
  const { apiBase, apiKey, model } = settings || {};
  if (!apiKey) throw new Error('未配置 API Key');
  const base = (apiBase || 'https://api.deepseek.com').replace(/\/$/, '');
  const detected = detectCourse(String(question || '').toLowerCase());
  const courseLines = state.courses.map(c => `- ${c.title}（${c.category}，${c.lessonCount} 节）`).join('\n');
  let lessonLines = '';
  if (detected) {
    lessonLines = state.lessons.filter(l => l.courseId === detected.id)
      .slice(0, 120).map(l => `${l.moduleTitle}｜第${l.no}课 ${l.title}`).join('\n');
  } else {
    lessonLines = state.lessons.filter((l, i) => i % 12 === 0).slice(0, 60)
      .map(l => `${l.courseTitle}｜${l.moduleTitle}｜第${l.no}课 ${l.title}`).join('\n');
  }
  const sys = `你是“数字媒体设计学习平台”的中文学习助教，服务对象是学习三维材质、雕刻、概念设计、平面构成、绘画渲染、分镜、插画与剪辑的学生。
回答要求：中文、具体、分点；先给结论再解释；尽量说明属于哪门课/哪一节；不确定时不要编造，建议查看对应课程或题库。
平台课程（共 ${state.courses.length} 门）：
${courseLines}
${detected ? `\n学生当前可能问的课程：${detected.title}，相关课时：\n${lessonLines}` : `\n可参考课时（抽样）：\n${lessonLines}`}
平台功能：课程中心、知识图谱、闯关练习、学生登录（本地服务器）、教师端（仅本机）。`;
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: question }],
      temperature: 0.4,
      max_tokens: 1000
    })
  });
  if (!res.ok) throw new Error('接口返回 ' + res.status);
  const j = await res.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  if (!text) throw new Error('接口无内容');
  const html = text.split(/\n{1,}/).map(p => {
    const t = p.trim();
    if (!t) return '';
    if (/^[-*•]\s+/.test(t)) return `<li>${esc(t.replace(/^[-*•]\s+/, ''))}</li>`;
    if (/^\d+[.、)]\s+/.test(t)) return `<li>${esc(t.replace(/^\d+[.、)]\s+/, ''))}</li>`;
    return `<p>${esc(t)}</p>`;
  }).join('').replace(/(<li>[\s\S]*?<\/li>)+/g, m => `<ul>${m}</ul>`);
  return { html: html || `<p>${esc(text)}</p>`, followups: [] };
}

export async function getReply(question) {
  await init();
  const settings = store.getSettings();
  if (settings.apiKey) {
    try {
      const r = await remoteAnswer(question, settings);
      return Object.assign({ source: 'api' }, r);
    } catch (e) {
      const local = localAnswer(question);
      const tip = `<p style="color:var(--muted);font-size:12px;margin-top:8px">（在线模型调用失败：${esc(e.message)}，以下为本地知识引擎回答）</p>`;
      return Object.assign({ source: 'local' }, local, { html: local.html + tip });
    }
  }
  return Object.assign({ source: 'local' }, localAnswer(question));
}

export const suggestions = [
  '平台有哪些课程？',
  'ZBrush 的 Dynamesh 和 ZRemesher 有什么区别？',
  '影视概念设计三个阶段分别学什么？',
  '构成设计里的 631 配比是什么？',
  'Framed Ink 和 Framed Ink 2 怎么安排阅读？',
  'PR 的 Lumetri 调色面板怎么用？',
  'How to Draw 的视锥和一点透视怎么看？',
  '知识图谱怎么用？'
];
