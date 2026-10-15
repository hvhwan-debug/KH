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

## Dọn dữ liệu hàng loạt (chỉ quản trị viên, nguy hiểm)
Tab Quản trị, cuối trang, thẻ viền đỏ: chọn các ASM **giữ lại** (kèm toàn bộ nhân sự thuộc ASM đó) > **Xem trước** (số lượng + tên) > **Tải bản sao lưu JSON** > gõ `XOA HET` > **Xoá vĩnh viễn**. Luôn giữ: chính bạn và các email trong `ADMIN_EMAILS`. Máy chủ tính lại danh sách khi xoá và từ chối nếu khác bản xem trước. Ghi vào Nhật ký thao tác. Nhân sự chưa được gán đúng ASM giữ lại sẽ bị xoá, nên gán trước khi xoá.

## Xuất Excel
File có định dạng sẵn: tiêu đề và ghi chú, hàng nhóm cột, tiêu đề màu, kẻ viền + kẻ sọc, cố định hàng tiêu đề và cột họ tên, bộ lọc, tô màu theo mức đạt (xanh ≥90%, vàng 70–90%, đỏ <70% ở cột % so với mốc và dự báo), hàng tổng, ma trận doanh số theo ngày dạng bản đồ nhiệt, khổ in ngang vừa 1 trang. Cột % và tổng là **công thức thật**. Dùng thư viện ExcelJS (tải từ cdnjs).
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
Ngành 2 giữ teal Livotec; Ngành 1 đổi toàn bộ sang xanh Karofi, lấy từ logo (#25A8E1) (thuộc tính `data-ng` trên thẻ html). Phần lớn CSS Ngành 1 được **sinh tự động** từ CSS gốc: sau khi sửa CSS trong `index.html`, chạy `python3 dev/gen-ng1-theme.py` để cập nhật. Mã màu Karofi chỉnh trong khối "Ngành 1: tông xanh thương hiệu Karofi" và hằng `SHIFT` của bộ sinh.

## Hai ngành
- **Ngành 1**: Karofi và Livotec máy lọc nước (hai nhóm chỉ tiêu: Karofi, Livotec).
- **Ngành 2**: Livotec gia dụng, không gồm máy lọc nước (bình nước nóng, gia dụng & điện máy).
Đổi ngành sẽ cất riêng số liệu ngành cũ và khôi phục khi quay lại. Khoá lưu nội bộ vẫn là `bn`/`gd`.

## Số của SR và ASM khớp nhau như thế nào
Bảng kế hoạch theo tuần của SR có 2 nguồn số thực tế: ô trắng **nhập tay theo tuần**, ô xám **tự cộng từ nhật ký ngày**. App gửi cả bảng tuần lên ASM nên:
- Tuần nhập tay: ASM thấy đúng số đó, ghi **"Nhập theo tuần"**, không bị tính là quên báo cáo.
- Tuần có nhật ký ngày: ASM cộng các ngày **đã gửi**. Ngày đã nhập mà chưa gửi hiện thành **"Chưa gửi: X tr"** ở cả ASM và SR (SR có nút **Gửi tất cả**), để hai bên không lệch mà không biết.

## Báo cáo cuối ngày (SR)
Lượt ghé, doanh số S.I từng nhóm, **HTPP**, **độ phủ** (số điểm bán mới phủ trong ngày), **số bán SO** (sản phẩm), ghi chú, cờ "cần ASM hỗ trợ". Chỉ khi bấm **Gửi báo cáo** ASM mới thấy; sửa lại sau khi gửi sẽ tự cập nhật.
ASM thấy thêm: chỉ tiêu/kế hoạch tháng và tối đa 5 cảnh báo. ASM không thấy nhận xét AI. SR không thấy số của nhau.

## Giả định cần xác nhận
HTPP là số đếm hằng ngày (ý nghĩa chính xác chưa xác nhận); SO là số sản phẩm sell-out; độ phủ tháng = tổng điểm bán mới phủ / tổng điểm bán trên tuyến (mục Địa bàn); giờ chốt báo cáo 19h (hằng số `DEADLINE` trong `asm/index.html`); giá niêm yết mặc định Ngành 1 là 7,5 triệu (SR tự sửa).

## Chạy thử trên máy
`ADMIN_EMAILS=boss@livotec.vn node dev/server.js`, rồi `node dev/seed-demo.js`, mở `/asm/` (asm@livotec.vn / matkhau123). Kiểm thử: `node dev/test-org.js` (cần server mới khởi động).

## Nhắc việc qua email và Zalo (ASM)
Mọi nơi giao việc (nút **Giao việc** ở từng người, **Giao việc cả nhóm**, chọn nhiều người trong bảng, nút **Nhắc n người chưa gửi báo cáo**) đều mở cùng một hộp thoại có mục **Kênh gửi**:
- **Trong app**: luôn gửi, nhân sự thấy ở mục "Việc ASM giao cho bạn".
- **Gửi kèm email**: máy chủ gửi thư tới email công ty của nhân sự (chỉ người thuộc nhóm của ASM). Tối đa **60 email/ngày/ASM**, nội dung bị thoát HTML, `Reply-To` là email ASM. Cần cấu hình SMTP (`SMTP_HOST`, `SMTP_FROM`...); nếu chưa cấu hình, hệ thống báo "chưa cấu hình SMTP" thay vì gửi lỗi. Lựa chọn bật/tắt email được nhớ cho lần sau.
- **Nhắn Zalo**: Zalo không cho điền sẵn nội dung và việc gửi tự động cần tài khoản Zalo OA, nên nút này **sao chép tin nhắn** ("Chào <tên>, <nội dung> — ASM <tên ASM>") rồi mở `https://zalo.me/<số điện thoại>`; ASM dán vào ô chat và gửi. Số Zalo của từng người chỉ lưu trong trình duyệt của ASM (localStorage), **không gửi lên máy chủ**.

Kiểm thử: `node dev/test-email.js` (sau `dev/seed-demo.js`) và `node dev/test-scope.js` (phân quyền).

## Quản trị viên tạo thành viên trực tiếp
Tab Quản trị › **Thành viên** › nút **＋ Thêm thành viên**: chọn vai trò rồi nhập thông tin.
- **SR**: email, họ tên, ngành, ASM phụ trách (có thể để trống rồi gán sau), tỉnh/thành. SR được gán ASM sẽ bị khoá ASM (không tự đổi).
- **ASM**: email, họ tên, ngành phụ trách (một hoặc hai), tỉnh/thành phụ trách. ASM chỉ thấy và giao việc cho nhân sự của chính mình.
- **Mật khẩu tạm**: để trống thì hệ thống tự tạo mật khẩu ngẫu nhiên 10 ký tự và **chỉ hiện một lần** sau khi tạo (kèm nút sao chép tin nhắn đăng nhập để gửi qua Zalo). Có thể tự đặt mật khẩu (từ 8 ký tự). Tài khoản tạo bằng cách này đã xác minh sẵn, đăng nhập không cần mã OTP.
- Email phải thuộc tên miền được phép (`ALLOWED_EMAILS` / `ALLOWED_EMAIL_DOMAINS`). Nếu người đó đã có tài khoản, thao tác này chỉ **đổi vai trò / gán lại** (đổi SR thành ASM sẽ bỏ hồ sơ SR), không tạo trùng.
- Quản trị viên cao nhất vẫn chỉ đặt bằng `ADMIN_EMAILS`. Mọi thao tác ghi vào Nhật ký.

Kiểm thử: `node dev/test-create.js`.

## Quy mô lớn (hàng nghìn nhân sự)
Thiết kế chịu được >10.000 nhân sự (đã đo bằng `node dev/test-scale.js`):
- **Máy chủ**: danh sách hồ sơ đọc từ một file chỉ mục (`org/pindex.json`, bộ nhớ đệm 15 giây, tự dựng lại sau 6 giờ) thay vì mở từng hồ sơ; `/api/team` lọc, tìm kiếm và **phân trang phía máy chủ** (tối đa 200 người/lần), chỉ mở báo cáo của người trong trang; đọc song song. Một ASM chỉ phải đọc dữ liệu của nhóm mình (≈ 70 lần đọc thay vì 10.000+).
- **Tab Nhân sự**: khi một phạm vi có hơn 200 người (thường chỉ là quản trị viên chọn "Tất cả ASM") bảng tự chuyển sang chế độ **chia trang 50 người/trang, tìm kiếm trên toàn bộ dữ liệu**, và hiện **Tổng quan theo ASM** để chọn một ASM xem đầy đủ số liệu, thực đạt so với chỉ tiêu và giao việc. Các tab tổng hợp có dòng cảnh báo số liệu chỉ tính trên phần đã tải.
- **Giao việc**: tối đa **500 người/lần** (chọn một ASM, một ngành hoặc chia đợt). Email tối đa 60/ngày/ASM.
- **Tab Quản trị › Thành viên**: bảng chia trang 50 dòng. Với trên vài nghìn tài khoản, lần mở đầu tab này còn chậm vì đọc hồ sơ tài khoản (đã song song); nếu cần hơn nữa nên bổ sung phân trang phía máy chủ cho `/api/org`.
- Thử giao diện với dữ liệu lớn: `node dev/start-big.js 10001 300` rồi mở `/asm/index.html`.

## Gán tỉnh / thành phố (chọn từ danh sách, không gõ tay)
- **ASM** gán tỉnh cho nhân sự **thuộc nhóm của mình** ở tab **Nhân sự**: mỗi dòng có ô chọn tỉnh (lưu ngay khi chọn). Chọn nhiều người rồi bấm **📍 Gán tỉnh** để gán một tỉnh cho cả nhóm đã chọn. Trên điện thoại chọn tỉnh trong ngăn **Chi tiết**.
- **Quản trị viên** chọn tỉnh bằng ô chọn ở mọi nơi: thêm thành viên, sửa thông tin, tạo trước, và **chọn nhiều tỉnh phụ trách cho ASM** (thẻ tỉnh, bấm ✕ để bỏ).
- Danh sách là 63 tỉnh/thành, **dùng chung** với app nhân viên (`PROVINCES`) để mùa vụ và gợi ý ASM theo tỉnh luôn khớp. Máy chủ cũng kiểm tra: tỉnh ngoài danh sách bị từ chối; tên viết khác (không dấu, "TP. Hồ Chí Minh", "Tỉnh Đắk Nông") được chuẩn hoá về tên chuẩn. Dữ liệu cũ gõ tay không nhận ra được vẫn giữ nguyên và hiện nhãn "nhập tay, hãy chọn lại".
- Nhập Excel nhân sự vẫn giữ nguyên giá trị tỉnh trong file nếu không nhận ra (để không mất dữ liệu).
- Kiểm thử: `node dev/test-province.js` (gồm kiểm tra ba danh sách tỉnh khớp nhau).

## Tab Tổng quan (trang đầu tiên)
Nhìn một lần biết cả tháng đang thế nào:
- **Dòng kết luận** có màu (xanh đúng nhịp / vàng hơi chậm / đỏ tụt tiến độ) kèm: đã đạt, mốc hôm nay, số tr/ngày còn cần và dự báo cuối tháng.
- **4 đồng hồ**: Thực đạt/chỉ tiêu, So với mốc hôm nay, Dự báo cuối tháng, Báo cáo hôm nay.
- **Biểu đồ nhịp cả tháng**: kế hoạch, thực tế và **đường dự báo** nếu giữ nhịp hiện tại.
- **Mức đạt của nhân sự**: thanh chia theo ≥ 90% / 70–90% / dưới 70% / chưa có mốc; chạm để mở danh sách đã lọc ở tab Nhân sự.
- **Theo ngành và nhóm hàng**, **theo tỉnh/thành** (có cảnh báo số người chưa gán tỉnh), **việc cần xử lý** (giao việc ngay), **nổi bật & cần chú ý**.
- Chưa có nhân sự: hiện **hướng dẫn bắt đầu** và nút sao chép tin nhắn gửi nhân sự. Quản trị viên xem "Tất cả ASM" với quá nhiều người sẽ thấy bảng tổng quan theo ASM để chọn.

