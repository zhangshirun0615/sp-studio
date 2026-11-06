/* AI 助教：本地知识检索引擎（默认）+ 可选的大模型 API（用户自填 Key） */
import data from './data.js';
import store from './store.js';
import { esc } from './ui.js';

const state = { ready: false, lessons: [], kb: [], faqs: [], vocab: new Map(), n: 0 };

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

export async function init() {
  if (state.ready) return state;
  const [course, kb, faq] = await Promise.all([
    data.course(),
    data.kb().catch(() => ({ terms: [] })),
    fetch('data/faq.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : { faqs: [] }).catch(() => ({ faqs: [] }))
  ]);

  state.lessons = [];
  course.modules.forEach(m => m.lessons.forEach(l => {
    state.lessons.push(Object.assign({}, l, { moduleId: m.id, moduleIndex: m.index, moduleTitle: m.title }));
  }));
  state.kb = kb.terms || [];
  state.faqs = faq.faqs || [];

  state.lessons.forEach(l => addDoc({
    type: 'lesson', id: l.no, title: l.title, moduleTitle: l.moduleTitle, moduleIndex: l.moduleIndex,
    text: [l.title, l.summary, (l.objectives || []).join(' '), (l.keypoints || []).join(' '), (l.tags || []).join(' '), l.practice].join(' '),
    doc: l
  }));

  state.kb.forEach(t => addDoc({
    type: 'term', id: t.term, title: t.term,
    text: [t.term, t.en, t.cat, t.def, (t.related || []).join(' ')].join(' '),
    doc: t
  }));

  state.faqs.forEach((f, i) => addDoc({
    type: 'faq', id: i, title: f.title,
    text: [f.q, (f.keywords || []).join(' '), f.title, (f.paras || []).join(' '), (f.points || []).join(' ')].join(' '),
    doc: f
  }));

  state.ready = true;
  return state;
}

function idf(token) {
  const df = state.vocab.get(token) || 0;
  return df ? Math.log(1 + state.n / df) : 0;
}

function scoreDoc(doc, qTokens, qText) {
  let s = 0;
  const uniq = new Set(qTokens);
  for (const t of uniq) {
    const tf = doc.tf.get(t) || 0;
    if (!tf) continue;
    s += (1 + Math.log(tf)) * idf(t);
    // 标题命中加权
    if (doc.title && doc.title.toLowerCase().includes(t)) s += 1.6 * idf(t);
  }
  s = s / Math.sqrt(1 + doc.tf.size * 0.08);
  // FAQ 关键词直击
  if (doc.type === 'faq') {
    const kws = (doc.doc.keywords || []).filter(k => qText.includes(k));
    if (kws.length >= 2) s += 2.6;
    else if (kws.length === 1) s += 1.0;
  }
  if (doc.type === 'term') s *= 1.08;
  return s;
}

function lessonLink(no) {
  const l = state.lessons.find(x => x.no === Number(no));
  return l ? { no: l.no, title: `第${l.no}课 · ${l.title}` } : null;
}

function refsHtml(refs) {
  if (!refs || !refs.length) return '';
  return `<div class="refs">${refs.map(r => `<a href="#/lesson/${r.no}">${esc(r.title)}</a>`).join('')}</div>`;
}

function termChips(terms) {
  if (!terms || !terms.length) return '';
  return `<div class="refs">${terms.map(t => `<a href="#/kb?term=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>`;
}

function followUps(list) {
  if (!list || !list.length) return '';
  return `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:7px">${list.map(q => `<button class="chip" data-followup="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
}

function formatFaq(f) {
  const refs = (f.refs || []).map(lessonLink).filter(Boolean);
  return `<h4>${esc(f.title)}</h4>
    ${(f.paras || []).map(p => `<p>${esc(p)}</p>`).join('')}
    ${(f.points || []).length ? `<ul>${f.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${refsHtml(refs)}`;
}

function formatTerm(t) {
  const refs = (t.lessonRefs || []).map(lessonLink).filter(Boolean);
  return `<h4>${esc(t.term)}${t.en ? ` · ${esc(t.en)}` : ''}</h4>
    <p>${esc(t.def)}</p>
    <p style="color:var(--muted);font-size:12.5px">分类：${esc(t.cat)}</p>
    ${(t.related || []).length ? `<div style="margin-top:6px;font-size:12.5px;color:var(--muted)">相关术语</div>${termChips(t.related)}` : ''}
    ${refsHtml(refs)}`;
}

function formatLesson(l) {
  return `<h4>第 ${l.no} 课 · ${esc(l.title)}</h4>
    <p>${esc(l.summary || '')}</p>
    ${(l.objectives || []).length ? `<ul>${l.objectives.slice(0, 3).map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
    ${(l.keypoints || []).length ? `<div style="margin:8px 0 2px;font-size:12.5px;color:var(--muted)">关键知识点：${l.keypoints.slice(0, 4).map(esc).join(' · ')}</div>` : ''}
    ${refsHtml([{ no: l.no, title: `第${l.no}课 · ${l.title}` }])}`;
}

function localAnswer(question) {
  const q = String(question || '').trim();
  const qText = q.toLowerCase();
  const qTokens = tokenize(q);
  if (!qTokens.length) {
    return { html: '<p>可以再具体描述一下你的问题吗？例如“锚点怎么用”“法线烘焙有接缝怎么办”。</p>', followups: ['图层和填充层有什么区别？', '锚点到底怎么用？', 'UV 展开怎么选算法？'] };
  }

  const scored = [];
  state.faqs.forEach((f, i) => {
    const doc = { type: 'faq', title: f.title, tf: indexDoc(tokenize([f.q, (f.keywords || []).join(' '), f.title, (f.paras || []).join(' '), (f.points || []).join(' ')].join(' '))), doc: f };
    let s = scoreDoc(doc, qTokens, qText);
    const kws = (f.keywords || []).filter(k => qText.includes(k.toLowerCase()));
    if (kws.length >= 2) s += 2.6;
    else if (kws.length === 1) s += 1.2;
    if (s > 0) scored.push({ type: 'faq', score: s, doc: f });
  });
  state.kb.forEach(t => {
    const doc = { type: 'term', title: t.term, tf: indexDoc(tokenize([t.term, t.en, t.cat, t.def, (t.related || []).join(' ')].join(' '))), doc: t };
    const s = scoreDoc(doc, qTokens, qText) * 1.08;
    if (s > 0.9) scored.push({ type: 'term', score: s, doc: t });
  });
  state.lessons.forEach(l => {
    const doc = { type: 'lesson', title: l.title, tf: indexDoc(tokenize([l.title, l.summary, (l.objectives || []).join(' '), (l.keypoints || []).join(' '), (l.tags || []).join(' ')].join(' '))), doc: l };
    const s = scoreDoc(doc, qTokens, qText) * 0.92;
    if (s > 1.1) scored.push({ type: 'lesson', score: s, doc: l });
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  if (!top || top.score < 2.2) {
    // 兜底：给出最接近的课时
    const related = state.lessons.slice(0, 4).map(l => ({ no: l.no, title: `第${l.no}课 · ${l.title}` }));
    return {
      html: `<h4>这个问题我还没有把握</h4>
        <p>本机知识库暂时没有直接匹配的内容。你可以换个说法，或加入具体关键词，例如「遮罩」「锚点」「烘焙」「UV」「置换」「导出」。</p>
        <p style="color:var(--muted);font-size:13px">也可以先看看这些相关课程：</p>${refsHtml(related)}`,
      followups: ['图层和填充层有什么区别？', '智能材质怎么用？', '贴图导出怎么设置？']
    };
  }

  if (top.type === 'faq') {
    const f = top.doc;
    const fups = (f.refs || []).map(lessonLink).filter(Boolean).slice(0, 2).map(r => `第${r.no}课讲了什么？`);
    return { html: formatFaq(f), followups: fups.concat(['法线烘焙有接缝怎么办？', '遮罩怎么用更高效？']) };
  }

  if (top.type === 'term') {
    const t = top.doc;
    const relatedLessons = (t.lessonRefs || []).map(lessonLink).filter(Boolean).slice(0, 2);
    return { html: formatTerm(t), followups: relatedLessons.map(r => `第${r.no}课讲了什么？`) };
  }

  return { html: formatLesson(top.doc), followups: ['这一课的重点怎么练？', '相关术语有哪些？'] };
}

/* 可选：调用用户自填的大模型 API（OpenAI 兼容） */
export async function remoteAnswer(question, settings) {
  const { apiBase, apiKey, model } = settings || {};
  if (!apiKey) throw new Error('未配置 API Key');
  const base = (apiBase || 'https://api.deepseek.com').replace(/\/$/, '');
  const ctxLessons = state.lessons.slice(0, 58).map(l => `第${l.no}课 ${l.title}：${(l.summary || '').slice(0, 60)}`).join('\n');
  const sys = `你是《Substance Painter 2019》课程的中文学习助教，名叫“材质工坊助教”。
回答要求：中文、具体、分点、贴近 SP2019 实际操作；先给结论再给步骤；若涉及课程内容请指出对应课号；不确定时不要编造，建议查阅对应课时。
课程目录（共 58 课）：
${ctxLessons}`;
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: question }],
      temperature: 0.4,
      max_tokens: 900
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
  '图层和填充层有什么区别？',
  '锚点到底怎么用？',
  '法线烘焙有接缝怎么办？',
  '智能材质怎么用？',
  '置换和细分是什么关系？',
  'UV 展开怎么选算法？',
  '次表面散射怎么做皮肤？',
  '贴图导出怎么设置？'
];
