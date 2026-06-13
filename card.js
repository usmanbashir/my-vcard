// card.js — vCard overlay UI (vanilla DOM) + QR rendering + scan mode.
// Exposes: window.VCard = { BRANDS, buildVCard, renderCard, openScan }

(function () {
  'use strict';

  var PRISM_LOGO = window.PRISM_LOGO || null;
  var WAVE_LOGO = window.WAVECRAFT_LOGO || null;

  var BRANDS = {
    prismcx: {
      name: 'Usman Bashir',
      title: 'Founder',
      org: 'PrismCX',
      url: 'prismcx.com',
      urlFull: 'https://prismcx.com/',
      email: 'usman@prismcx.com',
      phone: '+966 50 586 7123',
      phoneRaw: '+966505867123',
      linkedin: 'usm.io/linkedin',
      linkedinFull: 'https://www.linkedin.com/in/usmanbashir',
      logo: PRISM_LOGO,
    },
    wavecraft: {
      name: 'Usman Bashir',
      title: 'Founder',
      org: 'Wavecraft',
      url: 'wavecrafthq.com',
      urlFull: 'https://wavecrafthq.com/',
      email: 'usman@wavecrafthq.com',
      phone: '+966 50 586 7123',
      phoneRaw: '+966505867123',
      linkedin: 'usm.io/linkedin',
      linkedinFull: 'https://www.linkedin.com/in/usmanbashir',
      logo: WAVE_LOGO,
    },
    personal: {
      name: 'Usman Bashir',
      title: 'Tech Consultant & Educator',
      org: '',
      personal: true,
      url: 'usmanbashir.com',
      urlFull: 'https://usmanbashir.com/',
      email: 'me@usmanbashir.com',
      phone: '+966 50 586 7123',
      phoneRaw: '+966505867123',
      linkedin: 'usm.io/linkedin',
      linkedinFull: 'https://www.linkedin.com/in/usmanbashir',
      logo: null,
    },
  };

  function buildVCard(b) {
    var tp = b.personal ? 'HOME' : 'WORK';
    var lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Bashir;Usman;;;',
      'FN:' + b.name,
    ];
    if (b.org) lines.push('ORG:' + b.org);
    lines.push(
      'TITLE:' + b.title,
      'TEL;TYPE=CELL,' + tp + ':' + b.phoneRaw,
      'EMAIL;TYPE=' + tp + ',INTERNET:' + b.email,
      'URL;TYPE=' + tp + ':' + b.urlFull,
      'URL:' + b.linkedinFull,
      'END:VCARD'
    );
    return lines.join('\n');
  }

  // ── icons ──
  var ICON_PATHS = {
    link: '<path d="M9 13a4 4 0 0 0 5.66 0l3-3A4 4 0 1 0 12 4.34l-1.5 1.5"></path><path d="M15 11a4 4 0 0 0-5.66 0l-3 3A4 4 0 1 0 12 19.66l1.5-1.5"></path>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"></rect><path d="M4 7l8 6 8-6"></path>',
    phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L17 18l2 5-3 1A16 16 0 0 1 4 7Z"></path>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="4.5"></rect><line x1="7.4" y1="7.5" x2="7.4" y2="7.6"></line><line x1="7.4" y1="10.6" x2="7.4" y2="16.5"></line><path d="M11 16.5 V11.6 M11 13.5 a2.3 2.3 0 0 1 4.6 0 V16.5"></path>',
    expand: '<path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"></path>',
    x: '<path d="M6 6l12 12M18 6L6 18"></path>',
  };

  function iconSvg(name, color, size) {
    size = size || 17;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24">' +
      '<g fill="none" stroke="' + color + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      ICON_PATHS[name] + '</g></svg>';
  }

  // ── QR matrix (real, scannable; faux fallback if lib missing) ──
  function buildMatrix(data) {
    try {
      if (typeof qrcode === 'function') {
        var qr = qrcode(0, 'Q');
        qr.addData(data);
        qr.make();
        var n = qr.getModuleCount();
        var m = [];
        for (var r = 0; r < n; r++) {
          var row = [];
          for (var c = 0; c < n; c++) row.push(qr.isDark(r, c));
          m.push(row);
        }
        return m;
      }
    } catch (e) { console.warn('QR gen failed, using fallback', e); }

    var N = 25;
    var M = [];
    var hash = function (a, b) {
      var h = (a * 73856093) ^ (b * 19349663);
      h = (h ^ (h >> 13)) * 1274126177;
      return ((h ^ (h >> 16)) & 0xff) / 255;
    };
    for (var rr = 0; rr < N; rr++) {
      var rowv = [];
      for (var cc = 0; cc < N; cc++) rowv.push(hash(rr, cc) > 0.55);
      M.push(rowv);
    }
    var finder = function (or_, oc) {
      for (var r2 = 0; r2 < 7; r2++) for (var c2 = 0; c2 < 7; c2++) {
        var edge = r2 === 0 || r2 === 6 || c2 === 0 || c2 === 6;
        var core = r2 >= 2 && r2 <= 4 && c2 >= 2 && c2 <= 4;
        M[or_ + r2][oc + c2] = edge || core;
      }
    };
    finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
    return M;
  }

  function qrSvg(opts) {
    var data = opts.data, size = opts.size || 132;
    var dark = opts.dark || '#0a0b12', light = opts.light || '#ffffff';
    var radius = opts.radius != null ? opts.radius : 0.5;
    var pad = opts.pad != null ? opts.pad : 3;
    var logo = opts.logo || null;

    var m = buildMatrix(data);
    var n = m.length;
    var cell = (size - pad * 2) / n;
    var rects = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!m[r][c]) continue;
        rects += '<rect x="' + (pad + c * cell).toFixed(2) + '" y="' + (pad + r * cell).toFixed(2) +
          '" width="' + (cell + 0.4).toFixed(2) + '" height="' + (cell + 0.4).toFixed(2) +
          '" rx="' + (cell * radius * 0.5).toFixed(2) + '" fill="' + dark + '"></rect>';
      }
    }
    var logoG = '';
    if (logo) {
      var box = size * 0.34, ibox = box * 0.82, lsz = ibox * 0.82;
      var cb = (size - box) / 2, ci = (size - ibox) / 2, cl = (size - lsz) / 2;
      logoG = '<g shape-rendering="geometricPrecision">' +
        '<rect x="' + cb + '" y="' + cb + '" width="' + box + '" height="' + box + '" rx="' + (box * 0.28) + '" fill="' + light + '"></rect>' +
        '<rect x="' + ci + '" y="' + ci + '" width="' + ibox + '" height="' + ibox + '" rx="' + (ibox * 0.26) + '" fill="' + dark + '"></rect>' +
        '<image href="' + logo + '" x="' + cl + '" y="' + cl + '" width="' + lsz + '" height="' + lsz + '" preserveAspectRatio="xMidYMid meet"></image>' +
        '</g>';
    }
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" style="display:block">' +
      '<rect x="0" y="0" width="' + size + '" height="' + size + '" rx="' + (size * 0.12) + '" fill="' + light + '"></rect>' +
      rects + logoG + '</svg>';
  }

  function contactRowHtml(icon, value, href, accent) {
    return '<a class="crow" href="' + href + '" target="_blank" rel="noreferrer">' +
      '<span class="cicon">' + iconSvg(icon, accent) + '</span>' +
      '<span class="cval">' + value + '</span></a>';
  }

  // ── full-screen scan mode: big high-contrast QR ──
  function openScan(brandKey, opts) {
    opts = opts || {};
    var b = BRANDS[brandKey];
    var label = b.org || b.title;
    var el = document.createElement('div');
    el.className = 'scan';
    el.innerHTML =
      '<button class="scan-close" aria-label="Close">' + iconSvg('x', '#fff') + '</button>' +
      '<div class="scan-id">' +
        '<div class="scan-org">' + label + '</div>' +
        '<div class="scan-name">' + b.name + '</div>' +
      '</div>' +
      '<div class="scan-qr">' + qrSvg({ data: buildVCard(b), size: 280, radius: 0.18, pad: 0, logo: null, dark: '#0a0b12' }) + '</div>' +
      '<div class="scan-foot">' +
        '<div class="scan-pill"><span class="scan-dot"></span>Point your camera here</div>' +
        '<div class="scan-url">' + b.url + '</div>' +
      '</div>' +
      '<div class="scan-hint">tap anywhere to close</div>';

    function close() {
      window.removeEventListener('keydown', onKey);
      el.remove();
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    el.addEventListener('click', close);
    window.addEventListener('keydown', onKey);

    document.body.appendChild(el);
    if (opts.onOpen) opts.onOpen();
    return close;
  }

  // ── the card overlay ──
  // cfg: { brand, accent, iconAccents, center, onScanOpen, onScanClose }
  function renderCard(cfg) {
    var b = BRANDS[cfg.brand] || BRANDS.prismcx;
    var ic = cfg.iconAccents || [cfg.accent, cfg.accent, cfg.accent, cfg.accent];
    var el = document.createElement('div');
    el.className = 'vcard' + (cfg.center ? ' center' : '');
    el.innerHTML =
      '<div class="scrim"></div>' +
      '<div class="hero">' +
        '<h1>' + b.name + '</h1>' +
        '<div class="role">' + (b.org ? b.title + ' · ' + b.org : b.title) + '</div>' +
      '</div>' +
      '<div class="glass">' +
        '<div class="grow">' +
          '<div class="qrbox" role="button" aria-label="Enlarge QR code for scanning" title="Tap to enlarge for scanning">' +
            qrSvg({ data: buildVCard(b), size: 120, radius: 0.55, pad: 2, logo: b.logo }) +
            '<span class="expand">' + iconSvg('expand', '#fff') + '</span>' +
          '</div>' +
          '<div class="contacts">' +
            contactRowHtml('link', b.url, b.urlFull, ic[0]) +
            contactRowHtml('linkedin', b.linkedin, b.linkedinFull, ic[1]) +
            contactRowHtml('mail', b.email, 'mailto:' + b.email, ic[2]) +
            contactRowHtml('phone', b.phone, 'tel:' + b.phoneRaw, ic[3]) +
          '</div>' +
        '</div>' +
      '</div>';

    el.querySelector('.qrbox').addEventListener('click', function (e) {
      e.stopPropagation();
      openScan(cfg.brand, { onOpen: cfg.onScanOpen, onClose: cfg.onScanClose });
    });

    return el;
  }

  window.VCard = { BRANDS: BRANDS, buildVCard: buildVCard, renderCard: renderCard, openScan: openScan, qrSvg: qrSvg };
})();
