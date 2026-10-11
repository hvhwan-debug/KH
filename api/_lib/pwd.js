// Mật khẩu: băm bằng scrypt có sẵn trong Node (không cần cài thêm gói).
const crypto = require("crypto");

function hash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return salt + ":" + key;
}

function verify(password, stored) {
  if (!stored || typeof stored !== "string" || stored.indexOf(":") < 0) return false;
  const i = stored.indexOf(":");
  const salt = stored.slice(0, i), key = stored.slice(i + 1);
  try {
    const k2 = crypto.scryptSync(String(password), salt, 64).toString("hex");
    const a = Buffer.from(key, "hex"), b = Buffer.from(k2, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

module.exports = { hash, verify };
