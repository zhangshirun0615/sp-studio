/* 数据加载：课程目录 / 各课程数据 / SP 课程旧接口 / 视频清单 */

const cache = {};

async function getJson(url) {
  if (cache[url]) return cache[url];
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`加载失败: ${url} (${res.status})`);
  const data = await res.json();
  cache[url] = data;
  return data;
}

const data = {
  base: 'data/',

  /* ---------- 平台课程目录（本地服务器已发布目录优先） ---------- */
  async catalog() {
    try {
      const res = await fetch('/api/catalog', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.courses) && data.courses.length) return data;
      }
    } catch (e) { /* 静态镜像 / 未发布时回落到静态目录 */ }
    return getJson(this.base + 'catalog.json');
  },

  async courseList() {
    const cat = await this.catalog();
    return cat.courses || [];
  },

  async courseById(id) {
    const list = await this.courseList();
    const meta = list.find(c => c.id === id);
    if (!meta) return null;
    const payload = await getJson(meta.dataFile);
    return { meta, data: payload };
  },

  /* 某门课程的课时数组（拍平，带模块信息） */
  async lessonsOf(id) {
    const c = await this.courseById(id);
    if (!c) return [];
    if (c.meta.type === 'sp') {
      const list = [];
      (c.data.modules || []).forEach(m => m.lessons.forEach(l => {
        list.push(Object.assign({}, l, {
          moduleId: m.id, moduleIndex: m.index, moduleTitle: m.title,
          moduleColor: m.color, courseId: id, key: String(l.no)
        }));
      }));
      return list.sort((a, b) => a.no - b.no);
    }
    const list = [];
    (c.data.modules || []).forEach(m => (m.lessons || []).forEach(l => {
      list.push(Object.assign({}, l, {
        moduleId: m.id, moduleIndex: m.index, moduleTitle: m.title,
        moduleColor: c.meta.accent || '#ff8a3d', courseId: id, key: String(l.no)
      }));
    }));
    return list.sort((a, b) => a.no - b.no);
  },

  async lessonById(courseId, no) {
    const list = await this.lessonsOf(courseId);
    return list.find(l => String(l.no) === String(no)) || null;
  },

  /* 本地服务器提供课程原始视频/资料（多根目录课程用 rootIndex 区分） */
  mediaUrl(courseId, rel, rootIndex) {
    const idx = Number(rootIndex || 0);
    return '/course-media/' + encodeURIComponent(courseId) + '/' + idx + '/'
      + String(rel).split('/').map(encodeURIComponent).join('/');
  },

  bilibiliEmbedUrl(bvid, page, cid) {
    const p = page || 1;
    const params = 'bvid=' + encodeURIComponent(bvid) + '&page=' + p + '&high_quality=1&danmaku=0&autoplay=0';
    return 'https://player.bilibili.com/player.html?' + params;
  },

  /* ---------- SP 课程旧接口（题库 / 知识库 / 驾驶舱沿用） ---------- */
  async course() { return getJson(this.base + 'course.json'); },
  async videos() {
    try { return await getJson(this.base + 'videos.json'); }
    catch (e) { return { videos: {} }; }
  },
  async quiz() { return getJson(this.base + 'quiz.json'); },
  async quizOf(courseId) {
    if (courseId === 'sp') {
      try { return await getJson(this.base + 'quizzes/sp.json'); } catch (e) { return getJson(this.base + 'quiz.json'); }
    }
    try { return await getJson(this.base + 'quizzes/' + courseId + '.json'); } catch (e) { return null; }
  },
  async kb() { return getJson(this.base + 'kb.json'); },
  async toolbox() { return getJson(this.base + 'toolbox.json'); },
  async faq() {
    try { return await getJson(this.base + 'faq.json'); } catch (e) { return { faqs: [] }; }
  },

  async flatLessons() {
    const c = await this.course();
    const list = [];
    c.modules.forEach(m => m.lessons.forEach(l => {
      list.push(Object.assign({}, l, { moduleId: m.id, moduleIndex: m.index, moduleTitle: m.title, moduleColor: m.color }));
    }));
    return list.sort((a, b) => a.no - b.no);
  },

  async lesson(no) {
    const list = await this.flatLessons();
    return list.find(l => l.no === Number(no)) || null;
  },

  async modules() { return (await this.course()).modules; },
  async meta() { return (await this.course()).meta; }
};

export default data;
