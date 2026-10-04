"""Thay hinh cu bang BC1 trong Google Slides (dung chuc nang 'Thay the hinh anh' de giu dung vi tri/kich thuoc)."""
import re, time
from pathlib import Path
from config import env

REPLACE = re.compile(r"Replace image|Thay thế hình ảnh|Thay thế ảnh", re.I)
UPLOAD = re.compile(r"Upload from computer|Tải lên từ máy tính", re.I)

def replace_image(ctx, png: Path, shot: Path):
    page = ctx.new_page()
    page.goto(env("SLIDES_URL"))
    try:
        page.wait_for_selector("#docs-menubar", timeout=90_000)
    except Exception:
        raise RuntimeError("Không mở được Google Slides - chưa đăng nhập Google?")
    time.sleep(4)
    vp = page.viewport_size
    x, y = vp["width"] * float(env("SLIDE_IMG_X", "0.5")), vp["height"] * float(env("SLIDE_IMG_Y", "0.5"))
    page.mouse.click(x, y)  # chon hinh cu
    time.sleep(1.5)
    try:
        page.get_by_text(REPLACE).first.click(timeout=5000)  # nut tren thanh cong cu
    except Exception:
        page.mouse.click(x, y, button="right")  # du phong: menu chuot phai
        time.sleep(1)
        page.get_by_text(REPLACE).first.click(timeout=5000)
    with page.expect_file_chooser(timeout=15_000) as fc:
        page.get_by_text(UPLOAD).first.click()
    fc.value.set_files(str(png))
    time.sleep(8)
    page.keyboard.press("Escape")
    page.screenshot(path=str(shot))
    page.close()
    return shot
