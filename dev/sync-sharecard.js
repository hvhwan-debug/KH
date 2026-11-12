// Sinh api/_lib/sharecard-draw.js từ khối /*<share-card>*/ … /*</share-card>*/ trong kiemtra/index.html,
// để THẺ KẾT QUẢ dựng ở máy chủ (đính kèm email) luôn y hệt thẻ trên trang. KHÔNG sửa tay file được sinh ra.
//   node dev/sync-sharecard.js          ghi lại file
//   node dev/sync-sharecard.js --check  chỉ so khớp (thoát mã 1 nếu lệch) — chạy trước khi commit khi có sửa giao diện thẻ
const fs = require("fs"), path = require("path");
const SRC = path.join(__dirname, "..", "kiemtra", "index.html"), OUT = path.join(__dirname, "..", "api", "_lib", "sharecard-draw.js");
const html = fs.readFileSync(SRC, "utf8");
const a = html.indexOf("/*<share-card>*/"), b = html.indexOf("/*</share-card>*/");
if (a < 0 || b < a) { console.error("Không thấy khối <share-card> trong index.html"); process.exit(2); }
let block = html.slice(a + "/*<share-card>*/".length, b);
// Hàm phụ ngoài khối thẻ nhưng thẻ có gọi: lấy nguyên văn từ index.html (khớp ngoặc nhọn) để không bao giờ lệch
const HELPERS = ["scoreTierClass"];
function grab(name) {
  const i = html.indexOf("function " + name + "(");
  if (i < 0) { console.error("Không thấy hàm " + name + " trong index.html"); process.exit(2); }
  let j = html.indexOf("{", i), depth = 0, k = j;
  for (; k < html.length; k++) { const ch = html[k]; if (ch === "{") depth++; else if (ch === "}" && --depth === 0) break; }
  return "  " + html.slice(i, k + 1).replace(/\n/g, "\n  ") + "\n";
}
const helpers = HELPERS.map(grab).join("");
const CTX = "document.createElement('canvas').getContext('2d')";
if (block.split(CTX).length !== 2) { console.error("Khối thẻ phải có đúng 1 chỗ tạo canvas đo chữ (" + CTX + ")"); process.exit(2); }
block = block.replace(CTX, "MK()");
if (/\b(document|window|location)\./.test(block)) { console.error("Khối thẻ còn dùng document/window/location — không chạy được ở máy chủ"); process.exit(2); }
const out = "// TỰ SINH bởi dev/sync-sharecard.js từ khối <share-card> của kiemtra/index.html. KHÔNG sửa tay (sửa ở index.html rồi chạy lại script).\n" +
  "// MK() trả về một context 2D rỗng dùng để đo chữ.\n" +
  "module.exports = function (MK) {\n" + helpers + block.replace(/\s+$/, "") + "\n  return { SC: SC, height: shareCardHeight, draw: drawShareCard };\n};\n";
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (cur !== out) { console.error("LỆCH: thẻ ở máy chủ khác index.html. Chạy: node dev/sync-sharecard.js"); process.exit(1); }
  console.log("Khớp."); process.exit(0);
}
fs.writeFileSync(OUT, out); console.log("Đã ghi " + path.relative(process.cwd(), OUT) + " (" + out.length + " ký tự)");
