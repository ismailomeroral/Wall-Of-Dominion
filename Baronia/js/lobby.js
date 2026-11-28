(function (global) {
  'use strict';

  var Avatar = global.CM.Avatar;
  var Network = global.CM.Network;

  var STORAGE_PROFILE_KEY = 'cakmamono_profile_v1';
  var STORAGE_SESSION_KEY = 'cakmamono_session';

  var els = {
    avatarPreview: document.getElementById('avatar-preview'),
    nameInput: document.getElementById('player-name-input'),
    btnRandomAvatar: document.getElementById('btn-random-avatar'),
    pickerBg: document.getElementById('picker-bg'),
    pickerSkin: document.getElementById('picker-skin'),
    pickerBody: document.getElementById('picker-body'),
    pickerHair: document.getElementById('picker-hair'),
    pickerHairColor: document.getElementById('picker-hair-color'),
    pickerEyes: document.getElementById('picker-eyes'),
    pickerMouth: document.getElementById('picker-mouth'),
    pickerShirt: document.getElementById('picker-shirt'),
    modeTabsWrap: document.getElementById('mode-tabs-wrap'),
    onlineEntryView: document.getElementById('online-entry-view'),
    onlineRosterView: document.getElementById('online-roster-view'),
    localSetupView: document.getElementById('local-setup-view'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    joinCodeInput: document.getElementById('join-code-input'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    activeRoomCode: document.getElementById('active-room-code'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    btnCopyLink: document.getElementById('btn-copy-link'),
    btnLeaveRoom: document.getElementById('btn-leave-room'),
    roomRosterList: document.getElementById('room-roster-list'),
    btnAddOnlineBot: document.getElementById('btn-add-online-bot'),
    btnToggleReady: document.getElementById('btn-toggle-ready'),
    btnStartOnlineGame: document.getElementById('btn-start-online-game'),
    localPlayersList: document.getElementById('local-players-list'),
    btnLocalAddBot: document.getElementById('btn-local-add-bot'),
    btnLocalAddHuman: document.getElementById('btn-local-add-human'),
    btnStartLocalGame: document.getElementById('btn-start-local-game'),
    lobbyStatus: document.getElementById('lobby-status'),
    toastStack: document.getElementById('toast-stack')
  };

  var BOT_NAMES = ['Boğaz Kurdu', 'Galata Tüccarı', 'Moda Gurmesi', 'Bebek Baronu'];

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function setStatus(msg, isError) {
    if (!msg) {
      els.lobbyStatus.classList.add('hidden');
      return;
    }
    els.lobbyStatus.textContent = msg;
    els.lobbyStatus.className = 'status-banner' + (isError ? ' error' : '');
  }

  function loadProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          playerId: parsed.playerId || 'p-' + Math.random().toString(36).slice(2, 9),
          name: (parsed.name || 'Patron').slice(0, 18),
          avatar: Avatar.sanitizeAvatar(parsed.avatar)
        };
      }
    } catch (e) {
      // ignore storage errors
    }
    return {
      playerId: 'p-' + Math.random().toString(36).slice(2, 9),
      name: 'Patron',
      avatar: Avatar.createDefaultAvatar(0)
    };
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
    } catch (e) {
      // ignore
    }
  }

  var state = {
    profile: loadProfile(),
    mode: 'online',
    roomRole: null, // 'host' | 'guest'
    roomCode: null,
    lobbyClient: null,
    roster: [],
    guestReady: false,
    localRoster: []
  };

  function initLocalRoster() {
    state.localRoster = [
      {
        id: state.profile.playerId,
        name: state.profile.name,
        avatar: state.profile.avatar,
        isBot: false,
        isSelf: true
      },
      {
        id: 'bot-1',
        name: BOT_NAMES[0],
        avatar: Avatar.createDefaultAvatar(1),
        isBot: true,
        isSelf: false
      }
    ];
  }

  function renderAvatarBuilder() {
    els.nameInput.value = state.profile.name;
    els.avatarPreview.innerHTML = Avatar.renderAvatarSVG(state.profile.avatar, 114);

    renderSwatches(els.pickerBg, Avatar.OPTIONS.bgColors, state.profile.avatar.bgColor, function (val) {
      updateProfileAvatar({ bgColor: val });
    });
    renderSwatches(els.pickerSkin, Avatar.OPTIONS.skinTones, state.profile.avatar.skinTone, function (val) {
      updateProfileAvatar({ skinTone: val });
    });
    renderChips(els.pickerBody, Avatar.OPTIONS.bodyTypes, state.profile.avatar.bodyType, function (val) {
      updateProfileAvatar({ bodyType: val });
    });
    renderChips(els.pickerHair, Avatar.OPTIONS.hairStyles, state.profile.avatar.hairStyle, function (val) {
      updateProfileAvatar({ hairStyle: val });
    });
    renderSwatches(els.pickerHairColor, Avatar.OPTIONS.hairColors, state.profile.avatar.hairColor, function (val) {
      updateProfileAvatar({ hairColor: val });
    });
    renderChips(els.pickerEyes, Avatar.OPTIONS.eyeStyles, state.profile.avatar.eyeStyle, function (val) {
      updateProfileAvatar({ eyeStyle: val });
    });
    renderChips(els.pickerMouth, Avatar.OPTIONS.mouthStyles, state.profile.avatar.mouthStyle, function (val) {
      updateProfileAvatar({ mouthStyle: val });
    });
    renderSwatches(els.pickerShirt, Avatar.OPTIONS.shirtColors, state.profile.avatar.shirtColor, function (val) {
      updateProfileAvatar({ shirtColor: val });
    });
  }

  function renderSwatches(container, colors, activeColor, onSelect) {
    container.innerHTML = '';
    colors.forEach(function (hex) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch-btn' + (hex.toLowerCase() === activeColor.toLowerCase() ? ' active' : '');
      btn.style.backgroundColor = hex;
      btn.title = hex;
      btn.addEventListener('click', function () {
        onSelect(hex);
      });
      container.appendChild(btn);
    });
  }

  function renderChips(container, items, activeId, onSelect) {
    container.innerHTML = '';
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn' + (item.id === activeId ? ' active' : '');
      btn.textContent = item.label;
      btn.addEventListener('click', function () {
        onSelect(item.id);
      });
      container.appendChild(btn);
    });
  }

  function updateProfileAvatar(patch) {
    state.profile.avatar = Avatar.sanitizeAvatar(Object.assign({}, state.profile.avatar, patch));
    syncProfileChanges();
  }

  function syncProfileChanges() {
    saveProfile(state.profile);
    renderAvatarBuilder();
    if (state.localRoster[0]) {
      state.localRoster[0].name = state.profile.name;
      state.localRoster[0].avatar = state.profile.avatar;
      renderLocalRoster();
    }
    if (state.lobbyClient) {
      if (state.roomRole === 'host') {
        state.lobbyClient.updateHostProfile(state.profile.name, state.profile.avatar);
      } else if (state.roomRole === 'guest') {
        state.lobbyClient.updateProfile(state.profile.name, state.profile.avatar);
      }
    }
  }

  function switchMode(mode) {
    state.mode = mode;
    var tabs = els.modeTabsWrap.querySelectorAll('.mode-tab');
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-mode') === mode);
    });
    if (mode === 'online') {
      els.localSetupView.classList.add('hidden');
      if (state.roomRole) {
        els.onlineEntryView.classList.add('hidden');
        els.onlineRosterView.classList.remove('hidden');
      } else {
        els.onlineEntryView.classList.remove('hidden');
        els.onlineRosterView.classList.add('hidden');
      }
    } else {
      els.onlineEntryView.classList.add('hidden');
      els.onlineRosterView.classList.add('hidden');
      els.localSetupView.classList.remove('hidden');
      renderLocalRoster();
    }
  }

  function renderOnlineRoster() {
    els.activeRoomCode.textContent = state.roomCode || '-----';
    els.roomRosterList.innerHTML = '';

    for (var i = 0; i < 4; i++) {
      var p = state.roster[i];
      if (!p) {
        var empty = document.createElement('div');
        empty.className = 'roster-slot empty-slot';
        empty.textContent = 'Boş Koltuk — Arkadaşını bekle veya bot ekle';
        els.roomRosterList.appendChild(empty);
        continue;
      }
      var row = document.createElement('div');
      row.className = 'roster-slot';
      var isSelf = p.id === state.profile.playerId;

      var badges = '';
      if (p.isHost) badges += '<span class="pill pill-gold">👑 Kurucu</span>';
      if (p.isBot) badges += '<span class="pill pill-blue">🤖 Bot</span>';
      else if (p.ready && !p.isHost) badges += '<span class="pill pill-emerald">✅ Hazır</span>';
      if (isSelf) badges += '<span class="pill">Sen</span>';

      var removeBtnHtml = '';
      if (state.roomRole === 'host' && !p.isHost) {
        removeBtnHtml =
          '<button type="button" class="btn btn-ghost btn-sm" data-remove-id="' +
          escapeHtml(p.id) +
          '">Çıkar</button>';
      }

      row.innerHTML =
        '<div class="roster-player-info">' +
        '<div>' +
        Avatar.renderAvatarSVG(p.avatar, 44) +
        '</div>' +
        '<div class="roster-player-name">' +
        '<span>' +
        escapeHtml(p.name) +
        '</span>' +
        badges +
        '</div>' +
        '</div>' +
        '<div>' +
        removeBtnHtml +
        '</div>';

      var remBtn = row.querySelector('[data-remove-id]');
      if (remBtn) {
        remBtn.addEventListener('click', function () {
          var pid = this.getAttribute('data-remove-id');
          if (state.lobbyClient && state.roomRole === 'host') {
            state.lobbyClient.removePlayer(pid);
          }
        });
      }
      els.roomRosterList.appendChild(row);
    }

    var isHost = state.roomRole === 'host';
    els.btnAddOnlineBot.classList.toggle('hidden', !isHost || state.roster.length >= 4);
    els.btnStartOnlineGame.classList.toggle('hidden', !isHost);
    els.btnToggleReady.classList.toggle('hidden', isHost);

    if (isHost) {
      var canStart = state.roster.length >= 2;
      els.btnStartOnlineGame.disabled = !canStart;
      els.btnStartOnlineGame.textContent = canStart ? '🚀 Oyunu Başlat (' + state.roster.length + ' Oyuncu)' : 'En az 2 oyuncu gerekli';
    } else {
      els.btnToggleReady.textContent = state.guestReady ? '⏳ Hazır Değilim' : '✅ Hazırım';
    }
  }

  function createOnlineRoom() {
    leaveOnlineRoom(true);
    setStatus('Online oda kuruluyor...', false);
    var hostPlayer = {
      id: state.profile.playerId,
      name: state.profile.name,
      avatar: state.profile.avatar,
      color: state.profile.avatar.bgColor,
      isHost: true,
      isBot: false,
      ready: true
    };
    state.roomRole = 'host';
    state.lobbyClient = new Network.LobbyHost({
      hostPlayer: hostPlayer,
      onReady: function (code) {
        state.roomCode = code;
        els.onlineEntryView.classList.add('hidden');
        els.onlineRosterView.classList.remove('hidden');
        setStatus('Oda hazır! Kodu veya davet linkini arkadaşlarınla paylaşabilirsin.', false);
        renderOnlineRoster();
      },
      onStateChange: function (players, code) {
        state.roster = players;
        state.roomCode = code;
        renderOnlineRoster();
      },
      onError: function (errMsg) {
        setStatus(errMsg, true);
        showToast(errMsg, 'error');
      }
    });
  }

  function joinOnlineRoom(codeInput) {
    var code = String(codeInput || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    if (code.length < 4) {
      showToast('Lütfen geçerli bir oda kodu gir.', 'error');
      return;
    }
    leaveOnlineRoom(true);
    setStatus('"' + code + '" odasına bağlanılıyor...', false);
    state.roomRole = 'guest';
    state.roomCode = code;
    state.guestReady = false;

    state.lobbyClient = new Network.LobbyGuest({
      roomCode: code,
      player: {
        id: state.profile.playerId,
        name: state.profile.name,
        avatar: state.profile.avatar,
        color: state.profile.avatar.bgColor
      },
      onConnected: function () {
        els.onlineEntryView.classList.add('hidden');
        els.onlineRosterView.classList.remove('hidden');
        setStatus('Odaya bağlandın! Kurucunun oyunu başlatması bekleniyor.', false);
      },
      onStateChange: function (players, roomCode) {
        state.roster = players;
        state.roomCode = roomCode;
        renderOnlineRoster();
      },
      onStartGame: function (matchConfig) {
        launchGameTransition(matchConfig, false);
      },
      onError: function (errMsg) {
        setStatus(errMsg, true);
        showToast(errMsg, 'error');
      }
    });
  }

  function leaveOnlineRoom(silent) {
    if (state.lobbyClient) {
      state.lobbyClient.destroy();
      state.lobbyClient = null;
    }
    state.roomRole = null;
    state.roomCode = null;
    state.roster = [];
    if (!silent) {
      els.onlineEntryView.classList.remove('hidden');
      els.onlineRosterView.classList.add('hidden');
      setStatus('', false);
    }
  }

  function launchGameTransition(matchConfig, isHost) {
    var sessionData = {
      roomCode: matchConfig.roomCode,
      mode: matchConfig.mode,
      isHost: isHost,
      selfPlayerId: state.profile.playerId,
      players: matchConfig.players
    };
    try {
      sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionData));
    } catch (e) {
      showToast('Tarayıcı oturumu kaydedilemedi.', 'error');
    }
    var targetUrl =
      'game.html?room=' +
      encodeURIComponent(matchConfig.roomCode) +
      '&role=' +
      (isHost ? 'host' : 'guest') +
      '&pid=' +
      encodeURIComponent(state.profile.playerId) +
      '&mode=' +
      encodeURIComponent(matchConfig.mode);

    setStatus('Oyun tahtası açılıyor...', false);
    if (state.lobbyClient) {
      setTimeout(function () {
        if (state.lobbyClient) state.lobbyClient.destroy();
        global.location.href = targetUrl;
      }, isHost ? 280 : 620);
    } else {
      global.location.href = targetUrl;
    }
  }

  function renderLocalRoster() {
    els.localPlayersList.innerHTML = '';
    state.localRoster.forEach(function (p, idx) {
      var row = document.createElement('div');
      row.className = 'local-player-row';

      var badge = p.isSelf ? '<span class="pill pill-gold">Sen</span>' : p.isBot ? '<span class="pill pill-blue">🤖 Bot</span>' : '<span class="pill">👤 Oyuncu</span>';

      row.innerHTML =
        '<div>' +
        Avatar.renderAvatarSVG(p.avatar, 38) +
        '</div>' +
        '<input type="text" class="text-input" maxlength="18" value="' +
        escapeHtml(p.name) +
        '" ' +
        (p.isSelf ? 'disabled' : '') +
        '>' +
        badge +
        (idx > 0
          ? '<button type="button" class="btn btn-ghost btn-sm" title="Kaldır">✕</button>'
          : '');

      var input = row.querySelector('input');
      if (input && !p.isSelf) {
        input.addEventListener('input', function () {
          p.name = this.value.trim() || ('Oyuncu ' + (idx + 1));
        });
      }
      var delBtn = row.querySelector('button');
      if (delBtn) {
        delBtn.addEventListener('click', function () {
          state.localRoster.splice(idx, 1);
          renderLocalRoster();
        });
      }
      els.localPlayersList.appendChild(row);
    });

    var full = state.localRoster.length >= 4;
    els.btnLocalAddBot.disabled = full;
    els.btnLocalAddHuman.disabled = full;
    els.btnStartLocalGame.disabled = state.localRoster.length < 2;
  }

  function addLocalPlayer(isBot) {
    if (state.localRoster.length >= 4) return;
    var idx = state.localRoster.length;
    var av = Avatar.createRandomAvatar(Avatar.OPTIONS.bgColors[idx % Avatar.OPTIONS.bgColors.length]);
    state.localRoster.push({
      id: (isBot ? 'bot-' : 'local-') + Date.now() + '-' + idx,
      name: isBot ? BOT_NAMES[idx % BOT_NAMES.length] : 'Oyuncu ' + (idx + 1),
      avatar: av,
      isBot: isBot,
      isSelf: false
    });
    renderLocalRoster();
  }

  function bindEvents() {
    els.nameInput.addEventListener('input', function () {
      state.profile.name = this.value.slice(0, 18) || 'Patron';
      saveProfile(state.profile);
      if (state.localRoster[0]) {
        state.localRoster[0].name = state.profile.name;
        renderLocalRoster();
      }
      if (state.lobbyClient) {
        if (state.roomRole === 'host') {
          state.lobbyClient.updateHostProfile(state.profile.name, state.profile.avatar);
        } else if (state.roomRole === 'guest') {
          state.lobbyClient.updateProfile(state.profile.name, state.profile.avatar);
        }
      }
    });

    els.btnRandomAvatar.addEventListener('click', function () {
      state.profile.avatar = Avatar.createRandomAvatar();
      syncProfileChanges();
    });

    els.modeTabsWrap.querySelectorAll('.mode-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchMode(this.getAttribute('data-mode'));
      });
    });

    els.btnCreateRoom.addEventListener('click', createOnlineRoom);
    els.btnJoinRoom.addEventListener('click', function () {
      joinOnlineRoom(els.joinCodeInput.value);
    });
    els.joinCodeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') joinOnlineRoom(els.joinCodeInput.value);
    });

    els.btnLeaveRoom.addEventListener('click', function () {
      leaveOnlineRoom(false);
    });

    els.btnCopyCode.addEventListener('click', function () {
      if (!state.roomCode) return;
      navigator.clipboard.writeText(state.roomCode).then(function () {
        showToast('Oda kodu kopyalandı: ' + state.roomCode, 'success');
      });
    });

    els.btnCopyLink.addEventListener('click', function () {
      if (!state.roomCode) return;
      var url = new URL(global.location.href);
      url.search = '?join=' + encodeURIComponent(state.roomCode);
      navigator.clipboard.writeText(url.toString()).then(function () {
        showToast('Davet linki panoya kopyalandı!', 'success');
      });
    });

    els.btnAddOnlineBot.addEventListener('click', function () {
      if (!state.lobbyClient || state.roomRole !== 'host' || state.roster.length >= 4) return;
      var idx = state.roster.length;
      state.lobbyClient.addBot({
        id: 'bot-' + Date.now() + '-' + idx,
        name: BOT_NAMES[idx % BOT_NAMES.length],
        avatar: Avatar.createRandomAvatar(Avatar.OPTIONS.bgColors[idx % Avatar.OPTIONS.bgColors.length]),
        isHost: false,
        isBot: true,
        ready: true
      });
    });

    els.btnToggleReady.addEventListener('click', function () {
      if (!state.lobbyClient || state.roomRole !== 'guest') return;
      state.guestReady = !state.guestReady;
      state.lobbyClient.setReady(state.guestReady);
      renderOnlineRoster();
    });

    els.btnStartOnlineGame.addEventListener('click', function () {
      if (!state.lobbyClient || state.roomRole !== 'host' || state.roster.length < 2) return;
      var matchConfig = {
        roomCode: state.roomCode,
        mode: 'online',
        players: state.roster.map(function (p) {
          return {
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            color: p.avatar && p.avatar.bgColor,
            isBot: Boolean(p.isBot)
          };
        })
      };
      state.lobbyClient.broadcastStartGame(matchConfig);
      launchGameTransition(matchConfig, true);
    });

    els.btnLocalAddBot.addEventListener('click', function () {
      addLocalPlayer(true);
    });

    els.btnLocalAddHuman.addEventListener('click', function () {
      addLocalPlayer(false);
    });

    els.btnStartLocalGame.addEventListener('click', function () {
      if (state.localRoster.length < 2) return;
      var matchConfig = {
        roomCode: 'YEREL',
        mode: 'local',
        players: state.localRoster.map(function (p) {
          return {
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            color: p.avatar && p.avatar.bgColor,
            isBot: Boolean(p.isBot)
          };
        })
      };
      launchGameTransition(matchConfig, true);
    });
  }

  function init() {
    initLocalRoster();
    renderAvatarBuilder();
    bindEvents();

    var params = new URLSearchParams(global.location.search);
    var joinCode = params.get('join');
    if (joinCode) {
      els.joinCodeInput.value = joinCode.toUpperCase();
      switchMode('online');
      setStatus('Davet bağlantısından geldin! "Odaya Bağlan" butonuna basarak katılabilirsin.', false);
    }
  }

  init();
})(window);
