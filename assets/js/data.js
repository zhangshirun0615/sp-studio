/* 数据加载：course / videos / quiz / kb / toolbox */

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

  async course() { return getJson(this.base + 'course.json'); },
  async videos() {
    try { return await getJson(this.base + 'videos.json'); }
    catch (e) { return { videos: {} }; }
  },
  async quiz() { return getJson(this.base + 'quiz.json'); },
  async kb() { return getJson(this.base + 'kb.json'); },
  async toolbox() { return getJson(this.base + 'toolbox.json'); },

  /* 拍平课程数据，便于检索 */
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

  async modules() {
    const c = await this.course();
    return c.modules;
  },

  async meta() { return (await this.course()).meta; }
};

export default data;
