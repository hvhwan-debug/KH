# Trang quản lý ASM và hai ngành hàng

## Thiết lập một lần
1. Trong Azure Static Web Apps > Configuration, đặt `ADMIN_EMAILS` = email quản trị (nhiều email cách nhau bằng dấu phẩy).
2. Quản trị viên đăng nhập, mở `/asm/` > tab **Quản trị** > thêm từng ASM (email phải thuộc tên miền đã cho phép dùng ứng dụng).
3. SR mở app, bấm **Thiết lập > Đổi** (hoặc thẻ "Hoàn tất hồ sơ"), chọn ngành và ASM. Quản trị viên có thể gán/khoá ASM và đổi ngành cho SR.

## Quản trị (tab Quản trị trên /asm/)
- **Cấp vai trò**: chọn SR hoặc ASM cho từng thành viên. Quản trị viên cao nhất đặt trong `ADMIN_EMAILS`.
- **ASM phụ trách ngành nào, tỉnh/thành nào**: nút Sửa ở mỗi ASM. SR chỉ chọn được ASM đúng ngành của mình; nhập tỉnh thì app gợi ý ASM phụ trách tỉnh đó (chỉ khi chưa chọn ASM).
- **Tạo trước thành viên**: khai báo email + ngành + ASM + tỉnh, người đó đăng nhập app lần đầu sẽ tự có hồ sơ (ASM bị khoá).
- **Giao việc**: ở tab Hôm nay, ASM/quản trị viên giao việc cho một người, một ngành hoặc cả nhóm.

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
