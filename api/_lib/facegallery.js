// "Thư viện khuôn mặt" để ĐĂNG NHẬP BẰNG KHUÔN MẶT (nhận diện 1 người trong cả danh sách, khác với đối chiếu 1-1 ở facematch.compare).
// - Mỗi mã nhân viên giữ tối đa MAX_DESC "dấu vân" (128 số, không phải ảnh) lấy từ các bài đã nộp được hệ thống đối chiếu là "match"/"first".
// - Thư viện tự đầy lên: faceid.check (lúc nộp bài / quét nền) gọi enrol(); backfill() bổ sung cho bài cũ (chạy trong cron).
// - Nhận diện CHẶT HƠN đối chiếu 1-1 vì sai nhầm ở đây = vào được tài khoản người khác:
//     (1) khoảng cách <= LOGIN_MAX (mặc định 0.45, chặt hơn 0.55 của đối chiếu 1-1);
//     (2) người gần nhất phải cách người gần thứ hai (khác mã NV) ít nhất MARGIN, nếu không coi là "mập mờ" và từ chối.
// Không lưu ảnh ở đây. Nhân viên đã nghỉ (candidate.left) hoặc không còn trong danh sách bị loại ở bước gọi (kt-facelogin).
const store = require("./store");
const facematch = require("./facematch");
const quiz = require("./quiz");

const KEY = "kt/face-gallery.json";
const MAX_DESC = 3;
const LOGIN_MAX = Number(process.env.FACE_LOGIN_MAX) || 0.45;
const MARGIN = Number(process.env.FACE_LOGIN_MARGIN) || 0.08;
const CACHE_MS = 60 * 1000;

let cache = null, cacheAt = 0;
async function load() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const d = (await store.get(KEY)) || {};
  cache = d && d.people ? d : { v: 1, people: {} }; cacheAt = Date.now();
  return cache;
}
const okDesc = (d) => Array.isArray(d) && d.length === 128 && d.every((x) => Number.isFinite(x));

// Thêm dấu vân của một bài làm vào thư viện (mới nhất trước, tối đa MAX_DESC, bỏ trùng theo bài)
async function enrol(code, desc, src) {
  code = quiz.normCode(code);
  if (!code || !okDesc(desc) || !src) return false;
  await store.update(KEY, (cur) => {
    const d = cur && cur.people ? cur : { v: 1, people: {} };
    const p = d.people[code] || { descs: [] };
    if (p.descs.some((x) => x.src === src)) return d;
    p.descs.unshift({ d: desc, at: Date.now(), src });
    p.descs = p.descs.slice(0, MAX_DESC);
    d.people[code] = p;
    return d;
  });
  cache = null;
  return true;
}

// Xoá một người khỏi thư viện (ví dụ khi nhân viên yêu cầu rút lại dữ liệu khuôn mặt)
async function remove(code) {
  code = quiz.normCode(code);
  let had = false;
  await store.update(KEY, (cur) => {
    const d = cur && cur.people ? cur : { v: 1, people: {} };
    had = !!d.people[code]; delete d.people[code];
    return d;
  });
  cache = null;
  return had;
}

// Tìm người có khuôn mặt giống nhất. Trả { ok, code?, distance?, second?, reason? }; reason: empty | nomatch | ambiguous
function pick(desc, people) {
  let best = null, second = Infinity;
  for (const code of Object.keys(people || {})) {
    let m = Infinity;
    for (const x of (people[code].descs || [])) { if (okDesc(x.d)) { const d = facematch.dist(desc, x.d); if (d < m) m = d; } }
    if (m === Infinity) continue;
    if (!best || m < best.distance) { if (best) second = Math.min(second, best.distance); best = { code, distance: m }; }
    else if (m < second) second = m;
  }
  if (!best) return { ok: false, reason: "empty" };
  if (best.distance > LOGIN_MAX) return { ok: false, reason: "nomatch", distance: best.distance };
  if (second - best.distance < MARGIN) return { ok: false, reason: "ambiguous", distance: best.distance, second };
  return { ok: true, code: best.code, distance: best.distance, second: second === Infinity ? null : second };
}
async function identify(desc) {
  if (!okDesc(desc)) return { ok: false, reason: "nodesc" };
  return pick(desc, (await load()).people);
}

// Bổ sung thư viện từ các bài cũ đã được đối chiếu (match/first) mà chưa có trong thư viện. Có giới hạn thời gian.
async function backfill(opts) {
  const t0 = Date.now(), budget = (opts && opts.ms) || 12000;
  const g = await load();
  const have = new Set(), cnt = {};
  Object.keys(g.people).forEach((c) => { cnt[c] = g.people[c].descs.length; g.people[c].descs.forEach((x) => have.add(x.src)); });
  const rows = (await quiz.getIndex())
    .filter((r) => r.status === "submitted" && r.faceId && (r.faceId.s === "match" || r.faceId.s === "first") && !have.has(r.id))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  let done = 0, left = 0;
  for (const r of rows) {
    const code = quiz.normCode(r.code);
    if ((cnt[code] || 0) >= MAX_DESC) continue;
    if (Date.now() - t0 > budget) { left++; continue; }
    let a = null; try { a = await quiz.getAttempt(r.id); } catch (e) { a = null; }
    if (!a) continue;
    let d = okDesc(a.faceDesc) ? a.faceDesc : null;
    if (!d && a.photo) {
      try { const x = await facematch.describe(a.photo); d = x.n === 1 ? x.desc : null; } catch (e) { d = null; }
      if (d) { a.faceDesc = d; try { await quiz.putAttempt(a); } catch (e) { /* bỏ qua */ } }
    }
    if (d && await enrol(code, d, r.id)) { cnt[code] = (cnt[code] || 0) + 1; done++; }
  }
  return { done, left };
}

module.exports = { enrol, remove, identify, backfill, pick, LOGIN_MAX, MARGIN, MAX_DESC };
