(function (global) {
  'use strict';

  var CM = (global.CM = global.CM || {});
  var BD = CM.BoardData;
  if (!BD && typeof require === 'function') {
    BD = require('./boardData.js');
  }

  function cloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function appendLog(state, message, category) {
    state.logs.unshift({
      id: state.turnNumber + '-' + state.logs.length + '-' + Math.floor(Math.random() * 10000),
      turn: state.turnNumber,
      text: message,
      category: category || 'info'
    });
    if (state.logs.length > 80) {
      state.logs.length = 80;
    }
  }

  function recordTransaction(state, kind, payerId, receiverId, amount, reason, icon, extra) {
    if (!amount || amount <= 0) return;
    if (!state.lastTransactions) state.lastTransactions = [];
    state.txSeq = (state.txSeq || 0) + 1;
    var ex = extra || {};
    state.lastTransactions.push({
      id: 'tx-' + state.txSeq,
      kind: kind || 'payment',
      payerId: payerId || 'bank',
      receiverId: receiverId || 'bank',
      amount: amount,
      reason: reason || 'İşlem',
      icon: icon || (kind === 'income' ? '💰' : '💳'),
      account: ex.account || 'bank',
      split: ex.split || null,
      breakdown: ex.breakdown || null
    });
  }

  function createGameState(playersConfig, options) {
    var opts = options || {};
    var players = (playersConfig || []).map(function (p, idx) {
      return {
        id: String(p.id || 'p' + (idx + 1)),
        name: String(p.name || 'Oyuncu ' + (idx + 1)).slice(0, 20),
        avatar: p.avatar || null,
        color: p.color || (p.avatar && p.avatar.bgColor) || '#ef4444',
        isBot: Boolean(p.isBot),
        cash: BD.STARTING_CASH,
        bank: BD.STARTING_BANK,
        pos: 0,
        inInspection: false,
        bankrupt: false,
        loansTakenCount: 0,
        loans: [],
        stats: {
          turnsTaken: 0,
          totalEarned: 0,
          totalPaid: 0
        }
      };
    });

    var state = {
      version: 2,
      roomCode: opts.roomCode || 'YEREL',
      mode: opts.mode || 'local',
      players: players,
      ownership: {},
      turnIndex: 0,
      turnNumber: 1,
      phase: 'PRE_ROLL',
      lastDie: 1,
      lastDice: [1],
      lastDiceTotal: 1,
      doublesStreak: 0,
      canRollAgain: false,
      pendingDebt: null,
      pendingTadilat: null,
      pendingHub: null,
      auction: null,
      lastEventCard: null,
      lastMove: null,
      moveSeq: 0,
      cardSeq: 0,
      txSeq: 0,
      lastTransactions: [],
      logs: [],
      winnerId: null
    };

    appendLog(
      state,
      'BARONIA (İstanbul) başladı! Herkese ' + BD.STARTING_CASH + '₺ Nakit + ' + BD.STARTING_BANK + '₺ Banka sermayesi verildi.',
      'system'
    );
    return state;
  }

  function getPlayerById(state, playerId) {
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === playerId) return state.players[i];
    }
    return null;
  }

  function getCurrentPlayer(state) {
    return state.players[state.turnIndex] || null;
  }

  function getActiveDecisionPlayer(state) {
    if (state && state.phase === 'AUCTION' && state.auction && state.auction.activeBidderIds.length > 0) {
      var bidId = state.auction.activeBidderIds[state.auction.currentBidderIndex] || state.auction.activeBidderIds[0];
      return getPlayerById(state, bidId);
    }
    return getCurrentPlayer(state);
  }

  function getActivePlayers(state) {
    return state.players.filter(function (p) {
      return !p.bankrupt;
    });
  }

  function getPlayerTotalFunds(player) {
    if (!player) return 0;
    return (player.cash || 0) + (player.bank || 0);
  }

  // Automatically pulls from preferAccount first, then covers any shortfall from the other account
  function deductFunds(player, amount, preferAccount) {
    if (!player || amount <= 0) return { fromCash: 0, fromBank: 0 };
    var fromCash = 0;
    var fromBank = 0;
    var rem = amount;

    if (preferAccount === 'cash') {
      var takeCash = Math.min(player.cash, rem);
      player.cash -= takeCash;
      fromCash += takeCash;
      rem -= takeCash;
      if (rem > 0) {
        var takeBank = Math.min(player.bank, rem);
        player.bank -= takeBank;
        fromBank += takeBank;
        rem -= takeBank;
      }
    } else {
      var takeB = Math.min(player.bank, rem);
      player.bank -= takeB;
      fromBank += takeB;
      rem -= takeB;
      if (rem > 0) {
        var takeC = Math.min(player.cash, rem);
        player.cash -= takeC;
        fromCash += takeC;
        rem -= takeC;
      }
    }

    player.stats.totalPaid += amount - rem;
    return { fromCash: fromCash, fromBank: fromBank };
  }

  function creditPlayer(player, amount, account) {
    if (!player || amount <= 0) return;
    if (account === 'bank') {
      player.bank += amount;
    } else {
      player.cash += amount;
    }
    player.stats.totalEarned += amount;
  }

  function getPlayerPropertyIndices(state, playerId) {
    var indices = [];
    var keys = Object.keys(state.ownership);
    for (var i = 0; i < keys.length; i++) {
      var idx = Number(keys[i]);
      if (state.ownership[idx] && state.ownership[idx].ownerId === playerId) {
        indices.push(idx);
      }
    }
    indices.sort(function (a, b) {
      return a - b;
    });
    return indices;
  }

  function getPlayerPropertyCount(state, playerId) {
    return getPlayerPropertyIndices(state, playerId).length;
  }

  function getOwnedShopTypeCount(state, ownerId, shopType) {
    var count = 0;
    var keys = Object.keys(state.ownership);
    for (var i = 0; i < keys.length; i++) {
      var own = state.ownership[keys[i]];
      if (own && own.type === 'plot' && own.ownerId === ownerId && own.shopType === shopType) {
        count++;
      }
    }
    return count;
  }

  function getUpgradeInfo(state, playerId, tileIndex) {
    var tile = BD.TILES[tileIndex];
    var own = state.ownership[tileIndex];
    var player = getPlayerById(state, playerId);
    if (!tile || tile.type !== 'plot' || !own || own.ownerId !== playerId) {
      return null;
    }

    var level = Math.max(1, Math.min(BD.MAX_BUILDING_LEVEL, own.level || 1));
    var shopMeta = BD.SHOP_TYPES[own.shopType];
    var sameTypeCount = getOwnedShopTypeCount(state, playerId, own.shopType);
    var isOnSite = Boolean(player && player.pos === tileIndex);
    var currentTier = BD.getShopTier(own.shopType, level);

    if (level >= BD.MAX_BUILDING_LEVEL) {
      return {
        canUpgrade: false,
        reason: 'Maksimum seviye (Sv.3).',
        currentLevel: level,
        nextLevel: level,
        sameTypeCount: sameTypeCount,
        requiredCount: BD.UPGRADE_MIN_SAME_TYPE,
        isOnSite: isOnSite,
        baseUpgradeCost: 0,
        cost: 0,
        currentTier: currentTier,
        nextTier: null
      };
    }

    var nextLevel = level + 1;
    var nextTier = BD.getShopTier(own.shopType, nextLevel);
    var baseStats = BD.getShopStats(own.shopType, tile.neighborhoodId);
    var costFactor = (BD.UPGRADE_COST_FACTORS && BD.UPGRADE_COST_FACTORS[nextLevel]) || 1;
    var baseUpgradeCost = BD.round5(baseStats.cost * costFactor);
    var cost = isOnSite ? baseUpgradeCost : BD.round5(baseUpgradeCost * BD.REMOTE_UPGRADE_MULTIPLIER);

    var reason = '';
    var canUpgrade = true;
    if (own.closedTurnsRemaining > 0) {
      canUpgrade = false;
      reason = 'Tadilattaki bina yükseltilemez.';
    } else if (sameTypeCount < BD.UPGRADE_MIN_SAME_TYPE) {
      canUpgrade = false;
      reason =
        'Yükseltmek için en az ' +
        BD.UPGRADE_MIN_SAME_TYPE +
        ' adet ' +
        (shopMeta ? shopMeta.name : 'aynı tür') +
        ' olmalı (' +
        sameTypeCount +
        '/' +
        BD.UPGRADE_MIN_SAME_TYPE +
        ').';
    } else if (state.phase !== 'PRE_ROLL' && state.phase !== 'POST_ROLL') {
      canUpgrade = false;
      reason = 'Yükseltme tur başında veya sonunda yapılabilir.';
    }

    return {
      canUpgrade: canUpgrade,
      reason: reason,
      currentLevel: level,
      nextLevel: nextLevel,
      sameTypeCount: sameTypeCount,
      requiredCount: BD.UPGRADE_MIN_SAME_TYPE,
      isOnSite: isOnSite,
      baseUpgradeCost: baseUpgradeCost,
      cost: cost,
      currentTier: currentTier,
      nextTier: nextTier
    };
  }

  function getNeighborhoodBonus(state, tileIndex, ownerId) {
    var tile = BD.TILES[tileIndex];
    if (!tile || tile.type !== 'plot') {
      return { kafeCount: 0, kafeBonusRate: 0, hasMonopoly: false, monopolyBonusRate: 0, multiplier: 1 };
    }
    var hood = BD.NEIGHBORHOODS[tile.neighborhoodId];
    if (!hood) {
      return { kafeCount: 0, kafeBonusRate: 0, hasMonopoly: false, monopolyBonusRate: 0, multiplier: 1 };
    }

    var ownedInHood = 0;
    var kafeCount = 0;
    var kafeBonusRate = 0;
    for (var i = 0; i < hood.plotIndices.length; i++) {
      var idx = hood.plotIndices[i];
      var own = state.ownership[idx];
      if (own && own.ownerId === ownerId) {
        ownedInHood++;
        if (idx !== tileIndex && own.shopType === 'kafe' && own.closedTurnsRemaining <= 0) {
          kafeCount++;
          var klvl = Math.max(1, Math.min(BD.MAX_BUILDING_LEVEL, own.level || 1));
          kafeBonusRate += (BD.KAFE_BONUS_BY_LEVEL && BD.KAFE_BONUS_BY_LEVEL[klvl]) || BD.KAFE_BONUS_PER_SHOP;
        }
      }
    }

    var hasMonopoly = ownedInHood === hood.plotIndices.length;
    var monopolyBonusRate = hasMonopoly ? BD.MONOPOLY_BONUS : 0;
    return {
      kafeCount: kafeCount,
      kafeBonusRate: kafeBonusRate,
      hasMonopoly: hasMonopoly,
      monopolyBonusRate: monopolyBonusRate,
      multiplier: 1 + kafeBonusRate + monopolyBonusRate
    };
  }

  function getOwnedCountByType(state, ownerId, tileType) {
    var count = 0;
    var keys = Object.keys(state.ownership);
    for (var i = 0; i < keys.length; i++) {
      var idx = Number(keys[i]);
      var own = state.ownership[idx];
      if (own && own.ownerId === ownerId && own.type === tileType) {
        count++;
      }
    }
    return count;
  }

  function getTileEffectiveNumbers(state, tileIndex) {
    var tile = BD.TILES[tileIndex];
    var own = state.ownership[tileIndex];
    if (!tile || !own) return null;

    var isClosed = own.closedTurnsRemaining > 0;
    if (own.type === 'plot') {
      var base = BD.getShopStats(own.shopType, tile.neighborhoodId);
      var level = Math.max(1, Math.min(BD.MAX_BUILDING_LEVEL, own.level || 1));
      var levelMult = (BD.LEVEL_INCOME_MULTIPLIERS && BD.LEVEL_INCOME_MULTIPLIERS[level]) || 1;
      var bonus = getNeighborhoodBonus(state, tileIndex, own.ownerId);

      var lvlPassFee = base.passFee === 0 ? 0 : BD.round5(base.passFee * levelMult);
      var lvlLandRent = BD.round5(base.landRent * levelMult);
      var lvlStartBonus = base.startBonus === 0 ? 0 : BD.round5(base.startBonus * levelMult);

      return {
        isClosed: isClosed,
        level: level,
        levelMult: levelMult,
        basePassFee: lvlPassFee,
        baseLandRent: lvlLandRent,
        baseStartBonus: lvlStartBonus,
        passFee: isClosed || lvlPassFee === 0 ? 0 : BD.round5(lvlPassFee * bonus.multiplier),
        landRent: isClosed ? 0 : BD.round5(lvlLandRent * bonus.multiplier),
        startBonus: isClosed || lvlStartBonus === 0 ? 0 : BD.round5(lvlStartBonus * bonus.multiplier),
        kafeCount: bonus.kafeCount,
        kafeBonusRate: bonus.kafeBonusRate,
        hasMonopoly: bonus.hasMonopoly,
        monopolyBonusRate: bonus.monopolyBonusRate,
        multiplier: bonus.multiplier
      };
    }

    if (own.type === 'landmark') {
      var landmarkCount = getOwnedCountByType(state, own.ownerId, 'landmark');
      var lmMult = BD.LANDMARK_MULTIPLIERS[Math.min(3, landmarkCount)] || 1;
      return {
        isClosed: isClosed,
        passFee: 0,
        baseRent: tile.baseRent,
        landRent: isClosed ? 0 : BD.round5(tile.baseRent * lmMult),
        startBonus: 0,
        setCount: landmarkCount,
        multiplier: lmMult
      };
    }

    if (own.type === 'utility') {
      var utilCount = getOwnedCountByType(state, own.ownerId, 'utility');
      var ownerShopCount = getOwnedCountByType(state, own.ownerId, 'plot');
      var uKind = tile.utilityKind || 'taksi';
      var baseFee = tile.baseFee || 0;
      var hubExtraFee = 0;
      var landRent = 0;

      if (uKind === 'taksi') {
        hubExtraFee = Math.max(0, utilCount - 1) * 25;
      } else if (uKind === 'borsa') {
        hubExtraFee = Math.max(0, utilCount - 1) * 30;
        landRent = isClosed ? 0 : baseFee + hubExtraFee;
      } else if (uKind === 'medya') {
        hubExtraFee = ownerShopCount * (tile.perShopFee || 35);
        landRent = isClosed ? 0 : baseFee + hubExtraFee;
      } else if (uKind === 'heliport') {
        hubExtraFee = Math.max(0, utilCount - 1) * 55;
        landRent = isClosed ? 0 : baseFee + hubExtraFee;
      }

      return {
        isClosed: isClosed,
        utilityKind: uKind,
        passFee: 0,
        baseFee: baseFee,
        perDieFee: tile.perDieFee || 0,
        perShopFee: tile.perShopFee || 0,
        ownerShopCount: ownerShopCount,
        hubExtraFee: hubExtraFee,
        landRent: landRent,
        startBonus: 0,
        setCount: utilCount
      };
    }

    return null;
  }

  function getPlayerMarketStartIncome(state, playerId) {
    var total = 0;
    var indices = getPlayerPropertyIndices(state, playerId);
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      var own = state.ownership[idx];
      if (own && own.shopType === 'market' && own.closedTurnsRemaining <= 0) {
        var eff = getTileEffectiveNumbers(state, idx);
        if (eff) total += eff.startBonus;
      }
    }
    return total;
  }

  function getPlayerNetWorth(state, playerId) {
    var player = getPlayerById(state, playerId);
    if (!player) return 0;
    var propertyValue = 0;
    var indices = getPlayerPropertyIndices(state, playerId);
    for (var i = 0; i < indices.length; i++) {
      propertyValue += state.ownership[indices[i]].costPaid || 0;
    }
    var loanDebt = 0;
    for (var j = 0; j < player.loans.length; j++) {
      loanDebt += player.loans[j].remainingAmount || 0;
    }
    return getPlayerTotalFunds(player) + propertyValue - loanDebt;
  }

  function getAvailableLoanOffers(state, playerId) {
    var player = getPlayerById(state, playerId);
    if (!player) return [];
    var propCount = getPlayerPropertyCount(state, playerId);
    var isFirstLoan = player.loansTakenCount === 0;
    var activeLoans = player.loans.length;

    return BD.LOAN_PACKAGES.map(function (pkg) {
      var rate = isFirstLoan ? 0 : pkg.interestRate;
      var totalRepay = isFirstLoan ? pkg.principal : BD.round5(pkg.principal * (1 + rate));
      var installmentAmount = Math.round(totalRepay / pkg.installments);
      var eligible = activeLoans < BD.MAX_ACTIVE_LOANS && propCount >= pkg.minProperties && !player.bankrupt;
      var reason = '';
      if (activeLoans >= BD.MAX_ACTIVE_LOANS) {
        reason = 'Mevcut kredin bitmeden yeni kredi çekemezsin.';
      } else if (propCount < pkg.minProperties) {
        reason = 'En az ' + pkg.minProperties + ' mülk sahibi olmalısın.';
      }
      return {
        id: pkg.id,
        name: pkg.name,
        principal: pkg.principal,
        installments: pkg.installments,
        interestRate: rate,
        totalRepay: totalRepay,
        installmentAmount: installmentAmount,
        graceTurns: BD.LOAN_GRACE_TURNS,
        isZeroInterest: isFirstLoan,
        minProperties: pkg.minProperties,
        description: pkg.description,
        eligible: eligible,
        reason: reason
      };
    });
  }

  function chargePlayerOrEnterDebt(state, player, amount, creditorId, reason, resumePhase, resumeLandingTile, resumeIsTeleport, options) {
    if (amount <= 0) return true;
    var opts = options || {};
    var preferPay = opts.preferAccount || 'bank';
    var receiveAcc = opts.receiveAccount || 'cash';

    if (getPlayerTotalFunds(player) >= amount) {
      var split = deductFunds(player, amount, preferPay);
      if (creditorId && creditorId !== 'bank') {
        var creditor = getPlayerById(state, creditorId);
        if (creditor && !creditor.bankrupt) {
          creditPlayer(creditor, amount, receiveAcc);
        }
      }
      recordTransaction(state, 'payment', player.id, creditorId || 'bank', amount, reason, opts.icon || '💳', {
        account: preferPay,
        split: split
      });
      return true;
    }

    state.pendingDebt = {
      playerId: player.id,
      amount: amount,
      creditorId: creditorId || 'bank',
      reason: reason,
      preferAccount: preferPay,
      receiveAccount: receiveAcc,
      resumePhase: resumePhase || 'POST_ROLL',
      resumeLandingTile: typeof resumeLandingTile === 'number' ? resumeLandingTile : null,
      resumeIsTeleport: Boolean(resumeIsTeleport)
    };
    state.phase = 'DEBT_RESOLUTION';
    appendLog(state, player.name + ' için ' + amount + '₺ ödeme gerekli! (Toplam bakiye yetersiz)', 'alert');
    return false;
  }

  function processStartCrossing(state, player, landedExactOnStart, moveRecord) {
    var baseBonus = landedExactOnStart ? BD.START_LAND_BONUS : BD.START_PASS_BONUS;
    var marketBonus = getPlayerMarketStartIncome(state, player.id);
    var interestBonus = player.bank > 0 ? Math.round(player.bank * BD.BANK_INTEREST_RATE) : 0;
    var totalGain = baseBonus + marketBonus + interestBonus;

    creditPlayer(player, totalGain, 'bank');

    var breakdown = [
      { label: landedExactOnStart ? 'Başlangıç Durma İkramiyesi' : 'Başlangıç Geçiş Maaşı', amount: baseBonus }
    ];
    if (marketBonus > 0) {
      breakdown.push({ label: 'Market İşletme Gelirleri', amount: marketBonus });
    }
    if (interestBonus > 0) {
      breakdown.push({ label: '%5 Banka Mevduat Faizi', amount: interestBonus });
    }

    recordTransaction(
      state,
      'income',
      'bank',
      player.id,
      totalGain,
      landedExactOnStart ? 'Başlangıç Durma Geliri' : 'Başlangıç Geçiş Geliri',
      '🏁',
      { account: 'bank', breakdown: breakdown }
    );

    if (moveRecord) {
      moveRecord.startGain = totalGain;
      moveRecord.passedStart = true;
    }

    var msg = landedExactOnStart
      ? player.name + ' Başlangıç karesinde durdu! +' + BD.START_LAND_BONUS + '₺'
      : player.name + ' Başlangıçtan geçti! +' + BD.START_PASS_BONUS + '₺';
    if (marketBonus > 0) msg += ' (+' + marketBonus + '₺ Market)';
    if (interestBonus > 0) msg += ' (+' + interestBonus + '₺ Faiz)';
    appendLog(state, msg + ' → Banka', 'income');

    var dueTotal = 0;
    var dueLoans = [];
    for (var i = 0; i < player.loans.length; i++) {
      var loan = player.loans[i];
      if (loan.graceTurnsRemaining <= 0 && loan.remainingInstallments > 0) {
        var pay = Math.min(loan.installmentAmount, loan.remainingAmount);
        dueTotal += pay;
        dueLoans.push({ loan: loan, pay: pay });
      }
    }

    if (dueTotal > 0) {
      if (getPlayerTotalFunds(player) >= dueTotal) {
        var split = deductFunds(player, dueTotal, 'bank');
        for (var j = 0; j < dueLoans.length; j++) {
          dueLoans[j].loan.remainingAmount -= dueLoans[j].pay;
          dueLoans[j].loan.remainingInstallments -= 1;
        }
        player.loans = player.loans.filter(function (l) {
          return l.remainingInstallments > 0 && l.remainingAmount > 0;
        });
        if (moveRecord) {
          moveRecord.loanPaid = dueTotal;
        }
        recordTransaction(state, 'payment', player.id, 'bank', dueTotal, 'Banka Kredi Taksiti', '🏦', {
          account: 'bank',
          split: split
        });
        appendLog(state, player.name + ' banka kredi taksiti ödedi: -' + dueTotal + '₺', 'expense');
      } else {
        return { debtRequired: dueTotal, dueLoans: dueLoans };
      }
    }
    return { debtRequired: 0 };
  }

  function applyLoanDeductionAfterDebt(player) {
    var dueTotal = 0;
    for (var i = 0; i < player.loans.length; i++) {
      var loan = player.loans[i];
      if (loan.graceTurnsRemaining <= 0 && loan.remainingInstallments > 0) {
        var pay = Math.min(loan.installmentAmount, loan.remainingAmount);
        dueTotal += pay;
        loan.remainingAmount -= pay;
        loan.remainingInstallments -= 1;
      }
    }
    player.loans = player.loans.filter(function (l) {
      return l.remainingInstallments > 0 && l.remainingAmount > 0;
    });
    return dueTotal;
  }

  function sendToZabita(state, player, reasonText) {
    var prevPos = player.pos;
    player.pos = 10;
    player.inInspection = true;
    state.canRollAgain = false;
    state.doublesStreak = 0;
    state.phase = 'POST_ROLL';
    state.moveSeq = (state.moveSeq || 0) + 1;
    state.lastMove = {
      moveSeq: state.moveSeq,
      playerId: player.id,
      from: prevPos,
      to: 10,
      path: [10],
      passedStart: false,
      dondurmaciHits: [],
      isTeleport: true
    };
    appendLog(state, reasonText || (player.name + ' Zabıta İncelemesine gönderildi!'), 'alert');
  }

  function resolveLanding(state, player, tileIndex, isTeleport) {
    var tile = BD.TILES[tileIndex];
    if (!tile) {
      state.phase = 'POST_ROLL';
      return;
    }

    if (tile.type === 'corner') {
      if (tile.subtype === 'start') {
        state.phase = 'POST_ROLL';
        return;
      }
      if (tile.subtype === 'zabita') {
        player.inInspection = true;
        state.canRollAgain = false;
        state.doublesStreak = 0;
        state.phase = 'POST_ROLL';
        appendLog(state, player.name + ' Zabıta İncelemesine düştü! (Sonraki tur 200₺ öde veya 1 tur bekle)', 'alert');
        return;
      }
      if (tile.subtype === 'musteri_akini') {
        var indices = getPlayerPropertyIndices(state, player.id);
        var totalInvested = 0;
        for (var i = 0; i < indices.length; i++) {
          var own = state.ownership[indices[i]];
          if (own && (own.type === 'plot' || own.type === 'landmark')) {
            totalInvested += own.costPaid || 0;
          }
        }
        var bonus = totalInvested > 0 ? Math.max(150, BD.round5(totalInvested * 0.2)) : 150;
        creditPlayer(player, bonus, 'cash');
        recordTransaction(state, 'income', 'bank', player.id, bonus, 'Müşteri Akını Cirosu', '🎉', {
          account: 'cash',
          breakdown: [{ label: 'Sıcak Nakit Müşteri Cirosu', amount: bonus }]
        });
        appendLog(state, player.name + ' Müşteri Akını yakaladı! +' + bonus + '₺ nakit.', 'income');
        state.phase = 'POST_ROLL';
        return;
      }
      if (tile.subtype === 'tadilat') {
        var ownedIndices = getPlayerPropertyIndices(state, player.id);
        var bestIdx = null;
        var bestCost = -1;
        for (var k = 0; k < ownedIndices.length; k++) {
          var idx = ownedIndices[k];
          var o = state.ownership[idx];
          if (o && (o.type === 'plot' || o.type === 'landmark') && o.closedTurnsRemaining <= 0) {
            if (o.costPaid > bestCost) {
              bestCost = o.costPaid;
              bestIdx = idx;
            }
          }
        }
        if (bestIdx === null) {
          appendLog(state, player.name + ' Zorunlu Tadilat karesine geldi ama açık dükkanı yok.', 'info');
          state.phase = 'POST_ROLL';
          return;
        }
        var repairCost = Math.max(25, BD.round5(bestCost * 0.15));
        state.pendingTadilat = {
          playerId: player.id,
          tileIndex: bestIdx,
          tileName: BD.TILES[bestIdx].name,
          repairCost: repairCost
        };
        state.phase = 'TADILAT_CHOICE';
        appendLog(state, player.name + ' Zorunlu Tadilata girdi (' + BD.TILES[bestIdx].name + ').', 'alert');
        return;
      }
    }

    if (tile.type === 'toptanci') {
      state.phase = 'CHOOSE_TELEPORT';
      appendLog(state, player.name + ' Toptancı Fırsatı yakaladı! İstediği kareye gidebilir.', 'event');
      return;
    }

    if (tile.type === 'tax') {
      var taxAmount = 0;
      if (tile.subtype === 'fixed') {
        taxAmount = tile.amount;
      } else {
        var propCount = getPlayerPropertyCount(state, player.id);
        taxAmount = propCount * tile.perProperty;
      }
      if (taxAmount === 0) {
        appendLog(state, player.name + ' ' + tile.name + ' ödeyecek mülkü olmadığı için 0₺ ödedi.', 'info');
        state.phase = 'POST_ROLL';
        return;
      }
      var paid = chargePlayerOrEnterDebt(state, player, taxAmount, 'bank', tile.name, 'POST_ROLL', null, false, {
        preferAccount: 'bank',
        icon: tile.icon
      });
      if (paid) {
        appendLog(state, player.name + ' ' + tile.name + ' ödedi: -' + taxAmount + '₺', 'expense');
        state.phase = 'POST_ROLL';
      }
      return;
    }

    if (tile.type === 'event') {
      state.phase = 'DRAW_EVENT_CARD';
      appendLog(state, player.name + ' Olay karesine geldi! Ortadaki desteden kart çekecek.', 'event');
      return;
    }

    if (tile.type === 'plot') {
      var plotOwn = state.ownership[tileIndex];
      if (!plotOwn) {
        state.phase = 'BUY_PLOT';
        return;
      }
      if (plotOwn.ownerId === player.id) {
        appendLog(state, player.name + ' kendi dükkanına (' + tile.name + ') uğradı.', 'info');
        state.phase = 'POST_ROLL';
        return;
      }
      var owner = getPlayerById(state, plotOwn.ownerId);
      if (!owner || owner.bankrupt) {
        state.phase = 'POST_ROLL';
        return;
      }
      if (plotOwn.closedTurnsRemaining > 0) {
        appendLog(state, tile.name + ' tadilatta kapalı olduğu için kira alınmadı!', 'info');
        state.phase = 'POST_ROLL';
        return;
      }
      var eff = getTileEffectiveNumbers(state, tileIndex);
      var rent = eff ? eff.landRent : 0;
      if (rent > 0) {
        var shopMeta = BD.SHOP_TYPES[plotOwn.shopType];
        var paidRent = chargePlayerOrEnterDebt(
          state,
          player,
          rent,
          owner.id,
          tile.name + ' (' + (shopMeta ? shopMeta.name : 'İşletme') + ' kirası)',
          'POST_ROLL',
          null,
          false,
          { preferAccount: 'bank', receiveAccount: 'cash', icon: shopMeta ? shopMeta.icon : '🏠' }
        );
        if (paidRent) {
          appendLog(
            state,
            player.name + ', ' + owner.name + ' oyuncusunun ' + tile.name + ' dükkanında durdu: -' + rent + '₺',
            'expense'
          );
          state.phase = 'POST_ROLL';
        }
      } else {
        state.phase = 'POST_ROLL';
      }
      return;
    }

    if (tile.type === 'landmark' || tile.type === 'utility') {
      var specOwn = state.ownership[tileIndex];
      if (!specOwn) {
        state.phase = 'BUY_SPECIAL';
        return;
      }
      var specOwner = getPlayerById(state, specOwn.ownerId);
      if (!specOwner || specOwner.bankrupt) {
        state.phase = 'POST_ROLL';
        return;
      }
      if (specOwn.closedTurnsRemaining > 0) {
        appendLog(state, tile.name + ' tadilatta kapalı olduğu için işlem yapılmadı!', 'info');
        state.phase = 'POST_ROLL';
        return;
      }

      if (tile.type === 'utility') {
        var uKind = tile.utilityKind || 'taksi';
        var isOwner = specOwn.ownerId === player.id;

        if (uKind === 'taksi') {
          state.pendingHub = { kind: 'taksi', tileIndex: tileIndex, ownerId: specOwn.ownerId, isOwner: isOwner };
          state.phase = 'HUB_ACTION';
          appendLog(state, player.name + ' 🚕 Taksi Durağına geldi (1–6 ek zar atacak).', 'event');
          return;
        }

        if (uKind === 'borsa') {
          if (isOwner) {
            var divGain = 120;
            creditPlayer(player, divGain, 'bank');
            recordTransaction(state, 'income', 'bank', player.id, divGain, 'Borsa Ofisi Temettüsü', '📡', {
              account: 'bank',
              breakdown: [{ label: 'Borsa Ofisi Sahibi Temettüsü', amount: divGain }]
            });
            appendLog(state, player.name + ' kendi Borsa Ofisinden +' + divGain + '₺ temettü aldı.', 'income');
            state.phase = 'POST_ROLL';
            return;
          }
          state.pendingHub = { kind: 'borsa', tileIndex: tileIndex, ownerId: specOwn.ownerId, isOwner: false };
          state.phase = 'HUB_ACTION';
          appendLog(state, player.name + ' 📡 Borsa Ofisine girdi — Piyasa zarı atacak!', 'event');
          return;
        }

        if (uKind === 'medya') {
          var ownerShopCount = getOwnedCountByType(state, specOwn.ownerId, 'plot');
          if (isOwner) {
            var adGain = Math.max(100, ownerShopCount * 45);
            creditPlayer(player, adGain, 'cash');
            recordTransaction(state, 'income', 'bank', player.id, adGain, 'Medya Ajansı Reklam Kampanyası', '📺', {
              account: 'cash',
              breakdown: [{ label: ownerShopCount + ' Dükkan Reklam Sinerjisi', amount: adGain }]
            });
            appendLog(state, player.name + ' kendi Medya Ajansından +' + adGain + '₺ reklam geliri topladı.', 'income');
            state.phase = 'POST_ROLL';
            return;
          }
          var medyaFee = (tile.baseFee || 110) + ownerShopCount * (tile.perShopFee || 35);
          var paidMedya = chargePlayerOrEnterDebt(
            state,
            player,
            medyaFee,
            specOwner.id,
            tile.name + ' reklam ücreti',
            'POST_ROLL',
            null,
            false,
            { preferAccount: 'bank', receiveAccount: 'cash', icon: tile.icon }
          );
          if (paidMedya) {
            appendLog(
              state,
              player.name + ', ' + specOwner.name + ' için ' + tile.name + ' reklam bedeli ödedi: -' + medyaFee + '₺.',
              'expense'
            );
            state.phase = 'POST_ROLL';
          }
          return;
        }

        if (uKind === 'heliport') {
          if (isOwner) {
            state.pendingHub = { kind: 'heliport', tileIndex: tileIndex, ownerId: specOwn.ownerId, isOwner: true };
            state.phase = 'HUB_ACTION';
            appendLog(state, player.name + ' 🚁 Boğaz Heliportundan VIP uçuş başlatabilir.', 'event');
            return;
          }
          var hubCount = getOwnedCountByType(state, specOwn.ownerId, 'utility');
          var heliFee = (tile.baseFee || 170) + Math.max(0, hubCount - 1) * 55;
          var paidHeli = chargePlayerOrEnterDebt(
            state,
            player,
            heliFee,
            specOwner.id,
            tile.name + ' VIP iniş harcı',
            'POST_ROLL',
            null,
            false,
            { preferAccount: 'bank', receiveAccount: 'cash', icon: tile.icon }
          );
          if (paidHeli) {
            appendLog(
              state,
              player.name + ', ' + specOwner.name + ' oyuncusunun Boğaz Heliportuna -' + heliFee + '₺ VIP harç ödedi.',
              'expense'
            );
            state.phase = 'POST_ROLL';
          }
          return;
        }
      }

      if (specOwn.ownerId === player.id) {
        appendLog(state, player.name + ' kendi mülküne (' + tile.name + ') uğradı.', 'info');
        state.phase = 'POST_ROLL';
        return;
      }
      var specEff = getTileEffectiveNumbers(state, tileIndex);
      var amount = specEff ? specEff.landRent : tile.baseRent;
      var ok = chargePlayerOrEnterDebt(
        state,
        player,
        amount,
        specOwner.id,
        tile.name + ' ücreti',
        'POST_ROLL',
        null,
        false,
        { preferAccount: 'bank', receiveAccount: 'cash', icon: tile.icon }
      );
      if (ok) {
        appendLog(
          state,
          player.name + ', ' + specOwner.name + ' mülkü ' + tile.name + ' için ' + amount + '₺ ödedi.',
          'expense'
        );
        state.phase = 'POST_ROLL';
      }
    }
  }

  function applyEventCard(state, player, card) {
    if (card.kind === 'cash_gain') {
      creditPlayer(player, card.amount, 'cash');
      recordTransaction(state, 'income', 'bank', player.id, card.amount, card.title, card.icon, {
        account: 'cash',
        breakdown: [{ label: card.title + ' (Nakit)', amount: card.amount }]
      });
      appendLog(state, player.name + ' +' + card.amount + '₺ nakit kazandı.', 'income');
      state.phase = 'POST_ROLL';
      return;
    }

    if (card.kind === 'bank_gain') {
      creditPlayer(player, card.amount, 'bank');
      recordTransaction(state, 'income', 'bank', player.id, card.amount, card.title, card.icon, {
        account: 'bank',
        breakdown: [{ label: card.title + ' (Banka)', amount: card.amount }]
      });
      appendLog(state, player.name + ' banka hesabına +' + card.amount + '₺ aldı.', 'income');
      state.phase = 'POST_ROLL';
      return;
    }

    if (card.kind === 'bank_percent_gain') {
      var divAmount = Math.max(card.minAmount || 150, BD.round5(player.bank * (card.rate || 0.1)));
      creditPlayer(player, divAmount, 'bank');
      recordTransaction(state, 'income', 'bank', player.id, divAmount, card.title, card.icon, {
        account: 'bank',
        breakdown: [{ label: '%10 Banka Temettü Bonusu', amount: divAmount }]
      });
      appendLog(state, player.name + ' banka temettüsü kazandı: +' + divAmount + '₺', 'income');
      state.phase = 'POST_ROLL';
      return;
    }

    if (card.kind === 'dondurmaci_bonus') {
      var indices = getPlayerPropertyIndices(state, player.id);
      var dondCount = 0;
      for (var i = 0; i < indices.length; i++) {
        var o = state.ownership[indices[i]];
        if (o && o.shopType === 'dondurmaci' && o.closedTurnsRemaining <= 0) {
          dondCount++;
        }
      }
      var gain = dondCount > 0 ? dondCount * card.perShop : card.fallback;
      creditPlayer(player, gain, 'cash');
      recordTransaction(state, 'income', 'bank', player.id, gain, card.title, card.icon, {
        account: 'cash',
        breakdown: [
          {
            label: dondCount > 0 ? dondCount + ' × Dondurmacı Sıcak Satışı' : 'Moral Desteği',
            amount: gain
          }
        ]
      });
      appendLog(state, player.name + ' Yaz Sıcağı bonusu aldı: +' + gain + '₺ nakit', 'income');
      state.phase = 'POST_ROLL';
      return;
    }

    if (card.kind === 'cash_loss' || card.kind === 'bank_loss') {
      var prefer = card.kind === 'cash_loss' ? 'cash' : 'bank';
      var paidLoss = chargePlayerOrEnterDebt(state, player, card.amount, 'bank', card.title, 'POST_ROLL', null, false, {
        preferAccount: prefer,
        icon: card.icon
      });
      if (paidLoss) {
        appendLog(state, player.name + ' ' + card.title + ': -' + card.amount + '₺', 'expense');
        state.phase = 'POST_ROLL';
      }
      return;
    }

    if (card.kind === 'cash_percent_loss') {
      var pctLoss = Math.min(card.maxAmount || 250, Math.max(40, BD.round5(player.cash * (card.rate || 0.15))));
      var paidPct = chargePlayerOrEnterDebt(state, player, pctLoss, 'bank', card.title, 'POST_ROLL', null, false, {
        preferAccount: 'cash',
        icon: card.icon
      });
      if (paidPct) {
        appendLog(state, player.name + ' bozuk para farkı ödedi: -' + pctLoss + '₺', 'expense');
        state.phase = 'POST_ROLL';
      }
      return;
    }

    if (card.kind === 'per_property_loss') {
      var count = getPlayerPropertyCount(state, player.id);
      var bill = Math.max(card.minAmount, count * card.perProperty);
      var paidBill = chargePlayerOrEnterDebt(state, player, bill, 'bank', card.title, 'POST_ROLL', null, false, {
        preferAccount: 'bank',
        icon: card.icon
      });
      if (paidBill) {
        appendLog(state, player.name + ' fatura ödedi: -' + bill + '₺', 'expense');
        state.phase = 'POST_ROLL';
      }
      return;
    }

    if (card.kind === 'collect_each') {
      var others = getActivePlayers(state).filter(function (p) {
        return p.id !== player.id;
      });
      var collected = 0;
      for (var j = 0; j < others.length; j++) {
        var other = others[j];
        var pay = Math.min(getPlayerTotalFunds(other), card.amount);
        if (pay > 0) {
          deductFunds(other, pay, 'cash');
          collected += pay;
        }
      }
      creditPlayer(player, collected, 'cash');
      recordTransaction(state, 'income', 'players', player.id, collected, card.title, card.icon, {
        account: 'cash',
        breakdown: [{ label: 'Diğer Oyunculardan Toplanan', amount: collected }]
      });
      appendLog(state, player.name + ' diğer oyunculardan toplam +' + collected + '₺ nakit topladı.', 'income');
      state.phase = 'POST_ROLL';
      return;
    }

    if (card.kind === 'pay_each') {
      var targets = getActivePlayers(state).filter(function (p) {
        return p.id !== player.id;
      });
      var totalPay = targets.length * card.amount;
      if (totalPay === 0) {
        state.phase = 'POST_ROLL';
        return;
      }
      if (getPlayerTotalFunds(player) >= totalPay) {
        var split = deductFunds(player, totalPay, 'cash');
        for (var k = 0; k < targets.length; k++) {
          creditPlayer(targets[k], card.amount, 'cash');
        }
        recordTransaction(state, 'payment', player.id, 'players', totalPay, card.title, card.icon, {
          account: 'cash',
          split: split
        });
        appendLog(state, player.name + ' herkese ' + card.amount + '₺ dağıttı (-' + totalPay + '₺).', 'expense');
        state.phase = 'POST_ROLL';
      } else {
        chargePlayerOrEnterDebt(state, player, totalPay, 'bank', card.title, 'POST_ROLL', null, false, {
          preferAccount: 'cash',
          icon: card.icon
        });
      }
      return;
    }

    if (card.kind === 'go_zabita') {
      sendToZabita(state, player, player.name + ' Zabıta Baskını kartıyla incelemeye gitti!');
      return;
    }

    if (card.kind === 'move_back') {
      var prevBack = player.pos;
      var newPos = (player.pos - card.steps + 40) % 40;
      player.pos = newPos;
      state.moveSeq = (state.moveSeq || 0) + 1;
      state.lastMove = {
        moveSeq: state.moveSeq,
        playerId: player.id,
        from: prevBack,
        to: newPos,
        path: [newPos],
        passedStart: false,
        dondurmaciHits: [],
        isTeleport: true
      };
      appendLog(state, player.name + ' ' + card.steps + ' kare geri gidip ' + BD.TILES[newPos].name + ' karesine indi.', 'event');
      resolveLanding(state, player, newPos, true);
      return;
    }

    if (card.kind === 'nearest_utility') {
      var utilityIndices = [5, 15, 25, 35];
      var dest = utilityIndices[0];
      var minSteps = 99;
      for (var u = 0; u < utilityIndices.length; u++) {
        var diff = (utilityIndices[u] - player.pos + 40) % 40;
        if (diff > 0 && diff < minSteps) {
          minSteps = diff;
          dest = utilityIndices[u];
        }
      }
      var prevUtil = player.pos;
      var crossedStart = player.pos + minSteps >= 40;
      player.pos = dest;
      state.moveSeq = (state.moveSeq || 0) + 1;
      var utilMove = {
        moveSeq: state.moveSeq,
        playerId: player.id,
        from: prevUtil,
        to: dest,
        path: [dest],
        passedStart: false,
        dondurmaciHits: [],
        isTeleport: true
      };
      state.lastMove = utilMove;
      if (crossedStart) {
        var crossRes = processStartCrossing(state, player, false, utilMove);
        if (crossRes.debtRequired > 0) {
          state.pendingDebt = {
            playerId: player.id,
            amount: crossRes.debtRequired,
            creditorId: 'bank',
            reason: 'Kredi Taksiti',
            isLoanInstallment: true,
            preferAccount: 'bank',
            resumePhase: 'POST_ROLL',
            resumeLandingTile: dest,
            resumeIsTeleport: true
          };
          state.phase = 'DEBT_RESOLUTION';
          return;
        }
      }
      appendLog(state, player.name + ' yeni metroyla ' + BD.TILES[dest].name + ' karesine ulaştı!', 'event');
      resolveLanding(state, player, dest, true);
    }
  }

  function advanceTurnToNextPlayer(state) {
    var count = state.players.length;
    if (count === 0) return;

    var prevPlayer = getCurrentPlayer(state);
    if (prevPlayer) {
      for (var i = 0; i < prevPlayer.loans.length; i++) {
        var loan = prevPlayer.loans[i];
        if (loan.justTakenThisTurn) {
          loan.justTakenThisTurn = false;
        } else if (loan.graceTurnsRemaining > 0) {
          loan.graceTurnsRemaining -= 1;
        }
      }
    }

    var nextIdx = state.turnIndex;
    for (var step = 1; step <= count; step++) {
      var candIdx = (state.turnIndex + step) % count;
      if (!state.players[candIdx].bankrupt) {
        nextIdx = candIdx;
        break;
      }
    }

    state.turnIndex = nextIdx;
    state.turnNumber += 1;
    state.doublesStreak = 0;
    state.canRollAgain = false;
    state.pendingTadilat = null;
    state.pendingDebt = null;
    state.lastMove = null;
    state.lastEventCard = null;

    var nextPlayer = state.players[nextIdx];
    var propKeys = getPlayerPropertyIndices(state, nextPlayer.id);
    for (var k = 0; k < propKeys.length; k++) {
      var own = state.ownership[propKeys[k]];
      if (own && own.closedTurnsRemaining > 0) {
        own.closedTurnsRemaining -= 1;
        if (own.closedTurnsRemaining === 0) {
          appendLog(state, BD.TILES[propKeys[k]].name + ' tadilattan çıktı ve tekrar açıldı!', 'info');
        }
      }
    }

    state.phase = nextPlayer.inInspection ? 'INSPECTION_CHOICE' : 'PRE_ROLL';
  }

  function checkWinner(state) {
    var active = getActivePlayers(state);
    if (active.length <= 1) {
      state.phase = 'GAME_OVER';
      state.winnerId = active.length === 1 ? active[0].id : null;
      if (active.length === 1) {
        appendLog(state, '🏆 ' + active[0].name + ' BARONIA unvanını kazandı ve oyunun galibi oldu!', 'system');
      }
      return true;
    }
    return false;
  }

  function settleAuction(state) {
    var auc = state.auction;
    if (!auc) return;

    var tile = BD.TILES[auc.tileIndex];
    var resumePhase = auc.resumePhase || 'POST_ROLL';

    if (!auc.highestBidderId || auc.currentBid <= 0) {
      appendLog(state, '🔨 ' + auc.tileName + ' ihalesine teklif gelmedi, satış iptal edildi.', 'info');
      state.auction = null;
      state.phase = resumePhase;
      return;
    }

    var winner = getPlayerById(state, auc.highestBidderId);
    if (!winner || winner.bankrupt || getPlayerTotalFunds(winner) < auc.currentBid) {
      appendLog(state, '🔨 ' + auc.tileName + ' ihalesi geçersiz kaldı.', 'alert');
      state.auction = null;
      state.phase = resumePhase;
      return;
    }

    var split = deductFunds(winner, auc.currentBid, 'bank');
    if (auc.sellerId && auc.sellerId !== 'bank') {
      var seller = getPlayerById(state, auc.sellerId);
      if (seller && !seller.bankrupt) {
        creditPlayer(seller, auc.currentBid, 'bank');
      }
    }

    var existingOwn = state.ownership[auc.tileIndex];
    if (existingOwn) {
      existingOwn.ownerId = winner.id;
      existingOwn.costPaid = auc.currentBid;
      existingOwn.closedTurnsRemaining = 0;
    } else {
      state.ownership[auc.tileIndex] = {
        ownerId: winner.id,
        type: tile.type,
        shopType: null,
        costPaid: auc.currentBid,
        closedTurnsRemaining: 0
      };
    }

    recordTransaction(
      state,
      'payment',
      winner.id,
      auc.sellerId || 'bank',
      auc.currentBid,
      '🔨 Açık Artırma: ' + auc.tileName,
      '🔨',
      { account: 'bank', split: split }
    );
    appendLog(state, '🔨 ' + winner.name + ', ' + auc.tileName + ' mülkünü ' + auc.currentBid + '₺ teklifle kazandı!', 'buy');

    state.auction = null;
    state.phase = resumePhase;
  }

  function dispatchAction(rawState, playerId, action) {
    if (!rawState || !action || !action.type) {
      return { state: rawState, error: 'Geçersiz hamle.' };
    }

    var state = cloneState(rawState);
    state.lastTransactions = [];
    if (state.phase === 'GAME_OVER') {
      return { state: state, error: 'Oyun sona erdi.' };
    }

    var type = action.type;

    // Auction bidding actions route to the active bidder (not necessarily turnIndex)
    if (state.phase === 'AUCTION') {
      var auc = state.auction;
      if (!auc) {
        state.phase = 'POST_ROLL';
        return { state: state };
      }
      var activeBidderId = auc.activeBidderIds[auc.currentBidderIndex];
      if (playerId !== activeBidderId) {
        return { state: state, error: 'Şu an ihale sırası sende değil.' };
      }

      var bidder = getPlayerById(state, playerId);
      if (type === 'AUCTION_BID') {
        var bidAmount = Math.round(Number(action.amount) || 0);
        var minReq = auc.currentBid > 0 ? auc.currentBid + auc.minIncrement : auc.startingBid;
        if (bidAmount < minReq) {
          return { state: state, error: 'Minimum teklif ' + minReq + '₺ olmalı.' };
        }
        if (!bidder || getPlayerTotalFunds(bidder) < bidAmount) {
          return { state: state, error: 'Toplam bakiyen (Nakit + Banka) bu teklif için yetersiz.' };
        }

        auc.currentBid = bidAmount;
        auc.highestBidderId = bidder.id;
        auc.history.unshift({ playerId: bidder.id, name: bidder.name, amount: bidAmount });
        appendLog(state, '🔨 ' + bidder.name + ' → ' + auc.tileName + ' için ' + bidAmount + '₺ teklif verdi!', 'buy');

        if (auc.activeBidderIds.length <= 1) {
          settleAuction(state);
        } else {
          auc.currentBidderIndex = (auc.currentBidderIndex + 1) % auc.activeBidderIds.length;
        }
        return { state: state };
      }

      if (type === 'AUCTION_PASS') {
        auc.passedIds.push(playerId);
        auc.activeBidderIds.splice(auc.currentBidderIndex, 1);
        appendLog(state, '🔨 ' + (bidder ? bidder.name : 'Oyuncu') + ' ihaleden çekildi.', 'info');

        if (
          auc.activeBidderIds.length === 0 ||
          (auc.activeBidderIds.length === 1 && auc.highestBidderId === auc.activeBidderIds[0])
        ) {
          settleAuction(state);
        } else {
          if (auc.currentBidderIndex >= auc.activeBidderIds.length) {
            auc.currentBidderIndex = 0;
          }
        }
        return { state: state };
      }

      return { state: state, error: 'Önce açık artırmayı tamamlamalısın.' };
    }

    var current = getCurrentPlayer(state);
    if (!current || current.id !== playerId) {
      return { state: state, error: 'Şu an sıra sende değil.' };
    }

    // Banking Transfers (allowed anytime on your turn)
    if (type === 'DEPOSIT_BANK') {
      var depAmt = Math.round(Number(action.amount) || 0);
      if (depAmt <= 0 || current.cash < depAmt) {
        return { state: state, error: 'Bankaya yatırmak için yeterli nakdin yok.' };
      }
      current.cash -= depAmt;
      current.bank += depAmt;
      appendLog(state, current.name + ' banka hesabına ' + depAmt + '₺ nakit yatırdı.', 'info');
      return { state: state };
    }

    if (type === 'WITHDRAW_BANK') {
      var wdAmt = Math.round(Number(action.amount) || 0);
      if (wdAmt <= 0 || current.bank < wdAmt) {
        return { state: state, error: 'Banka hesabında bu kadar bakiye yok.' };
      }
      current.bank -= wdAmt;
      current.cash += wdAmt;
      appendLog(state, current.name + ' banka hesabından ' + wdAmt + '₺ nakit çekti.', 'info');
      return { state: state };
    }

    if (type === 'START_AUCTION') {
      if (state.phase !== 'PRE_ROLL' && state.phase !== 'POST_ROLL') {
        return { state: state, error: 'Açık artırma sadece tur başında veya sonunda başlatılabilir.' };
      }
      var aucTileIdx = Number(action.tileIndex);
      var aucTile = BD.TILES[aucTileIdx];
      if (!aucTile) return { state: state, error: 'Geçersiz mülk.' };

      var isBankAuction = Boolean(action.isBankAuction);
      var own = state.ownership[aucTileIdx];
      var others = getActivePlayers(state).filter(function (p) {
        return p.id !== current.id;
      });

      if (isBankAuction) {
        return { state: state, error: 'Sadece sahip olduğun mülkleri ihaleye çıkarabilirsin.' };
      }

      if (!own || own.ownerId !== current.id) {
        return { state: state, error: 'İhaleye çıkarmak için bu mülkün sahibi olmalısın.' };
      }
      if (others.length === 0) {
        return { state: state, error: 'Teklif verecek başka oyuncu yok.' };
      }
      var ownStartBid = Math.max(50, BD.round5((own.costPaid || 100) * 0.5));
      state.auction = {
        id: 'auc-' + state.turnNumber + '-' + aucTileIdx,
        tileIndex: aucTileIdx,
        tileName: aucTile.name,
        sellerId: current.id,
        isBankAuction: false,
        startingBid: ownStartBid,
        currentBid: 0,
        highestBidderId: null,
        minIncrement: 50,
        activeBidderIds: others.map(function (p) {
          return p.id;
        }),
        currentBidderIndex: 0,
        passedIds: [],
        resumePhase: state.phase,
        history: []
      };
      state.phase = 'AUCTION';
      appendLog(state, '🔨 ' + current.name + ', ' + aucTile.name + ' mülkünü açık artırmaya çıkardı! (Başlangıç: ' + ownStartBid + '₺)', 'event');
      return { state: state };
    }

    if (type === 'TAKE_LOAN') {
      var offers = getAvailableLoanOffers(state, playerId);
      var chosen = null;
      for (var i = 0; i < offers.length; i++) {
        if (offers[i].id === action.packageId) {
          chosen = offers[i];
          break;
        }
      }
      if (!chosen) return { state: state, error: 'Kredi paketi bulunamadı.' };
      if (!chosen.eligible) return { state: state, error: chosen.reason || 'Bu kredi şu an çekilemez.' };

      current.loans.push({
        id: 'loan-' + state.turnNumber + '-' + (current.loansTakenCount + 1),
        packageId: chosen.id,
        name: chosen.name,
        principal: chosen.principal,
        totalRepay: chosen.totalRepay,
        installmentAmount: chosen.installmentAmount,
        remainingInstallments: chosen.installments,
        remainingAmount: chosen.totalRepay,
        graceTurnsRemaining: BD.LOAN_GRACE_TURNS,
        justTakenThisTurn: true,
        isZeroInterest: chosen.isZeroInterest
      });
      current.loansTakenCount += 1;
      creditPlayer(current, chosen.principal, 'bank');
      recordTransaction(state, 'income', 'bank', current.id, chosen.principal, chosen.name + ' Onaylandı', '🏦', {
        account: 'bank',
        breakdown: [{ label: chosen.name + (chosen.isZeroInterest ? ' (%0 Faiz!)' : ''), amount: chosen.principal }]
      });
      appendLog(
        state,
        current.name +
          ' ' +
          chosen.name +
          ' çekti: +' +
          chosen.principal +
          '₺ Bankaya' +
          (chosen.isZeroInterest ? ' (%0 Faiz! 3 tur ödemesiz)' : ' (3 tur ödemesiz)'),
        'income'
      );
      return { state: state };
    }

    if (type === 'REPAY_LOAN') {
      var loanIdx = -1;
      for (var l = 0; l < current.loans.length; l++) {
        if (current.loans[l].id === action.loanId) {
          loanIdx = l;
          break;
        }
      }
      if (loanIdx === -1) return { state: state, error: 'Kredi bulunamadı.' };
      var targetLoan = current.loans[loanIdx];
      if (getPlayerTotalFunds(current) < targetLoan.remainingAmount) {
        return { state: state, error: 'Krediyi kapatmak için toplam bakiyen yetersiz.' };
      }
      var repaySplit = deductFunds(current, targetLoan.remainingAmount, 'bank');
      recordTransaction(state, 'payment', current.id, 'bank', targetLoan.remainingAmount, targetLoan.name + ' Erken Kapama', '🏦', {
        account: 'bank',
        split: repaySplit
      });
      appendLog(
        state,
        current.name + ' ' + targetLoan.name + ' borcunu erken kapattı (-' + targetLoan.remainingAmount + '₺).',
        'expense'
      );
      current.loans.splice(loanIdx, 1);
      return { state: state };
    }

    if (type === 'SELL_PROPERTY') {
      var sellIdx = Number(action.tileIndex);
      var sellOwn = state.ownership[sellIdx];
      if (!sellOwn || sellOwn.ownerId !== current.id) {
        return { state: state, error: 'Bu mülk sana ait değil.' };
      }
      var refund = BD.round5((sellOwn.costPaid || 0) * BD.SALE_REFUND_RATE);
      creditPlayer(current, refund, 'bank');
      delete state.ownership[sellIdx];
      recordTransaction(state, 'income', 'bank', current.id, refund, BD.TILES[sellIdx].name + ' Satışı', '🏢', {
        account: 'bank',
        breakdown: [{ label: BD.TILES[sellIdx].name + ' (%60 Banka Satışı)', amount: refund }]
      });
      appendLog(state, current.name + ' ' + BD.TILES[sellIdx].name + ' mülkünü bankaya sattı (+' + refund + '₺ Banka).', 'income');
      return { state: state };
    }

    if (type === 'INSPECTION_PAY') {
      if (state.phase !== 'INSPECTION_CHOICE') {
        return { state: state, error: 'Zabıta seçim aşamasında değilsin.' };
      }
      if (getPlayerTotalFunds(current) < BD.INSPECTION_FINE) {
        return { state: state, error: 'Ceza ödemek için ' + BD.INSPECTION_FINE + '₺ gerekiyor.' };
      }
      var fineSplit = deductFunds(current, BD.INSPECTION_FINE, 'bank');
      current.inInspection = false;
      state.phase = 'PRE_ROLL';
      recordTransaction(state, 'payment', current.id, 'bank', BD.INSPECTION_FINE, 'Zabıta İdari Cezası', '🚨', {
        account: 'bank',
        split: fineSplit
      });
      appendLog(state, current.name + ' ' + BD.INSPECTION_FINE + '₺ ceza ödeyip Zabıta İncelemesinden çıktı!', 'expense');
      return { state: state };
    }

    if (type === 'INSPECTION_WAIT') {
      if (state.phase !== 'INSPECTION_CHOICE') {
        return { state: state, error: 'Zabıta seçim aşamasında değilsin.' };
      }
      current.inInspection = false;
      current.stats.turnsTaken += 1;
      appendLog(state, current.name + ' Zabıta İncelemesinde 1 tur bekledi ve sıradaki tura hazır.', 'info');
      advanceTurnToNextPlayer(state);
      return { state: state };
    }

    if (type === 'ROLL_DICE') {
      if (state.phase !== 'PRE_ROLL') {
        return { state: state, error: 'Şu an zar atamazsın.' };
      }
      var forced = action.forcedDice;
      var d = 1;
      if (Array.isArray(forced) && forced.length > 0) {
        d = Math.max(1, Math.min(6, Number(forced[0]) || 1));
      } else if (typeof forced === 'number') {
        d = Math.max(1, Math.min(6, forced));
      } else {
        d = 1 + Math.floor(Math.random() * 6);
      }

      state.lastDie = d;
      state.lastDice = [d];
      state.lastDiceTotal = d;
      state.doublesStreak = 0;
      state.canRollAgain = false;
      state.lastEventCard = null;
      current.stats.turnsTaken += 1;

      var fromPos = current.pos;
      var path = [];
      for (var s = 1; s <= d; s++) {
        path.push((fromPos + s) % 40);
      }
      var destPos = path[path.length - 1];
      current.pos = destPos;

      state.moveSeq = (state.moveSeq || 0) + 1;
      var moveRecord = {
        moveSeq: state.moveSeq,
        playerId: current.id,
        from: fromPos,
        to: destPos,
        path: path,
        passedStart: false,
        startGain: 0,
        loanPaid: 0,
        dondurmaciHits: []
      };
      state.lastMove = moveRecord;

      appendLog(state, current.name + ' zar attı: ' + d, 'dice');

      var dondurmaciDebt = null;
      var loanDebtDue = 0;

      for (var pIdx = 0; pIdx < path.length; pIdx++) {
        var stepTile = path[pIdx];
        var isFinalStep = pIdx === path.length - 1;

        if (stepTile === 0) {
          var crossInfo = processStartCrossing(state, current, isFinalStep, moveRecord);
          if (crossInfo.debtRequired > 0) {
            loanDebtDue += crossInfo.debtRequired;
          }
        }

        if (!isFinalStep) {
          var stepOwn = state.ownership[stepTile];
          if (
            stepOwn &&
            stepOwn.type === 'plot' &&
            stepOwn.shopType === 'dondurmaci' &&
            stepOwn.ownerId !== current.id &&
            stepOwn.closedTurnsRemaining <= 0
          ) {
            var dondOwner = getPlayerById(state, stepOwn.ownerId);
            if (dondOwner && !dondOwner.bankrupt) {
              var dondEff = getTileEffectiveNumbers(state, stepTile);
              var passFee = dondEff ? dondEff.passFee : 0;
              if (passFee > 0) {
                if (getPlayerTotalFunds(current) >= passFee) {
                  var dSplit = deductFunds(current, passFee, 'cash');
                  creditPlayer(dondOwner, passFee, 'cash');
                  recordTransaction(state, 'payment', current.id, dondOwner.id, passFee, BD.TILES[stepTile].name + ' Dondurmacı Geçişi', '🍦', {
                    account: 'cash',
                    split: dSplit
                  });
                  moveRecord.dondurmaciHits.push({
                    tileIndex: stepTile,
                    ownerId: dondOwner.id,
                    ownerName: dondOwner.name,
                    amount: passFee
                  });
                  appendLog(
                    state,
                    '🍦 ' + current.name + ', ' + BD.TILES[stepTile].name + ' önünden geçerken ' + dondOwner.name + ' kasasına ' + passFee + '₺ ödedi.',
                    'expense'
                  );
                } else {
                  dondurmaciDebt = {
                    amount: passFee,
                    creditorId: dondOwner.id,
                    reason: BD.TILES[stepTile].name + ' Dondurmacı geçiş ücreti'
                  };
                }
              }
            }
          }
        }
      }

      if (loanDebtDue > 0) {
        state.pendingDebt = {
          playerId: current.id,
          amount: loanDebtDue,
          creditorId: 'bank',
          reason: 'Başlangıç geçişi kredi taksiti',
          isLoanInstallment: true,
          preferAccount: 'bank',
          resumePhase: 'POST_ROLL',
          resumeLandingTile: destPos,
          resumeIsTeleport: false
        };
        state.phase = 'DEBT_RESOLUTION';
        appendLog(state, current.name + ' kredi taksiti (' + loanDebtDue + '₺) için nakit bulmalı!', 'alert');
        return { state: state };
      }

      if (dondurmaciDebt) {
        state.pendingDebt = {
          playerId: current.id,
          amount: dondurmaciDebt.amount,
          creditorId: dondurmaciDebt.creditorId,
          reason: dondurmaciDebt.reason,
          preferAccount: 'cash',
          receiveAccount: 'cash',
          resumePhase: 'POST_ROLL',
          resumeLandingTile: destPos,
          resumeIsTeleport: false
        };
        state.phase = 'DEBT_RESOLUTION';
        return { state: state };
      }

      resolveLanding(state, current, destPos, false);
      return { state: state };
    }

    if (type === 'DRAW_EVENT_CARD') {
      if (state.phase !== 'DRAW_EVENT_CARD') {
        return { state: state, error: 'Şu an olay kartı çekme aşamasında değilsin.' };
      }
      var cardIdx = typeof action.forcedCardIndex === 'number'
        ? Math.abs(action.forcedCardIndex) % BD.EVENT_CARDS.length
        : Math.floor(Math.random() * BD.EVENT_CARDS.length);
      var card = BD.EVENT_CARDS[cardIdx];
      state.cardSeq = (state.cardSeq || 0) + 1;
      state.lastEventCard = {
        cardSeq: state.cardSeq,
        id: card.id,
        title: card.title,
        icon: card.icon,
        targetAccount: card.targetAccount || 'cash',
        description: card.description,
        playerId: current.id
      };
      appendLog(state, current.name + ' Olay kartı çekti: "' + card.title + '"', 'event');
      applyEventCard(state, current, card);
      return { state: state };
    }

    if (type === 'BUY_SHOP') {
      if (state.phase !== 'BUY_PLOT') {
        return { state: state, error: 'Şu an dükkan kurma aşamasında değilsin.' };
      }
      var plotTile = BD.TILES[current.pos];
      if (!plotTile || plotTile.type !== 'plot' || state.ownership[current.pos]) {
        return { state: state, error: 'Bu arsaya dükkan kurulamaz.' };
      }
      var shopMeta = BD.SHOP_TYPES[action.shopType];
      if (!shopMeta) {
        return { state: state, error: 'Geçersiz işletme türü.' };
      }
      var stats = BD.getShopStats(action.shopType, plotTile.neighborhoodId);
      if (getPlayerTotalFunds(current) < stats.cost) {
        return { state: state, error: shopMeta.name + ' kurmak için ' + stats.cost + '₺ gerekli.' };
      }

      var shopSplit = deductFunds(current, stats.cost, 'bank');
      state.ownership[current.pos] = {
        ownerId: current.id,
        type: 'plot',
        shopType: action.shopType,
        level: 1,
        costPaid: stats.cost,
        closedTurnsRemaining: 0
      };
      state.phase = 'POST_ROLL';
      recordTransaction(state, 'payment', current.id, 'bank', stats.cost, plotTile.name + ' — ' + shopMeta.name + ' İnşaatı', shopMeta.icon, {
        account: 'bank',
        split: shopSplit
      });
      appendLog(
        state,
        current.name + ', ' + plotTile.name + ' arsasına ' + shopMeta.icon + ' ' + shopMeta.name + ' açtı (-' + stats.cost + '₺).',
        'buy'
      );
      return { state: state };
    }

    if (type === 'BUY_SPECIAL') {
      if (state.phase !== 'BUY_SPECIAL') {
        return { state: state, error: 'Şu an satın alma aşamasında değilsin.' };
      }
      var specTile = BD.TILES[current.pos];
      if (!specTile || (specTile.type !== 'landmark' && specTile.type !== 'utility') || state.ownership[current.pos]) {
        return { state: state, error: 'Bu mülk satın alınamaz.' };
      }
      if (getPlayerTotalFunds(current) < specTile.cost) {
        return { state: state, error: 'Bu mülk için ' + specTile.cost + '₺ gerekli.' };
      }
      var specSplit = deductFunds(current, specTile.cost, 'bank');
      state.ownership[current.pos] = {
        ownerId: current.id,
        type: specTile.type,
        shopType: null,
        costPaid: specTile.cost,
        closedTurnsRemaining: 0
      };
      state.phase = 'POST_ROLL';
      recordTransaction(state, 'payment', current.id, 'bank', specTile.cost, specTile.name + ' Satın Alımı', specTile.icon, {
        account: 'bank',
        split: specSplit
      });
      appendLog(state, current.name + ', ' + specTile.name + ' mülkünü satın aldı (-' + specTile.cost + '₺).', 'buy');
      return { state: state };
    }

    if (type === 'SKIP_BUY') {
      if (state.phase !== 'BUY_PLOT' && state.phase !== 'BUY_SPECIAL') {
        return { state: state, error: 'Satın alma aşamasında değilsin.' };
      }
      state.phase = 'POST_ROLL';
      appendLog(state, current.name + ' ' + BD.TILES[current.pos].name + ' alımını pas geçti.', 'info');
      return { state: state };
    }

    if (type === 'CHOOSE_TELEPORT') {
      if (state.phase !== 'CHOOSE_TELEPORT') {
        return { state: state, error: 'Toptancı taşıma aşamasında değilsin.' };
      }
      var targetIdx = Number(action.targetTileIndex);
      var targetTile = BD.TILES[targetIdx];
      if (!targetTile || targetIdx === 0 || targetIdx === current.pos || targetTile.type === 'toptanci') {
        return { state: state, error: 'Başlangıç veya Toptancı karesi dışındaki başka bir kare seçmelisin.' };
      }
      var prev = current.pos;
      current.pos = targetIdx;
      state.moveSeq = (state.moveSeq || 0) + 1;
      state.lastMove = {
        moveSeq: state.moveSeq,
        playerId: current.id,
        from: prev,
        to: targetIdx,
        path: [targetIdx],
        passedStart: false,
        dondurmaciHits: [],
        isTeleport: true
      };
      appendLog(state, '📦 ' + current.name + ' Toptancı Fırsatıyla ' + targetTile.name + ' karesine ışınlandı!', 'event');
      resolveLanding(state, current, targetIdx, true);
      return { state: state };
    }

    if (type === 'TADILAT_PAY') {
      if (state.phase !== 'TADILAT_CHOICE' || !state.pendingTadilat) {
        return { state: state, error: 'Tadilat aşamasında değilsin.' };
      }
      var repairCost = state.pendingTadilat.repairCost;
      var tName = state.pendingTadilat.tileName;
      state.pendingTadilat = null;
      var paidTadilat = chargePlayerOrEnterDebt(state, current, repairCost, 'bank', tName + ' tadilat bakımı', 'POST_ROLL', null, false, {
        preferAccount: 'bank',
        icon: '🛠️'
      });
      if (paidTadilat) {
        appendLog(state, current.name + ' ' + tName + ' için ' + repairCost + '₺ ödeyerek dükkanı açık tuttu.', 'expense');
        state.phase = 'POST_ROLL';
      }
      return { state: state };
    }

    if (type === 'TADILAT_CLOSE') {
      if (state.phase !== 'TADILAT_CHOICE' || !state.pendingTadilat) {
        return { state: state, error: 'Tadilat aşamasında değilsin.' };
      }
      var closeIdx = state.pendingTadilat.tileIndex;
      var closedName = state.pendingTadilat.tileName;
      if (state.ownership[closeIdx]) {
        state.ownership[closeIdx].closedTurnsRemaining = 1;
      }
      state.pendingTadilat = null;
      state.phase = 'POST_ROLL';
      appendLog(state, '🚧 ' + closedName + ' zorunlu tadilat nedeniyle 1 tur kapatıldı.', 'alert');
      return { state: state };
    }

    if (type === 'PAY_PENDING_DEBT') {
      if (state.phase !== 'DEBT_RESOLUTION' || !state.pendingDebt) {
        return { state: state, error: 'Ödenecek bekleyen borç yok.' };
      }
      var debt = state.pendingDebt;
      if (getPlayerTotalFunds(current) < debt.amount) {
        return { state: state, error: 'Borcu ödemek için toplam ' + debt.amount + '₺ bakiyen olmalı (Mülk satabilir veya kredi çekebilirsin).' };
      }
      var debtSplit = deductFunds(current, debt.amount, debt.preferAccount || 'bank');
      if (debt.creditorId && debt.creditorId !== 'bank') {
        var cred = getPlayerById(state, debt.creditorId);
        if (cred && !cred.bankrupt) {
          creditPlayer(cred, debt.amount, debt.receiveAccount || 'cash');
        }
      }
      if (debt.isLoanInstallment) {
        applyLoanDeductionAfterDebt(current);
      }
      recordTransaction(state, 'payment', current.id, debt.creditorId || 'bank', debt.amount, debt.reason, '💳', {
        account: debt.preferAccount || 'bank',
        split: debtSplit
      });
      appendLog(state, current.name + ' bekleyen borcunu ödedi: -' + debt.amount + '₺ (' + debt.reason + ')', 'expense');
      var resumeTile = debt.resumeLandingTile;
      var resumeTeleport = debt.resumeIsTeleport;
      var resumePhase = debt.resumePhase || 'POST_ROLL';
      state.pendingDebt = null;

      if (typeof resumeTile === 'number') {
        resolveLanding(state, current, resumeTile, resumeTeleport);
      } else {
        state.phase = resumePhase;
      }
      return { state: state };
    }

    if (type === 'DECLARE_BANKRUPTCY') {
      if (state.phase !== 'DEBT_RESOLUTION' || !state.pendingDebt) {
        return { state: state, error: 'İflas sadece ödenemeyen borç durumunda ilan edilir.' };
      }
      var bDebt = state.pendingDebt;
      var owned = getPlayerPropertyIndices(state, current.id);
      var liquidation = Math.max(0, getPlayerTotalFunds(current));
      for (var m = 0; m < owned.length; m++) {
        var pIdx = owned[m];
        liquidation += BD.round5((state.ownership[pIdx].costPaid || 0) * BD.SALE_REFUND_RATE);
        delete state.ownership[pIdx];
      }
      if (bDebt.creditorId && bDebt.creditorId !== 'bank') {
        var bCred = getPlayerById(state, bDebt.creditorId);
        if (bCred && !bCred.bankrupt && liquidation > 0) {
          creditPlayer(bCred, liquidation, 'bank');
        }
      }
      current.cash = 0;
      current.bank = 0;
      current.loans = [];
      current.bankrupt = true;
      state.pendingDebt = null;
      state.canRollAgain = false;
      appendLog(state, '💥 ' + current.name + ' iflas etti ve oyundan elendi!', 'alert');

      if (!checkWinner(state)) {
        advanceTurnToNextPlayer(state);
      }
      return { state: state };
    }

    if (type === 'UPGRADE_SHOP') {
      var upgIdx = typeof action.tileIndex === 'number' ? Number(action.tileIndex) : current.pos;
      var info = getUpgradeInfo(state, current.id, upgIdx);
      if (!info) {
        return { state: state, error: 'Bu mülk sana ait değil veya yükseltilemez.' };
      }
      if (!info.canUpgrade) {
        return { state: state, error: info.reason || 'Bu bina şu an yükseltilemez.' };
      }
      if (getPlayerTotalFunds(current) < info.cost) {
        return { state: state, error: 'Yükseltme için ' + info.cost + '₺ gerekli.' };
      }

      var upgOwn = state.ownership[upgIdx];
      var upgTile = BD.TILES[upgIdx];
      var upgSplit = deductFunds(current, info.cost, 'bank');
      upgOwn.level = info.nextLevel;
      // Add only base 1x upgrade cost to costPaid so remote 2.5x does not inflate %60 resale value
      upgOwn.costPaid = (upgOwn.costPaid || 0) + info.baseUpgradeCost;

      var upgTitle =
        upgTile.name +
        ' → ' +
        info.nextTier.name +
        ' (Sv.' +
        info.nextLevel +
        ' • ' +
        (info.isOnSite ? '1x Yerinde' : '2.5x Uzaktan') +
        ')';
      recordTransaction(state, 'payment', current.id, 'bank', info.cost, upgTitle, info.nextTier.icon, {
        account: 'bank',
        split: upgSplit
      });
      appendLog(
        state,
        '⬆️ ' + current.name + ', ' + upgTile.name + ' mülkünü ' + info.nextTier.icon + ' ' + info.nextTier.name + ' (Sv.' + info.nextLevel + ') seviyesine yükseltti (-' + info.cost + '₺).',
        'buy'
      );
      return { state: state };
    }

    if (type === 'RESOLVE_HUB') {
      if (state.phase !== 'HUB_ACTION' || !state.pendingHub) {
        return { state: state, error: 'Şu an merkez aksiyonu aşamasında değilsin.' };
      }
      var hub = state.pendingHub;
      var hubTile = BD.TILES[hub.tileIndex];

      if (hub.kind === 'taksi') {
        if (hub.isOwner && action.choice === 'skip') {
          state.pendingHub = null;
          state.phase = 'POST_ROLL';
          appendLog(state, current.name + ' Taksi Durağında kalmayı seçti.', 'info');
          return { state: state };
        }

        var forcedTaxi = action.forcedDice;
        var td = 1;
        if (Array.isArray(forcedTaxi) && forcedTaxi.length > 0) {
          td = Math.max(1, Math.min(6, Number(forcedTaxi[0]) || 1));
        } else if (typeof forcedTaxi === 'number') {
          td = Math.max(1, Math.min(6, forcedTaxi));
        } else {
          td = 1 + Math.floor(Math.random() * 6);
        }

        state.lastDie = td;
        state.lastDice = [td];
        state.lastDiceTotal = td;

        var taxiFrom = current.pos;
        var taxiPath = [];
        for (var ts = 1; ts <= td; ts++) {
          taxiPath.push((taxiFrom + ts) % 40);
        }
        var taxiDest = taxiPath[taxiPath.length - 1];
        current.pos = taxiDest;
        state.moveSeq = (state.moveSeq || 0) + 1;
        state.lastMove = {
          moveSeq: state.moveSeq,
          playerId: current.id,
          from: taxiFrom,
          to: taxiDest,
          path: taxiPath,
          passedStart: false,
          startGain: 0,
          loanPaid: 0,
          dondurmaciHits: [],
          isTeleport: false
        };
        state.pendingHub = null;

        if (!hub.isOwner) {
          var taxiHubCount = getOwnedCountByType(state, hub.ownerId, 'utility');
          var fare = (hubTile.baseFee || 50) + td * (hubTile.perDieFee || 35) + Math.max(0, taxiHubCount - 1) * 25;
          var taxiOwner = getPlayerById(state, hub.ownerId);
          var paidFare = chargePlayerOrEnterDebt(
            state,
            current,
            fare,
            hub.ownerId,
            '🚕 Taksi Durağı (Zar ' + td + ')',
            'POST_ROLL',
            taxiDest,
            false,
            { preferAccount: 'cash', receiveAccount: 'cash', icon: '🚕' }
          );
          if (paidFare) {
            appendLog(
              state,
              '🚕 ' +
                current.name +
                ', ' +
                (taxiOwner ? taxiOwner.name : 'rakip') +
                ' taksisine ' +
                fare +
                '₺ ödeyip zar ' +
                td +
                ' ile ' +
                BD.TILES[taxiDest].name +
                ' karesine gitti!',
              'expense'
            );
            resolveLanding(state, current, taxiDest, false);
          }
        } else {
          appendLog(
            state,
            '🚕 ' + current.name + ' kendi taksisiyle zar ' + td + ' atarak ücretsiz ' + BD.TILES[taxiDest].name + ' karesine gitti!',
            'event'
          );
          resolveLanding(state, current, taxiDest, false);
        }
        return { state: state };
      }

      if (hub.kind === 'borsa') {
        var forcedBorsa = action.forcedDice;
        var bdRoll = 1;
        if (Array.isArray(forcedBorsa) && forcedBorsa.length > 0) {
          bdRoll = Math.max(1, Math.min(6, Number(forcedBorsa[0]) || 1));
        } else if (typeof forcedBorsa === 'number') {
          bdRoll = Math.max(1, Math.min(6, forcedBorsa));
        } else {
          bdRoll = 1 + Math.floor(Math.random() * 6);
        }

        state.lastDie = bdRoll;
        state.lastDice = [bdRoll];
        state.lastDiceTotal = bdRoll;
        state.pendingHub = null;

        var borsaHubCount = getOwnedCountByType(state, hub.ownerId, 'utility');
        var commission = (hubTile.baseFee || 130) + Math.max(0, borsaHubCount - 1) * 30;
        var extraLoss = bdRoll <= 2 ? 90 : 0;
        var bullGain = bdRoll >= 5 ? 180 : 0;

        if (bullGain > 0) {
          creditPlayer(current, bullGain, 'bank');
          recordTransaction(state, 'income', 'bank', current.id, bullGain, '📈 Boğa Piyasası Kârı (Zar ' + bdRoll + ')', '📡', {
            account: 'bank',
            breakdown: [{ label: 'Borsa Ralli Kazancı (Zar ' + bdRoll + ')', amount: bullGain }]
          });
        }

        var totalBorsaCharge = commission + extraLoss;
        var borsaOwner = getPlayerById(state, hub.ownerId);
        var paidBorsa = chargePlayerOrEnterDebt(
          state,
          current,
          totalBorsaCharge,
          hub.ownerId,
          '📡 Borsa Ofisi (Zar ' + bdRoll + (extraLoss > 0 ? ' • Ayı Piyasası' : '') + ')',
          'POST_ROLL',
          null,
          false,
          { preferAccount: 'bank', receiveAccount: 'cash', icon: '📡' }
        );
        if (paidBorsa) {
          appendLog(
            state,
            '📡 ' +
              current.name +
              ' Borsa Ofisinde ' +
              bdRoll +
              ' attı: ' +
              (borsaOwner ? borsaOwner.name : 'rakibe') +
              ' -' +
              totalBorsaCharge +
              '₺' +
              (bullGain > 0 ? ' (Boğa kazancı +' + bullGain + '₺!)' : ''),
            bullGain > 0 ? 'income' : 'expense'
          );
          state.phase = 'POST_ROLL';
        }
        return { state: state };
      }

      if (hub.kind === 'heliport') {
        state.pendingHub = null;
        if (action.choice === 'fly') {
          state.phase = 'CHOOSE_TELEPORT';
          appendLog(state, '🚁 ' + current.name + ' Boğaz Heliportundan VIP uçuş başlattı!', 'event');
        } else {
          state.phase = 'POST_ROLL';
          appendLog(state, current.name + ' Boğaz Heliportunda kalmayı seçti.', 'info');
        }
        return { state: state };
      }

      state.pendingHub = null;
      state.phase = 'POST_ROLL';
      return { state: state };
    }

    if (type === 'END_TURN') {
      if (state.phase !== 'POST_ROLL') {
        return { state: state, error: 'Turu bitirmek için önce mevcut seçimi tamamlamalısın.' };
      }
      advanceTurnToNextPlayer(state);
      return { state: state };
    }

    return { state: state, error: 'Bilinmeyen işlem: ' + type };
  }

  function chooseBotAction(state) {
    if (!state || state.phase === 'GAME_OVER') return null;

    var phase = state.phase;

    if (phase === 'AUCTION' && state.auction) {
      var bidder = getActiveDecisionPlayer(state);
      if (!bidder || !bidder.isBot) return null;
      var auc = state.auction;
      var minReq = auc.currentBid > 0 ? auc.currentBid + auc.minIncrement : auc.startingBid;
      var tile = BD.TILES[auc.tileIndex];
      var baseVal = tile && tile.cost ? tile.cost : auc.startingBid * 2;
      var ceiling = BD.round5(baseVal * 1.15);
      var funds = getPlayerTotalFunds(bidder);
      if (funds >= minReq + 300 && minReq <= ceiling) {
        return { type: 'AUCTION_BID', amount: minReq };
      }
      return { type: 'AUCTION_PASS' };
    }

    var player = getCurrentPlayer(state);
    if (!player || !player.isBot) return null;
    var totalFunds = getPlayerTotalFunds(player);

    if (phase === 'INSPECTION_CHOICE') {
      if (totalFunds >= 600) {
        return { type: 'INSPECTION_PAY' };
      }
      return { type: 'INSPECTION_WAIT' };
    }

    if (phase === 'PRE_ROLL') {
      return { type: 'ROLL_DICE' };
    }

    if (phase === 'DRAW_EVENT_CARD') {
      return { type: 'DRAW_EVENT_CARD' };
    }

    if (phase === 'BUY_PLOT') {
      var plotTile = BD.TILES[player.pos];
      var hood = BD.NEIGHBORHOODS[plotTile.neighborhoodId];
      var ownedInHood = 0;
      var hasKafe = false;
      for (var i = 0; i < hood.plotIndices.length; i++) {
        var o = state.ownership[hood.plotIndices[i]];
        if (o && o.ownerId === player.id) {
          ownedInHood++;
          if (o.shopType === 'kafe') hasKafe = true;
        }
      }

      var candidates = ['magaza', 'kafe', 'market', 'dondurmaci'];
      var chosenShop = null;
      if (ownedInHood >= 1 && !hasKafe && totalFunds >= BD.getShopStats('kafe', plotTile.neighborhoodId).cost + 150) {
        chosenShop = 'kafe';
      } else {
        for (var c = 0; c < candidates.length; c++) {
          var st = BD.getShopStats(candidates[c], plotTile.neighborhoodId);
          var reserve = candidates[c] === 'dondurmaci' ? 80 : 180;
          if (totalFunds >= st.cost + reserve) {
            chosenShop = candidates[c];
            break;
          }
        }
      }
      if (!chosenShop) {
        var cheap = BD.getShopStats('dondurmaci', plotTile.neighborhoodId);
        if (totalFunds >= cheap.cost) {
          chosenShop = 'dondurmaci';
        }
      }
      return chosenShop ? { type: 'BUY_SHOP', shopType: chosenShop } : { type: 'SKIP_BUY' };
    }

    if (phase === 'BUY_SPECIAL') {
      var specTile = BD.TILES[player.pos];
      if (totalFunds >= specTile.cost + 150) {
        return { type: 'BUY_SPECIAL' };
      }
      return { type: 'SKIP_BUY' };
    }

    if (phase === 'CHOOSE_TELEPORT') {
      var bestPlot = null;
      var bestScore = -1;
      for (var t = 1; t < BD.TILES.length; t++) {
        var tl = BD.TILES[t];
        if (t === player.pos || tl.type === 'toptanci') continue;
        if (tl.type === 'plot' && !state.ownership[t]) {
          var mult = BD.NEIGHBORHOODS[tl.neighborhoodId].multiplier;
          var minCost = BD.getShopStats('dondurmaci', tl.neighborhoodId).cost;
          if (totalFunds >= minCost + 100 && mult > bestScore) {
            bestScore = mult;
            bestPlot = t;
          }
        }
      }
      return { type: 'CHOOSE_TELEPORT', targetTileIndex: bestPlot !== null ? bestPlot : 20 };
    }

    if (phase === 'TADILAT_CHOICE') {
      if (state.pendingTadilat && totalFunds >= state.pendingTadilat.repairCost + 300) {
        return { type: 'TADILAT_PAY' };
      }
      return { type: 'TADILAT_CLOSE' };
    }

    if (phase === 'DEBT_RESOLUTION') {
      var debt = state.pendingDebt;
      if (!debt) return { type: 'END_TURN' };
      if (totalFunds >= debt.amount) {
        return { type: 'PAY_PENDING_DEBT' };
      }
      var offers = getAvailableLoanOffers(state, player.id).filter(function (o) {
        return o.eligible;
      });
      if (offers.length > 0) {
        return { type: 'TAKE_LOAN', packageId: offers[0].id };
      }
      var owned = getPlayerPropertyIndices(state, player.id);
      if (owned.length > 0) {
        owned.sort(function (a, b) {
          return (state.ownership[a].costPaid || 0) - (state.ownership[b].costPaid || 0);
        });
        return { type: 'SELL_PROPERTY', tileIndex: owned[0] };
      }
      return { type: 'DECLARE_BANKRUPTCY' };
    }

    if (phase === 'HUB_ACTION' && state.pendingHub) {
      var pHub = state.pendingHub;
      if (pHub.kind === 'heliport') {
        var flyTarget = null;
        for (var ht = 1; ht < BD.TILES.length; ht++) {
          if (ht !== player.pos && BD.TILES[ht].type === 'plot' && !state.ownership[ht]) {
            var hMinCost = BD.getShopStats('dondurmaci', BD.TILES[ht].neighborhoodId).cost;
            if (totalFunds >= hMinCost + 120) {
              flyTarget = ht;
              break;
            }
          }
        }
        return { type: 'RESOLVE_HUB', choice: flyTarget !== null ? 'fly' : 'skip' };
      }
      return { type: 'RESOLVE_HUB', choice: 'roll' };
    }

    if (phase === 'POST_ROLL') {
      var upgInfo = getUpgradeInfo(state, player.id, player.pos);
      if (upgInfo && upgInfo.canUpgrade && upgInfo.isOnSite && totalFunds >= upgInfo.cost + 250) {
        return { type: 'UPGRADE_SHOP', tileIndex: player.pos };
      }
      return { type: 'END_TURN' };
    }

    return null;
  }

  CM.Engine = {
    createGameState: createGameState,
    getPlayerById: getPlayerById,
    getCurrentPlayer: getCurrentPlayer,
    getActiveDecisionPlayer: getActiveDecisionPlayer,
    getActivePlayers: getActivePlayers,
    getPlayerTotalFunds: getPlayerTotalFunds,
    getPlayerPropertyIndices: getPlayerPropertyIndices,
    getPlayerPropertyCount: getPlayerPropertyCount,
    getOwnedShopTypeCount: getOwnedShopTypeCount,
    getUpgradeInfo: getUpgradeInfo,
    getNeighborhoodBonus: getNeighborhoodBonus,
    getTileEffectiveNumbers: getTileEffectiveNumbers,
    getPlayerMarketStartIncome: getPlayerMarketStartIncome,
    getPlayerNetWorth: getPlayerNetWorth,
    getAvailableLoanOffers: getAvailableLoanOffers,
    dispatchAction: dispatchAction,
    chooseBotAction: chooseBotAction
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CM.Engine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
