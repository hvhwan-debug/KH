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

module.exports = { get, put, del, list };
