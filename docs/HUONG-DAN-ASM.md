# Trang quản lý ASM và hai ngành hàng

## Thiết lập một lần
1. Trong Azure Static Web Apps > Configuration, đặt `ADMIN_EMAILS` = email quản trị (nhiều email cách nhau bằng dấu phẩy).
2. Quản trị viên đăng nhập, mở `/asm/` > tab **Quản trị** > thêm từng ASM (email phải thuộc tên miền đã cho phép dùng ứng dụng).
3. SR mở app, bấm **Thiết lập > Đổi** (hoặc thẻ "Hoàn tất hồ sơ"), chọn ngành và ASM. Quản trị viên có thể gán/khoá ASM và đổi ngành cho SR.

## Quản trị (tab Quản trị trên /asm/)
- **Cấp vai trò**: chọn SR hoặc ASM cho từng thành viên. Quản trị viên cao nhất đặt trong `ADMIN_EMAILS`.
- **ASM phụ trách ngành nào, tỉnh/thành nào**: nút Sửa ở mỗi ASM. SR chỉ chọn được ASM đúng ngành của mình; nhập tỉnh thì app gợi ý ASM phụ trách tỉnh đó (chỉ khi chưa chọn ASM).
- **Tạo trước thành viên**: khai báo email + ngành + ASM + tỉnh, người đó đăng nhập app lần đầu sẽ tự có hồ sơ (ASM bị khoá).
- **Gỡ thành viên khỏi nhóm**: ASM (và quản trị viên) bấm Chi tiết > **Gỡ khỏi nhóm**. Tài khoản và số liệu vẫn giữ; người bị gỡ không tự chọn lại ASM đó được, quản trị viên gán lại thì được. SR chỉ chọn hoặc đổi ASM, không tự gỡ.
- **Giao việc**: ở tab Hôm nay, ASM/quản trị viên giao việc cho một người, một ngành hoặc cả nhóm.

## Nhập từ file Excel nhân sự
Tab Quản trị > **Nhập từ file Excel nhân sự**. File cần có sheet `GT1`, `GT2`, `ASM GT1`, `ASM GT2`. Trình duyệt đọc file tại máy, chỉ gửi tên, email công ty, ngành, ASM, tỉnh/thành.
- GT1 = Ngành 1, GT2 = Ngành 2. ASM lấy từ hai sheet ASM (kèm tỉnh phụ trách); RSM/GĐKD không được tự cấp quyền ASM.
- Chỉ nhập "Đại diện Bán hàng" còn làm việc và có email công ty; ASM lấy theo cột "Quản lý trực tiếp". AQUALINK/Tư vấn sản phẩm không nhập.
- Cần `ALLOWED_EMAILS=*` (hoặc cho phép tên miền karofi.vn, karofi.com). Có thể nhập lại nhiều lần, không nhân đôi. Trường hợp thiếu email / không khớp ASM được liệt kê và tải về CSV.

## Quản lý thành viên (chỉ quản trị viên, tab Quản trị > nút Quản lý)
- **Sửa** họ tên, tỉnh/thành. (Email là định danh tài khoản nên không đổi được; cần đổi email thì tạo tài khoản mới.)
- **Đặt mật khẩu mới** (từ 8 ký tự): người đó bị đăng xuất khỏi mọi thiết bị, phải đăng nhập bằng mật khẩu mới. Gửi mật khẩu qua kênh an toàn.
- **Khoá / mở khoá** tài khoản: tài khoản khoá bị chặn ở mọi API và không đăng nhập được.
- **Đăng xuất mọi thiết bị**, **Xoá tài khoản** (vĩnh viễn; nếu là ASM thì bỏ khỏi danh sách ASM và nhóm của họ thành "chưa gán").
- Không tự khoá/xoá chính mình. Mọi thao tác ghi vào **Nhật ký thao tác** (không ghi mật khẩu).
- Cơ chế: tài khoản có cờ `disabled` và mốc `sessAfter`; mọi API kiểm tra phiên với hai giá trị này.

## Xuất Excel
- Tab Hôm nay > **Xuất Excel** (theo bộ lọc ngành đang chọn): 4 sheet **Tổng hợp tháng** (chỉ tiêu, lũy kế, % mốc, dự báo, độ phủ, HTPP, SO...), **Báo cáo ngày** (từng ngày từng người), **Doanh số theo ngày** (ma trận người × ngày), **Cảnh báo** (của hệ thống và của AI).
- Tab Quản trị > **Xuất danh sách nhân sự**: sheet Nhân sự (vai trò, ngành, ASM, tỉnh, trạng thái) và sheet ASM. File không chứa số điện thoại, địa chỉ hay ngày sinh.

## Trợ lý AI cho ASM
**Cảnh báo tự động:** khi ASM mở trang (và khi số liệu hôm nay đổi, tối đa 1 lần / 10 phút) trang tự gửi số liệu đã tính cho AI. AI trả về cảnh báo theo mức khẩn / chú ý / thông tin, mỗi cảnh báo có lý do dẫn số liệu và việc nên làm (kèm nút Giao việc), cùng ưu tiên trong ngày. AI bổ sung cho các quy tắc cố định: xu hướng 3 ngày gần nhất, doanh số tốt nhưng độ phủ thấp, SO thấp so với doanh số nhập, ngày bất thường. Có nút tắt/bật tự phân tích. Kết quả được giữ trong phiên trình duyệt 30 phút để không gọi lại khi tải lại trang.
Dùng chung cấu hình AI của app (`AZURE_OPENAI_ENDPOINT/KEY/DEPLOYMENT`, hoặc `GROQ_API_KEY` dự phòng). Chỉ ASM/quản trị viên dùng được (`/api/asm/ai`, tối đa 20 lượt / 5 phút / người).
- Tab Hôm nay: **Ưu tiên hôm nay** (AI đọc số liệu cả nhóm, nêu việc nên làm trước).
- Hộp Giao việc: **AI soạn giúp** (từ ý chính của ASM + số liệu của SR).
- Tab Kế hoạch: **AI soạn trọng tâm cho cả nhóm**, ASM đọc và sửa trước khi gửi.
- Ngăn chi tiết SR: **AI nhận định** (điểm tốt, rủi ro, việc nên làm trong 2 ngày).
AI chỉ nhận số liệu đã tính (không gửi email, số điện thoại, địa chỉ) và được dặn không bịa tên đại lý, giá, model.

## Màu theo ngành
Ngành 2 giữ teal Livotec; Ngành 1 đổi toàn bộ sang xanh Karofi (thuộc tính `data-ng` trên thẻ html). Phần lớn CSS Ngành 1 được **sinh tự động** từ CSS gốc: sau khi sửa CSS trong `index.html`, chạy `python3 dev/gen-ng1-theme.py` để cập nhật. Mã màu Karofi chỉnh trong khối "Ngành 1: tông xanh thương hiệu Karofi" và hằng `SHIFT` của bộ sinh.

## Hai ngành
- **Ngành 1**: Karofi và Livotec máy lọc nước (hai nhóm chỉ tiêu: Karofi, Livotec).
- **Ngành 2**: Livotec gia dụng, không gồm máy lọc nước (bình nước nóng, gia dụng & điện máy).
Đổi ngành sẽ cất riêng số liệu ngành cũ và khôi phục khi quay lại. Khoá lưu nội bộ vẫn là `bn`/`gd`.

## Báo cáo cuối ngày (SR)
Lượt ghé, doanh số S.I từng nhóm, **HTPP**, **độ phủ** (số điểm bán mới phủ trong ngày), **số bán SO** (sản phẩm), ghi chú, cờ "cần ASM hỗ trợ". Chỉ khi bấm **Gửi báo cáo** ASM mới thấy; sửa lại sau khi gửi sẽ tự cập nhật.
ASM thấy thêm: chỉ tiêu/kế hoạch tháng và tối đa 5 cảnh báo. ASM không thấy nhận xét AI. SR không thấy số của nhau.

## Giả định cần xác nhận
HTPP là số đếm hằng ngày (ý nghĩa chính xác chưa xác nhận); SO là số sản phẩm sell-out; độ phủ tháng = tổng điểm bán mới phủ / tổng điểm bán trên tuyến (mục Địa bàn); giờ chốt báo cáo 19h (hằng số `DEADLINE` trong `asm/index.html`); giá niêm yết mặc định Ngành 1 là 7,5 triệu (SR tự sửa).

## Chạy thử trên máy
`ADMIN_EMAILS=boss@livotec.vn node dev/server.js`, rồi `node dev/seed-demo.js`, mở `/asm/` (asm@livotec.vn / matkhau123). Kiểm thử: `node dev/test-org.js` (cần server mới khởi động).
