(function (global) {
  'use strict';

  var CM = (global.CM = global.CM || {});
  var svgUidCounter = 0;

  var OPTIONS = {
    bgColors: [
      '#f59e0b',
      '#ef4444',
      '#3b82f6',
      '#10b981',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
      '#f97316'
    ],
    skinTones: [
      '#fde2c4',
      '#f1c27d',
      '#d99b66',
      '#a56c43',
      '#6b4226'
    ],
    bodyTypes: [
      { id: 'slim', label: 'Zayıf' },
      { id: 'normal', label: 'Standart' },
      { id: 'athletic', label: 'Kaslı' },
      { id: 'chubby', label: 'Göbekli' }
    ],
    hairStyles: [
      { id: 'classic', label: 'Patron Taraması' },
      { id: 'curly', label: 'Dalgalı' },
      { id: 'bun', label: 'Şık Topuz' },
      { id: 'cap', label: 'Lüks Şapka' },
      { id: 'beanie', label: 'Fedora Şapka' },
      { id: 'fez', label: 'İstanbul Fesi' },
      { id: 'crown', label: 'Emlak Tacı' },
      { id: 'bald', label: 'Karizmatik Kel' }
    ],
    hairColors: [
      '#1e293b',
      '#4a2c18',
      '#92400e',
      '#d97706',
      '#dc2626',
      '#94a3b8'
    ],
    eyeStyles: [
      { id: 'normal', label: 'Keskin Bakış' },
      { id: 'happy', label: 'Gülen Göz' },
      { id: 'sunglasses', label: 'Patron Gözlüğü' },
      { id: 'glasses', label: 'Altın Çerçeve' },
      { id: 'wink', label: 'Kendinden Emin' },
      { id: 'star', label: 'Altın Monokl' }
    ],
    mouthStyles: [
      { id: 'smile', label: 'Özgüvenli Gülüş' },
      { id: 'grin', label: 'Emlakçı Sırıtışı' },
      { id: 'serious', label: 'Ciddi Patron' },
      { id: 'mustache', label: 'Klasik Bıyık' },
      { id: 'surprised', label: 'Sakallı Patron' }
    ],
    shirtColors: [
      '#0f172a',
      '#1e293b',
      '#7f1d1d',
      '#1e3a8a',
      '#064e3b',
      '#4c1d95'
    ]
  };

  function isValidHex(val) {
    return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val);
  }

  function pickValidOption(list, val, fallback) {
    for (var i = 0; i < list.length; i++) {
      var item = typeof list[i] === 'string' ? list[i] : list[i].id;
      if (item === val) return val;
    }
    return fallback;
  }

  function hexToRgb(hex) {
    var clean = hex.replace('#', '');
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16)
    };
  }

  function shadeHex(hex, percent) {
    var rgb = hexToRgb(hex);
    var adjust = function (c) {
      var v = Math.round(c + (percent < 0 ? c * percent : (255 - c) * percent));
      return Math.max(0, Math.min(255, v));
    };
    var toHex = function (n) {
      var s = n.toString(16);
      return s.length === 1 ? '0' + s : s;
    };
    return '#' + toHex(adjust(rgb.r)) + toHex(adjust(rgb.g)) + toHex(adjust(rgb.b));
  }

  function sanitizeAvatar(raw) {
    var av = raw && typeof raw === 'object' ? raw : {};
    return {
      bgColor: isValidHex(av.bgColor) ? av.bgColor : OPTIONS.bgColors[0],
      skinTone: isValidHex(av.skinTone) ? av.skinTone : OPTIONS.skinTones[1],
      bodyType: pickValidOption(OPTIONS.bodyTypes, av.bodyType, 'normal'),
      hairStyle: pickValidOption(OPTIONS.hairStyles, av.hairStyle, 'classic'),
      hairColor: isValidHex(av.hairColor) ? av.hairColor : OPTIONS.hairColors[0],
      eyeStyle: pickValidOption(OPTIONS.eyeStyles, av.eyeStyle, 'sunglasses'),
      mouthStyle: pickValidOption(OPTIONS.mouthStyles, av.mouthStyle, 'smile'),
      shirtColor: isValidHex(av.shirtColor) ? av.shirtColor : OPTIONS.shirtColors[0]
    };
  }

  function createDefaultAvatar(seedIndex) {
    var idx = Math.abs(Number(seedIndex) || 0);
    return sanitizeAvatar({
      bgColor: OPTIONS.bgColors[idx % OPTIONS.bgColors.length],
      skinTone: OPTIONS.skinTones[idx % OPTIONS.skinTones.length],
      bodyType: OPTIONS.bodyTypes[idx % OPTIONS.bodyTypes.length].id,
      hairStyle: OPTIONS.hairStyles[idx % OPTIONS.hairStyles.length].id,
      hairColor: OPTIONS.hairColors[idx % OPTIONS.hairColors.length],
      eyeStyle: OPTIONS.eyeStyles[idx % OPTIONS.eyeStyles.length].id,
      mouthStyle: OPTIONS.mouthStyles[idx % OPTIONS.mouthStyles.length].id,
      shirtColor: OPTIONS.shirtColors[idx % OPTIONS.shirtColors.length]
    });
  }

  function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function createRandomAvatar(forcedBgColor) {
    return sanitizeAvatar({
      bgColor: forcedBgColor || randomItem(OPTIONS.bgColors),
      skinTone: randomItem(OPTIONS.skinTones),
      bodyType: randomItem(OPTIONS.bodyTypes).id,
      hairStyle: randomItem(OPTIONS.hairStyles).id,
      hairColor: randomItem(OPTIONS.hairColors),
      eyeStyle: randomItem(OPTIONS.eyeStyles).id,
      mouthStyle: randomItem(OPTIONS.mouthStyles).id,
      shirtColor: randomItem(OPTIONS.shirtColors)
    });
  }

  function renderBody3Q(bodyType, av, uid, suitLight, suitDark) {
    var tieDark = shadeHex(av.bgColor, -0.25);
    if (bodyType === 'slim') {
      return (
        '<path d="M23 99 C25 75, 35 70, 52 70 C68 70, 77 75, 79 99 Z" fill="url(#' + uid + '-suit)"/>' +
        '<polygon points="46,70 61,70 55,95 49,95" fill="#f8fafc"/>' +
        '<polygon points="52,72 57,72 55.8,95 53.2,95" fill="' + av.bgColor + '"/>' +
        '<polygon points="52,72 57,72 54.5,76" fill="' + tieDark + '"/>' +
        '<polygon points="39,71 47,70 52,95 39,85" fill="' + suitDark + '"/>' +
        '<polygon points="60,70 67,72 64,85 55,95" fill="' + suitLight + '" opacity="0.72"/>' +
        '<circle cx="42" cy="80" r="1.8" fill="#fbbf24"/>'
      );
    }

    if (bodyType === 'athletic') {
      return (
        // Broad V-taper sculpted muscular shoulders & chest
        '<path d="M5 99 C8 68, 22 65, 52 65 C81 65, 93 69, 96 99 Z" fill="url(#' + uid + '-suit)"/>' +
        // Muscular chest contour shading
        '<path d="M18 76 Q36 86 50 82 Q67 86 84 75" stroke="' + suitDark + '" stroke-width="2.6" fill="none" opacity="0.65"/>' +
        '<polygon points="44,67 65,67 57,95 49,95" fill="#f8fafc"/>' +
        '<polygon points="52,69 59,69 57.5,95 53.5,95" fill="' + av.bgColor + '"/>' +
        '<polygon points="52,69 59,69 55.5,75" fill="' + tieDark + '"/>' +
        '<polygon points="30,68 45,67 53,95 31,84" fill="' + suitDark + '"/>' +
        '<polygon points="64,67 78,69 72,84 57,95" fill="' + suitLight + '" opacity="0.82"/>' +
        '<circle cx="36" cy="79" r="2.3" fill="#fbbf24"/>' +
        '<polygon points="18,83 28,80 26,86 17,86" fill="' + av.bgColor + '" opacity="0.95"/>'
      );
    }

    if (bodyType === 'chubby') {
      return (
        // Rounded jovial belly & double-breasted executive vest look
        '<path d="M8 99 C7 73, 24 67, 52 67 C80 67, 94 74, 93 99 Z" fill="url(#' + uid + '-suit)"/>' +
        // Rounded belly highlight & vest panel
        '<ellipse cx="52" cy="88" rx="22" ry="15" fill="' + suitLight + '" opacity="0.35"/>' +
        '<polygon points="44,68 64,68 58,86 48,86" fill="#f8fafc"/>' +
        '<polygon points="52,70 59,70 57.5,86 53.5,86" fill="' + av.bgColor + '"/>' +
        '<polygon points="52,70 59,70 55.5,75" fill="' + tieDark + '"/>' +
        // Double-breasted vest buttons on belly
        '<circle cx="47" cy="86" r="1.9" fill="#fbbf24"/>' +
        '<circle cx="60" cy="86" r="1.9" fill="#fbbf24"/>' +
        '<circle cx="47" cy="93" r="1.9" fill="#fbbf24"/>' +
        '<circle cx="60" cy="93" r="1.9" fill="#fbbf24"/>' +
        '<polygon points="33,69 45,68 48,86 33,83" fill="' + suitDark + '"/>' +
        '<polygon points="63,68 74,70 69,83 58,86" fill="' + suitLight + '" opacity="0.72"/>' +
        '<polygon points="21,82 30,80 28,85 20,85" fill="' + av.bgColor + '" opacity="0.9"/>'
      );
    }

    // Standard
    return (
      '<path d="M12 99 C15 73, 30 68, 52 68 C73 68, 86 74, 89 99 Z" fill="url(#' + uid + '-suit)"/>' +
      '<polygon points="44,69 65,69 57,95 49,95" fill="#f8fafc"/>' +
      '<polygon points="53,71 59,71 57.5,95 54.5,95" fill="' + av.bgColor + '"/>' +
      '<polygon points="53,71 59,71 56,76" fill="' + tieDark + '"/>' +
      '<polygon points="35,70 45,69 53,95 37,84" fill="' + suitDark + '"/>' +
      '<polygon points="64,69 72,71 67,85 57,95" fill="' + suitLight + '" opacity="0.75"/>' +
      '<circle cx="40" cy="80" r="2.1" fill="#fbbf24"/>' +
      '<polygon points="24,84 32,82 30,87 23,87" fill="' + av.bgColor + '" opacity="0.9"/>'
    );
  }

  // Refined 3/4 angled headwear / hair hugging skull & temples naturally
  function renderHair3Q(style, hairColor, uid) {
    var dark = shadeHex(hairColor, -0.38);
    var light = shadeHex(hairColor, 0.28);

    switch (style) {
      case 'classic':
        return (
          // Forehead soft shadow + sculpted executive sweep + temple sideburn
          '<path d="M30 39 Q53 31 74 39" stroke="rgba(0,0,0,0.16)" stroke-width="3" fill="none"/>' +
          '<path d="M27 50 C25 32, 34 20, 54 19 C69 19, 77 27, 76 38 C71 33, 61 30, 48 32 C38 33, 34 38, 33 49 L29 50 Z" fill="url(#' + uid + '-hair)"/>' +
          '<path d="M37 28 C48 22, 62 22, 72 30" stroke="' + light + '" stroke-width="2.2" fill="none" opacity="0.7" stroke-linecap="round"/>' +
          '<path d="M31 44 L34 52 L31 53 Z" fill="' + dark + '"/>'
        );
      case 'curly':
        return (
          '<g fill="url(#' + uid + '-hair)">' +
          '<circle cx="30" cy="40" r="6.5"/><circle cx="34" cy="30" r="8"/>' +
          '<circle cx="44" cy="23" r="9"/><circle cx="57" cy="22" r="9"/>' +
          '<circle cx="69" cy="27" r="8"/><circle cx="74" cy="35" r="5.5"/>' +
          '<circle cx="29" cy="48" r="4.5"/>' +
          '</g>' +
          '<path d="M39 24 Q52 17 66 25" stroke="' + light + '" stroke-width="1.9" fill="none" opacity="0.6" stroke-linecap="round"/>'
        );
      case 'bun':
        return (
          '<circle cx="28" cy="24" r="9.5" fill="' + dark + '"/>' +
          '<circle cx="29" cy="23" r="6.5" fill="' + hairColor + '"/>' +
          '<path d="M27 49 C26 27, 42 20, 58 21 C70 22, 76 30, 75 38 C67 31, 45 30, 33 42 L30 50 Z" fill="url(#' + uid + '-hair)"/>' +
          '<path d="M36 28 Q53 23 68 31" stroke="' + light + '" stroke-width="1.8" fill="none" opacity="0.55" stroke-linecap="round"/>'
        );
      case 'cap':
        return (
          '<path d="M28 49 L32 39 L28 39 Z" fill="' + dark + '"/>' +
          '<path d="M27 38 C28 21, 72 20, 75 37 Z" fill="#1e3a8a"/>' +
          '<path d="M30 37 C34 24, 60 22, 72 35 Z" fill="#2563eb" opacity="0.65"/>' +
          '<path d="M26 37 L84 40 C86 42, 82 45, 72 44 L26 40 Z" fill="#0f172a"/>' +
          '<circle cx="52" cy="23" r="2.2" fill="#fbbf24"/>'
        );
      case 'beanie': // Fedora Hat
        return (
          '<path d="M28 49 L33 38 L28 38 Z" fill="' + dark + '"/>' +
          '<ellipse cx="52" cy="35" rx="32" ry="6" fill="#1e293b" stroke="#fbbf24" stroke-width="1"/>' +
          '<path d="M33 35 L39 17 Q52 21 65 17 L70 35 Z" fill="#0f172a"/>' +
          '<path d="M34 31 Q52 34 69 31 L70 35 Q52 38 33 35 Z" fill="#d97706"/>'
        );
      case 'fez':
        return (
          '<path d="M29 48 C29 39, 32 35, 36 35 L31 49 Z" fill="' + dark + '"/>' +
          '<path d="M34 35 L40 14 Q53 12 65 15 L69 35 Z" fill="url(#' + uid + '-fez)"/>' +
          '<path d="M33 33 Q52 37 70 33 L70 37 Q52 40 33 37 Z" fill="#7f1d1d"/>' +
          '<path d="M46 15 Q34 19 32 32" stroke="#fbbf24" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
          '<circle cx="32" cy="33" r="2.5" fill="#fde68a"/>'
        );
      case 'crown':
        return (
          '<path d="M27 49 C26 30, 38 22, 55 21 C68 21, 75 29, 75 38 C65 32, 42 32, 31 48 Z" fill="url(#' + uid + '-hair)"/>' +
          '<path d="M35 28 L39 12 L47 20 L54 9 L61 20 L69 12 L70 28 Z" fill="url(#' + uid + '-gold)" stroke="#92400e" stroke-width="1.3" stroke-linejoin="round"/>' +
          '<circle cx="54" cy="20" r="2.3" fill="#ef4444"/>'
        );
      case 'bald':
      default:
        return (
          '<path d="M44 27 Q57 24 65 30" stroke="rgba(255,255,255,0.45)" stroke-width="2.3" fill="none" stroke-linecap="round"/>' +
          '<path d="M28 45 L31 50 L28 51 Z" fill="' + dark + '"/>'
        );
    }
  }

  function renderEyes3Q(style) {
    switch (style) {
      case 'happy':
        return (
          '<path d="M41 48 Q46 43 51 48" stroke="#0f172a" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
          '<path d="M61 48 Q65 43 69 48" stroke="#0f172a" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
        );
      case 'sunglasses':
        return (
          '<path d="M36 44 H55 L53 53 Q45 55 37 52 Z" fill="#090d16" stroke="#fbbf24" stroke-width="1.2"/>' +
          '<path d="M58 44 H75 L73 52 Q66 54 59 52 Z" fill="#090d16" stroke="#fbbf24" stroke-width="1.2"/>' +
          '<line x1="55" y1="46" x2="58" y2="46" stroke="#fbbf24" stroke-width="1.8"/>' +
          '<line x1="29" y1="46" x2="36" y2="46" stroke="#fbbf24" stroke-width="1.6"/>' +
          '<path d="M40 46 L46 51 M62 46 L67 51" stroke="rgba(255,255,255,0.45)" stroke-width="1.6" stroke-linecap="round"/>'
        );
      case 'glasses':
        return (
          '<circle cx="46" cy="48" r="2.9" fill="#0f172a"/>' +
          '<circle cx="65" cy="48" r="2.7" fill="#0f172a"/>' +
          '<circle cx="46" cy="48" r="7" fill="rgba(255,255,255,0.12)" stroke="#fbbf24" stroke-width="1.8"/>' +
          '<circle cx="65" cy="48" r="6.4" fill="rgba(255,255,255,0.12)" stroke="#fbbf24" stroke-width="1.8"/>' +
          '<line x1="53" y1="48" x2="58.5" y2="48" stroke="#fbbf24" stroke-width="1.8"/>'
        );
      case 'wink':
        return (
          '<circle cx="46" cy="48" r="3.1" fill="#0f172a"/>' +
          '<circle cx="47.2" cy="46.8" r="1.1" fill="#fff"/>' +
          '<path d="M60 48 Q65 44 70 48" stroke="#0f172a" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
        );
      case 'star':
        return (
          '<circle cx="46" cy="48" r="3.1" fill="#0f172a"/>' +
          '<circle cx="47.2" cy="46.8" r="1.1" fill="#fff"/>' +
          '<circle cx="65" cy="48" r="2.7" fill="#0f172a"/>' +
          '<circle cx="65" cy="48" r="7" fill="rgba(251,191,36,0.14)" stroke="#fbbf24" stroke-width="2"/>' +
          '<path d="M71 52 Q74 64 70 74" stroke="#fbbf24" stroke-width="1.2" fill="none" stroke-dasharray="2 1.5"/>'
        );
      case 'normal':
      default:
        return (
          '<path d="M40 42 Q46 39 52 42" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round"/>' +
          '<path d="M60 42 Q65 39 70 42" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round"/>' +
          '<circle cx="46" cy="48" r="3.1" fill="#0f172a"/>' +
          '<circle cx="65" cy="48" r="2.8" fill="#0f172a"/>' +
          '<circle cx="47.1" cy="46.9" r="1.1" fill="#ffffff"/>' +
          '<circle cx="66" cy="46.9" r="1" fill="#ffffff"/>'
        );
    }
  }

  function renderMouth3Q(style, hairColor) {
    switch (style) {
      case 'grin':
        return '<path d="M48 59 Q58 67 66 58 Z" fill="#ffffff" stroke="#1e293b" stroke-width="1.6" stroke-linejoin="round"/>';
      case 'serious':
        return '<path d="M50 61 Q58 60 65 61" stroke="#1e293b" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
      case 'mustache':
        return (
          '<path d="M44 59 Q51 54 58 58 Q64 54 70 58 Q64 61 58 59 Q51 62 44 59 Z" fill="' +
          hairColor +
          '"/>' +
          '<path d="M51 63 Q58 66 64 62" stroke="#1e293b" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
        );
      case 'surprised':
        return (
          '<path d="M34 56 C35 72, 48 76, 61 74 C70 72, 74 63, 73 55 C70 61, 65 63, 58 63 C48 63, 40 60, 34 56 Z" fill="' +
          hairColor +
          '" opacity="0.92"/>' +
          '<path d="M51 60 Q58 63 64 59" stroke="#f8fafc" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
        );
      case 'smile':
      default:
        return '<path d="M49 59 Q58 65 65 58" stroke="#1e293b" stroke-width="2.3" fill="none" stroke-linecap="round"/>';
    }
  }

  function renderAvatarSVG(rawAvatar, size) {
    var av = sanitizeAvatar(rawAvatar);
    var px = Number(size) || 64;
    var uid = 'cmav' + (++svgUidCounter);

    var skinHighlight = shadeHex(av.skinTone, 0.18);
    var skinShadow = shadeHex(av.skinTone, -0.26);
    var suitLight = shadeHex(av.shirtColor, 0.22);
    var suitDark = shadeHex(av.shirtColor, -0.42);
    var hairDark = shadeHex(av.hairColor, -0.35);
    var bgDark = shadeHex(av.bgColor, -0.55);

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' +
      px +
      '" height="' +
      px +
      '" role="img" aria-label="Baronia Patron Avatarı">' +
      '<defs>' +
      '<radialGradient id="' + uid + '-bg" cx="38%" cy="28%" r="75%">' +
      '<stop offset="0%" stop-color="' + av.bgColor + '" stop-opacity="0.92"/>' +
      '<stop offset="55%" stop-color="#111c33"/>' +
      '<stop offset="100%" stop-color="' + bgDark + '"/>' +
      '</radialGradient>' +
      '<linearGradient id="' + uid + '-gold" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="#fde68a"/>' +
      '<stop offset="50%" stop-color="#f59e0b"/>' +
      '<stop offset="100%" stop-color="#92400e"/>' +
      '</linearGradient>' +
      '<linearGradient id="' + uid + '-skin" x1="20%" y1="15%" x2="88%" y2="90%">' +
      '<stop offset="0%" stop-color="' + skinHighlight + '"/>' +
      '<stop offset="52%" stop-color="' + av.skinTone + '"/>' +
      '<stop offset="100%" stop-color="' + skinShadow + '"/>' +
      '</linearGradient>' +
      '<linearGradient id="' + uid + '-suit" x1="15%" y1="0%" x2="90%" y2="100%">' +
      '<stop offset="0%" stop-color="' + suitLight + '"/>' +
      '<stop offset="55%" stop-color="' + av.shirtColor + '"/>' +
      '<stop offset="100%" stop-color="' + suitDark + '"/>' +
      '</linearGradient>' +
      '<linearGradient id="' + uid + '-hair" x1="10%" y1="0%" x2="90%" y2="100%">' +
      '<stop offset="0%" stop-color="' + av.hairColor + '"/>' +
      '<stop offset="100%" stop-color="' + hairDark + '"/>' +
      '</linearGradient>' +
      '<linearGradient id="' + uid + '-fez" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="#ef4444"/>' +
      '<stop offset="100%" stop-color="#7f1d1d"/>' +
      '</linearGradient>' +
      '<clipPath id="' + uid + '-clip"><circle cx="50" cy="50" r="45.5"/></clipPath>' +
      '</defs>' +
      '<circle cx="50" cy="50" r="48.5" fill="url(#' + uid + '-bg)" stroke="url(#' + uid + '-gold)" stroke-width="3"/>' +
      '<g clip-path="url(#' + uid + '-clip)">' +
      '<path d="M4 96 V64 H13 V52 H22 V67 H31 V47 H42 V68 H68 V54 H79 V43 H88 V62 H96 V96 Z" fill="rgba(7,11,20,0.42)"/>' +
      '<circle cx="54" cy="45" r="28" fill="' + av.bgColor + '" opacity="0.24"/>' +
      '<ellipse cx="51" cy="92" rx="36" ry="12" fill="rgba(0,0,0,0.45)"/>' +
      renderBody3Q(av.bodyType, av, uid, suitLight, suitDark) +
      '<path d="M42 61 H59 V71 Q51 75 42 71 Z" fill="' + skinShadow + '"/>' +
      '<circle cx="30" cy="49" r="5.2" fill="' + skinShadow + '"/>' +
      '<path d="M30 43 C30 27, 44 24, 57 24 C69 24, 75 33, 75 46 C75 58, 69 67, 56 69 C42 70, 31 61, 30 43 Z" fill="url(#' + uid + '-skin)"/>' +
      '<ellipse cx="44" cy="52" rx="4.5" ry="2.6" fill="rgba(255,255,255,0.14)"/>' +
      '<path d="M58 46 L61 54 L56 56" stroke="' + skinShadow + '" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      renderHair3Q(av.hairStyle, av.hairColor, uid) +
      renderEyes3Q(av.eyeStyle) +
      renderMouth3Q(av.mouthStyle, av.hairColor) +
      '</g>' +
      '<circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>' +
      '</svg>'
    );
  }

  function renderAvatarDataURL(rawAvatar, size) {
    var svg = renderAvatarSVG(rawAvatar, size || 128);
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  CM.Avatar = {
    OPTIONS: OPTIONS,
    sanitizeAvatar: sanitizeAvatar,
    createDefaultAvatar: createDefaultAvatar,
    createRandomAvatar: createRandomAvatar,
    renderAvatarSVG: renderAvatarSVG,
    renderAvatarDataURL: renderAvatarDataURL
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CM.Avatar;
  }
})(typeof window !== 'undefined' ? window : globalThis);
