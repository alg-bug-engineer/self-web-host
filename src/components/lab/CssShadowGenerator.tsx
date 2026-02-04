import React from 'react';

export default function CssShadowGenerator() {
  return (
    <div className="border border-dashed border-text-tertiary rounded-lg p-4 h-full">
      <h3 className="font-semibold text-text-secondary mb-2">CSS 阴影生成器</h3>
      <p className="text-sm text-text-tertiary">这是一个占位符。实际的工具组件将在这里实现。</p>
      <div className="mt-4 flex items-center justify-center bg-bg-tertiary h-24 rounded-md">
        <div className="w-12 h-12 bg-bg-primary rounded-md shadow-lg"></div>
      </div>
    </div>
  );
}
