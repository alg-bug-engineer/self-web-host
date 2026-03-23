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
