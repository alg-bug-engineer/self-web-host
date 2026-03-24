import Link from 'next/link'
import Image from 'next/image'

export default function Footer() {
    return (
        <footer className="app-footer p-6 mt-8">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-text-secondary">
                <div className="flex flex-col md:flex-row items-center gap-4">
                    <p>© {new Date().getFullYear()} 芝士AI吃鱼. All rights reserved.</p>
                    <a
                        href="http://beian.miit.gov.cn/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="footer-link"
                    >
                        鲁ICP备2024085839号
                    </a>
                </div>
                <div className="flex items-center gap-4">
                    <Link href="/about" className="footer-link">About</Link>
                    <Link href="/blog" className="footer-link">Blog</Link>
                    <div className="relative group">
                        <button className="footer-link flex items-center gap-1 focus:outline-none">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z" />
                            </svg>
                        </button>
                        <div className="absolute bottom-full right-0 mb-2 w-32 p-2 bg-bg-secondary border border-border-default rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            <div className="w-full aspect-square bg-white border border-border-default rounded overflow-hidden">
                                <Image 
                                    src="/images/qrcode.jpg" 
                                    alt="公众号二维码" 
                                    width={128} 
                                    height={128}
                                    className="object-cover"
                                />
                            </div>
                        </div>
                    </div>
                    <a href="https://github.com/alg-bug-engineer" target="_blank" rel="noopener noreferrer" className="footer-link">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.237 2.636 7.855 6.356 9.298.52.094.713-.223.713-.491 0-.242-.008-.888-.014-1.744-2.56.469-3.098-1.233-3.098-1.233-.418-1.06-.998-1.343-.998-1.343-.817-.555.061-.544.061-.544.906.064 1.381.936 1.381.936.805 1.378 2.118.98 2.63.748.082-.579.314-.974.572-1.199-2.009-.228-4.12-1.004-4.12-4.471 0-.99.355-1.796.936-2.427-.094-.228-.407-1.147.089-2.394 0 0 1.019-.327 3.332 1.24.965-.268 1.99-.402 3.01-.407 1.02.005 2.045.139 3.01.407 2.313-1.567 3.332-1.24 3.332-1.24.496 1.247.183 2.166.089 2.394.581.631.936 1.437.936 2.427 0 3.475-2.113 4.24-4.128 4.463.322.278.614.829.614 1.666 0 1.205-.011 2.176-.011 2.479 0 .269.19.59.719.49C21.365 19.855 24 16.237 24 12c0-5.523-4.477-10-10-10z"></path>
                        </svg>
                    </a>
                </div>
            </div>
        </footer>
    )
}
