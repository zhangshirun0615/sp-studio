import store from '../store.js';
import { esc, icon, toast } from '../ui.js';
import data from '../data.js';
import { getReply, suggestions } from '../ai.js';

function botMsg(html) {
  return { role: 'bot', html, ts: Date.now() };
}

function greeting() {
  return `<h4>你好，我是学习平台 AI 助教</h4>
  <p>我覆盖平台上的全部课程：三维材质（Substance Painter）、ZBrush、影视概念设计、平面构成、色彩、绘画渲染、分镜、动画大师课、插画魔法课、视听语言与 PR 剪辑。</p>
  <ul>
    <li>可以问“某门课怎么学”“某一节课讲什么”，我会给出课程定位、知识点与对应课时；</li>
    <li>也可以问知识图谱、闯关练习、学生登录、教师端使用等平台问题；</li>
    <li>默认使用<strong>本地知识引擎</strong>；配置在线大模型 Key 后会优先调用模型，失败自动回退本地。</li>
  </ul>
  <p style="color:var(--muted);font-size:12.5px">先从下面选一门课，或直接输入你的问题。</p>`;
}

function renderHistory(history) {
  return history.map(m => {
    if (m.role === 'user') {
      return `<div class="msg user"><span class="avatar">我</span><div class="bubble">${esc(m.text || '')}</div></div>`;
    }
    return `<div class="msg bot"><span class="avatar">${icon('bot', 16)}</span><div class="bubble">${m.html || ''}</div></div>`;
  }).join('');
}

export default {
  async render() {
    const hist = store.aiHistory();
    const hasKey = !!store.getSettings().apiKey;
    const chips = suggestions.map((s, i) => `<button class="suggest-btn" data-suggest="${esc(s)}"><span>0${i + 1}</span>${esc(s)}</button>`).join('');
    const cat = await data.catalog().catch(() => ({ courses: [] }));
    const courseChips = (cat.courses || []).map(c => `<button class="chip" data-course-ask="${esc(c.title)}" style="font-size:11.5px;padding:3px 9px">${esc(c.title)}</button>`).join('');

    return `<div class="container">
  <div class="assistant-layout">
    <aside class="assistant-side">
      <div class="side-panel">
        <h3>可以这样问</h3>
        <div style="display:flex;flex-direction:column;gap:4px">${chips}</div>
      </div>
      <div class="side-panel">
        <h3>可问课程</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${courseChips}</div>
      </div>
      <div class="side-panel">
        <h3>能力范围</h3>
        <ul class="side-list">
          <li>${icon('book', 14)}<span>课程定位：一门课/一节课讲什么</span></li>
          <li>${icon('layers', 14)}<span>知识点：概念、步骤、术语</span></li>
          <li>${icon('target', 14)}<span>学习路线：先学哪章、怎么练</span></li>
          <li>${icon('bolt', 14)}<span>平台用法：题库、图谱、学生/教师端</span></li>
        </ul>
      </div>
      <div class="side-panel">
        <h3>模型设置</h3>
        <p style="font-size:12px;color:var(--muted);line-height:1.7;margin-bottom:12px">
          ${hasKey ? '已配置在线大模型，回答会优先调用接口，失败时自动回退本地引擎。' : '当前使用本地知识引擎。填入 OpenAI 兼容接口的 Key 可启用在线大模型。'}
        </p>
        <button class="btn btn-ghost btn-sm" id="openSettings" style="width:100%">${icon('settings', 15)} ${hasKey ? '修改 API 设置' : '配置在线模型'}</button>
      </div>
    </aside>

    <div class="chat-shell">
      <div class="chat-head">
        <span class="chat-avatar">${icon('bot', 19)}</span>
        <div>
          <h3>学习平台 AI 助教</h3>
          <p>${hasKey ? '在线模型 + 本地知识库' : '本地知识引擎 · 秒回'}</p>
        </div>
        <span class="chat-status"><i></i>在线</span>
        <div class="chat-settings">
          <button class="icon-btn" id="clearChat" title="清空对话" aria-label="清空对话">${icon('refresh', 15)}</button>
          <button class="icon-btn" id="settingsBtn" title="设置" aria-label="设置">${icon('settings', 15)}</button>
        </div>
      </div>
      <div class="chat-body" id="chatBody">
        ${hist.length ? renderHistory(hist) : `<div class="msg bot"><span class="avatar">${icon('bot', 16)}</span><div class="bubble">${greeting()}</div></div>`}
      </div>
      <div class="chat-input-bar">
        <textarea id="chatInput" rows="1" placeholder="问我任何课程的问题，例如「ZBrush 的 Dynamesh 怎么用」「影视概念设计第二阶段学什么」…" aria-label="输入问题"></textarea>
        <button class="chat-send" id="chatSend" title="发送" aria-label="发送">${icon('send', 18)}</button>
      </div>
      <div class="chat-note">回答基于平台 10 门课程的知识点、课程大纲、题库与平台说明生成，仅用于学习参考；如配置了在线模型，问题会发送到你填写的接口。</div>
    </div>
  </div>
</div>`;
  },

  mount() {
    const body = document.getElementById('chatBody');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSend');
    document.querySelectorAll('[data-course-ask]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inputEl = document.getElementById('chatInput');
        if (!inputEl) return;
        inputEl.value = '《' + btn.dataset.courseAsk + '》这门课怎么学？';
        inputEl.focus();
      });
    });
    let busy = false;

    const scroll = () => { body.scrollTop = body.scrollHeight; };
    const append = (html) => { body.insertAdjacentHTML('beforeend', html); scroll(); };

    const persist = () => {
      const items = [];
      body.querySelectorAll('.msg').forEach(el => {
        const text = el.querySelector('.bubble').textContent;
        if (el.classList.contains('user')) items.push({ role: 'user', text: text.trim() });
        else items.push({ role: 'bot', html: el.querySelector('.bubble').innerHTML });
      });
      store.pushAi(items);
    };

    async function ask(text) {
      if (busy || !text.trim()) return;
      busy = true;
      append(`<div class="msg user"><span class="avatar">我</span><div class="bubble">${esc(text.trim())}</div></div>`);
      input.value = '';
      input.style.height = 'auto';
      const typing = document.createElement('div');
      typing.className = 'msg bot';
      typing.innerHTML = `<span class="avatar">${icon('bot', 16)}</span><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>`;
      body.appendChild(typing);
      scroll();
      try {
        const reply = await getReply(text.trim());
        typing.remove();
        append(`<div class="msg bot"><span class="avatar">${icon('bot', 16)}</span><div class="bubble">${reply.html}${reply.followups || []}</div></div>`);
        store.aiUsed();
        persist();
      } catch (e) {
        typing.remove();
        append(`<div class="msg bot"><span class="avatar">${icon('bot', 16)}</span><div class="bubble"><p>抱歉，刚才出了点问题：${esc(e.message || '未知错误')}</p></div></div>`);
      } finally {
        busy = false;
      }
    }

    const send = () => ask(input.value);
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 130) + 'px';
    });

    body.addEventListener('click', (e) => {
      const sug = e.target.closest('[data-suggest]');
      if (sug) { ask(sug.dataset.suggest); return; }
      const fu = e.target.closest('[data-followup]');
      if (fu) { ask(fu.dataset.followup); return; }
    });

    document.querySelectorAll('[data-suggest]').forEach(b => b.addEventListener('click', () => ask(b.dataset.suggest)));

    const clearBtn = document.getElementById('clearChat');
    clearBtn.addEventListener('click', () => {
      if (!confirm('确定清空当前对话吗？本机记录也会被清空。')) return;
      store.pushAi([]);
      body.innerHTML = `<div class="msg bot"><span class="avatar">${icon('bot', 16)}</span><div class="bubble">${greeting()}</div></div>`;
    });

    // 设置弹窗
    const openSettings = () => {
      const s = store.getSettings();
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop show';
      backdrop.innerHTML = `<div class="modal" style="position:relative">
        <button class="icon-btn m-close" aria-label="关闭">${icon('close', 16)}</button>
        <h2>在线大模型设置</h2>
        <p style="color:var(--muted);font-size:13px;margin-top:8px;line-height:1.75">填写任意 OpenAI 兼容接口即可让助教使用在线模型；Key 只保存在本机浏览器，不会上传到本平台。</p>
        <div style="display:flex;flex-direction:column;gap:14px;margin-top:22px">
          <label style="font-size:13px;color:var(--muted)">接口地址 Base URL
            <input id="setBase" value="${esc(s.apiBase || 'https://api.deepseek.com')}" placeholder="https://api.deepseek.com"
              style="width:100%;margin-top:6px;padding:11px 13px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);outline:none;color:var(--text)">
          </label>
          <label style="font-size:13px;color:var(--muted)">API Key
            <input id="setKey" type="password" value="${esc(s.apiKey || '')}" placeholder="sk-..."
              style="width:100%;margin-top:6px;padding:11px 13px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);outline:none;color:var(--text)">
          </label>
          <label style="font-size:13px;color:var(--muted)">模型名称
            <input id="setModel" value="${esc(s.model || 'deepseek-chat')}" placeholder="deepseek-chat"
              style="width:100%;margin-top:6px;padding:11px 13px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);outline:none;color:var(--text)">
          </label>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:24px">
          <button class="btn btn-ghost btn-sm" id="setCancel">取消</button>
          <button class="btn btn-primary btn-sm" id="setSave">${icon('check', 15)} 保存设置</button>
        </div>
      </div>`;
      document.body.appendChild(backdrop);
      const close = () => backdrop.remove();
      backdrop.querySelector('.m-close').addEventListener('click', close);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#setCancel').addEventListener('click', close);
      backdrop.querySelector('#setSave').addEventListener('click', () => {
        store.setSetting('apiBase', backdrop.querySelector('#setBase').value.trim() || 'https://api.deepseek.com');
        store.setSetting('apiKey', backdrop.querySelector('#setKey').value.trim());
        store.setSetting('model', backdrop.querySelector('#setModel').value.trim() || 'deepseek-chat');
        close();
        toast('设置已保存，将优先使用在线模型', 'ok');
      });
    };
    document.getElementById('openSettings').addEventListener('click', openSettings);
    document.getElementById('settingsBtn').addEventListener('click', openSettings);

    // 从课程页带过来的问题
    let pending = '';
    try { pending = sessionStorage.getItem('spstudio.ask') || ''; sessionStorage.removeItem('spstudio.ask'); } catch (e) {}
    if (pending) setTimeout(() => ask(pending), 320);
    else input.focus();
    scroll();
  }
};
