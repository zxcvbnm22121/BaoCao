"""Dan bang vao dashboard, phan tich, xuat BC1 + BC2."""
import re, time
from pathlib import Path
from config import env

def locate(page, build, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        for f in page.frames:
            try:
                loc = build(f)
                if loc.count() and loc.first.is_visible():
                    return loc.first
            except Exception:
                pass
        time.sleep(0.5)
    return None

def _btn(text):
    rx = re.compile(text, re.I)
    return lambda f: f.locator("button, a, [role=button]").filter(has_text=rx)

def paste_and_export(ctx, out_dir: Path):
    page = ctx.new_page()
    page.goto(env("DASHBOARD_URL"), wait_until="domcontentloaded")
    page.bring_to_front()
    ta = locate(page, lambda f: f.locator("textarea"), 15)
    if ta is None:  # co the can bam vao the KPI Dashboard truoc
        card = locate(page, _btn("KPI Dashboard"), 5)
        if card:
            card.click()
        ta = locate(page, lambda f: f.locator("textarea"), 15)
    if ta is None:
        raise RuntimeError("Không thấy ô 'dán dữ liệu báo cáo' trên dashboard")
    ta.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")
    page.keyboard.press("Control+V")
    time.sleep(1)
    if "tổng" not in ta.input_value().lower():
        raise RuntimeError("Dán bảng vào dashboard không thành công (clipboard trống?)")
    locate(page, _btn("Phân tích dữ liệu")).click()
    time.sleep(4)  # cho dashboard chay so lieu
    saved = []
    for name in ("BC1", "BC2"):
        btn = locate(page, _btn(f"Xuất\\s*{name}"), 15)
        if btn is None:
            raise RuntimeError(f"Không thấy nút Xuất {name}")
        with page.expect_download(timeout=90_000) as dl:
            btn.click()
        d = dl.value
        out = out_dir / f"{name}{Path(d.suggested_filename).suffix or '.png'}"
        d.save_as(out)
        saved.append(out)
        time.sleep(1)
    page.close()
    return saved
