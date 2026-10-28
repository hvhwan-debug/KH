// Đối chiếu khuôn mặt GIỮA CÁC LẦN KIỂM TRA của cùng một nhân viên (phát hiện người khác làm hộ).
// - Dùng mô hình nhận diện chạy ngay trên máy chủ (facematch.js): ảnh xác nhận của lần này so với ảnh các lần trước cùng mã NV.
// - KHÔNG chặn thí sinh: chỉ ghi kết quả vào bài làm (attempt.faceId) và bảng kết quả để quản trị viên xem lại.
// - Lần đầu tiên chưa có ảnh cũ thì ghi "first": ảnh đó thành ảnh gốc cho các lần sau.
// - Ảnh đã bị đánh dấu "khác người" không được dùng làm ảnh gốc (tránh người làm hộ trở thành chuẩn).
// Kết quả lưu gọn: { s, d?, t?, n?, refs?, at }
//   s: "match" khớp · "mismatch" khác người · "first" chưa có ảnh cũ · "noface" ảnh không dùng được · "nophoto" · "error"
const quiz = require("./quiz");
const facematch = require("./facematch");

const MAX_REFS = 3;
const MAP = { noref: "first", noface: "noface", multi: "noface", mismatch: "mismatch", badimg: "noface", unavailable: "error" };

// Ảnh gốc: các bài TRƯỚC ĐÓ cùng mã NV có ảnh, không bị đánh dấu khác người; mới nhất trước (ngoại hình gần nhất)
async function refsFor(attempt, idx) {
  const rows = (idx || await quiz.getIndex())
    .filter((r) => r.id !== attempt.id && (r.startedAt || 0) < (attempt.startedAt || 0) && quiz.normCode(r.code) === quiz.normCode(attempt.code) && !(r.faceId && r.faceId.s === "mismatch"))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 6);
  const refs = [];
  for (const r of rows) {
    if (refs.length >= MAX_REFS) break;
    let a = null; try { a = await quiz.getAttempt(r.id); } catch (e) { a = null; }
    if (!a || !a.photo || (a.faceId && a.faceId.s === "mismatch")) continue;
    refs.push({ id: a.id, photo: a.photo, desc: a.faceDesc, save: async (d) => { a.faceDesc = d; await quiz.putAttempt(a); } });
  }
  return refs;
}

// Đối chiếu một bài làm. Không ghi gì; trả về bản ghi để nơi gọi lưu.
async function check(attempt, idx) {
  const at = Date.now();
  if (!attempt || !attempt.photo) return { s: "nophoto", at };
  const refs = await refsFor(attempt, idx);
  const cmp = await facematch.compare(attempt.photo, refs);
  if (cmp.desc && !attempt.faceDesc) attempt.faceDesc = cmp.desc; // dấu vân của chính ảnh này, để lần sau so nhanh
  const s = cmp.ok ? "match" : (MAP[cmp.code] || "error");
  const rec = { s, at };
  if (cmp.distance != null) { rec.d = Math.round(cmp.distance * 1000) / 1000; rec.t = cmp.threshold; }
  if (cmp.used) { rec.n = cmp.used; rec.refs = refs.map((r) => r.id).slice(0, MAX_REFS); }
  return rec;
}

// Có giới hạn thời gian: quá hạn thì trả null (bài sẽ được đối chiếu sau ở lượt quét nền)
async function checkWithin(attempt, ms, idx) {
  let timer;
  try {
    return await Promise.race([check(attempt, idx), new Promise((r) => { timer = setTimeout(() => r(null), ms); })]);
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

async function patchIndex(id, faceId) { await quiz.patchIndex(id, { faceId }); }

// Quét nền: đối chiếu các bài đã nộp chưa có kết quả, cũ nhất trước (để ảnh gốc của các lần đầu có trước).
// period rỗng = mọi đề. Dừng khi hết thời gian cho phép. Trả về { done, left, mismatch }.
async function scan(opts) {
  opts = opts || {};
  const t0 = Date.now(), budget = opts.ms || 20000, period = opts.period || "";
  const idx = await quiz.getIndex();
  const todo = idx.filter((r) => r.status === "submitted" && !r.faceId && (!period || (r.period || "") === period))
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  let done = 0, mismatch = 0;
  for (const r of todo) {
    if (Date.now() - t0 > budget || (opts.max && done >= opts.max)) break;
    let a = null; try { a = await quiz.getAttempt(r.id); } catch (e) { a = null; }
    let rec;
    if (!a) rec = { s: "nophoto", at: Date.now() };
    else {
      try { rec = await check(a, idx); } catch (e) { rec = { s: "error", at: Date.now() }; }
      a.faceId = rec;
      try { await quiz.putAttempt(a); } catch (e) { /* bỏ qua */ }
    }
    await patchIndex(r.id, rec);
    r.faceId = rec; // để các bài sau trong cùng lượt thấy ngay (bỏ qua ảnh bị đánh dấu khác người)
    done++; if (rec.s === "mismatch") mismatch++;
  }
  return { done, left: Math.max(0, todo.length - done), mismatch };
}

module.exports = { check, checkWithin, scan, patchIndex };
