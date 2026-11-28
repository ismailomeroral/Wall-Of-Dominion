(function (global) {
  'use strict';

  var Avatar = global.CM.Avatar;
  var BD = global.CM.BoardData;
  var Engine = global.CM.Engine;
  var Network = global.CM.Network;
  var Board3D = global.CM.Board3D;
  var SFX = global.CM.SFX;

  var STORAGE_SESSION_KEY = 'cakmamono_session';

  var els = {
    board3dRoot: document.getElementById('board-3d-root'),
    roomBadge: document.getElementById('room-badge'),
    netStatusPill: document.getElementById('net-status-pill'),
    playersHud: document.getElementById('players-hud'),
    centerTurnCaption: document.getElementById('center-turn-caption'),
    centerActionRow: document.getElementById('center-action-row'),
    centerStatusBox: document.getElementById('center-status-box'),
    floatingMoneyPop: document.getElementById('floating-money-pop'),
    landingBanner: document.getElementById('landing-banner'),
    fxLayer: document.getElementById('fx-layer'),
    incomeBackdrop: document.getElementById('income-backdrop'),
    die1: document.getElementById('die-1'),
    turnCounterPill: document.getElementById('turn-counter-pill'),
    logDrawer: document.getElementById('log-drawer'),
    btnToggleLogs: document.getElementById('btn-toggle-logs'),
    logList: document.getElementById('log-list'),
    posBackdrop: document.getElementById('pos-backdrop'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalCard: document.getElementById('modal-card'),
    toastStack: document.getElementById('toast-stack'),
    btnToggleSfx: document.getElementById('btn-toggle-sfx'),
    btnOpenBank: document.getElementById('btn-open-bank'),
    btnOpenProps: document.getElementById('btn-open-props'),
    btnOpenRules: document.getElementById('btn-open-rules'),
    camZoomIn: document.getElementById('cam-zoom-in'),
    camZoomOut: document.getElementById('cam-zoom-out'),
    camRotLeft: document.getElementById('cam-rot-left'),
    camRotRight: document.getElementById('cam-rot-right'),
    camReset: document.getElementById('cam-reset'),
    camFollow: document.getElementById('cam-follow')
  };

  var runtime = {
    session: null,
    state: null,
    board3d: null,
    isAnimating: false,
    lastAnimatedMoveSeq: 0,
    lastAnimatedTxId: null,
    lastAnimatedCardSeq: 0,
    manualModal: null, // 'bank' | 'props' | 'rules' | { type: 'tile', tileIndex }
    bankScreen: 'home',
    bankTransferAmount: 250,
    netHost: null,
    netGuest: null,
    botTimer: null,
    connectedPeers: {}
  };

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(n) {
    return Number(n || 0).toLocaleString('tr-TR') + ' ₺';
  }

  function showToast(msg, variant) {
    var div = document.createElement('div');
    div.className = 'toast-item' + (variant ? ' toast-' + variant : '');
    div.textContent = msg;
    els.toastStack.appendChild(div);
    setTimeout(function () {
      div.remove();
    }, 3200);
  }

  function showFloatingMoney(text) {
    els.floatingMoneyPop.textContent = text;
    els.floatingMoneyPop.classList.remove('hidden');
    els.floatingMoneyPop.style.animation = 'none';
    void els.floatingMoneyPop.offsetWidth;
    els.floatingMoneyPop.style.animation = '';
    setTimeout(function () {
      els.floatingMoneyPop.classList.add('hidden');
    }, 1800);
  }

  function showLandingBanner(tileIndex) {
    var tile = BD.TILES[tileIndex];
    if (!tile || !els.landingBanner) return;
    var st = runtime.state;
    var own = st && st.ownership ? st.ownership[tileIndex] : null;
    var owner = own ? Engine.getPlayerById(st, own.ownerId) : null;

    var sub = '';
    if (tile.type === 'plot') {
      var hood = BD.NEIGHBORHOODS[tile.neighborhoodId];
      sub = hood.name + ' (' + hood.multiplier.toFixed(1) + 'x) • ' + (owner ? 'Sahibi: ' + owner.name : 'Boş Arsa');
    } else if (tile.type === 'event') {
      sub = 'Ortadaki 3D Desteden Kart Çek!';
    } else if (owner) {
      sub = 'Sahibi: ' + owner.name;
    } else {
      sub = tile.subtitle || '';
    }

    els.landingBanner.innerHTML =
      '<span style="font-size:1.15rem;">📍</span>' +
      '<div>' +
      '<div style="font-size:0.84rem;font-weight:800;color:#fde68a;">' +
      escapeHtml(tile.icon + ' ' + tile.name) +
      '</div>' +
      (sub ? '<div style="font-size:0.72rem;color:#cbd5e1;">' + escapeHtml(sub) + '</div>' : '') +
      '</div>';

    els.landingBanner.classList.remove('hidden');
    els.landingBanner.style.animation = 'none';
    void els.landingBanner.offsetWidth;
    els.landingBanner.style.animation = '';
    setTimeout(function () {
      els.landingBanner.classList.add('hidden');
    }, 2200);
  }

  function loadSession() {
    var params = new URLSearchParams(global.location.search);
    var saved = null;
    try {
      var raw = sessionStorage.getItem(STORAGE_SESSION_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) {
      saved = null;
    }

    var roomParam = params.get('room');
    var roleParam = params.get('role');
    var pidParam = params.get('pid');
    var modeParam = params.get('mode');

    if (saved && (!roomParam || saved.roomCode === roomParam)) {
      return saved;
    }

    if (roomParam && roleParam === 'guest' && pidParam) {
      return {
        roomCode: roomParam,
        mode: modeParam || 'online',
        isHost: false,
        selfPlayerId: pidParam,
        players: []
      };
    }

    return null;
  }

  function init3DBoardIfNeeded() {
    if (runtime.board3d) return;
    if (Board3D && Board3D.Board3DView) {
      runtime.board3d = new Board3D.Board3DView(els.board3dRoot, {
        onTileClick: onBoardTileClick,
        onEventDeckClick: on3DEventDeckClick
      });
    }
  }

  function canLocalUserControlCurrentTurn() {
    if (!runtime.state || runtime.isAnimating) return false;
    var active = Engine.getActiveDecisionPlayer(runtime.state);
    if (!active || active.isBot || active.bankrupt) return false;
    if (runtime.session.mode === 'local') return true;
    return active.id === runtime.session.selfPlayerId;
  }

  function getActingPlayerIdForMenu() {
    if (!runtime.state) return null;
    var current = Engine.getCurrentPlayer(runtime.state);
    if (runtime.session.mode === 'local') {
      return current ? current.id : null;
    }
    return runtime.session.selfPlayerId;
  }

  function sendPlayerAction(action) {
    if (!runtime.state || runtime.isAnimating) return;
    var active = Engine.getActiveDecisionPlayer(runtime.state);
    if (!active) return;

    if (runtime.session.mode === 'online' && !runtime.session.isHost) {
      if (runtime.netGuest) {
        var sent = runtime.netGuest.sendAction(action);
        if (!sent) showToast('Bağlantı henüz hazır değil.', 'error');
      }
      return;
    }

    applyAuthoritativeAction(active.id, action);
  }

  function applyAuthoritativeAction(playerId, action) {
    var res = Engine.dispatchAction(runtime.state, playerId, action);
    if (res.error) {
      if (playerId === runtime.session.selfPlayerId || runtime.session.mode === 'local') {
        showToast(res.error, 'error');
      }
      return;
    }

    runtime.state = res.state;
    if (runtime.netHost) {
      runtime.netHost.broadcastState(runtime.state);
    }
    handleIncomingState(runtime.state);
  }

  function flashPlayerDelta(playerId, amount, isPlus) {
    if (!playerId || !amount) return;
    var card = els.playersHud.querySelector('[data-player-id="' + playerId + '"]');
    if (!card) return;
    var pop = document.createElement('div');
    pop.className = 'cash-delta-pop ' + (isPlus ? 'plus' : 'minus');
    pop.textContent = (isPlus ? '+' : '-') + formatMoney(amount);
    card.appendChild(pop);
    setTimeout(function () {
      pop.remove();
    }, 1750);
  }

  function getCardCenter(playerId) {
    if (playerId && playerId !== 'bank' && playerId !== 'players') {
      var card = els.playersHud.querySelector('[data-player-id="' + playerId + '"]');
      if (card) {
        var r = card.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return { x: global.innerWidth / 2, y: global.innerHeight * 0.54 };
  }

  function launchFlyingCoins(fromId, toId) {
    if (!els.fxLayer) return;
    var start = getCardCenter(fromId);
    var end = getCardCenter(toId);
    for (var i = 0; i < 6; i++) {
      (function (idx) {
        setTimeout(function () {
          var coin = document.createElement('div');
          coin.className = 'flying-coin';
          coin.textContent = '₺';
          var jitterX = (Math.random() - 0.5) * 26;
          var jitterY = (Math.random() - 0.5) * 18;
          coin.style.left = start.x + jitterX - 12 + 'px';
          coin.style.top = start.y + jitterY - 12 + 'px';
          els.fxLayer.appendChild(coin);

          requestAnimationFrame(function () {
            var dx = end.x - (start.x + jitterX);
            var dy = end.y - (start.y + jitterY);
            coin.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.8)';
            setTimeout(function () {
              coin.style.opacity = '0';
              setTimeout(function () {
                coin.remove();
              }, 260);
            }, 520);
          });
        }, idx * 75);
      })(i);
    }
  }

  function showIncomeReceiptOverlay(tx, onDone) {
    var receiver = Engine.getPlayerById(runtime.state, tx.receiverId);
    if (!receiver || !els.incomeBackdrop) {
      if (onDone) onDone();
      return;
    }

    var lines =
      tx.breakdown && tx.breakdown.length > 0
        ? tx.breakdown
        : [{ label: tx.reason, amount: tx.amount }];

    var linesHtml = '';
    lines.forEach(function (item) {
      linesHtml +=
        '<div class="income-line-item">' +
        '<span>' +
        escapeHtml(item.label) +
        '</span>' +
        '<strong>+' +
        formatMoney(item.amount) +
        '</strong>' +
        '</div>';
    });

    var accLabel = tx.account === 'bank' ? '💳 Banka Hesabına Yatırıldı' : '💵 Nakit Cüzdana Eklendi';

    els.incomeBackdrop.innerHTML =
      '<div class="income-receipt-card">' +
      '<div class="income-receipt-head">' +
      '<div>' +
      Avatar.renderAvatarSVG(receiver.avatar, 50) +
      '</div>' +
      '<div>' +
      '<div style="font-size:0.72rem;font-weight:800;color:#6ee7b7;text-transform:uppercase;letter-spacing:0.06em;">' +
      tx.icon +
      ' TAHSİLAT DEKONTU</div>' +
      '<h3 style="margin:2px 0 0;font-size:1.05rem;">' +
      escapeHtml(receiver.name) +
      '</h3>' +
      '<div style="font-size:0.72rem;color:#94a3b8;">' +
      accLabel +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="income-line-list">' +
      linesHtml +
      '</div>' +
      '<div class="income-total-row">' +
      '<span>Toplam Gelen</span>' +
      '<span>+' +
      formatMoney(tx.amount) +
      '</span>' +
      '</div>' +
      '</div>';

    els.incomeBackdrop.classList.remove('hidden');
    if (SFX) SFX.playCashIn();
    launchFlyingCoins(tx.payerId, tx.receiverId);
    flashPlayerDelta(tx.receiverId, tx.amount, true);

    var closed = false;
    function finish() {
      if (closed) return;
      closed = true;
      els.incomeBackdrop.classList.add('hidden');
      els.incomeBackdrop.innerHTML = '';
      if (onDone) onDone();
    }

    els.incomeBackdrop.onclick = finish;
    setTimeout(finish, 1850);
  }

  function showPosPaymentOverlay(tx, onDone) {
    var payer = Engine.getPlayerById(runtime.state, tx.payerId);
    var receiver =
      tx.receiverId === 'bank'
        ? { name: 'İstanbul Bankası', avatar: null, isBank: true }
        : tx.receiverId === 'players'
        ? { name: 'Diğer Oyuncular', avatar: null, isPlayers: true }
        : Engine.getPlayerById(runtime.state, tx.receiverId) || { name: 'Alıcı', avatar: null };

    if (!payer) {
      if (onDone) onDone();
      return;
    }

    var isLocalHumanPayer =
      !payer.isBot && (runtime.session.mode === 'local' || payer.id === runtime.session.selfPlayerId);

    var cardColor = payer.color || '#f59e0b';
    var cardBg = 'linear-gradient(135deg, ' + cardColor + ' 0%, #0f172a 85%)';

    var receiverAvatarHtml = receiver.avatar
      ? Avatar.renderAvatarSVG(receiver.avatar, 28)
      : '<span style="font-size:1.15rem;">' + (receiver.isPlayers ? '👥' : '🏦') + '</span>';

    var splitText = '';
    if (tx.split) {
      var parts = [];
      if (tx.split.fromBank > 0) parts.push('💳 Bankadan: ' + formatMoney(tx.split.fromBank));
      if (tx.split.fromCash > 0) parts.push('💵 Nakitten: ' + formatMoney(tx.split.fromCash));
      if (parts.length > 0) splitText = parts.join(' • ');
    }

    els.posBackdrop.innerHTML =
      '<div class="pos-stage">' +
      '<div id="pos-terminal-box" class="pos-terminal">' +
      '<div class="pos-receipt-slot"><div class="pos-receipt-slip">BARONIA<br>' +
      formatMoney(tx.amount) +
      '<br>✓ ONAYLANDI</div></div>' +
      '<div class="pos-parties-bar">' +
      '<div class="pos-party-chip">' +
      Avatar.renderAvatarSVG(payer.avatar, 28) +
      '<span>' +
      escapeHtml(payer.name) +
      '</span>' +
      '</div>' +
      '<span class="pos-arrow-mid">──▶</span>' +
      '<div class="pos-party-chip">' +
      receiverAvatarHtml +
      '<span>' +
      escapeHtml(receiver.name) +
      '</span>' +
      '</div>' +
      '</div>' +
      '<div id="pos-nfc-zone" class="pos-nfc-zone">' +
      '<div class="pos-nfc-waves">))) 📡 (((</div>' +
      '<div class="pos-nfc-label">TEMASSIZ OKUTMA ALANI</div>' +
      '</div>' +
      '<div class="pos-screen">' +
      '<div class="pos-screen-reason">' +
      escapeHtml(tx.icon + ' ' + tx.reason) +
      '</div>' +
      '<div class="pos-screen-amount">' +
      formatMoney(tx.amount) +
      '</div>' +
      (splitText ? '<div class="pos-split-tag">' + escapeHtml(splitText) + '</div>' : '') +
      '<div id="pos-screen-status" class="pos-screen-status">' +
      (isLocalHumanPayer ? 'KARTI OKUTUCUYA SÜRÜKLE' : 'KART OKUNUYOR...') +
      '</div>' +
      '</div>' +
      '<div class="pos-keypad">' +
      '<div class="pos-key">1</div><div class="pos-key">2</div><div class="pos-key">3</div>' +
      '<div class="pos-key">4</div><div class="pos-key">5</div><div class="pos-key">6</div>' +
      '<div class="pos-key">7</div><div class="pos-key">8</div><div class="pos-key">9</div>' +
      '</div>' +
      '</div>' +
      '<div class="pos-card-dock">' +
      '<div class="pos-instruction">' +
      (isLocalHumanPayer
        ? '💳 Ödemeyi onaylamak için kartını POS cihazının üzerine sürükle (veya tıkla)'
        : '🤖 ' + escapeHtml(payer.name) + ' temassız ödeme yapıyor...') +
      '</div>' +
      '<div id="pos-credit-card" class="credit-card-draggable" style="background:' +
      cardBg +
      ';">' +
      '<div class="cc-top">' +
      '<span class="cc-brand">BARONIA BLACK</span>' +
      '<div class="cc-chip"></div>' +
      '</div>' +
      '<div class="cc-middle">' +
      '<div class="cc-avatar">' +
      Avatar.renderAvatarSVG(payer.avatar, 50) +
      '</div>' +
      '<div class="cc-number">•••• •••• •••• ' +
      String(1000 + (tx.amount % 9000)) +
      '</div>' +
      '</div>' +
      '<div class="cc-bottom">' +
      '<span class="cc-holder">' +
      escapeHtml(payer.name) +
      '</span>' +
      '<span class="cc-tag">OTOMATİK CÜZDAN</span>' +
      '</div>' +
      '</div>' +
      (isLocalHumanPayer
        ? '<button type="button" id="btn-pos-quick-tap" class="btn btn-emerald btn-sm">💳 Kartı Okut</button>'
        : '') +
      '</div>' +
      '</div>';

    els.posBackdrop.classList.remove('hidden');

    var terminalBox = document.getElementById('pos-terminal-box');
    var nfcZone = document.getElementById('pos-nfc-zone');
    var statusEl = document.getElementById('pos-screen-status');
    var cardEl = document.getElementById('pos-credit-card');
    var completed = false;

    function completePayment() {
      if (completed) return;
      completed = true;
      nfcZone.classList.remove('nfc-hover');
      terminalBox.classList.add('approved');
      statusEl.textContent = '✓ ÖDEME ONAYLANDI';
      statusEl.style.color = '#6ee7b7';
      if (SFX) SFX.playPosApprove();

      launchFlyingCoins(tx.payerId, tx.receiverId);
      flashPlayerDelta(tx.payerId, tx.amount, false);
      if (tx.receiverId && tx.receiverId !== 'bank' && tx.receiverId !== 'players') {
        flashPlayerDelta(tx.receiverId, tx.amount, true);
      }

      setTimeout(function () {
        els.posBackdrop.classList.add('hidden');
        els.posBackdrop.innerHTML = '';
        if (onDone) onDone();
      }, 950);
    }

    if (!isLocalHumanPayer) {
      setTimeout(function () {
        var nfcRect = nfcZone.getBoundingClientRect();
        var cardRect = cardEl.getBoundingClientRect();
        var dx = nfcRect.left + nfcRect.width / 2 - (cardRect.left + cardRect.width / 2);
        var dy = nfcRect.top + nfcRect.height / 2 - (cardRect.top + cardRect.height / 2);
        cardEl.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.84) rotate(-4deg)';
        nfcZone.classList.add('nfc-hover');
        setTimeout(completePayment, 460);
      }, 420);
      return;
    }

    var drag = { active: false, startX: 0, startY: 0, dx: 0, dy: 0, hovered: false };

    function isOverlappingNfc() {
      var r1 = cardEl.getBoundingClientRect();
      var r2 = nfcZone.getBoundingClientRect();
      return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
    }

    cardEl.addEventListener('pointerdown', function (e) {
      if (completed) return;
      drag.active = true;
      drag.startX = e.clientX - drag.dx;
      drag.startY = e.clientY - drag.dy;
      cardEl.classList.add('dragging');
      cardEl.setPointerCapture(e.pointerId);
    });

    cardEl.addEventListener('pointermove', function (e) {
      if (!drag.active || completed) return;
      drag.dx = e.clientX - drag.startX;
      drag.dy = e.clientY - drag.startY;
      cardEl.style.transform = 'translate(' + drag.dx + 'px, ' + drag.dy + 'px) scale(1.04)';
      var over = isOverlappingNfc();
      if (over !== drag.hovered) {
        drag.hovered = over;
        nfcZone.classList.toggle('nfc-hover', over);
        if (over && SFX) SFX.playPosHover();
      }
    });

    cardEl.addEventListener('pointerup', function (e) {
      if (!drag.active || completed) return;
      drag.active = false;
      cardEl.classList.remove('dragging');
      try {
        cardEl.releasePointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
      if (isOverlappingNfc()) {
        completePayment();
      } else {
        drag.dx = 0;
        drag.dy = 0;
        cardEl.style.transform = '';
        nfcZone.classList.remove('nfc-hover');
      }
    });

    nfcZone.addEventListener('click', completePayment);
    var quickTapBtn = document.getElementById('btn-pos-quick-tap');
    if (quickTapBtn) {
      quickTapBtn.addEventListener('click', completePayment);
    }
  }

  function showCashPaymentOverlay(tx, onDone) {
    var payer = Engine.getPlayerById(runtime.state, tx.payerId);
    var receiver =
      tx.receiverId === 'bank'
        ? { name: 'İstanbul Bankası', avatar: null }
        : tx.receiverId === 'players'
        ? { name: 'Diğer Oyuncular', avatar: null, isPlayers: true }
        : Engine.getPlayerById(runtime.state, tx.receiverId) || { name: 'Alıcı', avatar: null };

    if (!payer) {
      if (onDone) onDone();
      return;
    }

    var isLocalHumanPayer =
      !payer.isBot && (runtime.session.mode === 'local' || payer.id === runtime.session.selfPlayerId);

    var receiverAvatarHtml = receiver.avatar
      ? Avatar.renderAvatarSVG(receiver.avatar, 28)
      : '<span style="font-size:1.15rem;">' + (receiver.isPlayers ? '👥' : '🏦') + '</span>';

    els.posBackdrop.innerHTML =
      '<div class="pos-stage">' +
      '<div id="cash-tray-box" class="cash-pay-tray">' +
      '<div class="pos-parties-bar">' +
      '<div class="pos-party-chip">' +
      Avatar.renderAvatarSVG(payer.avatar, 28) +
      '<span>' +
      escapeHtml(payer.name) +
      '</span>' +
      '</div>' +
      '<span class="pos-arrow-mid">──▶</span>' +
      '<div class="pos-party-chip">' +
      receiverAvatarHtml +
      '<span>' +
      escapeHtml(receiver.name) +
      '</span>' +
      '</div>' +
      '</div>' +
      '<div id="cash-drop-zone" class="cash-drop-zone">' +
      '<div style="font-size:1.45rem;">💵📥</div>' +
      '<div class="pos-nfc-label" style="color:#6ee7b7;">NAKİT TESLİM TEPSİSİ</div>' +
      '</div>' +
      '<div class="pos-screen">' +
      '<div class="pos-screen-reason">' +
      escapeHtml(tx.icon + ' ' + tx.reason) +
      '</div>' +
      '<div class="pos-screen-amount">' +
      formatMoney(tx.amount) +
      '</div>' +
      '<div id="cash-screen-status" class="pos-screen-status">' +
      (isLocalHumanPayer ? 'NAKİT DESTESİNİ TEPSİYE SÜRÜKLE' : 'NAKİT ÖDENİYOR...') +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="pos-card-dock">' +
      '<div class="pos-instruction">' +
      (isLocalHumanPayer
        ? '💵 Nakit ödemeyi tamamlamak için banknot destesini tepsiye sürükle (veya tıkla)'
        : '🤖 ' + escapeHtml(payer.name) + ' elden nakit ödüyor...') +
      '</div>' +
      '<div id="cash-banknote-stack" class="banknote-stack-draggable">' +
      '<div class="cc-top">' +
      '<span class="cc-brand" style="color:#a7f3d0;">BARONIA BANKNOT</span>' +
      '<span class="pill pill-emerald" style="font-size:0.64rem;">ELDEN NAKİT</span>' +
      '</div>' +
      '<div class="banknote-center-seal">💵 ' +
      formatMoney(tx.amount) +
      '</div>' +
      '<div class="cc-bottom">' +
      '<span class="cc-holder" style="font-size:0.76rem;">' +
      escapeHtml(payer.name) +
      '</span>' +
      '<span class="cc-tag">MERKEZ KASASI</span>' +
      '</div>' +
      '</div>' +
      (isLocalHumanPayer
        ? '<button type="button" id="btn-cash-quick-pay" class="btn btn-emerald btn-sm">💵 Nakit Öde</button>'
        : '') +
      '</div>' +
      '</div>';

    els.posBackdrop.classList.remove('hidden');

    var trayBox = document.getElementById('cash-tray-box');
    var dropZone = document.getElementById('cash-drop-zone');
    var statusEl = document.getElementById('cash-screen-status');
    var stackEl = document.getElementById('cash-banknote-stack');
    var completed = false;

    function completeCashPayment() {
      if (completed) return;
      completed = true;
      dropZone.classList.remove('nfc-hover');
      trayBox.classList.add('approved');
      statusEl.textContent = '✓ NAKİT TESLİM ALINDI';
      statusEl.style.color = '#fde68a';
      if (SFX && SFX.playCashPay) SFX.playCashPay();

      launchFlyingCoins(tx.payerId, tx.receiverId);
      flashPlayerDelta(tx.payerId, tx.amount, false);
      if (tx.receiverId && tx.receiverId !== 'bank' && tx.receiverId !== 'players') {
        flashPlayerDelta(tx.receiverId, tx.amount, true);
      }

      setTimeout(function () {
        els.posBackdrop.classList.add('hidden');
        els.posBackdrop.innerHTML = '';
        if (onDone) onDone();
      }, 900);
    }

    if (!isLocalHumanPayer) {
      setTimeout(function () {
        var r1 = dropZone.getBoundingClientRect();
        var r2 = stackEl.getBoundingClientRect();
        var dx = r1.left + r1.width / 2 - (r2.left + r2.width / 2);
        var dy = r1.top + r1.height / 2 - (r2.top + r2.height / 2);
        stackEl.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.84) rotate(3deg)';
        dropZone.classList.add('nfc-hover');
        setTimeout(completeCashPayment, 450);
      }, 400);
      return;
    }

    var drag = { active: false, startX: 0, startY: 0, dx: 0, dy: 0, hovered: false };

    function isOverlappingTray() {
      var r1 = stackEl.getBoundingClientRect();
      var r2 = dropZone.getBoundingClientRect();
      return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
    }

    stackEl.addEventListener('pointerdown', function (e) {
      if (completed) return;
      drag.active = true;
      drag.startX = e.clientX - drag.dx;
      drag.startY = e.clientY - drag.dy;
      stackEl.classList.add('dragging');
      stackEl.setPointerCapture(e.pointerId);
    });

    stackEl.addEventListener('pointermove', function (e) {
      if (!drag.active || completed) return;
      drag.dx = e.clientX - drag.startX;
      drag.dy = e.clientY - drag.startY;
      stackEl.style.transform = 'translate(' + drag.dx + 'px, ' + drag.dy + 'px) scale(1.05)';
      var over = isOverlappingTray();
      if (over !== drag.hovered) {
        drag.hovered = over;
        dropZone.classList.toggle('nfc-hover', over);
        if (over && SFX) SFX.playPosHover();
      }
    });

    stackEl.addEventListener('pointerup', function (e) {
      if (!drag.active || completed) return;
      drag.active = false;
      stackEl.classList.remove('dragging');
      try {
        stackEl.releasePointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
      if (isOverlappingTray()) {
        completeCashPayment();
      } else {
        drag.dx = 0;
        drag.dy = 0;
        stackEl.style.transform = '';
        dropZone.classList.remove('nfc-hover');
      }
    });

    dropZone.addEventListener('click', completeCashPayment);
    var quickBtn = document.getElementById('btn-cash-quick-pay');
    if (quickBtn) {
      quickBtn.addEventListener('click', completeCashPayment);
    }
  }

  function playTransactionsQueue(transactions, onDone) {
    var list = (transactions || []).slice();
    if (list.length === 0) {
      if (onDone) onDone();
      return;
    }

    var idx = 0;
    function nextTx() {
      if (idx >= list.length) {
        if (onDone) onDone();
        return;
      }
      var tx = list[idx++];
      if (runtime.lastAnimatedTxId === tx.id) {
        nextTx();
        return;
      }
      runtime.lastAnimatedTxId = tx.id;

      if (tx.kind === 'payment') {
        if (tx.split && tx.split.fromCash > 0 && tx.split.fromBank === 0) {
          showCashPaymentOverlay(tx, nextTx);
        } else {
          showPosPaymentOverlay(tx, nextTx);
        }
      } else {
        showIncomeReceiptOverlay(tx, nextTx);
      }
    }
    nextTx();
  }

  function handleIncomingState(newState) {
    runtime.state = newState;

    var move = newState.lastMove;
    var hasNewMove = Boolean(move && move.moveSeq && move.moveSeq !== runtime.lastAnimatedMoveSeq && move.path && move.path.length > 0);
    var hasNewEventCard = Boolean(newState.lastEventCard && newState.lastEventCard.cardSeq !== runtime.lastAnimatedCardSeq);
    var txs = (newState.lastTransactions || []).filter(function (tx) {
      return tx.id !== runtime.lastAnimatedTxId;
    });

    // Always wait for Event Card confirmation BEFORE animating its resulting move/transactions!
    if (hasNewEventCard) {
      runtime.lastAnimatedCardSeq = newState.lastEventCard.cardSeq;
      runtime.isAnimating = true;
      renderCommandDock();
      showEventCardRevealModal(newState.lastEventCard, function () {
        if (hasNewMove) {
          runtime.lastAnimatedMoveSeq = move.moveSeq;
          animateMoveSequence(newState, move, txs);
        } else {
          if (runtime.board3d) runtime.board3d.syncState(newState, false);
          renderTopHUD();
          playTransactionsQueue(txs, function () {
            runtime.isAnimating = false;
            renderAll();
            scheduleBotIfNeeded();
          });
        }
      });
      return;
    }

    if (hasNewMove) {
      runtime.lastAnimatedMoveSeq = move.moveSeq;
      animateMoveSequence(newState, move, txs);
      return;
    }

    if (txs.length > 0) {
      runtime.isAnimating = true;
      if (runtime.board3d) runtime.board3d.syncState(newState, false);
      renderTopHUD();
      renderCommandDock();
      playTransactionsQueue(txs, function () {
        runtime.isAnimating = false;
        renderAll();
        scheduleBotIfNeeded();
      });
      return;
    }

    if (runtime.board3d) runtime.board3d.syncState(newState, false);
    if (newState.phase === 'DRAW_EVENT_CARD' && runtime.board3d) {
      runtime.board3d.focusEventDeck();
    }
    renderAll();
    scheduleBotIfNeeded();
  }

  function animateMoveSequence(state, move, txs) {
    runtime.isAnimating = true;
    els.die1.classList.add('rolling');
    renderTopHUD();
    renderCommandDock();

    if (runtime.board3d) {
      runtime.board3d.syncState(state, true);
    }

    var finishMove = function () {
      if (runtime.board3d) {
        runtime.board3d.syncState(state, false);
        var mover = Engine.getPlayerById(state, move.playerId);
        runtime.board3d.pulseTileLanding(move.to, mover ? mover.color : '#fbbf24');
      }
      showLandingBanner(move.to);
      renderTopHUD();
      if (SFX && SFX.playTileSound) {
        var landedTile = BD.TILES[move.to];
        var landedOwn = state.ownership ? state.ownership[move.to] : null;
        SFX.playTileSound(landedTile, landedOwn, move.playerId);
      }

      setTimeout(function () {
        playTransactionsQueue(txs, function () {
          runtime.isAnimating = false;
          if (state.phase === 'DRAW_EVENT_CARD' && runtime.board3d) {
            runtime.board3d.focusEventDeck();
          }
          renderAll();
          scheduleBotIfNeeded();
        });
      }, 420);
    };

    var runPawnHops = function () {
      els.die1.classList.remove('rolling');
      renderDie();

      if (runtime.board3d) {
        runtime.board3d.animatePawnMove(move.playerId, move.path, null, finishMove);
      } else {
        setTimeout(finishMove, 250);
      }
    };

    if (runtime.board3d && !move.isTeleport) {
      if (SFX) SFX.playDiceRoll();
      runtime.board3d.animateDieRoll(state.lastDie || state.lastDiceTotal || 1, runPawnHops);
    } else {
      setTimeout(runPawnHops, 200);
    }
  }

  function on3DEventDeckClick() {
    if (!runtime.state || runtime.isAnimating) return;
    if (runtime.state.phase !== 'DRAW_EVENT_CARD' || !canLocalUserControlCurrentTurn()) return;
    triggerDrawEventCard();
  }

  function triggerDrawEventCard() {
    if (runtime.isAnimating) return;
    runtime.isAnimating = true;
    if (runtime.board3d) {
      runtime.board3d.animateDrawEventCard(function () {
        runtime.isAnimating = false;
        sendPlayerAction({ type: 'DRAW_EVENT_CARD' });
      });
    } else {
      runtime.isAnimating = false;
      sendPlayerAction({ type: 'DRAW_EVENT_CARD' });
    }
  }

  function scheduleBotIfNeeded() {
    if (runtime.botTimer) {
      clearTimeout(runtime.botTimer);
      runtime.botTimer = null;
    }
    if (!runtime.state || runtime.isAnimating || runtime.state.phase === 'GAME_OVER') return;
    if (!runtime.session.isHost) return;

    var active = Engine.getActiveDecisionPlayer(runtime.state);
    if (!active || !active.isBot || active.bankrupt) return;

    runtime.botTimer = setTimeout(function () {
      var act = Engine.chooseBotAction(runtime.state);
      if (act) {
        if (act.type === 'DRAW_EVENT_CARD' && runtime.board3d) {
          runtime.isAnimating = true;
          runtime.board3d.animateDrawEventCard(function () {
            runtime.isAnimating = false;
            applyAuthoritativeAction(active.id, act);
          });
        } else {
          applyAuthoritativeAction(active.id, act);
        }
      }
    }, 1150);
  }

  function onBoardTileClick(tileIndex) {
    if (!runtime.state) return;
    if (runtime.state.phase === 'CHOOSE_TELEPORT' && canLocalUserControlCurrentTurn()) {
      var current = Engine.getCurrentPlayer(runtime.state);
      var tile = BD.TILES[tileIndex];
      if (tileIndex === 0 || tileIndex === current.pos || tile.type === 'toptanci') {
        showToast('Başlangıç veya Toptancı karesi dışında bir kare seçmelisin.', 'error');
        return;
      }
      sendPlayerAction({ type: 'CHOOSE_TELEPORT', targetTileIndex: tileIndex });
      return;
    }

    if (runtime.board3d) {
      runtime.board3d.focusTile(tileIndex);
    }
    runtime.manualModal = { type: 'tile', tileIndex: tileIndex };
    renderActiveModal();
  }

  function renderAll() {
    if (!runtime.state) return;
    renderTopHUD();
    renderDie();
    renderCommandDock();
    renderLogs();
    renderActiveModal();
  }

  function renderTopHUD() {
    var st = runtime.state;
    els.turnCounterPill.textContent = 'Tur ' + st.turnNumber;
    els.playersHud.innerHTML = '';

    var activeActor = Engine.getActiveDecisionPlayer(st);

    st.players.forEach(function (p) {
      var isTurn = activeActor && activeActor.id === p.id && st.phase !== 'GAME_OVER';
      var propCount = Engine.getPlayerPropertyCount(st, p.id);
      var marketIncome = Engine.getPlayerMarketStartIncome(st, p.id);

      var card = document.createElement('article');
      card.className = 'player-card' + (isTurn ? ' active-turn' : '') + (p.bankrupt ? ' is-bankrupt' : '');
      card.setAttribute('data-player-id', p.id);

      var badges = '';
      if (p.isBot) badges += '<span class="pill pill-blue" style="padding:1px 6px;font-size:0.64rem;">Bot</span>';
      if (p.id === runtime.session.selfPlayerId && runtime.session.mode === 'online') {
        badges += '<span class="pill pill-gold" style="padding:1px 6px;font-size:0.64rem;">Sen</span>';
      }
      if (p.inInspection) badges += '<span class="pill pill-rose" style="padding:1px 6px;font-size:0.64rem;">🚨</span>';
      if (p.bankrupt) badges += '<span class="pill pill-rose" style="padding:1px 6px;font-size:0.64rem;">İflas</span>';

      var loanChip = '';
      if (p.loans.length > 0) {
        var totalDebt = p.loans.reduce(function (s, l) {
          return s + l.remainingAmount;
        }, 0);
        var nextGrace = p.loans[0].graceTurnsRemaining;
        var loanLabel = nextGrace > 0 ? '🏦 ' + totalDebt + '₺ (' + nextGrace + 't)' : '🏦 ' + totalDebt + '₺';
        loanChip = '<span class="stat-chip warn">' + loanLabel + '</span>';
      }

      card.innerHTML =
        '<div class="player-card-head">' +
        '<div class="player-card-avatar">' +
        Avatar.renderAvatarSVG(p.avatar, 44) +
        '</div>' +
        '<div class="player-card-meta">' +
        '<div class="player-card-name">' +
        '<span>' +
        escapeHtml(p.name) +
        '</span>' +
        badges +
        '</div>' +
        '<div class="wallet-dual-row">' +
        '<div class="wallet-pill cash" title="Nakit Cüzdanı"><span>💵</span><span>' +
        Number(p.cash || 0).toLocaleString('tr-TR') +
        '₺</span></div>' +
        '<div class="wallet-pill bank" title="Banka Hesabı (+%5 Faiz)"><span>💳</span><span>' +
        Number(p.bank || 0).toLocaleString('tr-TR') +
        '₺</span></div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="player-card-stats">' +
        '<span class="stat-chip">🏢 ' +
        propCount +
        '</span>' +
        (marketIncome > 0 ? '<span class="stat-chip">🛒 +' + marketIncome + '₺</span>' : '') +
        loanChip +
        '</div>';

      els.playersHud.appendChild(card);
    });
  }

  function renderDie() {
    if (!runtime.state) return;
    els.die1.textContent = String(runtime.state.lastDie || runtime.state.lastDiceTotal || 1);
  }

  function renderCommandDock() {
    var st = runtime.state;
    var current = Engine.getActiveDecisionPlayer(st);
    var canAct = canLocalUserControlCurrentTurn();

    if (st.phase === 'GAME_OVER') {
      var winner = Engine.getPlayerById(st, st.winnerId);
      els.centerTurnCaption.textContent = '🏆 Kazanan: ' + (winner ? winner.name : '-');
      els.centerActionRow.innerHTML = '<a href="index.html" class="btn btn-primary">Yeni Oyun Kur</a>';
      els.centerStatusBox.textContent = 'Oyun sona erdi!';
      return;
    }

    els.centerTurnCaption.textContent =
      (st.phase === 'AUCTION'
        ? '🔨 İhale Sırası: '
        : st.phase === 'HUB_ACTION'
        ? '🏙️ Merkez İşlemi: '
        : 'Sıra: ') +
      (current ? current.name : '-') +
      (current && current.isBot ? ' (Bot düşünüyor...)' : '');

    els.centerActionRow.innerHTML = '';

    var appendOnSiteUpgradeBtnIfReady = function () {
      if (!current) return;
      var upgInfo = Engine.getUpgradeInfo(st, current.id, current.pos);
      if (upgInfo && upgInfo.canUpgrade && upgInfo.isOnSite) {
        var canAffordUpg = Engine.getPlayerTotalFunds(current) >= upgInfo.cost;
        var upgBtn = document.createElement('button');
        upgBtn.type = 'button';
        upgBtn.className = 'btn btn-primary btn-sm';
        upgBtn.disabled = !canAffordUpg;
        upgBtn.textContent =
          '⬆️ Yerinde Yükselt (' +
          upgInfo.nextTier.icon +
          ' 1x • ' +
          formatMoney(upgInfo.cost) +
          ')';
        upgBtn.addEventListener('click', function () {
          var o = st.ownership[current.pos];
          if (SFX && SFX.playBuildShop && o) SFX.playBuildShop(o.shopType, upgInfo.nextLevel);
          sendPlayerAction({ type: 'UPGRADE_SHOP', tileIndex: current.pos });
        });
        els.centerActionRow.appendChild(upgBtn);
      }
    };

    if (canAct) {
      if (st.phase === 'PRE_ROLL') {
        var rollBtn = document.createElement('button');
        rollBtn.type = 'button';
        rollBtn.className = 'btn btn-primary btn-lg';
        rollBtn.textContent = '🎲 Zar At';
        rollBtn.addEventListener('click', function () {
          sendPlayerAction({ type: 'ROLL_DICE' });
        });
        els.centerActionRow.appendChild(rollBtn);
        appendOnSiteUpgradeBtnIfReady();
      } else if (st.phase === 'DRAW_EVENT_CARD') {
        var drawBtn = document.createElement('button');
        drawBtn.type = 'button';
        drawBtn.className = 'btn btn-primary btn-lg';
        drawBtn.textContent = '🃏 Ortadaki Desteden Kart Çek';
        drawBtn.addEventListener('click', triggerDrawEventCard);
        els.centerActionRow.appendChild(drawBtn);
      } else if (st.phase === 'POST_ROLL') {
        appendOnSiteUpgradeBtnIfReady();
        var endBtn = document.createElement('button');
        endBtn.type = 'button';
        endBtn.className = 'btn btn-emerald btn-lg';
        endBtn.textContent = '✅ Turu Bitir';
        endBtn.addEventListener('click', function () {
          sendPlayerAction({ type: 'END_TURN' });
        });
        els.centerActionRow.appendChild(endBtn);
      } else if (st.phase === 'CHOOSE_TELEPORT') {
        var hintBadge = document.createElement('span');
        hintBadge.className = 'pill pill-gold';
        hintBadge.textContent = '📦 3D tahtada gitmek istediğin mor kareye tıkla!';
        els.centerActionRow.appendChild(hintBadge);
      }
    } else if (!runtime.isAnimating && current && !current.isBot) {
      var waitBadge = document.createElement('span');
      waitBadge.className = 'pill';
      waitBadge.textContent = '⏳ ' + current.name + ' hamlesini yapıyor...';
      els.centerActionRow.appendChild(waitBadge);
    }

    var latestLog = st.logs && st.logs[0] ? st.logs[0].text : 'Tek zarını at ve İstanbul’da ilerle!';
    els.centerStatusBox.textContent = latestLog;
  }

  function renderLogs() {
    var st = runtime.state;
    els.logList.innerHTML = '';
    st.logs.slice(0, 35).forEach(function (entry) {
      var div = document.createElement('div');
      div.className = 'log-entry ' + (entry.category || 'info');
      div.textContent = '[T' + entry.turn + '] ' + entry.text;
      els.logList.appendChild(div);
    });
  }

  function closeManualModal() {
    runtime.manualModal = null;
    renderActiveModal();
  }

  function openModalHtml(html, wide, allowBackdropClose) {
    els.modalCard.className = 'modal-card' + (wide ? ' modal-wide' : '');
    els.modalCard.innerHTML = html;
    els.modalBackdrop.classList.remove('hidden');
    els.modalBackdrop.onclick = function (e) {
      if (allowBackdropClose && e.target === els.modalBackdrop) {
        closeManualModal();
      }
    };
  }

  function closeModal() {
    els.modalBackdrop.classList.add('hidden');
    els.modalCard.innerHTML = '';
  }

  function renderActiveModal() {
    var st = runtime.state;
    if (!st || runtime.isAnimating) {
      if (!runtime.manualModal) closeModal();
      return;
    }

    if (runtime.manualModal) {
      if (runtime.manualModal === 'bank') {
        renderBankModal();
        return;
      }
      if (runtime.manualModal === 'props') {
        renderPropertiesModal();
        return;
      }
      if (runtime.manualModal === 'rules') {
        renderRulesModal();
        return;
      }
      if (typeof runtime.manualModal === 'object' && runtime.manualModal.type === 'tile') {
        renderTileInspectorModal(runtime.manualModal.tileIndex);
        return;
      }
    }

    if (st.phase === 'GAME_OVER') {
      var winner = Engine.getPlayerById(st, st.winnerId);
      openModalHtml(
        '<div style="text-align:center;padding:12px 0;">' +
          '<div style="font-size:3rem;">🏆</div>' +
          '<h2 class="modal-title font-display" style="font-size:1.65rem;margin-top:6px;">İMPARATORLUK ZAFERİ</h2>' +
          '<p class="modal-subtitle" style="font-size:1rem;color:#fde68a;margin-top:8px;">' +
          escapeHtml(winner ? winner.name : 'Kazanan') +
          ' BARONIA unvanını kazandı!</p>' +
          '<div style="margin:20px auto;display:inline-block;">' +
          (winner ? Avatar.renderAvatarSVG(winner.avatar, 110) : '') +
          '</div>' +
          '<div style="display:flex;justify-content:center;gap:10px;margin-top:10px;">' +
          '<a href="index.html" class="btn btn-primary btn-lg">Yeni Oyun Kur</a>' +
          '</div>' +
          '</div>',
        false,
        false
      );
      return;
    }

    if (st.phase === 'AUCTION' && st.auction) {
      renderAuctionModal(st.auction);
      return;
    }

    var canAct = canLocalUserControlCurrentTurn();
    var current = Engine.getCurrentPlayer(st);

    if (canAct && st.phase === 'BUY_PLOT') {
      renderBuyPlotModal(current);
      return;
    }
    if (canAct && st.phase === 'BUY_SPECIAL') {
      renderBuySpecialModal(current);
      return;
    }
    if (canAct && st.phase === 'HUB_ACTION' && st.pendingHub) {
      renderHubActionModal(current, st.pendingHub);
      return;
    }
    if (canAct && st.phase === 'INSPECTION_CHOICE') {
      renderInspectionModal(current);
      return;
    }
    if (canAct && st.phase === 'TADILAT_CHOICE' && st.pendingTadilat) {
      renderTadilatModal(current, st.pendingTadilat);
      return;
    }
    if (canAct && st.phase === 'DEBT_RESOLUTION' && st.pendingDebt) {
      renderDebtResolutionModal(current, st.pendingDebt);
      return;
    }

    closeModal();
  }

  function showEventCardRevealModal(card, onDone) {
    var accBadge =
      card.targetAccount === 'bank'
        ? '<span class="pill pill-blue">💳 Banka Hesabı Olayı</span>'
        : '<span class="pill pill-emerald">💵 Nakit Cüzdanı Olayı</span>';

    openModalHtml(
      '<div class="event-flip-scene">' +
        '<div id="event-flip-card" class="event-flip-card">' +
        '<div class="event-face">' +
        accBadge +
        '<div style="font-size:3rem;margin:10px 0 6px;">' +
        card.icon +
        '</div>' +
        '<h2 class="modal-title" style="font-size:1.28rem;">' +
        escapeHtml(card.title) +
        '</h2>' +
        '<p style="margin:10px 0 0;color:#e2e8f0;line-height:1.5;font-size:0.9rem;">' +
        escapeHtml(card.description) +
        '</p>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div style="text-align:center;">' +
        '<button type="button" id="btn-close-event-card" class="btn btn-primary">Uygula ve Devam Et</button>' +
        '</div>',
      false,
      false
    );

    setTimeout(function () {
      var flipEl = document.getElementById('event-flip-card');
      if (flipEl) flipEl.classList.add('revealed');
    }, 60);

    var resolved = false;
    function finish() {
      if (resolved) return;
      resolved = true;
      closeModal();
      if (onDone) onDone();
    }

    document.getElementById('btn-close-event-card').addEventListener('click', finish);
    // Auto-continue for bots so game never stalls
    var player = Engine.getPlayerById(runtime.state, card.playerId);
    if (player && player.isBot) {
      setTimeout(finish, 2100);
    }
  }

  function buildNeighborhoodHeaderHtml(tile, subtitleText) {
    var hood = BD.NEIGHBORHOODS[tile.neighborhoodId];
    return (
      '<div class="hood-modal-banner hood-pattern-' +
      escapeHtml(hood.id) +
      '" style="background:' +
      hood.gradient +
      ';">' +
      '<div class="hood-banner-left">' +
      '<div class="hood-banner-icon">' +
      hood.badgeIcon +
      '</div>' +
      '<div>' +
      '<div style="font-size:0.72rem;font-weight:700;color:#fde68a;text-transform:uppercase;letter-spacing:0.05em;">' +
      escapeHtml(hood.name) +
      ' • ' +
      escapeHtml(hood.tagline) +
      '</div>' +
      '<h2 class="modal-title" style="margin:2px 0 0;font-size:1.15rem;color:#ffffff;">' +
      escapeHtml(tile.name) +
      '</h2>' +
      (subtitleText ? '<div style="font-size:0.75rem;color:#cbd5e1;margin-top:2px;">' + subtitleText + '</div>' : '') +
      '</div>' +
      '</div>' +
      '<button type="button" id="modal-close-x-header" class="modal-close-btn" style="flex-shrink:0;display:none;">✕</button>' +
      '</div>'
    );
  }

  function buildSpecialTileBannerHtml(tile, subtitleText, tagText) {
    var bannerClass = 'special-banner-corner';
    if (tile.type === 'event') bannerClass = 'special-banner-event';
    else if (tile.type === 'tax') bannerClass = 'special-banner-tax';
    else if (tile.type === 'toptanci') bannerClass = 'special-banner-toptanci';
    else if (tile.type === 'utility') bannerClass = 'special-banner-utility';
    else if (tile.type === 'landmark') bannerClass = 'special-banner-landmark';

    return (
      '<div class="hood-modal-banner ' +
      bannerClass +
      '">' +
      '<div class="hood-banner-left">' +
      '<div class="hood-banner-icon">' +
      tile.icon +
      '</div>' +
      '<div>' +
      '<div style="font-size:0.72rem;font-weight:700;color:#fde68a;text-transform:uppercase;letter-spacing:0.05em;">' +
      escapeHtml(tagText || 'İstanbul Özel Hücresi') +
      '</div>' +
      '<h2 class="modal-title" style="margin:2px 0 0;font-size:1.15rem;color:#ffffff;">' +
      escapeHtml(tile.name) +
      '</h2>' +
      (subtitleText ? '<div style="font-size:0.75rem;color:#e2e8f0;margin-top:2px;">' + subtitleText + '</div>' : '') +
      '</div>' +
      '</div>' +
      '<button type="button" id="modal-close-tile" class="modal-close-btn" style="flex-shrink:0;">✕</button>' +
      '</div>'
    );
  }

  function buildCompactShopRowsHtml(tile, player, interactive) {
    var order = ['dondurmaci', 'market', 'kafe', 'magaza'];
    var totalFunds = player ? Engine.getPlayerTotalFunds(player) : 0;
    var html = '<div class="shop-list-compact">';

    order.forEach(function (shopId) {
      var meta = BD.SHOP_TYPES[shopId];
      var stats = BD.getShopStats(shopId, tile.neighborhoodId);
      var affordable = !player || totalFunds >= stats.cost;

      var numbersText = '';
      if (shopId === 'dondurmaci') {
        numbersText = 'Geçiş: +' + stats.passFee + '₺ • Durma: +' + stats.landRent + '₺';
      } else if (shopId === 'market') {
        numbersText = 'Başlangıç: +' + stats.startBonus + '₺ • Durma: +' + stats.landRent + '₺';
      } else if (shopId === 'kafe') {
        numbersText = 'Durma: +' + stats.landRent + '₺ • Mahalle: +%25';
      } else {
        numbersText = 'Yüksek Kira: +' + stats.landRent + '₺';
      }

      var actionHtml = interactive
        ? '<button type="button" class="btn btn-sm ' +
          (affordable ? 'btn-primary' : 'btn-ghost') +
          '" data-buy-shop="' +
          shopId +
          '" ' +
          (affordable ? '' : 'disabled') +
          '>' +
          (affordable ? 'İnşa Et • ' + formatMoney(stats.cost) : 'Yetersiz (' + formatMoney(stats.cost) + ')') +
          '</button>'
        : '<span class="pill pill-gold">' + formatMoney(stats.cost) + '</span>';

      html +=
        '<div class="shop-row-compact">' +
        '<div>' +
        '<div class="shop-row-title">' +
        meta.icon +
        ' ' +
        meta.name +
        '</div>' +
        '<div class="shop-row-sub">' +
        escapeHtml(meta.shortRule) +
        '</div>' +
        '</div>' +
        '<div class="shop-row-stats">' +
        numbersText +
        '</div>' +
        '<div>' +
        actionHtml +
        '</div>' +
        '</div>';
    });

    html += '</div>';
    return html;
  }

  function renderBuyPlotModal(player) {
    var tile = BD.TILES[player.pos];
    var totalFunds = Engine.getPlayerTotalFunds(player);
    var subHtml =
      'Bakiye: <strong>' +
      formatMoney(totalFunds) +
      '</strong> (💳 ' +
      formatMoney(player.bank) +
      ' + 💵 ' +
      formatMoney(player.cash) +
      ')';

    openModalHtml(
      buildNeighborhoodHeaderHtml(tile, subHtml) +
        buildCompactShopRowsHtml(tile, player, true) +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<button type="button" id="modal-open-bank-quick" class="btn btn-emerald btn-sm">🏦 Banka / Kredi</button>' +
        '<button type="button" id="btn-skip-buy" class="btn btn-ghost btn-sm">Pas Geç (Alma)</button>' +
        '</div>',
      true,
      false
    );

    els.modalCard.querySelectorAll('[data-buy-shop]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var stType = this.getAttribute('data-buy-shop');
        if (SFX && SFX.playBuildShop) SFX.playBuildShop(stType, 1);
        else if (SFX) SFX.playBuild();
        sendPlayerAction({ type: 'BUY_SHOP', shopType: stType });
      });
    });
    document.getElementById('btn-skip-buy').addEventListener('click', function () {
      sendPlayerAction({ type: 'SKIP_BUY' });
    });
    document.getElementById('modal-open-bank-quick').addEventListener('click', function () {
      runtime.bankScreen = 'loans';
      runtime.manualModal = 'bank';
      renderActiveModal();
    });
  }

  function getUtilityDescriptionHtml(tile, isOwned, eff) {
    var kind = tile.utilityKind || 'taksi';
    if (kind === 'taksi') {
      return '<strong>🚕 Taksi Durağı:</strong> Üstünde duran herkes <strong>1–6 ek zar</strong> atıp ilerler! Rakip ayrıca <strong>50₺ + Zar × 35₺</strong> (+ ekstra merkez bonusu) öder; sahibi ise ücretsiz taksiye biner.';
    }
    if (kind === 'borsa') {
      return '<strong>📡 Borsa Ofisi:</strong> Rakip durduğunda <strong>130₺ komisyon</strong> (+ ek merkez bonusu) öder ve piyasa zarı atar: 1–2 gelirse -90₺ ek kayıp, 5–6 gelirse +180₺ boğa kârı yakalar! Sahibi ise +120₺ temettü alır.';
    }
    if (kind === 'medya') {
      return '<strong>📺 Medya Ajansı:</strong> Rakip durduğunda <strong>110₺ + Sahibin dükkan sayısı × 35₺</strong> reklam geliri öder! Sahibi uğrarsa kendi dükkan sayısına göre nakit reklam primi alır.';
    }
    return '<strong>🚁 Boğaz Heliportu:</strong> Sahibi kendi turunda buradan <strong>istediği kareye VIP uçuş</strong> yapabilir! Rakip durursa <strong>170₺</strong> (+ ek merkez başına +55₺) VIP iniş harcı öder.';
  }

  function renderBuySpecialModal(player) {
    var tile = BD.TILES[player.pos];
    var totalFunds = Engine.getPlayerTotalFunds(player);
    var affordable = totalFunds >= tile.cost;
    var desc =
      tile.type === 'landmark'
        ? 'Hazır İstanbul İkonu! Kira: <strong>' +
          tile.baseRent +
          '₺</strong>. (2 ikon: 1.5x, 3 ikon: 2.2x kira!)'
        : getUtilityDescriptionHtml(tile, false, null);

    openModalHtml(
      '<div class="modal-header">' +
        '<div>' +
        '<h2 class="modal-title">' +
        tile.icon +
        ' ' +
        escapeHtml(tile.name) +
        '</h2>' +
        '<p class="modal-subtitle">Toplam Bakiyen: <strong>' +
        formatMoney(totalFunds) +
        '</strong></p>' +
        '</div>' +
        '</div>' +
        '<p style="line-height:1.55;color:#e2e8f0;">' +
        desc +
        '</p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">' +
        '<button type="button" id="modal-open-bank-spec" class="btn btn-emerald btn-sm" style="margin-right:auto;">🏦 Kredi Çek</button>' +
        '<button type="button" id="btn-skip-spec" class="btn btn-ghost">Pas Geç</button>' +
        '<button type="button" id="btn-buy-spec" class="btn btn-primary" ' +
        (affordable ? '' : 'disabled') +
        '>Satın Al (' +
        formatMoney(tile.cost) +
        ')</button>' +
        '</div>',
      false,
      false
    );

    document.getElementById('btn-buy-spec').addEventListener('click', function () {
      if (SFX) SFX.playBuild();
      sendPlayerAction({ type: 'BUY_SPECIAL' });
    });
    document.getElementById('btn-skip-spec').addEventListener('click', function () {
      sendPlayerAction({ type: 'SKIP_BUY' });
    });
    document.getElementById('modal-open-bank-spec').addEventListener('click', function () {
      runtime.bankScreen = 'loans';
      runtime.manualModal = 'bank';
      renderActiveModal();
    });
  }

  function renderHubActionModal(player, hub) {
    var tile = BD.TILES[hub.tileIndex];
    var owner = Engine.getPlayerById(runtime.state, hub.ownerId);
    var bodyHtml = '';
    var btnsHtml = '';

    if (hub.kind === 'taksi') {
      bodyHtml = hub.isOwner
        ? 'Kendi <strong>🚕 Taksi Durağındasın!</strong> İstersen ücretsiz 1–6 taksi zarı atıp ilerleyebilir veya burada kalabilirsin.'
        : '<strong>' +
          escapeHtml(owner ? owner.name : 'Rakip') +
          '</strong> oyuncusunun Taksi Durağındasın! <strong>1–6 zar</strong> atıp gelen zar kadar ileri gideceksin ve <strong>50₺ + Zar × 35₺</strong> yol ücreti ödeyeceksin.';
      btnsHtml =
        (hub.isOwner ? '<button type="button" id="btn-hub-skip" class="btn btn-ghost">Burada Kal</button>' : '') +
        '<button type="button" id="btn-hub-roll" class="btn btn-primary btn-lg">🚕 Taksi Zarı At (1–6)</button>';
    } else if (hub.kind === 'borsa') {
      bodyHtml =
        '<strong>' +
        escapeHtml(owner ? owner.name : 'Rakip') +
        '</strong> oyuncusunun <strong>📡 Borsa Ofisindesin!</strong> Komisyona ek olarak piyasa zarı çekeceksin:<br><br>' +
        '• <strong>1–2:</strong> Ayı piyasası (-90₺ ek kayıp)<br>' +
        '• <strong>3–4:</strong> Yatay piyasa (ek değişim yok)<br>' +
        '• <strong>5–6:</strong> Boğa rallisi (<strong>+180₺ kâr!</strong>)';
      btnsHtml = '<button type="button" id="btn-hub-roll" class="btn btn-primary btn-lg">📡 Piyasa Zarı At (1–6)</button>';
    } else {
      bodyHtml =
        'Kendi <strong>🚁 Boğaz Heliportundasın!</strong> Başlangıç veya Toptancı hariç tahtadaki istediğin herhangi bir kareye VIP uçuş yapabilirsin.';
      btnsHtml =
        '<button type="button" id="btn-hub-skip" class="btn btn-ghost">Burada Kal</button>' +
        '<button type="button" id="btn-hub-fly" class="btn btn-primary btn-lg">🚁 İstediğin Kareye Uç</button>';
    }

    openModalHtml(
      buildSpecialTileBannerHtml(tile, 'Aktif İstanbul Merkezi • Kare #' + hub.tileIndex, 'Merkez Aksiyonu').replace(
        '<button type="button" id="modal-close-tile" class="modal-close-btn" style="flex-shrink:0;">✕</button>',
        ''
      ) +
        '<div class="hub-modal-box"><p style="margin:0;line-height:1.55;color:#e2e8f0;">' +
        bodyHtml +
        '</p></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">' +
        btnsHtml +
        '</div>',
      false,
      false
    );

    var rollBtn = document.getElementById('btn-hub-roll');
    if (rollBtn) {
      rollBtn.addEventListener('click', function () {
        sendPlayerAction({ type: 'RESOLVE_HUB', choice: 'roll' });
      });
    }
    var flyBtn = document.getElementById('btn-hub-fly');
    if (flyBtn) {
      flyBtn.addEventListener('click', function () {
        sendPlayerAction({ type: 'RESOLVE_HUB', choice: 'fly' });
      });
    }
    var skipBtn = document.getElementById('btn-hub-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        sendPlayerAction({ type: 'RESOLVE_HUB', choice: 'skip' });
      });
    }
  }

  function renderInspectionModal(player) {
    var canPay = Engine.getPlayerTotalFunds(player) >= BD.INSPECTION_FINE;
    openModalHtml(
      '<div class="modal-header">' +
        '<div>' +
        '<h2 class="modal-title">🚨 Zabıta İncelemesi</h2>' +
        '<p class="modal-subtitle">İşletmelerin evrak denetiminde.</p>' +
        '</div>' +
        '</div>' +
        '<p style="line-height:1.55;">' +
        BD.INSPECTION_FINE +
        '₺ idari ceza ödeyip hemen zar atabilir veya 1 tur bekleyerek cezasız çıkabilirsin.</p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">' +
        '<button type="button" id="btn-zabita-wait" class="btn btn-ghost">1 Tur Bekle (Ücretsiz)</button>' +
        '<button type="button" id="btn-zabita-pay" class="btn btn-primary" ' +
        (canPay ? '' : 'disabled') +
        '>' +
        BD.INSPECTION_FINE +
        '₺ Öde ve Zar At</button>' +
        '</div>',
      false,
      false
    );

    document.getElementById('btn-zabita-wait').addEventListener('click', function () {
      sendPlayerAction({ type: 'INSPECTION_WAIT' });
    });
    document.getElementById('btn-zabita-pay').addEventListener('click', function () {
      sendPlayerAction({ type: 'INSPECTION_PAY' });
    });
  }

  function renderTadilatModal(player, tadilat) {
    openModalHtml(
      '<div class="modal-header">' +
        '<div>' +
        '<h2 class="modal-title">🛠️ Zorunlu Tadilat</h2>' +
        '<p class="modal-subtitle">En değerli işletmen: <strong>' +
        escapeHtml(tadilat.tileName) +
        '</strong></p>' +
        '</div>' +
        '</div>' +
        '<p style="line-height:1.55;">Bu dükkanı 1 tam tur boyunca kapatabilir ya da değerinin %15’ini (' +
        formatMoney(tadilat.repairCost) +
        ') ödeyerek açık tutabilirsin.</p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">' +
        '<button type="button" id="btn-tadilat-close" class="btn btn-danger">🚧 1 Tur Kapat</button>' +
        '<button type="button" id="btn-tadilat-pay" class="btn btn-primary">' +
        formatMoney(tadilat.repairCost) +
        ' Öde &amp; Açık Tut</button>' +
        '</div>',
      false,
      false
    );

    document.getElementById('btn-tadilat-close').addEventListener('click', function () {
      sendPlayerAction({ type: 'TADILAT_CLOSE' });
    });
    document.getElementById('btn-tadilat-pay').addEventListener('click', function () {
      sendPlayerAction({ type: 'TADILAT_PAY' });
    });
  }

  function renderDebtResolutionModal(player, debt) {
    var totalFunds = Engine.getPlayerTotalFunds(player);
    var canPay = totalFunds >= debt.amount;
    openModalHtml(
      '<div class="modal-header">' +
        '<div>' +
        '<h2 class="modal-title" style="color:#fda4af;">⚠️ Ödeme Gerekli</h2>' +
        '<p class="modal-subtitle">' +
        escapeHtml(debt.reason) +
        '</p>' +
        '</div>' +
        '</div>' +
        '<p style="line-height:1.55;">Ödemen gereken tutar: <strong style="color:#fcd34d;">' +
        formatMoney(debt.amount) +
        '</strong><br>Toplam Bakiyen: <strong>' +
        formatMoney(totalFunds) +
        '</strong> (💳 ' +
        formatMoney(player.bank) +
        ' + 💵 ' +
        formatMoney(player.cash) +
        ')</p>' +
        '<p style="font-size:0.84rem;color:var(--text-muted);">Nakit bulmak için İstanbul Bankası’ndan kredi çekebilir veya mülklerinden birini %60 değerine satabilirsin.</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin-top:16px;">' +
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" id="debt-open-bank" class="btn btn-emerald btn-sm">🏦 Kredi Çek</button>' +
        '<button type="button" id="debt-open-props" class="btn btn-blue btn-sm">🏢 Mülk Sat</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" id="debt-bankrupt" class="btn btn-danger btn-sm">İflas Et</button>' +
        '<button type="button" id="debt-pay" class="btn btn-primary" ' +
        (canPay ? '' : 'disabled') +
        '>Borcu Öde (' +
        formatMoney(debt.amount) +
        ')</button>' +
        '</div>' +
        '</div>',
      false,
      false
    );

    document.getElementById('debt-open-bank').addEventListener('click', function () {
      runtime.bankScreen = 'loans';
      runtime.manualModal = 'bank';
      renderActiveModal();
    });
    document.getElementById('debt-open-props').addEventListener('click', function () {
      runtime.bankScreen = 'properties';
      runtime.manualModal = 'bank';
      renderActiveModal();
    });
    document.getElementById('debt-pay').addEventListener('click', function () {
      sendPlayerAction({ type: 'PAY_PENDING_DEBT' });
    });
    document.getElementById('debt-bankrupt').addEventListener('click', function () {
      sendPlayerAction({ type: 'DECLARE_BANKRUPTCY' });
    });
  }

  function buildAtmHeaderHtml(player, isSubScreen) {
    var avatarHtml = player ? Avatar.renderAvatarSVG(player.avatar, 42) : '';
    return (
      '<div class="atm-header-strip">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      (isSubScreen
        ? '<button type="button" id="atm-back-btn" class="btn btn-ghost btn-sm">← Geri</button>'
        : '') +
      avatarHtml +
      '<div>' +
      '<div style="font-size:0.72rem;font-weight:800;color:#7dd3fc;letter-spacing:0.06em;">🏦 BARONIA BANK • ATM</div>' +
      '<div style="font-size:1rem;font-weight:800;color:#ffffff;">' +
      escapeHtml(player ? player.name : 'Müşteri') +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="atm-balance-pills">' +
      '<span class="pill pill-blue">💳 Banka: ' +
      formatMoney(player ? player.bank : 0) +
      '</span>' +
      '<span class="pill pill-emerald">💵 Nakit: ' +
      formatMoney(player ? player.cash : 0) +
      '</span>' +
      '<button type="button" id="modal-close-x" class="modal-close-btn">✕</button>' +
      '</div>' +
      '</div>'
    );
  }

  function renderBankModal() {
    var pid = getActingPlayerIdForMenu();
    var player = Engine.getPlayerById(runtime.state, pid);
    var current = Engine.getCurrentPlayer(runtime.state);
    var isMyTurn = current && player && current.id === player.id && canLocalUserControlCurrentTurn();
    var totalFunds = player ? Engine.getPlayerTotalFunds(player) : 0;
    var screen = runtime.bankScreen || 'home';
    var isSub = screen !== 'home';

    var turnWarningHtml = isMyTurn
      ? ''
      : '<div class="status-banner" style="margin:0 0 10px;">⏳ İşlemler sadece kendi turunda onaylanabilir.</div>';

    var bodyHtml = '';

    if (screen === 'home') {
      var ownedIndicesHome = player ? Engine.getPlayerPropertyIndices(runtime.state, player.id) : [];
      var hasActiveLoan = player && player.loans.length > 0;
      var loanBadge = hasActiveLoan
        ? '<span class="pill pill-gold">Aktif Kredi Var</span>'
        : player && player.loansTakenCount === 0
        ? '<span class="pill pill-emerald">🎉 %0 FAİZ</span>'
        : '<span class="pill">3 Tur Ödemesiz</span>';

      bodyHtml =
        '<div class="atm-home-grid">' +
        '<button type="button" class="atm-action-card withdraw" data-atm-nav="withdraw">' +
        '<div style="display:flex;justify-content:space-between;width:100%;align-items:center;">' +
        '<span class="atm-card-icon">⬆️</span>' +
        '<span class="pill pill-emerald">Cüzdana</span>' +
        '</div>' +
        '<div>' +
        '<div class="atm-card-title">PARA ÇEK</div>' +
        '<div class="atm-card-sub">Banka hesabından nakit cüzdanına aktar</div>' +
        '</div>' +
        '</button>' +
        '<button type="button" class="atm-action-card deposit" data-atm-nav="deposit">' +
        '<div style="display:flex;justify-content:space-between;width:100%;align-items:center;">' +
        '<span class="atm-card-icon">⬇️</span>' +
        '<span class="pill pill-blue">+%5 Başlangıç Faizi</span>' +
        '</div>' +
        '<div>' +
        '<div class="atm-card-title">PARA YATIR</div>' +
        '<div class="atm-card-sub">Nakitini bankada değerlendir &amp; faiz kazan</div>' +
        '</div>' +
        '</button>' +
        '<button type="button" class="atm-action-card loans" data-atm-nav="loans">' +
        '<div style="display:flex;justify-content:space-between;width:100%;align-items:center;">' +
        '<span class="atm-card-icon">🏦</span>' +
        loanBadge +
        '</div>' +
        '<div>' +
        '<div class="atm-card-title">KREDİ İŞLEMLERİ</div>' +
        '<div class="atm-card-sub">Anında sermaye onayı &amp; erken kapama</div>' +
        '</div>' +
        '</button>' +
        '<button type="button" class="atm-action-card properties" data-atm-nav="properties">' +
        '<div style="display:flex;justify-content:space-between;width:100%;align-items:center;">' +
        '<span class="atm-card-icon">🏢</span>' +
        '<span class="pill">' +
        ownedIndicesHome.length +
        ' Mülk</span>' +
        '</div>' +
        '<div>' +
        '<div class="atm-card-title">MÜLKLERİM &amp; İHALE</div>' +
        '<div class="atm-card-sub">Mülklerini sat veya açık artırmaya çıkar</div>' +
        '</div>' +
        '</button>' +
        '</div>';
    } else if (screen === 'withdraw') {
      var bankBal = player ? player.bank : 0;
      var defWd = Math.min(bankBal, Math.max(50, runtime.bankTransferAmount || 250));
      bodyHtml =
        '<div class="atm-sub-card">' +
        '<div style="font-size:1.1rem;font-weight:800;color:#ffffff;">Ne kadar nakit çekmek istiyorsun?</div>' +
        '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Kullanılabilir Banka Bakiyen: <strong style="color:#7dd3fc;">' +
        formatMoney(bankBal) +
        '</strong></div>' +
        '<div class="quick-amt-row" style="justify-content:center;margin-top:14px;">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="100">100₺</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="250">250₺</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="500">500₺</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="1000">1.000₺</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="all-bank">Tümü (' +
        formatMoney(bankBal) +
        ')</button>' +
        '</div>' +
        '<input type="number" id="atm-amt-input" class="atm-amt-input" min="10" step="10" value="' +
        defWd +
        '">' +
        '<div>' +
        '<button type="button" id="btn-withdraw-confirm" class="btn btn-emerald btn-lg" ' +
        (isMyTurn && bankBal > 0 ? '' : 'disabled') +
        '>⬆️ ' +
        formatMoney(defWd) +
        ' Nakit Çek</button>' +
        '</div>' +
        '</div>';
    } else if (screen === 'deposit') {
      var cashBal = player ? player.cash : 0;
      var defDep = Math.min(cashBal, Math.max(50, runtime.bankTransferAmount || 250));
      bodyHtml =
        '<div class="atm-sub-card">' +
        '<div style="font-size:1.1rem;font-weight:800;color:#ffffff;">Ne kadar nakit yatırmak istiyorsun?</div>' +
        '<div style="font-size:0.8rem;color:#7dd3fc;margin-top:4px;">Her Başlangıç geçişinde bankadaki parana +%5 faiz işler! Cüzdan: <strong>' +
        formatMoney(cashBal) +
        '</strong></div>' +
        '<div class="quick-amt-row" style="justify-content:center;margin-top:14px;">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="100">100₺</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="250">250₺</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="500">500₺</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="1000">1.000₺</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-quick-amt="all-cash">Tümü (' +
        formatMoney(cashBal) +
        ')</button>' +
        '</div>' +
        '<input type="number" id="atm-amt-input" class="atm-amt-input" min="10" step="10" value="' +
        defDep +
        '">' +
        '<div>' +
        '<button type="button" id="btn-deposit-confirm" class="btn btn-blue btn-lg" ' +
        (isMyTurn && cashBal > 0 ? '' : 'disabled') +
        '>⬇️ ' +
        formatMoney(defDep) +
        ' Bankaya Yatır</button>' +
        '</div>' +
        '</div>';
    } else if (screen === 'loans') {
      if (player && player.loans.length > 0) {
        var loan = player.loans[0];
        var paidAmt = Math.max(0, loan.totalRepay - loan.remainingAmount);
        var pct = Math.max(0, Math.min(100, Math.round((paidAmt / Math.max(1, loan.totalRepay)) * 100)));
        var gracePill =
          loan.graceTurnsRemaining > 0
            ? '<span class="pill pill-emerald">⏳ ' + loan.graceTurnsRemaining + ' Tur Ödemesiz Dönem</span>'
            : '<span class="pill pill-gold">Sonraki Taksit: ' + formatMoney(loan.installmentAmount) + '</span>';

        bodyHtml =
          '<div class="vip-loan-banner">' +
          '<div><strong>📄 Aktif Kredi Sözleşmesi</strong><div style="font-size:0.78rem;color:#cbd5e1;">Mevcut kredin tamamen kapanmadan yeni kredi paketi açılamaz.</div></div>' +
          gracePill +
          '</div>' +
          '<div class="vip-loan-card featured">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<div><h3 style="margin:0;font-size:1.1rem;color:#fde68a;">🏦 ' +
          escapeHtml(loan.name) +
          '</h3><div style="font-size:0.78rem;color:var(--text-muted);">' +
          (loan.isZeroInterest ? '%0 İlk Kredi Avantajı' : 'Ticari Kredi') +
          '</div></div>' +
          '<div style="text-align:right;"><div style="font-size:0.72rem;color:var(--text-muted);">Kalan Borç</div><div style="font-size:1.35rem;font-weight:800;color:#ffffff;">' +
          formatMoney(loan.remainingAmount) +
          '</div></div>' +
          '</div>' +
          '<div class="loan-progress-bar"><div class="loan-progress-fill" style="width:' +
          pct +
          '%;"></div></div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.78rem;color:#cbd5e1;flex-wrap:wrap;gap:8px;">' +
          '<span>Kalan: ' +
          loan.remainingInstallments +
          ' taksit • Toplam Sözleşme: ' +
          formatMoney(loan.totalRepay) +
          '</span>' +
          '<button type="button" id="btn-repay-active-loan" class="btn btn-emerald" data-repay-loan="' +
          escapeHtml(loan.id) +
          '" ' +
          (isMyTurn && totalFunds >= loan.remainingAmount ? '' : 'disabled') +
          '>💳 Krediyi Erken Kapat (' +
          formatMoney(loan.remainingAmount) +
          ')</button>' +
          '</div>' +
          '</div>';
      } else {
        var offers = player ? Engine.getAvailableLoanOffers(runtime.state, player.id) : [];
        var isFirstZero = player && player.loansTakenCount === 0;
        var cardsHtml = '';
        offers.forEach(function (offer) {
          var badge =
            offer.id === 'isletme'
              ? '<span class="pill pill-gold">⭐ Önerilen</span>'
              : offer.id === 'yatirim'
              ? '<span class="pill pill-emerald">💎 VIP</span>'
              : '<span class="pill">Hızlı Nakit</span>';
          var cardCls =
            offer.id === 'isletme'
              ? 'vip-loan-card featured'
              : offer.id === 'yatirim'
              ? 'vip-loan-card vip-gold'
              : 'vip-loan-card';

          cardsHtml +=
            '<div class="' +
            cardCls +
            '">' +
            '<div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;">' +
            '<strong style="font-size:0.92rem;color:#ffffff;">' +
            escapeHtml(offer.name) +
            '</strong>' +
            badge +
            '</div>' +
            '<div style="font-size:1.55rem;font-weight:900;color:#fde68a;margin-bottom:6px;">' +
            formatMoney(offer.principal) +
            '</div>' +
            '<div style="font-size:0.78rem;color:#cbd5e1;line-height:1.45;">' +
            '<div>Geri Ödeme: <strong>' +
            formatMoney(offer.totalRepay) +
            '</strong> (' +
            (offer.isZeroInterest ? '%0 Faiz' : '%' + Math.round(offer.interestRate * 100) + ' Faiz') +
            ')</div>' +
            '<div>Taksit: <strong>' +
            offer.installments +
            ' × ' +
            formatMoney(offer.installmentAmount) +
            '</strong></div>' +
            '<div style="color:#6ee7b7;margin-top:3px;">⏳ İlk 3 tur ödemesiz</div>' +
            '</div>' +
            (!offer.eligible && offer.reason
              ? '<div style="font-size:0.74rem;color:#fda4af;margin-top:6px;">' + escapeHtml(offer.reason) + '</div>'
              : '') +
            '</div>' +
            '<button type="button" class="btn btn-primary" style="width:100%;" data-take-loan="' +
            offer.id +
            '" ' +
            (isMyTurn && offer.eligible ? '' : 'disabled') +
            '>🏦 Anında Onayla</button>' +
            '</div>';
        });

        bodyHtml =
          '<div class="vip-loan-banner">' +
          '<div>' +
          '<strong style="color:#fde68a;">' +
          (isFirstZero
            ? '🎉 ÖZEL FIRSAT: İlk Kredinde %0 FAİZ!'
            : '🏦 BARONIA VIP KREDİ MASASI') +
          '</strong>' +
          '<div style="font-size:0.78rem;color:#e2e8f0;">Onayladığın anda tutar banka hesabına geçer ve 3 tur taksit ödemezsin.</div>' +
          '</div>' +
          '<span class="pill pill-gold">Tek Aktif Kredi Kuralı</span>' +
          '</div>' +
          '<div class="vip-loan-grid">' +
          cardsHtml +
          '</div>';
      }
    } else {
      // 'properties' screen: ONLY properties owned by this player (Sell +60% / Upgrade / Start Auction)
      var canStartAuction = isMyTurn && (runtime.state.phase === 'PRE_ROLL' || runtime.state.phase === 'POST_ROLL');
      var ownedIndices = player ? Engine.getPlayerPropertyIndices(runtime.state, player.id) : [];
      var ownHtml = '';
      if (ownedIndices.length === 0) {
        ownHtml = '<p style="font-size:0.84rem;color:var(--text-muted);margin:0;">Henüz sahip olduğun bir mülk yok.</p>';
      } else {
        ownedIndices.forEach(function (idx) {
          var t = BD.TILES[idx];
          var own = runtime.state.ownership[idx];
          var eff = Engine.getTileEffectiveNumbers(runtime.state, idx);
          var refund = BD.round5((own.costPaid || 0) * BD.SALE_REFUND_RATE);
          var label = t.name;
          var extra = '';
          var upgBtnHtml = '';

          if (own.type === 'plot') {
            var tier = BD.getShopTier(own.shopType, eff.level || 1);
            var stars = eff.level === 3 ? '★★★' : eff.level === 2 ? '★★' : '★';
            label = tier.icon + ' ' + t.name + ' (' + tier.name + ' ' + stars + ')';
            var kafePct = Math.round((eff.kafeBonusRate || 0) * 100);
            extra =
              'Durma: ' +
              eff.landRent +
              '₺' +
              (eff.passFee > 0 ? ' • Geçiş: ' + eff.passFee + '₺' : '') +
              (eff.startBonus > 0 ? ' • Başlangıç: +' + eff.startBonus + '₺' : '') +
              (kafePct > 0 ? ' • ☕ +%' + kafePct : '') +
              (eff.hasMonopoly ? ' • 👑 +%50' : '');

            var uInfo = player ? Engine.getUpgradeInfo(runtime.state, player.id, idx) : null;
            if (uInfo && uInfo.currentLevel < BD.MAX_BUILDING_LEVEL) {
              var uAffordable = totalFunds >= uInfo.cost;
              var uTitle = uInfo.canUpgrade
                ? (uInfo.isOnSite ? 'Yerinde 1x maliyet' : 'Uzaktan 2.5x maliyet')
                : uInfo.reason;
              upgBtnHtml =
                '<button type="button" class="btn btn-emerald btn-sm" data-upgrade-tile="' +
                idx +
                '" title="' +
                escapeHtml(uTitle) +
                '" ' +
                (isMyTurn && uInfo.canUpgrade && uAffordable ? '' : 'disabled') +
                '>⬆️ Sv.' +
                uInfo.nextLevel +
                ' (' +
                (uInfo.isOnSite ? '1x' : '2.5x') +
                ' • ' +
                formatMoney(uInfo.cost) +
                ')</button>';
            }
          } else if (own.type === 'landmark') {
            extra = 'Kira: ' + eff.landRent + '₺ (' + eff.setCount + '/3 İkon)';
          } else if (own.type === 'utility') {
            if (eff.utilityKind === 'taksi') extra = 'Taksi Durağı • 50₺ + Zar×35₺ • Sahibe Ücretsiz';
            else if (eff.utilityKind === 'borsa') extra = 'Borsa Ofisi • ' + eff.baseFee + '₺ + Piyasa Zarı';
            else if (eff.utilityKind === 'medya') extra = 'Medya Ajansı • Güncel Gelir: ' + eff.landRent + '₺';
            else extra = 'Boğaz Heliportu • Harç: ' + eff.landRent + '₺ • VIP Uçuş';
          }

          ownHtml +=
            '<div class="prop-row">' +
            '<div>' +
            '<strong>' +
            escapeHtml(label) +
            '</strong>' +
            (own.closedTurnsRemaining > 0 ? ' <span class="pill pill-rose">🚧 Kapalı</span>' : '') +
            '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">' +
            escapeHtml(extra) +
            '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">' +
            upgBtnHtml +
            '<button type="button" class="btn btn-danger btn-sm" data-sell-tile="' +
            idx +
            '" ' +
            (isMyTurn ? '' : 'disabled') +
            '>Sat (+' +
            formatMoney(refund) +
            ')</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-start-own-auc="' +
            idx +
            '" ' +
            (canStartAuction ? '' : 'disabled') +
            '>🔨 İhale</button>' +
            '</div>' +
            '</div>';
        });
      }

      bodyHtml =
        '<h4 style="margin:0 0 8px;font-size:0.88rem;color:#fde68a;">Sahip Olduğun Mülkler</h4>' +
        '<div class="prop-list" style="margin-bottom:0;">' +
        ownHtml +
        '</div>';
    }

    openModalHtml(buildAtmHeaderHtml(player, isSub) + turnWarningHtml + bodyHtml, true, true);

    document.getElementById('modal-close-x').addEventListener('click', closeManualModal);
    var backBtn = document.getElementById('atm-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        runtime.bankScreen = 'home';
        renderBankModal();
      });
    }

    if (screen === 'home') {
      els.modalCard.querySelectorAll('[data-atm-nav]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          runtime.bankScreen = this.getAttribute('data-atm-nav');
          renderBankModal();
        });
      });
    } else if (screen === 'withdraw' || screen === 'deposit') {
      var amtInput = document.getElementById('atm-amt-input');
      var wdBtn = document.getElementById('btn-withdraw-confirm');
      var depBtn = document.getElementById('btn-deposit-confirm');
      var syncConfirmLabel = function () {
        var val = Math.max(0, Math.round(Number(amtInput.value) || 0));
        runtime.bankTransferAmount = val;
        if (wdBtn) wdBtn.textContent = '⬆️ ' + formatMoney(val) + ' Nakit Çek';
        if (depBtn) depBtn.textContent = '⬇️ ' + formatMoney(val) + ' Bankaya Yatır';
      };
      amtInput.addEventListener('input', syncConfirmLabel);
      els.modalCard.querySelectorAll('[data-quick-amt]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var v = this.getAttribute('data-quick-amt');
          if (v === 'all-bank' && player) amtInput.value = String(player.bank);
          else if (v === 'all-cash' && player) amtInput.value = String(player.cash);
          else amtInput.value = v;
          syncConfirmLabel();
        });
      });
      if (wdBtn) {
        wdBtn.addEventListener('click', function () {
          sendPlayerAction({ type: 'WITHDRAW_BANK', amount: Number(amtInput.value) });
          renderBankModal();
        });
      }
      if (depBtn) {
        depBtn.addEventListener('click', function () {
          sendPlayerAction({ type: 'DEPOSIT_BANK', amount: Number(amtInput.value) });
          renderBankModal();
        });
      }
    } else if (screen === 'loans') {
      els.modalCard.querySelectorAll('[data-take-loan]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          sendPlayerAction({ type: 'TAKE_LOAN', packageId: this.getAttribute('data-take-loan') });
          closeManualModal();
        });
      });
      els.modalCard.querySelectorAll('[data-repay-loan]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          sendPlayerAction({ type: 'REPAY_LOAN', loanId: this.getAttribute('data-repay-loan') });
          renderBankModal();
        });
      });
    } else if (screen === 'properties') {
      els.modalCard.querySelectorAll('[data-upgrade-tile]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(this.getAttribute('data-upgrade-tile'));
          var own = runtime.state.ownership[idx];
          if (SFX && SFX.playBuildShop && own) {
            SFX.playBuildShop(own.shopType, (own.level || 1) + 1);
          }
          sendPlayerAction({ type: 'UPGRADE_SHOP', tileIndex: idx });
          renderBankModal();
        });
      });
      els.modalCard.querySelectorAll('[data-sell-tile]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          sendPlayerAction({ type: 'SELL_PROPERTY', tileIndex: Number(this.getAttribute('data-sell-tile')) });
          renderBankModal();
        });
      });
      els.modalCard.querySelectorAll('[data-start-own-auc]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(this.getAttribute('data-start-own-auc'));
          closeManualModal();
          sendPlayerAction({ type: 'START_AUCTION', tileIndex: idx, isBankAuction: false });
        });
      });
    }
  }

  function renderAuctionModal(auc) {
    var tile = BD.TILES[auc.tileIndex];
    var seller = auc.sellerId === 'bank' ? { name: 'İstanbul Bankası' } : Engine.getPlayerById(runtime.state, auc.sellerId);
    var highestBidder = auc.highestBidderId ? Engine.getPlayerById(runtime.state, auc.highestBidderId) : null;
    var activeBidder = Engine.getActiveDecisionPlayer(runtime.state);
    var isMyBidTurn = canLocalUserControlCurrentTurn();
    var minReq = auc.currentBid > 0 ? auc.currentBid + auc.minIncrement : auc.startingBid;
    var activeFunds = activeBidder ? Engine.getPlayerTotalFunds(activeBidder) : 0;

    var biddersHtml = '';
    runtime.state.players.forEach(function (p) {
      if (p.bankrupt) return;
      if (p.id === auc.sellerId && !auc.isBankAuction) return;
      var isCur = activeBidder && activeBidder.id === p.id;
      var isPassed = auc.passedIds.indexOf(p.id) !== -1;
      biddersHtml +=
        '<div class="auction-bid-chip' +
        (isCur ? ' turn' : '') +
        (isPassed ? ' passed' : '') +
        '">' +
        Avatar.renderAvatarSVG(p.avatar, 22) +
        '<span>' +
        escapeHtml(p.name) +
        '</span>' +
        (isCur ? ' <span>⏳</span>' : '') +
        '</div>';
    });

    var controlsHtml = '';
    if (isMyBidTurn) {
      controlsHtml =
        '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-primary btn-sm" data-bid-amt="' +
        minReq +
        '" ' +
        (activeFunds >= minReq ? '' : 'disabled') +
        '>Teklif: ' +
        formatMoney(minReq) +
        '</button>' +
        '<button type="button" class="btn btn-emerald btn-sm" data-bid-amt="' +
        (minReq + 50) +
        '" ' +
        (activeFunds >= minReq + 50 ? '' : 'disabled') +
        '>+50₺ (' +
        formatMoney(minReq + 50) +
        ')</button>' +
        '<button type="button" class="btn btn-blue btn-sm" data-bid-amt="' +
        (minReq + 150) +
        '" ' +
        (activeFunds >= minReq + 150 ? '' : 'disabled') +
        '>+150₺ (' +
        formatMoney(minReq + 150) +
        ')</button>' +
        '</div>' +
        '<button type="button" id="btn-auc-pass" class="btn btn-danger btn-sm">Çekil (Pas)</button>' +
        '</div>';
    } else {
      controlsHtml =
        '<div class="status-banner" style="margin:0;">⏳ ' +
        escapeHtml(activeBidder ? activeBidder.name : 'Katılımcı') +
        ' teklif kararını veriyor...</div>';
    }

    openModalHtml(
      '<div class="modal-header">' +
        '<div>' +
        '<span class="pill pill-gold" style="margin-bottom:5px;">🔨 CANLI İHALE SALONU</span>' +
        '<h2 class="modal-title">' +
        tile.icon +
        ' ' +
        escapeHtml(auc.tileName) +
        '</h2>' +
        '<p class="modal-subtitle">Satıcı: <strong>' +
        escapeHtml(seller ? seller.name : 'Banka') +
        '</strong> • Açılış: ' +
        formatMoney(auc.startingBid) +
        '</p>' +
        '</div>' +
        '</div>' +
        '<div class="auction-current-box">' +
        '<div>' +
        '<div style="font-size:0.74rem;color:#fde68a;font-weight:700;">EN YÜKSEK TEKLİF</div>' +
        '<div style="font-size:1.55rem;font-weight:800;color:#6ee7b7;">' +
        (auc.currentBid > 0 ? formatMoney(auc.currentBid) : 'Henüz Teklif Yok') +
        '</div>' +
        '</div>' +
        (highestBidder
          ? '<div style="display:flex;align-items:center;gap:8px;">' +
            Avatar.renderAvatarSVG(highestBidder.avatar, 38) +
            '<strong>' +
            escapeHtml(highestBidder.name) +
            '</strong></div>'
          : '<span class="pill">İlk Teklifi Bekliyor</span>') +
        '</div>' +
        '<div class="auction-bidders-row">' +
        biddersHtml +
        '</div>' +
        controlsHtml,
      false,
      false
    );

    els.modalCard.querySelectorAll('[data-bid-amt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendPlayerAction({ type: 'AUCTION_BID', amount: Number(this.getAttribute('data-bid-amt')) });
      });
    });
    var passBtn = document.getElementById('btn-auc-pass');
    if (passBtn) {
      passBtn.addEventListener('click', function () {
        sendPlayerAction({ type: 'AUCTION_PASS' });
      });
    }
  }

  function renderPropertiesModal() {
    runtime.bankScreen = 'properties';
    renderBankModal();
  }

  function renderRulesModal() {
    var rows = '';
    BD.NEIGHBORHOOD_LIST.forEach(function (hood) {
      var d = BD.getShopStats('dondurmaci', hood.id);
      var m = BD.getShopStats('market', hood.id);
      var k = BD.getShopStats('kafe', hood.id);
      var s = BD.getShopStats('magaza', hood.id);
      rows +=
        '<tr>' +
        '<td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' +
        hood.color +
        ';margin-right:6px;"></span><strong>' +
        escapeHtml(hood.name) +
        '</strong></td>' +
        '<td><strong>' +
        hood.multiplier.toFixed(1) +
        'x</strong></td>' +
        '<td>' +
        d.cost +
        '₺ | ' +
        d.passFee +
        '/' +
        d.landRent +
        '₺</td>' +
        '<td>' +
        m.cost +
        '₺ | +' +
        m.startBonus +
        '/' +
        m.landRent +
        '₺</td>' +
        '<td>' +
        k.cost +
        '₺ | ' +
        k.landRent +
        '₺</td>' +
        '<td>' +
        s.cost +
        '₺ | ' +
        s.landRent +
        '₺</td>' +
        '</tr>';
    });

    openModalHtml(
      '<div class="modal-header">' +
        '<div>' +
        '<h2 class="modal-title">📊 İstanbul Mahalleleri &amp; İşletme Tablosu</h2>' +
        '<p class="modal-subtitle">Aynı mahalledeki Kafe gelirleri +%25/+%35/+%50, 3/3 Mahalle Hakimiyeti +%50 (1.5x) ekstra gelir sağlar. Aynı türden 3 binan olunca Sv.2 ve Sv.3\'e yükseltebilirsin (Yerinde 1x, uzaktan 2.5x maliyet).</p>' +
        '</div>' +
        '<button type="button" id="modal-close-rules" class="modal-close-btn">✕</button>' +
        '</div>' +
        '<div style="overflow-x:auto;">' +
        '<table class="rules-table">' +
        '<thead><tr><th>Mahalle</th><th>Çarpan</th><th>🍦 Dondurmacı<br>(Maliyet | Geç/Dur)</th><th>🛒 Market<br>(Maliyet | Başl./Dur)</th><th>☕ Kafe<br>(Maliyet | Dur)</th><th>🛍️ Mağaza<br>(Maliyet | Dur)</th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody>' +
        '</table>' +
        '</div>',
      true,
      true
    );
    document.getElementById('modal-close-rules').addEventListener('click', closeManualModal);
  }

  function buildPlotReceiptBoxHtml(title, baseVal, effVal, kafeCount, kafeBonusRate, hasMonopoly, monopolyBonusRate, isClosed) {
    var rows =
      '<div class="receipt-row"><span>Ana Tutar</span><span>' +
      formatMoney(baseVal) +
      '</span></div>';

    if (isClosed) {
      rows +=
        '<div class="receipt-row" style="color:#fda4af;"><span>🚧 Tadilatta Kapalı</span><span>-' +
        formatMoney(baseVal) +
        '</span></div>';
    } else {
      var kafeRate = kafeBonusRate || 0;
      var monoRate = hasMonopoly ? monopolyBonusRate || 0.5 : 0;
      if (kafeCount > 0 && kafeRate > 0) {
        var kafeAmt = hasMonopoly ? BD.round5(baseVal * kafeRate) : Math.max(0, effVal - baseVal);
        rows +=
          '<div class="receipt-row bonus"><span>+ Kafe Bonusu (' +
          kafeCount +
          ' Kafe • +%' +
          Math.round(kafeRate * 100) +
          ')</span><span>+' +
          formatMoney(kafeAmt) +
          '</span></div>';
      }
      if (hasMonopoly) {
        var kafePart = kafeCount > 0 && kafeRate > 0 ? BD.round5(baseVal * kafeRate) : 0;
        var monoAmt = Math.max(0, effVal - baseVal - kafePart);
        rows +=
          '<div class="receipt-row bonus"><span>+ Mahalle Hakimiyeti (3/3 • +%' +
          Math.round(monoRate * 100) +
          ')</span><span>+' +
          formatMoney(monoAmt) +
          '</span></div>';
      }
    }

    return (
      '<div class="receipt-breakdown-box">' +
      '<div class="receipt-box-title"><span>' +
      escapeHtml(title) +
      '</span></div>' +
      rows +
      '<div class="receipt-divider"></div>' +
      '<div class="receipt-total"><span>TOPLAM</span><span class="amt">' +
      formatMoney(isClosed ? 0 : effVal) +
      '</span></div>' +
      '</div>'
    );
  }

  function renderTileInspectorModal(tileIndex) {
    var tile = BD.TILES[tileIndex];
    var own = runtime.state.ownership[tileIndex];
    var owner = own ? Engine.getPlayerById(runtime.state, own.ownerId) : null;
    var eff = own ? Engine.getTileEffectiveNumbers(runtime.state, tileIndex) : null;
    var actingId = getActingPlayerIdForMenu();
    var current = Engine.getCurrentPlayer(runtime.state);
    var isMyTurnOwner = Boolean(own && current && current.id === own.ownerId && actingId === own.ownerId && canLocalUserControlCurrentTurn());

    if (tile.type === 'plot') {
      var headerSub = own
        ? 'Sahibi: <strong>' + escapeHtml(owner ? owner.name : '-') + '</strong>'
        : 'Durum: <strong>Boş Arsa (+)</strong> — Satın alınabilir';

      var innerHtml = '';
      if (own) {
        var meta = BD.SHOP_TYPES[own.shopType];
        var tier = BD.getShopTier(own.shopType, eff.level || 1);
        var starsStr = eff.level === 3 ? '★★★' : eff.level === 2 ? '★★' : '★';
        var receiptsHtml =
          '<div class="receipt-grid">' +
          buildPlotReceiptBoxHtml(
            '📍 Durma Kirası',
            eff.baseLandRent,
            eff.landRent,
            eff.kafeCount,
            eff.kafeBonusRate,
            eff.hasMonopoly,
            eff.monopolyBonusRate,
            eff.isClosed
          );

        if (eff.basePassFee > 0) {
          receiptsHtml += buildPlotReceiptBoxHtml(
            '🚶 Önünden Geçiş Ücreti',
            eff.basePassFee,
            eff.passFee,
            eff.kafeCount,
            eff.kafeBonusRate,
            eff.hasMonopoly,
            eff.monopolyBonusRate,
            eff.isClosed
          );
        }
        if (eff.baseStartBonus > 0) {
          receiptsHtml += buildPlotReceiptBoxHtml(
            '🏁 Başlangıç Ekstra Cirosu',
            eff.baseStartBonus,
            eff.startBonus,
            eff.kafeCount,
            eff.kafeBonusRate,
            eff.hasMonopoly,
            eff.monopolyBonusRate,
            eff.isClosed
          );
        }
        receiptsHtml += '</div>';

        var upgradeCalloutHtml = '';
        if (isMyTurnOwner && (eff.level || 1) < BD.MAX_BUILDING_LEVEL) {
          var uInfo = Engine.getUpgradeInfo(runtime.state, own.ownerId, tileIndex);
          var ownerFunds = Engine.getPlayerTotalFunds(current);
          var canClickUpg = uInfo && uInfo.canUpgrade && ownerFunds >= uInfo.cost;
          upgradeCalloutHtml =
            '<div class="upgrade-callout-box">' +
            '<div>' +
            '<div style="font-size:0.86rem;font-weight:800;color:#fde68a;">⬆️ Bina Yükseltme: ' +
            tier.icon +
            ' ' +
            escapeHtml(tier.name) +
            ' → ' +
            uInfo.nextTier.icon +
            ' ' +
            escapeHtml(uInfo.nextTier.name) +
            '</div>' +
            '<div style="font-size:0.75rem;color:#cbd5e1;margin-top:2px;">' +
            (uInfo.isOnSite
              ? 'Bu karedesin! <strong>1x maliyet: ' + formatMoney(uInfo.cost) + '</strong>'
              : 'Başka karedesin → <strong>2.5x uzaktan maliyet: ' + formatMoney(uInfo.cost) + '</strong> (Yerinde: ' + formatMoney(uInfo.baseUpgradeCost) + ')') +
            ' • Aynı tür: <strong>' +
            uInfo.sameTypeCount +
            '/' +
            uInfo.requiredCount +
            '</strong>' +
            (!uInfo.canUpgrade && uInfo.reason ? '<br><span style="color:#fda4af;">' + escapeHtml(uInfo.reason) + '</span>' : '') +
            '</div>' +
            '</div>' +
            '<button type="button" id="btn-tile-upgrade" class="btn btn-emerald btn-sm" ' +
            (canClickUpg ? '' : 'disabled') +
            '>⬆️ Yükselt (' +
            formatMoney(uInfo.cost) +
            ')</button>' +
            '</div>';
        }

        var tipHtml =
          !eff.isClosed && eff.kafeCount === 0 && !eff.hasMonopoly
            ? '<div class="receipt-tip">💡 İpucu: Aynı mahallede ☕ Kafe açarsan +%25–%50, 3 arsayı tamamlayarak Mahalle Hakimiyeti kurarsan +%50 (1.5x) ekstra gelir eklenir.</div>'
            : '';

        innerHtml =
          '<div class="loan-card" style="margin:0 0 10px;">' +
          '<div><strong>' +
          tier.icon +
          ' ' +
          escapeHtml(tier.name) +
          '</strong> <span class="tier-stars">' +
          starsStr +
          '</span>' +
          (own.closedTurnsRemaining > 0 ? ' <span class="pill pill-rose">🚧 Tadilatta Kapalı</span>' : '') +
          '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:3px;">' +
          escapeHtml(meta.shortRule) +
          '</div></div>' +
          '</div>' +
          receiptsHtml +
          upgradeCalloutHtml +
          tipHtml;
      } else {
        innerHtml = buildCompactShopRowsHtml(tile, null, false);
      }

      openModalHtml(
        buildNeighborhoodHeaderHtml(tile, headerSub) +
          innerHtml +
          '<div style="display:flex;justify-content:flex-end;margin-top:10px;">' +
          '<button type="button" id="modal-close-tile" class="btn btn-ghost btn-sm">Kapat</button>' +
          '</div>',
        true,
        true
      );
      document.getElementById('modal-close-tile').addEventListener('click', closeManualModal);
      var tileUpgBtn = document.getElementById('btn-tile-upgrade');
      if (tileUpgBtn) {
        tileUpgBtn.addEventListener('click', function () {
          if (SFX && SFX.playBuildShop) SFX.playBuildShop(own.shopType, (own.level || 1) + 1);
          closeManualModal();
          sendPlayerAction({ type: 'UPGRADE_SHOP', tileIndex: tileIndex });
        });
      }
      return;
    }

    var tagText = 'İstanbul Özel Hücresi';
    var ruleDesc = tile.subtitle || 'Özel İstanbul Hücresi';
    var specialReceiptHtml = '';

    if (tile.type === 'landmark') {
      tagText = 'İstanbul İkonu • Hazır Mülk';
      ruleDesc = 'Fiyat: ' + formatMoney(tile.cost) + ' • 2 ikonda kira %50 artar, 3 ikonda 2.2 katına çıkar.';
      if (own && eff) {
        var lmSetBonus = Math.max(0, eff.landRent - eff.baseRent);
        specialReceiptHtml =
          '<div class="receipt-breakdown-box" style="margin-top:10px;">' +
          '<div class="receipt-box-title"><span>🕌 Kira Dökümü (' +
          escapeHtml(owner ? owner.name : '-') +
          ')</span></div>' +
          '<div class="receipt-row"><span>Ana İkon Kirası</span><span>' +
          formatMoney(eff.baseRent) +
          '</span></div>' +
          (lmSetBonus > 0
            ? '<div class="receipt-row bonus"><span>+ İkon Set Bonusu (' +
              eff.setCount +
              '/3 İkon)</span><span>+' +
              formatMoney(lmSetBonus) +
              '</span></div>'
            : '') +
          '<div class="receipt-divider"></div>' +
          '<div class="receipt-total"><span>TOPLAM KİRA</span><span class="amt">' +
          formatMoney(eff.landRent) +
          '</span></div>' +
          '</div>';
      }
    } else if (tile.type === 'utility') {
      tagText = 'Aktif İstanbul Merkezi';
      ruleDesc = 'Fiyat: ' + formatMoney(tile.cost) + ' • ' + getUtilityDescriptionHtml(tile, Boolean(own), eff).replace(/<[^>]+>/g, '');
      if (own && eff) {
        if (eff.utilityKind === 'taksi') {
          specialReceiptHtml =
            '<div class="receipt-breakdown-box" style="margin-top:10px;">' +
            '<div class="receipt-box-title"><span>🚕 Taksi Tarifesi (' +
            escapeHtml(owner ? owner.name : '-') +
            ')</span></div>' +
            '<div class="receipt-row"><span>Açılış Ücreti</span><span>' +
            formatMoney(eff.baseFee) +
            '</span></div>' +
            '<div class="receipt-row"><span>Ek Zar Mesafe Ücreti</span><span>Zar × ' +
            formatMoney(eff.perDieFee) +
            '</span></div>' +
            (eff.hubExtraFee > 0
              ? '<div class="receipt-row bonus"><span>+ Ek Merkez Bonusu (' +
                eff.setCount +
                '/4)</span><span>+' +
                formatMoney(eff.hubExtraFee) +
                '</span></div>'
              : '') +
            '<div class="receipt-divider"></div>' +
            '<div class="receipt-total"><span>Yolculuk (Zar 1 – 6)</span><span class="amt">' +
            formatMoney(eff.baseFee + eff.perDieFee + eff.hubExtraFee) +
            ' – ' +
            formatMoney(eff.baseFee + eff.perDieFee * 6 + eff.hubExtraFee) +
            '</span></div>' +
            '</div>';
        } else if (eff.utilityKind === 'borsa') {
          specialReceiptHtml =
            '<div class="receipt-breakdown-box" style="margin-top:10px;">' +
            '<div class="receipt-box-title"><span>📡 Borsa Komisyonu (' +
            escapeHtml(owner ? owner.name : '-') +
            ')</span></div>' +
            '<div class="receipt-row"><span>Temel İşlem Komisyonu</span><span>' +
            formatMoney(eff.baseFee) +
            '</span></div>' +
            (eff.hubExtraFee > 0
              ? '<div class="receipt-row bonus"><span>+ Ek Merkez Bonusu (' +
                eff.setCount +
                '/4)</span><span>+' +
                formatMoney(eff.hubExtraFee) +
                '</span></div>'
              : '') +
            '<div class="receipt-divider"></div>' +
            '<div class="receipt-total"><span>SABİT KOMİSYON</span><span class="amt">' +
            formatMoney(eff.landRent) +
            '</span></div>' +
            '</div>';
        } else if (eff.utilityKind === 'medya') {
          specialReceiptHtml =
            '<div class="receipt-breakdown-box" style="margin-top:10px;">' +
            '<div class="receipt-box-title"><span>📺 Reklam Gelir Dökümü (' +
            escapeHtml(owner ? owner.name : '-') +
            ')</span></div>' +
            '<div class="receipt-row"><span>Ana Reklam Bedeli</span><span>' +
            formatMoney(eff.baseFee) +
            '</span></div>' +
            '<div class="receipt-row bonus"><span>+ İşletme Ağı (' +
            eff.ownerShopCount +
            ' Dükkan × ' +
            formatMoney(eff.perShopFee) +
            ')</span><span>+' +
            formatMoney(eff.hubExtraFee) +
            '</span></div>' +
            '<div class="receipt-divider"></div>' +
            '<div class="receipt-total"><span>TOPLAM ÜCRET</span><span class="amt">' +
            formatMoney(eff.landRent) +
            '</span></div>' +
            '</div>';
        } else {
          specialReceiptHtml =
            '<div class="receipt-breakdown-box" style="margin-top:10px;">' +
            '<div class="receipt-box-title"><span>🚁 Heliport VIP Harç (' +
            escapeHtml(owner ? owner.name : '-') +
            ')</span></div>' +
            '<div class="receipt-row"><span>Ana İniş Harcı</span><span>' +
            formatMoney(eff.baseFee) +
            '</span></div>' +
            (eff.hubExtraFee > 0
              ? '<div class="receipt-row bonus"><span>+ Ek Merkez Bonusu (' +
                eff.setCount +
                '/4)</span><span>+' +
                formatMoney(eff.hubExtraFee) +
                '</span></div>'
              : '') +
            '<div class="receipt-divider"></div>' +
            '<div class="receipt-total"><span>TOPLAM HARÇ</span><span class="amt">' +
            formatMoney(eff.landRent) +
            '</span></div>' +
            '</div>';
        }
      }
    } else if (tile.type === 'tax') {
      tagText = 'Vergi Dairesi';
      if (tile.subtype === 'fixed') {
        ruleDesc = 'Sabit belediye harcı: ' + formatMoney(tile.amount) + ' tahsil edilir.';
      } else {
        ruleDesc = 'Sahip olduğun her mülk için ' + formatMoney(tile.perProperty) + ' maliye vergisi kesilir.';
      }
    } else if (tile.type === 'corner') {
      tagText = 'Köşe Hücresi';
      if (tile.subtype === 'start') ruleDesc = 'Geçerken +500₺, tam üstünde durursan +1.000₺ (+ Market gelirlerin + %5 Banka Faizi)!';
      else if (tile.subtype === 'zabita') ruleDesc = '1 tur bekle veya 200₺ ödeyip zar atarak hemen çık.';
      else if (tile.subtype === 'musteri_akini') ruleDesc = 'Sahip olduğun işletmelerin toplam değerinin %20’si kadar anında sıcak nakit ciro!';
      else if (tile.subtype === 'tadilat') ruleDesc = 'En değerli dükkanını 1 tur kapat veya %15 bakım ücreti öde.';
    } else if (tile.type === 'toptanci') {
      tagText = 'Toptancı Fırsat';
      ruleDesc = 'Tahtadaki istediğin herhangi bir kareye ışınlan! (Başlangıçtan geçmiş sayılmaz.)';
    } else if (tile.type === 'event') {
      tagText = 'Şans & Olay Destesi';
      ruleDesc = 'Ortadaki 3D desteden bir sürpriz olay kartı çek!';
    }

    var specSub = owner
      ? 'Sahibi: <strong>' + escapeHtml(owner.name) + '</strong> • Kare #' + tileIndex
      : 'Kare #' + tileIndex;

    openModalHtml(
      buildSpecialTileBannerHtml(tile, specSub, tagText) +
        '<p style="line-height:1.55;color:#e2e8f0;margin:4px 0 0;">' +
        escapeHtml(ruleDesc) +
        '</p>' +
        specialReceiptHtml,
      false,
      true
    );
    document.getElementById('modal-close-tile').addEventListener('click', closeManualModal);
  }

  function showNoSessionFallback() {
    openModalHtml(
      '<div style="text-align:center;padding:10px 0;">' +
        '<h2 class="modal-title font-display">Oturum Bulunamadı</h2>' +
        '<p class="modal-subtitle" style="margin:10px 0 18px;">Bir oda kurmak veya arkadaşının odasına katılmak için lobiye dön, ya da hemen 3D tahtada hızlı bir bot maçı başlat.</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        '<a href="index.html" class="btn btn-ghost">← Lobiye Dön</a>' +
        '<button type="button" id="btn-quick-bot-match" class="btn btn-primary">🤖 Hızlı 3 Oyunculu 3D Maç</button>' +
        '</div>' +
        '</div>',
      false,
      false
    );

    document.getElementById('btn-quick-bot-match').addEventListener('click', function () {
      var quickSession = {
        roomCode: 'HIZLI',
        mode: 'local',
        isHost: true,
        selfPlayerId: 'quick-p1',
        players: [
          { id: 'quick-p1', name: 'Patron', avatar: Avatar.createDefaultAvatar(0), isBot: false },
          { id: 'quick-bot1', name: 'Boğaz Kurdu', avatar: Avatar.createDefaultAvatar(1), isBot: true },
          { id: 'quick-bot2', name: 'Galata Tüccarı', avatar: Avatar.createDefaultAvatar(2), isBot: true }
        ]
      };
      startWithSession(quickSession);
    });
  }

  function startWithSession(session) {
    runtime.session = session;
    els.roomBadge.textContent = session.mode === 'online' ? 'Oda: ' + session.roomCode : 'Yerel / Botlu Mod';

    init3DBoardIfNeeded();

    if (session.mode === 'online') {
      if (session.isHost) {
        els.netStatusPill.textContent = 'Host Bağlanıyor...';
        runtime.state = Engine.createGameState(session.players, {
          roomCode: session.roomCode,
          mode: 'online'
        });
        runtime.netHost = new Network.GameHost({
          roomCode: session.roomCode,
          getState: function () {
            return runtime.state;
          },
          onAction: function (pid, act) {
            applyAuthoritativeAction(pid, act);
          },
          onPeersChange: function (peersMap) {
            runtime.connectedPeers = peersMap;
            var count = Object.keys(peersMap).length;
            els.netStatusPill.textContent = '🌐 Online (' + (count + 1) + ' bağlı)';
          },
          onStatus: function (msg) {
            els.netStatusPill.textContent = msg;
          }
        });
        handleIncomingState(runtime.state);
      } else {
        els.netStatusPill.textContent = 'Odaya bağlanılıyor...';
        runtime.netGuest = new Network.GameGuest({
          roomCode: session.roomCode,
          playerId: session.selfPlayerId,
          onStateSync: function (syncedState) {
            handleIncomingState(syncedState);
          },
          onStatus: function (msg) {
            els.netStatusPill.textContent = msg;
          },
          onError: function (errMsg) {
            els.netStatusPill.textContent = errMsg;
            showToast(errMsg, 'error');
          }
        });
      }
    } else {
      els.netStatusPill.textContent = '🤖 Yerel 3D Maç';
      runtime.state = Engine.createGameState(session.players, {
        roomCode: session.roomCode,
        mode: 'local'
      });
      handleIncomingState(runtime.state);
    }
  }

  function bindGlobalUi() {
    if (els.btnToggleSfx) {
      var syncSfxLabel = function () {
        var isMuted = SFX && SFX.isMuted();
        els.btnToggleSfx.textContent = isMuted ? '🔇 Sessiz' : '🔊 Ses';
      };
      syncSfxLabel();
      els.btnToggleSfx.addEventListener('click', function () {
        if (SFX) {
          SFX.toggleMute();
          syncSfxLabel();
        }
      });
    }

    els.btnOpenBank.addEventListener('click', function () {
      if (!runtime.state) return;
      runtime.bankScreen = 'home';
      runtime.manualModal = 'bank';
      renderActiveModal();
    });
    els.btnOpenProps.addEventListener('click', function () {
      if (!runtime.state) return;
      runtime.bankScreen = 'properties';
      runtime.manualModal = 'bank';
      renderActiveModal();
    });
    els.btnOpenRules.addEventListener('click', function () {
      if (!runtime.state) return;
      runtime.manualModal = 'rules';
      renderActiveModal();
    });
    els.btnToggleLogs.addEventListener('click', function () {
      var collapsed = els.logDrawer.classList.toggle('collapsed');
      els.btnToggleLogs.textContent = collapsed ? 'Göster' : 'Gizle';
    });

    els.camZoomIn.addEventListener('click', function () {
      if (runtime.board3d) runtime.board3d.zoomIn();
    });
    els.camZoomOut.addEventListener('click', function () {
      if (runtime.board3d) runtime.board3d.zoomOut();
    });
    els.camRotLeft.addEventListener('click', function () {
      if (runtime.board3d) runtime.board3d.rotateBy(-45);
    });
    els.camRotRight.addEventListener('click', function () {
      if (runtime.board3d) runtime.board3d.rotateBy(45);
    });
    els.camReset.addEventListener('click', function () {
      if (runtime.board3d) runtime.board3d.resetCamera();
    });
    els.camFollow.addEventListener('click', function () {
      var active = els.camFollow.classList.toggle('active');
      if (runtime.board3d) runtime.board3d.setFollowEnabled(active);
    });
  }

  function init() {
    bindGlobalUi();
    var session = loadSession();
    if (!session || (!session.players.length && session.isHost)) {
      init3DBoardIfNeeded();
      showNoSessionFallback();
      return;
    }
    startWithSession(session);
  }

  init();
})(window);
