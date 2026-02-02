export type ToolItem = {
  id: string;
  name: string;
  description: string;
  url: string;
  tags: string[];
  status?: string;
};

export const tools: ToolItem[] = [
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
