import React from 'react';
import Image from 'next/image';
import { getSettings } from '@/lib/admin-storage';

export async function generateMetadata() {
  const settings = await getSettings();
  return {
    title: `知识星球 | ${settings.siteSlogan || '芝士AI吃鱼'}`,
    description: '加入知识星球，获取深度 AI 技术教程、项目源码及 1对1 答疑，加速你的 AI 商业化之路。',
  };
}

export default async function PlanetPage() {
  const settings = await getSettings();
  return (
    <div className="max-w-4xl mx-auto space-y-16 py-12 px-4">
      {/* Hero Section */}
      <section className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-tertiary/10 text-accent-tertiary text-sm font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-tertiary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-tertiary"></span>
          </span>
          进阶 AI 开发者必选
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-primary tracking-tight">
          从 AI 使用者到 <span className="text-accent-tertiary">AI 创造者</span>
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto">
          这里不只是搬运新闻，我们只聊硬核实战：大模型微调、RAG 系统架构、Agent 编排，以及如何将 AI 转化为真实的商业产品。
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a 
            href={settings.planetUrl || '#'} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn-primary px-8 py-3 text-lg"
          >
            立即加入星球
          </a>
          <button className="btn-secondary px-8 py-3 text-lg">
            查看课程大纲
          </button>
        </div>
      </section>

      {/* Pain Points */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            title: '拒绝信息过载',
            desc: '帮你过滤掉 90% 的无效 AI 资讯，只关注真正能落地的技术点。',
            icon: '🎯',
          },
          {
            title: '打破实战瓶颈',
            desc: '提供完整项目源码与架构图，告别“看懂了但写不出来”的尴尬。',
            icon: '💻',
          },
          {
            title: '链接高价值圈子',
            desc: '与 500+ 位 AI 创业者、大厂工程师共同交流，信息差就是生产力。',
            icon: '🤝',
          },
        ].map((item, i) => (
          <div key={i} className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-3">
            <div className="text-3xl">{item.icon}</div>
            <h3 className="text-lg font-semibold text-text-primary">{item.title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </section>

      {/* Benefits */}
      <section className="space-y-8 bg-bg-secondary border border-border-default rounded-3xl p-8 md:p-12">
        <h2 className="text-3xl font-bold text-text-primary text-center">星球专属特权</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
          {[
            { title: '硬核实战专栏', detail: '包含《Agent 开发实战》、《RAG 全栈指南》等深度教程。' },
            { title: '独家源码下载', detail: '本站所有 AI 工具、Demo 的完整前后端源码均可免费下载。' },
            { title: '私域技术答疑', detail: '在开发过程中遇到的疑难杂症，作者 1对1 亲自指导。' },
            { title: '前沿工具库', detail: '第一时间获取并测试最新的开源 AI 工具与闭源模型接口。' },
          ].map((benefit, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-tertiary/20 text-accent-tertiary flex items-center justify-center font-bold text-xs">
                ✓
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-text-primary">{benefit.title}</h4>
                <p className="text-sm text-text-secondary">{benefit.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Call to Action */}
      <section className="text-center space-y-8 pb-12">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary">扫描下方二维码加入</h2>
          <p className="text-sm text-text-tertiary">限时优惠进行中，加入即刻开启进阶之路</p>
        </div>
        <div className="inline-block p-4 bg-white rounded-2xl shadow-xl">
          {settings.planetQrCode ? (
            <Image src={settings.planetQrCode} alt="星球二维码" width={192} height={192} className="object-contain" />
          ) : (
            <div className="w-48 h-48 bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-400">
              <div className="text-center">
                <span className="text-4xl block mb-2">🪐</span>
                <span className="text-xs">星球二维码</span>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-text-tertiary">
          支持 3 天内无条件退款 · 微信扫码支付
        </p>
      </section>
    </div>
  );
}
