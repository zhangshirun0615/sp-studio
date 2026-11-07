import core from '../teacher-core.js';
import { esc, icon, toast, downloadText } from '../ui.js';
import {
  MAP_DEFS, DEFAULT_WEIGHTS, groupByStudent, evaluateSubmission, matchStudent,
  imageDims, readZipEntries, computeTotal, levelOfScore, localComment,
  buildAiPrompt, buildAgentPack, toCsv
} from '../teacher-eval.js';

const state = {
  tab: 'overview',
  taskId: null,
  analyses: [],
  thumbUrls: [],
  scanning: false,
  editTaskId: null,
  expanded: new Set(),
  config: { enabled: false }
};

const TABS = [
  ['overview', '概览', 'chart'],
  ['classes', '班级学生', 'user'],
  ['tasks', '实训任务', 'target'],
  ['eval', '实训评估', 'layers'],
  ['grades', '成绩汇总', 'grid'],
  ['server', '发布与访问', 'external']
];

/* ===== 学生账号与工具 ===== */
function ensureStudent(s) {
  s.enabled = s.enabled !== false;
  s.role = s.role || 'student';
  s.permissions = Object.assign({ viewGrades: true }, s.permissions || {});
  return s;
}
async function hashPassword(sid, password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sid + ':' + password));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function defaultPassword(sid) {
  const digits = String(sid || '').replace(/\D/g, '');
  return digits.length >= 6 ? digits.slice(-6) : String(sid || '');
}
let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoading) return xlsxLoading;
  xlsxLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'assets/js/vendor/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Excel 解析库加载失败'));
    document.head.appendChild(s);
  });
  return xlsxLoading;
}

let serverState = { info: null, key: '', access: null, endpoints: null };

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { }
  if (!res.ok) throw new Error(data.error || ('接口错误 ' + res.status));
  return data;
}

function uid(p) { return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }
function allStudents() {
  const out = [];
  (core.data.classes || []).forEach(c => (c.students || []).forEach(s => out.push(Object.assign({ classId: c.id, className: c.name }, s))));
  return out;
}
function findTask(id) { return (core.data.tasks || []).find(t => t.id === id) || null; }
function findEval(taskId, folderName) {
  return (core.data.evaluations || []).find(e => e.taskId === taskId && e.folderName === folderName) || null;
}
function upsertEval(taskId, a, scores, total, comment) {
  const list = core.data.evaluations;
  let e = list.find(x => x.taskId === taskId && x.folderName === a.folderName);
  if (!e) {
    e = { id: uid('ev'), taskId, folderName: a.folderName, createdAt: Date.now() };
    list.push(e);
  }
  e.studentId = a.studentId;
  e.studentName = a.studentName;
  e.fileCount = a.fileCount;
  e.autoScores = a.autoScores;
  e.scores = scores;
  e.total = total;
  e.comment = comment || '';
  e.flags = a.flags;
  e.updatedAt = Date.now();
  return e;
}
function parseRoster(text) {
  const rows = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t) return;
    const parts = t.split(/[\s,，\t]+/).filter(Boolean);
    if (parts.length >= 2) rows.push({ sid: parts[0], name: parts.slice(1).join(' ') });
    else rows.push({ sid: '', name: parts[0] });
  });
  return rows;
}

/* ============ 页面骨架 ============ */
function shell(content) {
  const tname = (core.data && core.data.profile && core.data.profile.name) || '';
  return `<div class="container teacher-shell">
    <div class="teacher-top">
      <div class="teacher-brand">
        <span class="teacher-badge">${icon('user', 15)} 教师端</span>
        <h1>教学管理${tname ? `<span class="teacher-name">${esc(tname)}</span>` : ''}</h1>
        <p>实训任务 · 学生名单 · 作品检测与评分 · AI 评审辅助</p>
      </div>
      <div class="teacher-actions">
        <button class="btn btn-ghost btn-sm" id="tLock">${icon('settings', 14)} 锁定</button>
        <button class="btn btn-ghost btn-sm" id="tSettings">${icon('settings', 14)} 设置</button>
        <a class="btn btn-ghost btn-sm" href="#/">返回学生端</a>
      </div>
    </div>
    <div class="teacher-tabs" id="teacherTabs">
      ${TABS.map(([id, label, ic]) => `<button class="teacher-tab ${state.tab === id ? 'active' : ''}" data-tab="${id}">${icon(ic, 15)} ${label}</button>`).join('')}
    </div>
    <div id="teacherBody">${content}</div>
    <div class="teacher-foot">教师数据使用口令派生密钥（PBKDF2 + AES-GCM）加密，仅保存在本机浏览器；学生端不显示教师入口。</div>
  </div>`;
}

function lockScreen(mode) {
  const setup = mode === 'setup';
  return `<div class="container" style="min-height:70vh;display:grid;place-items:center;padding:60px 24px">
    <div class="card teacher-lock">
      <div class="lock-icon">${icon('user', 26)}</div>
      <div class="eyebrow">Teacher Console</div>
      <h2>${setup ? '首次使用：设置教师口令' : '教师端已锁定'}</h2>
      <p>${setup
        ? '口令用于加密本机教师数据（学生名单、成绩、评语），至少 6 位。请妥善保存——忘记口令将无法恢复数据。'
        : '输入教师口令解锁。教师入口不显示在学生导航中，学生无法进入管理界面。'}</p>
      <div class="lock-form">
        ${setup ? `<input id="pass1" type="password" placeholder="设置口令（至少 6 位）" autocomplete="new-password">
          <input id="pass2" type="password" placeholder="再次输入口令" autocomplete="new-password">`
        : `<input id="pass1" type="password" placeholder="教师口令" autocomplete="current-password">`}
        <button class="btn btn-primary" id="unlockBtn">${setup ? '创建并进入' : '解锁教师端'}</button>
      </div>
      ${setup ? '' : `<div class="lock-hint">
        <button class="link-arrow" id="showImport">使用加密备份恢复</button>
        <span>·</span>
        <span>忘记口令只能重新开始</span>
      </div>`}
      ${setup ? `<div class="lock-hint" style="margin-top:14px">
        <span>已有其他电脑上的教师数据？</span>
        <button class="link-arrow" id="showImport">导入加密备份</button>
      </div>` : ''}
      <div class="lock-msg" id="lockMsg"></div>
    </div>
  </div>`;
}

/* ============ 各 Tab 内容 ============ */
function overviewTab() {
  const d = core.data;
  const evals = d.evaluations || [];
  const students = allStudents();
  const avg = evals.length ? Math.round(evals.reduce((a, e) => a + (e.total || 0), 0) / evals.length) : 0;
  const recent = evals.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
  return `<div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)">
    <div class="kpi"><div class="k-lbl">班级</div><div class="k-val">${(d.classes || []).length}</div><div class="k-sub">含 ${students.length} 名学生</div></div>
    <div class="kpi"><div class="k-lbl">实训任务</div><div class="k-val">${(d.tasks || []).length}</div><div class="k-sub">可随时新建</div></div>
    <div class="kpi"><div class="k-lbl">已评估作品</div><div class="k-val">${evals.length}</div><div class="k-sub">含自动检测 + 人工评分</div></div>
    <div class="kpi"><div class="k-lbl">平均总分</div><div class="k-val">${avg}<small>分</small></div><div class="k-sub">按已评估作品统计</div></div>
    <div class="kpi"><div class="k-lbl">AI 辅助</div><div class="k-val">${(d.settings && d.settings.apiKey) ? '已配置' : '本地规则'}</div><div class="k-sub">可接入在线大模型</div></div>
  </div>
  <div class="dash-grid">
    <div class="dash-card">
      <h3>最近评估</h3>
      <div class="d-sub">按更新时间排序</div>
      ${recent.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>学生</th><th>任务</th><th>总分</th><th>时间</th></tr></thead><tbody>
        ${recent.map(e => `<tr><td>${esc(e.studentName || e.folderName)}</td><td>${esc((findTask(e.taskId) || {}).title || '-')}</td><td class="mono">${e.total}</td><td>${new Date(e.updatedAt || Date.now()).toLocaleDateString('zh-CN')}</td></tr>`).join('')}
      </tbody></table></div>` : '<p style="color:var(--muted);font-size:13px">还没有评估记录。先到「实训任务」建任务，再到「实训评估」选择学生提交文件夹。</p>'}
    </div>
    <div class="dash-card">
      <h3>三步开始评估</h3>
      <div class="d-sub">建议流程</div>
      <ol class="teacher-steps">
        <li><b>建任务</b>：填写实训要求、截止时间、评分权重</li>
        <li><b>收作品</b>：让学生按「学号_姓名」建文件夹，放入 .spp、贴图、预览图</li>
        <li><b>扫文件夹</b>：自动检测缺图/分辨率/工程文件，再 AI 或人工评分</li>
      </ol>
      <button class="btn btn-primary btn-sm" data-goto="eval">${icon('layers', 15)} 去评估作品</button>
    </div>
  </div>`;
}

function classesTab() {
  const d = core.data;
  return `<div class="dash-grid" style="grid-template-columns:1fr 1.2fr;align-items:start">
    <div class="dash-card">
      <h3>新建班级</h3>
      <div class="d-sub">名单支持「学号 姓名」每行一条，也支持只写姓名</div>
      <input class="t-input" id="className" placeholder="班级名称，如：数字媒体 2401">
      <textarea class="t-input t-area" id="classRoster" rows="6" placeholder="20240101 张同学&#10;20240102 李同学"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" id="addClass">${icon('check', 15)} 创建班级</button>
        <button class="btn btn-ghost btn-sm" id="importExcel">${icon('download', 15)} 导入 Excel / CSV</button>
        <input type="file" id="excelInput" accept=".xlsx,.xls,.csv" style="display:none">
      </div>
      <div class="settings-note" style="margin-top:14px">
        Excel 识别规则：表头包含「学号 / 姓名」列即可（如：学号、姓名、班级）；没有表头时默认第 1 列学号、第 2 列姓名。
        导入时选择「并入已有班级」或「新建班级」。
      </div>
    </div>
    <div class="dash-card">
      <h3>班级列表</h3>
      <div class="d-sub">共 ${(d.classes || []).length} 个班级 · 点学生可管理登录与权限</div>
      ${(d.classes || []).length ? (d.classes || []).map(c => {
        const students = (c.students || []).map(ensureStudent);
        const disabled = students.filter(s => !s.enabled).length;
        return `<div class="teacher-class">
        <div class="tc-head"><b>${esc(c.name)}</b>
          <span>${students.length} 人${disabled ? ' · 停用 ' + disabled : ''}</span>
          <div class="tc-head-actions">
            <button class="btn btn-ghost btn-xs" data-export-class="${c.id}">${icon('download', 12)} 导出名单</button>
            <button class="icon-btn" data-del-class="${c.id}" title="删除班级">${icon('close', 14)}</button>
          </div>
        </div>
        <div class="student-table-wrap">
          <table class="data student-table">
            <thead><tr><th>学号</th><th>姓名</th><th>角色</th><th>登录</th><th>看成绩</th><th>口令</th><th style="width:150px">操作</th></tr></thead>
            <tbody>
              ${students.map(s => `<tr data-student="${esc(s.sid || s.name)}" data-class="${c.id}">
                <td class="mono">${esc(s.sid || '-')}</td>
                <td>${esc(s.name)}</td>
                <td><span class="tag ${s.role === 'leader' ? 'gold' : ''}">${s.role === 'leader' ? '课代表' : '学生'}</span></td>
                <td><button class="chip ${s.enabled ? 'active' : ''}" data-toggle-student="${esc(s.sid || s.name)}" data-class="${c.id}" data-field="enabled">${s.enabled ? '启用' : '停用'}</button></td>
                <td><button class="chip ${s.permissions.viewGrades ? 'active' : ''}" data-toggle-student="${esc(s.sid || s.name)}" data-class="${c.id}" data-field="viewGrades">${s.permissions.viewGrades ? '可见' : '隐藏'}</button></td>
                <td>${s.passwordHash ? '<span class="tag teal">已设置</span>' : '<span class="tag">默认</span>'}</td>
                <td class="student-ops">
                  <button class="btn btn-ghost btn-xs" data-edit-student="${esc(s.sid || s.name)}" data-class="${c.id}">编辑</button>
                  <button class="btn btn-ghost btn-xs" data-pwd-student="${esc(s.sid || s.name)}" data-class="${c.id}">口令</button>
                  <button class="btn btn-ghost btn-xs" data-del-student="${esc(s.sid || s.name)}" data-class="${c.id}">移除</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="7" style="color:var(--muted)">暂无学生，可导入 Excel 或手动添加</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="student-add">
          <input class="t-input" data-add-sid="${c.id}" placeholder="学号" style="max-width:150px">
          <input class="t-input" data-add-name="${c.id}" placeholder="姓名" style="max-width:120px">
          <button class="btn btn-primary btn-xs" data-add-student="${c.id}">${icon('check', 12)} 添加学生</button>
        </div>
      </div>`;
      }).join('') : '<p style="color:var(--muted);font-size:13px">还没有班级。左侧创建，或从 Excel 名单导入。</p>'}
    </div>
  </div>`;
}

function taskFormHtml(task) {
  const t = task || { weights: DEFAULT_WEIGHTS, requiredMaps: MAP_DEFS.filter(m => m.requiredByDefault).map(m => m.key), minRes: 2048 };
  return `<div class="dash-card">
    <h3>${task ? '编辑任务' : '新建实训任务'}</h3>
    <div class="t-grid2">
      <label>任务名称<input class="t-input" id="taskTitle" value="${esc(t.title || '')}" placeholder="如：旧金属武器材质实训"></label>
      <label>截止时间<input class="t-input" id="taskDeadline" type="date" value="${esc(t.deadline || '')}"></label>
    </div>
    <label>任务要求<textarea class="t-input t-area" id="taskDesc" rows="3" placeholder="提交要求：.spp 工程 + BaseColor/Normal/Roughness/Metallic 贴图 + 2 张预览图，2K 分辨率">${esc(t.desc || '')}</textarea></label>
    <div class="t-grid2">
      <label>最低贴图分辨率
        <select class="t-input" id="taskMinRes">
          ${[512, 1024, 2048, 4096].map(n => `<option value="${n}" ${Number(t.minRes) === n ? 'selected' : ''}>${n}px</option>`).join('')}
        </select>
      </label>
      <div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:6px">必需 PBR 通道</div>
        <div class="map-checks">${MAP_DEFS.map(m => `<label class="map-check"><input type="checkbox" value="${m.key}" ${(t.requiredMaps || []).includes(m.key) ? 'checked' : ''}> ${m.label}</label>`).join('')}</div>
      </div>
    </div>
    <div class="weights-row">
      ${Object.entries({ completeness: '完整性', texture: '贴图质量', uv: 'UV与结构', presentation: '展示', creativity: '创意' }).map(([k, label]) =>
        `<label>${label}<input class="t-input t-num" type="number" min="0" max="100" id="w_${k}" value="${t.weights ? t.weights[k] : DEFAULT_WEIGHTS[k]}"></label>`).join('')}
      <span class="weights-sum" id="weightsSum">合计 100%</span>
    </div>
    <div style="display:flex;gap:10px;margin-top:10px">
      <button class="btn btn-primary btn-sm" id="saveTask">${icon('check', 15)} ${task ? '保存修改' : '创建任务'}</button>
      ${task ? '<button class="btn btn-ghost btn-sm" id="cancelTaskEdit">取消编辑</button>' : ''}
    </div>
  </div>`;
}

function tasksTab() {
  const d = core.data;
  const editing = state.editTaskId ? findTask(state.editTaskId) : null;
  return `<div class="dash-grid" style="grid-template-columns:1.1fr 1fr;align-items:start">
    ${taskFormHtml(editing)}
    <div class="dash-card">
      <h3>任务列表</h3>
      <div class="d-sub">点击任务可设为当前评估任务</div>
      ${(d.tasks || []).length ? (d.tasks || []).map(t => `<div class="teacher-task ${state.taskId === t.id ? 'active' : ''}">
        <div class="tt-main">
          <b>${esc(t.title)}</b>
          <span>截止 ${esc(t.deadline || '未设')} · 最低 ${t.minRes}px · 必需 ${(t.requiredMaps || []).length} 通道</span>
        </div>
        <div class="tt-actions">
          <button class="btn btn-ghost btn-xs" data-pick-task="${t.id}">${state.taskId === t.id ? '当前任务' : '设为当前'}</button>
          <button class="btn btn-ghost btn-xs" data-edit-task="${t.id}">编辑</button>
          <button class="icon-btn" data-del-task="${t.id}">${icon('close', 13)}</button>
        </div>
      </div>`).join('') : '<p style="color:var(--muted);font-size:13px">还没有任务，先在左侧创建。</p>'}
    </div>
  </div>`;
}

function evalTab() {
  const d = core.data;
  const tasks = d.tasks || [];
  const task = findTask(state.taskId) || tasks[0] || null;
  const analyses = state.analyses || [];
  const saved = task ? (d.evaluations || []).filter(e => e.taskId === task.id) : [];
  return `<div class="dash-card">
    <h3>实训评估</h3>
    <div class="d-sub">选择任务 → 选择学生提交文件夹（每个学生一个子文件夹，名字含学号或姓名）→ 自动检测 → 评分/导出 AI 评审任务书</div>
    <div class="eval-toolbar">
      <label>当前任务
        <select class="t-input" id="evalTask">
          ${tasks.length ? tasks.map(t => `<option value="${t.id}" ${task && task.id === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('') : '<option value="">请先创建任务</option>'}
        </select>
      </label>
      <label>提交根目录绝对路径（用于 AI 任务书）
        <input class="t-input" id="submissionRoot" value="${esc((core.data.settings || {}).submissionRoot || '')}" placeholder="如 D:\\submissions\\2026-11">
      </label>
      <div class="eval-btns">
        <button class="btn btn-primary btn-sm" id="pickFolder" ${tasks.length ? '' : 'disabled'}>${icon('box', 15)} 选择提交文件夹</button>
        <input type="file" id="folderInput" webkitdirectory multiple style="display:none">
        <button class="btn btn-ghost btn-sm" id="exportAllPack" ${analyses.length ? '' : 'disabled'}>${icon('download', 14)} 导出全部 AI 任务书</button>
        <button class="btn btn-ghost btn-sm" id="clearScan" ${analyses.length ? '' : 'disabled'}>清空扫描</button>
      </div>
    </div>
    <div class="eval-hint">
      文件夹结构示例：<code>提交根目录\\20240101_张三\\*.spp</code>、<code>…\\*_BaseColor.png</code>、<code>…\\preview.jpg</code>。
      系统会检测：必需通道是否齐全、贴图分辨率、分辨率一致性、工程文件、预览图数量，并给出自动分。
    </div>
    ${state.scanning ? '<div class="eval-loading"><div class="typing"><i></i><i></i><i></i></div> 正在扫描与读取文件…</div>' : ''}
    ${analyses.length ? `<div class="eval-summary">
      共扫描 <b>${analyses.length}</b> 份提交 · 自动评分平均 <b>${Math.round(analyses.reduce((a, x) => a + x.total, 0) / analyses.length)}</b> 分 · 已保存评估 <b>${saved.length}</b> 份
    </div>` : ''}
    <div class="eval-list">
      ${analyses.map((a, i) => evalCard(a, i, task)).join('')}
    </div>
    ${!analyses.length && !state.scanning ? '<div class="eval-empty">' + icon('layers', 34) + '<p>还没有扫描结果。点击「选择提交文件夹」，选中包含所有学生子文件夹的根目录。</p></div>' : ''}
  </div>`;
}

function evalCard(a, i, task) {
  const saved = task ? findEval(task.id, a.folderName) : null;
  const scores = (saved && saved.scores) || a.draftScores;
  const total = saved ? saved.total : a.total;
  const lv = levelOfScore(total);
  const expanded = state.expanded.has(a.folderName);
  const thumbs = [];
  for (const k of Object.keys(a.maps)) {
    const f = a.maps[k];
    if (f.thumb) thumbs.push(`<figure class="tex-thumb"><img src="${f.thumb}" alt=""><figcaption>${esc(MAP_DEFS.find(m => m.key === k).label)}${f.w ? ` ${f.w}×${f.h}` : ''}</figcaption></figure>`);
  }
  for (const p of a.previews.slice(0, 3)) {
    if (p.thumb) thumbs.push(`<figure class="tex-thumb preview"><img src="${p.thumb}" alt=""><figcaption>${esc(p.name)}</figcaption></figure>`);
  }
  return `<article class="eval-card ${expanded ? 'expanded' : ''}" data-folder="${esc(a.folderName)}">
    <div class="ec-head">
      <div class="ec-title">
        <b>${esc(a.studentName)}</b>
        ${a.studentId ? `<span class="tag">${esc(a.studentId)}</span>` : ''}
        <span class="tag ${a.matched ? 'teal' : ''}">${a.matched ? '已匹配名单' : '未匹配名单'}</span>
        <span class="tag ${lv.cls}">${total} 分 · ${lv.text}</span>
      </div>
      <div class="ec-meta">${a.fileCount} 个文件 · ${(a.totalBytes / 1048576).toFixed(1)} MB · ${a.folderName}</div>
      <div class="ec-actions">
        <button class="btn btn-ghost btn-xs" data-toggle-eval="${esc(a.folderName)}">${expanded ? '收起' : '展开评分'}</button>
        ${task ? `<button class="btn btn-primary btn-xs" data-save-eval="${esc(a.folderName)}">${icon('check', 13)} 保存评分</button>` : ''}
      </div>
    </div>
    <div class="ec-flags">${a.flags.map(f => `<span class="flag ${f.level}">${esc(f.msg)}</span>`).join('')}</div>
    ${expanded ? `<div class="ec-body">
      <div class="ec-files">
        <h4>提交文件（${a.files.length}）</h4>
        <div class="file-table">${a.files.slice(0, 60).map(f => `<div class="ft-row"><span>${esc(f.path)}</span><span>${(f.size / 1024).toFixed(0)} KB</span></div>`).join('')}</div>
        ${a.spps.length ? `<div class="spp-info">工程文件：${a.spps.map(s => `${esc(s.name)}${s.entries ? `（内部 ${s.entries} 个条目）` : ''}`).join('、')}</div>` : ''}
        ${thumbs.length ? `<div class="tex-thumbs">${thumbs.join('')}</div>` : ''}
      </div>
      <div class="ec-score">
        <h4>评分（权重来自任务）</h4>
        <div class="score-grid">
          ${Object.entries({ completeness: '完整性', texture: '贴图质量', uv: 'UV与结构', presentation: '展示', creativity: '创意' }).map(([k, label]) => `
            <label>${label} <span class="w">(${a.weights[k]}%)</span>
              <input type="number" min="0" max="100" class="t-input t-num score-input" data-key="${k}" value="${scores[k] != null ? scores[k] : 70}">
            </label>`).join('')}
        </div>
        <div class="score-total">加权总分：<b id="total-${i}">${total}</b> 分</div>
        <textarea class="t-input t-area" rows="3" placeholder="教师评语（可点 AI 生成）" id="comment-${i}">${esc(saved ? saved.comment || '' : localComment(a))}</textarea>
        <div class="ec-ai">
          <button class="btn btn-ghost btn-xs" data-ai-comment="${esc(a.folderName)}">${icon('bot', 13)} AI 生成评语</button>
          <button class="btn btn-ghost btn-xs" data-copy-prompt="${esc(a.folderName)}">${icon('copy', 13)} 复制提示词</button>
          <button class="btn btn-ghost btn-xs" data-export-pack="${esc(a.folderName)}">${icon('download', 13)} 导出 AI 任务书</button>
          <button class="btn btn-ghost btn-xs" data-import-ai="${esc(a.folderName)}">${icon('external', 13)} 导入 AI 结果</button>
        </div>
      </div>
    </div>` : ''}
  </article>`;
}

function gradesTab() {
  const d = core.data;
  const evals = (d.evaluations || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const avg = evals.length ? Math.round(evals.reduce((a, e) => a + (e.total || 0), 0) / evals.length) : 0;
  return `<div class="dash-card">
    <h3>成绩汇总</h3>
    <div class="d-sub">共 ${evals.length} 条评估记录 · 平均 ${avg} 分</div>
    <div style="display:flex;gap:10px;margin:12px 0">
      <button class="btn btn-ghost btn-sm" id="exportGrades">${icon('download', 14)} 导出 CSV</button>
    </div>
    ${evals.length ? `<div class="table-wrap"><table class="data"><thead><tr>
      <th>学生</th><th>学号</th><th>任务</th><th>完整性</th><th>贴图</th><th>UV</th><th>展示</th><th>创意</th><th>总分</th><th>时间</th>
    </tr></thead><tbody>
      ${evals.map(e => `<tr>
        <td>${esc(e.studentName || e.folderName)}</td><td class="mono">${esc(e.studentId || '-')}</td>
        <td>${esc((findTask(e.taskId) || {}).title || '-')}</td>
        ${['completeness', 'texture', 'uv', 'presentation', 'creativity'].map(k => `<td class="mono">${(e.scores || {})[k] != null ? e.scores[k] : '-'}</td>`).join('')}
        <td class="mono"><b>${e.total}</b></td>
        <td>${new Date(e.updatedAt || Date.now()).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      </tr>`).join('')}
    </tbody></table></div>` : '<p style="color:var(--muted);font-size:13px">还没有成绩。到「实训评估」扫描作品并保存评分。</p>'}
  </div>`;
}

/* ===== 发布与访问 ===== */
function serverTab() {
  return `<div class="dash-grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="dash-card">
      <h3>本地服务器状态</h3>
      <div class="d-sub">学生登录、访问控制依赖启动器提供的本地服务</div>
      <div id="serverStatus" class="server-status">检测中…</div>
      <div class="server-entry" id="serverEntry" style="display:none"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-primary btn-sm" id="publishBtn">${icon('external', 15)} 发布名单与成绩到服务器</button>
        <button class="btn btn-ghost btn-sm" id="resetPwAll">重置全部初始口令</button>
        <button class="btn btn-ghost btn-sm" id="refreshServer">${icon('refresh', 14)} 刷新状态</button>
      </div>
      <div class="settings-note" style="margin-top:14px">
        发布内容：班级与学生名单（含口令哈希）、实训任务、成绩与评语。学生用「学号 + 口令」在
        <code>#/student</code> 查看任务和成绩；名单只存在本地服务器，不会进入在线镜像。
        默认初始口令为学号后 6 位（无数字则用完整学号）。
      </div>
    </div>
    <div class="dash-card">
      <h3>访问控制（最高权限）</h3>
      <div class="d-sub">教师端仅本机可管理；这里控制其他地址能否访问平台</div>
      <div id="accessPanel" class="access-panel">检测中…</div>
      <div class="access-actions" id="accessActions" style="display:none">
        <button class="btn btn-primary btn-sm" id="saveAccess">${icon('check', 15)} 保存访问设置</button>
        <button class="btn btn-ghost btn-sm" id="pauseAccess" style="color:var(--warn)">立即禁止其他地址访问</button>
      </div>
    </div>
  </div>`;
}

function renderAccessPanel(access) {
  const el = document.getElementById('accessPanel');
  const actions = document.getElementById('accessActions');
  if (!el) return;
  const mode = (access && access.mode) || 'all';
  const wl = ((access && access.whitelist) || []).join('\n');
  const modes = [
    ['all', '全部放开', '学生、外网 IPv6/隧道均可访问'],
    ['lan', '仅局域网', '只允许同一 WiFi/局域网内设备访问'],
    ['local', '仅本机', '禁止其他地址访问，只留教师本机使用'],
    ['whitelist', '仅白名单', '只允许下面列出的 IP 地址']
  ];
  el.innerHTML = `<div class="access-modes">${modes.map(([k, name, desc]) => `
    <label class="access-opt ${mode === k ? 'active' : ''}">
      <input type="radio" name="accessMode" value="${k}" ${mode === k ? 'checked' : ''}>
      <span><b>${name}</b><em>${desc}</em></span>
    </label>`).join('')}</div>
    <textarea class="t-input t-area" id="whitelist" rows="3" placeholder="白名单 IP，每行一个，例如 192.168.1.50">${esc(wl)}</textarea>
    <div class="access-current">当前模式：<b>${modes.find(m => m[0] === mode)?.[1] || mode}</b>${access && access.updatedAt ? ` · 更新于 ${esc(access.updatedAt)}` : ''}</div>`;
  if (actions) actions.style.display = '';
}
const API_PREFIX = ['http:', 'https:'].includes(location.protocol) && !/\.github\.io$/i.test(location.hostname) ? '' : null;

async function ensureServer() {
  if (API_PREFIX === null) throw new Error('在线镜像不支持本地服务接口，请在教室电脑上运行启动器');
  const info = await api('/api/health');
  serverState.info = info;
  if (!info.local) throw new Error('当前不是教师本机访问，无法管理服务器');
  const k = await api('/api/teacher/key');
  serverState.key = k.key;
  serverState.access = await api('/api/access', { headers: { 'X-Teacher-Key': serverState.key } });
  return true;
}

async function initServerTab(statusEl) {
  try {
    await ensureServer();
    const info = serverState.info;
    statusEl.className = 'server-status ok';
    statusEl.innerHTML = `${icon('check', 15)} 本地服务正常 · 当前访问模式：<b>${esc(info.mode)}</b> · ${esc(info.time)}`;
    renderAccessPanel(serverState.access);
    try {
      const ep = await fetch('data/endpoints.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null);
      serverState.endpoints = ep;
      const entry = document.getElementById('serverEntry');
      if (ep && entry) {
        entry.style.display = '';
        entry.innerHTML = `<div class="d-sub">学生访问地址</div>
          <div class="server-url"><code>${esc(ep.lan || '')}</code>（局域网）</div>
          ${ep.ipv6 ? `<div class="server-url"><code>${esc(ep.ipv6)}</code>（公网 IPv6）</div>` : ''}
          <div style="margin-top:8px"><a class="btn btn-ghost btn-sm" href="#/student" target="_blank">打开学生登录页</a></div>`;
      }
    } catch (e) { }
  } catch (e) {
    statusEl.className = 'server-status err';
    statusEl.innerHTML = `${icon('info', 15)} ${esc(e.message)}`;
    const panel = document.getElementById('accessPanel');
    if (panel) panel.innerHTML = '<p style="color:var(--muted);font-size:13px">访问控制需要本地服务，请在运行启动器的电脑上打开教师端。</p>';
  }
}

function buildPublishPayload() {
  const students = [];
  (core.data.classes || []).forEach(c => (c.students || []).forEach(raw => {
    const s = ensureStudent(raw);
    if (!s.sid) return;
    students.push({
      sid: s.sid, name: s.name, className: c.name,
      enabled: s.enabled !== false, role: s.role || 'student',
      permissions: s.permissions, passwordHash: s.passwordHash || ''
    });
  }));
  const tasks = (core.data.tasks || []).map(t => ({
    id: t.id, title: t.title, desc: t.desc, deadline: t.deadline,
    minRes: t.minRes, requiredMaps: t.requiredMaps, weights: t.weights
  }));
  const grades = (core.data.evaluations || []).filter(e => e.studentId).map(e => ({
    sid: e.studentId, studentName: e.studentName, folderName: e.folderName,
    taskId: e.taskId, scores: e.scores, total: e.total, comment: e.comment,
    updatedAt: e.updatedAt
  }));
  return { students, tasks, grades };
}

async function publishToServer() {
  if (!serverState.key) { toast('请先刷新并连接本地服务'); return; }
  let hashed = 0;
  for (const c of core.data.classes || []) for (const raw of c.students || []) {
    const s = ensureStudent(raw);
    if (s.sid && !s.passwordHash) {
      s.passwordHash = await hashPassword(s.sid, defaultPassword(s.sid));
      s.passwordHint = 'sid6';
      hashed++;
    }
  }
  await core.save();
  const payload = buildPublishPayload();
  const r = await api('/api/teacher/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Teacher-Key': serverState.key },
    body: JSON.stringify(payload)
  });
  toast(`已发布：${r.students} 名学生、${r.tasks} 个任务、${r.grades} 条成绩${hashed ? `（新生成 ${hashed} 个默认口令）` : ''}`, 'ok');
}

/* ===== Excel 导入 ===== */
async function importExcelFile(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (!rows.length) throw new Error('表格没有内容');
  let headerIdx = -1, sidCol = 0, nameCol = 1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const cells = rows[i].map(c => String(c).trim().toLowerCase());
    const si = cells.findIndex(c => /学号|学生学号|sid|编号/.test(c));
    const ni = cells.findIndex(c => /姓名|名字|学生姓名|name/.test(c));
    if (si >= 0 || ni >= 0) {
      headerIdx = i;
      sidCol = si >= 0 ? si : 0;
      nameCol = ni >= 0 ? ni : (si === 0 ? 1 : 0);
      break;
    }
  }
  const students = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const sid = String(r[sidCol] == null ? '' : r[sidCol]).trim();
    const name = String(r[nameCol] == null ? '' : r[nameCol]).trim();
    if (!sid && !name) continue;
    students.push({ sid, name: name || sid });
  }
  if (!students.length) throw new Error('没有识别到学生数据（请检查是否包含学号/姓名列）');
  showExcelPreview(file.name, students);
}

function showExcelPreview(fileName, students) {
  const d = core.data;
  const suggested = String(fileName || '导入班级').replace(/\.(xlsx|xls|csv)$/i, '');
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop show';
  bd.innerHTML = `<div class="modal" style="position:relative;max-width:680px">
    <button class="icon-btn m-close">${icon('close', 16)}</button>
    <h2>导入名单预览</h2>
    <p style="color:var(--muted);font-size:13px;margin-top:8px">识别到 <b style="color:var(--gold)">${students.length}</b> 名学生（来自 ${esc(fileName)}）</p>
    <div class="table-wrap" style="max-height:240px;overflow:auto"><table class="data"><thead><tr><th>#</th><th>学号</th><th>姓名</th></tr></thead><tbody>
      ${students.slice(0, 12).map((s, i) => `<tr><td class="mono">${i + 1}</td><td class="mono">${esc(s.sid)}</td><td>${esc(s.name)}</td></tr>`).join('')}
    </tbody></table></div>
    ${students.length > 12 ? `<p style="color:var(--muted);font-size:12px">仅显示前 12 条…</p>` : ''}
    <div class="t-grid2" style="margin-top:14px">
      <label>导入方式
        <select class="t-input" id="excelTarget">
          <option value="__new">新建班级：${esc(suggested)}</option>
          ${(d.classes || []).map(c => `<option value="${c.id}">并入已有班级：${esc(c.name)}</option>`).join('')}
        </select>
      </label>
      <label>新建班级名称<input class="t-input" id="excelClassName" value="${esc(suggested)}"></label>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost btn-sm" id="excelCancel">取消</button>
      <button class="btn btn-primary btn-sm" id="excelConfirm">${icon('check', 15)} 确认导入</button>
    </div>
  </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.querySelector('.m-close').onclick = close;
  bd.querySelector('#excelCancel').onclick = close;
  bd.querySelector('#excelConfirm').onclick = async () => {
    const target = bd.querySelector('#excelTarget').value;
    let cls;
    if (target === '__new') {
      const name = bd.querySelector('#excelClassName').value.trim() || suggested;
      cls = { id: uid('cls'), name, students: [], createdAt: Date.now() };
      core.data.classes.push(cls);
    } else {
      cls = core.data.classes.find(c => c.id === target);
    }
    if (!cls) return;
    cls.students = cls.students || [];
    let added = 0, updated = 0;
    students.forEach(st => {
      const existed = cls.students.find(x => (st.sid && x.sid === st.sid) || (!st.sid && x.name === st.name));
      if (existed) { existed.name = st.name || existed.name; updated++; }
      else { cls.students.push(ensureStudent({ sid: st.sid, name: st.name })); added++; }
    });
    await core.save();
    close();
    toast(`导入完成：新增 ${added} 人${updated ? '，更新 ' + updated + ' 人' : ''}`, 'ok');
    rerender();
  };
}

/* ===== 学生管理弹窗 ===== */
function studentModal(classId, key, type) {
  const cls = core.data.classes.find(c => c.id === classId);
  if (!cls) return;
  const s = (cls.students || []).map(ensureStudent).find(x => (x.sid || x.name) === key);
  if (!s) return;
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop show';
  const edit = type === 'edit';
  bd.innerHTML = `<div class="modal" style="position:relative;max-width:480px">
    <button class="icon-btn m-close">${icon('close', 16)}</button>
    <h2>${edit ? '编辑学生' : '设置登录口令'}</h2>
    ${edit ? `<div class="t-grid2" style="margin-top:14px">
      <label>学号<input class="t-input" id="sSid" value="${esc(s.sid || '')}"></label>
      <label>姓名<input class="t-input" id="sName" value="${esc(s.name || '')}"></label>
    </div>
    <label>角色<select class="t-input" id="sRole">
      <option value="student" ${s.role !== 'leader' ? 'selected' : ''}>学生</option>
      <option value="leader" ${s.role === 'leader' ? 'selected' : ''}>课代表</option>
    </select></label>`
      : `<p style="color:var(--muted);font-size:13px;margin-top:10px">为 <b>${esc(s.name)}</b>（${esc(s.sid || '无学号')}）设置新口令。默认规则：学号后 6 位。</p>
    <label>新口令<input class="t-input" id="sPwd" placeholder="输入新口令，留空则用默认规则"></label>`}
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost btn-sm" id="sCancel">取消</button>
      <button class="btn btn-primary btn-sm" id="sSave">${icon('check', 15)} 保存</button>
    </div>
  </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.querySelector('.m-close').onclick = close;
  bd.querySelector('#sCancel').onclick = close;
  bd.querySelector('#sSave').onclick = async () => {
    if (edit) {
      const nsid = bd.querySelector('#sSid').value.trim();
      const nname = bd.querySelector('#sName').value.trim();
      if (!nname) return toast('姓名不能为空');
      const dup = (cls.students || []).find(x => x !== s && nsid && x.sid === nsid);
      if (dup) return toast('学号已存在');
      s.sid = nsid; s.name = nname; s.role = bd.querySelector('#sRole').value;
    } else {
      const pwd = bd.querySelector('#sPwd').value.trim() || defaultPassword(s.sid);
      if (pwd.length < 6) return toast('口令至少 6 位');
      s.passwordHash = await hashPassword(s.sid, pwd);
      s.passwordHint = bd.querySelector('#sPwd').value.trim() ? 'custom' : 'sid6';
    }
    await core.save();
    close();
    toast('已保存', 'ok');
    rerender();
  };
}

function exportClassRoster(classId) {
  const cls = core.data.classes.find(c => c.id === classId);
  if (!cls) return;
  loadXlsx().then(XLSX => {
    const rows = [['学号', '姓名', '班级', '角色', '登录', '看成绩', '口令状态']];
    (cls.students || []).map(ensureStudent).forEach(s => {
      rows.push([s.sid || '', s.name || '', cls.name, s.role === 'leader' ? '课代表' : '学生',
        s.enabled ? '启用' : '停用', s.permissions.viewGrades ? '可见' : '隐藏', s.passwordHash ? '已设置' : '默认']);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '名单');
    XLSX.writeFile(wb, cls.name + '-学生名单.xlsx');
    toast('名单已导出', 'ok');
  }).catch(e => toast('导出失败：' + e.message, 'err'));
}

function bodyForTab() {
  if (state.tab === 'classes') return classesTab();
  if (state.tab === 'tasks') return tasksTab();
  if (state.tab === 'eval') return evalTab();
  if (state.tab === 'grades') return gradesTab();
  if (state.tab === 'server') return serverTab();
  return overviewTab();
}

/* ============ 事件与业务 ============ */
function settingsModal() {
  const s = core.data.settings || {};
  const profile = core.data.profile || {};
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop show';
  bd.innerHTML = `<div class="modal" style="position:relative;max-width:620px">
    <button class="icon-btn m-close" aria-label="关闭">${icon('close', 16)}</button>
    <h2>教师设置</h2>
    <div class="t-grid2" style="margin-top:14px">
      <label>教师姓名<input class="t-input" id="tName" value="${esc(profile.name || '')}" placeholder="显示在教师端标题"></label>
      <label>学校 / 院系<input class="t-input" id="tSchool" value="${esc(profile.school || '')}" placeholder="选填"></label>
    </div>
    <div class="t-grid2" style="margin-top:6px">
      <label>接口地址<input class="t-input" id="tApiBase" value="${esc(s.apiBase || 'https://api.deepseek.com')}"></label>
      <label>模型<input class="t-input" id="tModel" value="${esc(s.model || 'deepseek-chat')}"></label>
    </div>
    <label style="display:block;margin-top:10px">API Key（仅存本机加密数据）<input class="t-input" id="tApiKey" type="password" value="${esc(s.apiKey || '')}" placeholder="sk-..."></label>
    <label style="display:block;margin-top:10px">自动锁定（分钟）<input class="t-input" id="tLockMin" type="number" min="5" max="240" value="${esc(s.autoLockMinutes || 30)}"></label>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" id="saveSettings">${icon('check', 15)} 保存</button>
      <button class="btn btn-ghost btn-sm" id="changePass">修改口令</button>
      <button class="btn btn-ghost btn-sm" id="exportBackup">${icon('download', 14)} 导出加密备份</button>
      <button class="btn btn-ghost btn-sm" id="importMerge">${icon('external', 14)} 导入备份（合并）</button>
      <button class="btn btn-ghost btn-sm" id="importReplace">${icon('external', 14)} 导入备份（覆盖）</button>
    </div>
    <div class="settings-note">
      <b>换电脑 / 其他老师使用：</b>本机数据加密保存。在 A 电脑「导出加密备份」→ 把 json 文件发给 B 老师（或放到网盘）→ B 电脑打开平台教师端 → 「导入备份（合并）」→ 输入该备份的口令即可。
      合并模式会按班级名、任务名、学生文件夹去重，多台电脑的评估记录可以汇总；覆盖模式会用备份完整替换当前数据。
    </div>
  </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.querySelector('.m-close').onclick = close;
  bd.addEventListener('click', e => { if (e.target === bd) close(); });
  bd.querySelector('#saveSettings').onclick = async () => {
    core.data.profile = Object.assign({}, profile, {
      name: bd.querySelector('#tName').value.trim(),
      school: bd.querySelector('#tSchool').value.trim()
    });
    core.data.settings = Object.assign({}, s, {
      apiBase: bd.querySelector('#tApiBase').value.trim() || 'https://api.deepseek.com',
      model: bd.querySelector('#tModel').value.trim() || 'deepseek-chat',
      apiKey: bd.querySelector('#tApiKey').value.trim(),
      autoLockMinutes: Number(bd.querySelector('#tLockMin').value) || 30
    });
    await core.save();
    toast('设置已保存', 'ok');
    close();
    rerender();
  };
  bd.querySelector('#changePass').onclick = async () => {
    const oldP = prompt('输入当前口令');
    if (!oldP) return;
    const newP = prompt('设置新口令（至少 6 位）');
    if (!newP) return;
    try { await core.changePasscode(oldP, newP); toast('口令已更新，数据已用新口令重新加密', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  bd.querySelector('#exportBackup').onclick = () => {
    downloadText('材质工坊-教师数据-加密备份.json', core.exportBackup(), 'application/json;charset=utf-8');
  };
  const doImport = (mode) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      const text = await f.text();
      const p = prompt('输入该备份对应的教师口令');
      if (!p) return;
      try {
        await core.importBackup(text, p, mode);
        toast(mode === 'merge' ? '备份已合并导入' : '备份已覆盖导入', 'ok');
        close();
        rerender();
      } catch (e) { toast('导入失败：' + e.message, 'err'); }
    };
    inp.click();
  };
  bd.querySelector('#importMerge').onclick = () => doImport('merge');
  bd.querySelector('#importReplace').onclick = () => doImport('replace');
}

async function callAi(prompt) {
  const s = core.data.settings || {};
  if (!s.apiKey) throw new Error('未配置 API Key');
  const base = (s.apiBase || 'https://api.deepseek.com').replace(/\/$/, '');
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey },
    body: JSON.stringify({
      model: s.model || 'deepseek-chat',
      messages: [{ role: 'system', content: '你是三维材质课程教师助手，只输出 JSON。' }, { role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 900
    })
  });
  if (!res.ok) throw new Error('接口返回 ' + res.status);
  const j = await res.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('模型未返回 JSON');
  return JSON.parse(m[0]);
}

function currentTask() { return findTask(state.taskId) || (core.data.tasks || [])[0] || null; }

function updateTotalDisplay(card, a) {
  const inputs = card.querySelectorAll('.score-input');
  const scores = {};
  inputs.forEach(inp => { scores[inp.dataset.key] = Number(inp.value) || 0; });
  const total = computeTotal(scores, a.weights);
  const el = card.querySelector('.score-total b');
  if (el) el.textContent = total;
  return { scores, total };
}

async function saveEvalByFolder(folderName) {
  const task = currentTask();
  if (!task) { toast('请先选择任务'); return; }
  const a = state.analyses.find(x => x.folderName === folderName);
  const card = document.querySelector(`.eval-card[data-folder="${CSS.escape(folderName)}"]`);
  if (!a || !card) return;
  const { scores, total } = updateTotalDisplay(card, a);
  const comment = card.querySelector('textarea') ? card.querySelector('textarea').value : '';
  upsertEval(task.id, a, scores, total, comment);
  await core.save();
  toast('已保存：' + a.studentName + ' ' + total + ' 分', 'ok');
  const body = document.getElementById('teacherBody');
  if (body) body.innerHTML = bodyForTab();
  bindTab();
}

async function aiCommentByFolder(folderName) {
  const task = currentTask();
  const a = state.analyses.find(x => x.folderName === folderName);
  if (!a) return;
  if (!(core.data.settings || {}).apiKey) {
    const comment = localComment(a);
    const card = document.querySelector(`.eval-card[data-folder="${CSS.escape(folderName)}"]`);
    if (card) { const ta = card.querySelector('textarea'); if (ta) ta.value = comment; }
    toast('未配置 API，已用本地规则生成评语');
    return;
  }
  toast('正在请求 AI 评审…');
  try {
    const r = await callAi(buildAiPrompt(a, task, core.data.profile));
    const card = document.querySelector(`.eval-card[data-folder="${CSS.escape(folderName)}"]`);
    if (card) {
      card.querySelectorAll('.score-input').forEach(inp => {
        const k = inp.dataset.key;
        if (r.scores && r.scores[k] != null) inp.value = Math.max(0, Math.min(100, Number(r.scores[k])));
      });
      const totalEl = card.querySelector('.score-total b');
      if (totalEl && r.total) totalEl.textContent = r.total;
      const ta = card.querySelector('textarea');
      if (ta) ta.value = (r.comment || '') + (r.improvements && r.improvements.length ? '\n改进建议：\n- ' + r.improvements.join('\n- ') : '');
    }
    toast('AI 评审已填入，请核对后保存', 'ok');
  } catch (e) {
    toast('AI 调用失败：' + e.message + '，已回退本地规则', 'err');
    const card = document.querySelector(`.eval-card[data-folder="${CSS.escape(folderName)}"]`);
    if (card) { const ta = card.querySelector('textarea'); if (ta) ta.value = localComment(a); }
  }
}

function importAiByFolder(folderName) {
  const a = state.analyses.find(x => x.folderName === folderName);
  if (!a) return;
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop show';
  bd.innerHTML = `<div class="modal" style="position:relative;max-width:640px">
    <button class="icon-btn m-close">${icon('close', 16)}</button>
    <h2>导入 AI 评审结果</h2>
    <p style="color:var(--muted);font-size:13px;margin-top:8px">把 WorkBuddy / 豆包 / DeepSeek Harness 等返回的 JSON 粘贴到这里，自动填入分数与评语。</p>
    <textarea class="t-input t-area" id="aiJson" rows="10" placeholder='{"scores":{"completeness":0,"texture":0,"uv":0,"presentation":0,"creativity":0},"total":0,"comment":"...","improvements":["..."]}'></textarea>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" id="aiCancel">取消</button>
      <button class="btn btn-primary btn-sm" id="aiApply">填充到该学生</button>
    </div>
  </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.querySelector('.m-close').onclick = close;
  bd.querySelector('#aiCancel').onclick = close;
  bd.querySelector('#aiApply').onclick = () => {
    try {
      const raw = bd.querySelector('#aiJson').value.trim();
      const j = JSON.parse(raw);
      const card = document.querySelector(`.eval-card[data-folder="${CSS.escape(folderName)}"]`);
      if (card && j.scores) {
        card.querySelectorAll('.score-input').forEach(inp => {
          const k = inp.dataset.key;
          if (j.scores[k] != null) inp.value = Math.max(0, Math.min(100, Number(j.scores[k])));
        });
        const totalEl = card.querySelector('.score-total b');
        if (totalEl && j.total) totalEl.textContent = j.total;
        const ta = card.querySelector('textarea');
        if (ta) ta.value = (j.comment || '') + (j.improvements && j.improvements.length ? '\n改进建议：\n- ' + j.improvements.join('\n- ') : '');
      }
      close();
      toast('已导入，请核对后保存评分', 'ok');
    } catch (e) { toast('JSON 解析失败：' + e.message, 'err'); }
  };
}

async function scanFolder(fileList) {
  const task = currentTask();
  if (!task) { toast('请先创建任务'); return; }
  state.scanning = true;
  const body = document.getElementById('teacherBody');
  if (body) body.innerHTML = bodyForTab();
  state.thumbUrls.forEach(u => URL.revokeObjectURL(u));
  state.thumbUrls = [];
  try {
    const groups = groupByStudent(fileList);
    const students = allStudents();
    const analyses = [];
    for (const g of groups) {
      // 1) 先读取图片尺寸（最多 30 张）
      let n = 0;
      for (const f of g.files) {
        if (n >= 30) break;
        if (!/\.(png|jpe?g|webp|bmp)$/i.test(f.name)) continue;
        const d = await imageDims(f.file);
        if (d) { f.w = d.w; f.h = d.h; n++; }
      }
      // 2) 评估
      const a = evaluateSubmission(g, task, students);
      // 3) 工程文件内部条目
      for (const s of a.spps) {
        const z = await readZipEntries(s.file);
        if (z) { s.entries = z.count; s.sampleNames = z.names.slice(0, 12); }
      }
      // 4) 缩略图
      for (const key of Object.keys(a.maps)) {
        const f = a.maps[key];
        if (f.file && f.file.size < 12 * 1024 * 1024) {
          f.thumb = URL.createObjectURL(f.file);
          state.thumbUrls.push(f.thumb);
        }
      }
      for (const p of a.previews.slice(0, 3)) {
        if (p.file && p.file.size < 12 * 1024 * 1024) {
          p.thumb = URL.createObjectURL(p.file);
          state.thumbUrls.push(p.thumb);
        }
      }
      // 5) 合并已保存评分
      const saved = findEval(task.id, a.folderName);
      if (saved) {
        a.draftScores = saved.scores || a.draftScores;
        a.total = saved.total != null ? saved.total : a.total;
      }
      analyses.push(a);
    }
    analyses.sort((x, y) => x.folderName.localeCompare(y.folderName, 'zh'));
    state.analyses = analyses;
    state.scanning = false;
    if (body) body.innerHTML = bodyForTab();
    bindTab();
    toast('扫描完成：' + analyses.length + ' 份提交', 'ok');
  } catch (e) {
    state.scanning = false;
    if (body) body.innerHTML = bodyForTab();
    bindTab();
    toast('扫描失败：' + e.message, 'err');
  }
}

function bindTab() {
  const body = document.getElementById('teacherBody');
  if (!body) return;

  // 概览快捷
  body.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => switchTab(b.dataset.goto));

  // 班级
  const addClass = document.getElementById('addClass');
  if (addClass) addClass.onclick = async () => {
    const name = document.getElementById('className').value.trim();
    if (!name) return toast('请填写班级名称');
    const students = parseRoster(document.getElementById('classRoster').value).map(s => ensureStudent(s));
    core.data.classes.push({ id: uid('cls'), name, students, createdAt: Date.now() });
    await core.save();
    toast('班级已创建：' + students.length + ' 名学生', 'ok');
    rerender();
  };
  const importExcel = document.getElementById('importExcel');
  const excelInput = document.getElementById('excelInput');
  if (importExcel && excelInput) {
    importExcel.onclick = () => excelInput.click();
    excelInput.onchange = async () => {
      const f = excelInput.files[0];
      if (!f) return;
      try { await importExcelFile(f); }
      catch (e) { toast('导入失败：' + e.message, 'err'); }
      excelInput.value = '';
    };
  }
  body.querySelectorAll('[data-del-class]').forEach(b => b.onclick = async () => {
    if (!confirm('删除该班级及名单？')) return;
    core.data.classes = core.data.classes.filter(c => c.id !== b.dataset.delClass);
    await core.save();
    rerender();
  });
  body.querySelectorAll('[data-export-class]').forEach(b => b.onclick = () => exportClassRoster(b.dataset.exportClass));
  body.querySelectorAll('[data-toggle-student]').forEach(b => b.onclick = async () => {
    const cls = core.data.classes.find(c => c.id === b.dataset.class);
    const s = (cls ? cls.students : []).map(ensureStudent).find(x => (x.sid || x.name) === b.dataset.toggleStudent);
    if (!s) return;
    if (b.dataset.field === 'enabled') s.enabled = !s.enabled;
    else s.permissions.viewGrades = !s.permissions.viewGrades;
    await core.save();
    rerender();
  });
  body.querySelectorAll('[data-edit-student]').forEach(b => b.onclick = () => studentModal(b.dataset.class, b.dataset.editStudent, 'edit'));
  body.querySelectorAll('[data-pwd-student]').forEach(b => b.onclick = () => studentModal(b.dataset.class, b.dataset.pwdStudent, 'pwd'));
  body.querySelectorAll('[data-del-student]').forEach(b => b.onclick = async () => {
    if (!confirm('移出该学生？')) return;
    const cls = core.data.classes.find(c => c.id === b.dataset.class);
    if (!cls) return;
    cls.students = (cls.students || []).filter(x => (x.sid || x.name) !== b.dataset.delStudent);
    await core.save();
    rerender();
  });
  body.querySelectorAll('[data-add-student]').forEach(b => b.onclick = async () => {
    const cid = b.dataset.addStudent;
    const cls = core.data.classes.find(c => c.id === cid);
    if (!cls) return;
    const sidEl = body.querySelector(`[data-add-sid="${cid}"]`);
    const nameEl = body.querySelector(`[data-add-name="${cid}"]`);
    const sid = sidEl.value.trim();
    const name = nameEl.value.trim();
    if (!name) return toast('请填写姓名');
    cls.students = cls.students || [];
    if (cls.students.find(x => sid && x.sid === sid)) return toast('学号已存在');
    cls.students.push(ensureStudent({ sid, name }));
    await core.save();
    toast('已添加', 'ok');
    rerender();
  });

  // 任务
  const saveTask = document.getElementById('saveTask');
  if (saveTask) {
    const syncSum = () => {
      const sum = ['completeness', 'texture', 'uv', 'presentation', 'creativity'].reduce((a, k) => a + (Number(document.getElementById('w_' + k).value) || 0), 0);
      const el = document.getElementById('weightsSum');
      if (el) el.textContent = '合计 ' + sum + '%';
    };
    ['completeness', 'texture', 'uv', 'presentation', 'creativity'].forEach(k => {
      const el = document.getElementById('w_' + k);
      if (el) el.oninput = syncSum;
    });
    syncSum();
    saveTask.onclick = async () => {
      const title = document.getElementById('taskTitle').value.trim();
      if (!title) return toast('请填写任务名称');
      const weights = {};
      let sum = 0;
      ['completeness', 'texture', 'uv', 'presentation', 'creativity'].forEach(k => {
        weights[k] = Number(document.getElementById('w_' + k).value) || 0;
        sum += weights[k];
      });
      if (sum <= 0) return toast('权重不能全为 0');
      const requiredMaps = [...document.querySelectorAll('.map-check input:checked')].map(x => x.value);
      const task = {
        id: state.editTaskId || uid('task'),
        title,
        desc: document.getElementById('taskDesc').value.trim(),
        deadline: document.getElementById('taskDeadline').value,
        minRes: Number(document.getElementById('taskMinRes').value) || 2048,
        requiredMaps,
        weights,
        updatedAt: Date.now()
      };
      if (state.editTaskId) {
        const idx = core.data.tasks.findIndex(t => t.id === state.editTaskId);
        if (idx >= 0) core.data.tasks[idx] = task;
        state.editTaskId = null;
      } else {
        core.data.tasks.push(task);
      }
      state.taskId = task.id;
      core.data.lastTaskId = task.id;
      await core.save();
      toast('任务已保存', 'ok');
      rerender();
    };
    const cancelEdit = document.getElementById('cancelTaskEdit');
    if (cancelEdit) cancelEdit.onclick = () => { state.editTaskId = null; rerender(); };
  }
  body.querySelectorAll('[data-pick-task]').forEach(b => b.onclick = async () => {
    state.taskId = b.dataset.pickTask;
    core.data.lastTaskId = state.taskId;
    await core.save();
    switchTab('eval');
  });
  body.querySelectorAll('[data-edit-task]').forEach(b => b.onclick = () => { state.editTaskId = b.dataset.editTask; switchTab('tasks'); });
  body.querySelectorAll('[data-del-task]').forEach(b => b.onclick = async () => {
    if (!confirm('删除该任务？已有评估记录会保留。')) return;
    core.data.tasks = core.data.tasks.filter(t => t.id !== b.dataset.delTask);
    if (state.taskId === b.dataset.delTask) state.taskId = (core.data.tasks[0] || {}).id || null;
    await core.save();
    rerender();
  });

  // 评估
  const evalTask = document.getElementById('evalTask');
  if (evalTask) {
    evalTask.onchange = async () => {
      state.taskId = evalTask.value;
      core.data.lastTaskId = state.taskId;
      await core.save();
      state.analyses = [];
      rerender();
    };
  }
  const rootInput = document.getElementById('submissionRoot');
  if (rootInput) rootInput.onchange = async () => {
    core.data.settings.submissionRoot = rootInput.value.trim();
    await core.save();
    toast('提交根目录已保存');
  };
  const pick = document.getElementById('pickFolder');
  const input = document.getElementById('folderInput');
  if (pick && input) {
    pick.onclick = () => input.click();
    input.onchange = () => {
      if (input.files && input.files.length) scanFolder(input.files);
      input.value = '';
    };
  }
  const clear = document.getElementById('clearScan');
  if (clear) clear.onclick = () => { state.analyses = []; state.expanded.clear(); rerender(); };
  body.querySelectorAll('[data-toggle-eval]').forEach(b => b.onclick = () => {
    const f = b.dataset.toggleEval;
    if (state.expanded.has(f)) state.expanded.delete(f); else state.expanded.add(f);
    rerender();
  });
  body.querySelectorAll('[data-save-eval]').forEach(b => b.onclick = () => saveEvalByFolder(b.dataset.saveEval));
  body.querySelectorAll('[data-ai-comment]').forEach(b => b.onclick = () => aiCommentByFolder(b.dataset.aiComment));
  body.querySelectorAll('[data-copy-prompt]').forEach(b => b.onclick = async () => {
    const a = state.analyses.find(x => x.folderName === b.dataset.copyPrompt);
    if (!a) return;
    const prompt = buildAiPrompt(a, currentTask(), core.data.profile);
    try { await navigator.clipboard.writeText(prompt); toast('提示词已复制，可粘贴到 WorkBuddy / 豆包 / DeepSeek', 'ok'); }
    catch (e) { toast('复制失败'); }
  });
  body.querySelectorAll('[data-export-pack]').forEach(b => b.onclick = () => {
    const a = state.analyses.find(x => x.folderName === b.dataset.exportPack);
    if (!a) return;
    const root = (core.data.settings || {}).submissionRoot || '';
    const md = buildAgentPack(a, currentTask(), core.data.profile, root);
    downloadText('AI评审任务书-' + a.studentName + '.md', md, 'text/markdown;charset=utf-8');
    toast('已导出 AI 任务书', 'ok');
  });
  body.querySelectorAll('[data-import-ai]').forEach(b => b.onclick = () => importAiByFolder(b.dataset.importAi));
  body.querySelectorAll('.score-input').forEach(inp => {
    inp.oninput = () => {
      const card = inp.closest('.eval-card');
      const a = state.analyses.find(x => x.folderName === card.dataset.folder);
      if (a) updateTotalDisplay(card, a);
    };
  });
  const exportAll = document.getElementById('exportAllPack');
  if (exportAll) exportAll.onclick = () => {
    const task = currentTask();
    const root = (core.data.settings || {}).submissionRoot || '';
    const md = state.analyses.map(a => buildAgentPack(a, task, core.data.profile, root)).join('\n\n---\n\n');
    downloadText('AI评审任务书-全部.md', md, 'text/markdown;charset=utf-8');
    toast('已导出全部学生的 AI 任务书', 'ok');
  };
  const exportGrades = document.getElementById('exportGrades');
  if (exportGrades) exportGrades.onclick = () => {
    const evals = core.data.evaluations || [];
    const rows = evals.map(e => [
      e.studentName, e.studentId, (findTask(e.taskId) || {}).title,
      (e.scores || {}).completeness, (e.scores || {}).texture, (e.scores || {}).uv,
      (e.scores || {}).presentation, (e.scores || {}).creativity, e.total,
      new Date(e.updatedAt || Date.now()).toLocaleString('zh-CN')
    ]);
    downloadText('实训成绩-' + new Date().toISOString().slice(0, 10) + '.csv',
      toCsv(rows, ['学生', '学号', '任务', '完整性', '贴图质量', 'UV与结构', '展示', '创意', '总分', '评估时间']));
    toast('成绩已导出', 'ok');
  };

  // 发布与访问
  const serverStatus = document.getElementById('serverStatus');
  if (serverStatus) {
    initServerTab(serverStatus);
    const publishBtn = document.getElementById('publishBtn');
    if (publishBtn) publishBtn.onclick = async () => {
      if (!serverState.key) return toast('请先连接本地服务');
      try {
        const origToast = toast;
        await publishToServer();
      } catch (e) { toast('发布失败：' + e.message, 'err'); }
    };
    const resetPwAll = document.getElementById('resetPwAll');
    if (resetPwAll) resetPwAll.onclick = async () => {
      if (!confirm('把所有学生的口令重置为默认规则（学号后 6 位）？')) return;
      let n = 0;
      for (const c of core.data.classes || []) for (const raw of c.students || []) {
        const s = ensureStudent(raw);
        if (!s.sid) continue;
        s.passwordHash = await hashPassword(s.sid, defaultPassword(s.sid));
        s.passwordHint = 'sid6';
        n++;
      }
      await core.save();
      toast('已重置 ' + n + ' 名学生的口令（需重新发布生效）', 'ok');
      rerender();
    };
    const refresh = document.getElementById('refreshServer');
    if (refresh) refresh.onclick = () => initServerTab(serverStatus);
    const saveAccess = document.getElementById('saveAccess');
    if (saveAccess) saveAccess.onclick = async () => {
      try {
        const mode = document.querySelector('input[name="accessMode"]:checked')?.value || 'all';
        const whitelist = (document.getElementById('whitelist')?.value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        await api('/api/access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Teacher-Key': serverState.key },
          body: JSON.stringify({ mode, whitelist })
        });
        serverState.access = await api('/api/access', { headers: { 'X-Teacher-Key': serverState.key } });
        renderAccessPanel(serverState.access);
        toast('访问设置已保存', 'ok');
      } catch (e) { toast('保存失败：' + e.message, 'err'); }
    };
    const pauseAccess = document.getElementById('pauseAccess');
    if (pauseAccess) pauseAccess.onclick = async () => {
      if (!confirm('立即禁止其他地址访问？设置后只有本机能打开平台，学生端会显示访问受限。')) return;
      try {
        await api('/api/access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Teacher-Key': serverState.key },
          body: JSON.stringify({ mode: 'local', whitelist: [] })
        });
        serverState.access = await api('/api/access', { headers: { 'X-Teacher-Key': serverState.key } });
        renderAccessPanel(serverState.access);
        toast('已禁止其他地址访问（仅本机可用）', 'ok');
      } catch (e) { toast('操作失败：' + e.message, 'err'); }
    };
  }
}

function switchTab(id) {
  state.tab = id;
  document.querySelectorAll('.teacher-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  const body = document.getElementById('teacherBody');
  if (body) body.innerHTML = bodyForTab();
  bindTab();
}
function rerender() {
  const app = document.getElementById('app');
  if (app) app.innerHTML = renderShell();
  bindShell();
  bindTab();
}

function renderShell() {
  return shell(bodyForTab());
}

function bindShell() {
  document.querySelectorAll('.teacher-tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  const lock = document.getElementById('tLock');
  if (lock) lock.onclick = () => { core.lock(); location.reload(); };
  const set = document.getElementById('tSettings');
  if (set) set.onclick = () => settingsModal();
}

/* ============ 对外视图 ============ */
export default {
  async render() {
    try {
      const cfg = await fetch('data/teacher.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : { enabled: false }).catch(() => ({ enabled: false }));
      state.config = cfg;
    } catch (e) { state.config = { enabled: false }; }
    if (!state.config.enabled) {
      return `<div class="container" style="padding:80px 24px"><div class="card" style="text-align:center;padding:50px">
        <h2>教师端未启用</h2><p style="color:var(--muted);margin-top:10px">请在 data/teacher.json 中把 enabled 设为 true。</p>
        <a class="btn btn-primary" href="#/" style="margin-top:20px">返回首页</a></div></div>`;
    }
    if (!core.hasStore()) {
      state.tab = 'overview';
      return lockScreen('setup');
    }
    if (core.locked) {
      state.tab = 'overview';
      return lockScreen('unlock');
    }
    if (!state.taskId) state.taskId = core.data.lastTaskId || (core.data.tasks[0] || {}).id || null;
    return renderShell();
  },

  async mount() {
    // 首次设置 / 解锁
    const unlockBtn = document.getElementById('unlockBtn');
    if (unlockBtn) {
      const isSetup = !core.hasStore();
      unlockBtn.onclick = async () => {
        const p1 = document.getElementById('pass1').value;
        const msg = document.getElementById('lockMsg');
        try {
          if (isSetup) {
            const p2 = document.getElementById('pass2').value;
            if (p1 !== p2) throw new Error('两次输入不一致');
            await core.create(p1);
          } else {
            await core.unlock(p1);
          }
          rerender();
        } catch (e) {
          if (msg) msg.textContent = e.message;
        }
      };
      const imp = document.getElementById('showImport');
      if (imp) imp.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json';
        inp.onchange = async () => {
          const f = inp.files[0];
          if (!f) return;
          const text = await f.text();
          const p = prompt('输入该备份的教师口令');
          if (!p) return;
          try { await core.importBackup(text, p); rerender(); }
          catch (e) { document.getElementById('lockMsg').textContent = '导入失败：' + e.message; }
        };
        inp.click();
      };
      return;
    }

    bindShell();
    bindTab();

    // 自动锁定检查
    setInterval(() => {
      if (!core.locked && core.data && core.data.settings) {
        const mins = core.data.settings.autoLockMinutes || 30;
        if (Date.now() - core.lastActivity > mins * 60000) {
          core.lock();
          location.reload();
        }
      }
    }, 30000);
    ['click', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (core.data) core.touch(); }, { passive: true }));
  }
};

