Nhận dạng chữ (OCR) cho tài liệu scan, chạy trên trình duyệt của người dùng (ảnh không gửi đi đâu).
- tesseract.min.js, worker.min.js : tesseract.js 5.1.1 (Apache-2.0) https://github.com/naptha/tesseract.js
- tesseract-core-lstm.wasm.js, tesseract-core-simd-lstm.wasm.js : tesseract.js-core 5.1.1 (Apache-2.0), bản LSTM, có/không SIMD
- vie.traineddata : dữ liệu tiếng Việt, mô hình "tessdata_fast" của Tesseract OCR (Apache-2.0) https://github.com/tesseract-ocr/tessdata_fast
Được nạp bởi kiemtra/docread.js (DocRead.ocrBase).
