const { reply } = require("../_lib/http");
const { missing, emailAllowed, isAdmin } = require("../_lib/config");
const { userFromReq } = require("../_lib/session");
const store = require("../_lib/store");

module.exports = async function (context, req) {
  try {
    const miss = missing();
    if (miss.length) return reply(context, 200, { avail: false, missing: miss }); // chỉ liệt kê TÊN biến còn thiếu, không lộ giá trị
    const u = userFromReq(req);
    if (u && !emailAllowed(u.email)) return reply(context, 200, { avail: true, loggedIn: false });
    let name = "";
    if (u) {
      try { const doc = await store.get("user/" + u.uid + ".json"); name = (doc && doc.name) || ""; } catch (e) {}
    }
    return reply(context, 200, { avail: true, loggedIn: !!u, email: u ? u.email : null, name, isAdmin: !!(u && isAdmin(u.email)) });
  } catch (e) {
    return reply(context, 200, { avail: false });
  }
};
