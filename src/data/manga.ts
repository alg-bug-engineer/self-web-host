export type MangaItem = {
  id: string;
  title: string;
  description: string;
  image: string;
  date: string;
  mood: string;
};

export const mangaGallery: MangaItem[] = [
  {
    id: 'mood-001',
    title: '今天也要把 AI 讲明白',
    description: '灵感来自最近的 RAG 项目复盘。',
    image: '/images/manga/mood-01.svg',
    date: '2025-02-01',
    mood: '治愈',
  },
  {
    id: 'mood-002',
    title: '高冷猫的碎碎念',
    description: '写作时最怕遇到概念堆叠。',
    image: '/images/manga/mood-02.svg',
    date: '2025-01-28',
    mood: '吐槽',
  },
  {
    id: 'mood-003',
    title: '卖萌机器人上线',
    description: '把复杂流程变成三步小任务。',
    image: '/images/manga/mood-03.svg',
    date: '2025-01-23',
    mood: '轻松',
  },
  {
    id: 'mood-004',
    title: '灵感记录卡',
    description: '把新知识点收集到工具里。',
    image: '/images/manga/mood-04.svg',
    date: '2025-01-18',
    mood: '专注',
  },
  {
    id: 'mood-005',
    title: '夜深人静的代码',
    description: '写完终于可以睡觉了。',
    image: '/images/manga/mood-05.svg',
    date: '2025-01-12',
    mood: '熬夜',
  },
  {
    id: 'mood-006',
    title: '学习进度条 +1',
    description: '又弄懂了一个 Transformer 细节。',
    image: '/images/manga/mood-06.svg',
    date: '2025-01-06',
    mood: '元气',
  },
];
