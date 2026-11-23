# Giọng đọc hướng dẫn (màn đăng nhập / xác thực)

Các file `.mp3` ở đây được tạo tự động bởi `dev/gen-voice.py` từ danh sách câu trong `dev/voice-phrases.py`
(câu hướng dẫn, thông báo lỗi ở các màn đăng nhập và lỗi trả về từ các API đăng nhập). `index.json` ánh xạ câu → file.

Trang luôn ưu tiên các file này để mọi máy nghe cùng một giọng, kể cả máy không có giọng tiếng Việt (Chrome trên Windows).

Sau khi thêm hoặc sửa câu hướng dẫn/thông báo: chạy lại `python3 dev/gen-voice.py` (chỉ tạo file cho câu mới).
Muốn thay bằng giọng thu âm thật: ghi đè file `.mp3` cùng tên (tra tên file trong `index.json`).

Giọng tổng hợp: Piper `vi_VN-vais1000-medium`, huấn luyện trên bộ dữ liệu VAIS-1000
(https://ieee-dataport.org/documents/vais-1000-vietnamese-speech-synthesis-corpus), giấy phép CC BY 4.0.
