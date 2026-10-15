// Kiểm thử phân quyền: ASM chỉ thao tác được với nhân sự của chính mình.
//   ADMIN_EMAILS=boss@livotec.vn node dev/server.js   rồi   node dev/seed-demo.js   rồi   node dev/test-scope.js
const BASE="http://localhost:7071",H={"Content-Type":"application/json","X-Requested-With":"livotec"};
const mailbox=async()=>(await fetch(BASE+"/__mailbox")).json();
function client(){const c={token:""};
 c.call=async(m,p,b)=>{const r=await fetch(BASE+p,{method:m,headers:Object.assign({},H,c.token?{"X-SR-Token":c.token}:{}),body:b?JSON.stringify(b):undefined});let j={};try{j=await r.json();}catch(e){}return{s:r.status,j};};
 c.login=async(email,name)=>{let r=await c.call("POST","/api/auth/request",{email,password:"matkhau123",name, phone: "0901234567"});
  if(r.j.needsOtp){const m=(await mailbox()).filter(x=>x.to===email).pop();r=await c.call("POST","/api/auth/request",{email,password:"matkhau123",name, phone: "0901234567",otp:(m.subject.match(/(\d{6})/)||[])[1]});}
  c.token=r.j.token;return c;};return c;}
(async()=>{
 const admin=await client().login("boss@livotec.vn","Admin");
 const asm1=await client().login("asm@livotec.vn","Trần Minh Quân");
 const asm2=await client().login("asm2@livotec.vn","ASM Hai");
 await admin.call("POST","/api/org",{op:"addAsm",email:"asm2@livotec.vn",name:"ASM Hai",nganh:[1,2]});
 const t1=await asm1.call("GET","/api/team"); const mine=t1.j.members.map(m=>m.uid);
 const t2=await asm2.call("GET","/api/team");
 const ok=(n,c)=>console.log((c?"PASS ":"FAIL ")+n);
 ok("ASM1 thấy "+mine.length+" nhân sự của mình",mine.length===8);
 ok("ASM2 chưa có nhân sự nào ("+t2.j.members.length+")",t2.j.members.length===0);
 const t2b=await asm2.call("GET","/api/team?asm=asm@livotec.vn");
 ok("ASM2 gắn ?asm=ASM1 vẫn không thấy người của ASM1",t2b.j.members.length===0);
 const d=await asm2.call("POST","/api/directive",{op:"send",to:[mine[0]],text:"thử giao trái quyền",date:t1.j.today,kind:"focus"});
 ok("ASM2 giao việc cho SR của ASM1 bị từ chối ("+d.s+")",d.s===400);
 const d2=await asm2.call("POST","/api/directive",{op:"send",to:"all",text:"thử cả nhóm",date:t1.j.today,kind:"note"});
 ok("ASM2 giao 'cả nhóm' không lọt sang nhóm ASM1 ("+d2.s+")",d2.s===400);
 const r=await asm2.call("POST","/api/team",{op:"removeMember",uid:mine[0]});
 ok("ASM2 gỡ SR của ASM1 bị chặn ("+r.s+")",r.s===403);
 const o=await asm1.call("GET","/api/org"); ok("ASM không vào được /api/org ("+o.s+")",o.s===403);
 const o2=await asm1.call("POST","/api/org",{op:"addAsm",email:"x@livotec.vn",name:"X"}); ok("ASM không tự cấp quyền ASM ("+o2.s+")",o2.s===403);
 const o3=await asm1.call("POST","/api/org",{op:"assign",uid:mine[0],asmEmail:"asm2@livotec.vn",lock:true}); ok("ASM không tự chuyển SR sang ASM khác ("+o3.s+")",o3.s===403);
 const au=await asm1.call("GET","/api/admin/users"); ok("ASM không xem danh sách tài khoản ("+au.s+")",au.s===403||au.s===404);
 const ok1=await asm1.call("POST","/api/directive",{op:"send",to:[mine[0]],text:"giao đúng người",date:t1.j.today,kind:"focus"});
 ok("ASM1 giao việc cho SR của mình thành công ("+ok1.s+")",ok1.s===200);
 const mix=await asm1.call("POST","/api/directive",{op:"send",to:[mine[1],"0123456789abcdef0123456789abcdef"],text:"lẫn uid lạ",date:t1.j.today,kind:"note"});
 ok("uid lạ trong danh sách bị bỏ qua, chỉ gửi "+mix.j.sent+" người",mix.s===200&&mix.j.sent===1);
})();
