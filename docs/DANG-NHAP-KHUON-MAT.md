# Đăng nhập bằng khuôn mặt (trang /kiemtra)

Nhân viên đã có dữ liệu khuôn mặt trên hệ thống chỉ cần quét mặt ở màn "Xác thực thí sinh": hệ thống nhận diện, tự điền mã nhân viên + email và hiện thông tin xác nhận như khi nhập tay. Lần đầu (chưa có dữ liệu) hoặc không nhận diện được thì nhập mã nhân viên + email như bình thường.

## Cách hoạt động
1. Trình duyệt chụp ảnh trong màn quét AI, kiểm tra tại máy (một khuôn mặt, đủ sáng, đủ lớn).
2. `POST /api/kt-facelogin`: máy chủ kiểm tra **thử thách quay mặt** (lớp chống ảnh giả chính, xem bên dưới) và nhờ AI nhìn ảnh để loại ảnh nghi chụp lại màn hình (nếu dịch vụ AI không trả lời thì vẫn đăng nhập được nhờ thử thách quay mặt; chỉ khi `FACE_LIVENESS=off` mới bắt buộc AI phải xác nhận), tính "dấu vân" 128 số rồi tìm trong thư viện khuôn mặt (`api/_lib/facegallery.js`).
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

## Cảnh báo "người làm bài khác với các lần trước"
Ngay lúc **bắt đầu làm bài** (`/api/kt-start`, tạo bài mới), hệ thống so khuôn mặt vừa chụp với ảnh các lần làm bài trước của **chính tài khoản đó** (`api/_lib/startid.js` + `faceid.check`, đối chiếu 1-1, ngưỡng `FACE_MATCH_MAX`, mặc định 0,55).

Khi khuôn mặt **khác**:
1. Gửi email cho `ADMIN_EMAILS` kèm **ảnh các lần trước** và **ảnh người vừa bắt đầu** để đối chiếu bằng mắt; tối đa 1 email / 10 phút cho mỗi mã nhân viên, các lần còn lại vẫn ghi vào sổ cảnh báo (`kt/security-alerts.json`, `kind: identity`).
2. Bài làm được gắn `faceId.s = "mismatch"` ngay từ đầu, hiện nhãn **"Khuôn mặt khác các lần trước"** trong trang quản trị (lúc nộp bài không đối chiếu lại).
3. Nhân viên thấy cảnh báo ở màn quét (bước "Đối chiếu với ảnh các lần trước" báo ✗) và một dòng thông báo ở đầu màn làm bài (tự ẩn sau 20 giây, có nút đóng).

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `FACE_IDENTITY` | `warn` | `warn` = cảnh báo, vẫn cho làm bài · `block` = chặn không cho bắt đầu làm bài (vẫn gửi email) · `off` = tắt |

Không cảnh báo khi: chưa có ảnh trước (lần đầu của tài khoản đó, ảnh này thành ảnh gốc); tài khoản thử nghiệm; quá thời gian chờ 12 giây (lượt quét sau khi nộp bài sẽ đối chiếu như cũ); làm tiếp bài đang dở.

### Giới hạn cần biết
- **Ảnh gốc là ảnh của lần làm bài đầu tiên.** Nếu người làm hộ là người làm bài lần đầu thì các lần sau chính chủ mới bị báo "khác người". Quản trị viên nên kiểm tra ảnh gốc của các tài khoản quan trọng.
- Có thể báo nhầm khi ánh sáng, kính, khẩu trang, kiểu tóc thay đổi nhiều. Vì vậy mặc định chỉ cảnh báo, không chặn; nên so ảnh bằng mắt trong email trước khi kết luận.
- Ảnh chụp lúc làm bài (nay có thử thách quay mặt) là ảnh lưu làm minh chứng; ảnh vừa quét chỉ có trong email gửi quản trị viên cùng với ảnh các lần trước.

## Nạp dữ liệu khuôn mặt cho nhân viên hiện có
Thư viện chỉ có người sau khi bài làm của họ được đối chiếu ("match"/"first"). Với bài làm **trước khi** có tính năng này, cần nạp một lần:

1. Đăng nhập trang quản trị bằng tài khoản quản trị viên.
2. Mở `https://<tên-miền>/api/kt-facegallery?run=1` trong cùng trình duyệt. Mỗi lần chạy xử lý một đợt (~30 giây) và trả về `scan.left` / `backfill.left`; **mở lại (F5) cho tới khi hai số này bằng 0**.
3. Xem một người đã có chưa: `.../api/kt-facegallery?code=<mã nhân viên>`; xem tổng: `.../api/kt-facegallery` (chỉ trả số liệu, không trả ảnh hay dấu vân).

Nhân viên **chưa có bài làm nào** thì không có dữ liệu để nhận diện: lần đầu họ nhập mã nhân viên + email, ảnh chụp lúc bắt đầu làm bài sẽ được đưa vào thư viện (nếu qua thử thách quay mặt và không bị đánh dấu khác người).

## Âm thanh ở màn quét khuôn mặt
Màn quét (làm bài và đăng nhập bằng khuôn mặt) có âm thanh để nhân viên nhận biết hệ thống đang làm gì. Âm thanh được **tổng hợp ngay trong trình duyệt** (Web Audio), không có tệp âm thanh nào để tải.

| Thời điểm | Âm thanh |
|---|---|
| Camera sẵn sàng | một tiếng "tít" nhẹ |
| Khoá được khuôn mặt | hai nốt đi lên |
| Có hướng dẫn mới (nhìn thẳng / quay trái / quay phải) | hai nốt báo hiệu + **giọng đọc tiếng Việt** |
| Đang giữ đúng tư thế | các tiếng tít cao dần |
| Chụp được một tư thế | tiếng "tách" màn trập |
| Đang phân tích / xác minh | tiếng quét lặp theo nhịp tia quét |
| Thành công | chuông 4 nốt (đăng nhập thành công có thêm giọng chào tên) |
| Không đạt | hai tiếng trầm |
| Khuôn mặt khác lần trước | hai nốt cảnh báo + giọng đọc |

- Nút loa ở góc trên bên phải thẻ bật/tắt toàn bộ âm thanh; lựa chọn được nhớ trên máy (`localStorage`, khoá `kt_snd`).
- Trình duyệt chỉ cho phát tiếng sau một thao tác của người dùng; màn quét luôn mở sau khi bấm nút nên không bị chặn. iPhone để chế độ im lặng sẽ không nghe thấy.
- Giọng đọc chỉ hoạt động khi thiết bị có sẵn giọng tiếng Việt (Chrome/Edge trên Windows thường có, một số điện thoại cần cài giọng); không có thì chỉ phát âm báo, **không đọc tiếng Việt bằng giọng nước ngoài**.
- Không có âm thanh ở màn làm bài.

### Kiểu âm thanh ("ting" công nghệ)
- Mỗi tiếng là một **chuông thuỷ tinh** tổng hợp: nốt chính cộng các hoạ âm lệch (×2,76 / ×5,4 / ×8,93) vào âm rất gắt rồi ngân tắt dần; chỉ dùng sóng sin nên không có tiếng thô.
- Các tiếng đi qua một bộ nén nhẹ (nhiều âm chồng nhau không chói) và một vang dội ngắn có lọc để tiếng "ngân" mượt.
- Các bước kiểm tra đạt dùng thang ngũ cung (C6 D6 E6 G6 A6 C7) nên "ting" cao dần theo từng bước và luôn hợp tông. Tiếng lỗi/cảnh báo là hai nốt trầm êm đi xuống, không chói.
- Muốn chỉnh: âm lượng chung ở `sndOut` (`master.gain.value`), nốt và độ ngân ở các hàm `snd*` trong `kiemtra/index.html`.

## Chẩn đoán khi một người không qua được bước đối chiếu khuôn mặt
Bước **bắt đầu làm bài** chỉ kiểm tra "có một khuôn mặt người thật" và (nếu khác lần trước) cảnh báo, **không chặn**; còn **tra cứu lịch sử**, **xem lại đề** và **đăng nhập bằng khuôn mặt** là cổng chặn: khuôn mặt vừa quét phải khớp với ảnh đã lưu của mã đó. Vì vậy "vào được bài thi" không có nghĩa là hệ thống đã nhận ra người đó.

Nguyên nhân thường gặp khi bị từ chối: (1) trong các ảnh đã lưu của mã có ảnh **không phải chủ tài khoản** (ví dụ thử bằng ảnh điện thoại, hoặc người khác làm hộ ở lần đầu); (2) tra cứu đang **bị khoá** (khoá 24 giờ sau 3 lần quét đáng ngờ); (3) mã chưa có ảnh nào; (4) ánh sáng / góc mặt khác nhiều.

Xem và xử lý (quản trị viên, đang đăng nhập): mở `https://<tên-miền>/api/kt-facegallery?code=<mã nhân viên>&view=1`
- Trang hiện các ảnh gần nhất của mã, ảnh nào **đang dùng để đối chiếu** (khung xanh, tối đa 3 ảnh gần nhất chưa bị đánh dấu "khác người"), tình trạng khoá và số dấu vân trong thư viện.
- **Loại ảnh này**: ảnh không phải chủ tài khoản không còn dùng để đối chiếu và bị gỡ khỏi thư viện đăng nhập bằng khuôn mặt (có thể bấm **Dùng lại**). Nếu loại hết, lần làm bài kế tiếp thành ảnh gốc mới.
- **Mở khoá tra cứu**, **Xoá thư viện khuôn mặt của mã này**.
- Mọi thao tác được ghi vào nhật ký quản trị; mỗi lần xem ảnh được ghi vào sổ truy cập ảnh.
- Lý do từ chối từng lần quét nằm trong **nhật ký thao tác**, mục "Thí sinh tra cứu lịch sử bài kiểm tra (đối chiếu khuôn mặt)": `face:mismatch` (không khớp, kèm độ lệch), `locked` (bị khoá), `face:noref` (chưa có ảnh), `live` (ảnh nghi chụp lại màn hình).

> Đã sửa một lỗi có sẵn: kết quả quét khuôn mặt chạy nền trước đây không bao giờ được ghi vào chỉ mục bài làm (hàm `patchIndex` bị khai báo hai lần, bản sau đè bản trước), nên mỗi lượt `/api/kt-facegallery?run=1` cứ xử lý lại những bài cũ nhất mà không tiến lên. Từ bản này, `scan.left` giảm dần qua các lượt; nhãn "Khuôn mặt khác các lần trước" trong trang quản trị cũng hiện đủ cho các bài quét nền.
