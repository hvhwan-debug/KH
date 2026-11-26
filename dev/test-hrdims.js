// Nhận định theo từng người / quản lí / tỉnh / ngành (luật + AI).  node dev/test-hrdims.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz"), D = require("../api/_lib/hrdims"), llm = require("../api/_lib/llm");
const session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await admin(ctx, { method, headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query: query || {}, body }); return { s: ctx.res.status, j: ctx.res.body };
}
(async () => {
  const now = Date.parse("2026-11-26T00:00:00Z"), cands = [], SEGS = ["may_loc", "gia_dung", "both"], PV = ["Hà Nội", "Hải Phòng", "TP Hồ Chí Minh"];
  await quiz.saveSettings({ examTitle: "Kiểm tra định kì", passEnabled: true, passScore: 60 });
  for (let i = 1; i <= 30; i++) {
    const pct = 40 + i * 2, seg = SEGS[i % 3], mgr = i <= 15 ? "QL Một" : "QL Hai";
    cands.push({ code: "NV" + i, name: "Người " + i, email: "n" + i + "@x.vn", phone: "0912345678", manager: mgr, segment: seg, province: PV[i % 3], region: i % 3 === 2 ? "nam" : "bac", profile: { namSinh: 1990 } });
    const paper = [{ category: "Máy lọc", ok: i % 2 }, { category: "Máy lọc", ok: 1 }, { category: "Gia dụng", ok: i > 10 ? 1 : 0 }, { category: "Gia dụng", ok: 0 }];
    await quiz.putAttempt({ id: "a" + i, code: "NV" + i, status: "submitted", period: "k2", paper });
    await quiz.upsertIndex({ id: "a" + i, code: "NV" + i, status: "submitted", pct, score: pct / 10, total: 10, submittedAt: now, period: "k2", flags: { blur: i === 5 ? 6 : 0 } });
    await quiz.upsertIndex({ id: "p" + i, code: "NV" + i, status: "submitted", pct: pct - 5, score: 1, total: 10, submittedAt: now - 30 * 864e5, period: "k1" });
  }
  await quiz.saveCandidates(cands);
  const r = await call("GET", { op: "hrDims", period: "k2" });
  ok(r.s === 200 && r.j.ok, "API hrDims trả kết quả (" + r.s + " " + (r.j.error || "") + ")");
  const d = r.j;
  ok(d.people.length === 30 && d.people[0].name && d.people[0].manager && d.people[0].province && d.people[0].segmentLabel, "từng người: có tên, quản lí, tỉnh, ngành");
  ok(d.people.find((p) => p.code === "NV10").prev === 55 && /Tiến bộ \+5/.test(d.people.find((p) => p.code === "NV10").rules.notes.join(" ")), "so sánh với kỳ trước (+5 điểm)");
  ok(d.managers.length === 2 && d.managers.every((g) => g.n === 15 && g.notes.length && g.actions.length), "theo quản lí: 2 đội, mỗi đội 15 người, có nhận định");
  ok(d.provinces.length === 3 && d.segments.length === 3, "theo tỉnh (3) và theo ngành (3)");
  ok(d.segments.some((g) => /Ngành 1 · Máy lọc nước \(Karofi, Livotec\)/.test(g.name)) && d.segments.some((g) => /Ngành 2 · Điện gia dụng Livotec/.test(g.name)), "nhãn ngành: Ngành 1 máy lọc (Karofi, Livotec), Ngành 2 gia dụng Livotec");
  ok(/Rời màn hình 6 lần/.test(d.people.find((p) => p.code === "NV5").rules.notes.join(" ")), "người rời màn hình nhiều: ghi là tín hiệu");
  // AI: máy chủ tự dựng dữ liệu, không gửi tên / email / tuổi
  let sent = ""; llm.chat = async (m) => { sent = m[1].content; const ids = (sent.match(/"id":"([A-Z]+\d+)"/g) || []).map((x) => x.slice(6, -1)); return JSON.stringify({ items: ids.map((id) => ({ id, nhan_dinh: "Nhận định " + id, diem_manh: ["a"], can_cai_thien: ["b"], de_xuat: ["c"], do_tin_cay: "vừa" })) }); };
  let a = await call("POST", {}, { op: "hrDimsAi", kind: "managers", period: "k2" });
  ok(a.s === 200 && a.j.items.length === 2 && a.j.items.some((x) => x.key === "QL Một"), "AI theo quản lí: trả nhận định gắn đúng đội");
  ok(!/Người \d|@x\.vn|0912345678|1990|QL Một/.test(sent), "dữ liệu gửi AI không có tên, email, SĐT, năm sinh, tên quản lí");
  a = await call("POST", {}, { op: "hrDimsAi", kind: "person", key: "NV7", period: "k2" });
  ok(a.s === 200 && a.j.items[0].key === "NV7" && !/Người 7|n7@/.test(sent), "AI từng người: gắn đúng mã, không gửi tên");
  a = await call("POST", {}, { op: "hrDimsAi", kind: "segments", period: "k2" }); ok(a.s === 200 && a.j.items.length === 3, "AI theo ngành");
  a = await call("POST", {}, { op: "hrDimsAi", kind: "provinces", period: "k2" }); ok(a.s === 200 && a.j.items.length === 3, "AI theo tỉnh");
  // đối tượng đào tạo (hồ sơ đối tượng Karofi – Livotec)
  const C = require("../api/_lib/hrcontext");
  ok(C.audienceKey("SR", "may_loc") === "GT1" && C.audienceKey("SR", "gia_dung") === "GT2" && C.audienceKey("SR", "both") === "SR", "SR + ngành: máy lọc = GT1, gia dụng = GT2, chưa rõ ngành thì không đoán");
  ok(C.audienceKey("SR 1", "both") === "GT1" && C.audienceKey("SR GT2", "") === "GT2" && C.audienceKey("PC", "may_loc") === "PC" && C.audienceKey("ASM", "") === "ASM" && C.audienceKey("RSM", "") === "RSM" && C.audienceKey("PG", "") === "PG", "nhận đúng SR 1 / SR GT2 / PC / PG / ASM / RSM");
  ok(d.audiences && d.audiences.length >= 1 && d.people.every((p) => p.audience), "có nhóm theo đối tượng, mỗi người có đối tượng");
  a = await call("POST", {}, { op: "hrDimsAi", kind: "audiences", period: "k2" }); ok(a.s === 200 && a.j.items.length >= 1 && /SR GT1|Karofi/.test(require("../api/_lib/hrdims").SYSTEM), "AI theo đối tượng; lời nhắc AI có hồ sơ đối tượng đào tạo");
  a = await call("POST", {}, { op: "hrDimsAi", kind: "xyz" }); ok(a.s === 502 && !a.j.ok, "loại không hợp lệ bị từ chối");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
