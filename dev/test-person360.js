// Kiểm thử nhận định đa chiều cho một nhân sự (_lib/person360).  node dev/test-person360.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
process.env.ADMIN_EMAILS = "admin@x.vn";
const quiz = require("../api/_lib/quiz"), store = require("../api/_lib/store"), P = require("../api/_lib/person360");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const DAY = 864e5, now = Date.now();
let seq = 0;
async function attempt(code, period, t, cats) { // cats: { "Tên mảng": [đúng, tổng] }
  const paper = []; Object.keys(cats).forEach((c) => { const [k, n] = cats[c]; for (let i = 0; i < n; i++) paper.push({ n: paper.length + 1, category: c, ok: i < k, chosen: 0 }); });
  const okN = paper.filter((q) => q.ok).length, id = "a" + (++seq);
  await quiz.putAttempt({ id, code, period, status: "submitted", paper, score: okN, total: paper.length, pct: Math.round(1000 * okN / paper.length) / 10, startedAt: t - 600000, submittedAt: t, secondsPerQuestion: 60 });
  return { id, code, period, status: "submitted", pct: Math.round(1000 * okN / paper.length) / 10, score: okN, total: paper.length, submittedAt: t };
}
(async () => {
  const C = [], idx = [];
  // Đội Loan (8 người, kiến thức bình thường); Đội Hùng (6 người, cả đội thấp)
  for (let i = 0; i < 8; i++) C.push({ code: "L" + i, name: "Loan " + i, email: "l" + i + "@x.vn", manager: "Loan", segment: "may_loc", title: "PC" });
  for (let i = 0; i < 6; i++) C.push({ code: "H" + i, name: "Hùng " + i, email: "h" + i + "@x.vn", manager: "Hùng", segment: "may_loc", title: "PC" });
  await quiz.saveCandidates(C);
  for (let i = 0; i < 8; i++) for (let k = 0; k < 3; k++) idx.push(await attempt("L" + i, "K" + k, now - (90 - k * 30) * DAY,
    i === 0 ? { "Máy lọc nước RO": [10, 10], "Kỹ năng tư vấn bán hàng": [10, 10], "Chính sách bảo hành": [3, 8] } // L0: giỏi sản phẩm, yếu chính sách RIÊNG
            : { "Máy lọc nước RO": [7, 10], "Kỹ năng tư vấn bán hàng": [7, 10], "Chính sách bảo hành": [7, 8] }));
  for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) idx.push(await attempt("H" + i, "K" + k, now - (90 - k * 30) * DAY, { "Máy lọc nước RO": [5, 10], "Kỹ năng tư vấn bán hàng": [5, 10], "Chính sách bảo hành": [4, 8] }));
  await quiz.saveIndex(idx);
  // Số bán: L0 kiến thức tốt nhưng bán 60%; đội Loan bán ~105%
  const months = ["2026-08", "2026-09", "2026-10"];
  for (const m of months) await store.put("kt/sales/" + m + ".json", { month: m, rows: C.map((c) => ({ code: c.code, target: 100, actual: c.code === "L0" ? 60 : c.manager === "Loan" ? 105 : 80 })) });

  let r = await P.analyze("L0", { refresh: true });
  ok(r.ok && r.lenses.length === 7, "có đủ 7 góc nhìn");
  const L = (id) => r.lenses.find((x) => x.id === id);
  ok(/RIÊNG/.test(L("areas").insight) && /Chính sách/.test(L("areas").insight), "phát hiện lỗ hổng RIÊNG ở chính sách: " + L("areas").insight.slice(0, 120));
  ok(/KỸ NĂNG BÁN/.test(L("sales").insight), "kiến thức tốt + bán kém, đội bán tốt -> kỹ năng bán");
  ok(r.hypotheses[0] && r.hypotheses[0].id === "skill" && r.hypotheses.some((h) => h.id === "gap"), "chẩn đoán chính: " + (r.hypotheses[0] || {}).title);
  ok(r.questions.length >= 2 && r.plan.length >= 2, "có câu hỏi 1-1 và kế hoạch có chỉ số");
  ok(r.plan.every((x) => x.kpi && x.who && x.when), "kế hoạch đủ người làm, thời hạn, chỉ số");

  r = await P.analyze("H2");
  const T = r.lenses.find((x) => x.id === "team");
  ok(/CẤP ĐỘI/.test(T.insight), "người ở đội cùng thấp -> vấn đề cấp đội");
  ok(r.hypotheses.some((h) => h.id === "team"), "có giả thuyết cấp đội");
  ok(!JSON.stringify(P.pack(r)).includes("Hùng"), "gói gửi AI không chứa tên người / quản lí");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
