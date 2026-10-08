const { reply } = require("../_lib/http");
const { missing, emailAllowed } = require("../_lib/config");
const { userFromReq } = require("../_lib/session");

module.exports = async function (context, req) {
  try {
    const miss = missing();
    if (miss.length) return reply(context, 200, { avail: false, missing: miss }); // chỉ liệt kê TÊN biến còn thiếu, không lộ giá trị
    const u = userFromReq(req);
    if (u && !emailAllowed(u.email)) return reply(context, 200, { avail: true, loggedIn: false });
    return reply(context, 200, { avail: true, loggedIn: !!u, email: u ? u.email : null });
  } catch (e) {
    return reply(context, 200, { avail: false });
  }
};
