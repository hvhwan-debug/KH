# Đăng nhập bằng khuôn mặt (trang /kiemtra)

Nhân viên đã có dữ liệu khuôn mặt trên hệ thống chỉ cần quét mặt ở màn "Xác thực thí sinh": hệ thống nhận diện, tự điền mã nhân viên + email và hiện thông tin xác nhận như khi nhập tay. Lần đầu (chưa có dữ liệu) hoặc không nhận diện được thì nhập mã nhân viên + email như bình thường.

## Cách hoạt động
1. Trình duyệt chụp ảnh trong màn quét AI, kiểm tra tại máy (một khuôn mặt, đủ sáng, đủ lớn).
2. `POST /api/kt-facelogin`: máy chủ kiểm tra ảnh chụp trực tiếp bằng AI (**bắt buộc có AI xác nhận**, không có thì từ chối), tính "dấu vân" 128 số rồi tìm trong thư viện khuôn mặt (`api/_lib/facegallery.js`).
3. Nhận diện được và nhân viên còn trong danh sách (chưa `left`) thì trả mã NV + email; trình duyệt đi tiếp qua `/api/kt-check` như nhập tay nên mọi kiểm tra về đề thi giữ nguyên.

## Dữ liệu khuôn mặt
- Thư viện lưu **dấu vân (128 số)**, không lưu ảnh, tại `kt/face-gallery.json`; tối đa 3 dấu vân mỗi mã nhân viên.
- Thư viện tự đầy lên: mỗi bài nộp được đối chiếu là `match`/`first` sẽ được thêm vào (`faceid.check`); tác vụ nền `/api/cron` bổ sung cho bài cũ (`facegallery.backfill`).
- Xoá dữ liệu của một người: gọi `require("api/_lib/facegallery").remove("<mã nv>")`.

## Cấu hình (biến môi trường)
| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `FACE_LOGIN` | bật | Đặt `off` để tắt hẳn tính năng (nút vẫn hiện nhưng báo nhập tay) |
| `FACE_LOGIN_MAX` | `0.45` | Khoảng cách tối đa để coi là cùng người (chặt hơn đối chiếu 1-1 là `0.55`) |
| `FACE_LOGIN_MARGIN` | `0.08` | Người giống nhất phải cách người giống thứ hai ít nhất giá trị này, nếu không từ chối (kết quả mập mờ) |

Nếu nhiều người dùng thật bị từ chối dù đã có dữ liệu, tăng `FACE_LOGIN_MAX` rất từ từ (mỗi lần 0.02) và theo dõi nhật ký; không nên vượt `0.50`.

## Bảo vệ và nhật ký
- Giới hạn 6 lần thất bại / 10 phút theo IP. Mọi lần (kể cả bị từ chối) ghi vào nhật ký thao tác (`op: faceLogin`) kèm khoảng cách, không lưu ảnh.
- Mọi lý do không nhận diện được đều trả cùng một thông báo, không tiết lộ ai có hoặc không có dữ liệu.

## Lưu ý pháp lý
Dữ liệu sinh trắc học là dữ liệu cá nhân nhạy cảm (Nghị định 13/2023/NĐ-CP): cần có sự đồng ý rõ ràng của nhân viên, nói rõ mục đích và thời gian lưu, và luôn có cách vào hệ thống không dùng khuôn mặt (nhập mã nhân viên + email).
