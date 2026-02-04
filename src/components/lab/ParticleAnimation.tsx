import React from 'react';

export default function ParticleAnimation() {
  return (
    <div className="border border-dashed border-text-tertiary rounded-lg p-4 h-full">
      <h3 className="font-semibold text-text-secondary mb-2">Canvas 粒子效果</h3>
      <p className="text-sm text-text-tertiary">这是一个占位符。实际的 Canvas 动画将在这里实现。</p>
      <div className="mt-4 flex items-center justify-center bg-bg-tertiary h-24 rounded-md overflow-hidden">
        <p className="text-2xl animate-pulse">✨</p>
      </div>
    </div>
  );
}
