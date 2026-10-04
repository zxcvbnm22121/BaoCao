"""Chay 1 lan (khi bot KHONG chay): dang nhap WhatsApp (quet QR) va Google trong cung 1 trinh duyet."""
from playwright.sync_api import sync_playwright
from browser import launch

with sync_playwright() as p:
    ctx = launch(p)
    wa = ctx.pages[0] if ctx.pages else ctx.new_page()
    wa.goto("https://web.whatsapp.com")
    g = ctx.new_page()
    g.goto("https://accounts.google.com")
    input("Quet QR WhatsApp + dang nhap Google (tai khoan co quyen sua Sheet/Slides) xong thi nhan Enter... ")
    ctx.close()
print("Da luu phien dang nhap.")
