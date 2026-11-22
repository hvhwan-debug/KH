// Ghép hình bên trái trang kết quả (kiemtra/tracuu-art.png): hình laptop + AI của trang chủ và chiếc cúp.
// Cúp: kiemtra/trophy-photo.webp. Chạy: NO_TARGET=1 OUT=/tmp/home-notarget.png node dev/gen-home-art.js && node dev/gen-side-art.js
const path = require("path");
const L = require(path.join(__dirname, "../api/node_modules/@napi-rs/canvas"));
(async () => {
  const home = await L.loadImage(process.env.BASE || "/tmp/home-notarget.png");
  const cup = await L.loadImage(path.join(__dirname, "../kiemtra/trophy-photo.webp"));
  const W = 1000, H = 860, cv = L.createCanvas(W, H), c = cv.getContext("2d");
  // laptop + AI (bản không có bia ngắm) rồi đặt cúp góc phải dưới
  c.drawImage(home, 0, 0, 1280, 1000, 0, 0, 1000, 781);
  c.drawImage(cup, 0, 0, cup.width, cup.height, 450, 300, 520, 520 * cup.height / cup.width);
  require("fs").writeFileSync(path.join(__dirname, "../kiemtra/tracuu-art.png"), await cv.encode("png"));
})();
