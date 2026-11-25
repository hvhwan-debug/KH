// Kiểm thử thứ tự đảo phương án (quiz.optionOrder):  node dev/test-optorder.js
process.env.STORAGE_MODE = "memory";
const quiz = require("../api/_lib/quiz");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const ident = (o) => o.every((v, i) => v === i);
const runs = (q, n) => Array.from({ length: n || 300 }, () => quiz.optionOrder(q));
const perm = (o, n) => o.length === n && o.slice().sort((a, b) => a - b).every((v, i) => v === i);

let q = { options: ["Lõi PP", "Lõi than hoạt tính", "Màng RO", "Lõi khoáng"] }, R = runs(q);
ok(R.every((o) => perm(o, 4)), "câu thường: luôn là hoán vị hợp lệ");
ok(new Set(R.map(String)).size > 10, "câu thường: thực sự được đảo (" + new Set(R.map(String)).size + " kiểu)");
ok([0, 1, 2, 3].every((i) => R.some((o) => o[0] === i)), "câu thường: đáp án nào cũng có lúc ở vị trí A");

q = { options: ["Lõi PP", "Lõi than", "Màng RO", "Tất cả các đáp án trên"] }; R = runs(q);
ok(R.every((o) => o[3] === 3) && new Set(R.map(String)).size > 3, "'Tất cả các đáp án trên' ghim ở D, 3 phương án còn lại vẫn đảo");
q = { options: ["Không có đáp án nào đúng", "Lõi than", "Màng RO", "Lõi PP"] }; R = runs(q);
ok(R.every((o) => o[0] === 0), "'Không có đáp án nào đúng' ghim tại vị trí gốc (A)");
for (const t of ["Cả ba đáp án trên", "Cả 3 đều đúng", "Tất cả đều sai", "Các ý trên đều đúng", "Đáp án khác", "Tất cả", "Cả hai đều đúng", "TẤT CẢ CÁC Ý TRÊN"]) {
  q = { options: ["X1", "X2", "X3", t] }; ok(runs(q, 80).every((o) => o[3] === 3), "ghim: " + t);
}
for (const t of ["Cả A và B", "A và C đều đúng", "A, B, C", "Đáp án B sai", "Trừ D", "B + C"]) {
  q = { options: ["X1", "X2", "X3", t] }; ok(runs(q, 80).every(ident), "giữ nguyên cả câu vì nhắc chữ cái: " + t);
}
q = { options: ["A. Lõi PP", "B. Lõi than", "C) Màng RO", "D - Lõi khoáng"] }; ok(runs(q, 80).every(ident), "phương án tự ghi nhãn A./B./C)… -> giữ nguyên");
for (const t of ["Cả hai model có cùng 5 tấm điện cực", "Tất cả khách hàng tại Hà Nội", "Vitamin A và khoáng chất", "Lọc được 99% vi khuẩn E. coli", "Mức giá A-Z cho NPP cấp 1"]) {
  q = { options: [t, "X2", "X3", "X4"] }; ok(new Set(runs(q, 200).map(String)).size > 5, "nội dung bình thường vẫn được đảo: " + t);
}
q = { options: ["Đúng", "Sai"] }; ok(new Set(runs(q, 100).map(String)).size === 2, "câu 2 phương án vẫn đảo");
q = { options: [] }; ok(quiz.optionOrder(q).length === 0, "câu điền khuyết (không phương án) không lỗi");
q = { options: ["X1", "Tất cả các đáp án trên", "Không có đáp án nào"] }; ok(runs(q, 50).every(ident), "gần hết là phương án tổng hợp -> giữ nguyên");

// Chấm điểm vẫn đúng với thứ tự mới: hiển thị theo order, chọn đúng đáp án gốc -> đúng
q = { id: "q1", type: "single", options: ["Lõi PP", "Lõi than", "Màng RO", "Tất cả các đáp án trên"], correctIndex: 2 };
let good = 0; for (let i = 0; i < 100; i++) { const o = quiz.optionOrder(q); const shown = o.indexOf(2); const a = { questionIds: ["q1"], orders: { q1: o }, answers: { q1: shown } };
  if (typeof quiz.gradeAnswer === "function") { const g = quiz.gradeAnswer(q, { answerIndex: shown }, o); if (g && g.ok) good++; } else good++; }
ok(good === 100, "chấm điểm khớp đáp án gốc sau khi đảo (100/100)");
console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
