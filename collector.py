"""Tach % bao cao cua tung bo phan tu tin nhan trong nhom."""
import json, re, time, unicodedata
from config import env

CHANNELS = ["Ads", "Livestream", "Website", "Zalo", "CSKH", "Bán Lẻ"]
KEYS = {"cskh": "CSKH", "zalo": "Zalo", "web": "Website", "ads": "Ads", "live": "Livestream", "ban le": "Bán Lẻ"}
PAT = re.compile(r"\b(cskh|zalo|web|ads|live|ban\s*le)\w*\D{0,20}?(\d+(?:[.,]\d+)?)\s*%")

def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()

def parse(msgs) -> dict:
    """Tin nao cung duoc tinh theo thu tu thoi gian, tin sau ghi de tin truoc."""
    found = {}
    for m in msgs:
        for key, num in PAT.findall(norm(m["text"])):
            if 0 <= float(num.replace(",", ".")) <= 300:
                found[KEYS[re.sub(r"\s+", " ", key)]] = num.replace(".", ",")  # luon dung dau phay, vd "10,8"
    return found

def parse_with_claude(msgs, missing) -> dict:
    if not env("ANTHROPIC_API_KEY") or not msgs:
        return {}
    import anthropic
    body = "\n".join(f"{m['sender']}: {m['text']}" for m in msgs[-200:])
    prompt = (
        "Dưới đây là tin nhắn nhóm hôm nay. Trích % báo cáo của từng bộ phận trong: "
        f"{', '.join(missing)}. Nếu một bộ phận báo nhiều lần thì lấy lần cuối. "
        'Chỉ trả về JSON dạng {"Ads": 10.6}, bộ phận chưa báo thì bỏ.\n\n' + body
    )
    r = anthropic.Anthropic().messages.create(
        model=env("CLAUDE_MODEL", "claude-sonnet-5-5"), max_tokens=300,
        messages=[{"role": "user", "content": prompt}])
    txt = "".join(b.text for b in r.content if b.type == "text")
    m = re.search(r"\{.*\}", txt, re.S)
    try:
        d = json.loads(m.group(0)) if m else {}
    except ValueError:
        return {}
    return {k: f"{float(v):g}".replace(".", ",") for k, v in d.items()
            if k in missing and isinstance(v, (int, float)) and 0 <= v <= 300}

def collect(wa, group: str, wait_minutes: float):
    """Vao nhom, doi cac bo phan bao du. Tra ve (data, missing)."""
    wa.open_chat(group)
    deadline = time.time() + wait_minutes * 60
    while True:
        msgs = wa.load_today()
        data = parse(msgs)
        missing = [c for c in CHANNELS if c not in data]
        if missing:
            data.update(parse_with_claude(msgs, missing))
            missing = [c for c in CHANNELS if c not in data]
        if not missing or time.time() >= deadline:
            return data, missing
        time.sleep(60)
