// Đối chiếu khuôn mặt CHẠY NGAY TRÊN MÁY CHỦ bằng mô hình nhận diện chuyên dụng (face-api / FaceNet-kiểu ResNet):
// mỗi ảnh -> "dấu vân khuôn mặt" 128 số -> đo khoảng cách Euclid. Không gọi dịch vụ ngoài, không tốn phí.
// - Thư viện + mô hình nằm trong api/_lib/vendor (bản của @vladmandic/face-api, giấy phép MIT), nạp bằng vm với một lớp giả lập tối thiểu.
// - Chạy bằng backend CPU thuần JavaScript nên không cần cài thêm gói gốc (native) nào trên Azure.
// - Dấu vân của ảnh đã lưu được tính một lần rồi ghi vào bài làm (attempt.faceDesc) để lần sau không phải tính lại.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const MODELS = path.join(__dirname, "vendor", "face-models");
// Khoảng cách <= ngưỡng thì coi là cùng người. 0.6 là ngưỡng mặc định của face-api; chọn chặt hơn (0.55) vì đây là cổng bảo mật (người khác nhau thường cách nhau > 0.8).
const MATCH_MAX = Number(process.env.FACE_MATCH_MAX) || 0.55;
const MIN_FACE_FRAC = 0.12; // khuôn mặt nhỏ hơn 12% bề ngang ảnh không tính (tránh mặt phụ ở phía sau)

let ready = null;
function boot() {
  if (ready) return ready;
  ready = (async () => {
    const src = fs.readFileSync(path.join(__dirname, "vendor", "face-api.js"), "utf8");
    // Không truyền kiểu mảng/ArrayBuffer của bên ngoài vào: để lớp vm tự dùng bản của nó (tránh lệch "realm" khiến instanceof sai)
    const g = { console, setTimeout, clearTimeout, setInterval, clearInterval, performance, TextEncoder, TextDecoder, URL, Buffer, process };
    g.self = g; g.window = g; g.globalThis = g;
    g.navigator = { userAgent: "node", hardwareConcurrency: 2, platform: "node" };
    g.document = { createElement() { throw new Error("no dom"); }, addEventListener() {}, body: {} };
    g.location = { href: "http://localhost/", search: "" };
    g.requestAnimationFrame = (f) => setTimeout(f, 0);
    vm.createContext(g);
    const mkBuf = vm.runInContext("(n) => new ArrayBuffer(n)", g);
    g.__mkF32 = vm.runInContext("(n) => new Float32Array(n)", g);
    // fetch giả: chỉ đọc tệp mô hình trong thư mục cục bộ
    g.fetch = async (u) => {
      const f = path.join(MODELS, path.basename(String(u).split("?")[0]));
      if (!fs.existsSync(f)) return { ok: false, status: 404, statusText: "not found" };
      const buf = fs.readFileSync(f);
      return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, json: async () => JSON.parse(buf.toString("utf8")), text: async () => buf.toString("utf8"),
        arrayBuffer: async () => { const ab = mkBuf(buf.length); new Uint8Array(ab).set(buf); return ab; } };
    };
    vm.runInContext(src + "\n;globalThis.__fa = faceapi;", g);
    const fa = g.__fa; fa.__mkF32 = g.__mkF32;
    // Không có DOM thật: khai báo môi trường tối thiểu (chỉ dùng đầu vào là tensor nên không bao giờ gọi tới canvas)
    const no = () => { throw new Error("no dom"); };
    fa.env.setEnv({ Canvas: function () {}, CanvasRenderingContext2D: function () {}, Image: function () {}, ImageData: function () {}, Video: function () {},
      createCanvasElement: no, createImageElement: no, createVideoElement: no, fetch: g.fetch, readFile: no });
    await fa.tf.setBackend("cpu"); await fa.tf.ready();
    await fa.nets.tinyFaceDetector.loadFromUri("/m");
    await fa.nets.faceLandmark68Net.loadFromUri("/m");
    await fa.nets.faceRecognitionNet.loadFromUri("/m");
    return fa;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

function decodeJpeg(dataUrl) {
  const m = /^data:image\/jpe?g;base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) throw new Error("not-jpeg");
  return require("jpeg-js").decode(Buffer.from(m[1], "base64"), { useTArray: true, maxMemoryUsageInMB: 256 });
}

// Trả về { n, faces, desc } : n = số khuôn mặt đủ lớn; desc = dấu vân (mảng 128 số) của khuôn mặt lớn nhất
async function describe(dataUrl) {
  const fa = await boot();
  const img = decodeJpeg(dataUrl);
  const rgb = fa.__mkF32(img.width * img.height * 3);
  for (let i = 0, j = 0; i < img.data.length; i += 4) { rgb[j++] = img.data[i]; rgb[j++] = img.data[i + 1]; rgb[j++] = img.data[i + 2]; }
  const t = fa.tf.tensor3d(rgb, [img.height, img.width, 3], "float32");
  try {
    // Ảnh selfie có mặt to: dò ở kích thước nhỏ (nhanh, ~1s); không thấy mặt thì dò lại ở kích thước lớn hơn
    let big = [];
    for (const size of [224, 416]) {
      const all = await fa.detectAllFaces(t, new fa.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptors();
      big = all.filter((r) => r.detection.box.width >= img.width * MIN_FACE_FRAC).sort((a, b) => b.detection.box.area - a.detection.box.area);
      if (big.length) break;
    }
    return { n: big.length, desc: big.length ? Array.from(big[0].descriptor).map((x) => Math.round(x * 1e4) / 1e4) : null };
  } finally { t.dispose(); }
}

function dist(a, b) { let s = 0; for (let i = 0; i < 128; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

// selfie: ảnh vừa chụp. refs: [{ photo, desc?, save?(desc) }] ảnh đã lưu của chủ hồ sơ (desc đã tính sẵn thì dùng luôn)
// Kết quả: { ok, code, message?, distance?, threshold }
async function compare(selfie, refs) {
  let me;
  try { me = await describe(selfie); }
  catch (e) { return { ok: false, code: e && e.message === "not-jpeg" ? "badimg" : "unavailable", message: e && e.message === "not-jpeg" ? "Ảnh chụp không đọc được. Hãy chụp lại." : "Hệ thống đối chiếu khuôn mặt tạm thời không khả dụng. Vui lòng thử lại sau ít phút." }; }
  if (me.n === 0) return { ok: false, code: "noface", message: "Không thấy khuôn mặt trong ảnh. Hãy nhìn thẳng camera, đủ sáng rồi chụp lại." };
  if (me.n > 1) return { ok: false, code: "multi", message: "Ảnh có nhiều hơn một người. Chỉ người xem được có mặt trong ảnh." };
  let best = Infinity, used = 0;
  const t0 = Date.now();
  for (const r of refs || []) {
    if (used && Date.now() - t0 > 20000) break; // đủ thời gian rồi thì dừng, tránh vượt giới hạn của máy chủ
    let d = Array.isArray(r.desc) && r.desc.length === 128 ? r.desc : null;
    if (!d) {
      try { const x = await describe(r.photo); d = x.n >= 1 ? x.desc : null; } catch (e) { d = null; }
      if (d && r.save) { try { await r.save(d); } catch (e) { /* bỏ qua */ } }
    }
    if (!d) continue;
    used++; best = Math.min(best, dist(me.desc, d));
  }
  if (!used) return { ok: false, code: "noref", desc: me.desc, used: 0, message: "Hồ sơ chưa có ảnh khuôn mặt đã lưu dùng được để đối chiếu. Vui lòng liên hệ quản trị viên." };
  if (best <= MATCH_MAX) return { ok: true, distance: best, threshold: MATCH_MAX, desc: me.desc, used };
  return { ok: false, code: "mismatch", distance: best, threshold: MATCH_MAX, desc: me.desc, used, message: "Khuôn mặt không khớp với ảnh đã lưu của chủ bài làm này." };
}

module.exports = { compare, describe, dist, MATCH_MAX, _boot: boot, _decode: decodeJpeg };
