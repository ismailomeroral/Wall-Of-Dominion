(function (global) {
  'use strict';

  var CM = (global.CM = global.CM || {});

  var PEER_CONFIG = {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  };

  function generateRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 5; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function hasPeerJS() {
    return typeof global.Peer === 'function';
  }

  function LobbyHost(opts) {
    this.roomCode = opts.roomCode || generateRoomCode();
    this.onStateChange = opts.onStateChange || function () {};
    this.onError = opts.onError || function () {};
    this.onReady = opts.onReady || function () {};
    this.connections = {};
    this.players = [opts.hostPlayer];
    this.peer = null;
    this.destroyed = false;
    this.init();
  }

  LobbyHost.prototype.init = function () {
    var self = this;
    if (!hasPeerJS()) {
      self.onError('PeerJS kütüphanesi yüklenemedi. İnternet bağlantını kontrol et veya Yerel / Botlu modda oyna.');
      return;
    }
    var peerId = 'cm-ist-lobby-' + self.roomCode;
    self.peer = new global.Peer(peerId, PEER_CONFIG);

    self.peer.on('open', function () {
      self.onReady(self.roomCode);
      self.emitState();
    });

    self.peer.on('connection', function (conn) {
      conn.on('data', function (msg) {
        self.handleMessage(conn, msg);
      });
      conn.on('close', function () {
        var peerKey = conn.peer;
        delete self.connections[peerKey];
        self.players = self.players.filter(function (p) {
          return p.peerId !== peerKey;
        });
        self.emitState();
      });
    });

    self.peer.on('error', function (err) {
      if (err && err.type === 'unavailable-id') {
        self.roomCode = generateRoomCode();
        self.destroy();
        self.destroyed = false;
        self.init();
        return;
      }
      self.onError('Bağlantı hatası: ' + (err && err.message ? err.message : err.type || 'Bilinmeyen hata'));
    });
  };

  LobbyHost.prototype.handleMessage = function (conn, msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'HELLO') {
      if (this.players.length >= 4) {
        conn.send({ type: 'ROOM_FULL' });
        setTimeout(function () {
          conn.close();
        }, 200);
        return;
      }
      this.connections[conn.peer] = conn;
      var existing = null;
      for (var i = 0; i < this.players.length; i++) {
        if (this.players[i].id === msg.player.id) {
          existing = this.players[i];
          break;
        }
      }
      if (!existing) {
        this.players.push({
          id: msg.player.id,
          peerId: conn.peer,
          name: msg.player.name,
          avatar: msg.player.avatar,
          color: msg.player.avatar && msg.player.avatar.bgColor,
          isHost: false,
          isBot: false,
          ready: false
        });
      }
      this.emitState();
      return;
    }

    if (msg.type === 'UPDATE_PROFILE') {
      for (var j = 0; j < this.players.length; j++) {
        if (this.players[j].id === msg.playerId) {
          this.players[j].name = msg.name;
          this.players[j].avatar = msg.avatar;
          this.players[j].color = msg.avatar && msg.avatar.bgColor;
          break;
        }
      }
      this.emitState();
      return;
    }

    if (msg.type === 'SET_READY') {
      for (var k = 0; k < this.players.length; k++) {
        if (this.players[k].id === msg.playerId) {
          this.players[k].ready = Boolean(msg.ready);
          break;
        }
      }
      this.emitState();
    }
  };

  LobbyHost.prototype.updateHostProfile = function (name, avatar) {
    if (this.players[0]) {
      this.players[0].name = name;
      this.players[0].avatar = avatar;
      this.players[0].color = avatar && avatar.bgColor;
      this.emitState();
    }
  };

  LobbyHost.prototype.addBot = function (botPlayer) {
    if (this.players.length >= 4) return false;
    this.players.push(botPlayer);
    this.emitState();
    return true;
  };

  LobbyHost.prototype.removePlayer = function (playerId) {
    this.players = this.players.filter(function (p) {
      return p.id !== playerId || p.isHost;
    });
    this.emitState();
  };

  LobbyHost.prototype.emitState = function () {
    var payload = {
      type: 'LOBBY_STATE',
      roomCode: this.roomCode,
      players: this.players
    };
    var keys = Object.keys(this.connections);
    for (var i = 0; i < keys.length; i++) {
      var c = this.connections[keys[i]];
      if (c && c.open) {
        c.send(payload);
      }
    }
    this.onStateChange(this.players, this.roomCode);
  };

  LobbyHost.prototype.broadcastStartGame = function (matchConfig) {
    var payload = {
      type: 'START_GAME',
      matchConfig: matchConfig
    };
    var keys = Object.keys(this.connections);
    for (var i = 0; i < keys.length; i++) {
      var c = this.connections[keys[i]];
      if (c && c.open) {
        c.send(payload);
      }
    }
  };

  LobbyHost.prototype.destroy = function () {
    this.destroyed = true;
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
  };

  function LobbyGuest(opts) {
    this.roomCode = String(opts.roomCode || '').toUpperCase().trim();
    this.player = opts.player;
    this.onStateChange = opts.onStateChange || function () {};
    this.onStartGame = opts.onStartGame || function () {};
    this.onError = opts.onError || function () {};
    this.onConnected = opts.onConnected || function () {};
    this.peer = null;
    this.conn = null;
    this.init();
  }

  LobbyGuest.prototype.init = function () {
    var self = this;
    if (!hasPeerJS()) {
      self.onError('PeerJS yüklenemedi. İnternet bağlantını kontrol et.');
      return;
    }
    self.peer = new global.Peer(undefined, PEER_CONFIG);
    self.peer.on('open', function () {
      var hostId = 'cm-ist-lobby-' + self.roomCode;
      self.conn = self.peer.connect(hostId, { reliable: true });
      var timer = setTimeout(function () {
        if (self.conn && !self.conn.open) {
          self.onError('Oda bulunamadı (' + self.roomCode + '). Oda kodunu kontrol et.');
        }
      }, 9000);

      self.conn.on('open', function () {
        clearTimeout(timer);
        self.onConnected();
        self.conn.send({ type: 'HELLO', player: self.player });
      });

      self.conn.on('data', function (msg) {
        if (!msg || !msg.type) return;
        if (msg.type === 'ROOM_FULL') {
          self.onError('Bu oda dolu (en fazla 4 oyuncu).');
          return;
        }
        if (msg.type === 'LOBBY_STATE') {
          self.onStateChange(msg.players || [], msg.roomCode || self.roomCode);
          return;
        }
        if (msg.type === 'START_GAME') {
          self.onStartGame(msg.matchConfig);
        }
      });

      self.conn.on('close', function () {
        self.onError('Oda kurucusuyla bağlantı kesildi.');
      });
    });

    self.peer.on('error', function (err) {
      if (err && err.type === 'peer-unavailable') {
        self.onError('Bu oda kodu bulunamadı: ' + self.roomCode);
        return;
      }
      self.onError('Bağlantı hatası: ' + (err && err.message ? err.message : err.type || 'Bilinmeyen hata'));
    });
  };

  LobbyGuest.prototype.updateProfile = function (name, avatar) {
    this.player.name = name;
    this.player.avatar = avatar;
    if (this.conn && this.conn.open) {
      this.conn.send({
        type: 'UPDATE_PROFILE',
        playerId: this.player.id,
        name: name,
        avatar: avatar
      });
    }
  };

  LobbyGuest.prototype.setReady = function (ready) {
    if (this.conn && this.conn.open) {
      this.conn.send({
        type: 'SET_READY',
        playerId: this.player.id,
        ready: Boolean(ready)
      });
    }
  };

  LobbyGuest.prototype.destroy = function () {
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
  };

  function GameHost(opts) {
    this.roomCode = opts.roomCode;
    this.onAction = opts.onAction || function () {};
    this.onPeersChange = opts.onPeersChange || function () {};
    this.onStatus = opts.onStatus || function () {};
    this.getState = opts.getState || function () { return null; };
    this.connections = {};
    this.connectedPlayerIds = {};
    this.peer = null;
    this.init();
  }

  GameHost.prototype.init = function () {
    var self = this;
    if (!hasPeerJS()) {
      self.onStatus('PeerJS yüklenemedi (çevrimdışı).');
      return;
    }
    var peerId = 'cm-ist-game-' + self.roomCode;
    self.peer = new global.Peer(peerId, PEER_CONFIG);

    self.peer.on('open', function () {
      self.onStatus('Oda aktif (' + self.roomCode + ')');
    });

    self.peer.on('connection', function (conn) {
      conn.on('data', function (msg) {
        if (!msg || !msg.type) return;
        if (msg.type === 'JOIN_GAME') {
          self.connections[msg.playerId] = conn;
          conn._cmPlayerId = msg.playerId;
          self.connectedPlayerIds[msg.playerId] = true;
          self.onPeersChange(Object.assign({}, self.connectedPlayerIds));
          var snap = self.getState();
          if (snap) {
            conn.send({ type: 'STATE_SYNC', state: snap });
          }
          return;
        }
        if (msg.type === 'ACTION') {
          self.onAction(msg.playerId, msg.action);
        }
      });

      conn.on('close', function () {
        if (conn._cmPlayerId) {
          delete self.connectedPlayerIds[conn._cmPlayerId];
          delete self.connections[conn._cmPlayerId];
          self.onPeersChange(Object.assign({}, self.connectedPlayerIds));
        }
      });
    });

    self.peer.on('error', function (err) {
      self.onStatus('Ağ hatası: ' + (err && err.type ? err.type : 'bağlantı sorunu'));
    });
  };

  GameHost.prototype.broadcastState = function (state) {
    var keys = Object.keys(this.connections);
    for (var i = 0; i < keys.length; i++) {
      var c = this.connections[keys[i]];
      if (c && c.open) {
        c.send({ type: 'STATE_SYNC', state: state });
      }
    }
  };

  GameHost.prototype.destroy = function () {
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
  };

  function GameGuest(opts) {
    this.roomCode = opts.roomCode;
    this.playerId = opts.playerId;
    this.onStateSync = opts.onStateSync || function () {};
    this.onStatus = opts.onStatus || function () {};
    this.onError = opts.onError || function () {};
    this.peer = null;
    this.conn = null;
    this.retries = 0;
    this.maxRetries = 25;
    this.retryTimer = null;
    this.connected = false;
    this.init();
  }

  GameGuest.prototype.init = function () {
    var self = this;
    if (!hasPeerJS()) {
      self.onError('PeerJS yüklenemedi. İnternet bağlantını kontrol et.');
      return;
    }
    self.peer = new global.Peer(undefined, PEER_CONFIG);
    self.peer.on('open', function () {
      self.connectAttempt();
    });
    self.peer.on('error', function (err) {
      if (err && err.type === 'peer-unavailable' && self.retries < self.maxRetries) {
        self.scheduleRetry();
        return;
      }
      self.onStatus('Bağlantı uyarısı: ' + (err && err.type ? err.type : 'yeniden deneniyor'));
    });
  };

  GameGuest.prototype.connectAttempt = function () {
    var self = this;
    if (!self.peer || self.peer.destroyed) return;
    self.onStatus('Odaya bağlanılıyor... (' + (self.retries + 1) + ')');
    var hostId = 'cm-ist-game-' + self.roomCode;
    var conn = self.peer.connect(hostId, { reliable: true });
    self.conn = conn;

    conn.on('open', function () {
      self.connected = true;
      self.onStatus('Bağlı (' + self.roomCode + ')');
      conn.send({ type: 'JOIN_GAME', playerId: self.playerId });
    });

    conn.on('data', function (msg) {
      if (msg && msg.type === 'STATE_SYNC' && msg.state) {
        self.onStateSync(msg.state);
      }
    });

    conn.on('close', function () {
      self.connected = false;
      self.onStatus('Host bağlantısı kesildi.');
    });

    setTimeout(function () {
      if (!self.connected && self.retries < self.maxRetries) {
        self.scheduleRetry();
      } else if (!self.connected && self.retries >= self.maxRetries) {
        self.onError('Oyun kurucusuna bağlanılamadı.');
      }
    }, 1200);
  };

  GameGuest.prototype.scheduleRetry = function () {
    var self = this;
    if (self.retryTimer || self.connected) return;
    self.retries += 1;
    self.retryTimer = setTimeout(function () {
      self.retryTimer = null;
      self.connectAttempt();
    }, 1000);
  };

  GameGuest.prototype.sendAction = function (action) {
    if (this.conn && this.conn.open) {
      this.conn.send({
        type: 'ACTION',
        playerId: this.playerId,
        action: action
      });
      return true;
    }
    return false;
  };

  GameGuest.prototype.destroy = function () {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
    }
  };

  CM.Network = {
    generateRoomCode: generateRoomCode,
    LobbyHost: LobbyHost,
    LobbyGuest: LobbyGuest,
    GameHost: GameHost,
    GameGuest: GameGuest
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CM.Network;
  }
})(typeof window !== 'undefined' ? window : globalThis);
