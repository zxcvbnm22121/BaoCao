# Seven.AM — Dashboard doanh thu thời gian thực

Website theo dõi doanh thu và đơn hàng Pancake, triển khai trên Vercel:

**https://sevenam-pancake-live.vercel.app**

## Cấu trúc source

| Đường dẫn | Vai trò |
| --- | --- |
| `vercel-pancake-backend/` | Website chính: giao diện HTML/CSS/JavaScript và API serverless `api/pancake.mjs`. |
| `site/` | Bản dashboard trên GitHub Pages và dashboard showroom Nhanh.vn trong `site/nhanh/`. |
| `scripts/sync-pancake-pages.mjs` | Đồng bộ dữ liệu Pancake và tạo dữ liệu mã hoá cho dashboard. |
| `scripts/sync-nhanh-pages.mjs` | Đồng bộ dữ liệu showroom Nhanh.vn. |
| `.github/workflows/sevenam-pages.yml` | Đồng bộ và xuất bản GitHub Pages, có lịch chạy mỗi 10 phút. |
| `android-pancake/` | App Android xem cùng dữ liệu doanh thu Pancake. |
| `.github/workflows/android-pancake-apk.yml` | Build và phát hành APK của app Android. |

## Website trên Vercel

- Thư mục source của website: `vercel-pancake-backend/`.
- Runtime khai báo trong `package.json`: Node.js 24.x.
- Giao diện chính: `index.html`, `app.js`, `styles.css`.
- API: `POST /api/pancake`, yêu cầu mật khẩu dashboard.
- Cấu hình hàm serverless và HTTP cache: `vercel.json`.
- Dự án dùng file tĩnh và API Node.js; hiện không có lệnh `npm run build` hay dependency npm.

Biến môi trường được API sử dụng:

| Biến | Vai trò |
| --- | --- |
| `PANCAKE_API_KEY` | Khoá truy cập Pancake. |
| `PANCAKE_SHOP_ID` | ID shop Pancake. |
| `DASHBOARD_PASSWORD` | Mật khẩu mở dashboard. |
| `MONTHLY_TARGET` | Mục tiêu doanh thu tháng; có giá trị mặc định trong source. |
| `ALLOWED_ORIGIN` | Origin được phép gọi API; mặc định là GitHub Pages của repo. |

Cấu hình các giá trị thực trong Environment Variables của Vercel. Không đưa khoá API hoặc mật khẩu vào source.

## Đồng bộ dữ liệu và GitHub Pages

Workflow `sevenam-pages.yml` sao chép ba file giao diện chính từ `vercel-pancake-backend/` sang `site/` trước khi xuất bản. Khi chỉnh giao diện dashboard chính, sửa bản trong `vercel-pancake-backend/`.

Workflow dùng GitHub Actions Secrets:
- Pancake: `PANCAKE_API_KEY`, `PANCAKE_SHOP_ID`, `DASHBOARD_PASSWORD`.
- Nhanh.vn: `NHANH_APP_ID`, `NHANH_BUSINESS_ID`, `NHANH_ACCESS_TOKEN` và `DASHBOARD_PASSWORD`.
- GitHub Actions Variable tuỳ chọn: `MONTHLY_TARGET`.

Giữ `site/`, các script đồng bộ và workflow Pages: website Vercel còn tham chiếu `data/live.enc` và `data/pancake-key.enc` trên GitHub Pages để mở snapshot và hỗ trợ nguồn dữ liệu dự phòng.

## Kiểm tra source

Với Node.js 24, có thể kiểm tra cú pháp từ thư mục gốc:

```sh
node --check vercel-pancake-backend/app.js
node --check vercel-pancake-backend/api/pancake.mjs
node --check scripts/sync-pancake-pages.mjs
node --check scripts/sync-nhanh-pages.mjs
node --check site/app.js
node --check site/nhanh/app.js
```

Mã automation KPI chạy trên PC (`wa-agent`) đã được loại khỏi phiên bản hiện tại. Có thể tra cứu phiên bản cũ trong lịch sử Git nếu cần.
