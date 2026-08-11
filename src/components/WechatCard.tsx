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
          <span className="label label-green text-xs">持续更新</span>
        </h3>
        <p className="text-text-secondary text-sm leading-relaxed">
          在这里，我用「人话」和「漫画」拆解 AI 技术。公众号更新会同步整理到本站，方便继续阅读、检索和订阅。
        </p>
        <p className="text-xs text-text-tertiary">点击二维码可放大，使用微信扫码关注。</p>
      </div>
    </div>
  )
}
