(function (global) {
  'use strict';

  var CM = (global.CM = global.CM || {});
  var STORAGE_MUTE_KEY = 'bogazbaronu_sfx_muted';

  var ctx = null;
  var muted = false;

  try {
    muted = global.localStorage && global.localStorage.getItem(STORAGE_MUTE_KEY) === '1';
  } catch (e) {
    muted = false;
  }

  function ensureCtx() {
    if (muted) return null;
    if (!ctx) {
      var AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  function tone(freq, duration, type, volume, delay) {
    var ac = ensureCtx();
    if (!ac) return;
    var start = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume || 0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function playDiceRoll() {
    tone(190, 0.06, 'triangle', 0.11, 0);
    tone(250, 0.06, 'triangle', 0.1, 0.07);
    tone(165, 0.07, 'triangle', 0.11, 0.15);
    tone(310, 0.09, 'sine', 0.08, 0.24);
  }

  function playPawnHop() {
    tone(420, 0.055, 'sine', 0.08, 0);
  }

  function playPosHover() {
    tone(740, 0.045, 'sine', 0.06, 0);
  }

  function playPosApprove() {
    // Classic contactless POS dual-tone "BEEP-BEEP!"
    tone(1174.66, 0.09, 'sine', 0.15, 0);
    tone(1567.98, 0.16, 'sine', 0.16, 0.11);
  }

  function playCashIn() {
    tone(659.25, 0.1, 'triangle', 0.11, 0);
    tone(880, 0.12, 'triangle', 0.12, 0.08);
    tone(1318.51, 0.22, 'sine', 0.11, 0.16);
  }

  function playCashPay() {
    // Crisp paper banknote rustle + light coin clink
    tone(320, 0.045, 'triangle', 0.08, 0);
    tone(480, 0.055, 'triangle', 0.09, 0.05);
    tone(987.77, 0.12, 'sine', 0.11, 0.11);
  }

  function playBuild() {
    tone(150, 0.12, 'triangle', 0.14, 0);
    tone(330, 0.12, 'sine', 0.11, 0.08);
    tone(523.25, 0.22, 'sine', 0.12, 0.17);
  }

  function playBuildShop(shopType, level) {
    if (!ensureCtx()) return;
    var lvl = Math.max(1, Math.min(3, Number(level) || 1));

    if (shopType === 'dondurmaci') {
      // Tatlı dondurma arabası / zil melodisi
      tone(659.25, 0.07, 'sine', 0.09, 0.0);
      tone(880, 0.07, 'sine', 0.09, 0.07);
      tone(1046.5, 0.1, 'triangle', 0.1, 0.14);
    } else if (shopType === 'market') {
      // Kasa barkod "bip" + tok açılış
      tone(220, 0.08, 'triangle', 0.11, 0.0);
      tone(1174.66, 0.07, 'sine', 0.09, 0.08);
      tone(1567.98, 0.11, 'sine', 0.1, 0.15);
    } else if (shopType === 'kafe') {
      // Sıcak akustik espresso / kafe akoru
      tone(329.63, 0.1, 'triangle', 0.09, 0.0);
      tone(415.3, 0.11, 'triangle', 0.09, 0.08);
      tone(493.88, 0.16, 'sine', 0.1, 0.16);
    } else if (shopType === 'magaza') {
      // Görkemli AVM / plaza yükseliş akoru
      tone(196, 0.11, 'triangle', 0.12, 0.0);
      tone(293.66, 0.11, 'triangle', 0.11, 0.08);
      tone(392, 0.14, 'sine', 0.11, 0.16);
      tone(587.33, 0.2, 'sine', 0.11, 0.24);
    } else {
      playBuild();
    }

    // Seviye 2 ve 3 yükseltme kutlama armonileri
    if (lvl >= 2) {
      tone(783.99, 0.09, 'triangle', 0.09, 0.22);
      tone(1046.5, 0.16, 'sine', 0.11, 0.3);
    }
    if (lvl >= 3) {
      tone(1318.51, 0.11, 'sine', 0.1, 0.37);
      tone(1567.98, 0.24, 'triangle', 0.12, 0.45);
    }
  }

  function playAlert() {
    tone(340, 0.14, 'sawtooth', 0.07, 0);
    tone(260, 0.18, 'sawtooth', 0.07, 0.14);
  }

  function playTileSound(tile, ownership, currentPlayerId) {
    if (!tile || !ensureCtx()) return;

    // Corner tiles
    if (tile.type === 'corner') {
      if (tile.subtype === 'start') {
        tone(523.25, 0.08, 'triangle', 0.09, 0.0);
        tone(659.25, 0.08, 'triangle', 0.09, 0.07);
        tone(783.99, 0.09, 'triangle', 0.1, 0.14);
        tone(1046.5, 0.18, 'triangle', 0.11, 0.22);
      } else if (tile.subtype === 'zabita') {
        // Zabıta sireni: di-da-di-da
        tone(760, 0.11, 'sawtooth', 0.06, 0.0);
        tone(540, 0.11, 'sawtooth', 0.06, 0.12);
        tone(760, 0.11, 'sawtooth', 0.06, 0.24);
        tone(540, 0.14, 'sawtooth', 0.065, 0.36);
      } else if (tile.subtype === 'musteri_akini') {
        // Müşteri akını: ka-ching
        tone(1174.66, 0.07, 'sine', 0.08, 0.0);
        tone(1567.98, 0.11, 'triangle', 0.09, 0.06);
        tone(2093.0, 0.16, 'sine', 0.07, 0.13);
      } else if (tile.subtype === 'tadilat') {
        // Tadilat: çekiç/inşaat darbeleri
        tone(190, 0.07, 'square', 0.07, 0.0);
        tone(160, 0.07, 'square', 0.07, 0.13);
        tone(230, 0.1, 'triangle', 0.08, 0.26);
      }
      return;
    }

    // Event card
    if (tile.type === 'event') {
      tone(440, 0.07, 'sine', 0.06, 0.0);
      tone(587.33, 0.07, 'sine', 0.07, 0.07);
      tone(880, 0.15, 'triangle', 0.08, 0.14);
      return;
    }

    // Toptancı
    if (tile.type === 'toptanci') {
      tone(392, 0.07, 'triangle', 0.07, 0.0);
      tone(523.25, 0.08, 'triangle', 0.08, 0.07);
      tone(659.25, 0.08, 'triangle', 0.08, 0.14);
      tone(987.77, 0.14, 'sine', 0.07, 0.22);
      return;
    }

    // Tax tiles
    if (tile.type === 'tax') {
      tone(220, 0.11, 'sawtooth', 0.06, 0.0);
      tone(164.81, 0.17, 'sawtooth', 0.07, 0.12);
      return;
    }

    // Utility / Hubs (Taksi, Borsa, Medya, Heliport)
    if (tile.type === 'utility') {
      if (tile.utilityKind === 'taksi') {
        // Çift taksi kornası: bip-bip!
        tone(440, 0.08, 'sawtooth', 0.06, 0.0);
        tone(554.37, 0.08, 'triangle', 0.05, 0.0);
        tone(440, 0.11, 'sawtooth', 0.065, 0.13);
        tone(554.37, 0.11, 'triangle', 0.055, 0.13);
      } else if (tile.utilityKind === 'borsa') {
        // Dijital borsa ticker sinyalleri
        tone(880, 0.05, 'square', 0.04, 0.0);
        tone(1174.66, 0.05, 'square', 0.04, 0.06);
        tone(1479.98, 0.09, 'sine', 0.07, 0.12);
      } else if (tile.utilityKind === 'medya') {
        // Sıcak yayın jenerik akoru
        tone(523.25, 0.09, 'triangle', 0.07, 0.0);
        tone(659.25, 0.09, 'triangle', 0.07, 0.07);
        tone(987.77, 0.16, 'sine', 0.08, 0.15);
      } else if (tile.utilityKind === 'heliport') {
        // Pervane ritmi + VIP zil
        tone(140, 0.06, 'triangle', 0.08, 0.0);
        tone(155, 0.06, 'triangle', 0.08, 0.08);
        tone(175, 0.06, 'triangle', 0.08, 0.16);
        tone(1046.5, 0.14, 'sine', 0.08, 0.23);
      } else {
        tone(987.77, 0.08, 'sine', 0.08, 0.0);
        tone(783.99, 0.16, 'sine', 0.08, 0.11);
      }
      return;
    }

    // Landmark
    if (tile.type === 'landmark') {
      tone(293.66, 0.14, 'triangle', 0.08, 0.0);
      tone(440, 0.16, 'sine', 0.08, 0.09);
      tone(587.33, 0.2, 'triangle', 0.07, 0.18);
      return;
    }

    // Plot tiles
    if (tile.type === 'plot') {
      if (!ownership) {
        // Boş arsa plan sesi
        tone(523.25, 0.06, 'sine', 0.055, 0.0);
        tone(659.25, 0.09, 'sine', 0.06, 0.07);
        return;
      }
      if (ownership.ownerId === currentPlayerId) {
        // Kendi dükkanına giriş zili
        tone(659.25, 0.07, 'sine', 0.06, 0.0);
        tone(880, 0.11, 'sine', 0.065, 0.08);
        return;
      }
      // Rakip dükkan türüne göre özel ses
      var st = ownership.shopType;
      if (st === 'kafe') {
        tone(783.99, 0.06, 'sine', 0.065, 0.0);
        tone(1046.5, 0.09, 'sine', 0.065, 0.07);
      } else if (st === 'market') {
        tone(587.33, 0.06, 'triangle', 0.07, 0.0);
        tone(783.99, 0.06, 'triangle', 0.07, 0.07);
        tone(1174.66, 0.12, 'triangle', 0.07, 0.14);
      } else if (st === 'dondurmaci') {
        tone(880, 0.05, 'sine', 0.055, 0.0);
        tone(1174.66, 0.06, 'triangle', 0.055, 0.06);
        tone(1318.5, 0.09, 'sine', 0.06, 0.12);
      } else if (st === 'magaza') {
        tone(392, 0.08, 'triangle', 0.07, 0.0);
        tone(523.25, 0.1, 'triangle', 0.07, 0.08);
        tone(783.99, 0.14, 'sine', 0.07, 0.16);
      } else {
        tone(440, 0.08, 'triangle', 0.065, 0.0);
        tone(349.23, 0.12, 'triangle', 0.065, 0.09);
      }
    }
  }

  function isMuted() {
    return muted;
  }

  function toggleMute() {
    muted = !muted;
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_MUTE_KEY, muted ? '1' : '0');
      }
    } catch (e) {
      // ignore
    }
    return muted;
  }

  CM.SFX = {
    playDiceRoll: playDiceRoll,
    playPawnHop: playPawnHop,
    playPosHover: playPosHover,
    playPosApprove: playPosApprove,
    playCashIn: playCashIn,
    playCashPay: playCashPay,
    playBuild: playBuild,
    playBuildShop: playBuildShop,
    playAlert: playAlert,
    playTileSound: playTileSound,
    isMuted: isMuted,
    toggleMute: toggleMute
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CM.SFX;
  }
})(typeof window !== 'undefined' ? window : globalThis);
