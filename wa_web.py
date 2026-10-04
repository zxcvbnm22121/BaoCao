"""Dieu khien WhatsApp Web nhu nguoi dung that."""
import random, re, time
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
from browser import launch

SEL_SEARCH = 'div[contenteditable="true"][data-tab="3"]'
SEL_BOX = 'footer div[contenteditable="true"]'
SEL_ATTACH = 'span[data-icon="plus-rounded"], span[data-icon="plus"], span[data-icon="clip"]'
SEL_FILE = 'input[type="file"][accept*="image"]'
SEL_SEND = 'span[data-icon="send"]'

JS_READ = """
() => [...document.querySelectorAll('#main div[data-id]')].map(e => {
  const id = e.getAttribute('data-id') || '';
  const meta = e.querySelector('div[data-pre-plain-text]');
  const txt = e.querySelector('span.selectable-text');
  return {id, out: id.startsWith('true_') || !!(e.closest('.message-out') || e.querySelector('.message-out')),
          pre: meta ? meta.getAttribute('data-pre-plain-text') : '',
          text: txt ? txt.innerText : ''};
}).filter(m => m.text)
"""
_SCROLLER = """
(top) => {
  const first = document.querySelector('#main div[data-id]');
  if (!first) return false;
  let el = first.parentElement;
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      el.scrollTop = top ? 0 : el.scrollHeight; return true;
    }
    el = el.parentElement;
  }
  return false;
}
"""

def pause(a=0.8, b=2.0):
    time.sleep(random.uniform(a, b))

def intl(phone: str) -> str:
    p = re.sub(r"\D", "", phone)
    return "84" + p[1:] if p.startswith("0") else p

def today_keys():
    n = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    return {(n.day, n.month, n.year), (n.month, n.day, n.year)}  # chap nhan ca dd/mm va mm/dd

class WhatsApp:
    def start(self):
        self.pw = sync_playwright().start()
        self.ctx = launch(self.pw)
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        self.page.on("dialog", lambda d: d.accept())
        self.page.goto("https://web.whatsapp.com")
        self.page.wait_for_selector("#pane-side", timeout=300_000)

    # ---- mo chat ----
    SEARCH_SELECTORS = [
        'div[contenteditable="true"][data-tab="3"]',
        'div[role="search"] [contenteditable="true"]',
        'div[role="search"] input',
        'div[role="textbox"][aria-label*="Search" i]',
        'div[role="textbox"][aria-label*="Tìm" i]',
        '#side [contenteditable="true"]',
        '#side input[type="text"]',
        '#side input',
    ]

    def _focus_search(self):
        """Tra ve o tim kiem (neu thay) hoac None neu phai dung phim tat Ctrl+Alt+/."""
        p = self.page
        for sel in self.SEARCH_SELECTORS:
            try:
                loc = p.locator(sel)
                if loc.count() and loc.first.is_visible():
                    loc.first.click()
                    return loc.first
            except Exception:
                pass
        p.keyboard.press("Escape")
        p.keyboard.press("Control+Alt+/")  # phim tat 'tim kiem' cua WhatsApp Web
        time.sleep(0.8)
        return None

    def open_chat(self, name: str):
        self.page.bring_to_front()
        box = self._focus_search()
        if box is not None:
            box.fill(name)
        else:
            self.page.keyboard.press("Control+A")
            self.page.keyboard.insert_text(name)
        pause(1.5, 2.5)
        hit = self.page.locator(f'#pane-side span[title="{name}"]')
        if hit.count():
            hit.first.click()
        else:
            self.page.keyboard.press("Enter")
        try:
            self.page.wait_for_selector(SEL_BOX, timeout=20_000)
        except Exception:
            try:
                open("work/wa_side.html", "w", encoding="utf-8").write(
                    self.page.locator("#side").first.inner_html()[:60000])
            except Exception:
                pass
            raise RuntimeError(f"Không mở được chat '{name}' (kiểm tra tên nhóm đúng như hiển thị). Đã lưu work/wa_side.html")
        pause()

    def open_phone(self, phone: str):
        self.page.bring_to_front()
        self.page.goto(f"https://web.whatsapp.com/send?phone={intl(phone)}")
        self.page.wait_for_selector(SEL_BOX, timeout=120_000)
        pause(1.5, 3)

    # ---- doc tin ----
    def messages(self):
        out = []
        for m in self.page.evaluate(JS_READ):
            pre = m["pre"] or ""
            sm = re.search(r"\]\s*(.*?):\s*$", pre)
            dm = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", pre)
            out.append({
                "id": m["id"], "out": m["out"], "text": m["text"].strip(),
                "sender": sm.group(1).strip() if sm else "",
                "date": tuple(int(x) for x in dm.groups()) if dm else None,
            })
        return out

    def load_today(self):
        """Cuon len dau cho den khi cham tin cu hon hom nay, tra ve cac tin hom nay."""
        today = today_keys()
        last = -1
        for _ in range(25):
            msgs = self.messages()
            if any(m["date"] and m["date"] not in today for m in msgs) or len(msgs) == last:
                break
            last = len(msgs)
            self.page.evaluate(_SCROLLER, True)
            pause(1.2, 2.0)
        msgs = self.messages()
        self.page.evaluate(_SCROLLER, False)
        return [m for m in msgs if m["date"] in today]

    # ---- gui tin ----
    def send_text(self, text: str):
        self.page.bring_to_front()
        self.page.locator(SEL_BOX).first.click()
        lines = text.split("\n")
        for i, line in enumerate(lines):
            self.page.keyboard.insert_text(line)
            if i < len(lines) - 1:
                self.page.keyboard.press("Shift+Enter")
        pause(0.4, 1.0)
        self.page.keyboard.press("Enter")
        pause()

    def send_image(self, path: str):
        self.page.bring_to_front()
        self.page.locator(SEL_ATTACH).first.click()
        pause(0.5, 1.2)
        self.page.locator(SEL_FILE).first.set_input_files(str(path))
        self.page.wait_for_selector(SEL_SEND, timeout=30_000)
        pause()
        self.page.locator(SEL_SEND).last.click()
        pause(2, 4)

    def close(self):
        self.ctx.close()
        self.pw.stop()
