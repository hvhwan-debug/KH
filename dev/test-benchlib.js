// Kiểm thử thư viện benchmark ngành (_lib/benchlib.js) với dịch vụ tìm kiếm và AI giả lập.  node dev/test-benchlib.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn"; process.env.ADMIN_EMAILS = "admin@x.vn";
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
// AI giả lập: trả 2 phát hiện, 1 trích dẫn đúng nguyên văn, 1 trích dẫn bịa
const llm = require("../api/_lib/llm");
llm.chat = async () => JSON.stringify({ items: [
  { doc: 0, topic: "nhan_su", metric: "Tỉ lệ nghỉ việc nhân viên bán hàng điện máy", value: "Khoảng 40%/năm", scope: "Việt Nam", year: 2026, source: { title: "Khảo sát", publisher: "Hãng X", type: "research_firm" }, method: "Khảo sát 800 doanh nghiệp", sample: 800, fit: { country: "vn", industry: "near", channel: "same", role: "same" }, implication: "Rút ngắn hội nhập.", quote: "tỷ lệ nghỉ việc của nhân viên bán hàng điện máy là 40% mỗi năm theo khảo sát" },
  { doc: 0, topic: "nhan_su", metric: "Số liệu bịa", value: "99%", scope: "VN", year: 2026, source: { title: "t", publisher: "p", type: "blog" }, fit: { country: "vn" }, implication: "x", quote: "câu này không hề có trong trang nguồn đâu nhé bạn ơi" }] });
// Tavily giả lập
process.env.TAVILY_API_KEY = "test";
global.fetch = async (url) => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ results: [{ url: "https://vd.vn/bao-cao", title: "Báo cáo nhân sự", raw_content: "Mở đầu. Năm 2026, tỷ lệ nghỉ việc của nhân viên bán hàng điện máy là 40% mỗi năm theo khảo sát của Hãng X với 800 doanh nghiệp. Kết thúc. ".repeat(5) }] }) });
const B = require("../api/_lib/benchlib"), session = require("../api/_lib/session"), admin = require("../api/kt-admin");
async function A(method, q, b) { const ctx = { log: Object.assign(() => {}, { error: () => {} }), res: null }; await admin(ctx, { method, headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query: q || {}, body: b }); return ctx.res; }
(async () => {
  let r = await A("GET", { op: "benchList" });
  ok(r.body.ok && r.body.items.length >= 15, "nạp bộ benchmark ban đầu (" + r.body.items.length + " mục)");
  ok(r.body.items.every((x) => ["cao", "vừa", "thấp"].includes(x.reliability) && ["cao", "vừa", "thấp"].includes(x.fit) && x.relWhy.length), "mọi mục có 2 nhãn + lí do");
  const cc = r.body.items.find((x) => /Cốc Cốc/.test(x.source.publisher || ""));
  ok(cc && cc.reliability === "cao" && cc.fit === "cao", "khảo sát Cốc Cốc 1.047 người VN: tin cậy cao, phù hợp cao");
  const blog = r.body.items.find((x) => x.conflict);
  ok(blog && blog.reliability === "thấp", "số liệu mâu thuẫn từ blog: tin cậy thấp");
  const kf = r.body.items.find((x) => /Korn Ferry/.test(x.source.publisher || ""));
  ok(kf && kf.fit === "thấp", "nghiên cứu coaching B2B toàn cầu: phù hợp thấp");

  r = await A("POST", {}, { op: "benchSearch", topic: "nhan_su" });
  ok(r.body.ok && r.body.added.length === 2, "AI tìm: thêm 2 mục chờ duyệt");
  const good = r.body.added.find((x) => x.metric.startsWith("Tỉ lệ")), fake = r.body.added.find((x) => x.metric === "Số liệu bịa");
  ok(good.verified === true && good.status === "pending", "trích dẫn khớp nguồn: đã đối chiếu, chờ duyệt");
  ok(fake.verified === false && fake.reliability === "thấp", "trích dẫn bịa: không đối chiếu được, tin cậy thấp");
  r = await A("POST", {}, { op: "benchSearch", topic: "nhan_su" });
  ok(r.body.added.length === 0, "tìm lại không thêm trùng");

  r = await A("POST", {}, { op: "benchSet", id: good.id, status: "approved" });
  ok(r.body.ok && r.body.item.status === "approved" && r.body.item.reviewedBy === "admin@x.vn", "duyệt mục, ghi người duyệt");
  const ind = await B.forHypotheses(["onboard"], 3);
  ok(ind.some((x) => x.id === good.id), "mục đã duyệt được dùng cho giả thuyết nhân sự mới");
  ok(!(await B.forHypotheses(["onboard"], 5)).some((x) => x.id === fake.id), "mục chờ duyệt / tin cậy thấp không được dùng");

  r = await A("POST", {}, { op: "benchAdd", item: { topic: "nhan_su", metric: "Tỉ lệ nghỉ việc PC nội bộ 2025", value: "28%", year: 2025, source: { publisher: "HR nội bộ", type: "data" }, fit: { country: "vn", industry: "same", channel: "same", role: "same" }, implication: "Đối chiếu với ngành." } });
  ok(r.body.ok && r.body.item.fit === "cao", "thêm thủ công số liệu nội bộ: phù hợp cao");
  r = await A("POST", {}, { op: "benchDesign" });
  ok(r.body.ok && r.body.rules.length >= 3, "tổng hợp gợi ý thiết kế theo luật (" + r.body.rules.length + " chủ đề)");
  delete process.env.TAVILY_API_KEY;
  r = await A("POST", {}, { op: "benchSearch", topic: "coaching" });
  ok(r.status === 503 && /TAVILY_API_KEY/.test(r.body.error), "chưa cấu hình tìm kiếm: báo rõ cần thêm khoá nào");
  r = await A("POST", {}, { op: "benchDelete", id: fake.id });
  ok(r.body.ok, "xoá mục");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
