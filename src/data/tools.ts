export type ToolItem = {
  id: string;
  name: string;
  description: string;
  url: string;
  tags: string[];
  status?: string;
  isPro?: boolean;
  type?: 'link' | 'plugin';
  pluginId?: string;
};

export const tools: ToolItem[] = [
  {
    id: 'prompt-generator',
    name: 'AI 绘画提示词生成器',
    description: '内置多种艺术风格，一键生成高质量 Midjourney / SD 提示词。',
    url: '#',
    tags: ['生图', 'Prompt', '交互'],
    status: 'Hot',
    type: 'plugin',
    pluginId: 'prompt-generator',
  },
  {
    id: 'cogniflow-pro',
    name: 'CogniFlow Pro (全栈版)',
    description: '企业级 AI 知识管理平台，包含私有化 RAG 引擎与多智能体协作流源码。',
    url: '/planet',
    tags: ['RAG', 'Agent', '企业级'],
    status: 'Member',
    isPro: true,
  },
  {
    id: 'sd-xl-plugin',
    name: 'Stable Diffusion XL 高级插件',
    description: '支持 ComfyUI 远程调用的 Next.js 交互式生图插件。',
    url: '/planet',
    tags: ['生图', '插件', 'ComfyUI'],
    status: 'Pro',
    isPro: true,
  },
  {
    id: 'rag-workbench',
    name: 'RAG Workbench',
    description: '把检索、重写、召回评估串成一个可视化流程。',
    url: 'https://github.com/alg-bug-engineer/rag-workbench',
    tags: ['RAG', '评估', '工作流'],
    status: 'Beta',
  },
  {
    id: 'prompt-board',
    name: 'Prompt Board',
    description: '记录可复用的提示词模板，支持版本对比。',
    url: 'https://github.com/alg-bug-engineer/prompt-board',
    tags: ['Prompt', '模板', '知识库'],
    status: 'Active',
  },
  {
    id: 'agent-blueprint',
    name: 'Agent Blueprint',
    description: '常见智能体流程的结构化模板集合。',
    url: 'https://github.com/alg-bug-engineer/agent-blueprint',
    tags: ['Agent', '流程', '模板'],
    status: 'Active',
  },
  {
    id: 'model-notes',
    name: 'Model Notes',
    description: '把论文要点、模型结构变成卡片笔记。',
    url: 'https://github.com/alg-bug-engineer/model-notes',
    tags: ['论文', '笔记', '知识'],
    status: 'Draft',
  },
  {
    id: 'ai-toolbox',
    name: 'AI Toolbox',
    description: '收集日常常用的小工具与脚本合集。',
    url: 'https://github.com/alg-bug-engineer/ai-toolbox',
    tags: ['工具箱', '效率', '脚本'],
    status: 'Active',
  },
];
