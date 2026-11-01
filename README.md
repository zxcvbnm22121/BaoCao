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
| `BLOB_READ_WRITE_TOKEN` | Vercel tự thêm khi gắn Blob store; dùng để lưu Data Ads của tab Báo cáo Sale. |
| `MONTHLY_TARGET` | Mục tiêu doanh thu tháng; có giá trị mặc định trong source. |
| `ALLOWED_ORIGIN` | Origin được phép gọi API; mặc định là GitHub Pages của repo. |

Cấu hình các giá trị thực trong Environment Variables của Vercel. Không đưa khoá API hoặc mật khẩu vào source.

## Báo cáo ngày của Sale (tab "Báo cáo Sale")

- Sale chọn tên mình và tháng, rồi nhập **Data Ads** từng ngày. Ô nhập chấp nhận cả dạng `107+50`.
- **Đơn, Doanh số, SP** lấy tự động từ Pancake: kênh Facebook Ads, tính theo ngày tạo đơn giờ Việt Nam, không tính đơn huỷ, CSKH, đơn đổi. **CR = Đơn / Data Ads**.
- Nút **Xuất báo cáo** tạo file `.xlsx` theo mẫu sheet "NHẬP LIỆU KÊNH ADS" (Ngày · Thứ · Data Ads · Đơn · Doanh số · SP · CR, có dòng TỔNG THÁNG và công thức CR). Nút **Excel cả team** tạo thêm sheet "Tổng hợp", mỗi Sale một sheet riêng. File được tạo ngay trên trình duyệt, không dùng thư viện ngoài.
- Số Data được lưu chung trên server qua `POST /api/pancake` với `action: "saleReport"` (đọc theo tháng) và `action: "saleReportSave"` (lưu một ngày). Hai action này cũng yêu cầu mật khẩu dashboard.
- Nơi lưu: **Vercel Blob store ở chế độ private**, gắn vào project. Khi gắn store, Vercel tự thêm `BLOB_READ_WRITE_TOKEN`, hoặc `BLOB_STORE_ID` nếu dùng OIDC. Mỗi tháng là một file `sale-report/v1/YYYY-MM.json`. Khi đọc, API bỏ qua cache CDN. Khi ghi, API chỉ ghi nếu ETag còn khớp, nên hai Sale lưu cùng lúc không ghi đè số của nhau.
- Thư viện `@vercel/blob` được khai báo trong `vercel-pancake-backend/package.json`, và Vercel tự cài khi deploy. Nếu chưa gắn Blob store, tab vẫn hiện số đơn, còn phần lưu Data báo lỗi "Chưa cấu hình kho lưu Data".

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
