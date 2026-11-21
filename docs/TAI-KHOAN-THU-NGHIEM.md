# Tài khoản thử nghiệm

Dùng để quản trị **làm thử đề như một thí sinh thật** (kể cả thử đăng nhập bằng khuôn mặt, tra cứu lịch sử, cảnh báo khác người, xác thực kết quả) mà **không làm sai số liệu chính thức**.

## Cách dùng
- **Dùng chính tài khoản thật của bạn:** Quản trị → Thí sinh → mở thí sinh đó → tích **🧪 Tài khoản thử nghiệm** → Lưu thay đổi. Người đó chuyển sang mục "🧪 Tài khoản thử nghiệm" (cuối tab Thí sinh), giữ nguyên mã, email, tên, quản lí, tỉnh, miền, chức danh…
- **Tạo mới:** ở form "Thêm thí sinh" tích **🧪 Tài khoản thử nghiệm** trước khi bấm Thêm.
- **Trả về thí sinh thường:** ở mục "🧪 Tài khoản thử nghiệm" bấm **↩** ở dòng đó. Thông tin đang có (kể cả chỉnh sửa lúc thử nghiệm) được trả về nguyên vẹn; các bài chính thức đã làm trước đó vẫn là bài chính thức.
- Tối đa 20 tài khoản thử nghiệm.
- Bấm ✕ xoá dòng rồi Lưu: tài khoản giả (tạo riêng để thử) bị xoá; còn tài khoản **vốn là thí sinh thật** thì được **trả về danh sách thí sinh** chứ không bị mất (trừ khi mã hoặc email đã bị người khác dùng, khi đó hệ thống bỏ qua và không ghi đè).

## Tài khoản thử nghiệm khác thí sinh thường ở đâu
| | Thí sinh thường | Tài khoản thử nghiệm |
|---|---|---|
| Khung giờ mở/đóng đề, đối tượng được thi | bị giới hạn | **không giới hạn** |
| Số lượt làm bài | theo cài đặt đề | **không giới hạn** |
| Bài làm được lưu | có | **có, đầy đủ** (ảnh khuôn mặt, kết quả, mã minh chứng) |
| Tính vào kết quả, dashboard, xếp hạng, nhắc nhở, file xuất, thống kê | có | **không** |
| Đăng nhập bằng khuôn mặt, tra cứu lịch sử, đối chiếu/cảnh báo khác người, xác thực kết quả | có | **có** (nhãn "Thử nghiệm"; email cảnh báo có tiền tố `[THỬ NGHIỆM]`) |

## Cách hệ thống giữ số liệu chính thức sạch
- Bài làm của tài khoản thử nghiệm được ghi vào chỉ mục kèm cờ `test`. Mọi thống kê/báo cáo đọc chỉ mục qua `quiz.getIndex()`, hàm này **loại bỏ** bài thử; chỉ các tính năng theo từng người (khuôn mặt, tra cứu lịch sử, xác thực) dùng `quiz.getIndexAll()`.
- Người ở chế độ thử nghiệm **không nằm trong danh sách thí sinh chính thức** (`api/_lib/testmode.js`), nên không bị tính vào "chưa làm bài", không nhận email nhắc nhở hay mời làm bài.
- Trên trang tra cứu lịch sử, bài thử có nhãn **Thử nghiệm** và **không bao giờ** được coi là "Kết quả chính thức", dù điểm cao nhất.

## Lưu ý
- **Đừng để nhân viên thật ở chế độ thử nghiệm**: trong lúc tích, họ biến khỏi danh sách thí sinh (không được gán đề, không tính vào số liệu). Làm xong thì bấm ↩ trả về.
- Bài thử làm **trước** khi có tính năng này (khi tài khoản thử nghiệm chưa lưu bài) không có dữ liệu khuôn mặt; hãy làm một bài thử mới. Ảnh chụp lúc **bắt đầu** làm bài đã được đưa vào thư viện khuôn mặt nên đăng nhập bằng khuôn mặt dùng được ngay, không cần nộp bài.
- Với tài khoản thật đã có bài chính thức từ trước, nạp dữ liệu khuôn mặt cũ bằng `/api/kt-facegallery?run=1` (xem docs/DANG-NHAP-KHUON-MAT.md).
