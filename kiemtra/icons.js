/* icons.js — shared modern SVG icon set (Lucide-style, stroke-based, currentColor)
   Usage: ICON('name') returns an inline <svg> string, 1em square, inherits color/size from CSS. */
(function (global) {
  var PATHS = {
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    'users': '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M2 21c0-3.6 3.1-6 7-6s7 2.4 7 6"/><path d="M16 11a3.5 3.5 0 0 0 0-7"/><path d="M23 21c0-3-2.3-5.3-5.5-5.9"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'x': '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    'alert-triangle': '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'chevron-right': '<path d="M9 18l6-6-6-6"/>',
    'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
    'arrow-up': '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
    'arrow-down': '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
    'arrow-up-right': '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    'sparkle': '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    'star': '<path d="M12 2.5l2.9 6 6.6.7-4.9 4.6 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.6 6.6-.7z"/>',
    'lock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    'message-circle': '<path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 9 9 0 0 1-3.6-.8L3 20l1-5.2A8.4 8.4 0 1 1 21 11.5z"/>',
    'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    'edit': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
    'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'mail': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    'bell': '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    'megaphone': '<path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8a4 4 0 0 1 0 8"/><path d="M18 5a8 8 0 0 1 0 14"/>',
    'monitor': '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    'handshake': '<path d="M8 13l3 3a2 2 0 0 0 3 0l5-5"/><path d="M2 12l5-5 4 2 3-2 5 5-3 3-2-2-3 2-4-2-2 2z"/>',
    'trending-up': '<path d="M3 17l6-6 4 4 7-8"/><path d="M14 7h6v6"/>',
    'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    'droplet': '<path d="M12 2.7s6 7 6 11.3a6 6 0 1 1-12 0c0-4.3 6-11.3 6-11.3z"/>',
    'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22V4"/>',
    'shopping-cart': '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    'rocket': '<path d="M4.5 16.5c-1.5 1.5-2 5-2 5s3.5-.5 5-2c1-1 1-2.5 0-3.5-1-1-2.5-1-3 .5z"/><path d="M12 15l-3-3c2-5 7-10 11-9 1 4-4 9-9 11z"/><path d="M9 12l3 3"/>',
    'flame': '<path d="M12 2s5 4 5 10a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5 0 1.5 1 2 1.5 1C9 7 10 4 12 2z"/>',
    'thumbs-up': '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17 20H7"/>',
    'thumbs-down': '<path d="M17 13V4h3v9z"/><path d="M17 13l-4 7a2 2 0 0 1-2-2v-4H6a2 2 0 0 1-2-2.3l1.3-6A2 2 0 0 1 7 4h10"/>',
    'bot': '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 2v4M8 14h.01M16 14h.01"/>',
    'paperclip': '<path d="M21.4 11.5 12 20.9a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 18.9a2 2 0 0 1-2.8-2.8l7.8-7.8"/>',
    'trash': '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    'download': '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    'folder': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'cloud': '<path d="M7 18a4.5 4.5 0 0 1-.5-9 5.5 5.5 0 0 1 10.7-1.8A4 4 0 0 1 17 18z"/>',
    'camera': '<path d="M4 8a2 2 0 0 1 2-2h1l1.5-2h7L17 6h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    'book-open': '<path d="M2 5a2 2 0 0 1 2-2h4a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2z"/><path d="M22 5a2 2 0 0 0-2-2h-4a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z"/>',
    'save': '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
    'clipboard': '<rect x="6" y="4" width="12" height="18" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 11h6M9 15h4"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    'shuffle': '<path d="M16 3h5v5"/><path d="M4 20 20 4"/><path d="M4 4l4 4"/><path d="M15 15l5 5"/>',
    'corner-up-left': '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a4 4 0 0 1 4 4v7"/>',
    'menu': '<path d="M3 6h18M3 12h18M3 18h18"/>',
    'flask-conical': '<path d="M9 2h6"/><path d="M10 2v6.5L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8.5V2"/>',
    'bar-chart': '<path d="M3 21h18"/><path d="M7 21V10M12 21V4M17 21v-7"/>',
    'eye': '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
    'repeat': '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    'corner-down-right': '<path d="M15 10l5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/>',
    'cake': '<path d="M12 2v3"/><path d="M4 21v-7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7z"/><path d="M4 16h16"/><circle cx="12" cy="5" r="1"/>',
    'gift': '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18"/><path d="M12 8c-2 0-3.5-1.5-3.5-3S10 2 12 8zM12 8c2 0 3.5-1.5 3.5-3S14 2 12 8z"/>',
    'phone': '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 3a2 2 0 0 1-.5 2.1L8 10.1a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .3 2 .5 3 .7a2 2 0 0 1 1.6 2z"/>',
    'refresh-cw': '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-4.4L23 10"/><path d="M20.5 15a9 9 0 0 1-14.9 4.4L1 14"/>'
  };

  function ICON(name, opts) {
    opts = opts || {};
    var body = PATHS[name];
    if (!body) { return ''; }
    var size = opts.size || '1em';
    var cls = opts.class ? (' ' + opts.class) : '';
    return '<svg class="icon-svg' + cls + '" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.15em">' + body + '</svg>';
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = ICON; }
  global.ICON = ICON;
})(typeof window !== 'undefined' ? window : globalThis);
