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
| Bài làm được lưu | có | **có, đầy đủ** (ảnh khuôn mặt, kết quả, mã minh chứng, bản sao bài để xem lại) |
| Danh sách "các lần đã làm" ở màn xác nhận và màn kết quả | có | **có** (luôn hiện "Không giới hạn lượt") |
| Hồ sơ học tập (kết quả từng lần, chẩn đoán, ảnh, xem lại bài) | có | **có** cho quản trị viên: nút **📋** ở dòng tài khoản thử nghiệm, hoặc mở hồ sơ của thí sinh cùng mã; bài thử gắn nhãn "Thử nghiệm · không tính vào báo cáo" |
| Tính vào kết quả, dashboard, xếp hạng, nhắc nhở, file xuất, thống kê | có | **không** |
| Đăng nhập bằng khuôn mặt, tra cứu lịch sử, đối chiếu/cảnh báo khác người, xác thực kết quả | có | **có** (nhãn "Thử nghiệm"; email cảnh báo có tiền tố `[THỬ NGHIỆM]`) |

## Cách hệ thống giữ số liệu chính thức sạch
- Bài làm của tài khoản thử nghiệm được ghi vào chỉ mục kèm cờ `test`. Mọi thống kê/báo cáo đọc chỉ mục qua `quiz.getIndex()`, hàm này **loại bỏ** bài thử; chỉ các tính năng theo từng người (khuôn mặt, tra cứu lịch sử, xác thực) dùng `quiz.getIndexAll()`.
- Người ở chế độ thử nghiệm **không nằm trong danh sách thí sinh chính thức** (`api/_lib/testmode.js`), nên không bị tính vào "chưa làm bài", không nhận email nhắc nhở hay mời làm bài.
- Trong hồ sơ học tập, trung bình đội và thứ hạng chỉ tính bài chính thức; bài thử không làm thay đổi con số nào của đội. **Quản lí thường không thấy** tài khoản thử nghiệm hay bài thử (chỉ quản trị viên).
- Trên trang tra cứu lịch sử, bài thử có nhãn **Thử nghiệm** và **không bao giờ** được coi là "Kết quả chính thức", dù điểm cao nhất.

## Lưu ý
- **Đừng để nhân viên thật ở chế độ thử nghiệm**: trong lúc tích, họ biến khỏi danh sách thí sinh (không được gán đề, không tính vào số liệu). Làm xong thì bấm ↩ trả về.
- Bài thử làm **trước** khi có tính năng này (khi tài khoản thử nghiệm chưa lưu bài) không có dữ liệu khuôn mặt; hãy làm một bài thử mới. Ảnh chụp lúc **bắt đầu** làm bài đã được đưa vào thư viện khuôn mặt nên đăng nhập bằng khuôn mặt dùng được ngay, không cần nộp bài.
- Với tài khoản thật đã có bài chính thức từ trước, nạp dữ liệu khuôn mặt cũ bằng `/api/kt-facegallery?run=1` (xem docs/DANG-NHAP-KHUON-MAT.md).

## Khác biệt còn lại so với nhân viên bình thường (cố ý)
- Không nằm trong **bảng danh sách thí sinh**, không được gán đề, không nhận email nhắc nhở / mời làm bài.
- Không có **hồ sơ nhân sự** (thâm niên, trình độ…) vì đó là dữ liệu của thí sinh thật.
- Mã trùng với một thí sinh thật (ví dụ mã `1`) vẫn dùng được: khi đăng nhập, tài khoản thử nghiệm được ưu tiên; hồ sơ học tập của mã đó hiện cả bài chính thức lẫn bài thử (có nhãn), còn mọi báo cáo chỉ tính bài chính thức.
