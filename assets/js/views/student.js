import { esc, icon, toast } from '../ui.js';

const TOKEN_KEY = 'spstudio.student.token';
let session = null;

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { }
  if (!res.ok) { const err = new Error(data.error || ('请求失败 ' + res.status)); err.status = res.status; throw err; }
  return data;
}

function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
function setToken(t) { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) { } }

async function fetchMe() {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await api('/api/student/me', { headers: { Authorization: 'Bearer ' + token } });
    return data;
  } catch (e) {
    if (e.status === 401) setToken('');
    return null;
  }
}

function shell(inner, title) {
  return `<div class="container student-shell">
    <div class="page-head">
      <div class="eyebrow">Student Portal</div>
      <h1>${title || '学生登录'}</h1>
      <p class="lead">用教师发放的学号与口令登录，查看实训任务、成绩与教师评语。学习进度仍保存在你自己的浏览器里。</p>
    </div>
    ${inner}
    <p style="color:var(--muted);font-size:12px;margin-top:24px">
      学生账号由教师在教师端「发布与访问」中发布；如忘记口令，请联系任课教师重置。
    </p>
  </div>`;
}

function unavailable(msg) {
  return shell(`<div class="card student-unavailable">
    <span class="tag gold">${icon('info', 13)} 学生端未启用</span>
    <h3>学生登录需要本地服务器</h3>
    <p>${esc(msg || '请在教室运行「启动学习平台」的电脑上访问，学生登录、任务与成绩都保存在那台电脑的本地服务里。')}</p>
    <p style="color:var(--muted);font-size:12.5px">在线镜像版不含本地服务，无法登录学生账号。</p>
    <a class="btn btn-primary btn-sm" href="#/">${icon('arrow-left', 14)} 返回学习平台</a>
  </div>`);
}

function loginForm() {
  return shell(`<div class="card student-login-card">
    <div class="student-login-icon">${icon('user', 26)}</div>
    <h3>学号 + 口令登录</h3>
    <p>初始口令一般为学号后 6 位，具体以教师通知为准。</p>
    <div class="student-login-form">
      <input id="stuSid" class="t-input" placeholder="学号" autocomplete="username">
      <input id="stuPwd" class="t-input" type="password" placeholder="口令" autocomplete="current-password">
      <button class="btn btn-primary" id="stuLogin">${icon('arrow-right', 15)} 登录</button>
    </div>
    <div class="student-login-msg" id="stuMsg"></div>
  </div>`);
}

function dashboard(data) {
  const s = data.student || {};
  const grades = data.grades || [];
  const tasks = data.tasks || [];
  const gradeByTask = {};
  grades.forEach(g => { gradeByTask[g.taskId] = g; });
  const taskCards = tasks.map(t => {
    const g = gradeByTask[t.id];
    return `<div class="card student-task">
      <div class="st-head">
        <b>${esc(t.title)}</b>
        ${g ? `<span class="tag teal">已评 ${g.total} 分</span>` : '<span class="tag">待评</span>'}
        ${t.deadline ? `<span class="tag gold">截止 ${esc(t.deadline)}</span>` : ''}
      </div>
      ${t.desc ? `<p class="st-desc">${esc(t.desc)}</p>` : ''}
      ${g && g.comment ? `<div class="st-comment"><b>教师评语</b>${esc(g.comment).replace(/\n/g, '<br>')}</div>` : ''}
      ${g ? `<div class="st-scores">${['completeness', 'texture', 'uv', 'presentation', 'creativity'].map((k, i) => {
        const label = ['完整性', '贴图质量', 'UV与结构', '展示', '创意'][i];
        const v = (g.scores || {})[k];
        return `<div class="st-score"><span>${label}</span><b>${v != null ? v : '-'}</b></div>`;
      }).join('')}</div>` : ''}
    </div>`;
  }).join('');

  const avg = grades.length ? Math.round(grades.reduce((a, g) => a + (g.total || 0), 0) / grades.length) : null;
  const perms = s.permissions || { viewGrades: true };
  return shell(`<div class="student-who">
      <div><b>${esc(s.name || '')}</b><span>${esc(s.className || '')} · ${esc(s.sid || '')}${s.role === 'leader' ? ' · 课代表' : ''}</span></div>
      <button class="btn btn-ghost btn-sm" id="stuLogout">${icon('external', 14)} 退出登录</button>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">
      <div class="kpi"><div class="k-lbl">实训任务</div><div class="k-val">${tasks.length}<small>个</small></div><div class="k-sub">含截止时间</div></div>
      <div class="kpi"><div class="k-lbl">已评成绩</div><div class="k-val">${perms.viewGrades ? grades.length : '—'}<small>${perms.viewGrades ? '条' : ''}</small></div><div class="k-sub">${perms.viewGrades ? '教师发布后显示' : '教师已关闭成绩查看'}</div></div>
      <div class="kpi"><div class="k-lbl">平均分</div><div class="k-val">${perms.viewGrades && avg != null ? avg : '—'}<small>${perms.viewGrades && avg != null ? '分' : ''}</small></div><div class="k-sub">按已评任务计算</div></div>
    </div>
    ${perms.viewGrades ? (taskCards || '<div class="card" style="color:var(--muted)">还没有发布的实训任务。</div>') : '<div class="card" style="color:var(--muted)">教师暂时关闭了成绩查看，任务信息仍可查看。</div>'}
    <div class="student-links">
      <a class="btn btn-ghost btn-sm" href="#/map">${icon('map', 14)} 课程地图</a>
      <a class="btn btn-ghost btn-sm" href="#/quiz">${icon('bolt', 14)} 闯关练习</a>
      <a class="btn btn-ghost btn-sm" href="#/kb">${icon('book', 14)} 术语知识库</a>
    </div>`);
}

export default {
  async render() {
    let health = null;
    try { health = await api('/api/health'); } catch (e) { health = null; }
    if (!health || !health.ok) return unavailable();
    const data = await fetchMe();
    if (data) { session = data; return dashboard(data); }
    return loginForm();
  },

  async mount() {
    const login = document.getElementById('stuLogin');
    if (login) {
      const submit = async () => {
        const sid = document.getElementById('stuSid').value.trim();
        const pwd = document.getElementById('stuPwd').value;
        const msg = document.getElementById('stuMsg');
        msg.textContent = '';
        try {
          const r = await api('/api/student/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sid, password: pwd })
          });
          setToken(r.token);
          toast('登录成功', 'ok');
          location.reload();
        } catch (e) {
          msg.textContent = e.message;
        }
      };
      login.onclick = submit;
      document.getElementById('stuPwd').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    }
    const logout = document.getElementById('stuLogout');
    if (logout) logout.onclick = () => { setToken(''); session = null; location.reload(); };
  }
};
