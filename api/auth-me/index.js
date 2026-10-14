const { reply, sessionState } = require("../_lib/http");
const { missing, emailAllowed, isAdmin } = require("../_lib/config");
const { userFromReq } = require("../_lib/session");
const store = require("../_lib/store");
const org = require("../_lib/org");

module.exports = async function (context, req) {
  try {
    const miss = missing();
    if (miss.length) return reply(context, 200, { avail: false, missing: miss }); // chỉ liệt kê TÊN biến còn thiếu, không lộ giá trị
    const u = userFromReq(req);
    if (u && !emailAllowed(u.email)) return reply(context, 200, { avail: true, loggedIn: false });
    if (u && (await sessionState(u)) !== "ok") return reply(context, 200, { avail: true, loggedIn: false });
    let name = "";
    if (u) {
      try { const doc = await store.get("user/" + u.uid + ".json"); name = (doc && doc.name) || ""; } catch (e) {}
    }
    let isAsm = false, profile = null;
    if (u) {
      try {
        isAsm = !!org.findAsm(await org.getRoster(), u.email);
        const p = await org.getProfile(u.uid);
        if (p) profile = { nganh: p.nganh, asmEmail: p.asmEmail || "", locked: !!p.locked };
      } catch (e) {}
    }
    return reply(context, 200, { avail: true, loggedIn: !!u, email: u ? u.email : null, name, isAdmin: !!(u && isAdmin(u.email)), isAsm, profile });
  } catch (e) {
    return reply(context, 200, { avail: false });
  }
};
