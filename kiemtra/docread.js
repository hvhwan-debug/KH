/* Đọc chữ từ tài liệu NGAY TRÊN TRÌNH DUYỆT (file không gửi đi đâu để đọc):
   .txt .md .csv .json .html  ·  Word .docx  ·  Excel .xlsx  ·  PowerPoint .pptx  ·  PDF (có chữ).
   Word/Excel/PowerPoint là gói nén XML nên đọc bằng bộ giải nén riêng, không cần thư viện ngoài.
   PDF dùng pdf.js, chỉ tải từ cdnjs khi người dùng thật sự chọn file PDF.
   DocRead.read(file) -> {title,text,kind}   (lỗi có thuộc tính userMessage để hiện cho người dùng)
   DocRead.splitText(text,max)               tách văn bản dài thành nhiều phần, ưu tiên cắt trước dòng tiêu đề "# ..."
   DocRead.importFiles(files,opt)            nhập một hoặc nhiều file (xem bên dưới) */
(function(root){
'use strict';
var DocRead={pdfBase:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'};
var MAX_FILE=25*1024*1024, MAX_CHARS=2000000;

function fail(msg,code){var e=new Error(msg);e.userMessage=msg;e.code=code||'x';return e}
function ext(n){var m=/\.([a-z0-9]+)$/i.exec(n||'');return m?m[1].toLowerCase():''}
function baseName(n){return String(n||'tài liệu').replace(/\.[^.]+$/,'').trim()||'tài liệu'}
function clean(t){
  return String(t==null?'':t).replace(/\r\n?/g,'\n').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[ \t\u00A0]+\n/g,'\n').replace(/\n[ \t]+\n/g,'\n\n').replace(/\n{3,}/g,'\n\n').trim();
}

/* ---------- giải nén .zip (docx/xlsx/pptx) ---------- */
function u16(b,o){return b[o]|(b[o+1]<<8)}
function u32(b,o){return (b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0}
async function inflateRaw(bytes){
  if(typeof DecompressionStream==='undefined')throw fail('Trình duyệt quá cũ để đọc file Word/Excel/PowerPoint. Hãy cập nhật trình duyệt hoặc dán nội dung vào ô bên dưới.','old');
  var ds=new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}
async function unzip(buf){
  var b=new Uint8Array(buf),e=-1;
  for(var i=b.length-22;i>=Math.max(0,b.length-65557);i--){if(u32(b,i)===0x06054b50){e=i;break}}
  if(e<0)throw fail('Không mở được file (có thể bị đặt mật khẩu hoặc bị hỏng).','zip');
  var n=u16(b,e+10),p=u32(b,e+16),files={},dec=new TextDecoder('utf-8');
  for(var k=0;k<n;k++){
    if(u32(b,p)!==0x02014b50)break;
    var method=u16(b,p+10),csize=u32(b,p+20),nl=u16(b,p+28),el=u16(b,p+30),cl=u16(b,p+32),lho=u32(b,p+42);
    files[dec.decode(b.subarray(p+46,p+46+nl))]={method:method,csize:csize,lho:lho};
    p+=46+nl+el+cl;
  }
  async function read(name){
    var f=files[name];if(!f)return null;
    var nl=u16(b,f.lho+26),el=u16(b,f.lho+28),s=f.lho+30+nl+el,data=b.subarray(s,s+f.csize);
    if(f.method===0)return data;
    if(f.method===8)return inflateRaw(data);
    throw fail('File dùng kiểu nén chưa hỗ trợ.','method');
  }
  return {names:Object.keys(files),read:read,text:async function(name){var d=await read(name);return d?dec.decode(d):null}};
}
function parseXml(xml){
  var doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw fail('Nội dung file bị lỗi, không đọc được.','xml');
  return doc;
}
function kids(n,name){var r=[];for(var c=n.firstChild;c;c=c.nextSibling)if(c.nodeType===1&&c.localName===name)r.push(c);return r}
function kid(n,name){return kids(n,name)[0]||null}
function attr(n,name){if(!n)return '';var v=n.getAttribute(name);if(v!==null)return v;for(var i=0;i<n.attributes.length;i++)if(n.attributes[i].localName===name)return n.attributes[i].value;return ''}

/* ---------- Word (.docx) ---------- */
function runText(node){
  var s='';
  for(var c=node.firstChild;c;c=c.nextSibling){
    if(c.nodeType!==1)continue;var l=c.localName;
    if(l==='t')s+=c.textContent;
    else if(l==='tab')s+='\t';
    else if(l==='br'||l==='cr')s+='\n';
    else if(l==='noBreakHyphen')s+='-';
    else if(l==='pPr'||l==='rPr'||l==='instrText'||l==='delText'||l==='del')continue;
    else s+=runText(c);
  }
  return s;
}
function headingLevel(styleId,names){
  var nm=String(names[styleId]||styleId||'').toLowerCase().replace(/\s+/g,' ').trim(),m;
  if((m=/^(?:heading|tiêu đề|tieu de)\s*(\d)$/.exec(nm))||(m=/^heading(\d)$/.exec(nm)))return +m[1];
  if(nm==='title'||nm==='tiêu đề'||nm==='subtitle')return 1;
  return 0;
}
function docxPara(p,names){
  var txt=runText(p).replace(/\n+$/,'').trim();if(!txt)return '';
  var pPr=kid(p,'pPr'),style=pPr?attr(kid(pPr,'pStyle'),'val'):'',lvl=headingLevel(style,names);
  if(lvl)return '#'.repeat(Math.min(lvl,4))+' '+txt;
  if(pPr&&(kid(pPr,'numPr')||/^(list|danh sách|danh sach)/i.test(String(names[style]||style||''))))return '- '+txt;
  return txt;
}
function docxBlocks(node,names,out){
  for(var c=node.firstChild;c;c=c.nextSibling){
    if(c.nodeType!==1)continue;var l=c.localName;
    if(l==='p'){var t=docxPara(c,names);if(t)out.push(t)}
    else if(l==='tbl'){
      kids(c,'tr').forEach(function(tr){
        var cells=kids(tr,'tc').map(function(tc){var o=[];docxBlocks(tc,names,o);return o.join(' ').replace(/\s+/g,' ').trim()});
        if(cells.some(Boolean))out.push(cells.join(' | '));
      });
    }else if(l==='sdt'||l==='sdtContent'||l==='customXml'){docxBlocks(c,names,out)}
  }
}
async function readDocx(z){
  var xml=await z.text('word/document.xml');
  if(!xml)throw fail('Đây không phải file Word (.docx) hợp lệ.','docx');
  var names={},st=await z.text('word/styles.xml');
  if(st)kids(parseXml(st).documentElement,'style').forEach(function(s){names[attr(s,'styleId')]=attr(kid(s,'name'),'val')});
  var body=kid(parseXml(xml).documentElement,'body'),out=[];
  if(body)docxBlocks(body,names,out);
  return out.join('\n\n').replace(/\n\n(- )/g,'\n$1');
}

/* ---------- Excel (.xlsx) ---------- */
function colIndex(ref){var m=/^([A-Z]+)/i.exec(ref||'');if(!m)return -1;var s=m[1].toUpperCase(),n=0;for(var i=0;i<s.length;i++)n=n*26+(s.charCodeAt(i)-64);return n-1}
function siText(si){var s='';(function w(n){for(var c=n.firstChild;c;c=c.nextSibling){if(c.nodeType!==1)continue;if(c.localName==='t')s+=c.textContent;else if(c.localName!=='rPh'&&c.localName!=='phoneticPr')w(c)}})(si);return s}
async function readXlsx(z){
  var wbx=await z.text('xl/workbook.xml');
  if(!wbx)throw fail('Đây không phải file Excel (.xlsx) hợp lệ.','xlsx');
  var shared=[],ss=await z.text('xl/sharedStrings.xml');
  if(ss)kids(parseXml(ss).documentElement,'si').forEach(function(si){shared.push(siText(si))});
  var rels={},rx=await z.text('xl/_rels/workbook.xml.rels');
  if(rx)kids(parseXml(rx).documentElement,'Relationship').forEach(function(r){var t=attr(r,'Target');rels[attr(r,'Id')]=t.charAt(0)==='/'?t.slice(1):'xl/'+t});
  var sheets=kids(kid(parseXml(wbx).documentElement,'sheets')||parseXml(wbx).documentElement,'sheet'),out=[];
  for(var i=0;i<sheets.length;i++){
    var sh=sheets[i];if(/hidden/i.test(attr(sh,'state')))continue;
    var path=rels[attr(sh,'id')]||('xl/worksheets/sheet'+(i+1)+'.xml'),x=await z.text(path);if(!x)continue;
    var data=kid(parseXml(x).documentElement,'sheetData'),rows=[];
    if(data)kids(data,'row').slice(0,5000).forEach(function(r){
      var cells=[];
      kids(r,'c').forEach(function(c){
        var idx=colIndex(attr(c,'r')),t=attr(c,'t'),v=kid(c,'v'),val='';
        if(t==='s')val=shared[parseInt(v&&v.textContent,10)]||'';
        else if(t==='inlineStr'){var is=kid(c,'is');val=is?siText(is):''}
        else if(t==='b')val=v&&v.textContent==='1'?'Có':'Không';
        else val=v?v.textContent:'';
        val=String(val).replace(/\s+/g,' ').trim();
        if(idx<0)idx=cells.length;while(cells.length<idx)cells.push('');cells[idx]=val;
      });
      while(cells.length&&!cells[cells.length-1])cells.pop();
      if(cells.some(Boolean))rows.push(cells.join(' | '));
    });
    if(rows.length)out.push('# '+attr(sh,'name')+'\n'+rows.join('\n'));
  }
  return out.join('\n\n');
}

/* ---------- PowerPoint (.pptx) ---------- */
async function readPptx(z){
  var slides=z.names.filter(function(n){return /^ppt\/slides\/slide\d+\.xml$/.test(n)}).sort(function(a,b){return parseInt(a.match(/(\d+)\.xml$/)[1],10)-parseInt(b.match(/(\d+)\.xml$/)[1],10)});
  if(!slides.length)throw fail('Đây không phải file PowerPoint (.pptx) hợp lệ.','pptx');
  var out=[];
  for(var i=0;i<slides.length;i++){
    var doc=parseXml(await z.text(slides[i])),paras=[];
    (function w(n){for(var c=n.firstChild;c;c=c.nextSibling){if(c.nodeType!==1)continue;
      if(c.localName==='p'){var s='';(function t(m){for(var d=m.firstChild;d;d=d.nextSibling){if(d.nodeType!==1)continue;if(d.localName==='t')s+=d.textContent;else if(d.localName==='br')s+='\n';else t(d)}})(c);s=s.trim();if(s)paras.push(s)}
      else w(c)}})(doc.documentElement);
    if(paras.length)out.push('# Slide '+(i+1)+'\n'+paras.join('\n'));
  }
  return out.join('\n\n');
}

/* ---------- PDF (có chữ) ---------- */
var pdfP=null;
function loadPdfJs(){
  if(root.pdfjsLib)return Promise.resolve(root.pdfjsLib);
  if(!pdfP)pdfP=new Promise(function(ok,no){
    var s=document.createElement('script');s.src=DocRead.pdfBase+'pdf.min.js';
    s.onload=function(){if(root.pdfjsLib){root.pdfjsLib.GlobalWorkerOptions.workerSrc=DocRead.pdfBase+'pdf.worker.min.js';ok(root.pdfjsLib)}else{pdfP=null;no(fail('Không tải được bộ đọc PDF.','pdfjs'))}};
    s.onerror=function(){pdfP=null;no(fail('Không tải được bộ đọc PDF (cần kết nối mạng). Hãy thử lại hoặc dán nội dung vào ô bên dưới.','pdfjs'))};
    document.head.appendChild(s);
  });
  return pdfP;
}

// Ghép chữ của một trang PDF theo VỊ TRÍ (không theo thứ tự trong file): nhiều PDF tiếng Việt xuất chữ có dấu thành lớp riêng.
function pageText(items){
  var its=[],i;
  for(i=0;i<items.length;i++){var it=items[i];if(!it.transform||typeof it.str!=='string'||!it.str)continue;
    its.push({s:it.str,x:it.transform[4],y:it.transform[5],w:it.width||0,h:Math.abs(it.transform[3])||it.height||10})}
  if(!its.length)return '';
  var solid=its.filter(function(a){return /\S/.test(a.s)});
  // bỏ khoảng trắng "đệm" bị một chữ khác đè lên đúng vị trí đó
  its=its.filter(function(a){
    if(/\S/.test(a.s))return true;
    return !solid.some(function(o){return Math.abs(o.y-a.y)<o.h*0.4&&o.x<a.x+a.w-0.5&&o.x+o.w>a.x+0.5});
  });
  its.sort(function(a,b){return b.y-a.y||a.x-b.x});
  var lines=[],cur=null;
  its.forEach(function(a){
    if(!cur||Math.abs(a.y-cur.y)>Math.max(a.h,cur.h)*0.5){cur={y:a.y,h:a.h,items:[]};lines.push(cur)}
    cur.items.push(a);
  });
  var out='',prevY=null,prevH=0;
  lines.forEach(function(L){
    L.items.sort(function(a,b){return a.x-b.x});
    var t='',end=null;
    L.items.forEach(function(a){
      if(end!==null&&a.x-end>L.h*0.15&&t.slice(-1)!==' '&&a.s.charAt(0)!==' ')t+=' ';
      t+=a.s;end=Math.max(end===null?-1e9:end,a.x+a.w);
    });
    t=t.replace(/^[\uf0b7\uf0a7\uf076\u2022\u25cf\u25aa]\s*/,'- ').replace(/[ \t]+/g,' ').trim();
    if(!t)return;
    if(out)out+=(prevY!==null&&prevY-L.y>Math.max(prevH,L.h)*1.55)?'\n\n':'\n';
    out+=t;prevY=L.y;prevH=L.h;
  });
  return out;
}
async function readPdf(buf){
  var lib=await loadPdfJs(),doc;
  try{doc=await lib.getDocument({data:new Uint8Array(buf)}).promise}
  catch(e){if(e&&e.name==='PasswordException')throw fail('File PDF có đặt mật khẩu, chưa đọc được.','pw');throw fail('Không đọc được file PDF (có thể bị hỏng).','pdf')}
  var out=[],chars=0,pages=Math.min(doc.numPages,400);
  for(var p=1;p<=pages&&chars<MAX_CHARS;p++){
    var s=clean(pageText((await (await doc.getPage(p)).getTextContent()).items));
    chars+=s.length;if(s)out.push(s);
  }
  return {text:out.join('\n\n'),pages:doc.numPages};
}

// PDF tiếng Việt có chữ bị mất dấu/lộn thứ tự thường để lại nhiều "từ" chỉ có một phụ âm (vd. "s n ph m")
function suspicious(text){
  var w=String(text).split(/\s+/).filter(Boolean);if(w.length<30)return false;
  var one=w.filter(function(x){return /^[bcdfghjklmnpqrstvwxyzđ]$/i.test(x)}).length;
  return one/w.length>0.03;
}
/* ---------- đọc một file ---------- */
function htmlToText(h){
  var s=String(h).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi,'').replace(/<\/(p|div|li|tr|h[1-6]|section|article|table)>/gi,'\n').replace(/<br\s*\/?>/gi,'\n').replace(/<(h[1-6])[^>]*>/gi,function(m,t){return '\n'+'#'.repeat(Math.min(+t[1],4))+' '});
  return new DOMParser().parseFromString('<body>'+s+'</body>','text/html').body.textContent;
}
var LEGACY={doc:'Word cũ (.doc)',xls:'Excel cũ (.xls)',ppt:'PowerPoint cũ (.ppt)',rtf:'.rtf',odt:'.odt'};
DocRead.read=async function(file){
  if(!file)throw fail('Chưa chọn file.');
  var e=ext(file.name);
  if(LEGACY[e])throw fail('File '+LEGACY[e]+' chưa đọc được. Hãy mở file bằng Word/Excel/PowerPoint và Lưu thành '+(e==='xls'?'.xlsx':e==='ppt'?'.pptx':'.docx')+' hoặc PDF rồi chọn lại.','legacy');
  if(['txt','md','csv','json','html','htm','docx','xlsx','pptx','pdf'].indexOf(e)<0)throw fail('Chưa hỗ trợ định dạng ".'+(e||'?')+'". Dùng Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, .txt, .md, .csv hoặc dán nội dung.','type');
  if(file.size>MAX_FILE)throw fail('File quá lớn (tối đa '+Math.round(MAX_FILE/1048576)+' MB).','size');
  var text='',kind=e,pages;
  if(e==='txt'||e==='md'||e==='csv'||e==='json')text=await file.text();
  else if(e==='html'||e==='htm')text=htmlToText(await file.text());
  else{
    var buf=await file.arrayBuffer();
    if(e==='pdf'){var r=await readPdf(buf);text=r.text;pages=r.pages}
    else{var z=await unzip(buf);text=e==='docx'?await readDocx(z):e==='xlsx'?await readXlsx(z):await readPptx(z)}
  }
  text=clean(text).slice(0,MAX_CHARS);
  if(text.length<20)throw fail(e==='pdf'?'Không thấy chữ trong file PDF này (có thể là bản scan/ảnh). Hãy dùng bản PDF có chữ, hoặc dán nội dung.':'Không đọc được chữ nào từ file này.','empty');
  var warn=e==='pdf'&&suspicious(text)?'Chữ trong PDF này có thể bị mất dấu hoặc lộn thứ tự (do cách tạo file). Hãy kiểm tra kỹ nội dung, hoặc dùng file Word / bản PDF khác.':'';
  return {title:baseName(file.name),text:text,kind:kind,pages:pages,warn:warn};
};

/* ---------- tách văn bản dài ---------- */
DocRead.splitText=function(text,max){
  text=String(text||'');if(text.length<=max)return [text];
  var parts=[],cur='';
  function push(t){t=t.trim();if(t)parts.push(t)}
  text.split(/\n(?=#{1,4} )/).forEach(function(b){
    if(b.length>max){
      push(cur);cur='';var buf='';
      b.split('\n').forEach(function(line){
        while(line.length>max){push(buf);buf='';push(line.slice(0,max));line=line.slice(max)}
        if(buf&&(buf+'\n'+line).length>max){push(buf);buf=line}else buf=buf?buf+'\n'+line:line;
      });
      push(buf);return;
    }
    if(cur&&(cur+'\n'+b).length>max){push(cur);cur=b}else cur=cur?cur+'\n'+b:b;
  });
  push(cur);return parts;
};

/* ---------- nhập một hoặc nhiều file ----------
   opt.fill(title,text,note)  điền vào form để người dùng xem lại (khi chọn đúng 1 file)
   opt.save(title,text)       -> Promise<{ok,error}>  lưu ngay (khi chọn nhiều file, hoặc tách phần)
   opt.msg(text,kind)         hiện thông báo ('ok' hoặc lỗi);  opt.max (mặc định 60000), opt.part (mặc định 55000) */
DocRead.importFiles=async function(files,opt){
  files=[].slice.call(files||[]);if(!files.length)return [];
  var max=opt.max||60000,part=opt.part||55000,report=[];
  if(files.length===1){
    try{
      opt.msg('Đang đọc “'+files[0].name+'”…','');
      var d=await DocRead.read(files[0]),n=DocRead.splitText(d.text,part).length;
      opt.fill(d.title,d.text,d.text.length>max?'Nội dung dài '+d.text.length.toLocaleString('vi-VN')+' ký tự nên sẽ tự tách thành '+n+' tài liệu khi lưu.':'');
      opt.msg('Đã đọc “'+files[0].name+'” ('+d.text.length.toLocaleString('vi-VN')+' ký tự'+(d.pages?', '+d.pages+' trang':'')+'). Kiểm tra nội dung rồi bấm Lưu tài liệu.'+(d.text.length>max?' Nội dung dài nên sẽ tự tách thành '+n+' tài liệu.':'')+(d.warn?'\n⚠ '+d.warn:''),d.warn?'':'ok');
      return [{name:files[0].name,ok:true}];
    }catch(e){opt.msg(e.userMessage||'Không đọc được file “'+files[0].name+'”.','');return [{name:files[0].name,ok:false,error:e.userMessage}]}
  }
  var okN=0,lines=[];
  for(var i=0;i<files.length;i++){
    var f=files[i];opt.msg('Đang xử lý '+(i+1)+'/'+files.length+': '+f.name+'…','');
    try{
      var r=await DocRead.read(f),ps=DocRead.splitText(r.text,part),saved=0,err='';
      for(var k=0;k<ps.length;k++){
        var res=await opt.save(ps.length>1?r.title+' (phần '+(k+1)+'/'+ps.length+')':r.title,ps[k]);
        if(!res||!res.ok){err=(res&&res.error)||'Không lưu được.';break}saved++;
      }
      if(err)lines.push('✗ '+f.name+': '+err+(saved?' (đã lưu '+saved+'/'+ps.length+' phần)':''));
      else{okN++;lines.push('✓ '+f.name+(ps.length>1?' ('+ps.length+' phần)':'')+(r.warn?' ⚠ '+r.warn:''))}
      report.push({name:f.name,ok:!err,error:err});
    }catch(e){lines.push('✗ '+f.name+': '+(e.userMessage||'không đọc được.'));report.push({name:f.name,ok:false,error:e.userMessage})}
  }
  opt.msg('Đã lưu '+okN+'/'+files.length+' file.\n'+lines.join('\n'),okN===files.length?'ok':'');
  return report;
};

root.DocRead=DocRead;
})(typeof window!=='undefined'?window:globalThis);
