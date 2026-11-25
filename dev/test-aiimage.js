// Kiểm thử ảnh minh hoạ học liệu (api/_lib/aiimage.js), không gọi mạng thật:  node dev/test-aiimage.js
const A = require("../api/_lib/aiimage");
const { createCanvas, loadImage } = require("../api/node_modules/@napi-rs/canvas");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
(async () => {
  const o = { title: "Catalog sản phẩm máy lọc kênh GT miền Bắc", desc: "Thông số và điểm bán hàng", catName: "Kiến thức sản phẩm", type: "pdf" };
  delete process.env.OPENAI_API_KEY; delete process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT;
  let r = await A.cover(o); let im = await loadImage(r.buf);
  ok(r.source === "art" && im.width === 1280 && im.height === 720 && /chưa bật/.test(r.note), "chưa cấu hình AI -> ảnh tự vẽ 1280x720 + ghi chú");
  ok(A.themeOf(o) === "water" && A.themeOf({ title: "Kỹ năng chốt đơn" }) === "sales" && A.themeOf({ title: "Chính sách bảo hành máy lọc 2026" }) === "policy" && A.themeOf({ title: "Kỹ năng tư vấn máy lọc nước" }) === "sales", "nhận đúng chủ đề theo từ khoá");
  ok(/NO text/.test(A.prompt(o)) && /máy lọc/.test(A.prompt(o)), "lời nhắc có chủ đề và cấm chữ trong ảnh");
  // giả lập OpenAI trả ảnh vuông 1024x1024
  const cv = createCanvas(1024, 1024); cv.getContext("2d").fillStyle = "#f00"; cv.getContext("2d").fillRect(0, 0, 1024, 1024);
  const b64 = cv.encode ? (await cv.encode("png")).toString("base64") : "";
  let sent = null; const realFetch = global.fetch;
  global.fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body), headers: init.headers }; return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: b64 }] }) }; };
  process.env.OPENAI_API_KEY = "sk-test";
  r = await A.cover(o); im = await loadImage(r.buf);
  ok(r.source === "ai" && im.width === 1280 && im.height === 720, "có OPENAI_API_KEY -> ảnh AI, cắt vừa 16:9");
  ok(sent.url === "https://api.openai.com/v1/images/generations" && sent.body.model === "gpt-image-1" && sent.body.size === "1536x1024" && sent.headers.Authorization === "Bearer sk-test", "gọi đúng API OpenAI (gpt-image-1, khổ ngang)");
  process.env.AZURE_OPENAI_ENDPOINT = "https://x.openai.azure.com/"; process.env.AZURE_OPENAI_KEY = "k"; process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT = "dall-e-3";
  r = await A.cover(o); ok(r.source === "ai" && /x\.openai\.azure\.com\/openai\/deployments\/dall-e-3\/images\/generations\?api-version=2024-02-01/.test(sent.url) && sent.body.response_format === "b64_json" && sent.headers["api-key"] === "k", "ưu tiên Azure OpenAI khi có bản triển khai ảnh (dall-e-3)");
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  r = await A.cover(o); ok(r.source === "art" && /429/.test(r.note), "AI lỗi (429) -> tự vẽ thay, kèm ghi chú");
  global.fetch = (url, init) => new Promise((res, rej) => { init.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); }); });
  r = await A.cover(o, { timeoutMs: 300 }); ok(r.source === "art" && /quá thời gian/.test(r.note), "AI quá thời gian -> tự vẽ thay");
  global.fetch = realFetch;
  console.log(pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
