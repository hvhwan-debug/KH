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

## Thử thách sống: nhìn thẳng, quay trái, quay phải
Áp dụng cho màn chụp ảnh xác nhận trước khi làm bài **và** đăng nhập bằng khuôn mặt, để chặn ảnh tĩnh hoặc ảnh trên màn hình điện thoại.

1. `POST /api/kt-live` cấp token ký (hết hạn sau 3 phút, **dùng một lần**) kèm thứ tự ngẫu nhiên của 3 tư thế.
2. Trình duyệt hướng dẫn từng bước, tự đo góc quay đầu bằng điểm mốc khuôn mặt, chỉ chụp khi người dùng thật sự quay và giữ khoảng 1 giây.
3. `kt-start` / `kt-facelogin` gửi kèm ảnh nhìn thẳng + 2 ảnh quay; máy chủ **đo lại** góc quay bằng mô hình riêng (`api/_lib/facelive.js`), kiểm tra token chưa dùng, rồi mới cho đi tiếp.

Quy ước góc (ảnh gốc của camera): giá trị âm = người dùng quay sang phải của họ, dương = quay sang trái. Đã hiệu chỉnh trên ảnh thật: nhìn thẳng ≈ ±0,01; quay rõ ≈ 0,2 đến 0,45.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `FACE_LIVENESS` | `on` | `on` = không đạt thì từ chối · `soft` = chỉ ghi kết quả vào bài (`faceCheck.liveness`), không chặn · `off` = tắt, về cách chụp cũ. **Đăng nhập bằng khuôn mặt luôn bắt buộc ở `on` và `soft`.** |
| `FACE_LIVE_TURN_MIN` | `0.11` | Góc quay tối thiểu máy chủ chấp nhận (trình duyệt đòi 0,15 nên máy chủ không từ chối nhầm người đã làm đúng) |
| `FACE_LIVE_FRONT_MAX` | `0.14` | Độ lệch tối đa của ảnh "nhìn thẳng" |
| `FACE_LIVE_SAME_MAX` | `0.75` | Khoảng cách tối đa giữa các ảnh để coi là cùng một người (xem giới hạn bên dưới) |

Kết quả đo (góc quay, khoảng cách giữa các ảnh) được lưu trong `faceCheck.liveness` của bài làm để chỉnh ngưỡng bằng dữ liệu thật; nên chạy `soft` một thời gian rồi xem lại trước khi dùng `on` nếu có người dùng bị từ chối nhầm.

### Cơ chế này chặn được gì, không chặn được gì
- **Chặn được:** một ảnh tĩnh (in ra hoặc trên màn hình), vì không thể vừa nhìn thẳng vừa quay trái vừa quay phải theo thứ tự ngẫu nhiên; phát lại bộ ảnh cũ (token dùng một lần, hết hạn nhanh); quay sai chiều.
- **Chưa chặn được:** video quay sẵn người đó đang quay đầu, hoặc người chuẩn bị sẵn nhiều ảnh các góc rồi đổi lần lượt, hoặc deepfake trực tiếp.
- **Kiểm tra "cùng một người" giữa các góc chỉ là lớp rất yếu.** Mô hình nhận diện hiện dùng không phân biệt tốt các khuôn mặt khi đã quay nghiêng (thử thay người khác hẳn vào ảnh quay phải vẫn qua ở ngưỡng 0,75). Đừng dựa vào bước này để chống đổi người.
- Muốn chắc hơn cần thêm lớp khác: AI kiểm tra chụp lại màn hình trên cả 3 ảnh, đối chiếu cả ảnh quay với ảnh đã lưu, hoặc kiểm tra trực tiếp khi cần chắc chắn.
