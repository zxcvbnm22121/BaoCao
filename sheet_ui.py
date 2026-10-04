"""Nhap % vao Google Sheet bang giao dien, roi copy bang. Tu dong tim vi tri cac o."""
import csv, io, re, time, unicodedata
from config import env
from wa_web import pause

NAMES = {"ads": "Ads", "livestream": "Livestream", "shopee": "Shopee", "website": "Website",
         "zalo": "Zalo", "cskh": "CSKH", "ban le": "Bán Lẻ"}

def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").replace("đ", "d").replace("Đ", "D"))
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").lower().split())

def _col(i: int) -> str:
    s, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s

def layout_from_rows(rows):
    """Tim o nhap % cua tung kenh va vung can copy tu noi dung sheet (list cac dong)."""
    hr = ci = pi = None
    for ri, row in enumerate(rows):
        n = [_norm(c) for c in row]
        if "kenh" in n and any("tien do" in c for c in n):
            hr, ci = ri, n.index("kenh")
            pi = next(i for i, c in enumerate(n) if "tien do" in c)
            break
    if hr is None:
        raise RuntimeError("Không tìm thấy bảng có cột 'Kênh' và '% Tiến độ' trong Sheet")
    cells, tong = {}, None
    for rj in range(hr + 1, len(rows)):
        name = _norm(rows[rj][ci]) if len(rows[rj]) > ci else ""
        if name in NAMES:
            cells[NAMES[name]] = f"{_col(pi)}{rj + 1}"
        elif name.startswith("tong"):
            tong = rj
            break
    if tong is None:
        raise RuntimeError("Không tìm thấy dòng TỔNG của bảng")
    start = hr - 1 if hr > 0 and "cap nhat" in _norm(" ".join(rows[hr - 1])) else hr
    return cells, f"{_col(ci)}{start + 1}:{_col(ci + 3)}{tong + 1}"

def detect_layout(ctx):
    url = env("SHEET_URL")
    sid = re.search(r"/d/([\w-]+)", url).group(1)
    gid = (re.search(r"gid=(\d+)", url) or [None, "0"])[1]
    r = ctx.request.get(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}")
    if not r.ok or "csv" not in r.headers.get("content-type", ""):
        raise RuntimeError("Không đọc được bố cục Sheet (chưa đăng nhập Google hoặc chưa có quyền xem)")
    return layout_from_rows(list(csv.reader(io.StringIO(r.body().decode("utf-8-sig")))))

def _manual_cells() -> dict:
    d = {}
    for part in env("SHEET_CELLS").split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            d[k.strip()] = v.strip()
    return d

def _goto(page, addr: str):
    nb = page.locator("#t-name-box")
    nb.click()
    page.keyboard.press("Control+A")
    page.keyboard.type(addr)
    page.keyboard.press("Enter")
    time.sleep(0.4)

def fill_and_copy(ctx, values: dict):
    """Tra ve tab Sheet (de nguyen, clipboard dang chua bang da copy)."""
    cells, copy_range = _manual_cells(), env("SHEET_COPY_RANGE")
    if not cells or not copy_range:
        cells, copy_range = detect_layout(ctx)
    page = ctx.new_page()
    page.goto(env("SHEET_URL"))
    try:
        page.wait_for_selector("#t-name-box", timeout=90_000)
    except Exception:
        raise RuntimeError("Không mở được Google Sheet - chưa đăng nhập Google? Chạy lại setup.bat")
    pause(1.5, 2.5)
    for ch, v in values.items():
        if ch not in cells:
            raise RuntimeError(f"Không tìm thấy ô của kênh {ch} trong Sheet")
        _goto(page, cells[ch])
        page.keyboard.type(str(v))  # chi go so, khong dinh dang lai
        page.keyboard.press("Enter")
        pause(0.3, 0.8)
    time.sleep(2)  # cho cong thuc tinh lai
    _goto(page, copy_range)
    page.keyboard.press("Control+C")
    time.sleep(1.5)
    return page
