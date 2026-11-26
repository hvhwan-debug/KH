// Thẻ kết quả: từ lần rời màn hình thứ 4 mới có dòng nhỏ "Số lần rời khỏi màn hình khi đang làm bài".  node dev/test-sharecard-away.js
process.env.STORAGE_MODE = "memory"; process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234";
const sc = require("../api/_lib/sharecard");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const now = Date.now();
const mk = (n) => ({ id: "a1", name: "Tổng Khánh Linh", code: "T1", total: 10, score: 9, wrong: 1, blank: 0, pct: 90, flags: n == null ? undefined : { blur: n }, startedAt: now - 600000, submittedAt: now, status: "submitted" });
const st = { examTitle: "Kiểm tra định kì" };
(async () => {
  ok(sc.cardData(mk(4), st).away === 4 && sc.cardData(mk(0), st).away === 0 && sc.cardData(mk(null), st).away === 0, "cardData.away lấy từ cờ rời màn hình, thiếu dữ liệu thì 0");
  const ev = [{ k: "tab", t: now - 100000, ms: 90000 }, { k: "blur", t: now - 50000, ms: 100000 }];
  const withEv = Object.assign({}, mk(4), { events: ev });
  ok(sc.cardData(withEv, st).awayText === "3 phút" && sc.cardData(mk(4), st).awayText === "", "thẻ kết quả: awayText = '3 phút' (90+100 = 190 giây), không có dữ liệu thời gian thì để trống");
  const pa = (await sc.renderPng(withEv, st, now)).toString("base64"), pb = (await sc.renderPng(mk(4), st, now)).toString("base64");
  ok(pa !== pb, "thẻ kết quả vẽ thêm '(3 phút)' khi có dữ liệu thời gian");
  const h = async (n) => { const png = await sc.renderPng(mk(n), st, now); return { len: png.length, h: png.readUInt32BE(20), same: png.toString("base64") }; };
  const a0 = await h(0), a3 = await h(3), a4 = await h(4), a9 = await h(9);
  ok(a0.h === a3.h, "0–3 lần: thẻ giữ nguyên kích thước, không có dòng nhỏ");
  ok(a4.same !== a3.same && a0.same === a3.same && a9.h === a4.h, "từ lần 4: thẻ có thêm dòng nhỏ (ảnh khác ảnh 3 lần), 0–3 lần giống nhau; chiều cao không đổi khi còn chỗ trong khối tên");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
