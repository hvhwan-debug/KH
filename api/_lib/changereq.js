// Yêu cầu điều chỉnh thông tin do thí sinh gửi (trước khi làm bài). Chỉ khi quản trị viên xác nhận đúng
// thì dữ liệu thí sinh mới được cập nhật. Lưu một danh sách duy nhất; mỗi thí sinh chỉ có tối đa 1 yêu cầu đang chờ.
const crypto = require("crypto");
const store = require("./store");
const KEY = "kt/changeRequests.json";
const FIELDS = ["name", "email", "manager", "title", "segment", "phone", "province", "region"];
const KEEP_DONE = 200;

async function getAll() { return (await store.get(KEY)) || []; }
async function saveAll(list) {
  const pending = list.filter((r) => r.status === "pending");
  const done = list.filter((r) => r.status !== "pending").sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, KEEP_DONE);
  await store.put(KEY, pending.concat(done));
}
const newId = () => "cr" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
module.exports = { FIELDS, getAll, saveAll, newId };
