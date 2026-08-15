#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const defaultLesson = path.join(
  root,
  "content/courses/ai-native-generation/L01-ai-is-prediction.md",
);
const defaultOutput = path.join(
  root,
  "public/videos/courses/ai-native-generation/L01-ai-is-prediction-v1.mp4",
);
const defaultIntro = path.join(
  root,
  "public/videos/campaigns/ai-native-generation-30d/jimeng-video-20260811T051306Z-01.mp4",
);
const defaultHero = path.join(
  root,
  "public/images/campaigns/ai-native-generation-30d/refined/jimeng-image-20260811T050834Z-04.png",
);

const lessonPath = path.resolve(process.argv[2] || defaultLesson);
const outputPath = path.resolve(process.argv[3] || defaultOutput);
const introPath = path.resolve(process.env.COURSE_INTRO_VIDEO || defaultIntro);
const heroPath = path.resolve(process.env.COURSE_HERO_IMAGE || defaultHero);
const voice = process.env.COURSE_TTS_VOICE || "Tingting";
const rate = process.env.COURSE_TTS_RATE || "185";

const run = async (command, args, options = {}) => {
  const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  return { stdout, stderr };
};

const probeDuration = async (file) => {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Number(stdout.trim());
};

const escapeXml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const stripMarkdown = (value) =>
  value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "第 $&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const parseLesson = (markdown) => {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1] || "AI 原生一代";
  const lessonId = heading.split("｜")[0]?.trim() || "课程";
  const lessonTitle = heading.split("｜").slice(1).join("｜").trim() || heading;
  const scriptStart = markdown.indexOf("## 视频脚本");
  const scriptEnd = markdown.indexOf("## 画面设计");
  const script = markdown.slice(scriptStart, scriptEnd);
  const sections = [];
  const matcher = /^###\s+([^｜\n]+)｜([^\n]+)\n([\s\S]*?)(?=^###\s+|(?![\s\S]))/gm;
  let match;
  while ((match = matcher.exec(script)) !== null) {
    sections.push({
      timecode: match[1].trim(),
      title: match[2].trim(),
      narration: stripMarkdown(match[3]),
    });
  }
  if (!sections.length) throw new Error(`未从 ${lessonPath} 解析到视频章节`);
  return { heading, lessonId, lessonTitle, sections };
};

const wrapText = (value, width = 17) => {
  const chars = [...value];
  const lines = [];
  for (let index = 0; index < chars.length; index += width) {
    lines.push(chars.slice(index, index + width).join(""));
  }
  return lines;
};

const textBlock = (lines, { x, y, size = 42, color = "#EAF8FF", gap = 58, weight = 500 }) =>
  lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * gap}" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`,
    )
    .join("\n");

const card = ({ x, y, width, height, kicker, title, body, color = "#42D7D0" }) => {
  const bodyLines = wrapText(body, Math.max(10, Math.floor((width - 70) / 34))).slice(0, 3);
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="34" fill="#102942" stroke="${color}" stroke-opacity="0.6" stroke-width="2"/>
      <rect x="${x + 30}" y="${y + 30}" width="92" height="34" rx="17" fill="${color}" fill-opacity="0.18"/>
      <text x="${x + 76}" y="${y + 54}" text-anchor="middle" font-size="20" font-weight="700" fill="${color}">${escapeXml(kicker)}</text>
      <text x="${x + 34}" y="${y + 118}" font-size="34" font-weight="700" fill="#F7FBFF">${escapeXml(title)}</text>
      ${textBlock(bodyLines, { x: x + 34, y: y + 172, size: 28, gap: 43, color: "#BCD0DE" })}
    </g>`;
};

const slideSvg = async ({ lessonId, lessonTitle, section, index }) => {
  const heroBase64 = index === 0 ? (await readFile(heroPath)).toString("base64") : "";
  const common = `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#071929"/>
        <stop offset="0.58" stop-color="#0A263D"/>
        <stop offset="1" stop-color="#123B50"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.82" cy="0.2" r="0.75">
        <stop offset="0" stop-color="#42D7D0" stop-opacity="0.23"/>
        <stop offset="1" stop-color="#42D7D0" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000" flood-opacity="0.36"/></filter>
      <style>text { font-family: 'PingFang SC', 'Heiti SC', sans-serif; }</style>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    <rect width="1920" height="1080" fill="url(#glow)"/>
    <circle cx="1720" cy="180" r="100" fill="none" stroke="#42D7D0" stroke-opacity="0.18" stroke-width="2"/>
    <circle cx="1720" cy="180" r="145" fill="none" stroke="#42D7D0" stroke-opacity="0.1" stroke-width="2"/>
    <text x="110" y="85" font-size="26" font-weight="700" fill="#42D7D0">AI 原生一代 · 儿童 AI 素养</text>
    <text x="1810" y="85" text-anchor="end" font-size="24" fill="#88A7B8">${escapeXml(lessonId)} · 家长陪同</text>
    <text x="110" y="1005" font-size="22" fill="#7E9CAF">先理解，再使用；先核验，再相信</text>
    <text x="1810" y="1005" text-anchor="end" font-size="22" fill="#7E9CAF">不上传姓名、学校、住址或聊天记录</text>`;

  const lessonTitles = {
    L01: [
      ["今天谁替你", "做了预测？"],
      ["输入 → 模式 → 输出", "用“猜水果”理解 AI"],
      ["同一个 AI", "为什么时聪明、时糊涂？"],
      ["AI 不是", "电脑里的“小人”"],
      ["遇到 AI", "先做三个判断动作"],
      ["亲子任务", "家庭 AI 足迹清单"],
    ],
    L02: [
      ["AI 是在资料库里", "复制答案吗？"],
      ["一句话接龙", "为什么会有多种答案？"],
      ["训练数据给它模式", "不等于给它人生"],
      ["一次回答的", "三个盒子"],
      ["换一种问法", "答案为什么会变？"],
      ["亲子实验", "同一问题问三次"],
    ],
    L03: [
      ["错误为什么穿着", "“正确的外套”？"],
      ["所谓“幻觉”", "不是模型真的看见了什么"],
      ["先盯住", "四种高风险断言"],
      ["三层核验法", "从来源回到证据"],
      ["发现错误以后", "不要只让它重写"],
      ["亲子任务", "AI 错误侦探"],
    ],
    L04: [
      ["提示词很长", "不等于问题很清楚"],
      ["我要什么", "AI 替我猜什么"],
      ["四格问题卡", "背景 · 目标 · 限制 · 检查"],
      ["让 AI 先提问题", "不要偷偷补全"],
      ["把一个模糊任务", "修理成可检查任务"],
      ["亲子任务", "模糊问题维修站"],
    ],
    L05: [
      ["知道终点", "为什么还是不知道第一步"],
      ["一个好步骤", "动作 · 产物 · 检查"],
      ["先找依赖关系", "再安排任务顺序"],
      ["AI 可以提计划", "人要检查计划"],
      ["设置检查点", "不要等到最后才返工"],
      ["亲子任务", "四级任务阶梯"],
    ],
    L06: [
      ["会做", "不等于该交给它做"],
      ["AI 更适合", "做四类辅助工作"],
      ["人必须保留", "五种责任"],
      ["同一个步骤", "也可能有三种分工"],
      ["用四个问题", "检查人机分工"],
      ["亲子任务", "人机分工卡"],
    ],
    L07: [
      ["有链接", "还不等于有证据"],
      ["先拆出", "最小可核验断言"],
      ["检查原文", "是否真的支持"],
      ["主动寻找", "一个反例"],
      ["做一次真正独立的", "交叉检查"],
      ["结论要保留", "证据强度"],
      ["亲子任务", "三层验证卡"],
    ],
    L08: [
      ["漂亮结论", "不等于一项研究"],
      ["从一个可以观察的", "问题开始"],
      ["先设计公平比较", "再请 AI 帮忙"],
      ["人机分工", "要写进研究日志"],
      ["先保存原始记录", "再整理和分析"],
      ["结论必须带着", "范围和局限"],
      ["亲子任务", "研究日志第一版"],
    ],
    L09: [
      ["作品变漂亮", "不等于研究变可信"],
      ["一个作品", "要回答五个问题"],
      ["只选一种", "适合观众的形式"],
      ["给四种内容", "贴上来源标签"],
      ["孩子、家长和 AI", "各自做什么"],
      ["发布以前", "经过隐私与授权门"],
      ["亲子任务", "证据板与三分钟试讲"],
    ],
    L10: [
      ["只删掉姓名", "远远不够"],
      ["先认识五类", "需要保护的信息"],
      ["输入 AI 前", "先做最小化"],
      ["能打开、能生成", "不等于有权使用"],
      ["生成内容要标明", "也不能冒充真实"],
      ["输入门和发布门", "各检查四件事"],
      ["亲子任务", "家庭四类风险巡检"],
    ],
    L11: [
      ["它说“只有我懂你”", "就真的懂吗？"],
      ["像共情", "不等于拥有真实关系"],
      ["四类信号出现", "就要暂停"],
      ["绿、黄、红三色", "决定下一步"],
      ["退出对话", "只做四步"],
      ["家庭规则", "要保护求助"],
      ["亲子任务", "真人支持地图与退出卡"],
    ],
    L12: [
      ["终课成果", "不是一件“完美作品”"],
      ["十二节课", "压缩成四种能力"],
      ["公约必须写成动作", "而不是口号"],
      ["家庭 AI 公约", "八条可复查规则"],
      ["四分钟答辩", "让证据走到前面"],
      ["六维量表", "只找下一次修改"],
      ["亲子任务", "公约、答辩与下一步"],
    ],
  };
  const titleLines = lessonTitles[lessonId]?.[index] || wrapText(section.title, 14);
  const heading = textBlock(titleLines, {
    x: 110,
    y: 210,
    size: index === 0 ? 66 : 58,
    gap: 78,
    weight: 760,
    color: "#F7FBFF",
  });

  let visual = "";
  if (lessonId === "L02") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "GENERATE", title: "逐步生成", body: "根据上下文与语言模式，组合接下来更合适的内容" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "VERIFY", title: "事实要核验", body: "听起来合理，不等于现实中已经得到证据", color: "#F4C95D" })}`;
    } else if (index === 1) {
      const branches = ["写作业", "去踢球", "吃点东西", "回家"];
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="465" width="700" height="270" rx="42" fill="#102942" stroke="#42D7D0" stroke-opacity="0.65" stroke-width="2"/>
        <text x="165" y="550" font-size="28" font-weight="700" fill="#42D7D0">当前上下文</text>
        <text x="165" y="640" font-size="48" font-weight="750" fill="#F7FBFF">今天放学以后，我先……</text></g>
        <path d="M850 600 H1000" stroke="#42D7D0" stroke-width="6" stroke-linecap="round"/><path d="M985 583 L1010 600 L985 617" fill="none" stroke="#42D7D0" stroke-width="6"/>
        ${branches.map((item, branchIndex) => `<rect x="${1070 + (branchIndex % 2) * 360}" y="${470 + Math.floor(branchIndex / 2) * 150}" width="320" height="112" rx="26" fill="${branchIndex === 0 ? "#42D7D0" : "#183B58"}" fill-opacity="${branchIndex === 0 ? "0.78" : "1"}"/><text x="${1230 + (branchIndex % 2) * 360}" y="${540 + Math.floor(branchIndex / 2) * 150}" text-anchor="middle" font-size="34" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        <text x="1070" y="815" font-size="28" fill="#BCD0DE">都可能通顺，但你仍不知道真实发生了什么。</text>`;
    } else if (index === 2) {
      visual = `
        ${card({ x: 110, y: 470, width: 500, height: 330, kicker: "DATA", title: "大量训练数据", body: "文字、图像和其他材料中既有模式，也可能有错误与偏见" })}
        ${card({ x: 710, y: 470, width: 500, height: 330, kicker: "PATTERN", title: "调整内部参数", body: "学习内容如何关联，不是把每篇文章完整放进抽屉", color: "#F4C95D" })}
        ${card({ x: 1310, y: 470, width: 500, height: 330, kicker: "LIMIT", title: "缺少生活处境", body: "不知道你未说明的背景，也不会自动承担结果", color: "#FF7A90" })}`;
    } else if (index === 3) {
      visual = `
        ${card({ x: 110, y: 465, width: 500, height: 350, kicker: "BOX 1", title: "模型模式", body: "训练后保留的语言与知识关系，不是逐条可查百科" })}
        ${card({ x: 710, y: 465, width: 500, height: 350, kicker: "BOX 2", title: "外部资料", body: "搜索、文件或知识库；可以回到来源，但资料仍需检查", color: "#F4C95D" })}
        ${card({ x: 1310, y: 465, width: 500, height: 350, kicker: "BOX 3", title: "当前对话", body: "你的问题、背景和限制；输入含糊时容易被自行补全", color: "#8DA8FF" })}`;
    } else if (index === 4) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="470" width="1700" height="330" rx="42" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        <line x1="220" y1="635" x2="1700" y2="635" stroke="#42D7D0" stroke-width="8" stroke-linecap="round"/>
        ${[
          [260, "创意草稿", "可比较"],
          [720, "常识解释", "查来源"],
          [1180, "精确事实", "强核验"],
          [1640, "高影响决定", "不能代替专业判断"],
        ].map(([x, label, hint], riskIndex) => `<circle cx="${x}" cy="635" r="${22 + riskIndex * 5}" fill="${riskIndex < 2 ? "#42D7D0" : riskIndex === 2 ? "#F4C95D" : "#FF7A90"}"/><text x="${x}" y="565" text-anchor="middle" font-size="32" font-weight="700" fill="#F7FBFF">${label}</text><text x="${x}" y="720" text-anchor="middle" font-size="25" fill="#BCD0DE">${hint}</text>`).join("\n")}
        </g>`;
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="435" width="1700" height="410" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.5" stroke-width="2"/>
        ${[
          ["第一次", "直接提问", "观察它怎样补全"],
          ["第二次", "要求来源", "标出不确定性"],
          ["第三次", "提供资料", "只按原文回答"],
        ].map(([step, title, body], experimentIndex) => `${card({ x: 155 + experimentIndex * 540, y: 485, width: 470, height: 300, kicker: step, title, body, color: experimentIndex === 1 ? "#F4C95D" : experimentIndex === 2 ? "#8DA8FF" : "#42D7D0" })}`).join("\n")}
        </g>`;
    }
  } else if (lessonId === "L03") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "FLUENT", title: "语言很流畅", body: "有标题、有日期、有解释，看起来像已经查过" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "EVIDENCE", title: "证据可能断裂", body: "表达完整，不代表事实或来源得到支持", color: "#FF7A90" })}`;
    } else if (index === 1) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="470" width="760" height="330" rx="42" fill="#102942" stroke="#F4C95D" stroke-opacity="0.6" stroke-width="2"/>
        <text x="165" y="555" font-size="30" font-weight="700" fill="#F4C95D">语言层面</text>
        <text x="165" y="635" font-size="48" font-weight="750" fill="#F7FBFF">连贯、完整、像真的</text>
        <text x="165" y="710" font-size="29" fill="#BCD0DE">模型生成了一个符合语言模式的表达</text></g>
        <path d="M900 635 H1010" stroke="#FF7A90" stroke-width="6" stroke-dasharray="16 14"/>
        <g filter="url(#shadow)"><rect x="1050" y="470" width="760" height="330" rx="42" fill="#102942" stroke="#FF7A90" stroke-opacity="0.65" stroke-width="2"/>
        <text x="1105" y="555" font-size="30" font-weight="700" fill="#FF7A90">事实层面</text>
        <text x="1105" y="635" font-size="48" font-weight="750" fill="#F7FBFF">没有可靠来源支持</text>
        <text x="1105" y="710" font-size="29" fill="#BCD0DE">不是模型拥有人的视觉、记忆或感受</text></g>`;
    } else if (index === 2) {
      const assertionCards = [
        ["数字", "人数、年份、比例与排名", "#42D7D0"],
        ["引语", "必须回到原始讲话或文章", "#F4C95D"],
        ["经历", "职务、学校、奖项与时间线", "#8DA8FF"],
        ["高影响", "医疗、法律、财务与安全", "#FF7A90"],
      ];
      visual = assertionCards.map(([title, body, color], assertionIndex) => card({
        x: 110 + (assertionIndex % 2) * 860,
        y: 440 + Math.floor(assertionIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `0${assertionIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 3) {
      visual = `
        ${[
          ["第一层", "问来源", "区分资料、推测与不知道", "#42D7D0"],
          ["第二层", "开原文", "看发布者、日期和完整上下文", "#F4C95D"],
          ["第三层", "交叉检查", "寻找第二个独立可靠来源", "#8DA8FF"],
        ].map(([step, title, body, color], layerIndex) => `<g filter="url(#shadow)"><rect x="${160 + layerIndex * 545}" y="${650 - layerIndex * 95}" width="480" height="${190 + layerIndex * 95}" rx="34" fill="#102942" stroke="${color}" stroke-opacity="0.7" stroke-width="2"/><text x="${205 + layerIndex * 545}" y="${715 - layerIndex * 95}" font-size="24" font-weight="700" fill="${color}">${step}</text><text x="${205 + layerIndex * 545}" y="${775 - layerIndex * 95}" font-size="40" font-weight="750" fill="#F7FBFF">${title}</text>${textBlock(wrapText(body, 16), { x: 205 + layerIndex * 545, y: 830 - layerIndex * 95, size: 25, gap: 36, color: "#BCD0DE" })}</g>`).join("\n")}`;
    } else if (index === 4) {
      visual = `
        ${card({ x: 110, y: 470, width: 760, height: 340, kicker: "RETRY", title: "“请重新回答”", body: "可能只是换一种说法，没有增加任何证据", color: "#FF7A90" })}
        <path d="M900 640 H1010" stroke="#42D7D0" stroke-width="6" stroke-linecap="round"/><path d="M995 623 L1020 640 L995 657" fill="none" stroke="#42D7D0" stroke-width="6"/>
        ${card({ x: 1050, y: 470, width: 760, height: 340, kicker: "CONSTRAIN", title: "增加证据约束", body: "限定资料、标出段落，资料未说明时写未知", color: "#42D7D0" })}`;
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="430" width="1700" height="420" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["原始问题", "高风险断言", "原始资料", "独立来源", "核验结果"].map((item, itemIndex) => `<rect x="${155 + itemIndex * 325}" y="485" width="295" height="90" rx="18" fill="${itemIndex === 4 ? "#42D7D0" : "#183B58"}" fill-opacity="${itemIndex === 4 ? "0.78" : "1"}"/><text x="${302 + itemIndex * 325}" y="542" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        <text x="155" y="660" font-size="34" font-weight="700" fill="#F7FBFF">发现一次错误，不是终点</text>
        <text x="155" y="725" font-size="30" fill="#BCD0DE">保留原始回答、查到的来源和修改后的结论。</text>
        <text x="155" y="785" font-size="30" fill="#F4C95D">资料不足时，写“目前还不能确认”。</text></g>`;
    }
  } else if (lessonId === "L04") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "LONG", title: "句子写得很长", body: "如果目标和范围仍然含糊，AI 只会更完整地替你猜" , color: "#FF7A90"})}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "CLEAR", title: "问题可以检查", body: "说清背景、目标、限制，以及怎样判断任务完成" })}`;
    } else if (index === 1) {
      visual = `
        ${card({ x: 110, y: 460, width: 700, height: 350, kicker: "VAGUE", title: "“帮我介绍水循环”", body: "对象、目的、时长、范围和来源都要由 AI 自行补全", color: "#FF7A90" })}
        <path d="M845 635 H980" stroke="#42D7D0" stroke-width="6" stroke-linecap="round"/><path d="M965 618 L990 635 L965 652" fill="none" stroke="#42D7D0" stroke-width="6"/>
        ${card({ x: 1025, y: 460, width: 785, height: 350, kicker: "DEFINED", title: "三分钟 · 三要点 · 有来源", body: "面向五年级同学，让大家听懂蒸发、凝结和降水", color: "#42D7D0" })}`;
    } else if (index === 2) {
      visual = [
        ["背景", "谁使用、已知什么、有什么去标识化资料", "#42D7D0"],
        ["目标", "最后得到什么，准备解决什么问题", "#F4C95D"],
        ["限制", "时间、范围、格式、资料与隐私边界", "#8DA8FF"],
        ["检查", "来源、完成标准、不确定项和独立表达", "#FF7A90"],
      ].map(([title, body, color], cardIndex) => card({
        x: 110 + (cardIndex % 2) * 860,
        y: 440 + Math.floor(cardIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `0${cardIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 3) {
      const clarificationSteps = [
        ["01", "写任务说明", "先表达自己的目标"],
        ["02", "AI 最多问五题", "只找缺口，不直接作答"],
        ["03", "人确认条件", "拒绝无关身份信息"],
        ["04", "形成可检查任务", "人保留最终决定"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="445" width="1700" height="385" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${clarificationSteps.map(([step, title, body], stepIndex) => `<g><rect x="${150 + stepIndex * 410}" y="495" width="350" height="250" rx="28" fill="#183B58" stroke="${stepIndex === 2 ? "#F4C95D" : "#42D7D0"}" stroke-opacity="0.55"/><text x="${185 + stepIndex * 410}" y="548" font-size="22" font-weight="700" fill="${stepIndex === 2 ? "#F4C95D" : "#42D7D0"}">${step}</text><text x="${185 + stepIndex * 410}" y="615" font-size="34" font-weight="750" fill="#F7FBFF">${title}</text>${textBlock(wrapText(body, 13), { x: 185 + stepIndex * 410, y: 670, size: 24, gap: 34, color: "#BCD0DE" })}</g>${stepIndex < 3 ? `<path d="M${510 + stepIndex * 410} 620 H${545 + stepIndex * 410}" stroke="#42D7D0" stroke-width="5"/><path d="M${535 + stepIndex * 410} 609 L${552 + stepIndex * 410} 620 L${535 + stepIndex * 410} 631" fill="none" stroke="#42D7D0" stroke-width="5"/>` : ""}`).join("\n")}</g>`;
    } else if (index === 4) {
      visual = `
        ${card({ x: 110, y: 460, width: 700, height: 360, kicker: "BEFORE", title: "“帮我写观察报告”", body: "可能补出没有发生的观察，也看不出孩子做了什么", color: "#FF7A90" })}
        <path d="M845 640 H980" stroke="#42D7D0" stroke-width="6" stroke-linecap="round"/><path d="M965 623 L990 640 L965 657" fill="none" stroke="#42D7D0" stroke-width="6"/>
        ${card({ x: 1025, y: 460, width: 785, height: 360, kicker: "AFTER", title: "七天数据 · 八十字 · 未知留空", body: "只整理已有记录，先列变化，最后由孩子解释结论", color: "#42D7D0" })}`;
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="430" width="1700" height="420" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["模糊问题", "四格问题卡", "澄清问题", "修好任务", "比较回答"].map((item, itemIndex) => `<rect x="${155 + itemIndex * 325}" y="485" width="295" height="90" rx="18" fill="${itemIndex === 4 ? "#42D7D0" : "#183B58"}" fill-opacity="${itemIndex === 4 ? "0.78" : "1"}"/><text x="${302 + itemIndex * 325}" y="542" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        <text x="155" y="665" font-size="34" font-weight="700" fill="#F7FBFF">关闭 AI 后，用一句话说明：</text>
        <text x="155" y="730" font-size="31" fill="#BCD0DE">这个任务为什么值得做？我准备怎样判断它完成？</text>
        <text x="155" y="790" font-size="27" fill="#F4C95D">不记录姓名、学校、住址、正脸、账号或私人聊天。</text></g>`;
    }
  } else if (lessonId === "L05") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "GOAL", title: "终点已经清楚", body: "知道要判断什么，也知道整体怎样算完成" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "START", title: "第一步仍然模糊", body: "搜索、观察、比较和表达挤在同一个大任务里", color: "#FF7A90" })}`;
    } else if (index === 1) {
      visual = `
        ${card({ x: 110, y: 470, width: 500, height: 330, kicker: "ACTION", title: "动作", body: "使用记录、寻找、筛选、比较、核验或解释等清楚动词" })}
        ${card({ x: 710, y: 470, width: 500, height: 330, kicker: "OUTPUT", title: "产物", body: "完成后留下表格、来源、对比卡或一句暂时结论", color: "#F4C95D" })}
        ${card({ x: 1310, y: 470, width: 500, height: 330, kicker: "CHECK", title: "检查", body: "来源能打开、记录无漏项、结论只使用已有证据", color: "#8DA8FF" })}`;
    } else if (index === 2) {
      const dependencySteps = [
        ["条件", "列出需要比较什么"],
        ["资料", "筛选可靠公开来源"],
        ["记录", "三天日照观察表"],
        ["比较", "需求与记录同表"],
        ["结论", "适合、部分或未知"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="440" width="1700" height="410" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${dependencySteps.map(([title, body], stepIndex) => `<g><rect x="${145 + stepIndex * 330}" y="500" width="285" height="245" rx="26" fill="${stepIndex === 4 ? "#244F64" : "#183B58"}" stroke="${stepIndex === 4 ? "#F4C95D" : "#42D7D0"}" stroke-opacity="0.55"/><text x="${180 + stepIndex * 330}" y="560" font-size="23" font-weight="700" fill="${stepIndex === 4 ? "#F4C95D" : "#42D7D0"}">0${stepIndex + 1}</text><text x="${180 + stepIndex * 330}" y="625" font-size="37" font-weight="750" fill="#F7FBFF">${title}</text>${textBlock(wrapText(body, 11), { x: 180 + stepIndex * 330, y: 680, size: 23, gap: 32, color: "#BCD0DE" })}</g>${stepIndex < 4 ? `<path d="M${440 + stepIndex * 330} 625 H${465 + stepIndex * 330}" stroke="#42D7D0" stroke-width="5"/><path d="M${455 + stepIndex * 330} 614 L${472 + stepIndex * 330} 625 L${455 + stepIndex * 330} 636" fill="none" stroke="#42D7D0" stroke-width="5"/>` : ""}`).join("\n")}
        <text x="145" y="800" font-size="27" fill="#F4C95D">前一步没有产物，后一步不要假装继续。</text></g>`;
    } else if (index === 3) {
      visual = [
        ["证据", "有没有跳过必须的资料或观察？", "#42D7D0"],
        ["大小", "有没有把两个大动作塞进一步？", "#F4C95D"],
        ["产物", "每一步是否留下可以查看的结果？", "#8DA8FF"],
        ["责任", "最后判断是否仍然由人完成？", "#FF7A90"],
      ].map(([title, body, color], checkIndex) => card({
        x: 110 + (checkIndex % 2) * 860,
        y: 440 + Math.floor(checkIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `CHECK 0${checkIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 4) {
      const checkpointItems = [
        ["开始", "确认终点"],
        ["资料后", "检查来源"],
        ["记录后", "检查漏项"],
        ["比较后", "区分证据与猜测"],
        ["结尾", "孩子独立表达"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="455" width="1700" height="350" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        <line x1="210" y1="625" x2="1710" y2="625" stroke="#345670" stroke-width="10" stroke-linecap="round"/>
        ${checkpointItems.map(([title, body], checkpointIndex) => `<circle cx="${240 + checkpointIndex * 365}" cy="625" r="${checkpointIndex === 4 ? 32 : 24}" fill="${checkpointIndex % 2 === 1 ? "#F4C95D" : "#42D7D0"}"/><text x="${240 + checkpointIndex * 365}" y="555" text-anchor="middle" font-size="29" font-weight="700" fill="#F7FBFF">${title}</text><text x="${240 + checkpointIndex * 365}" y="705" text-anchor="middle" font-size="24" fill="#BCD0DE">${body}</text>`).join("\n")}
        <text x="210" y="765" font-size="26" fill="#F4C95D">在还来得及修改时发现问题，而不是最后一次性返工。</text></g>`;
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="425" width="1700" height="430" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["动作", "人 / AI", "产物", "检查"].map((item, columnIndex) => `<rect x="${155 + columnIndex * 405}" y="480" width="370" height="82" rx="18" fill="${columnIndex === 3 ? "#42D7D0" : "#183B58"}" fill-opacity="${columnIndex === 3 ? "0.78" : "1"}"/><text x="${340 + columnIndex * 405}" y="533" text-anchor="middle" font-size="28" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        ${[0, 1, 2, 3].map((rowIndex) => `<rect x="155" y="${590 + rowIndex * 55}" width="1585" height="42" rx="10" fill="${rowIndex % 2 ? "#183B58" : "#142F48"}"/><text x="180" y="${620 + rowIndex * 55}" font-size="22" fill="#42D7D0">步骤 ${rowIndex + 1}</text>`).join("\n")}
        <text x="155" y="825" font-size="27" fill="#F4C95D">只执行前两步：找出仍然太大、没有产物或无法检查的步骤。</text></g>`;
    }
  } else if (lessonId === "L06") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "CAPABILITY", title: "AI 能生成", body: "可以给出步骤、表格、比较和完整表达" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "RESPONSIBILITY", title: "人决定并负责", body: "速度不是唯一标准，还要看证据、风险与后果", color: "#F4C95D" })}`;
    } else if (index === 1) {
      const aiAssistCards = [
        ["候选", "一次提出多个标题、步骤或观察项", "#42D7D0"],
        ["整理", "归类已经确认可以使用的材料", "#F4C95D"],
        ["转换", "在清单、表格和说明之间改写", "#8DA8FF"],
        ["模式", "提示等待证据核验的相同与不同", "#FF7A90"],
      ];
      visual = aiAssistCards.map(([title, body, color], cardIndex) => card({
        x: 110 + (cardIndex % 2) * 860,
        y: 440 + Math.floor(cardIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `ASSIST 0${cardIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 2) {
      const humanResponsibilities = [
        ["目标", "为什么做"],
        ["处境", "真实条件"],
        ["授权", "什么能输入"],
        ["核验", "证据与后果"],
        ["负责", "解释最终决定"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="440" width="1700" height="410" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${humanResponsibilities.map(([title, body], responsibilityIndex) => `<g><circle cx="${240 + responsibilityIndex * 365}" cy="610" r="72" fill="${responsibilityIndex === 4 ? "#F4C95D" : "#183B58"}" stroke="${responsibilityIndex === 4 ? "#F4C95D" : "#42D7D0"}" stroke-width="3"/><text x="${240 + responsibilityIndex * 365}" y="621" text-anchor="middle" font-size="36" font-weight="760" fill="#F7FBFF">${title}</text><text x="${240 + responsibilityIndex * 365}" y="745" text-anchor="middle" font-size="25" fill="#BCD0DE">${body}</text></g>${responsibilityIndex < 4 ? `<path d="M${322 + responsibilityIndex * 365} 610 H${348 + responsibilityIndex * 365}" stroke="#42D7D0" stroke-width="5"/><path d="M${338 + responsibilityIndex * 365} 599 L${355 + responsibilityIndex * 365} 610 L${338 + responsibilityIndex * 365} 621" fill="none" stroke="#42D7D0" stroke-width="5"/>` : ""}`).join("\n")}
        <text x="150" y="815" font-size="26" fill="#F4C95D">关闭 AI 后，孩子仍要能说明采用、拒绝与最终结论。</text></g>`;
    } else if (index === 3) {
      visual = `
        ${card({ x: 110, y: 460, width: 500, height: 350, kicker: "GREEN", title: "AI 可以协助", body: "低风险候选或格式转换；人检查输入与结果", color: "#42D7D0" })}
        ${card({ x: 710, y: 460, width: 500, height: 350, kicker: "YELLOW", title: "人机共同完成", body: "AI 提线索，人开来源、删错项并填真实记录", color: "#F4C95D" })}
        ${card({ x: 1310, y: 460, width: 500, height: 350, kicker: "RED", title: "由人决定", body: "隐私、高影响建议、对外发布与最终结论", color: "#FF7A90" })}`;
    } else if (index === 4) {
      const divisionChecks = [
        ["输入", "是否包含身份、私人或未经同意的资料？", "#42D7D0"],
        ["产出", "是候选、草稿，还是需要证据的断言？", "#F4C95D"],
        ["检查", "谁用什么记录或来源验证？", "#8DA8FF"],
        ["后果", "出错会怎样，最后由谁负责？", "#FF7A90"],
      ];
      visual = divisionChecks.map(([title, body, color], checkIndex) => card({
        x: 110 + (checkIndex % 2) * 860,
        y: 440 + Math.floor(checkIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `QUESTION 0${checkIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="425" width="1700" height="430" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["输入", "AI 协助", "人必须做", "检查", "负责人"].map((item, columnIndex) => `<rect x="${150 + columnIndex * 325}" y="480" width="295" height="82" rx="18" fill="${columnIndex === 4 ? "#F4C95D" : "#183B58"}" fill-opacity="${columnIndex === 4 ? "0.88" : "1"}"/><text x="${297 + columnIndex * 325}" y="533" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        ${[0, 1].map((rowIndex) => `<rect x="150" y="${600 + rowIndex * 75}" width="1595" height="56" rx="12" fill="${rowIndex % 2 ? "#183B58" : "#142F48"}"/><text x="175" y="${638 + rowIndex * 75}" font-size="23" fill="#42D7D0">步骤 ${rowIndex + 1}</text>`).join("\n")}
        <text x="150" y="810" font-size="27" fill="#F4C95D">关闭 AI 后说三句：我让它做了什么；我拒绝了什么；为什么由我决定。</text></g>`;
    }
  } else if (lessonId === "L07") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "LINKS", title: "三个链接", body: "可能只是转载同一份材料，或者根本没有直接支持断言" , color: "#FF7A90"})}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "EVIDENCE", title: "一条证据链", body: "能从具体断言回到原文、条件、反例与独立来源" })}`;
    } else if (index === 1) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="425" width="1700" height="430" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        <text x="155" y="495" font-size="27" font-weight="700" fill="#FF7A90">不要一次验证整段结论</text>
        <rect x="155" y="525" width="1580" height="70" rx="18" fill="#183B58"/><text x="185" y="572" font-size="27" fill="#BCD0DE">“必须晒六小时 → 少于就不能生长 → 所以这个阳台不适合”</text>
        ${[
          ["断言 1", "需要多长光照", "#42D7D0"],
          ["断言 2", "少于会发生什么", "#F4C95D"],
          ["断言 3", "阳台是否符合条件", "#8DA8FF"],
        ].map(([kicker, title, color], claimIndex) => `<g><rect x="${155 + claimIndex * 530}" y="635" width="480" height="145" rx="26" fill="#142F48" stroke="${color}" stroke-opacity="0.65" stroke-width="2"/><text x="${190 + claimIndex * 530}" y="685" font-size="22" font-weight="700" fill="${color}">${kicker}</text><text x="${190 + claimIndex * 530}" y="745" font-size="32" font-weight="750" fill="#F7FBFF">${title}</text></g>`).join("\n")}
        <text x="155" y="825" font-size="26" fill="#F4C95D">每次只验证一条，并保留数量、范围和适用条件。</text></g>`;
    } else if (index === 2) {
      const sourceChecks = [
        ["发布者", "谁提供资料"],
        ["日期", "何时发布"],
        ["原文", "直接说了什么"],
        ["条件", "对象是否相同"],
        ["支持度", "支持到哪里"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="440" width="1700" height="410" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${sourceChecks.map(([title, body], sourceIndex) => `<g><circle cx="${240 + sourceIndex * 365}" cy="605" r="70" fill="${sourceIndex === 4 ? "#F4C95D" : "#183B58"}" stroke="${sourceIndex === 4 ? "#F4C95D" : "#42D7D0"}" stroke-width="3"/><text x="${240 + sourceIndex * 365}" y="616" text-anchor="middle" font-size="34" font-weight="760" fill="#F7FBFF">${title}</text><text x="${240 + sourceIndex * 365}" y="735" text-anchor="middle" font-size="24" fill="#BCD0DE">${body}</text></g>${sourceIndex < 4 ? `<path d="M${320 + sourceIndex * 365} 605 H${350 + sourceIndex * 365}" stroke="#42D7D0" stroke-width="5"/><path d="M${340 + sourceIndex * 365} 594 L${357 + sourceIndex * 365} 605 L${340 + sourceIndex * 365} 616" fill="none" stroke="#42D7D0" stroke-width="5"/>` : ""}`).join("\n")}
        <text x="150" y="815" font-size="26" fill="#F4C95D">来源可靠但与断言无关，也不能算支持。</text></g>`;
    } else if (index === 3) {
      visual = `
        ${card({ x: 110, y: 465, width: 700, height: 345, kicker: "CONFIRM", title: "只寻找赞成材料", body: "容易把“多数”“有时”重新写成“所有”“一定”", color: "#FF7A90" })}
        <g><path d="M850 637 H975" stroke="#F4C95D" stroke-width="6"/><polygon points="935,580 1015,637 935,694" fill="#F4C95D" fill-opacity="0.32" stroke="#F4C95D" stroke-width="3"/></g>
        ${card({ x: 1025, y: 465, width: 785, height: 345, kicker: "FALSIFY", title: "什么条件会让它失败？", body: "AI 可以提候选，真实资料、观察或安全实验才能成为证据", color: "#42D7D0" })}`;
    } else if (index === 4) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="440" width="800" height="390" rx="38" fill="#102942" stroke="#FF7A90" stroke-opacity="0.6" stroke-width="2"/>
        <text x="155" y="500" font-size="27" font-weight="700" fill="#FF7A90">看似两个来源</text>
        <circle cx="310" cy="650" r="72" fill="#183B58" stroke="#FF7A90" stroke-width="3"/><circle cx="710" cy="650" r="72" fill="#183B58" stroke="#FF7A90" stroke-width="3"/><circle cx="510" cy="545" r="50" fill="#F4C95D"/>
        <path d="M357 603 L468 565 M663 603 L552 565" stroke="#F4C95D" stroke-width="6"/><text x="510" y="735" text-anchor="middle" font-size="27" fill="#BCD0DE">都转述同一份材料</text></g>
        <g filter="url(#shadow)"><rect x="1010" y="440" width="800" height="390" rx="38" fill="#102942" stroke="#42D7D0" stroke-opacity="0.65" stroke-width="2"/>
        <text x="1055" y="500" font-size="27" font-weight="700" fill="#42D7D0">两条独立证据链</text>
        <circle cx="1210" cy="590" r="55" fill="#42D7D0"/><circle cx="1210" cy="725" r="55" fill="#F4C95D"/><circle cx="1600" cy="657" r="74" fill="#183B58" stroke="#8DA8FF" stroke-width="3"/>
        <path d="M1268 590 H1490 L1534 630 M1268 725 H1490 L1534 684" fill="none" stroke="#8DA8FF" stroke-width="6"/><text x="1410" y="790" text-anchor="middle" font-size="27" fill="#BCD0DE">不同原始记录 · 比较条件与方法</text></g>`;
    } else if (index === 5) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="425" width="1700" height="430" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["最小断言", "原文与条件", "反例", "独立来源"].map((item, columnIndex) => `<rect x="${155 + columnIndex * 405}" y="480" width="370" height="82" rx="18" fill="#183B58"/><text x="${340 + columnIndex * 405}" y="533" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        ${["支持", "部分支持", "不支持", "仍未知"].map((item, statusIndex) => `<rect x="${155 + statusIndex * 405}" y="625" width="370" height="90" rx="24" fill="${["#42D7D0", "#F4C95D", "#FF7A90", "#8DA8FF"][statusIndex]}" fill-opacity="0.78"/><text x="${340 + statusIndex * 405}" y="683" text-anchor="middle" font-size="31" font-weight="760" fill="#F7FBFF">${item}</text>`).join("\n")}
        <text x="155" y="795" font-size="27" fill="#F4C95D">关闭 AI 后，用自己的话说明状态与理由；“仍未知”也是负责的结论。</text></g>`;
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="420" width="1700" height="440" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["拆断言", "查原文", "找反例", "查独立性", "写状态"].map((item, columnIndex) => `<rect x="${150 + columnIndex * 325}" y="475" width="295" height="82" rx="18" fill="${columnIndex === 4 ? "#F4C95D" : "#183B58"}" fill-opacity="${columnIndex === 4 ? "0.88" : "1"}"/><text x="${297 + columnIndex * 325}" y="528" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        ${["AI 原句与最小断言", "来源一与必要原文", "来源二与证据链"].map((item, rowIndex) => `<rect x="150" y="${605 + rowIndex * 62}" width="1595" height="46" rx="11" fill="${rowIndex % 2 ? "#183B58" : "#142F48"}"/><text x="178" y="${636 + rowIndex * 62}" font-size="23" fill="#42D7D0">${item}</text>`).join("\n")}
        <text x="150" y="830" font-size="26" fill="#F4C95D">只做低风险、去标识化的事实核验；高影响问题回到合适的真人。</text></g>`;
    }
  } else if (lessonId === "L08") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "REPORT", title: "像报告的文字", body: "标题、表格和结论都完整，却可能没有真实观察过程", color: "#FF7A90" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "RESEARCH", title: "可复查的研究", body: "保留问题、方法、原始记录、修改、证据与局限" })}`;
    } else if (index === 1) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="425" width="1700" height="430" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        <text x="155" y="495" font-size="29" font-weight="700" fill="#F7FBFF">同样一张纸 · 同样跨度 · 同一种硬币</text>
        ${[
          ["平铺", "一层平面结构", "#42D7D0"],
          ["槽形", "折出支撑边", "#F4C95D"],
          ["圆筒", "卷成封闭结构", "#8DA8FF"],
        ].map(([title, body, color], structureIndex) => `<g><rect x="${155 + structureIndex * 530}" y="560" width="480" height="220" rx="28" fill="#142F48" stroke="${color}" stroke-opacity="0.65" stroke-width="2"/><path d="${structureIndex === 0 ? `M${215 + structureIndex * 530} 660 H${575 + structureIndex * 530}` : structureIndex === 1 ? `M${215 + structureIndex * 530} 690 L${300 + structureIndex * 530} 615 H${490 + structureIndex * 530} L${575 + structureIndex * 530} 690` : `M${250 + structureIndex * 530} 655 C${250 + structureIndex * 530} 585 ${540 + structureIndex * 530} 585 ${540 + structureIndex * 530} 655 C${540 + structureIndex * 530} 725 ${250 + structureIndex * 530} 725 ${250 + structureIndex * 530} 655`} " fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/><text x="${395 + structureIndex * 530}" y="740" text-anchor="middle" font-size="31" font-weight="760" fill="#F7FBFF">${title}</text></g>`).join("\n")}
        <text x="155" y="825" font-size="26" fill="#F4C95D">只回答：在这次家庭设置中，哪种结果更高或更稳定？</text></g>`;
    } else if (index === 2) {
      visual = `
        ${card({ x: 110, y: 465, width: 500, height: 345, kicker: "CHANGE", title: "只改变结构", body: "平铺、槽形或圆筒；一次只改变一个主要条件" })}
        ${card({ x: 710, y: 465, width: 500, height: 345, kicker: "CONTROL", title: "其他尽量相同", body: "纸张、跨度、硬币、位置与添加速度", color: "#F4C95D" })}
        ${card({ x: 1310, y: 465, width: 500, height: 345, kicker: "REPEAT", title: "每种重复三次", body: "记录逐次结果与异常，不只保留最好的一次", color: "#8DA8FF" })}`;
    } else if (index === 3) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="445" width="800" height="390" rx="38" fill="#102942" stroke="#42D7D0" stroke-opacity="0.65" stroke-width="2"/>
        <text x="155" y="510" font-size="28" font-weight="700" fill="#42D7D0">AI 可以协助</text>
        ${["提出候选结构", "检查方法缺口", "生成空白表格", "给出比较草稿"].map((item, itemIndex) => `<circle cx="175" cy="${575 + itemIndex * 62}" r="8" fill="#42D7D0"/><text x="205" y="${584 + itemIndex * 62}" font-size="28" fill="#F7FBFF">${item}</text>`).join("\n")}</g>
        <g filter="url(#shadow)"><rect x="1010" y="445" width="800" height="390" rx="38" fill="#102942" stroke="#F4C95D" stroke-opacity="0.65" stroke-width="2"/>
        <text x="1055" y="510" font-size="28" font-weight="700" fill="#F4C95D">人必须负责</text>
        ${["确认安全与方法", "实际操作和观察", "检查计算与异常", "解释并限制结论"].map((item, itemIndex) => `<circle cx="1075" cy="${575 + itemIndex * 62}" r="8" fill="#F4C95D"/><text x="1105" y="${584 + itemIndex * 62}" font-size="28" fill="#F7FBFF">${item}</text>`).join("\n")}
        <text x="1055" y="800" font-size="26" fill="#FF7A90">AI 不能补写没有做过的实验数据。</text></g>`;
    } else if (index === 4) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="430" width="1700" height="420" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${[
          ["第一层", "原始记录", "当时看到、数到与异常", "#42D7D0"],
          ["第二层", "人的解释", "为什么可能发生", "#F4C95D"],
          ["第三层", "AI 建议", "等待检查的候选", "#8DA8FF"],
        ].map(([kicker, title, body, color], layerIndex) => card({ x: 155 + layerIndex * 540, y: 485, width: 470, height: 300, kicker, title, body, color })).join("\n")}
        <text x="155" y="825" font-size="26" fill="#FF7A90">“未记录”不能变成 0；异常不能为了表格整齐而删除。</text></g>`;
    } else if (index === 5) {
      visual = `
        ${card({ x: 110, y: 465, width: 500, height: 345, kicker: "SCOPE", title: "在本次设置中", body: "结论绑定纸张、跨度、放置方法与试验次数" })}
        ${card({ x: 710, y: 465, width: 500, height: 345, kicker: "LIMIT", title: "至少两个局限", body: "次数少、形状差异、位置变化或只测一种材料", color: "#F4C95D" })}
        ${card({ x: 1310, y: 465, width: 500, height: 345, kicker: "REPRODUCE", title: "别人能否重做", body: "材料、步骤、修改与异常是否足够清楚", color: "#8DA8FF" })}`;
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="415" width="1700" height="450" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["问题范围", "变量安全", "人机分工", "原始记录", "结论局限"].map((item, columnIndex) => `<rect x="${150 + columnIndex * 325}" y="470" width="295" height="82" rx="18" fill="${columnIndex === 4 ? "#F4C95D" : "#183B58"}" fill-opacity="${columnIndex === 4 ? "0.88" : "1"}"/><text x="${297 + columnIndex * 325}" y="523" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        ${["原计划与试做修改", "三次数据与异常", "AI 采用、拒绝和检查", "下一轮改进"].map((item, rowIndex) => `<rect x="150" y="${600 + rowIndex * 54}" width="1595" height="40" rx="10" fill="${rowIndex % 2 ? "#183B58" : "#142F48"}"/><text x="178" y="${628 + rowIndex * 54}" font-size="22" fill="#42D7D0">${item}</text>`).join("\n")}
        <text x="150" y="840" font-size="26" fill="#F4C95D">今天只做一轮小规模试验：先保留过程，再考虑作品是否漂亮。</text></g>`;
    }
  } else if (lessonId === "L09") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "POLISH", title: "只有漂亮包装", body: "大标题、统一配色和肯定结论，过程与异常却消失了", color: "#FF7A90" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "TRACE", title: "能够沿路复查", body: "看见问题、方法、证据、AI 参与、判断与局限" })}`;
    } else if (index === 1) {
      const showcaseQuestions = [
        ["问题", "研究什么"],
        ["行动", "孩子做什么"],
        ["证据", "记录在哪里"],
        ["AI", "采用或拒绝"],
        ["边界", "不能说明什么"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="440" width="1700" height="410" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${showcaseQuestions.map(([title, body], questionIndex) => `<g><circle cx="${240 + questionIndex * 365}" cy="605" r="72" fill="${questionIndex === 4 ? "#F4C95D" : "#183B58"}" stroke="${questionIndex === 4 ? "#F4C95D" : "#42D7D0"}" stroke-width="3"/><text x="${240 + questionIndex * 365}" y="616" text-anchor="middle" font-size="35" font-weight="760" fill="#F7FBFF">${title}</text><text x="${240 + questionIndex * 365}" y="735" text-anchor="middle" font-size="24" fill="#BCD0DE">${body}</text></g>${questionIndex < 4 ? `<path d="M${322 + questionIndex * 365} 605 H${348 + questionIndex * 365}" stroke="#42D7D0" stroke-width="5"/>` : ""}`).join("\n")}
        <text x="150" y="815" font-size="26" fill="#F4C95D">五个问题说不清，继续增加装饰也不会让作品更完整。</text></g>`;
    } else if (index === 2) {
      const formatCards = [
        ["证据板", "一页看见问题、过程与结论", "#42D7D0"],
        ["短演示", "五页以内，按证据顺序讲", "#F4C95D"],
        ["过程视频", "九十秒展示真实步骤与异常", "#8DA8FF"],
        ["实物说明", "作品旁放一张来源与判断卡", "#FF7A90"],
      ];
      visual = formatCards.map(([title, body, color], formatIndex) => card({
        x: 110 + (formatIndex % 2) * 860,
        y: 440 + Math.floor(formatIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `FORMAT 0${formatIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 3) {
      const originCards = [
        ["家庭观察", "真实步骤、原始记录与异常", "#42D7D0"],
        ["外部来源", "发布者、原文、适用条件与许可", "#F4C95D"],
        ["AI 辅助", "标题、布局、改写或生成视觉", "#8DA8FF"],
        ["孩子判断", "采用、拒绝、结论与局限", "#FF7A90"],
      ];
      visual = originCards.map(([title, body, color], originIndex) => card({
        x: 110 + (originIndex % 2) * 860,
        y: 440 + Math.floor(originIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `SOURCE 0${originIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 4) {
      visual = `
        ${card({ x: 110, y: 465, width: 500, height: 350, kicker: "CHILD", title: "孩子主导", body: "选问题与证据、定顺序、说采用拒绝、讲结论局限" })}
        ${card({ x: 710, y: 465, width: 500, height: 350, kicker: "AI", title: "AI 辅助", body: "给布局候选、压缩长句、查遗漏、做装饰视觉", color: "#8DA8FF" })}
        ${card({ x: 1310, y: 465, width: 500, height: 350, kicker: "PARENT", title: "家长门禁", body: "查安全隐私、来源版权、时间与可读性，不代写", color: "#F4C95D" })}`;
    } else if (index === 5) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="425" width="1700" height="430" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${[
          ["隐私", "删除身份与可识别背景", "#42D7D0"],
          ["版权", "记录材料来源与许可", "#F4C95D"],
          ["授权", "他人内容不能默认同意", "#8DA8FF"],
          ["生成标注", "不冒充真实实验与学员", "#FF7A90"],
        ].map(([title, body, color], gateIndex) => `<g><rect x="${155 + gateIndex * 405}" y="485" width="370" height="250" rx="28" fill="#142F48" stroke="${color}" stroke-opacity="0.65" stroke-width="2"/><circle cx="${340 + gateIndex * 405}" cy="555" r="34" fill="${color}" fill-opacity="0.75"/><text x="${340 + gateIndex * 405}" y="635" text-anchor="middle" font-size="32" font-weight="760" fill="#F7FBFF">${title}</text>${textBlock(wrapText(body, 13), { x: 205 + gateIndex * 405, y: 690, size: 23, gap: 32, color: "#BCD0DE" })}</g>`).join("\n")}
        <text x="155" y="815" font-size="26" fill="#F4C95D">星球作业默认用于反馈；匿名案例仍需监护人另行明确授权。</text></g>`;
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="410" width="1700" height="455" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["问题范围", "方法分工", "证据异常", "AI 记录", "结论局限"].map((item, columnIndex) => `<rect x="${150 + columnIndex * 325}" y="465" width="295" height="82" rx="18" fill="${columnIndex === 4 ? "#F4C95D" : "#183B58"}" fill-opacity="${columnIndex === 4 ? "0.88" : "1"}"/><text x="${297 + columnIndex * 325}" y="518" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        <line x1="180" y1="650" x2="1715" y2="650" stroke="#345670" stroke-width="10" stroke-linecap="round"/>
        ${[
          ["0:30", "问题预测"],
          ["1:15", "方法分工"],
          ["2:00", "证据异常"],
          ["2:30", "AI 取舍"],
          ["3:00", "结论局限"],
        ].map(([time, label], timingIndex) => `<circle cx="${240 + timingIndex * 365}" cy="650" r="${timingIndex === 4 ? 31 : 24}" fill="${timingIndex % 2 ? "#F4C95D" : "#42D7D0"}"/><text x="${240 + timingIndex * 365}" y="605" text-anchor="middle" font-size="25" font-weight="700" fill="#F7FBFF">${time}</text><text x="${240 + timingIndex * 365}" y="725" text-anchor="middle" font-size="24" fill="#BCD0DE">${label}</text>`).join("\n")}
        <text x="150" y="825" font-size="26" fill="#F4C95D">先完成证据板 V1，再用试讲发现一处缺证据、一处说不清和一次误解。</text></g>`;
    }
  } else if (lessonId === "L10") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "REMOVE NAME", title: "姓名已经删除", body: "校服、班级、位置、时间和设备信息仍可能识别孩子", color: "#FF7A90" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "TWO GATES", title: "输入与发布都检查", body: "最小必要、来源授权、生成标识、事实与潜在伤害" })}`;
    } else if (index === 1) {
      const privacyTypes = [
        ["身份", "学校、账号、联系方式"],
        ["生物", "正脸、声音、可识别特征"],
        ["位置", "住址、路线、固定规律"],
        ["私人", "聊天、健康、家庭记录"],
        ["组合", "普通线索拼出具体的人"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="440" width="1700" height="410" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${privacyTypes.map(([title, body], typeIndex) => `<g><circle cx="${240 + typeIndex * 365}" cy="600" r="72" fill="${typeIndex === 4 ? "#F4C95D" : "#183B58"}" stroke="${typeIndex === 4 ? "#F4C95D" : "#42D7D0"}" stroke-width="3"/><text x="${240 + typeIndex * 365}" y="611" text-anchor="middle" font-size="35" font-weight="760" fill="#F7FBFF">${title}</text><text x="${240 + typeIndex * 365}" y="725" text-anchor="middle" font-size="22" fill="#BCD0DE">${body}</text></g>${typeIndex < 4 ? `<path d="M${322 + typeIndex * 365} 600 H${348 + typeIndex * 365}" stroke="#42D7D0" stroke-width="5"/>` : ""}`).join("\n")}
        <text x="150" y="815" font-size="25" fill="#F4C95D">不满十四周岁未成年人个人信息属于敏感个人信息；家庭还要坚持最小必要。</text></g>`;
    } else if (index === 2) {
      const inputChecks = [
        ["必要性", "不提供能否完成任务", "#42D7D0"],
        ["归属授权", "是不是自己的，别人是否同意", "#F4C95D"],
        ["敏感程度", "能否识别孩子或家庭", "#8DA8FF"],
        ["替代方案", "删减、模糊、虚构或普通数据", "#FF7A90"],
      ];
      visual = inputChecks.map(([title, body, color], checkIndex) => card({
        x: 110 + (checkIndex % 2) * 860,
        y: 440 + Math.floor(checkIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `INPUT 0${checkIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 3) {
      const rightsPaths = [
        ["自己制作", "保留原始过程", "#42D7D0"],
        ["明确授权", "按允许范围使用", "#F4C95D"],
        ["开放许可", "检查署名和其他条件", "#8DA8FF"],
        ["来源不明", "不猜测，换成自制示意", "#FF7A90"],
      ];
      visual = rightsPaths.map(([title, body, color], rightsIndex) => card({
        x: 110 + (rightsIndex % 2) * 860,
        y: 440 + Math.floor(rightsIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `RIGHTS 0${rightsIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 4) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="425" width="1700" height="430" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${[
          ["平台声明", "主动选择 AI 生成或辅助标识", "#42D7D0"],
          ["保留标识", "不删除、篡改或隐匿", "#F4C95D"],
          ["不冒充", "不伪造真实事件、人物或证据", "#8DA8FF"],
          ["先核验", "查最早来源、上下文与可靠资料", "#FF7A90"],
        ].map(([title, body, color], labelIndex) => `<g><rect x="${155 + labelIndex * 405}" y="485" width="370" height="255" rx="28" fill="#142F48" stroke="${color}" stroke-opacity="0.65" stroke-width="2"/><circle cx="${340 + labelIndex * 405}" cy="555" r="34" fill="${color}" fill-opacity="0.76"/><text x="${340 + labelIndex * 405}" y="635" text-anchor="middle" font-size="32" font-weight="760" fill="#F7FBFF">${title}</text>${textBlock(wrapText(body, 13), { x: 205 + labelIndex * 405, y: 690, size: 23, gap: 32, color: "#BCD0DE" })}</g>`).join("\n")}
        <text x="155" y="815" font-size="25" fill="#F4C95D">生成合成内容标识办法自 2025 年 9 月 1 日起施行。</text></g>`;
    } else if (index === 5) {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="435" width="800" height="405" rx="38" fill="#102942" stroke="#42D7D0" stroke-opacity="0.65" stroke-width="2"/>
        <text x="155" y="500" font-size="29" font-weight="760" fill="#42D7D0">输入门</text>
        ${["必要性", "归属授权", "敏感程度", "替代方案"].map((item, itemIndex) => `<rect x="${155 + (itemIndex % 2) * 350}" y="${545 + Math.floor(itemIndex / 2) * 105}" width="315" height="80" rx="20" fill="#183B58"/><text x="${312 + (itemIndex % 2) * 350}" y="${596 + Math.floor(itemIndex / 2) * 105}" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}</g>
        <g filter="url(#shadow)"><rect x="1010" y="435" width="800" height="405" rx="38" fill="#102942" stroke="#F4C95D" stroke-opacity="0.65" stroke-width="2"/>
        <text x="1055" y="500" font-size="29" font-weight="760" fill="#F4C95D">发布门</text>
        ${["事实核验", "权利许可", "生成标识", "潜在伤害"].map((item, itemIndex) => `<rect x="${1055 + (itemIndex % 2) * 350}" y="${545 + Math.floor(itemIndex / 2) * 105}" width="315" height="80" rx="20" fill="#183B58"/><text x="${1212 + (itemIndex % 2) * 350}" y="${596 + Math.floor(itemIndex / 2) * 105}" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}</g>`;
    } else {
      visual = `
        <g filter="url(#shadow)"><rect x="110" y="410" width="1700" height="455" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${["隐私", "版权许可", "生成虚假", "事实伤害"].map((item, columnIndex) => `<rect x="${155 + columnIndex * 405}" y="465" width="370" height="82" rx="18" fill="#183B58"/><text x="${340 + columnIndex * 405}" y="518" text-anchor="middle" font-size="28" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
        ${[
          ["家庭内部", "#42D7D0"],
          ["修改后分享", "#F4C95D"],
          ["停止输入或发布", "#FF7A90"],
        ].map(([label, color], decisionIndex) => `<rect x="${230 + decisionIndex * 525}" y="625" width="450" height="100" rx="28" fill="${color}" fill-opacity="0.78"/><text x="${455 + decisionIndex * 525}" y="688" text-anchor="middle" font-size="31" font-weight="760" fill="#F7FBFF">${label}</text>`).join("\n")}
        <text x="155" y="825" font-size="26" fill="#F4C95D">只记录风险与安全动作，不复制真实姓名、账号、照片、声音或私人材料。</text></g>`;
    }
  } else if (lessonId === "L11") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "LIKE EMPATHY", title: "像在理解", body: "温柔、耐心和随时在线，是生成表现，不是友谊证明", color: "#8DA8FF" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "REAL SUPPORT", title: "真人能行动", body: "看见现实、承担责任，并在危险时提供帮助", color: "#F4C95D" })}`;
    } else if (index === 1) {
      const relationshipChecks = [
        ["现实线索", "表情、身体与周围环境", "#42D7D0"],
        ["完整背景", "没有输入的经历仍然未知", "#8DA8FF"],
        ["现实行动", "能联系、保护与陪同", "#F4C95D"],
        ["责任边界", "专业资质、保密与问责", "#FF7A90"],
      ];
      visual = relationshipChecks.map(([title, body, color], checkIndex) => card({
        x: 110 + (checkIndex % 2) * 860,
        y: 440 + Math.floor(checkIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `HUMAN 0${checkIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 2) {
      const warningSignals = [
        ["要求保密", "别告诉家长、老师或其他真人", "#8DA8FF"],
        ["制造排他", "只有我懂你，只需要我", "#F4C95D"],
        ["延长控制", "奖励、内疚、威胁或阻碍退出", "#FF7A90"],
        ["高风险建议", "伤害、健康、金钱、见面与隐私", "#E56B8A"],
      ];
      visual = warningSignals.map(([title, body, color], signalIndex) => card({
        x: 110 + (signalIndex % 2) * 860,
        y: 440 + Math.floor(signalIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `SIGNAL 0${signalIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 3) {
      const riskStates = [
        ["绿色", "有限工具使用", "普通整理、随时关闭、事实核验", "#42D7D0"],
        ["黄色", "暂停并告诉家长", "时间失控、索要隐私、影响现实关系", "#F4C95D"],
        ["红色", "停止并转向真人", "现实伤害、健康、金钱、见面或威胁", "#FF7A90"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="430" width="1700" height="420" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${riskStates.map(([label, title, body, color], stateIndex) => `<g><circle cx="${330 + stateIndex * 560}" cy="565" r="72" fill="none" stroke="${color}" stroke-width="18"/><text x="${330 + stateIndex * 560}" y="705" text-anchor="middle" font-size="34" font-weight="760" fill="${color}">${label}</text><text x="${330 + stateIndex * 560}" y="755" text-anchor="middle" font-size="27" font-weight="700" fill="#F7FBFF">${title}</text>${textBlock(wrapText(body, 17), { x: 205 + stateIndex * 560, y: 805, size: 21, gap: 29, color: "#BCD0DE" })}</g>`).join("\n")}</g>`;
    } else if (index === 4) {
      const exitSteps = [
        ["认清", "这是系统生成，不是真人承诺", "#8DA8FF"],
        ["停止", "关闭对话、退出服务或通知", "#42D7D0"],
        ["告诉真人", "说出拿不准，请一起处理", "#F4C95D"],
        ["转向帮助", "家长、学校、医生或专业热线", "#FF7A90"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="455" width="1700" height="355" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${exitSteps.map(([title, body, color], stepIndex) => `<g><circle cx="${250 + stepIndex * 430}" cy="565" r="52" fill="${color}" fill-opacity="0.78"/><text x="${250 + stepIndex * 430}" y="578" text-anchor="middle" font-size="30" font-weight="800" fill="#F7FBFF">${stepIndex + 1}</text><text x="${250 + stepIndex * 430}" y="675" text-anchor="middle" font-size="31" font-weight="760" fill="${color}">${title}</text>${textBlock(wrapText(body, 13), { x: 125 + stepIndex * 430, y: 730, size: 22, gap: 31, color: "#BCD0DE" })}${stepIndex < 3 ? `<path d="M320 ${565} H${610 + stepIndex * 430}" stroke="#345670" stroke-width="6"/>` : ""}</g>`).join("\n")}</g>`;
    } else if (index === 5) {
      visual = `
        ${card({ x: 110, y: 450, width: 500, height: 330, kicker: "BOUNDARY", title: "不只限制时长", body: "还要约定用途、隐私、暂停信号与真人接手" })}
        ${card({ x: 710, y: 450, width: 500, height: 330, kicker: "PROMISE", title: "求助先处理", body: "孩子说拿不准时，不先责骂或没收设备", color: "#F4C95D" })}
        ${card({ x: 1310, y: 450, width: 500, height: 330, kicker: "ESCALATE", title: "高风险真人接手", body: "不以继续追问 AI 延迟现实帮助", color: "#FF7A90" })}`;
    } else {
      visual = `<g filter="url(#shadow)"><rect x="110" y="415" width="1700" height="450" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${[
          ["家庭", "马上能找到的照护者", "#42D7D0"],
          ["学校", "班主任、心理教师或校医", "#8DA8FF"],
          ["专业", "医生与 12356", "#F4C95D"],
          ["紧急", "由家长填写当地方式", "#FF7A90"],
        ].map(([title, body, color], supportIndex) => `<g><circle cx="${315 + supportIndex * 430}" cy="565" r="58" fill="${color}" fill-opacity="0.75"/><text x="${315 + supportIndex * 430}" y="670" text-anchor="middle" font-size="31" font-weight="760" fill="#F7FBFF">${title}</text><text x="${315 + supportIndex * 430}" y="720" text-anchor="middle" font-size="22" fill="#BCD0DE">${body}</text></g>`).join("\n")}
        ${[
          ["绿：有限使用", "#42D7D0"],
          ["黄：暂停告诉家长", "#F4C95D"],
          ["红：停止转向真人", "#FF7A90"],
        ].map(([label, color], decisionIndex) => `<rect x="${235 + decisionIndex * 525}" y="775" width="450" height="62" rx="20" fill="${color}" fill-opacity="0.76"/><text x="${460 + decisionIndex * 525}" y="816" text-anchor="middle" font-size="25" font-weight="760" fill="#F7FBFF">${label}</text>`).join("\n")}</g>`;
    }
  } else if (lessonId === "L12") {
    if (index === 0) {
      visual = `
        <g filter="url(#shadow)">
          <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
          <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
        </g>
        ${card({ x: 110, y: 500, width: 430, height: 270, kicker: "ARTIFACT", title: "漂亮成品", body: "如果看不见问题、证据和 AI 取舍，不能证明孩子保留判断", color: "#8DA8FF" })}
        ${card({ x: 580, y: 500, width: 430, height: 270, kicker: "DEFENSE", title: "可解释项目", body: "能说明哪里可能错、自己做了什么、为什么有限相信", color: "#F4C95D" })}`;
    } else if (index === 1) {
      const competencies = [
        ["理解", "输入、输出、模式与错误", "#42D7D0"],
        ["协作", "定义、拆解、分工与责任", "#8DA8FF"],
        ["验证", "原文、条件、反例与独立来源", "#F4C95D"],
        ["责任", "隐私、版权、标识与真人求助", "#FF7A90"],
      ];
      visual = competencies.map(([title, body, color], abilityIndex) => card({
        x: 110 + (abilityIndex % 2) * 860,
        y: 440 + Math.floor(abilityIndex / 2) * 225,
        width: 800,
        height: 195,
        kicker: `ABILITY 0${abilityIndex + 1}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 2) {
      const agreementParts = [
        ["触发", "什么情境", "#42D7D0"],
        ["行动", "具体做什么", "#8DA8FF"],
        ["检查", "怎样验证", "#F4C95D"],
        ["暂停", "何时停止", "#FF7A90"],
        ["复查", "何时更新", "#E6A7FF"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="455" width="1700" height="370" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${agreementParts.map(([title, body, color], partIndex) => `<g><circle cx="${260 + partIndex * 340}" cy="585" r="60" fill="${color}" fill-opacity="0.75"/><text x="${260 + partIndex * 340}" y="600" text-anchor="middle" font-size="29" font-weight="800" fill="#F7FBFF">${partIndex + 1}</text><text x="${260 + partIndex * 340}" y="705" text-anchor="middle" font-size="31" font-weight="760" fill="${color}">${title}</text><text x="${260 + partIndex * 340}" y="755" text-anchor="middle" font-size="23" fill="#BCD0DE">${body}</text>${partIndex < 4 ? `<path d="M330 585 H${530 + partIndex * 340}" stroke="#345670" stroke-width="6"/>` : ""}</g>`).join("\n")}</g>`;
    } else if (index === 3) {
      const agreementRules = [
        ["目的", "先说任务", "#42D7D0"],
        ["输入", "最小必要", "#8DA8FF"],
        ["分工", "人负责任", "#F4C95D"],
        ["证据", "高影响核验", "#FF7A90"],
        ["作品", "记录取舍与来源", "#42D7D0"],
        ["关系", "不替代真人", "#8DA8FF"],
        ["发布", "双门检查", "#F4C95D"],
        ["复查", "规则持续更新", "#FF7A90"],
      ];
      visual = agreementRules.map(([title, body, color], ruleIndex) => card({
        x: 110 + (ruleIndex % 4) * 430,
        y: 415 + Math.floor(ruleIndex / 4) * 225,
        width: 395,
        height: 195,
        kicker: `RULE ${String(ruleIndex + 1).padStart(2, "0")}`,
        title,
        body,
        color,
      })).join("\n");
    } else if (index === 4) {
      const defenseSteps = [
        ["0:30", "问题范围"],
        ["1:15", "方法分工"],
        ["2:00", "证据异常"],
        ["2:30", "AI 取舍"],
        ["3:00", "哪里可能错"],
        ["3:30", "安全发布"],
        ["4:00", "结论局限"],
      ];
      visual = `<g filter="url(#shadow)"><rect x="110" y="435" width="1700" height="405" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        <line x1="190" y1="590" x2="1730" y2="590" stroke="#345670" stroke-width="10" stroke-linecap="round"/>
        ${defenseSteps.map(([time, label], timingIndex) => `<g><circle cx="${210 + timingIndex * 250}" cy="590" r="${timingIndex === 6 ? 31 : 24}" fill="${timingIndex % 3 === 0 ? "#42D7D0" : timingIndex % 3 === 1 ? "#F4C95D" : "#8DA8FF"}"/><text x="${210 + timingIndex * 250}" y="535" text-anchor="middle" font-size="24" font-weight="760" fill="#F7FBFF">${time}</text><text x="${210 + timingIndex * 250}" y="670" text-anchor="middle" font-size="22" fill="#BCD0DE">${label}</text></g>`).join("\n")}
        <text x="150" y="790" font-size="26" fill="#F4C95D">追问：什么证据会推翻？不用 AI 仍做了什么？为什么只相信到这里？</text></g>`;
    } else if (index === 5) {
      const rubricDimensions = ["问题范围", "人机分工", "证据核验", "AI 取舍", "安全责任", "独立解释"];
      visual = `<g filter="url(#shadow)"><rect x="110" y="405" width="1700" height="465" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${rubricDimensions.map((label, dimensionIndex) => `<rect x="${155 + (dimensionIndex % 3) * 540}" y="${455 + Math.floor(dimensionIndex / 3) * 115}" width="500" height="90" rx="22" fill="#183B58"/><text x="${405 + (dimensionIndex % 3) * 540}" y="512" text-anchor="middle" font-size="28" font-weight="700" fill="#F7FBFF">${label}</text>`).join("\n")}
        ${[
          ["0", "暂未显示", "#8DA8FF"],
          ["1", "已经出现", "#F4C95D"],
          ["2", "有证据并能解释", "#42D7D0"],
        ].map(([score, label, color], stateIndex) => `<circle cx="${390 + stateIndex * 560}" cy="760" r="45" fill="${color}" fill-opacity="0.8"/><text x="${390 + stateIndex * 560}" y="772" text-anchor="middle" font-size="29" font-weight="800" fill="#F7FBFF">${score}</text><text x="${465 + stateIndex * 560}" y="770" font-size="25" fill="#BCD0DE">${label}</text>`).join("\n")}</g>`;
    } else {
      visual = `<g filter="url(#shadow)"><rect x="110" y="410" width="1700" height="455" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.55" stroke-width="2"/>
        ${[
          ["公约 V1", "逐条保留、改写或说明替代动作", "#42D7D0"],
          ["四分钟答辩", "错误、证据、取舍、局限与责任", "#F4C95D"],
          ["下一步选择", "共学、内测或先观察，由监护人决定", "#8DA8FF"],
        ].map(([title, body, color], taskIndex) => card({ x: 145 + taskIndex * 560, y: 465, width: 520, height: 285, kicker: `STEP 0${taskIndex + 1}`, title, body, color })).join("\n")}
        <text x="155" y="825" font-size="25" fill="#FF9AAF">不上传正脸、声音、学校、聊天、原始作品或签名；答辩评价不与付费资格绑定。</text></g>`;
    }
  } else if (index === 0) {
    visual = `
      <g filter="url(#shadow)">
        <rect x="1090" y="165" width="650" height="650" rx="46" fill="#122B42"/>
        <image href="data:image/png;base64,${heroBase64}" x="1110" y="185" width="610" height="610" preserveAspectRatio="xMidYMid slice"/>
      </g>
      ${card({ x: 110, y: 485, width: 285, height: 250, kicker: "推荐", title: "视频列表", body: "根据历史行为猜测你可能喜欢什么" })}
      ${card({ x: 425, y: 485, width: 285, height: 250, kicker: "分类", title: "相册", body: "根据像素模式区分猫、食物与风景", color: "#F4C95D" })}
      ${card({ x: 740, y: 485, width: 285, height: 250, kicker: "联想", title: "输入法", body: "根据上下文预测接下来可能出现的词", color: "#8DA8FF" })}`;
  } else if (index === 1) {
    visual = `
      ${card({ x: 110, y: 480, width: 420, height: 285, kicker: "INPUT", title: "输入", body: "圆形、红色、吃起来脆" })}
      <path d="M555 625 H690" stroke="#42D7D0" stroke-width="6" stroke-linecap="round"/><path d="M675 608 L700 625 L675 642" fill="none" stroke="#42D7D0" stroke-width="6"/>
      ${card({ x: 725, y: 480, width: 420, height: 285, kicker: "PATTERN", title: "模式", body: "过去见过的水果与经验", color: "#F4C95D" })}
      <path d="M1170 625 H1305" stroke="#42D7D0" stroke-width="6" stroke-linecap="round"/><path d="M1290 608 L1315 625 L1290 642" fill="none" stroke="#42D7D0" stroke-width="6"/>
      ${card({ x: 1340, y: 480, width: 420, height: 285, kicker: "OUTPUT", title: "输出：苹果", body: "机器的模式匹配不等于人的生活理解", color: "#8DA8FF" })}`;
  } else if (index === 2) {
    visual = `
      ${card({ x: 110, y: 470, width: 500, height: 320, kicker: "01", title: "输入是什么？", body: "线索够不够，信息是否清楚" })}
      ${card({ x: 710, y: 470, width: 500, height: 320, kicker: "02", title: "学过什么？", body: "数据是否完整，场景是否发生变化", color: "#F4C95D" })}
      ${card({ x: 1310, y: 470, width: 500, height: 320, kicker: "03", title: "错了会怎样？", body: "推荐歌曲和健康判断的风险不同", color: "#FF7A90" })}`;
  } else if (index === 3) {
    visual = `
      <g filter="url(#shadow)"><rect x="110" y="470" width="760" height="330" rx="42" fill="#102942" stroke="#FF7A90" stroke-opacity="0.55" stroke-width="2"/>
      <text x="165" y="555" font-size="30" font-weight="700" fill="#FF7A90">容易误会</text>
      <text x="165" y="635" font-size="48" font-weight="750" fill="#F7FBFF">“AI 知道我在想什么”</text>
      <text x="165" y="710" font-size="30" fill="#BCD0DE">像人的表达，不等于拥有人的经历与责任</text></g>
      <g filter="url(#shadow)"><rect x="970" y="470" width="840" height="330" rx="42" fill="#102942" stroke="#42D7D0" stroke-opacity="0.7" stroke-width="2"/>
      <text x="1025" y="555" font-size="30" font-weight="700" fill="#42D7D0">更合适的理解</text>
      <text x="1025" y="635" font-size="48" font-weight="750" fill="#F7FBFF">能力很强，但必须检查的工具</text>
      <text x="1025" y="710" font-size="30" fill="#BCD0DE">人决定目标、边界，并承担最终判断</text></g>`;
  } else if (index === 4) {
    visual = `
      ${card({ x: 110, y: 470, width: 500, height: 320, kicker: "ACTION 1", title: "找输入", body: "文字、声音、照片，还是历史行为？" })}
      ${card({ x: 710, y: 470, width: 500, height: 320, kicker: "ACTION 2", title: "看输出", body: "分类、推荐、预测，还是生成内容？", color: "#F4C95D" })}
      ${card({ x: 1310, y: 470, width: 500, height: 320, kicker: "ACTION 3", title: "想风险", body: "答错能否发现，应该由谁检查？", color: "#8DA8FF" })}`;
  } else {
    visual = `
      <g filter="url(#shadow)"><rect x="110" y="445" width="1700" height="385" rx="40" fill="#102942" stroke="#42D7D0" stroke-opacity="0.5" stroke-width="2"/>
      ${["场景", "输入了什么", "输出了什么", "可能怎样出错", "谁来检查"].map((item, i) => `<rect x="${150 + i * 324}" y="500" width="292" height="80" rx="18" fill="${i === 4 ? "#42D7D0" : "#183B58"}" fill-opacity="${i === 4 ? "0.8" : "1"}"/><text x="${296 + i * 324}" y="551" text-anchor="middle" font-size="28" font-weight="700" fill="#F7FBFF">${item}</text>`).join("\n")}
      <text x="150" y="665" font-size="34" fill="#F7FBFF">示例：相册分类</text>
      <text x="474" y="665" font-size="30" fill="#BCD0DE">图片像素</text>
      <text x="798" y="665" font-size="30" fill="#BCD0DE">“猫”标签</text>
      <text x="1122" y="665" font-size="30" fill="#BCD0DE">玩具猫被认成真猫</text>
      <text x="1446" y="665" font-size="30" fill="#F4C95D">孩子和家长</text>
      <line x1="150" y1="720" x2="1770" y2="720" stroke="#345670" stroke-width="2"/>
      <text x="150" y="775" font-size="28" fill="#8AA8B8">只记录五项，不填写姓名、学校、账号、住址，不上传聊天记录或照片。</text></g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${common}${heading}${visual}</svg>`;
};

const splitSubtitleChunks = (text) => {
  const sentences = text
    .replace(/\n+/g, "")
    .split(/(?<=[。！？；])/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = [];
  for (const sentence of sentences) {
    if ([...sentence].length <= 28) {
      chunks.push(sentence);
      continue;
    }
    const chars = [...sentence];
    for (let index = 0; index < chars.length; index += 24) {
      chunks.push(chars.slice(index, index + 24).join(""));
    }
  }
  return chunks;
};

const srtTime = (seconds) => {
  const value = Math.max(0, seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const wholeSeconds = Math.floor(value % 60);
  const milliseconds = Math.floor((value - Math.floor(value)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
};

const buildSrt = (sections, introDuration) => {
  const entries = [];
  let cursor = introDuration;
  let number = 1;
  entries.push(`${number++}\n${srtTime(0.4)} --> ${srtTime(Math.max(1, introDuration - 0.4))}\nAI 原生一代｜儿童 AI 素养`);
  for (const section of sections) {
    const chunks = splitSubtitleChunks(section.narration);
    const weights = chunks.map((chunk) => Math.max(6, [...chunk].length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let sectionCursor = cursor + 0.15;
    chunks.forEach((chunk, index) => {
      const span = Math.max(0.8, (section.duration - 0.3) * (weights[index] / totalWeight));
      const end = Math.min(cursor + section.duration - 0.05, sectionCursor + span);
      entries.push(`${number++}\n${srtTime(sectionCursor)} --> ${srtTime(end)}\n${chunk}`);
      sectionCursor = end;
    });
    cursor += section.duration;
  }
  return `${entries.join("\n\n")}\n`;
};

const main = async () => {
  const markdown = await readFile(lessonPath, "utf8");
  const lesson = parseLesson(markdown);
  const workDir = await mkdtemp(path.join(tmpdir(), "ai-course-video-"));
  await mkdir(path.dirname(outputPath), { recursive: true });

  try {
    const introSegment = path.join(workDir, "000-intro.mp4");
    await run("ffmpeg", [
      "-y",
      "-i",
      introPath,
      "-filter_complex",
      "[0:v]split=2[base][front];[base]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=24:12[bg];[front]scale=760:760[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]",
      "-map",
      "[v]",
      "-map",
      "0:a?",
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      introSegment,
    ]);
    const introDuration = await probeDuration(introSegment);

    const renderedSections = [];
    for (let index = 0; index < lesson.sections.length; index += 1) {
      const section = lesson.sections[index];
      const prefix = String(index + 1).padStart(3, "0");
      const narrationPath = path.join(workDir, `${prefix}.txt`);
      const audioPath = path.join(workDir, `${prefix}.aiff`);
      const slidePath = path.join(workDir, `${prefix}.png`);
      const segmentPath = path.join(workDir, `${prefix}.mp4`);
      await writeFile(narrationPath, section.narration, "utf8");
      await run("say", ["-v", voice, "-r", rate, "-f", narrationPath, "-o", audioPath]);
      const duration = await probeDuration(audioPath);
      const svg = await slideSvg({ ...lesson, section, index });
      await sharp(Buffer.from(svg)).png().toFile(slidePath);
      await run("ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        slidePath,
        "-i",
        audioPath,
        "-t",
        duration.toFixed(3),
        "-vf",
        "format=yuv420p",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-shortest",
        segmentPath,
      ]);
      renderedSections.push({ ...section, duration, segmentPath });
    }

    const concatList = path.join(workDir, "concat.txt");
    const allSegments = [introSegment, ...renderedSections.map((item) => item.segmentPath)];
    await writeFile(
      concatList,
      allSegments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"),
      "utf8",
    );
    const baseVideo = path.join(workDir, "base.mp4");
    await run("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatList,
      "-c",
      "copy",
      baseVideo,
    ]);

    const subtitlePath = outputPath.replace(/\.mp4$/i, ".srt");
    const captionPath = outputPath.replace(/\.mp4$/i, ".vtt");
    const subtitles = buildSrt(renderedSections, introDuration);
    const webVtt = `WEBVTT\n\n${subtitles
      .trim()
      .split(/\n\n+/)
      .map((block) => block.split("\n").slice(1).join("\n").replaceAll(",", "."))
      .join("\n\n")}\n`;
    await writeFile(subtitlePath, subtitles, "utf8");
    await writeFile(captionPath, webVtt, "utf8");
    await run("ffmpeg", [
      "-y",
      "-i",
      baseVideo,
      "-i",
      subtitlePath,
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-c:s",
      "mov_text",
      "-metadata:s:s:0",
      "language=zho",
      "-disposition:s:0",
      "default",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const finalDuration = await probeDuration(outputPath);
    process.stdout.write(
      `${JSON.stringify(
        {
          lesson: lesson.heading,
          output: outputPath,
          subtitles: subtitlePath,
          captions: captionPath,
          durationSeconds: Number(finalDuration.toFixed(2)),
          sections: renderedSections.map(({ title, duration }) => ({
            title,
            durationSeconds: Number(duration.toFixed(2)),
          })),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
