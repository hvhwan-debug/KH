# Cài đặt đăng nhập và lưu dữ liệu trên máy chủ

Mặc định ứng dụng chạy hoàn toàn trên thiết bị của từng người. Các bước dưới đây bật thêm:
đăng nhập bằng email + mật khẩu, lưu dữ liệu trên máy chủ, đồng bộ nhiều thiết bị.
Chưa làm các bước này thì ứng dụng vẫn chạy bình thường như cũ (mục "Tài khoản & email" sẽ ghi "chưa bật").

Phần gửi email tự động (nhắc việc, cảnh báo) là **tuỳ chọn riêng**, xem mục cuối tài liệu — không bắt buộc để đăng nhập/đồng bộ hoạt động.

## 1. Tạo kho lưu trữ (Azure Storage)
1. Azure Portal → **Storage accounts** → **Create** (Standard, LRS, khu vực Southeast Asia) — hoặc dùng lại một storage account đã có, app sẽ tự tạo container riêng tên `livotec-sr` trong đó, không đụng tới dữ liệu khác.
2. Vào storage vừa tạo → **Security + networking → Access keys** → copy **Connection string**.

## 2. Đặt biến cấu hình trên Azure Static Web Apps
Azure Portal → Static Web App → **Settings → Environment variables** (hoặc Configuration) → thêm:

| Tên | Giá trị |
|---|---|
| `STORAGE_CONNECTION_STRING` | chuỗi kết nối ở bước 1 |
| `SESSION_SECRET` | chuỗi ngẫu nhiên từ 32 ký tự (xem cách tạo bên dưới) |
| `ALLOWED_EMAIL_DOMAINS` | ví dụ `livotec.vn` (nhiều tên miền cách nhau dấu phẩy) |
| `ALLOWED_EMAILS` | (tùy chọn) email lẻ được phép, cách nhau dấu phẩy. Đặt giá trị là `*` (chỉ một dấu sao) để cho phép **bất kỳ email hợp lệ nào** đăng ký, không cần liệt kê hay giới hạn tên miền |
| `APP_URL` | `https://kh.io.vn` |

Phải có ít nhất một trong `ALLOWED_EMAIL_DOMAINS` hoặc `ALLOWED_EMAILS`. Đây là danh sách người được đăng ký tài khoản,
nhằm tránh việc người lạ tự tạo tài khoản. Muốn thu hồi quyền của ai đó, bỏ họ khỏi danh sách (phiên của họ sẽ bị từ chối ở lần dùng sau; tài khoản và mật khẩu cũ của họ vẫn còn trong kho lưu trữ, không tự xoá).

### Trang quản trị thành viên

Thêm biến `ADMIN_EMAILS` (cùng chỗ với các biến ở trên) để bật trang quản trị:

| Tên | Giá trị |
|---|---|
| `ADMIN_EMAILS` | email của bạn (và của ai khác cần quyền quản trị), cách nhau dấu phẩy — ví dụ `ban@livotec.vn`. Không hỗ trợ `*`, phải liệt kê đúng từng email. |

Đăng nhập bằng đúng email có trong `ADMIN_EMAILS`, vào mục **Tài khoản & email** (icon người ở góc trên) sẽ thấy nút **"Quản trị thành viên"** để xem danh sách SR đã có dữ liệu trên máy chủ (chỉ tiêu, khu vực, lần đồng bộ gần nhất) và xoá dữ liệu của một thành viên nếu cần. Người không có trong `ADMIN_EMAILS` không thấy nút này và bị máy chủ từ chối nếu cố gọi thẳng vào API quản trị.

Tạo chuỗi ngẫu nhiên cho `SESSION_SECRET`:
- Mac/Linux: `openssl rand -hex 32`
- Windows (PowerShell): `$b=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);($b|ForEach-Object{$_.ToString('x2')}) -join ''`

Không dán chuỗi này vào chat hay vào mã nguồn.

## 3. Kiểm tra
1. Mở `https://kh.io.vn/api/auth/me`. Thấy `{"avail":true,...}` là đã cấu hình đủ. Thấy `{"avail":false,"missing":[...]}` thì danh sách `missing` cho biết còn thiếu biến nào (chỉ hiện tên biến).
2. Mở ứng dụng → **Thiết lập → Tài khoản & email** → nhập một email nằm trong danh sách được phép + tự đặt mật khẩu (ít nhất 6 ký tự) → bấm **Đăng nhập / Đăng ký**. Lần đầu nhập email đó, hệ thống tự tạo tài khoản với đúng mật khẩu vừa gõ; các lần sau phải gõ đúng mật khẩu đó mới vào được.
3. Đăng nhập thiết bị thứ hai bằng cùng email + mật khẩu: dữ liệu tự đồng bộ về.

## Hoạt động như thế nào
- **Đăng nhập:** email + mật khẩu do người dùng tự đặt khi đăng ký lần đầu. Mật khẩu được băm (scrypt) trước khi lưu, không lưu dạng chữ thường. Sai mật khẩu quá 10 lần trong 1 giờ cho một tài khoản sẽ bị tạm khoá 1 giờ. Phiên đăng nhập lưu 30 ngày trong cookie có chữ ký.
- **Dữ liệu:** mỗi người một tệp JSON trong kho lưu trữ. Ứng dụng tự đồng bộ sau mỗi thay đổi. Nếu hai thiết bị sửa khác nhau, ứng dụng hỏi dùng bản nào.
- **Quên mật khẩu:** bấm "Quên mật khẩu?" ở khung đăng nhập, nhập email → hệ thống gửi một liên kết đặt lại mật khẩu có hiệu lực 1 giờ (cần đã bật email tự động ở mục tuỳ chọn bên dưới; nếu chưa bật SMTP thì link không gửi được, lúc đó vẫn phải xoá tệp `user/<mã>.json` như cách cũ). Bấm vào liên kết trong email sẽ mở lại ứng dụng với khung "Đặt mật khẩu mới"; đặt xong sẽ tự đăng nhập luôn, không mất dữ liệu đã đồng bộ trước đó.

## Quyền riêng tư
- Trong ứng dụng, mỗi người chỉ xem được dữ liệu của mình và không có bảng xếp hạng giữa các SR.
- Người có quyền quản trị Azure Storage có thể đọc các tệp dữ liệu (mật khẩu đã băm nên không đọc được, nhưng số liệu kế hoạch thì đọc được). Hãy cân nhắc và thông báo cho SR trước khi bật.
- Xóa dữ liệu một người: xóa tệp `user/<mã>.json` trong container `livotec-sr` của Storage Account.

## Giới hạn hiện tại
- Trang quản trị (`ADMIN_EMAILS`) chỉ xem tóm tắt và xoá thành viên, không xem được tiến độ chi tiết cả đội theo kiểu bảng xếp hạng (cố ý, để giữ cam kết riêng tư).
- Quên mật khẩu cần đã bật SMTP (mục tuỳ chọn bên dưới) để gửi được link; chưa có luồng tự đổi mật khẩu khi đang đăng nhập (chỉ có đặt lại khi quên).

## Tuỳ chọn: bật email tự động (nhắc việc, cảnh báo)
Đây là tính năng **thêm**, không liên quan đến việc đăng nhập ở trên vẫn hoạt động nếu bỏ qua phần này.

1. Chọn một hộp thư để gửi email (Gmail cần bật xác minh 2 bước + tạo "Mật khẩu ứng dụng"; hoặc dùng SendGrid, không cần 2FA).
2. Thêm thêm các biến môi trường (cùng chỗ bước 2 ở trên): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, và `CRON_SECRET` (một chuỗi ngẫu nhiên khác, tạo như `SESSION_SECRET`).
3. Repo GitHub → **Settings → Secrets and variables → Actions → New repository secret**: tên `CRON_SECRET`, giá trị đúng bằng `CRON_SECRET` ở bước 2. Workflow `.github/workflows/mail-cron.yml` sẽ gọi máy chủ mỗi 30 phút (07:00–23:30 giờ Việt Nam) để gửi email đến hạn.
4. Trong app, bật **Nhận email** ở mục Tài khoản & email → bấm **Gửi email thử** để kiểm tra. Nếu bạn gõ sai hoặc thiếu các biến này, "Gửi email thử" sẽ báo rõ là chưa cấu hình chứ không báo gửi thành công.

Mỗi email tối đa 3 lần/ngày/người. Sáng (mặc định 08:00): kết quả hôm qua, khuyến nghị rủi ro cao, tổng kết tuần thứ Hai. Tối (mặc định 20:00): nhắc nhập số liệu. Mỗi email có liên kết **Tắt email tự động**.

## Chạy thử trên máy
```
node dev/server.js        # mở http://localhost:7071
node dev/test-api.js      # chạy bộ kiểm thử API
```
Lưu ý: `dev/test-api.js` được viết cho luồng mã OTP cũ qua email và sẽ cần cập nhật lại cho luồng mật khẩu mới trước khi chạy.
