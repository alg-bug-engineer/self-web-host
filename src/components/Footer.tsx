import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="brand-mark" aria-hidden="true"><i>AI</i></span>
          <div><strong>芝士AI吃鱼</strong><p>把 AI 天书，讲成人话。</p></div>
        </div>
        <div className="footer-links">
          <div><span>探索</span><Link href="/blog">文章</Link><Link href="/portfolio">著作与作品</Link><Link href="/collections/tools">AI 工具</Link></div>
          <div><span>关于</span><Link href="/about">关于我</Link><Link href="/planet">知识星球</Link><a href="https://github.com/alg-bug-engineer" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div>
          <div className="footer-qr"><span>公众号</span><Image src="/images/qrcode.jpg" alt="公众号二维码" width={84} height={84} /></div>
        </div>
      </div>
      <div className="footer-bottom"><p>© {new Date().getFullYear()} 芝士AI吃鱼. All rights reserved.</p><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">鲁ICP备2024085839号</a></div>
    </footer>
  )
}
