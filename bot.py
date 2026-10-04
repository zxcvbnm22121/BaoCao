import logging, sys, time
from datetime import datetime
from zoneinfo import ZoneInfo
import collector, dashboard_ui, sheet_ui, slides_ui
from config import WORK_DIR, env
from wa_web import WhatsApp

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", encoding="utf-8",
                    handlers=[logging.FileHandler("agent.log", encoding="utf-8"),
                              logging.StreamHandler(sys.stdout)])
log = logging.getLogger("bot")

def fmt(v) -> str:
    return f"{v}%"

def run_flow(wa: WhatsApp):
    me = env("WA_SELF_PHONE")
    day = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).strftime("%d-%m-%Y")
    out_dir = WORK_DIR / day
    out_dir.mkdir(parents=True, exist_ok=True)
    wa.send_text(f"⏳ Bắt đầu báo cáo KPI ngày {day}: vào nhóm {env('WA_GROUP')} thu số liệu...")

    step = "thu số liệu từ nhóm"
    try:
        data, missing = collector.collect(wa, env("WA_GROUP"), float(env("WAIT_MINUTES", "30")))
        wa.open_phone(me)
        if missing:
            got = ", ".join(f"{k} {fmt(v)}" for k, v in data.items()) or "chưa có"
            wa.send_text(f"⚠️ Chưa đủ số liệu sau {env('WAIT_MINUTES', '30')} phút.\nCòn thiếu: {', '.join(missing)}\nĐã có: {got}\nGõ /baocao lại khi các bộ phận đã báo.")
            return
        wa.send_text("✅ Đã đủ số liệu: " + ", ".join(f"{k} {fmt(v)}" for k, v in data.items()) + "\nĐang nhập Google Sheet...")

        step = "nhập Google Sheet"
        sheet = sheet_ui.fill_and_copy(wa.ctx, data)

        step = "chạy dashboard và xuất BC1/BC2"
        bc1, bc2 = dashboard_ui.paste_and_export(wa.ctx, out_dir)
        sheet.close()

        step = "gửi ảnh cho c Hằng"
        wa.open_phone(env("RECEIVER_PHONE"))
        wa.send_image(bc1)
        wa.send_image(bc2)

        step = "thay ảnh trong Google Slides"
        shot = slides_ui.replace_image(wa.ctx, bc1, out_dir / "slide_check.png")
        wa.open_phone(me)
        wa.send_text("✅ Xong: đã nhập Sheet, xuất BC1/BC2, gửi c Hằng và thay ảnh trong Slides. Ảnh slide để bạn kiểm tra:")
        wa.send_image(shot)
    except Exception as e:  # noqa
        log.exception("loi o buoc %s", step)
        try:
            wa.open_phone(me)
            wa.send_text(f"❌ Lỗi ở bước: {step}\n{type(e).__name__}: {str(e)[:200]}")
        except Exception:
            log.exception("khong bao duoc loi")

def main():
    me = env("WA_SELF_PHONE")
    if not me:
        sys.exit("Thiếu WA_SELF_PHONE trong .env")
    wa = WhatsApp()
    wa.start()
    wa.open_phone(me)
    seen = {m["id"] for m in wa.messages()}
    log.info("da doc %d tin cu trong chat voi chinh minh", len(seen))
    log.info("bot san sang - bay gio hay go /baocao trong chat voi chinh minh")
    while True:
        try:
            for m in wa.messages():
                if m["id"] in seen:
                    continue
                seen.add(m["id"])
                log.info("tin moi: out=%s text=%r", m["out"], m["text"][:60])
                if not m["text"].startswith("/"):
                    continue  # chat voi chinh minh: chi co ban viet, chi xu ly tin bat dau bang "/" (tin tra loi cua bot khong bat dau bang "/")
                cmd = m["text"].split()[0].lower()
                log.info("lenh: %s", m["text"])
                if cmd == "/baocao":
                    run_flow(wa)
                elif cmd == "/help":
                    wa.send_text("Lệnh: /baocao - thu số liệu từ nhóm, nhập Sheet, xuất BC1/BC2, gửi c Hằng, cập nhật Slides.")
                wa.open_phone(me)
                seen |= {x["id"] for x in wa.messages()}
        except Exception as e:
            if "has been closed" in str(e) or "closed" in type(e).__name__.lower():
                log.error("Cua so Chrome cua bot da bi dong. Hay chay lai bot (run.bat) va dung dong cua so Chrome.")
                sys.exit(1)
            log.exception("vong lap loi")
        time.sleep(float(env("POLL_SECONDS", "4")))

if __name__ == "__main__":
    main()
