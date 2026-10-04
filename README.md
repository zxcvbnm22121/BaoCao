# WA Agent - báo cáo KPI ngày

Gõ `/baocao` trong chat WhatsApp với chính mình. Bot (một cửa sổ Chrome thật) sẽ:
1. Vào nhóm ALL TEAM, đọc tin hôm nay, lấy % của CSKH, Zalo, Web, Ads, Live, Bán lẻ (chờ tối đa WAIT_MINUTES nếu chưa đủ).
2. Mở Google Sheet, nhập % vào các ô đã cấu hình, copy bảng.
3. Mở dashboard, xóa cũ, dán bảng, bấm Phân tích dữ liệu, Xuất BC1, Xuất BC2.
4. Gửi 2 ảnh cho c Hằng.
5. Mở Google Slides, thay hình cũ bằng BC1 (dùng "Thay thế hình ảnh" nên giữ đúng vị trí/kích thước).
6. Nhắn lại kết quả + ảnh slide vào chat với chính mình để bạn kiểm tra.

## Cài đặt
```
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m playwright install chromium
copy .env.example .env
notepad .env
```
Cần cài Google Chrome (bot dùng Chrome thật để đăng nhập Google được).

## Điền .env (bắt buộc)
- `WA_SELF_PHONE`: số điện thoại của bạn.
- `SHEET_CELLS` và `SHEET_COPY_RANGE`: số dòng thật trong Sheet (mở Sheet, xem số dòng ở lề trái).
- `WA_GROUP`: tên nhóm đúng như hiển thị.

## Chạy
1. Lần đầu (bot đang tắt): `.venv\Scripts\python.exe setup_login.py` - quét QR WhatsApp, đăng nhập Google, nhấn Enter.
2. `.venv\Scripts\python.exe bot.py` và để cửa sổ Chrome mở.
3. Trong chat với chính mình gõ `/baocao`.

## Lưu ý
- Shopee không có trong tin báo cáo nên bot giữ nguyên ô Shopee.
- Nếu tên người báo/cách viết lạ, đặt `ANTHROPIC_API_KEY` để Claude đọc hộ khi cách tách thông thường không ra.
- Bước Slides và các selector phụ thuộc giao diện Google/WhatsApp, cần chạy thử 1-2 lần để chỉnh.
- Luồng cũ (Pancake + Drive) nằm trong thư mục `legacy/`, hiện không dùng.
