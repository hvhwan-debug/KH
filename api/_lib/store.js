// Lưu trữ JSON: Azure Blob Storage (mặc định) hoặc bộ nhớ tạm (chỉ để chạy thử trên máy).
const { cfg } = require("./config");

const mem = new Map();
let containerPromise = null;

function getContainer() {
  if (!containerPromise) {
    containerPromise = (async () => {
      const { BlobServiceClient } = require("@azure/storage-blob"); // nạp khi cần
      const svc = BlobServiceClient.fromConnectionString(cfg().conn);
      const c = svc.getContainerClient("livotec-sr");
      await c.createIfNotExists();
      return c;
    })().catch((e) => { containerPromise = null; throw e; });
  }
  return containerPromise;
}

function is404(e) {
  return e && (e.statusCode === 404 || e.code === "BlobNotFound");
}

async function get(name) {
  if (cfg().storageMode === "memory") {
    return mem.has(name) ? JSON.parse(mem.get(name)) : null;
  }
  const c = await getContainer();
  try {
    const buf = await c.getBlockBlobClient(name).downloadToBuffer();
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    if (is404(e)) return null;
    throw e;
  }
}

async function put(name, obj) {
  const text = JSON.stringify(obj);
  if (cfg().storageMode === "memory") { mem.set(name, text); return; }
  const c = await getContainer();
  const data = Buffer.from(text, "utf8");
  await c.getBlockBlobClient(name).upload(data, data.length, {
    blobHTTPHeaders: { blobContentType: "application/json" }
  });
}

async function del(name) {
  if (cfg().storageMode === "memory") { mem.delete(name); return; }
  const c = await getContainer();
  try { await c.getBlockBlobClient(name).delete(); } catch (e) { if (!is404(e)) throw e; }
}

async function list(prefix) {
  if (cfg().storageMode === "memory") {
    return Array.from(mem.keys()).filter((k) => k.indexOf(prefix) === 0);
  }
  const c = await getContainer();
  const out = [];
  for await (const b of c.listBlobsFlat({ prefix })) out.push(b.name);
  return out;
}

// Đọc-sửa-ghi AN TOÀN khi nhiều người cùng ghi một tệp (vd bảng chỉ số bài nộp): khoá lạc quan bằng ETag của Azure Blob.
// Đọc kèm ETag, áp dụng hàm sửa, ghi có điều kiện "tệp chưa đổi từ lúc đọc"; nếu có người ghi chen vào (412) thì đọc lại và làm lại.
// mutate(cur) nhận giá trị hiện tại (null nếu chưa có) và trả về giá trị mới; phải là hàm đồng bộ và không có tác dụng phụ
// (vì có thể bị gọi lại nhiều lần).
async function readWithEtag(blob) {
  try {
    const dl = await blob.download();
    const chunks = [];
    for await (const ch of dl.readableStreamBody) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
    return { cur: JSON.parse(Buffer.concat(chunks).toString("utf8")), etag: dl.etag };
  } catch (e) {
    if (is404(e)) return { cur: null, etag: null };
    throw e;
  }
}
// Hàng đợi theo tên tệp TRONG một tiến trình: các lần ghi cùng tệp xếp hàng nên không tranh nhau; khoá ETag chỉ còn phải
// xử lý xung đột giữa các máy chủ/tiến trình khác nhau (ít hơn nhiều).
const chains = new Map();
function queued(name, fn) {
  const prev = chains.get(name) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  chains.set(name, tail);
  tail.then(() => { if (chains.get(name) === tail) chains.delete(name); });
  return run;
}
function update(name, mutate, maxTries) { return queued(name, () => updateOnce(name, mutate, maxTries)); }
async function updateOnce(name, mutate, maxTries) {
  const tries = maxTries || 30;
  if (cfg().storageMode === "memory") { // không có await giữa đọc và ghi nên tự nhiên đã nguyên tử
    const cur = mem.has(name) ? JSON.parse(mem.get(name)) : null;
    const next = mutate(cur);
    mem.set(name, JSON.stringify(next));
    return next;
  }
  const c = await getContainer();
  const blob = c.getBlockBlobClient(name);
  for (let i = 0; i < tries; i++) {
    const { cur, etag } = await readWithEtag(blob);
    const next = mutate(cur);
    const data = Buffer.from(JSON.stringify(next), "utf8");
    try {
      await blob.upload(data, data.length, {
        blobHTTPHeaders: { blobContentType: "application/json" },
        conditions: etag ? { ifMatch: etag } : { ifNoneMatch: "*" } // chưa có tệp: chỉ tạo nếu vẫn chưa ai tạo
      });
      return next;
    } catch (e) {
      const conflict = e && (e.statusCode === 412 || e.statusCode === 409 || e.code === "ConditionNotMet" || e.code === "BlobAlreadyExists");
      if (!conflict) throw e;
      await new Promise((r) => setTimeout(r, Math.min(600, 20 * (i + 1)) + Math.floor(Math.random() * 60))); // lùi ngẫu nhiên để các bên không va nhau mãi
    }
  }
  throw new Error("Không ghi được " + name + " do quá nhiều người ghi cùng lúc, thử lại sau.");
}

module.exports = { get, put, del, list, update };
