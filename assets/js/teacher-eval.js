/* 实训评估核心：文件分组、贴图识别、工程文件检测、自动评分、AI 评审材料生成
   这里的函数尽量保持纯逻辑（不直接操作 DOM），方便单独验证。 */

export const MAP_DEFS = [
  { key: 'basecolor', label: 'BaseColor 颜色', patterns: /base\s*colou?r|albedo|diffuse|base_color|颜色|底色/i, requiredByDefault: true },
  { key: 'normal', label: 'Normal 法线', patterns: /normal|nrm|法线/i, requiredByDefault: true },
  { key: 'roughness', label: 'Roughness 粗糙度', patterns: /roughness|rough|粗糙/i, requiredByDefault: true },
  { key: 'metallic', label: 'Metallic 金属度', patterns: /metallic|metal(?!.*rough)|金属/i, requiredByDefault: true },
  { key: 'ao', label: 'AO 环境光遮蔽', patterns: /\bao\b|occlusion|环境光/i },
  { key: 'height', label: 'Height 高度', patterns: /height|displacement|凹凸|高度/i },
  { key: 'opacity', label: 'Opacity 透明', patterns: /opacity|alpha|透明/i },
  { key: 'emissive', label: 'Emissive 自发光', patterns: /emissive|发光/i }
];

export const DEFAULT_WEIGHTS = {
  completeness: 25,
  texture: 25,
  uv: 20,
  presentation: 15,
  creativity: 15
};

const PREVIEW_RE = /preview|render|screenshot|截图|效果图|展示|showcase|thumb|turntable|白底|转盘/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|tga|exr|tif?f)$/i;
const SPP_EXT = /\.(spp|sbsar|sbs)$/i;
const PROJECT_EXT = /\.(spp|blend|max|ma|mb|ztl|obj|fbx|c4d)$/i;

export function extOf(name) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

/* 按顶层目录把文件分成「学生提交」 */
export function groupByStudent(fileList) {
  const map = new Map();
  for (const f of fileList) {
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split('/');
    const folder = parts.length > 1 ? parts[0] : '未分组';
    if (!map.has(folder)) map.set(folder, []);
    map.get(folder).push({
      file: f,
      path: rel,
      name: f.name,
      ext: extOf(f.name),
      size: f.size,
      mtime: f.lastModified
    });
  }
  return [...map.entries()].map(([folderName, files]) => ({ folderName, files }));
}

export function matchStudent(folderName, students) {
  const norm = (s) => String(s || '').replace(/[\s_\-（）()]/g, '').toLowerCase();
  const f = norm(folderName);
  let best = null;
  for (const s of students || []) {
    const sid = norm(s.sid);
    const name = norm(s.name);
    if (sid && f.includes(sid)) return s;
    if (name && name.length > 1 && f.includes(name)) {
      if (!best || name.length > norm(best.name).length) best = s;
    }
  }
  return best;
}

export function detectMaps(files) {
  const maps = {};
  const extras = [];
  for (const f of files) {
    if (!/\.(png|jpe?g|tga|exr|tif?f)$/i.test(f.name)) continue;
    if (PREVIEW_RE.test(f.path) || PREVIEW_RE.test(f.name)) continue;
    let hit = null;
    for (const def of MAP_DEFS) {
      if (def.patterns.test(f.name) || def.patterns.test(f.path)) { hit = def; break; }
    }
    if (!hit) { extras.push(f); continue; }
    if (!maps[hit.key] || maps[hit.key].size < f.size) maps[hit.key] = Object.assign({ mapKey: hit.key }, f);
  }
  return { maps, extras };
}

export function pickPreview(files) {
  return files.filter(f => IMAGE_EXT.test(f.name) && (PREVIEW_RE.test(f.path) || PREVIEW_RE.test(f.name)));
}

function clamp(n, a = 0, b = 100) { return Math.max(a, Math.min(b, n)); }

/* 读取 zip 中央目录（.spp/.zip 工程文件轻量结构检测，不读整个文件） */
export async function readZipEntries(file, maxCentral = 3 * 1024 * 1024) {
  if (!/\.(spp|zip|sbsar|sbs)$/i.test(file.name)) return null;
  if (file.size < 22) return null;
  try {
    const tailLen = Math.min(file.size, 65557);
    const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
    const dv = new DataView(tail.buffer);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    const count = dv.getUint16(eocd + 10, true);
    const cdSize = dv.getUint32(eocd + 12, true);
    const cdOffset = dv.getUint32(eocd + 16, true);
    const readSize = Math.min(cdSize, maxCentral);
    const cd = new Uint8Array(await file.slice(cdOffset, cdOffset + readSize).arrayBuffer());
    const td = new TextDecoder('utf-8');
    const names = [];
    let p = 0;
    const limit = Math.min(count, 3000);
    for (let i = 0; i < limit; i++) {
      if (p + 46 > cd.length) break;
      if (!(cd[p] === 0x50 && cd[p + 1] === 0x4b && cd[p + 2] === 0x01 && cd[p + 3] === 0x02)) break;
      const nameLen = cd[p + 28] | (cd[p + 29] << 8);
      const extraLen = cd[p + 30] | (cd[p + 31] << 8);
      const commentLen = cd[p + 32] | (cd[p + 33] << 8);
      names.push(td.decode(cd.subarray(p + 46, p + 46 + nameLen)));
      p += 46 + nameLen + extraLen + commentLen;
    }
    return { count, names };
  } catch (e) {
    return null;
  }
}

export async function imageDims(file) {
  if (!/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)) return null;
  if (file.size > 40 * 1024 * 1024) return null;
  try {
    const bmp = await createImageBitmap(file);
    const r = { w: bmp.width, h: bmp.height };
    bmp.close && bmp.close();
    return r;
  } catch (e) {
    return null;
  }
}

/* 汇总一个学生的检测结果 */
export function evaluateSubmission(sub, task, students) {
  const files = sub.files;
  const matched = matchStudent(sub.folderName, students);
  const { maps, extras } = detectMaps(files);
  const previews = pickPreview(files);
  const spps = files.filter(f => SPP_EXT.test(f.name) && !/\.spp\./i.test(f.name));
  const requiredKeys = (task && task.requiredMaps && task.requiredMaps.length)
    ? task.requiredMaps
    : MAP_DEFS.filter(m => m.requiredByDefault).map(m => m.key);
  const covered = requiredKeys.filter(k => maps[k]);
  const missing = requiredKeys.filter(k => !maps[k]);
  const minRes = (task && task.minRes) || 2048;

  const textureFiles = Object.values(maps);
  const resList = textureFiles.map(f => (f.w && f.h) ? Math.min(f.w, f.h) : null).filter(Boolean);
  const maxRes = resList.length ? Math.max(...resList) : 0;
  const minFound = resList.length ? Math.min(...resList) : 0;
  const consistent = resList.length > 1 ? (Math.max(...resList) - Math.min(...resList)) <= Math.max(2, maxRes * 0.25) : true;

  const flags = [];
  if (!missing.length) flags.push({ level: 'ok', msg: `必需贴图齐全（${covered.length}/${requiredKeys.length}）` });
  else flags.push({ level: 'error', msg: `缺少必需贴图：${missing.map(k => (MAP_DEFS.find(m => m.key === k) || {}).label || k).join('、')}` });
  if (spps.length) flags.push({ level: 'ok', msg: `包含工程文件 ${spps.length} 个（${spps.map(s => s.name).join('、')}）` });
  else flags.push({ level: 'warn', msg: '未找到 .spp 工程文件，只有导出贴图' });
  if (previews.length) flags.push({ level: 'ok', msg: `包含预览图 ${previews.length} 张` });
  else flags.push({ level: 'warn', msg: '未找到效果预览图，展示分可能偏低' });
  if (maxRes && maxRes < minRes) flags.push({ level: 'error', msg: `贴图分辨率 ${maxRes}px 低于要求 ${minRes}px` });
  else if (maxRes) flags.push({ level: 'ok', msg: `贴图最高分辨率 ${maxRes}px` });
  if (!consistent) flags.push({ level: 'warn', msg: `贴图分辨率不一致（${minFound}~${maxRes}px）` });
  if (files.filter(f => /[()\u4e00-\u9fa5]/.test(f.name)).length > files.length * 0.5) {
    flags.push({ level: 'warn', msg: '大量文件名包含中文或括号，建议规范命名便于引擎导入' });
  }
  if (extras.length > 6) flags.push({ level: 'warn', msg: `有 ${extras.length} 张图片未识别为常用 PBR 通道` });

  const coverage = requiredKeys.length ? covered.length / requiredKeys.length : 1;
  const resScore = maxRes ? clamp((Math.min(maxRes, minRes * 2) / minRes) * 70 + 30) : 20;
  const completeness = Math.round(clamp(coverage * 60 + (spps.length ? 20 : 0) + (previews.length ? 20 : 0)));
  const texture = Math.round(clamp(resScore * 0.6 + (consistent ? 20 : 6) + clamp(textureFiles.length * 5, 0, 20)));
  const presentation = Math.round(clamp(
    (previews.length === 0 ? 30 : previews.length === 1 ? 62 : 85) + (maxRes >= 1024 ? 10 : 0)
  ));

  const autoScores = { completeness, texture, presentation };
  const weights = Object.assign({}, DEFAULT_WEIGHTS, (task && task.weights) || {});
  const draftScores = {
    completeness, texture,
    uv: 70,
    presentation,
    creativity: 70
  };
  const total = computeTotal(draftScores, weights);

  return {
    folderName: sub.folderName,
    studentId: matched ? matched.sid : '',
    studentName: matched ? matched.name : sub.folderName,
    matched: !!matched,
    fileCount: files.length,
    totalBytes: files.reduce((a, f) => a + f.size, 0),
    files,
    maps, extras, previews, spps,
    requiredKeys, coveredKeys: covered, missingKeys: missing,
    maxRes, minResFound: minFound, consistent,
    flags, autoScores, draftScores, total,
    weights
  };
}

export function computeTotal(scores, weights) {
  let sum = 0, wsum = 0;
  for (const k of Object.keys(DEFAULT_WEIGHTS)) {
    const w = Number(weights[k]) || 0;
    if (!w) continue;
    const v = scores[k];
    if (v == null) continue;
    sum += v * w;
    wsum += w;
  }
  return wsum ? Math.round(sum / wsum) : 0;
}

export function levelOfScore(n) {
  if (n >= 90) return { cls: 'teal', text: '优秀' };
  if (n >= 80) return { cls: 'gold', text: '良好' };
  if (n >= 70) return { cls: '', text: '中等' };
  if (n >= 60) return { cls: '', text: '及格' };
  return { cls: '', text: '待改进' };
}

export function localComment(a) {
  const parts = [];
  const lv = levelOfScore(a.total);
  parts.push(`【自动检测】${a.studentName} 的提交共 ${a.fileCount} 个文件（${(a.totalBytes / 1048576).toFixed(1)} MB），自动评分 ${a.total} 分（${lv.text}）。`);
  const missing = a.missingKeys.map(k => (MAP_DEFS.find(m => m.key === k) || {}).label || k);
  if (missing.length) parts.push(`缺少通道：${missing.join('、')}，建议补齐导出。`);
  else parts.push('必需 PBR 通道齐全。');
  if (a.spps.length) parts.push(`工程文件：${a.spps.map(s => s.name).join('、')}。`);
  if (a.maxRes) parts.push(`贴图分辨率：${a.minResFound} ~ ${a.maxRes}px${a.consistent ? '（一致）' : '（不一致，建议统一）'}。`);
  if (a.previews.length) parts.push(`预览图 ${a.previews.length} 张。`);
  parts.push('改进建议：按「工程文件 + 必需贴图 + 效果预览」的规范打包提交，贴图统一分辨率与命名，并在 .spp 中保留可编辑图层。');
  return parts.join('\n');
}

export function buildAiPrompt(a, task, profile) {
  const w = a.weights;
  const fileLines = a.files.slice(0, 120).map(f => `- ${f.path}（${(f.size / 1024).toFixed(0)} KB）`).join('\n');
  const mapLines = MAP_DEFS.map(m => {
    const f = a.maps[m.key];
    return `- ${m.label}：${f ? (f.name + (f.w ? `（${f.w}×${f.h}）` : '')) : '缺失'}`;
  }).join('\n');
  return `你是一位资深 Substance Painter 材质讲师，请对一名学生的实训作品做检测与评估。

【课程】琅泽·老高课堂《Substance Painter 2019》系统课
【实训任务】${task ? task.title : '材质实训'}${task && task.deadline ? '（截止 ' + task.deadline + '）' : ''}
【任务要求】${task && task.desc ? task.desc : '完成一个完整材质项目并导出贴图与预览'}
【评分维度与权重】完整性 ${w.completeness}% / 贴图质量 ${w.texture}% / UV与结构 ${w.uv}% / 展示效果 ${w.presentation}% / 创意 ${w.creativity}%

【自动检测结果】
学生：${a.studentName}${a.studentId ? '（学号 ' + a.studentId + '）' : ''}
文件夹：${a.folderName}
文件数：${a.fileCount}，总大小：${(a.totalBytes / 1048576).toFixed(1)} MB
PBR 通道覆盖：
${mapLines}
工程文件：${a.spps.length ? a.spps.map(s => s.name).join('、') : '无'}
贴图分辨率：${a.minResFound || '-'} ~ ${a.maxRes || '-'}px，${a.consistent ? '一致' : '不一致'}
预览图：${a.previews.length} 张
检测问题：${a.flags.map(f => `[${f.level}] ${f.msg}`).join('；')}

【文件清单（节选）】
${fileLines}

【要求】
1) 按五个维度各给 0-100 分，并给出加权总分；
2) 指出 2-3 个具体、可执行的改进点（对应 SP 的图层/遮罩/生成器/锚点/UV 操作）；
3) 用讲师口吻写 80-120 字的评语；
4) 严格输出 JSON，不要输出其它文字：
{"scores":{"completeness":0,"texture":0,"uv":0,"presentation":0,"creativity":0},"total":0,"comment":"...","improvements":["...","..."]}`;
}

export function buildAgentPack(a, task, profile, rootPath) {
  const now = new Date().toLocaleString('zh-CN');
  const fileTable = a.files.slice(0, 200).map(f =>
    `| ${f.path} | ${f.ext || '-'} | ${(f.size / 1024).toFixed(0)} KB |`
  ).join('\n');
  const mapLines = MAP_DEFS.map(m => {
    const f = a.maps[m.key];
    return `| ${m.label} | ${f ? f.name + (f.w ? `（${f.w}×${f.h}）` : '') : '缺失'} |`;
  }).join('\n');
  return `# 实训作品 AI 深度评审任务书

> 生成时间：${now}
> 生成工具：材质工坊 · 教师管理模块
> 用途：交给具备文件读取能力的 AI 助手（WorkBuddy / 豆包工作 / DeepSeek Harness 等）执行深度评审。
> 使用方法：把本文件连同「学生提交根目录」一起交给 AI，AI 需要能访问该目录下的真实文件。

## 一、课程与任务

- 课程：琅泽·老高课堂《Substance Painter 2019》系统课
- 任务：${task ? task.title : '材质实训'}
- 要求：${task && task.desc ? task.desc : '完成完整材质项目，提交工程文件、PBR 贴图与效果预览'}
- 截止：${task && task.deadline ? task.deadline : '未设置'}
- 评分权重：完整性 ${a.weights.completeness}% / 贴图质量 ${a.weights.texture}% / UV与结构 ${a.weights.uv}% / 展示 ${a.weights.presentation}% / 创意 ${a.weights.creativity}%

## 二、学生信息

- 姓名：${a.studentName}${a.studentId ? '（学号 ' + a.studentId + '）' : ''}
- 提交文件夹：${a.folderName}
- 提交根目录（绝对路径，请 AI 读取）：\`${rootPath || '（请教师填写）'}\`
- 文件数：${a.fileCount}；总大小：${(a.totalBytes / 1048576).toFixed(1)} MB

## 三、平台自动检测结果

| 检测项 | 结果 |
| --- | --- |
| PBR 通道覆盖 | ${a.coveredKeys.length}/${a.requiredKeys.length} |
| 工程文件 | ${a.spps.length ? a.spps.map(s => s.name).join('、') : '未发现'} |
| 贴图分辨率 | ${a.minResFound || '-'} ~ ${a.maxRes || '-'}px（${a.consistent ? '一致' : '不一致'}） |
| 预览图 | ${a.previews.length} 张 |
| 自动评分 | ${a.total} 分 |

### 通道明细

| 通道 | 文件 |
| --- | --- |
${mapLines}

### 检测问题

${a.flags.map(f => `- [${f.level}] ${f.msg}`).join('\n')}

### 文件清单

| 路径 | 类型 | 大小 |
| --- | --- | --- |
${fileTable}

## 四、请 AI 执行的操作

1. 读取提交根目录下该学生文件夹中的真实文件：
   - 用解压工具查看 .spp 工程内部结构（纹理集名称、资源、尺寸）；
   - 打开 PBR 贴图检查：颜色空间、分辨率、通道是否接反（如法线被当颜色）；
   - 查看预览图判断整体效果与展示质量；
   - 若包含 .spp，评估图层组织是否可编辑、是否使用锚点/生成器/智能材质。
2. 针对五个维度各给 0-100 分，并计算加权总分。
3. 给出 3 条以上具体改进建议（对应 SP 图层/遮罩/生成器/锚点/UV 操作）。
4. 用讲师口吻写 100-150 字评语。
5. 只输出如下 JSON（不要输出其它内容）：

\`\`\`json
{
  "student": "${a.studentName}",
  "scores": { "completeness": 0, "texture": 0, "uv": 0, "presentation": 0, "creativity": 0 },
  "total": 0,
  "comment": "",
  "improvements": ["", "", ""]
}
\`\`\`

## 五、回填方式

回到平台 → 教师端 → 实训评估 → 打开该学生 → 点「导入 AI 结果」→ 粘贴上面的 JSON → 自动填入分数与评语。
`;
}

export function toCsv(rows, headers) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return '\ufeff' + lines.join('\n');
}
