// Chấm câu điền khuyết nhiều chỗ trống (mỗi chỗ một dòng đáp án, hoặc cả cụm trên một dòng ngăn bằng /):  node dev/test-fill-multi.js
process.env.STORAGE_MODE = "memory";
const quiz = require("../api/_lib/quiz");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const g = (q, t) => quiz.gradeAnswer(q, { text: t }, null).ok;
const two = { type: "fill", text: "Công nghệ ................ của Karofi, tiết kiệm đến ..................%", accepted: ["độc quyền", "71"] };
ok(g(two, "độc quyền / 71"), "2 chỗ, 2 dòng đáp án: 'độc quyền / 71' đúng");
ok(g(two, "Độc quyền, 71") && g(two, "độc quyền;71"), "ngăn bằng , hoặc ; cũng đúng, không phân biệt hoa thường");
ok(!g(two, "độc quyền") && !g(two, "71") && !g(two, "71 / độc quyền") && !g(two, "độc quyền / "), "thiếu chỗ, sai thứ tự hoặc bỏ trống một chỗ -> sai");
const one = { type: "fill", text: "Điện áp ..... V", accepted: ["220", "220 V"] };
ok(g(one, "220") && g(one, "220 V"), "1 chỗ trống: các dòng là cách viết khác nhau, vẫn đúng như cũ");
const line = { type: "fill", text: "Giá trị ... và ...", accepted: ["độc quyền / 71"] };
ok(g(line, "độc quyền, 71") && g(line, "độc quyền / 71") && !g(line, "độc quyền"), "nhập cả cụm trên một dòng: vẫn đúng, thiếu chỗ thì sai");
console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
