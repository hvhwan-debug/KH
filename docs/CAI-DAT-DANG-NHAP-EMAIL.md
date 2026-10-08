# Cài đặt đăng nhập, lưu dữ liệu và email tự động

Mặc định ứng dụng chạy hoàn toàn trên thiết bị của từng người. Các bước dưới đây bật thêm:
đăng nhập bằng mã gửi qua email, lưu dữ liệu trên máy chủ, đồng bộ nhiều thiết bị và email tự động.
Chưa làm các bước này thì ứng dụng vẫn chạy bình thường như cũ (mục "Tài khoản & email" sẽ ghi "chưa bật").

## 1. Tạo kho lưu trữ (Azure Storage)
1. Azure Portal → **Storage accounts** → **Create** (Standard, LRS, khu vực Southeast Asia).
2. Vào storage vừa tạo → **Security + networking → Access keys** → copy **Connection string**.

## 2. Chọn nơi gửi email (SMTP)
Dùng một hộp thư riêng, ví dụ `noreply@livotec.vn`. Một số lựa chọn phổ biến:

| Nhà cung cấp | SMTP_HOST | SMTP_PORT | SMTP_USER | SMTP_PASS |
|---|---|---|---|---|
| Microsoft 365 | smtp.office365.com | 587 | địa chỉ hộp thư | mật khẩu ứng dụng (cần bật SMTP AUTH cho hộp thư) |
| Gmail / Google Workspace | smtp.gmail.com | 587 | địa chỉ Gmail | mật khẩu ứng dụng (bật xác minh 2 bước) |
| SendGrid | smtp.sendgrid.net | 587 | `apikey` | API key |

Nên cấu hình SPF và DKIM cho tên miền gửi để email không vào thư rác.

## 3. Đặt biến cấu hình trên Azure Static Web Apps
Azure Portal → Static Web App → **Settings → Environment variables** (hoặc Configuration) → thêm:

| Tên | Giá trị |
|---|---|
| `STORAGE_CONNECTION_STRING` | chuỗi kết nối ở bước 1 |
| `SESSION_SECRET` | chuỗi ngẫu nhiên từ 32 ký tự (xem cách tạo bên dưới) |
| `CRON_SECRET` | chuỗi ngẫu nhiên từ 32 ký tự, **khác** `SESSION_SECRET` |
| `ALLOWED_EMAIL_DOMAINS` | ví dụ `livotec.vn` (nhiều tên miền cách nhau dấu phẩy) |
| `ALLOWED_EMAILS` | (tùy chọn) email lẻ được phép, cách nhau dấu phẩy |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | theo bảng ở bước 2 |
| `MAIL_FROM` | ví dụ `Livotec <noreply@livotec.vn>` |
| `APP_URL` | `https://kh.io.vn` |

Phải có ít nhất một trong `ALLOWED_EMAIL_DOMAINS` hoặc `ALLOWED_EMAILS`. Đây là danh sách người được đăng nhập,
nhằm tránh việc người lạ nhờ hệ thống gửi email. Muốn thu hồi quyền của ai đó, bỏ họ khỏi danh sách (phiên của họ sẽ bị từ chối ở lần dùng sau).

Tạo chuỗi ngẫu nhiên:
- PowerShell: `-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })`
- Mac/Linux: `openssl rand -hex 32`

## 4. Đặt lịch gửi email trên GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
- Tên: `CRON_SECRET`, giá trị: **đúng bằng** `CRON_SECRET` ở bước 3.

Workflow `.github/workflows/mail-cron.yml` sẽ gọi máy chủ mỗi 30 phút (07:00–23:30 giờ Việt Nam).
Có thể chạy thử ngay ở tab **Actions → Gửi email tự động theo lịch → Run workflow**.
Lưu ý: GitHub tự tắt lịch chạy nếu kho mã không có hoạt động nào trong 60 ngày, và giờ chạy có thể trễ vài phút.

## 5. Kiểm tra
1. Mở ứng dụng → **Thiết lập → Tài khoản & email** → nhập email được phép → nhập mã 6 số nhận được.
2. Bật **Nhận email** → bấm **Gửi email thử**.
3. Đăng nhập thiết bị thứ hai bằng cùng email: dữ liệu tự đồng bộ về.

## Hoạt động như thế nào
- **Đăng nhập:** gửi mã 6 số tới email (hiệu lực 10 phút, tối đa 5 lần nhập sai, tối đa 5 yêu cầu mã mỗi giờ). Phiên lưu 30 ngày trong cookie có chữ ký.
- **Dữ liệu:** mỗi người một tệp JSON trong kho lưu trữ. Ứng dụng tự đồng bộ sau mỗi thay đổi. Nếu hai thiết bị sửa khác nhau, ứng dụng hỏi dùng bản nào.
- **Email:** tối đa 3 email mỗi ngày mỗi người.
  - Sáng (mặc định 08:00): kết quả hôm qua (chỉ khi hôm qua là ngày làm việc), cảnh báo rủi ro cao (không lặp lại hằng ngày), tổng kết tuần vào thứ Hai. Gộp trong một email.
  - Tối (mặc định 20:00): nhắc nhập số liệu, chỉ khi hôm nay là ngày làm việc và chưa nhập.
  - Mỗi email có liên kết **Tắt email tự động**.
  - Nội dung email dựa trên số liệu ứng dụng đã đồng bộ lần cuối. Nếu SR không mở ứng dụng, số liệu sẽ không cập nhật.

## Quyền riêng tư
- Trong ứng dụng, mỗi người chỉ xem được dữ liệu của mình và không có bảng xếp hạng giữa các SR.
- Người có quyền quản trị Azure Storage có thể đọc các tệp dữ liệu. Hãy cân nhắc và thông báo cho SR trước khi bật.
- Xóa dữ liệu một người: xóa tệp `user/<mã>.json` trong container `livotec-sr` của Storage Account.

## Giới hạn hiện tại
- Mỗi lần chạy lịch đọc toàn bộ tệp người dùng, phù hợp khoảng vài trăm người. Nhiều hơn nên chuyển sang cơ sở dữ liệu.
- Chưa có trang quản lý cho quản lý/admin xem tiến độ cả đội (cố ý, để giữ cam kết riêng tư).

## Chạy thử trên máy
```
node dev/server.js        # mở http://localhost:7071, email chỉ hiện ở http://localhost:7071/__mailbox
node dev/test-api.js      # chạy bộ kiểm thử API
```
