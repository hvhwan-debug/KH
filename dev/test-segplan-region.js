// Kiểm thử chia đề theo ngành × miền:  node dev/test-segplan-region.js
process.env.STORAGE_MODE = "memory";
const quiz = require("../api/_lib/quiz");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const R = (cat, n) => [{ category: cat, count: n }];
const S = (sp) => ({ segmentPlans: quiz.cleanSegmentPlans(sp) });
// Ngành chung 2 miền
let s = S({ may_loc: R("A", 5) });
ok(quiz.segPlanFor(s, "may_loc", "bac")[0].category === "A" && quiz.segPlanFor(s, "may_loc", "nam")[0].category === "A", "đề chung: Bắc và Nam cùng đề của ngành");
ok(quiz.segPlanFor(s, "gia_dung", "bac") === null, "ngành chưa phân bổ: cách chia cũ");
// Ngành tách miền
s = S({ may_loc_bac: R("B", 5), may_loc_nam: R("N", 6), gia_dung: R("G", 3) });
ok(quiz.segPlanFor(s, "may_loc", "bac")[0].category === "B", "tách miền: máy lọc Miền Bắc nhận đề Bắc");
ok(quiz.segPlanFor(s, "may_loc", "nam")[0].category === "N", "tách miền: máy lọc Miền Nam nhận đề Nam");
ok(quiz.segPlanFor(s, "gia_dung", "bac")[0].category === "G", "miền KHÔNG đè ngành khác: gia dụng Miền Bắc vẫn nhận đề gia dụng");
ok(quiz.countFor(s, "may_loc", "nam") === 6, "số câu theo đúng ô ngành × miền");
// Kiểu cũ vẫn chạy như trước
s = S({ both: R("X", 2), mien_bac: R("MB", 4) });
ok(quiz.segPlanFor(s, "both", "bac")[0].category === "MB" && quiz.segPlanFor(s, "both", "nam")[0].category === "X", "dữ liệu kiểu cũ (mien_bac) giữ nguyên cách phát đề");
ok(!quiz.cleanSegmentPlans({ both_bac: R("A", 2), both_nam: R("A", 2) }).error, "lưu được khoá ngành_miền");
// Rút câu đúng miền
const qs = [];
for (let i = 0; i < 5; i++) qs.push({ id: "b" + i, text: "b" + i, category: "Máy lọc nước Miền Bắc", options: ["a", "b"], correctIndex: 0, active: true });
for (let i = 0; i < 5; i++) qs.push({ id: "n" + i, text: "n" + i, category: "Máy lọc nước Miền Nam", options: ["a", "b"], correctIndex: 0, active: true });
s = Object.assign(S({ may_loc_bac: R("Máy lọc nước Miền Bắc", 5), may_loc_nam: R("Máy lọc nước Miền Nam", 5) }), { examPeriod: "" });
const pb = quiz.planExam(qs, s, "may_loc", "bac"), pn = quiz.planExam(qs, s, "may_loc", "nam");
ok(pb.picked.length === 5 && pb.picked.every((q) => q.id[0] === "b"), "đề Bắc rút đủ 5 câu Miền Bắc");
ok(pn.picked.length === 5 && pn.picked.every((q) => q.id[0] === "n"), "đề Nam rút đủ 5 câu Miền Nam");
console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
