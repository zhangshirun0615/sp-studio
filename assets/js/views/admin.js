import data from '../data.js';
import store from '../store.js';
import { esc, icon, pct, downloadText, toast } from '../ui.js';

/* 教学成效演示数据（样例口径，正式上线接入埋点后替换） */
const demo = {
  classes: 6,
  students: 218,
  active: 196,
  services: 48650,
  aigc: 31200,
  quiz: 9860,
  kb: 5120,
  ai: 2470,
  dailyAsk: 18,
  months: [
    { m: '3月', aigc: 2600, ask: 180 }, { m: '4月', aigc: 3100, ask: 210 },
    { m: '5月', aigc: 3600, ask: 250 }, { m: '6月', aigc: 4100, ask: 280 },
    { m: '7月', aigc: 3300, ask: 200 }, { m: '8月', aigc: 2900, ask: 170 },
    { m: '9月', aigc: 5200, ask: 330 }, { m: '10月', aigc: 6400, ask: 410 }
  ],
  usage: [
    { name: '基础入门', rate: 49.2 }, { name: '数据贴图', rate: 63.8 },
    { name: '图层与实例', rate: 58.6 }, { name: '光照与特效', rate: 66.1 },
    { name: '遮罩与置换', rate: 52.4 }, { name: '映射与笔刷', rate: 55.7 },
    { name: 'UV 与整理', rate: 55.3 }
  ],
  askTypes: [
    { name: '软件操作答疑', rate: 38, count: 939, color: '#ff8a3d' },
    { name: '项目任务辅导', rate: 27, count: 667, color: '#ffd166' },
    { name: '贴图/材质参数', rate: 18, count: 445, color: '#7ee0c3' },
    { name: '报错与排错', rate: 11, count: 272, color: '#6bc5ff' },
    { name: '考核与其他', rate: 6, count: 147, color: '#b3a1ff' }
  ],
  topQuestions: [
    { q: '法线烘焙出现接缝 / 黑块怎么排查？', times: 412, module: '模块 2' },
    { q: '锚点怎么把刻印的磨损传递过去？', times: 358, module: '模块 4' },
    { q: '置换和细分到底什么时候一起用？', times: 301, module: '模块 5' },
    { q: 'UV 展开三种算法怎么选才不会拉伸？', times: 264, module: '模块 7' },
    { q: '智能材质拖上去效果很假怎么调？', times: 238, module: '模块 3' }
  ]
};

let stats = null;

function barChart(items) {
  const max = Math.max(...items.map(i => i.value), 1);
  return `<div class="bar-chart">${items.map(i => {
    const h = Math.max(4, Math.round((i.value / max) * 150));
    return `<div class="bar-col" title="${esc(i.label)}：${i.value}">
      <span class="bar-val">${i.value}</span>
      <div class="bar" style="height:${h}px"></div>
      <span class="bar-lbl">${esc(i.label)}</span>
    </div>`;
  }).join('')}</div>`;
}

function groupBarChart(rows) {
  const max = Math.max(...rows.flatMap(r => [r.a, r.b]), 1);
  return `<div class="bar-chart" style="gap:14px">${rows.map(r => {
    const ha = Math.max(3, Math.round((r.a / max) * 150));
    const hb = Math.max(3, Math.round((r.b / max) * 150));
    return `<div class="bar-col" title="${r.m}：AIGC ${r.a} / 答疑 ${r.b}">
      <div style="display:flex;gap:3px;align-items:flex-end;height:150px">
        <div class="bar" style="height:${ha}px;max-width:16px"></div>
        <div class="bar teal" style="height:${hb}px;max-width:16px"></div>
      </div>
      <span class="bar-lbl">${r.m}</span>
    </div>`;
  }).join('')}</div>
  <div class="legend"><span><i style="background:var(--copper-2)"></i>AIGC 工具调用</span><span><i style="background:var(--teal)"></i>智能答疑</span></div>`;
}

function donut(items, total, centerLabel) {
  let acc = 0;
  const stops = items.map(it => {
    const start = acc; acc += it.rate;
    return `${it.color} ${start}% ${acc}%`;
  }).join(', ');
  return `<div class="donut" style="background:conic-gradient(${stops})">
      <div class="donut-center"><div><b>${total}</b><span>${centerLabel}</span></div></div>
    </div>
    <div class="donut-legend">${items.map(it => `<span><i style="background:${it.color}"></i>${esc(it.name)}<span class="dv">${it.rate}% · ${it.count.toLocaleString()}</span></span>`).join('')}</div>`;
}

function moduleRows(course) {
  return course.modules.map(m => {
    const md = m.lessons.filter(l => store.isDone(l.no)).length;
    const p = pct(md, m.lessons.length);
    return `<div class="hbar">
      <span style="font-size:12px">模块 ${m.index}</span>
      <div class="track"><i style="width:${p}%;background:linear-gradient(90deg,${m.color},var(--gold))"></i></div>
      <span class="val">${md}/${m.lessons.length}</span>
    </div>`;
  }).join('');
}

function myTab() {
  const st = stats;
  const weekItems = st.week.map(d => ({ label: '周' + d.weekday, value: d.total }));
  const quizRows = st.quizRows.length
    ? `<table class="data"><thead><tr><th>#</th><th>模块</th><th>最高正确率</th><th>挑战次数</th><th>最近</th></tr></thead>
       <tbody>${st.quizRows.map(r => `<tr><td class="mono">${r.idx}</td><td>${esc(r.title)}</td><td class="mono">${r.score}%</td><td class="mono">${r.attempts}</td><td>${r.last}</td></tr>`).join('')}</tbody></table>`
    : `<p style="color:var(--muted);font-size:13px">还没有闯关记录，去 <a href="#/quiz" style="color:var(--copper-2)">闯关练习</a> 试试。</p>`;

  return `    <div class="kpi-grid" style="margin-top:24px">
      <div class="kpi"><div class="k-lbl">已完成课时</div><div class="k-val">${st.done}<small>/ 58 节</small></div><div class="k-sub">全部 58 节系统课</div></div>
      <div class="kpi"><div class="k-lbl">累计学习时长</div><div class="k-val">${st.hours}<small>小时</small></div><div class="k-sub">按已完成课时的视频时长估算</div></div>
      <div class="kpi"><div class="k-lbl">闯关平均正确率</div><div class="k-val">${st.avgQuiz}<small>%</small></div><div class="k-sub">各模块最高成绩的平均值</div></div>
      <div class="kpi"><div class="k-lbl">AI 助教互动</div><div class="k-val">${st.aiAsked}<small>次</small></div><div class="k-sub">知识库查阅 ${st.kbViews} 次</div></div>
    </div>
    <div class="dash-grid">
      <div class="dash-card">
        <h3>模块学习进度</h3>
        <div class="d-sub">每完成一节视频，进度条会随之增长</div>
        <div class="hbar-list">${moduleRows(st.course)}</div>
      </div>
      <div class="dash-card">
        <h3>近 7 天学习活动</h3>
        <div class="d-sub">看课、闯关、提问、查术语都会计入</div>
        ${barChart(weekItems)}
      </div>
    </div>
    <div class="dash-grid">
      <div class="dash-card">
        <h3>闯关成绩明细</h3>
        <div class="d-sub">按模块记录最高正确率与挑战次数</div>
        <div class="table-wrap">${quizRows}</div>
      </div>
      <div class="dash-card">
        <h3>最近笔记</h3>
        <div class="d-sub">笔记仅保存在本机浏览器</div>
        <div style="display:flex;flex-direction:column;gap:10px">${st.notes.length ? st.notes.map(n => `
          <a href="#/lesson/${n.no}" style="color:var(--text-2);font-size:13px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;display:block">
            <span style="color:var(--copper-2);font-size:12px">第 ${n.no} 课 ${esc(n.title)}</span>
            <span style="display:block;color:var(--muted);font-size:12px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.text.slice(0, 60))}</span>
          </a>`).join('') : `<p style="color:var(--muted);font-size:13px">还没有笔记，去课程页记下第一笔吧。</p>`}</div>
      </div>
    </div>
    <div class="dash-note">
      数据说明：以上均为<strong>本机浏览器</strong>中记录的真实学习数据（localStorage），不会上传服务器；换设备或清除浏览器数据后不会同步。导出 CSV 可把学习记录带走归档。
    </div>`;
}

function demoTab() {
  return `    <div class="dash-note" style="margin-top:0">
      <strong>演示样例：</strong>以下为“教学成效驾驶舱”的示例数据，用于展示接入班级埋点后的呈现效果，<strong>并非真实采集数据</strong>。正式上线后，把全班学生的学习行为写入统计接口即可替换。
    </div>
    <div class="kpi-grid" style="margin-top:16px">
      <div class="kpi"><div class="k-lbl">授课班级</div><div class="k-val">${demo.classes}<small>个</small></div><div class="k-sub">数字媒体技术专业</div></div>
      <div class="kpi"><div class="k-lbl">选课学生</div><div class="k-val">${demo.students}<small>人</small></div><div class="k-sub">活跃 ${demo.active} 人（${pct(demo.active, demo.students)}%）</div></div>
      <div class="kpi"><div class="k-lbl">累计服务</div><div class="k-val">${demo.services.toLocaleString()}<small>人次</small></div><div class="k-sub">答疑 + 工具 + 知识库 + 练习</div></div>
      <div class="kpi"><div class="k-lbl">日均答疑</div><div class="k-val">${demo.dailyAsk}<small>次</small></div><div class="k-sub">7×24 小时即时响应</div></div>
    </div>
    <div class="dash-grid">
      <div class="dash-card">
        <h3>服务量月度趋势</h3>
        <div class="d-sub">2026 年 3 月 — 10 月 · 左列 AIGC 调用，右列答疑</div>
        ${groupBarChart(demo.months.map(m => ({ m: m.m, a: m.aigc, b: m.ask })))}
      </div>
      <div class="dash-card">
        <h3>累计服务人次构成</h3>
        <div class="d-sub">合计 ${demo.services.toLocaleString()} 人次</div>
        <div class="donut-wrap">
          ${donut([
            { name: 'AIGC 工具调用', rate: 64.1, count: demo.aigc, color: '#ff8a3d' },
            { name: '闯关练习作答', rate: 20.3, count: demo.quiz, color: '#ffd166' },
            { name: '知识库查询', rate: 10.5, count: demo.kb, color: '#7ee0c3' },
            { name: '智能答疑', rate: 5.1, count: demo.ai, color: '#b3a1ff' }
          ], demo.services.toLocaleString(), '累计服务人次')}
        </div>
      </div>
    </div>
    <div class="dash-grid">
      <div class="dash-card">
        <h3>各模块 AI 工具使用率</h3>
        <div class="d-sub">7 个模块已全部覆盖 · 平均 57.3%</div>
        <div class="hbar-list">
          ${demo.usage.map(u => `<div class="hbar">
            <span style="font-size:12px">${esc(u.name)}</span>
            <div class="track"><i style="width:${u.rate}%"></i></div>
            <span class="val">${u.rate}%</span>
          </div>`).join('')}
        </div>
      </div>
      <div class="dash-card">
        <h3>答疑问题类型分布</h3>
        <div class="d-sub">共 ${demo.ai.toLocaleString()} 次答疑</div>
        <div class="donut-wrap" style="gap:18px">
          ${donut(demo.askTypes, demo.ai.toLocaleString(), '答疑次数')}
        </div>
      </div>
    </div>
    <div class="dash-grid" style="grid-template-columns:1fr">
      <div class="dash-card">
        <h3>智能体高频问题 TOP 5</h3>
        <div class="d-sub">学生在 AI 助教中提问最多的问题</div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>#</th><th>问题</th><th>被提问</th><th>对应模块</th></tr></thead>
            <tbody>${demo.topQuestions.map((q, i) => `<tr><td class="mono">${i + 1}</td><td>${esc(q.q)}</td><td class="mono">${q.times} 次</td><td>${esc(q.module)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

export default {
  async render() {
    const [course, quiz, lessons] = await Promise.all([data.course(), data.quiz(), data.flatLessons()]);
    const s = store.get();
    const done = Object.keys(s.completed).length;
    const doneSec = Object.keys(s.completed).reduce((acc, no) => {
      const l = lessons.find(x => x.no === Number(no));
      return acc + (l ? l.durationSec : 0);
    }, 0);
    let sumP = 0, cnt = 0;
    Object.values(s.quiz).forEach(q => { sumP += pct(q.best, q.total); cnt++; });

    stats = {
      course,
      done,
      hours: (doneSec / 3600).toFixed(1),
      avgQuiz: cnt ? Math.round(sumP / cnt) : 0,
      aiAsked: s.ai.asked,
      kbViews: Object.values(s.kb.views).reduce((a, b) => a + b, 0),
      week: store.last7days(),
      quizRows: Object.entries(s.quiz).map(([mid, v]) => {
        const mod = course.modules.find(m => m.id === mid);
        return {
          idx: course.modules.findIndex(m => m.id === mid) + 1,
          title: mod ? mod.title : mid,
          score: pct(v.best, v.total),
          attempts: v.attempts,
          last: new Date(v.lastAt).toLocaleDateString('zh-CN')
        };
      }),
      notes: Object.entries(s.notes).slice(-4).reverse().map(([no, text]) => {
        const l = lessons.find(x => x.no === Number(no));
        return { no, title: l ? l.title : '', text };
      }).filter(n => n.text)
    };

    return `<div class="container">
  <div class="dash-head">
    <div>
      <div class="eyebrow">Learning Analytics</div>
      <h1>数据驾驶舱</h1>
      <p>我的学习数据来自本机浏览器记录；教学成效页展示接入班级埋点后的样例效果。导出 CSV 可归档学习记录。</p>
    </div>
    <div class="dash-actions">
      <button class="btn btn-ghost btn-sm" id="exportCsv">${icon('download', 15)} 导出 CSV</button>
      <button class="btn btn-ghost btn-sm" id="resetData" style="color:var(--muted)">${icon('refresh', 15)} 清空本机数据</button>
    </div>
  </div>
  <div class="dash-tabs" style="display:flex;gap:8px;margin-top:24px;border-bottom:1px solid var(--line)">
    <button class="dash-tab active" data-tab="mine" style="padding:10px 16px;font-size:14px;font-weight:700;color:var(--text);border-bottom:2px solid var(--copper);border-radius:0">我的学习数据</button>
    <button class="dash-tab" data-tab="demo" style="padding:10px 16px;font-size:14px;font-weight:700;color:var(--muted);border-bottom:2px solid transparent;border-radius:0">教学成效演示</button>
  </div>
  <div id="dashBody">${myTab()}</div>
</div>`;
  },

  mount() {
    const body = document.getElementById('dashBody');
    document.querySelectorAll('.dash-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.dash-tab').forEach(t => {
          const on = t === tab;
          t.classList.toggle('active', on);
          t.style.color = on ? 'var(--text)' : 'var(--muted)';
          t.style.borderBottomColor = on ? 'var(--copper)' : 'transparent';
        });
        body.innerHTML = tab.dataset.tab === 'demo' ? demoTab() : myTab();
      });
    });

    const exportBtn = document.getElementById('exportCsv');
    exportBtn.addEventListener('click', () => {
      const st = store.get();
      const lines = ['类型,课时/模块,时间,备注'];
      Object.entries(st.completed).forEach(([no, ts]) => lines.push(`完成课时,第${no}课,${new Date(ts).toLocaleString('zh-CN')},`));
      Object.entries(st.quiz).forEach(([mid, v]) => lines.push(`闯关成绩,${mid},${new Date(v.lastAt).toLocaleString('zh-CN')},最高${pct(v.best, v.total)}% 共${v.attempts}次`));
      Object.entries(st.notes).forEach(([no, t]) => lines.push(`笔记,第${no}课,,${String(t).replace(/[,\n]/g, ' ').slice(0, 60)}`));
      st.activity.slice(-200).forEach(a => lines.push(`活动,${a.type},${new Date(a.ts).toLocaleString('zh-CN')},${a.lesson || a.module || ''}`));
      downloadText(`材质工坊-学习数据-${new Date().toISOString().slice(0, 10)}.csv`, '\ufeff' + lines.join('\n'));
      toast('CSV 已导出', 'ok');
    });

    document.getElementById('resetData').addEventListener('click', () => {
      if (!confirm('确定清空本机学习数据吗？进度、笔记、成绩都会被删除，且无法恢复。')) return;
      store.reset();
      toast('本机数据已清空');
      location.reload();
    });
  }
};
