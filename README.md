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

Tab có 4 kênh: **Ads**, **Live**, **Zalo**, **Website**. Danh sách tên luôn có Diễm SOL, Hương SOL, Thu SOL, Linh Live, cộng thêm những tên khác có đơn trên Pancake. Tên được so khớp bỏ qua dấu cách và gạch nối, nên "Thu - SOL" trên Pancake được tính là "Thu SOL".

- **Ads**: mỗi Sale chọn tên mình rồi nhập **Data Ads** từng ngày. Ô nhập nhận cả dạng `107+50`. Đơn, Doanh số, SP lấy từ Pancake: kênh Facebook Ads, tính theo ngày tạo đơn giờ Việt Nam, không tính đơn huỷ, CSKH, đơn đổi. CR = Đơn / Data Ads.
- **Live**: mỗi ngày một dòng, nhập tay hết **Data Live, Đơn, Doanh số, SP** (giống sheet Live của BC-SOL). Chỉ CR Live = Đơn / Data Live và AOV = Doanh số / SP là công thức. CR tháng chỉ tính những ngày đã nhập cả Data và Đơn. Bảng dưới đối chiếu số nhập tay với đơn Pancake nguồn Livestream, chỉ để tham khảo.
- **Zalo**: mỗi ngày một dòng. Người trực chọn tên mình, nhập **Bài đăng** và **KH quan tâm**. Đơn, Doanh số, SP là toàn bộ đơn Pancake kênh Zalo trong ngày. CR Zalo = Đơn / KH quan tâm, AOV = Doanh số / SP (giống sheet BC-SOL).
- **Website**: mỗi ngày một dòng. Pancake chưa gắn nguồn Website cho đơn web, nên NV trực tự nhập **Đơn Web, Doanh số Web, SP, Ghi chú**. AOV = Doanh số / SP, UPT = SP / Đơn.
- Ở dòng chưa có tên, khi Sale nhập số thì tên đang chọn ở đầu trang được điền vào.
- CR của cả tháng chỉ tính những ngày đã nhập Data (với Zalo là KH quan tâm), để ngày chưa nhập không làm CR bị cao lên. Dòng TỔNG THÁNG trong Excel dùng cùng quy tắc này (`SUMIFS(...,"<>")`).
- **Xuất báo cáo** mở `daily-report.html` ở tab mới. Đây là dashboard một trang 1536 × 1024, cùng bố cục với file "báo cáo ngày": tổng quan, kết quả theo kênh, cơ cấu doanh thu, Ads theo Sale, chi tiết kênh, hiệu suất nhân viên, tình trạng đơn, so sánh với ngày trước, ghi chú. Trang này lấy số của ngày được chọn từ tab dashboard đã mở nó (`window.opener.sevenamDailyDashboard.build(date)`), gồm đơn Pancake Ads và Zalo của ngày đó và ngày trước, cộng số Sale đã nhập (đọc mới từ server): Data Ads, Live, Zalo, Website. Doanh thu Live lấy từ số nhập tay, tính cho Linh Live; đơn Pancake nguồn Livestream chỉ còn ở phần Tình trạng đơn. Target ngày/tháng và Target Web ngày lưu trong trình duyệt theo từng tháng. Lần đầu, các ô này lấy từ "Mục tiêu & KPI" ở trang chính: target tổng gồm cả Website, Target Web ngày = target Website tháng ÷ số ngày. Thẻ Website ở mục 5 hiện Target ngày, % đạt và phần vượt/còn thiếu. Vì đơn Website không có trên Pancake, tiến độ trên các trang chính vẫn chỉ so với target Ads + Live + Zalo. Nút **Xuất PNG** dùng html2canvas để lưu ảnh 3072 × 2048. Dashboard ghi ra các phần còn thiếu, ví dụ "Data Ads Thu SOL" hay "Website". Trang chỉ có trên bản Vercel, vì workflow GitHub Pages chưa sao chép file này.
- **↓ Excel** tải file `.xlsx` của kênh đang xem, theo mẫu BC-SOL: "NHẬP LIỆU KÊNH ADS — <TÊN>", "ZALO — CHI TIẾT THEO NGÀY", "WEBSITE — CHI TIẾT THEO NGÀY". Cột tên có danh sách chọn. **Excel cả team** gồm sheet Tổng hợp (Data/Đơn/DS Ads, DS Live = tổng sheet Live tính cho Linh Live, DS Zalo, DS Web, Tổng DS theo từng người), mỗi Sale một sheet Ads, thêm các sheet Live, Zalo, Web. File được tạo ngay trên trình duyệt, không dùng thư viện ngoài.
- Số Sale nhập được lưu chung trên server qua `POST /api/pancake`. Action `saleReport` đọc theo tháng. Action `saleReportSave` lưu một ô, với `kind: "ads"` (`staff`, `date`, `value`), `"live"`, `"zalo"` hoặc `"web"` (`date`, `row`). Cả hai action đều yêu cầu mật khẩu dashboard.
- Nơi lưu là **Vercel Blob store `sevenam-sale-report` ở chế độ private**. Mỗi tháng là một file `sale-report/v1/YYYY-MM.json`, chứa `entries` (Ads), `live`, `zalo` và `web`. Khi đọc, API bỏ qua cache CDN. Khi ghi, API chỉ ghi nếu ETag còn khớp, nên hai người lưu cùng lúc không ghi đè số của nhau. Trình duyệt chỉ đọc lại số này khi mở tab, đổi tháng, bấm ↻, hoặc tối đa vài phút một lần, để giữ số lượt thao tác Blob ở mức thấp.
- Thư viện `@vercel/blob` được khai báo trong `vercel-pancake-backend/package.json`, Vercel tự cài khi deploy. Nếu chưa gắn Blob store, tab vẫn hiện số đơn, còn phần lưu báo lỗi "Chưa cấu hình kho lưu Data".

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
