import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import path from 'path'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const run = promisify(execFile)
export async function POST(req: NextRequest) {
 if (req.headers.get('origin') && req.headers.get('origin') !== req.nextUrl.origin) return new NextResponse(null,{status:403})
 try {
 const {id,action}=await req.json()
 if (!/^(index|0[1-9]|1[0-9]|20)$/.test(id)||!['view','read','like','share'].includes(action)) return new NextResponse(null,{status:400})
 const existing=req.cookies.get('planet_visitor')?.value
 const visitor=existing && /^[a-f0-9-]{36}$/.test(existing)?existing:randomUUID()
 const {stdout}=await run('python3',[path.join(process.cwd(),'scripts/planet-stats.py'),id,action,visitor],{timeout:10000})
 const res=NextResponse.json(JSON.parse(stdout),{headers:{'Cache-Control':'no-store'}})
 res.cookies.set('planet_visitor',visitor,{httpOnly:true,sameSite:'lax',secure:req.nextUrl.protocol==='https:',maxAge:31536000,path:'/'})
 return res
 }catch{return NextResponse.json({error:'统计暂不可用'},{status:503})}
}
