/* Service worker tối giản: chỉ dùng để hiện thông báo nhắc việc và mở lại ứng dụng khi bấm vào thông báo.
   Không lưu cache nên không bao giờ giữ phiên bản cũ của ứng dụng. */
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  var url=(e.notification.data&&e.notification.data.url)||'/';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){
      var c=list[i];
      if('focus' in c){if('navigate' in c){try{c.navigate(url);}catch(_){}}return c.focus();}
    }
    return self.clients.openWindow(url);
  }));
});
