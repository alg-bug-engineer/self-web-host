import Image from 'next/image'

export default function WechatCard({ analyticsTarget }: { analyticsTarget: 'about-card' | 'article-card' }) {
  return (
    <div className="bg-bg-secondary border border-border-default rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm hover:shadow-md transition-shadow">
      <a
        href="/images/qrcode.jpg"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="放大芝士AI吃鱼公众号二维码"
        className="w-32 h-32 bg-white border border-border-default rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        data-analytics-event="follow_wechat"
        data-analytics-target={analyticsTarget}
      >
        <Image
          src="/images/qrcode.jpg"
          alt="芝士AI吃鱼公众号二维码"
          width={128} 
          height={128}
          className="object-cover"
        />
      </a>
      
      <div className="flex-1 text-center md:text-left space-y-2">
        <h3 className="text-xl font-bold text-text-primary flex items-center justify-center md:justify-start gap-2">
          <span>关注「芝士AI吃鱼」公众号</span>
          <span className="label label-green text-xs">每周更新</span>
        </h3>
        <p className="text-text-secondary text-sm leading-relaxed">
          在这里，我用「人话」和「漫画」为你讲透 AI 前沿技术。
          关注后可获取：
          <span className="inline-flex gap-2 ml-1">
            <code className="text-xs bg-bg-tertiary px-1 py-0.5 rounded">技术白皮书</code>
            <code className="text-xs bg-bg-tertiary px-1 py-0.5 rounded">Agent 源码</code>
            <code className="text-xs bg-bg-tertiary px-1 py-0.5 rounded">求职指南</code>
          </span>
        </p>
        <p className="text-xs text-text-tertiary">点击二维码可放大，使用微信扫码关注。</p>
      </div>
    </div>
  )
}
