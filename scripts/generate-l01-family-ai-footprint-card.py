#!/usr/bin/env python3
"""Generate the printable L01 family AI footprint card."""

from pathlib import Path
import sys

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


PROJECT_DIR = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_DIR / "output/pdf/ai-native-generation-l01-family-ai-footprint-card.pdf"

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
FONT_MEDIUM = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

NAVY = HexColor("#14213D")
PURPLE = HexColor("#6657D9")
BLUE = HexColor("#3778C2")
INK = HexColor("#1F2937")
MUTED = HexColor("#5F6B7A")
LINE = HexColor("#CBD3DF")
PALE = HexColor("#F5F7FB")
PALE_PURPLE = HexColor("#F1EFFF")
PALE_BLUE = HexColor("#ECF5FF")
WHITE = HexColor("#FFFFFF")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("CJK", FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("CJK-Medium", FONT_MEDIUM))


def paragraph(c: canvas.Canvas, text: str, x: float, y_top: float, width: float,
              font_size: float, leading: float, color=INK,
              font_name: str = "CJK", align=TA_LEFT) -> float:
    style = ParagraphStyle(
        name="card",
        fontName=font_name,
        fontSize=font_size,
        leading=leading,
        textColor=color,
        alignment=align,
        wordWrap="CJK",
        spaceAfter=0,
        spaceBefore=0,
    )
    flowable = Paragraph(text, style)
    _, height = flowable.wrap(width, 200)
    flowable.drawOn(c, x, y_top - height)
    return height


def rounded_box(c: canvas.Canvas, x: float, y: float, width: float, height: float,
                fill, stroke=LINE, radius: float = 8, line_width: float = 0.8) -> None:
    c.setLineWidth(line_width)
    c.setStrokeColor(stroke)
    c.setFillColor(fill)
    c.roundRect(x, y, width, height, radius, stroke=1, fill=1)


def draw_step(c: canvas.Canvas, number: str, title: str, note: str,
              x: float, y: float, width: float) -> None:
    rounded_box(c, x, y, width, 44, PALE, stroke=Color(0, 0, 0, alpha=0))
    c.setFillColor(PURPLE)
    c.circle(x + 18, y + 22, 12, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("CJK-Medium", 10)
    c.drawCentredString(x + 18, y + 18.5, number)
    c.setFillColor(INK)
    c.setFont("CJK-Medium", 9.5)
    c.drawString(x + 36, y + 27, title)
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.5)
    c.drawString(x + 36, y + 12.5, note)


def draw_field(c: canvas.Canvas, label: str, x: float, y: float,
               width: float, height: float, accent) -> None:
    c.setStrokeColor(LINE)
    c.setLineWidth(0.55)
    c.rect(x, y, width, height, stroke=1, fill=0)
    c.setFillColor(accent)
    c.roundRect(x + 8, y + height - 18, 53, 13, 4, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("CJK-Medium", 7.2)
    c.drawCentredString(x + 34.5, y + height - 14.2, label)
    c.setStrokeColor(HexColor("#AAB5C4"))
    c.setDash(1.5, 2)
    c.line(x + 70, y + height - 13, x + width - 9, y + height - 13)
    c.setDash()


def draw_observation_card(c: canvas.Canvas, index: int, x: float, y: float,
                          width: float, height: float) -> None:
    rounded_box(c, x, y, width, height, WHITE, stroke=LINE, radius=7)
    c.setFillColor(NAVY)
    c.roundRect(x, y + height - 29, width, 29, 7, stroke=0, fill=1)
    c.rect(x, y + height - 29, width, 7, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("CJK-Medium", 10)
    c.drawString(x + 12, y + height - 19.5, f"功能 {index}")
    c.setFont("CJK", 8.5)
    c.drawString(x + 66, y + height - 19.2, "场景：")
    c.setStrokeColor(HexColor("#B9C4D3"))
    c.setDash(2, 2)
    c.line(x + 98, y + height - 18, x + width - 12, y + height - 18)
    c.setDash()

    field_y = y + 7
    field_h = (height - 43) / 2
    field_w = (width - 14) / 2
    draw_field(c, "输入", x + 7, field_y + field_h, field_w, field_h, BLUE)
    draw_field(c, "输出", x + 7 + field_w, field_y + field_h, field_w, field_h, PURPLE)
    draw_field(c, "可能错误", x + 7, field_y, field_w, field_h, HexColor("#C4663A"))
    draw_field(c, "真人检查者", x + 7 + field_w, field_y, field_w, field_h, HexColor("#287E67"))


def build_pdf(output: Path) -> None:
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    page_w, page_h = A4
    c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    c.setTitle("L01 家庭 AI 足迹卡")
    c.setAuthor("芝士AI吃鱼")
    c.setSubject("AI 原生一代：儿童 AI 素养家庭练习")

    margin = 34
    content_w = page_w - margin * 2

    # Header
    c.setFillColor(NAVY)
    c.rect(0, page_h - 112, page_w, 112, stroke=0, fill=1)
    c.setFillColor(HexColor("#9FA9FF"))
    c.setFont("CJK-Medium", 8.5)
    c.drawString(margin, page_h - 29, "AI 原生一代 · 儿童 AI 素养 · L01")
    c.setFillColor(WHITE)
    c.setFont("CJK-Medium", 24)
    c.drawString(margin, page_h - 62, "家庭 AI 足迹卡")
    c.setFillColor(HexColor("#D8DEEA"))
    c.setFont("CJK", 10.5)
    c.drawString(margin, page_h - 84, "找输入 · 看输出 · 想错误 · 留下真人检查")
    c.setFillColor(PURPLE)
    c.roundRect(page_w - 112, page_h - 77, 78, 32, 10, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("CJK-Medium", 9.5)
    c.drawCentredString(page_w - 73, page_h - 64, "10 分钟")
    c.setFont("CJK", 7.2)
    c.drawCentredString(page_w - 73, page_h - 74, "无需打开新工具")

    # Privacy banner
    privacy_y = page_h - 164
    rounded_box(c, margin, privacy_y, content_w, 42, PALE_PURPLE, stroke=HexColor("#D6D0FF"), radius=8)
    c.setFillColor(PURPLE)
    c.setFont("CJK-Medium", 8.8)
    c.drawString(margin + 13, privacy_y + 25.5, "隐私提醒")
    paragraph(
        c,
        "只写普通场景和信息类型。不写姓名、学校、住址、账号、照片、聊天、声音或精确路线；这张卡无需整张上传。",
        margin + 74,
        privacy_y + 31,
        content_w - 87,
        8.2,
        11,
        color=INK,
    )

    # Three-step strip
    steps_y = page_h - 218
    gap = 7
    step_w = (content_w - gap * 2) / 3
    draw_step(c, "1", "找 3 个功能", "只选今天真实用过的", margin, steps_y, step_w)
    draw_step(c, "2", "每个写五格", "场景、输入、输出、错误、检查者", margin + step_w + gap, steps_y, step_w)
    draw_step(c, "3", "交流只交 1 行", "不需要一次做完，也不交整张卡", margin + (step_w + gap) * 2, steps_y, step_w)

    # Example
    example_y = page_h - 271
    rounded_box(c, margin, example_y, content_w, 43, PALE_BLUE, stroke=HexColor("#C8DDF5"), radius=7)
    c.setFillColor(BLUE)
    c.setFont("CJK-Medium", 8.5)
    c.drawString(margin + 12, example_y + 27, "示例")
    paragraph(
        c,
        "相册分类｜普通物品照片的像素｜“猫”标签｜把玩具猫认成真猫｜孩子和家长",
        margin + 57,
        example_y + 29,
        content_w - 69,
        8.4,
        11,
        color=INK,
    )

    # Observation cards
    card_h = 110
    card_gap = 8
    first_y = example_y - card_gap - card_h
    for i in range(3):
        draw_observation_card(c, i + 1, margin, first_y - i * (card_h + card_gap), content_w, card_h)

    # Final check
    final_y = 111
    rounded_box(c, margin, final_y, content_w, 56, PALE_PURPLE, stroke=HexColor("#D6D0FF"), radius=8)
    c.setFillColor(PURPLE)
    c.setFont("CJK-Medium", 9.3)
    c.drawString(margin + 13, final_y + 37, "最后只选一项")
    c.setFillColor(INK)
    c.setFont("CJK", 8.3)
    c.drawString(margin + 108, final_y + 37, "最值得检查的错误：")
    c.drawString(margin + 108, final_y + 16, "谁能看到现实情况并承担结果：")
    c.setStrokeColor(HexColor("#9B98C9"))
    c.setDash(2, 2)
    c.line(margin + 215, final_y + 35, page_w - margin - 12, final_y + 35)
    c.line(margin + 263, final_y + 14, page_w - margin - 12, final_y + 14)
    c.setDash()

    # Footer guidance
    c.setFillColor(INK)
    c.setFont("CJK-Medium", 7.8)
    c.drawString(margin, 91, "家长只追问三个问题")
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.3)
    c.drawString(margin + 94, 91, "它实际拿到了什么？这个错误能被看到吗？检查者真的能承担后果吗？")
    c.setStrokeColor(LINE)
    c.line(margin, 78, page_w - margin, 78)
    paragraph(
        c,
        "星球交流格式：场景｜输入｜输出｜可能错误｜检查者。课程依据：UNESCO AI competency framework for students；UNICEF Guidance on AI and Children；《中小学人工智能通识教育指南（2025年版）》",
        margin,
        68,
        content_w,
        6.6,
        9,
        color=MUTED,
    )
    c.setFillColor(HexColor("#8A94A3"))
    c.setFont("CJK", 6.3)
    c.drawRightString(page_w - margin, 21, "家庭本地练习 · 不作为儿童能力评价或课程效果证明")

    c.showPage()
    c.save()


if __name__ == "__main__":
    destination = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else OUTPUT
    build_pdf(destination)
    print(destination)
