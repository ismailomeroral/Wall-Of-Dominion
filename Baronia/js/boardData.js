(function (global) {
  'use strict';

  var CM = (global.CM = global.CM || {});

  var STARTING_CASH = 1500;
  var STARTING_BANK = 1500;
  var BANK_INTEREST_RATE = 0.05;
  var START_PASS_BONUS = 500;
  var START_LAND_BONUS = 1000;
  var SALE_REFUND_RATE = 0.6;
  var INSPECTION_FINE = 200;
  var KAFE_BONUS_PER_SHOP = 0.25;
  var MONOPOLY_BONUS = 0.5;
  var MAX_ACTIVE_LOANS = 1;
  var LOAN_GRACE_TURNS = 3;
  var UPGRADE_MIN_SAME_TYPE = 3;
  var MAX_BUILDING_LEVEL = 3;
  var REMOTE_UPGRADE_MULTIPLIER = 2.5;
  var LEVEL_INCOME_MULTIPLIERS = [0, 1.0, 1.75, 2.75];
  var KAFE_BONUS_BY_LEVEL = [0, 0.25, 0.35, 0.5];
  var UPGRADE_COST_FACTORS = { 2: 1.0, 3: 1.4 };

  function round5(n) {
    return Math.round(n / 5) * 5;
  }

  var NEIGHBORHOODS = {
    esenler: {
      id: 'esenler',
      name: 'Esenler',
      multiplier: 1.0,
      color: '#8B5E3C',
      textColor: '#ffffff',
      tagline: 'İstanbul Esnaf Çarşısı',
      badgeIcon: '🏪',
      gradient: 'linear-gradient(135deg, #5c3a21 0%, #1c130d 100%)',
      plotIndices: [1, 3, 4]
    },
    uskudar: {
      id: 'uskudar',
      name: 'Üsküdar',
      multiplier: 1.2,
      color: '#0EA5E9',
      textColor: '#ffffff',
      tagline: 'Kız Kulesi & Boğaz Sahili',
      badgeIcon: '🕌',
      gradient: 'linear-gradient(135deg, #0369a1 0%, #0b1c2d 100%)',
      plotIndices: [6, 8, 9]
    },
    kadikoy: {
      id: 'kadikoy',
      name: 'Kadıköy',
      multiplier: 1.5,
      color: '#EC4899',
      textColor: '#ffffff',
      tagline: 'Moda Sahili & Gençlik Ruhu',
      badgeIcon: '🎭',
      gradient: 'linear-gradient(135deg, #be185d 0%, #241021 100%)',
      plotIndices: [11, 13, 14]
    },
    bakirkoy: {
      id: 'bakirkoy',
      name: 'Bakırköy',
      multiplier: 1.8,
      color: '#F97316',
      textColor: '#ffffff',
      tagline: 'Sahil Bulvarı & Marina',
      badgeIcon: '⚓',
      gradient: 'linear-gradient(135deg, #c2410c 0%, #26130b 100%)',
      plotIndices: [16, 18, 19]
    },
    besiktas: {
      id: 'besiktas',
      name: 'Beşiktaş',
      multiplier: 2.2,
      color: '#EF4444',
      textColor: '#ffffff',
      tagline: 'Çarşı Ruhu & Sahil Hattı',
      badgeIcon: '🦅',
      gradient: 'linear-gradient(135deg, #b91c1c 0%, #230d12 100%)',
      plotIndices: [21, 23, 24]
    },
    nisantasi: {
      id: 'nisantasi',
      name: 'Nişantaşı',
      multiplier: 2.6,
      color: '#EAB308',
      textColor: '#1e293b',
      tagline: 'Lüks Butik & Moda Merkezi',
      badgeIcon: '💎',
      gradient: 'linear-gradient(135deg, #a16207 0%, #211a08 100%)',
      plotIndices: [26, 28, 29]
    },
    bebek: {
      id: 'bebek',
      name: 'Bebek',
      multiplier: 3.2,
      color: '#4F46E5',
      textColor: '#ffffff',
      tagline: 'Boğaz Yalıları & Prestij',
      badgeIcon: '🛥️',
      gradient: 'linear-gradient(135deg, #3730a3 0%, #11112e 100%)',
      plotIndices: [36, 37, 39]
    }
  };

  var NEIGHBORHOOD_LIST = [
    NEIGHBORHOODS.esenler,
    NEIGHBORHOODS.uskudar,
    NEIGHBORHOODS.kadikoy,
    NEIGHBORHOODS.bakirkoy,
    NEIGHBORHOODS.besiktas,
    NEIGHBORHOODS.nisantasi,
    NEIGHBORHOODS.bebek
  ];

  var SHOP_TYPES = {
    dondurmaci: {
      id: 'dondurmaci',
      name: 'Dondurmacı',
      icon: '🍦',
      color: '#f472b6',
      shortRule: 'Üstüne basmasalar bile önünden geçen rakiplerden ücret alır.',
      tiers: {
        1: { level: 1, name: 'Dondurma Arabası', icon: '🍦' },
        2: { level: 2, name: 'Dondurmacı', icon: '🍨' },
        3: { level: 3, name: 'Gelato Sarayı', icon: '🍧' }
      }
    },
    market: {
      id: 'market',
      name: 'Market',
      icon: '🛒',
      color: '#10b981',
      shortRule: 'Başlangıç noktasından her geçişinde sabit ekstra ciro getirir.',
      tiers: {
        1: { level: 1, name: 'Bakkal', icon: '🧺' },
        2: { level: 2, name: 'Market', icon: '🛒' },
        3: { level: 3, name: 'Süpermarket', icon: '🏬' }
      }
    },
    kafe: {
      id: 'kafe',
      name: 'Kafe',
      icon: '☕',
      color: '#b45309',
      shortRule: 'Aynı mahalledeki diğer dükkanlarının gelirini artırır (Sv.1 +%25, Sv.2 +%35, Sv.3 +%50).',
      tiers: {
        1: { level: 1, name: 'Kahve Büfesi', icon: '☕' },
        2: { level: 2, name: 'Butik Kafe', icon: '🥐' },
        3: { level: 3, name: 'Teras Roastery', icon: '🏛️' }
      }
    },
    magaza: {
      id: 'magaza',
      name: 'Alışveriş Mağazası',
      icon: '🛍️',
      color: '#7c3aed',
      shortRule: 'Kurulumu pahalıdır ama rakip durduğunda çok yüksek kira keser.',
      tiers: {
        1: { level: 1, name: 'Butik Dükkan', icon: '🛍️' },
        2: { level: 2, name: 'Moda Mağazası', icon: '👗' },
        3: { level: 3, name: 'Lüks AVM Kulesi', icon: '💎' }
      }
    }
  };

  function getShopTier(shopType, level) {
    var meta = SHOP_TYPES[shopType];
    var lvl = Math.max(1, Math.min(MAX_BUILDING_LEVEL, Number(level) || 1));
    if (!meta) return { level: lvl, name: 'İşletme', icon: '🏠' };
    return (meta.tiers && meta.tiers[lvl]) || { level: lvl, name: meta.name, icon: meta.icon };
  }

  var SHOP_TABLE = {
    esenler: {
      dondurmaci: { cost: 180, passFee: 25, landRent: 50, startBonus: 0 },
      market: { cost: 250, passFee: 0, landRent: 30, startBonus: 70 },
      kafe: { cost: 280, passFee: 0, landRent: 60, startBonus: 0 },
      magaza: { cost: 450, passFee: 0, landRent: 240, startBonus: 0 }
    },
    uskudar: {
      dondurmaci: { cost: 220, passFee: 30, landRent: 60, startBonus: 0 },
      market: { cost: 300, passFee: 0, landRent: 35, startBonus: 85 },
      kafe: { cost: 340, passFee: 0, landRent: 70, startBonus: 0 },
      magaza: { cost: 540, passFee: 0, landRent: 290, startBonus: 0 }
    },
    kadikoy: {
      dondurmaci: { cost: 270, passFee: 40, landRent: 75, startBonus: 0 },
      market: { cost: 375, passFee: 0, landRent: 45, startBonus: 105 },
      kafe: { cost: 420, passFee: 0, landRent: 90, startBonus: 0 },
      magaza: { cost: 675, passFee: 0, landRent: 360, startBonus: 0 }
    },
    bakirkoy: {
      dondurmaci: { cost: 325, passFee: 45, landRent: 90, startBonus: 0 },
      market: { cost: 450, passFee: 0, landRent: 55, startBonus: 125 },
      kafe: { cost: 500, passFee: 0, landRent: 110, startBonus: 0 },
      magaza: { cost: 810, passFee: 0, landRent: 430, startBonus: 0 }
    },
    besiktas: {
      dondurmaci: { cost: 400, passFee: 55, landRent: 110, startBonus: 0 },
      market: { cost: 550, passFee: 0, landRent: 65, startBonus: 155 },
      kafe: { cost: 620, passFee: 0, landRent: 130, startBonus: 0 },
      magaza: { cost: 990, passFee: 0, landRent: 530, startBonus: 0 }
    },
    nisantasi: {
      dondurmaci: { cost: 470, passFee: 65, landRent: 130, startBonus: 0 },
      market: { cost: 650, passFee: 0, landRent: 80, startBonus: 180 },
      kafe: { cost: 730, passFee: 0, landRent: 155, startBonus: 0 },
      magaza: { cost: 1170, passFee: 0, landRent: 625, startBonus: 0 }
    },
    bebek: {
      dondurmaci: { cost: 580, passFee: 80, landRent: 160, startBonus: 0 },
      market: { cost: 800, passFee: 0, landRent: 95, startBonus: 225 },
      kafe: { cost: 900, passFee: 0, landRent: 190, startBonus: 0 },
      magaza: { cost: 1440, passFee: 0, landRent: 770, startBonus: 0 }
    }
  };

  function getShopStats(shopType, neighborhoodId) {
    var row = SHOP_TABLE[neighborhoodId];
    if (!row || !row[shopType]) {
      return { cost: 0, passFee: 0, landRent: 0, startBonus: 0 };
    }
    return Object.assign({}, row[shopType]);
  }

  var TILES = [
    // Bottom Edge (0..9, displayed Right -> Left)
    { index: 0, type: 'corner', subtype: 'start', name: 'Başlangıç', icon: '🏁', subtitle: '+500₺ / +1.000₺' },
    { index: 1, type: 'plot', neighborhoodId: 'esenler', name: 'Esenler Meydan', icon: '🏗️' },
    { index: 2, type: 'event', name: 'Olay', icon: '🎲', subtitle: 'Sürpriz Kart' },
    { index: 3, type: 'plot', neighborhoodId: 'esenler', name: 'Dörtyol Arsa', icon: '🏗️' },
    { index: 4, type: 'plot', neighborhoodId: 'esenler', name: 'Atışalanı', icon: '🏗️' },
    { index: 5, type: 'utility', utilityKind: 'taksi', name: 'Taksi Durağı', icon: '🚕', cost: 400, baseFee: 50, perDieFee: 35, subtitle: '1–6 Ek Zar + Yol Ücreti' },
    { index: 6, type: 'plot', neighborhoodId: 'uskudar', name: 'Üsküdar Sahil', icon: '🏗️' },
    { index: 7, type: 'tax', subtype: 'fixed', name: 'Belediye Vergisi', icon: '🏛️', amount: 250, subtitle: 'Sabit 250₺' },
    { index: 8, type: 'plot', neighborhoodId: 'uskudar', name: 'Çengelköy', icon: '🏗️' },
    { index: 9, type: 'plot', neighborhoodId: 'uskudar', name: 'Kuzguncuk', icon: '🏗️' },

    // Left Edge (10..19, displayed Bottom -> Top)
    { index: 10, type: 'corner', subtype: 'zabita', name: 'Zabıta İncelemesi', icon: '🚨', subtitle: '1 Tur Bekle / 200₺' },
    { index: 11, type: 'plot', neighborhoodId: 'kadikoy', name: 'Kadıköy Çarşı', icon: '🏗️' },
    { index: 12, type: 'landmark', name: 'Kapalıçarşı', icon: '🕌', cost: 600, baseRent: 200, subtitle: 'Hazır İkon' },
    { index: 13, type: 'plot', neighborhoodId: 'kadikoy', name: 'Moda Sahil', icon: '🏗️' },
    { index: 14, type: 'plot', neighborhoodId: 'kadikoy', name: 'Bağdat Cad.', icon: '🏗️' },
    { index: 15, type: 'utility', utilityKind: 'borsa', name: 'Borsa Ofisi', icon: '📡', cost: 450, baseFee: 130, subtitle: 'Komisyon + Piyasa Zarı' },
    { index: 16, type: 'plot', neighborhoodId: 'bakirkoy', name: 'Bakırköy', icon: '🏗️' },
    { index: 17, type: 'event', name: 'Olay', icon: '🎲', subtitle: 'Sürpriz Kart' },
    { index: 18, type: 'plot', neighborhoodId: 'bakirkoy', name: 'Yeşilköy', icon: '🏗️' },
    { index: 19, type: 'plot', neighborhoodId: 'bakirkoy', name: 'Florya', icon: '🏗️' },

    // Top Edge (20..29, displayed Left -> Right)
    { index: 20, type: 'corner', subtype: 'musteri_akini', name: 'Müşteri Akını', icon: '🎉', subtitle: '+%20 İşletme Cirosu' },
    { index: 21, type: 'plot', neighborhoodId: 'besiktas', name: 'Beşiktaş Çarşı', icon: '🏗️' },
    { index: 22, type: 'toptanci', name: 'Toptancı Fırsat', icon: '📦', subtitle: 'İstediğin Kareye Git' },
    { index: 23, type: 'plot', neighborhoodId: 'besiktas', name: 'Ortaköy', icon: '🏗️' },
    { index: 24, type: 'plot', neighborhoodId: 'besiktas', name: 'Levent', icon: '🏗️' },
    { index: 25, type: 'utility', utilityKind: 'medya', name: 'Medya Ajansı', icon: '📺', cost: 450, baseFee: 110, perShopFee: 35, subtitle: 'Dükkan Başına Reklam Geliri' },
    { index: 26, type: 'plot', neighborhoodId: 'nisantasi', name: 'Teşvikiye', icon: '🏗️' },
    { index: 27, type: 'event', name: 'Olay', icon: '🎲', subtitle: 'Sürpriz Kart' },
    { index: 28, type: 'plot', neighborhoodId: 'nisantasi', name: 'Abdi İpekçi', icon: '🏗️' },
    { index: 29, type: 'plot', neighborhoodId: 'nisantasi', name: 'Maçka', icon: '🏗️' },

    // Right Edge (30..39, displayed Top -> Bottom)
    { index: 30, type: 'corner', subtype: 'tadilat', name: 'Zorunlu Tadilat', icon: '🛠️', subtitle: 'Kapat / %15 Öde' },
    { index: 31, type: 'landmark', name: 'İstiklal Caddesi', icon: '🚋', cost: 750, baseRent: 240, subtitle: 'Hazır İkon' },
    { index: 32, type: 'event', name: 'Olay', icon: '🎲', subtitle: 'Sürpriz Kart' },
    { index: 33, type: 'tax', subtype: 'per_shop', name: 'Maliye Vergisi', icon: '🧾', perProperty: 80, subtitle: 'Mülk Başına 80₺' },
    { index: 34, type: 'toptanci', name: 'Toptancı Fırsat', icon: '📦', subtitle: 'İstediğin Kareye Git' },
    { index: 35, type: 'utility', utilityKind: 'heliport', name: 'Boğaz Heliportu', icon: '🚁', cost: 500, baseFee: 170, subtitle: 'VIP Harç / Sahibine Uçuş' },
    { index: 36, type: 'plot', neighborhoodId: 'bebek', name: 'Arnavutköy', icon: '🏗️' },
    { index: 37, type: 'plot', neighborhoodId: 'bebek', name: 'Bebek Sahil', icon: '🏗️' },
    { index: 38, type: 'landmark', name: 'Galata Kulesi', icon: '🗼', cost: 900, baseRent: 280, subtitle: 'Hazır İkon' },
    { index: 39, type: 'plot', neighborhoodId: 'bebek', name: 'Etiler', icon: '🏗️' }
  ];

  var LANDMARK_MULTIPLIERS = [0, 1.0, 1.5, 2.2];
  var UTILITY_DICE_FACTORS = [0, 40, 70, 110, 160];

  var LOAN_PACKAGES = [
    {
      id: 'esnaf',
      name: 'Esnaf Kredisi',
      principal: 500,
      installments: 4,
      interestRate: 0.2,
      minProperties: 0,
      description: 'Hızlı nakit desteği. 4 taksitte ödenir.'
    },
    {
      id: 'isletme',
      name: 'İşletme Kredisi',
      principal: 1000,
      installments: 4,
      interestRate: 0.2,
      minProperties: 0,
      description: 'Yeni mahallelere açılmak için ideal sermaye.'
    },
    {
      id: 'yatirim',
      name: 'Yatırım Kredisi',
      principal: 2000,
      installments: 5,
      interestRate: 0.25,
      minProperties: 2,
      description: 'En az 2 mülk teminatı gerekir. Büyük yatırımlar için.'
    }
  ];

  var EVENT_CARDS = [
    // Cash-specific witty events (9)
    {
      id: 'coat_cash',
      title: 'Kışlık Palto Mucizesi!',
      icon: '🧥',
      targetAccount: 'cash',
      description: 'Geçen kıştan kalma paltonun cebinden katlanmış nakit çıktı! Cüzdanına +200₺ eklendi.',
      kind: 'cash_gain',
      amount: 200
    },
    {
      id: 'seagull_raid',
      title: 'Beşiktaş Martısı Operasyonu',
      icon: '🕊️',
      targetAccount: 'cash',
      description: 'Elindeki simidi kapan martı cüzdanına da salça oldu! Kasandan 120₺ nakit uçtu.',
      kind: 'cash_loss',
      amount: 120
    },
    {
      id: 'taxi_bargain',
      title: 'Taksimetresi Bozuk Taksici',
      icon: '🚕',
      targetAccount: 'cash',
      description: '“Kısa mesafe abim” diyerek seni Galata turu attırdı. Elden 150₺ nakit ödedin.',
      kind: 'cash_loss',
      amount: 150
    },
    {
      id: 'summer_heat',
      title: 'Yaz Sıcağı Bastırdı!',
      icon: '☀️',
      targetAccount: 'cash',
      description: 'İstanbul yandı, dondurmacılar kuyruk oldu! Her Dondurmacı için +120₺ nakit (yoksa +120₺ moral desteği).',
      kind: 'dondurmaci_bonus',
      perShop: 120,
      fallback: 120
    },
    {
      id: 'fancy_latte',
      title: 'Nişantaşı’nda Özel Kahve',
      icon: '☕',
      targetAccount: 'cash',
      description: 'Yulaf sütlü ekstra köpüklü içince adisyona şaştın. Cüzdandan 100₺ nakit eksildi.',
      kind: 'cash_loss',
      amount: 100
    },
    {
      id: 'loose_change_crisis',
      title: 'Bozuk Para Kıtlığı!',
      icon: '🪙',
      targetAccount: 'cash',
      description: 'Kasada bozuk kalmadı, toptancıya nakit fark verdin. Nakdinin %15’ini (en fazla 250₺) kaybettin.',
      kind: 'cash_percent_loss',
      rate: 0.15,
      maxAmount: 250
    },
    {
      id: 'cousin_discount',
      title: '“Bize İndirim Yok Mu?” Baskını',
      icon: '🫂',
      targetAccount: 'cash',
      description: 'Uzak akrabalar dükkana gelip “patron bizdeniz” dedi. Masraf olarak 180₺ nakit gitti.',
      kind: 'cash_loss',
      amount: 180
    },
    {
      id: 'ferry_inspiration',
      title: 'Vapurda Çay & Simit İlhamı',
      icon: '⛴️',
      targetAccount: 'cash',
      description: 'Boğaz havası ticari zekanı açtı, hemen yeni bir iş bağladın! Cüzdanına +260₺ nakit.',
      kind: 'cash_gain',
      amount: 260
    },
    {
      id: 'bosphorus_fest',
      title: 'Boğaz Havai Fişek Festivali',
      icon: '🎆',
      targetAccount: 'cash',
      description: 'Sahile inen turistler dükkanlara akın etti! Elden +350₺ sıcak nakit kazandın.',
      kind: 'cash_gain',
      amount: 350
    },

    // Bank-specific witty events (9)
    {
      id: 'bank_dividend',
      title: 'Banka Temettü Sürprizi!',
      icon: '📈',
      targetAccount: 'bank',
      description: 'İstanbul Bankası VIP müşterilerini sevindirdi! Banka bakiyene +%10 bonus (en az +150₺).',
      kind: 'bank_percent_gain',
      rate: 0.1,
      minAmount: 150
    },
    {
      id: 'atm_bonus',
      title: 'ATM Özür Bonusu',
      icon: '🏧',
      targetAccount: 'bank',
      description: 'Kartını yutan ATM hatasını telafi etti, hesabına özür olarak +250₺ yatırıldı.',
      kind: 'bank_gain',
      amount: 250
    },
    {
      id: 'bank_fee',
      title: 'Gizemli Hesap İşletim Ücreti',
      icon: '🧾',
      targetAccount: 'bank',
      description: '“Efendim bu yılbaşı bakım masrafı” dediler. Banka hesabından 150₺ kesildi.',
      kind: 'bank_loss',
      amount: 150
    },
    {
      id: 'pos_cashback',
      title: 'POS Temassız Cashback!',
      icon: '💳',
      targetAccount: 'bank',
      description: 'Çok kart okuttun diye puanların nakde döndü! Banka hesabına +180₺ yattı.',
      kind: 'bank_gain',
      amount: 180
    },
    {
      id: 'tv_series_filming',
      title: 'Dizide Dükkanın Çıktı!',
      icon: '🎬',
      targetAccount: 'bank',
      description: 'Ünlü akşam dizisi senin sokağı kiraladı! Yapım şirketi banka hesabına +400₺ yolladı.',
      kind: 'bank_gain',
      amount: 400
    },
    {
      id: 'esnaf_support',
      title: 'Belediye Genç Girişimci Hibesi',
      icon: '🤝',
      targetAccount: 'bank',
      description: 'Projen örnek esnaf seçildi! Belediye hesabına +300₺ hibe yatırdı.',
      kind: 'bank_gain',
      amount: 300
    },
    {
      id: 'went_viral',
      title: 'TikTok’ta Viral Oldun!',
      icon: '📱',
      targetAccount: 'bank',
      description: '“İstanbul’un en havalı esnafı” videosu patladı! Online siparişlerden bankaya +380₺.',
      kind: 'bank_gain',
      amount: 380
    },
    {
      id: 'surprise_iban',
      title: 'Eski Ortaktan IBAN Sürprizi',
      icon: '📲',
      targetAccount: 'bank',
      description: 'Yıllar önce borç verdiğin arkadaş nihayet IBAN’ına +220₺ gönderdi!',
      kind: 'bank_gain',
      amount: 220
    },
    {
      id: 'tax_refund',
      title: 'Stopaj Vergi İadesi',
      icon: '💸',
      targetAccount: 'bank',
      description: 'Maliye fazla kesintiyi geri yolladı! Banka hesabına +240₺ aktarıldı.',
      kind: 'bank_gain',
      amount: 240
    },

    // Movement, Social & Utility events (6)
    {
      id: 'e5_traffic',
      title: 'E-5 Akşam Trafiği Kilit!',
      icon: '🚦',
      targetAccount: 'cash',
      description: 'Yanlış sapağa girdin, navigasyon seni 3 kare geriye yönlendirdi!',
      kind: 'move_back',
      steps: 3
    },
    {
      id: 'zabita_raid',
      title: 'Ani Zabıta Denetimi',
      icon: '🚨',
      targetAccount: 'cash',
      description: 'Ruhsat ve tartı kontrolü için doğrudan Zabıta İncelemesine git (Başlangıç sayılmaz).',
      kind: 'go_zabita'
    },
    {
      id: 'new_metro',
      title: 'Yeni Metro Hattı Açıldı!',
      icon: '🚇',
      targetAccount: 'bank',
      description: 'Sıradaki en yakın ulaşım durağına ışınlan! Başlangıçtan geçersen maaşını alırsın.',
      kind: 'nearest_utility'
    },
    {
      id: 'neighborhood_party',
      title: 'Mahalle İmece Şenliği',
      icon: '🎈',
      targetAccount: 'cash',
      description: 'Organizasyonun olay oldu! Diğer her oyuncudan +80₺ elden nakit topla.',
      kind: 'collect_each',
      amount: 80
    },
    {
      id: 'promo_campaign',
      title: 'Kandil Simidi İkramı',
      icon: '🥨',
      targetAccount: 'cash',
      description: 'Tüm komşu esnafa ikram dağıttın! Diğer her oyuncuya 60₺ öde.',
      kind: 'pay_each',
      amount: 60
    },
    {
      id: 'utility_bill',
      title: 'Boğaz Manzaralı Elektrik Faturası',
      icon: '💡',
      targetAccount: 'bank',
      description: 'Klima ve tabela ışıkları yandı! Sahip olduğun her mülk için 55₺ (en az 100₺) öde.',
      kind: 'per_property_loss',
      perProperty: 55,
      minAmount: 100
    }
  ];

  CM.BoardData = {
    STARTING_CASH: STARTING_CASH,
    STARTING_BANK: STARTING_BANK,
    BANK_INTEREST_RATE: BANK_INTEREST_RATE,
    START_PASS_BONUS: START_PASS_BONUS,
    START_LAND_BONUS: START_LAND_BONUS,
    SALE_REFUND_RATE: SALE_REFUND_RATE,
    INSPECTION_FINE: INSPECTION_FINE,
    KAFE_BONUS_PER_SHOP: KAFE_BONUS_PER_SHOP,
    MONOPOLY_BONUS: MONOPOLY_BONUS,
    MAX_ACTIVE_LOANS: MAX_ACTIVE_LOANS,
    LOAN_GRACE_TURNS: LOAN_GRACE_TURNS,
    UPGRADE_MIN_SAME_TYPE: UPGRADE_MIN_SAME_TYPE,
    MAX_BUILDING_LEVEL: MAX_BUILDING_LEVEL,
    REMOTE_UPGRADE_MULTIPLIER: REMOTE_UPGRADE_MULTIPLIER,
    LEVEL_INCOME_MULTIPLIERS: LEVEL_INCOME_MULTIPLIERS,
    KAFE_BONUS_BY_LEVEL: KAFE_BONUS_BY_LEVEL,
    UPGRADE_COST_FACTORS: UPGRADE_COST_FACTORS,
    round5: round5,
    NEIGHBORHOODS: NEIGHBORHOODS,
    NEIGHBORHOOD_LIST: NEIGHBORHOOD_LIST,
    SHOP_TYPES: SHOP_TYPES,
    getShopTier: getShopTier,
    SHOP_TABLE: SHOP_TABLE,
    getShopStats: getShopStats,
    TILES: TILES,
    LANDMARK_MULTIPLIERS: LANDMARK_MULTIPLIERS,
    UTILITY_DICE_FACTORS: UTILITY_DICE_FACTORS,
    LOAN_PACKAGES: LOAN_PACKAGES,
    EVENT_CARDS: EVENT_CARDS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CM.BoardData;
  }
})(typeof window !== 'undefined' ? window : globalThis);
