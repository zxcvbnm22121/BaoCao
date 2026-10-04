"""Kiem tra bot co doc duoc tin nhan trong chat voi chinh minh khong. Chay khi bot.py DANG TAT."""
import time
from config import env
from wa_web import WhatsApp

wa = WhatsApp()
wa.start()
wa.open_phone(env("WA_SELF_PHONE"))
p = wa.page
print("Khung chat #main:", p.locator("#main").count(), "| so tin (div[data-id]):", p.locator("#main div[data-id]").count())
print("Hay go /baocao trong chat nay. Nhan Ctrl+C de thoat.")
n = -1
while True:
    ms = wa.messages()
    if len(ms) != n:
        n = len(ms)
        print(f"--- doc duoc {n} tin; 3 tin cuoi:")
        for m in ms[-3:]:
            print("  out =", m["out"], "| text =", repr(m["text"][:60]), "| id =", m["id"][:30])
    time.sleep(2)
