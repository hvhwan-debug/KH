// Vẽ ảnh cúp cho trang xác thực kết quả (kiemtra/trophy.png). Chạy: node dev/gen-trophy.js
const L=require(require("path").join(__dirname,"../api/node_modules/@napi-rs/canvas"));
const W=360,H=300,S=2,cv=L.createCanvas(W*S,H*S),c=cv.getContext("2d");c.scale(S,S);c.lineJoin="round";c.lineCap="round";
const lin=(x0,y0,x1,y1,st)=>{const g=c.createLinearGradient(x0,y0,x1,y1);st.forEach((s,i)=>g.addColorStop(i/(st.length-1),s));return g};
const cx=180;
// glow
let g=c.createRadialGradient(cx,150,10,cx,150,170);g.addColorStop(0,"rgba(255,230,150,.55)");g.addColorStop(.5,"rgba(120,200,255,.18)");g.addColorStop(1,"rgba(120,200,255,0)");c.fillStyle=g;c.fillRect(0,0,W,H);
// podium
c.beginPath();c.ellipse(cx,262,150,24,0,0,Math.PI*2);c.fillStyle="rgba(120,210,255,.35)";c.fill();
c.beginPath();c.ellipse(cx,258,120,18,0,0,Math.PI*2);c.strokeStyle="rgba(170,235,255,.9)";c.lineWidth=2.5;c.stroke();
c.fillStyle=lin(0,226,0,256,["#3E8BF0","#1653C6"]);c.beginPath();c.ellipse(cx,250,96,15,0,0,Math.PI);c.lineTo(cx-96,234);c.ellipse(cx,234,96,15,0,Math.PI,0,true);c.closePath();c.fill();
c.beginPath();c.ellipse(cx,234,96,15,0,0,Math.PI*2);c.fillStyle=lin(cx-96,0,cx+96,0,["#9AD2FF","#E8F6FF","#9AD2FF"]);c.fill();
c.beginPath();c.ellipse(cx,234,80,11,0,0,Math.PI*2);c.fillStyle="#5BA6F5";c.fill();
// base
const gold=(x0,x1)=>lin(x0,0,x1,0,["#B8741A","#FFD45A","#FFF1A8","#F2B12E","#A8650F"]);
c.fillStyle=gold(cx-48,cx+48);c.beginPath();c.moveTo(cx-48,228);c.lineTo(cx+48,228);c.lineTo(cx+42,206);c.lineTo(cx-42,206);c.closePath();c.fill();
c.fillStyle=gold(cx-36,cx+36);c.fillRect(cx-36,196,72,12);
c.fillStyle="#7A4A0E";c.globalAlpha=.25;c.fillRect(cx-36,206,72,2);c.globalAlpha=1;
// stem
c.fillStyle=gold(cx-14,cx+14);c.beginPath();c.moveTo(cx-10,150);c.lineTo(cx+10,150);c.quadraticCurveTo(cx+8,178,cx+22,196);c.lineTo(cx-22,196);c.quadraticCurveTo(cx-8,178,cx-10,150);c.fill();
c.beginPath();c.ellipse(cx,166,16,5,0,0,Math.PI*2);c.fillStyle=gold(cx-16,cx+16);c.fill();
// handles
c.lineWidth=11;c.strokeStyle=gold(cx-100,cx+100);
c.beginPath();c.moveTo(cx-64,48);c.bezierCurveTo(cx-118,46,cx-112,118,cx-44,124);c.stroke();
c.beginPath();c.moveTo(cx+64,48);c.bezierCurveTo(cx+118,46,cx+112,118,cx+44,124);c.stroke();
// cup
c.fillStyle=gold(cx-72,cx+72);c.beginPath();c.moveTo(cx-74,34);c.lineTo(cx+74,34);c.bezierCurveTo(cx+74,110,cx+44,150,cx,154);c.bezierCurveTo(cx-44,150,cx-74,110,cx-74,34);c.fill();
c.beginPath();c.ellipse(cx,34,74,11,0,0,Math.PI*2);c.fillStyle=lin(0,24,0,46,["#FFF3B0","#E8A21E"]);c.fill();
c.beginPath();c.ellipse(cx,35,64,7,0,0,Math.PI*2);c.fillStyle="#B9761A";c.fill();
// shine
c.globalAlpha=.55;c.fillStyle="#FFFBE0";c.beginPath();c.moveTo(cx-52,48);c.bezierCurveTo(cx-54,92,cx-38,124,cx-20,138);c.bezierCurveTo(cx-44,120,cx-60,92,cx-60,48);c.fill();c.globalAlpha=1;
// star medallion
c.beginPath();c.arc(cx,86,27,0,Math.PI*2);c.fillStyle=lin(0,60,0,112,["#FFE07A","#D9901A"]);c.fill();c.lineWidth=3;c.strokeStyle="#FFF3B5";c.stroke();
c.beginPath();for(let i=0;i<10;i++){const r=i%2?7.5:17,a=-Math.PI/2+i*Math.PI/5;c.lineTo(cx+Math.cos(a)*r,86+Math.sin(a)*r)}c.closePath();c.fillStyle=lin(0,70,0,104,["#FFF6C8","#F7B733"]);c.fill();c.lineWidth=1.5;c.strokeStyle="#C47F12";c.stroke();
// laurels
function laurel(sx){c.save();c.translate(cx+sx*104,196);c.scale(sx,1);
 c.strokeStyle="rgba(235,245,255,.95)";c.lineWidth=3;c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(-26,-50,-6,-112);c.stroke();
 for(let i=0;i<7;i++){const t=i/6,x=-26*2*t*(1-t)+(-6)*t*t,y=-112*t*t-0*(1-t);const px=(1-t)*(1-t)*0+2*(1-t)*t*(-26)+t*t*(-6),py=2*(1-t)*t*(-50)+t*t*(-112);
  [[-1,-.6],[1,.3]].forEach(([d,rot])=>{c.save();c.translate(px,py);c.rotate(d*0.9-0.2);c.beginPath();c.ellipse(d*10,0,11,4.6,0,0,Math.PI*2);c.fillStyle=lin(-10,0,10,0,["#FFFFFF","#BFD8F5"]);c.fill();c.restore()})}
 c.restore()}
laurel(-1);laurel(1);
// confetti
[[40,40,"#FFC21A",.5],[300,30,"#3DE0A0",-.6],[320,90,"#7FD3FF",.3],[60,120,"#FF6B6B",-.3],[290,150,"#FFC21A",.8],[30,180,"#7FD3FF",.2],[110,20,"#FF6B6B",.9],[255,60,"#FFFFFF",.4]].forEach(([x,y,col,r])=>{c.save();c.translate(x,y);c.rotate(r);c.fillStyle=col;c.fillRect(-7,-3,14,6);c.restore()});
cv.encode("png").then((b) => require("fs").writeFileSync(require("path").join(__dirname, "../kiemtra/trophy.png"), b));
