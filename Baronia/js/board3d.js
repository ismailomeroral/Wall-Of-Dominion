(function (global) {
  'use strict';

  var CM = (global.CM = global.CM || {});
  var BD = CM.BoardData;
  var Avatar = CM.Avatar;

  function getTileTransform(index) {
    var halfSpan = 8.4;
    if (index === 0) return { x: halfSpan, z: halfSpan, rotY: 0, w: 2.4, d: 2.4, isCorner: true };
    if (index > 0 && index < 10) {
      return { x: 6.4 - (index - 1) * 1.6, z: halfSpan, rotY: 0, w: 1.6, d: 2.4, isCorner: false };
    }
    if (index === 10) return { x: -halfSpan, z: halfSpan, rotY: -Math.PI / 2, w: 2.4, d: 2.4, isCorner: true };
    if (index > 10 && index < 20) {
      return { x: -halfSpan, z: 6.4 - (index - 11) * 1.6, rotY: -Math.PI / 2, w: 1.6, d: 2.4, isCorner: false };
    }
    if (index === 20) return { x: -halfSpan, z: -halfSpan, rotY: Math.PI, w: 2.4, d: 2.4, isCorner: true };
    if (index > 20 && index < 30) {
      return { x: -6.4 + (index - 21) * 1.6, z: -halfSpan, rotY: Math.PI, w: 1.6, d: 2.4, isCorner: false };
    }
    if (index === 30) return { x: halfSpan, z: -halfSpan, rotY: Math.PI / 2, w: 2.4, d: 2.4, isCorner: true };
    return { x: halfSpan, z: -6.4 + (index - 31) * 1.6, rotY: Math.PI / 2, w: 1.6, d: 2.4, isCorner: false };
  }

  function wrapLines(ctx, text, maxWidth) {
    var words = String(text || '').split(/\s+/);
    var lines = [];
    var current = '';
    for (var i = 0; i < words.length; i++) {
      var test = current ? current + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = words[i];
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 2);
  }

  function drawCenteredTextWithOutline(ctx, text, x, y, fill, stroke, lineWidth) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 4;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function createTileTexture(THREE, tile, ownership, owner) {
    var isCorner = tile.type === 'corner';
    var w = isCorner ? 384 : 256;
    var h = 384;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    // Distinct full-tile matte palette based on tile type
    var tileBg = isCorner ? '#121b2d' : '#101829';
    var parcelBg = '#0c1322';
    var borderCol = owner ? owner.color || '#fbbf24' : 'rgba(148, 163, 184, 0.24)';

    if (tile.type === 'event') {
      tileBg = '#2c0b4e';
      parcelBg = '#1f0738';
      borderCol = 'rgba(192, 132, 252, 0.65)';
    } else if (tile.type === 'toptanci') {
      tileBg = '#191d4d';
      parcelBg = '#11163d';
      borderCol = 'rgba(129, 140, 248, 0.65)';
    } else if (tile.type === 'tax') {
      tileBg = '#420a1a';
      parcelBg = '#2b0611';
      borderCol = 'rgba(251, 113, 133, 0.6)';
    } else if (tile.type === 'landmark') {
      tileBg = '#1e1912';
      parcelBg = '#14100b';
      borderCol = owner ? owner.color || '#fbbf24' : 'rgba(245, 158, 11, 0.45)';
    } else if (tile.type === 'utility') {
      tileBg = '#0c233a';
      parcelBg = '#081829';
      borderCol = owner ? owner.color || '#38bdf8' : 'rgba(56, 189, 248, 0.45)';
    } else if (isCorner) {
      if (tile.subtype === 'start') { tileBg = '#063d2e'; parcelBg = '#042a20'; borderCol = 'rgba(52, 211, 153, 0.6)'; }
      else if (tile.subtype === 'zabita') { tileBg = '#3e0b10'; parcelBg = '#280609'; borderCol = 'rgba(248, 113, 113, 0.6)'; }
      else if (tile.subtype === 'musteri_akini') { tileBg = '#06443a'; parcelBg = '#042f28'; borderCol = 'rgba(45, 212, 191, 0.6)'; }
      else if (tile.subtype === 'tadilat') { tileBg = '#4d200a'; parcelBg = '#331405'; borderCol = 'rgba(251, 146, 60, 0.6)'; }
    }

    ctx.fillStyle = tileBg;
    ctx.fillRect(0, 0, w, h);

    // Subtle matte outer parcel pad (y: 196..384)
    ctx.fillStyle = parcelBg;
    ctx.fillRect(10, 196, w - 20, h - 208);

    // Subtle divider curb between pawn boulevard (76..196) and outer parcel (196..384)
    ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
    ctx.fillRect(10, 193, w - 20, 3);

    // Subtle outer border (colored by owner if owned)
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = owner ? 10 : 5;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    if (tile.type === 'plot') {
      var hood = BD.NEIGHBORHOODS[tile.neighborhoodId];
      // 1. Colored Neighborhood Header Band (y: 4..78) WITH the Plot Name inside it!
      ctx.fillStyle = hood.color;
      ctx.fillRect(6, 6, w - 12, 72);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(6, 72, w - 12, 6);

      ctx.font = '800 22px Inter, system-ui, sans-serif';
      var plotLines = wrapLines(ctx, tile.name.toUpperCase(), w - 24);
      var textColor = hood.id === 'nisantasi' ? '#0f172a' : '#ffffff';
      var outlineColor = hood.id === 'nisantasi' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.65)';
      for (var i = 0; i < plotLines.length; i++) {
        var lineY = plotLines.length === 1 ? 41 : 28 + i * 25;
        drawCenteredTextWithOutline(ctx, plotLines[i], w / 2, lineY, textColor, outlineColor, 4);
      }

      // 2. Empty Plot: crisp '+' architectural pad centered in outer parcel (y: 196..384)
      if (!ownership) {
        var cx = w / 2;
        var cy = 286;
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 46, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(251, 191, 36, 0.86)';
        ctx.fillRect(cx - 24, cy - 5.5, 48, 11);
        ctx.fillRect(cx - 5.5, cy - 24, 11, 48);
        ctx.restore();
      } else {
        ctx.strokeStyle = owner ? owner.color || '#fbbf24' : '#fbbf24';
        ctx.lineWidth = 4;
        ctx.strokeRect(14, 200, w - 28, h - 216);

        var lvlCount = Math.max(1, Math.min(3, ownership.level || 1));
        var starsStr = lvlCount === 3 ? '★★★' : lvlCount === 2 ? '★★' : '★';
        ctx.save();
        ctx.font = '900 22px Inter, system-ui, sans-serif';
        drawCenteredTextWithOutline(ctx, starsStr, w / 2, h - 24, '#fde047', '#0f172a', 4);
        ctx.restore();
      }
    } else {
      // Non-plot & Corner tiles: Accent Header + Distinct Full-Tile Thematic Emblem in outer parcel
      var accent = '#d97706';
      if (tile.type === 'utility') accent = '#0284c7';
      else if (tile.type === 'landmark') accent = '#b45309';
      else if (tile.type === 'event') accent = '#9333ea';
      else if (tile.type === 'toptanci') accent = '#4f46e5';
      else if (tile.type === 'tax') accent = '#be123c';
      else if (tile.subtype === 'start') accent = '#059669';
      else if (tile.subtype === 'zabita') accent = '#b91c1c';
      else if (tile.subtype === 'musteri_akini') accent = '#0d9488';
      else if (tile.subtype === 'tadilat') accent = '#ea580c';

      ctx.fillStyle = accent;
      ctx.fillRect(6, 6, w - 12, 72);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.fillRect(6, 72, w - 12, 6);

      ctx.font = isCorner ? '800 26px Inter, system-ui, sans-serif' : '800 21px Inter, system-ui, sans-serif';
      var lines = wrapLines(ctx, tile.name.toUpperCase(), w - 26);
      for (var j = 0; j < lines.length; j++) {
        var ly = lines.length === 1 ? 41 : 27 + j * 25;
        drawCenteredTextWithOutline(ctx, lines[j], w / 2, ly, '#ffffff', 'rgba(0,0,0,0.65)', 4);
      }

      // Draw bold thematic vector emblem on non-building outer parcel
      var ex = w / 2;
      var ey = 288;
      if (tile.type === 'event') {
        ctx.save();
        ctx.strokeStyle = 'rgba(216, 180, 254, 0.45)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ex, ey, 54, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '900 94px Cinzel, Georgia, serif';
        drawCenteredTextWithOutline(ctx, '?', ex, ey + 4, '#f3e8ff', '#581c87', 6);
        ctx.restore();
      } else if (tile.type === 'toptanci') {
        ctx.save();
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ex, ey, 52, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '800 76px Inter, sans-serif';
        drawCenteredTextWithOutline(ctx, '✦', ex, ey + 2, '#a5f3fc', '#312e81', 5);
        ctx.restore();
      } else if (tile.type === 'tax') {
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 113, 133, 0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ex, ey, 52, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '900 66px Inter, sans-serif';
        drawCenteredTextWithOutline(ctx, '% ₺', ex, ey + 2, '#fecdd3', '#881337', 5);
        ctx.restore();
      } else if (isCorner) {
        var cornerGlyph = tile.subtype === 'start' ? '➔' : tile.subtype === 'zabita' ? '!' : tile.subtype === 'musteri_akini' ? '★' : '⚒';
        var glyphCol = tile.subtype === 'start' ? '#6ee7b7' : tile.subtype === 'zabita' ? '#fca5a5' : tile.subtype === 'musteri_akini' ? '#5eead4' : '#fdba74';
        ctx.save();
        ctx.font = '900 72px Inter, sans-serif';
        drawCenteredTextWithOutline(ctx, cornerGlyph, w * 0.65, 290, glyphCol, 'rgba(0,0,0,0.65)', 5);
        ctx.restore();
      }
    }

    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function createDieMaterials(THREE) {
    var pipLayouts = {
      1: [[0.5, 0.5]],
      2: [[0.28, 0.28], [0.72, 0.72]],
      3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]],
      4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
      5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
      6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]]
    };
    var faceNumbers = [3, 4, 1, 6, 2, 5];

    return faceNumbers.map(function (num) {
      var c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      var ctx = c.getContext('2d');

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 256);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, 236, 236);

      var pips = pipLayouts[num];
      for (var i = 0; i < pips.length; i++) {
        ctx.fillStyle = num === 1 ? '#f59e0b' : '#fde68a';
        ctx.beginPath();
        ctx.arc(pips[i][0] * 256, pips[i][1] * 256, num === 1 ? 26 : 19, 0, Math.PI * 2);
        ctx.fill();
      }

      var tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      return new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.72,
        metalness: 0.15
      });
    });
  }

  function getDieTargetEuler(value) {
    switch (Number(value)) {
      case 1: return { x: 0, y: 0, z: 0 };
      case 2: return { x: -Math.PI / 2, y: 0, z: 0 };
      case 3: return { x: 0, y: 0, z: Math.PI / 2 };
      case 4: return { x: 0, y: 0, z: -Math.PI / 2 };
      case 5: return { x: Math.PI / 2, y: 0, z: 0 };
      case 6:
      default:
        return { x: Math.PI, y: 0, z: 0 };
    }
  }

  // Detailed 3-stage 3D shop buildings tinted dynamically by ownerColor + gold level pips
  function buildShopMesh(THREE, shopType, ownerColor, isClosed, level) {
    var group = new THREE.Group();
    var lvl = Math.max(1, Math.min(3, Number(level) || 1));
    var accentHex = ownerColor || '#fbbf24';
    var ownerCol = new THREE.Color(accentHex);
    var ownerDark = ownerCol.clone().multiplyScalar(0.55);
    var ownerLight = ownerCol.clone().lerp(new THREE.Color(0xffffff), 0.25);

    // Shared compact plinth inside the outer building parcel
    var plinth = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 0.06, 1.02),
      new THREE.MeshStandardMaterial({ color: ownerCol, roughness: 0.72, metalness: 0.12 })
    );
    plinth.position.y = 0.03;
    plinth.receiveShadow = true;
    group.add(plinth);

    // Level indicator gold pips on front edge of plinth (facing inner lane localZ = -0.47)
    for (var lp = 0; lp < lvl; lp++) {
      var pipX = -((lvl - 1) * 0.16) / 2 + lp * 0.16;
      var pip = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.08, 0.07),
        new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xf59e0b, emissiveIntensity: 0.55, roughness: 0.35 })
      );
      pip.position.set(pipX, 0.08, -0.47);
      group.add(pip);
    }

    if (shopType === 'dondurmaci') {
      if (lvl === 1) {
        // Lv 1: Dondurma Arabası — compact street gelato cart + striped parasol + mini cone
        var cart = new THREE.Mesh(
          new THREE.BoxGeometry(0.68, 0.26, 0.48),
          new THREE.MeshStandardMaterial({ color: ownerCol, roughness: 0.72 })
        );
        cart.position.set(0, 0.19, 0.06);
        cart.castShadow = true;
        group.add(cart);

        [-0.28, 0.28].forEach(function (wx) {
          var wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(wx, 0.12, -0.2);
          group.add(wheel);
        });

        var poleD = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.44, 6),
          new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.6 })
        );
        poleD.position.set(0.22, 0.48, 0.08);
        group.add(poleD);

        var parasol = new THREE.Mesh(
          new THREE.ConeGeometry(0.36, 0.16, 8),
          new THREE.MeshStandardMaterial({ color: ownerLight, roughness: 0.6 })
        );
        parasol.position.set(0.22, 0.68, 0.08);
        group.add(parasol);

        var miniCone = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.5 })
        );
        miniCone.position.set(-0.14, 0.39, 0.04);
        group.add(miniCone);
      } else {
        // Lv 2 (Dondurmacı) & Lv 3 (Gelato Sarayı)
        var base = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 0.24, 0.76),
          new THREE.MeshStandardMaterial({ color: ownerDark, roughness: 0.8 })
        );
        base.position.set(0, 0.18, 0.06);
        base.castShadow = true;
        group.add(base);

        var bodyH = lvl === 3 ? 0.62 : 0.38;
        var upper = new THREE.Mesh(
          new THREE.BoxGeometry(0.98, bodyH, 0.74),
          new THREE.MeshStandardMaterial({ color: 0xfef2f2, roughness: 0.75 })
        );
        upper.position.set(0, 0.3 + bodyH / 2, 0.06);
        upper.castShadow = true;
        group.add(upper);

        var freezer = new THREE.Mesh(
          new THREE.BoxGeometry(0.76, 0.22, 0.18),
          new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: 0x0284c7, emissiveIntensity: 0.32, roughness: 0.35 })
        );
        freezer.position.set(0, 0.28, -0.34);
        group.add(freezer);

        var tubColors = [0xf472b6, 0x34d399, 0xfbbf24, 0x93c5fd];
        for (var t = 0; t < 4; t++) {
          var tub = new THREE.Mesh(
            new THREE.BoxGeometry(0.13, 0.08, 0.1),
            new THREE.MeshStandardMaterial({ color: tubColors[t], roughness: 0.5 })
          );
          tub.position.set(-0.24 + t * 0.16, 0.38, -0.34);
          group.add(tub);
        }

        var roofY = 0.3 + bodyH + 0.04;
        for (var s = 0; s < 7; s++) {
          var stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.145, 0.06, 0.36),
            new THREE.MeshStandardMaterial({ color: s % 2 === 0 ? ownerCol : 0xfdf2f8, roughness: 0.65 })
          );
          stripe.position.set(-0.435 + s * 0.145, 0.63, -0.34);
          stripe.rotation.x = 0.36;
          stripe.castShadow = true;
          group.add(stripe);
        }

        var roofTrim = new THREE.Mesh(
          new THREE.BoxGeometry(1.06, 0.08, 0.82),
          new THREE.MeshStandardMaterial({ color: lvl === 3 ? 0xfbbf24 : ownerCol, roughness: 0.55 })
        );
        roofTrim.position.set(0, roofY, 0.06);
        group.add(roofTrim);

        if (lvl === 3) {
          // Lv 3 Terrace parapet & golden crown dome
          var archWin = new THREE.Mesh(
            new THREE.BoxGeometry(0.68, 0.18, 0.77),
            new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 0.4, roughness: 0.4 })
          );
          archWin.position.set(0, 0.77, 0.06);
          group.add(archWin);
        }

        var sculpt = new THREE.Group();
        sculpt.position.set(0, roofY + 0.24, 0.06);
        var cone = new THREE.Mesh(
          new THREE.ConeGeometry(lvl === 3 ? 0.19 : 0.16, 0.36, 12),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 })
        );
        cone.rotation.x = Math.PI;
        sculpt.add(cone);

        var sc1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshStandardMaterial({ color: ownerCol, roughness: 0.5 }));
        sc1.position.set(-0.05, 0.18, 0);
        var sc2 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.5 }));
        sc2.position.set(0.08, 0.2, 0.03);
        var sc3 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.5 }));
        sc3.position.set(0.01, 0.34, 0);
        var cherry = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 }));
        cherry.position.set(0.01, 0.47, 0);
        var wafer = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.04), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.75 }));
        wafer.position.set(0.12, 0.36, -0.04);
        wafer.rotation.z = -0.4;
        sculpt.add(sc1, sc2, sc3, cherry, wafer);

        group.userData.spinProp = sculpt;
        group.add(sculpt);
      }
    } else if (shopType === 'market') {
      if (lvl === 1) {
        // Lv 1: Bakkal — small warm wooden neighborhood corner shop + produce crate + simple awning
        var bBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.76, 0.42, 0.62),
          new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 })
        );
        bBody.position.set(-0.06, 0.27, 0.08);
        bBody.castShadow = true;
        group.add(bBody);

        var bRoof = new THREE.Mesh(
          new THREE.BoxGeometry(0.84, 0.1, 0.7),
          new THREE.MeshStandardMaterial({ color: ownerCol, roughness: 0.7 })
        );
        bRoof.position.set(-0.06, 0.52, 0.08);
        group.add(bRoof);

        var bWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.24, 0.04),
          new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xd97706, emissiveIntensity: 0.35, roughness: 0.45 })
        );
        bWin.position.set(-0.06, 0.26, -0.24);
        group.add(bWin);

        var bCrate = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.14, 0.24),
          new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.75 })
        );
        bCrate.position.set(0.42, 0.13, -0.02);
        group.add(bCrate);
      } else {
        // Lv 2 (Market) & Lv 3 (Süpermarket Hypermarket)
        var mHeight = lvl === 3 ? 0.92 : 0.6;
        var mBody = new THREE.Mesh(
          new THREE.BoxGeometry(1.06, mHeight, 0.82),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82 })
        );
        mBody.position.set(-0.08, 0.06 + mHeight / 2, 0.06);
        mBody.castShadow = true;
        group.add(mBody);

        var mFascia = new THREE.Mesh(
          new THREE.BoxGeometry(1.12, 0.16, 0.88),
          new THREE.MeshStandardMaterial({ color: ownerCol, emissive: ownerDark, emissiveIntensity: 0.35, roughness: 0.6 })
        );
        mFascia.position.set(-0.08, 0.08 + mHeight, 0.06);
        mFascia.castShadow = true;
        group.add(mFascia);

        var mGlass = new THREE.Mesh(
          new THREE.BoxGeometry(0.68, 0.38, 0.05),
          new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0284c7, emissiveIntensity: 0.35, roughness: 0.35 })
        );
        mGlass.position.set(-0.08, 0.27, -0.36);
        group.add(mGlass);

        var divider = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.38, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 })
        );
        divider.position.set(-0.08, 0.27, -0.36);
        group.add(divider);

        var stand = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.18, 0.64),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 })
        );
        stand.position.set(0.52, 0.15, 0.06);
        group.add(stand);

        var crateCols = [0xef4444, 0xf97316, 0x84cc16];
        for (var c = 0; c < 3; c++) {
          var crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.09, 0.16),
            new THREE.MeshStandardMaterial({ color: crateCols[c], roughness: 0.7 })
          );
          crate.position.set(0.52, 0.28, -0.14 + c * 0.2);
          group.add(crate);
        }

        var miniAwning = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.05, 0.68),
          new THREE.MeshStandardMaterial({ color: ownerCol, roughness: 0.68 })
        );
        miniAwning.position.set(0.52, 0.45, 0.06);
        miniAwning.rotation.z = -0.25;
        group.add(miniAwning);

        var signBlade = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, lvl === 3 ? 0.72 : 0.48, 0.18),
          new THREE.MeshStandardMaterial({ color: ownerLight, emissive: ownerCol, emissiveIntensity: 0.45, roughness: 0.5 })
        );
        signBlade.position.set(-0.6, lvl === 3 ? 1.05 : 0.86, -0.26);
        group.add(signBlade);

        if (lvl === 3) {
          // Lv 3 Süpermarket upper glass floor, illuminated rooftop billboard & gold trim
          var upperGlass = new THREE.Mesh(
            new THREE.BoxGeometry(0.88, 0.24, 0.85),
            new THREE.MeshStandardMaterial({ color: 0xa5f3fc, emissive: 0x0ea5e9, emissiveIntensity: 0.35, roughness: 0.35 })
          );
          upperGlass.position.set(-0.08, 0.72, 0.06);
          group.add(upperGlass);

          var billboard = new THREE.Mesh(
            new THREE.BoxGeometry(0.82, 0.28, 0.1),
            new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xf59e0b, emissiveIntensity: 0.55, roughness: 0.4 })
          );
          billboard.position.set(-0.08, 1.24, -0.18);
          group.add(billboard);

          var skylight = new THREE.Mesh(
            new THREE.BoxGeometry(0.54, 0.12, 0.38),
            new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: 0x38bdf8, emissiveIntensity: 0.4, roughness: 0.3 })
          );
          skylight.position.set(-0.08, 1.1, 0.18);
          group.add(skylight);
        } else {
          var hvac = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, 0.14, 0.28),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75 })
          );
          hvac.position.set(-0.26, 0.83, 0.18);
          group.add(hvac);
        }
      }
    } else if (shopType === 'kafe') {
      if (lvl === 1) {
        // Lv 1: Kahve Büfesi — compact timber espresso booth + cup sign
        var kBooth = new THREE.Mesh(
          new THREE.BoxGeometry(0.68, 0.46, 0.56),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 })
        );
        kBooth.position.set(0, 0.29, 0.08);
        kBooth.castShadow = true;
        group.add(kBooth);

        var kWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.24, 0.04),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xd97706, emissiveIntensity: 0.45, roughness: 0.4 })
        );
        kWin.position.set(0, 0.3, -0.21);
        group.add(kWin);

        var kRoof = new THREE.Mesh(
          new THREE.ConeGeometry(0.48, 0.2, 4),
          new THREE.MeshStandardMaterial({ color: ownerCol, roughness: 0.7 })
        );
        kRoof.position.set(0, 0.62, 0.08);
        kRoof.rotation.y = Math.PI / 4;
        group.add(kRoof);
      } else {
        // Lv 2 (Butik Kafe) & Lv 3 (Teras Roastery)
        var deck = new THREE.Mesh(
          new THREE.BoxGeometry(1.18, 0.07, 0.94),
          new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.88 })
        );
        deck.position.set(0, 0.095, 0.02);
        group.add(deck);

        var cBodyH = lvl === 3 ? 0.92 : 0.62;
        var cBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.76, cBodyH, 0.68),
          new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 })
        );
        cBody.position.set(-0.2, 0.13 + cBodyH / 2, 0.12);
        cBody.castShadow = true;
        group.add(cBody);

        var cWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.56, lvl === 3 ? 0.62 : 0.36, 0.71),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xd97706, emissiveIntensity: 0.48, roughness: 0.4 })
        );
        cWin.position.set(-0.2, lvl === 3 ? 0.56 : 0.42, 0.12);
        group.add(cWin);

        var cRoofY = 0.13 + cBodyH + 0.14;
        var cRoof = new THREE.Mesh(
          new THREE.ConeGeometry(0.58, 0.28, 4),
          new THREE.MeshStandardMaterial({ color: lvl === 3 ? ownerCol : ownerDark, roughness: 0.7 })
        );
        cRoof.position.set(-0.2, cRoofY, 0.12);
        cRoof.rotation.y = Math.PI / 4;
        cRoof.castShadow = true;
        group.add(cRoof);

        var cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.1, 0.2, 12),
          new THREE.MeshStandardMaterial({ color: ownerLight, emissive: ownerDark, emissiveIntensity: 0.3, roughness: 0.5 })
        );
        cup.position.set(-0.2, cRoofY + 0.21, 0.12);
        group.add(cup);

        var handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.06, 0.018, 6, 12),
          new THREE.MeshStandardMaterial({ color: ownerLight, roughness: 0.5 })
        );
        handle.position.set(-0.07, cRoofY + 0.21, 0.12);
        group.add(handle);

        var steamGroup = new THREE.Group();
        steamGroup.position.set(-0.2, cRoofY + 0.39, 0.12);
        for (var st = 0; st < 2; st++) {
          var puff = new THREE.Mesh(
            new THREE.SphereGeometry(0.045 - st * 0.01, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.65, roughness: 0.9 })
          );
          puff.position.set(st * 0.03, st * 0.1, 0);
          steamGroup.add(puff);
        }
        group.userData.floatProp = steamGroup;
        group.userData.floatBaseY = cRoofY + 0.39;
        group.add(steamGroup);

        var umbrellaCount = lvl === 3 ? 2 : 1;
        for (var uc = 0; uc < umbrellaCount; uc++) {
          var uz = uc === 0 ? -0.2 : 0.22;
          var pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.48, 6),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 })
          );
          pole.position.set(0.36, 0.36, uz);
          group.add(pole);

          var table = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12),
            new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 })
          );
          table.position.set(0.36, 0.28, uz);
          group.add(table);

          var umbrella = new THREE.Mesh(
            new THREE.ConeGeometry(0.27, 0.14, 8),
            new THREE.MeshStandardMaterial({ color: ownerCol, roughness: 0.68 })
          );
          umbrella.position.set(0.36, 0.6, uz);
          umbrella.castShadow = true;
          group.add(umbrella);
        }
      }
    } else {
      // Magaza: Lv 1 (Butik Dükkan), Lv 2 (Moda Mağazası), Lv 3 (Lüks AVM Kulesi)
      if (lvl === 1) {
        var bStore = new THREE.Mesh(
          new THREE.BoxGeometry(0.88, 0.52, 0.72),
          new THREE.MeshStandardMaterial({ color: ownerCol, roughness: 0.68, metalness: 0.18 })
        );
        bStore.position.set(0, 0.32, 0.06);
        bStore.castShadow = true;
        group.add(bStore);

        var bShow = new THREE.Mesh(
          new THREE.BoxGeometry(0.52, 0.32, 0.05),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 0.4, roughness: 0.4 })
        );
        bShow.position.set(0, 0.26, -0.31);
        group.add(bShow);

        var bCornice = new THREE.Mesh(
          new THREE.BoxGeometry(0.96, 0.09, 0.78),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5, metalness: 0.45 })
        );
        bCornice.position.set(0, 0.6, 0.06);
        group.add(bCornice);
      } else {
        var podium = new THREE.Mesh(
          new THREE.BoxGeometry(1.16, 0.42, 0.92),
          new THREE.MeshStandardMaterial({ color: ownerDark, roughness: 0.68, metalness: 0.2 })
        );
        podium.position.set(0, 0.27, 0.04);
        podium.castShadow = true;
        group.add(podium);

        var portal = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.3, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 0.42, roughness: 0.4 })
        );
        portal.position.set(0, 0.21, -0.43);
        group.add(portal);

        var towerH = lvl === 3 ? 1.25 : 0.72;
        var tower = new THREE.Mesh(
          new THREE.BoxGeometry(0.76, towerH, 0.68),
          new THREE.MeshStandardMaterial({
            color: ownerCol,
            emissive: ownerDark,
            emissiveIntensity: 0.28,
            roughness: 0.55,
            metalness: 0.25
          })
        );
        tower.position.set(0, 0.48 + towerH / 2, 0.06);
        tower.castShadow = true;
        group.add(tower);

        [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.4], [0.38, 0.4]].forEach(function (pt) {
          var fin = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, towerH + 0.08, 0.07),
            new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.48, metalness: 0.55 })
          );
          fin.position.set(pt[0], 0.48 + towerH / 2, pt[1]);
          group.add(fin);
        });

        var bandCount = lvl === 3 ? 4 : 2;
        for (var fb = 0; fb < bandCount; fb++) {
          var band = new THREE.Mesh(
            new THREE.BoxGeometry(0.81, 0.05, 0.73),
            new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xd97706, emissiveIntensity: 0.3, roughness: 0.5 })
          );
          band.position.set(0, 0.62 + fb * 0.28, 0.06);
          group.add(band);
        }

        if (lvl === 3) {
          var crown = new THREE.Mesh(
            new THREE.ConeGeometry(0.32, 0.44, 4),
            new THREE.MeshStandardMaterial({ color: ownerLight, emissive: ownerCol, emissiveIntensity: 0.42, roughness: 0.4, metalness: 0.5 })
          );
          crown.position.set(0, 0.48 + towerH + 0.22, 0.06);
          crown.rotation.y = Math.PI / 4;
          crown.castShadow = true;
          group.add(crown);
        }
      }
    }

    if (isClosed) {
      var barrier = new THREE.Mesh(
        new THREE.BoxGeometry(1.12, 0.14, 0.14),
        new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 0.65, roughness: 0.6 })
      );
      barrier.position.set(0, 0.85, -0.38);
      group.add(barrier);
    }

    return group;
  }

  // Landmarks, Transit & Corner Accents strictly placed inside outer parcel (localZ = +0.54 or outer corner quadrant)
  function buildSpecialLandmarkProp(THREE, tile) {
    var g = new THREE.Group();
    if (tile.index === 12) {
      // Kapalıçarşı: colonnade portal + 3 domes
      var hall = new THREE.Mesh(
        new THREE.BoxGeometry(1.12, 0.44, 0.88),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 })
      );
      hall.position.set(0, 0.22, 0.54);
      hall.castShadow = true;
      g.add(hall);
      [-0.34, 0, 0.34].forEach(function (dx, idx) {
        var dome = new THREE.Mesh(
          new THREE.SphereGeometry(idx === 1 ? 0.24 : 0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: idx === 1 ? 0xd97706 : 0x64748b, roughness: 0.65, metalness: 0.3 })
        );
        dome.position.set(dx, 0.44, 0.54);
        dome.castShadow = true;
        g.add(dome);
      });
    } else if (tile.index === 31) {
      // İstiklal Caddesi: nostalgic red tramway on dark rails + streetlamp
      var rail = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.04, 0.46),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
      );
      rail.position.set(0, 0.02, 0.54);
      g.add(rail);

      var tram = new THREE.Mesh(
        new THREE.BoxGeometry(0.96, 0.42, 0.42),
        new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.65 })
      );
      tram.position.set(0, 0.25, 0.54);
      tram.castShadow = true;
      g.add(tram);

      var tramRoof = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.07, 0.38),
        new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 })
      );
      tramRoof.position.set(0, 0.49, 0.54);
      g.add(tramRoof);

      var headlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfbbf24, emissiveIntensity: 0.8 })
      );
      headlight.position.set(-0.48, 0.2, 0.54);
      g.add(headlight);
    } else if (tile.index === 38) {
      // Galata Kulesi: stone cylinder, cantilevered balcony ring, slate cone + golden spire
      var cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.3, 1.15, 16),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 })
      );
      cyl.position.set(0, 0.58, 0.54);
      cyl.castShadow = true;
      g.add(cyl);

      var gallery = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, emissiveIntensity: 0.35, roughness: 0.5 })
      );
      gallery.position.set(0, 1.1, 0.54);
      g.add(gallery);

      var cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.52, 16),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 })
      );
      cone.position.set(0, 1.41, 0.54);
      cone.castShadow = true;
      g.add(cone);

      var finial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.025, 0.22, 6),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 })
      );
      finial.position.set(0, 1.72, 0.54);
      g.add(finial);
    } else if (tile.type === 'utility') {
      if (tile.utilityKind === 'taksi') {
        // Yellow checkered taxi shelter + miniature taxi cab with illuminated TAXI beacon
        var tCanopy = new THREE.Mesh(
          new THREE.BoxGeometry(1.02, 0.09, 0.58),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.55 })
        );
        tCanopy.position.set(0, 0.52, 0.54);
        tCanopy.castShadow = true;
        g.add(tCanopy);
        [-0.36, 0.36].forEach(function (tx) {
          var postT = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
          );
          postT.position.set(tx, 0.25, 0.68);
          g.add(postT);
        });
        var cabBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.18, 0.32),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.45, metalness: 0.15 })
        );
        cabBody.position.set(0, 0.14, 0.44);
        cabBody.castShadow = true;
        var cabTop = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.12, 0.28),
          new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 })
        );
        cabTop.position.set(0, 0.28, 0.44);
        var cabSign = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.06, 0.08),
          new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfacc15, emissiveIntensity: 0.7 })
        );
        cabSign.position.set(0, 0.36, 0.44);
        g.add(cabBody, cabTop, cabSign);
      } else if (tile.utilityKind === 'borsa') {
        // Borsa Ofisi: dark monolith + 3 ascending glowing bar-chart pillars
        var baseB = new THREE.Mesh(
          new THREE.BoxGeometry(1.06, 0.12, 0.72),
          new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75 })
        );
        baseB.position.set(0, 0.06, 0.54);
        g.add(baseB);
        var barH = [0.28, 0.48, 0.72];
        var barC = [0x38bdf8, 0x10b981, 0xfbbf24];
        for (var bi = 0; bi < 3; bi++) {
          var bar = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, barH[bi], 0.26),
            new THREE.MeshStandardMaterial({ color: barC[bi], emissive: barC[bi], emissiveIntensity: 0.35, roughness: 0.45 })
          );
          bar.position.set(-0.28 + bi * 0.28, 0.12 + barH[bi] / 2, 0.54);
          bar.castShadow = true;
          g.add(bar);
        }
      } else if (tile.utilityKind === 'medya') {
        // Medya Ajansı: studio screen + broadcast mast + rotating radar dish
        var studio = new THREE.Mesh(
          new THREE.BoxGeometry(0.86, 0.44, 0.54),
          new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.65 })
        );
        studio.position.set(-0.1, 0.22, 0.54);
        studio.castShadow = true;
        var screenM = new THREE.Mesh(
          new THREE.BoxGeometry(0.64, 0.28, 0.06),
          new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x06b6d4, emissiveIntensity: 0.6 })
        );
        screenM.position.set(-0.1, 0.24, 0.26);
        var mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.05, 0.68, 8),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.4 })
        );
        mast.position.set(0.32, 0.34, 0.6);
        var dish = new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 0.14, 12),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xf59e0b, emissiveIntensity: 0.35, roughness: 0.45 })
        );
        dish.position.set(0.32, 0.72, 0.6);
        dish.rotation.x = Math.PI / 3;
        g.userData.spinProp = dish;
        g.add(studio, screenM, mast, dish);
      } else {
        // Boğaz Heliportu: circular dark pad + H cross + miniature helicopter with spinning rotor
        var pad = new THREE.Mesh(
          new THREE.CylinderGeometry(0.46, 0.48, 0.06, 20),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
        );
        pad.position.set(0, 0.03, 0.54);
        var hRing = new THREE.Mesh(
          new THREE.RingGeometry(0.34, 0.4, 20),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xd97706, emissiveIntensity: 0.45, side: THREE.DoubleSide })
        );
        hRing.rotation.x = -Math.PI / 2;
        hRing.position.set(0, 0.065, 0.54);
        var cabin = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0369a1, emissiveIntensity: 0.35, roughness: 0.35 })
        );
        cabin.scale.set(1.4, 0.9, 1.0);
        cabin.position.set(0, 0.24, 0.54);
        var rotorHub = new THREE.Group();
        rotorHub.position.set(0, 0.43, 0.54);
        var blade1 = new THREE.Mesh(
          new THREE.BoxGeometry(0.76, 0.025, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.5 })
        );
        var blade2 = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.025, 0.76),
          new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.5 })
        );
        rotorHub.add(blade1, blade2);
        g.userData.spinProp = rotorHub;
        g.add(pad, hRing, cabin, rotorHub);
      }
    } else if (tile.type === 'corner') {
      // Corner monuments tucked neatly in outer corner quadrant (-0.68, +0.68) so pawns never overlap
      if (tile.subtype === 'start') {
        var archL = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.82, 0.14),
          new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.55, metalness: 0.4 })
        );
        archL.position.set(-0.92, 0.41, 0.68);
        var archR = archL.clone();
        archR.position.set(-0.32, 0.41, 0.68);
        var beam = new THREE.Mesh(
          new THREE.BoxGeometry(0.84, 0.16, 0.18),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.35, roughness: 0.5 })
        );
        beam.position.set(-0.62, 0.85, 0.68);
        g.add(archL, archR, beam);
      } else if (tile.subtype === 'zabita') {
        var post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.14, 0.56, 10),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
        );
        post.position.set(-0.68, 0.28, 0.68);
        var siren = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.75 })
        );
        siren.position.set(-0.68, 0.64, 0.68);
        g.add(post, siren);
      } else if (tile.subtype === 'musteri_akini') {
        var obelisk = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.24, 0),
          new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.5, roughness: 0.45 })
        );
        obelisk.position.set(-0.68, 0.52, 0.68);
        g.userData.spinProp = obelisk;
        g.add(obelisk);
      } else if (tile.subtype === 'tadilat') {
        var coneT = new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 0.44, 10),
          new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 0.35, roughness: 0.7 })
        );
        coneT.position.set(-0.68, 0.22, 0.68);
        g.add(coneT);
      }
    }
    return g;
  }

  function Board3DView(containerEl, callbacks) {
    this.container = containerEl;
    this.callbacks = callbacks || {};
    this.THREE = global.THREE;
    this.disposed = false;
    this.tileMeshes = [];
    this.tileTopMaterials = [];
    this.tileSignature = {};
    this.buildingGroups = {};
    this.burstRings = [];
    this.specialProps = [];
    this.pawnGroups = {};
    this.pawnTargets = {};
    this.eventDeckMeshes = [];
    this.eventDeckGroup = null;
    this.eventDeckAura = null;
    this.eventDeckFlyCard = null;
    this.eventDeckActive = false;
    this.eventDeckAnim = null;
    this.hoveredTile = null;
    this.hoveredEventDeck = false;
    this.teleportTargets = {};
    this.followEnabled = true;

    this.cam = {
      yaw: 0.38,
      pitch: 0.92,
      distance: 21.5,
      targetX: 0,
      targetZ: 0,
      goalYaw: 0.38,
      goalPitch: 0.92,
      goalDistance: 21.5,
      goalTargetX: 0,
      goalTargetZ: 0
    };

    this.dieAnim = null;
    this.pawnAnim = null;

    this.init();
  }

  Board3DView.prototype.init = function () {
    var THREE = this.THREE;
    if (!THREE) {
      this.container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fbbf24;font-weight:700;">Three.js yüklenemedi. İnternet bağlantısını kontrol et.</div>';
      return;
    }

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      this.container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fbbf24;font-weight:700;">3D WebGL başlatılamadı.</div>';
      return;
    }

    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.container.clientWidth || global.innerWidth, this.container.clientHeight || global.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b14);
    this.scene.fog = new THREE.FogExp2(0x070b14, 0.013);

    var w = this.container.clientWidth || global.innerWidth;
    var h = this.container.clientHeight || global.innerHeight;
    this.camera = new THREE.PerspectiveCamera(44, w / h, 0.1, 120);

    this.setupLights();
    this.buildBoardBase();
    this.buildTiles();
    this.buildCenterDie();
    this.buildEventDeck();
    this.bindInputEvents();

    this.clock = new THREE.Clock();
    this.animate();
  };

  Board3DView.prototype.setupLights = function () {
    var THREE = this.THREE;
    var hemi = new THREE.HemisphereLight(0x9ec5fe, 0x0d1526, 0.92);
    this.scene.add(hemi);

    var keyLight = new THREE.DirectionalLight(0xffe9c8, 0.92);
    keyLight.position.set(11, 21, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 48;
    keyLight.shadow.camera.left = -13;
    keyLight.shadow.camera.right = 13;
    keyLight.shadow.camera.top = 13;
    keyLight.shadow.camera.bottom = -13;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    var rimLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    rimLight.position.set(-14, 10, -14);
    this.scene.add(rimLight);

    var centerGlow = new THREE.PointLight(0xf59e0b, 0.55, 16);
    centerGlow.position.set(0, 3.2, 0);
    this.scene.add(centerGlow);
  };

  Board3DView.prototype.buildBoardBase = function () {
    var THREE = this.THREE;

    // Matte Obsidian Plinth
    var plinth = new THREE.Mesh(
      new THREE.BoxGeometry(20.6, 0.7, 20.6),
      new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.92, metalness: 0.04 })
    );
    plinth.position.y = -0.38;
    plinth.receiveShadow = true;
    this.scene.add(plinth);

    // Brushed Matte Gold Trim Frame
    var goldTrim = new THREE.Mesh(
      new THREE.BoxGeometry(19.9, 0.14, 19.9),
      new THREE.MeshStandardMaterial({ color: 0xc8963e, metalness: 0.52, roughness: 0.52 })
    );
    goldTrim.position.y = -0.06;
    this.scene.add(goldTrim);

    // Matte Midnight Courtyard
    var courtyard = new THREE.Mesh(
      new THREE.BoxGeometry(14.3, 0.12, 14.3),
      new THREE.MeshStandardMaterial({ color: 0x09111f, roughness: 0.92, metalness: 0.04 })
    );
    courtyard.position.y = -0.02;
    courtyard.receiveShadow = true;
    this.scene.add(courtyard);

    // Glare-free Bosphorus Strait Water Channel
    var strait = new THREE.Mesh(
      new THREE.BoxGeometry(15.2, 0.03, 2.3),
      new THREE.MeshStandardMaterial({
        color: 0x0c4a6e,
        emissive: 0x0369a1,
        emissiveIntensity: 0.22,
        roughness: 0.55,
        metalness: 0.16
      })
    );
    strait.position.y = 0.045;
    strait.rotation.y = Math.PI / 4;
    strait.receiveShadow = true;
    this.scene.add(strait);

    // Miniature Illuminated Bosphorus Bridge
    var bridge = new THREE.Group();
    bridge.rotation.y = -Math.PI / 4;

    var deck = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.08, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.35, roughness: 0.65 })
    );
    deck.position.y = 0.45;
    deck.castShadow = true;
    bridge.add(deck);

    [-1.05, 1.05].forEach(function (tx) {
      var towerL = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 1.15, 0.11),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.6 })
      );
      towerL.position.set(tx, 0.58, -0.2);
      var towerR = towerL.clone();
      towerR.position.set(tx, 0.58, 0.2);
      var cross = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.46),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.45 })
      );
      cross.position.set(tx, 1.12, 0);
      bridge.add(towerL, towerR, cross);
    });

    bridge.position.set(-2.9, 0.02, 2.9);
    this.scene.add(bridge);

    // Dice Pedestal
    var ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.65, 0.18, 32),
      new THREE.MeshStandardMaterial({ color: 0x131d31, metalness: 0.15, roughness: 0.82 })
    );
    ped.position.set(0, 0.09, 0);
    ped.receiveShadow = true;
    this.scene.add(ped);

    var pedRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.48, 0.045, 12, 48),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.38, metalness: 0.55, roughness: 0.45 })
    );
    pedRing.rotation.x = Math.PI / 2;
    pedRing.position.set(0, 0.18, 0);
    this.scene.add(pedRing);
  };

  Board3DView.prototype.buildTiles = function () {
    var THREE = this.THREE;
    var sideMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0.05 });

    for (var i = 0; i < BD.TILES.length; i++) {
      var tile = BD.TILES[i];
      var tr = getTileTransform(i);
      var tex = createTileTexture(THREE, tile, null, null);
      var topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93, metalness: 0.02 });

      var mats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(tr.w - 0.06, 0.24, tr.d - 0.06), mats);
      mesh.position.set(tr.x, 0.12, tr.z);
      mesh.rotation.y = tr.rotY;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.userData.tileIndex = i;

      var ring = new THREE.Mesh(
        new THREE.BoxGeometry(tr.w - 0.02, 0.05, tr.d - 0.02),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0 })
      );
      ring.position.y = 0.125;
      mesh.add(ring);
      mesh.userData.highlightRing = ring;

      this.scene.add(mesh);
      this.tileMeshes[i] = mesh;
      this.tileTopMaterials[i] = topMat;

      var prop = buildSpecialLandmarkProp(THREE, tile);
      if (prop.children.length > 0) {
        prop.position.set(tr.x, 0.24, tr.z);
        prop.rotation.y = tr.rotY;
        this.scene.add(prop);
        this.specialProps.push(prop);
      }
    }
  };

  Board3DView.prototype.buildCenterDie = function () {
    var THREE = this.THREE;
    var mats = createDieMaterials(THREE);
    this.dieMesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.92, 0.92), mats);
    this.dieMesh.position.set(0, 0.64, 0);
    this.dieMesh.castShadow = true;
    this.scene.add(this.dieMesh);
  };

  Board3DView.prototype.buildEventDeck = function () {
    var THREE = this.THREE;
    var deckGroup = new THREE.Group();
    deckGroup.position.set(2.85, 0.06, -2.55);
    deckGroup.rotation.y = -0.32;

    // Tray base
    var tray = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 0.1, 2.28),
      new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.85, metalness: 0.15 })
    );
    tray.position.y = 0.05;
    tray.receiveShadow = true;
    deckGroup.add(tray);

    // Ornate Event Card Back CanvasTexture
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 356;
    var ctx = c.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 256, 356);
    grad.addColorStop(0, '#3b0764');
    grad.addColorStop(0.55, '#1e1b4b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 356);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 232, 332);
    ctx.strokeStyle = 'rgba(192,132,252,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, 208, 308);
    drawCenteredTextWithOutline(ctx, '?', 128, 145, '#fde68a', 'rgba(0,0,0,0.6)', 6);
    ctx.font = '800 92px Cinzel, Georgia, serif';
    drawCenteredTextWithOutline(ctx, '?', 128, 145, '#fbbf24', 'rgba(0,0,0,0.65)', 5);
    ctx.font = '800 24px Inter, system-ui, sans-serif';
    drawCenteredTextWithOutline(ctx, 'OLAY KARTI', 128, 255, '#e9d5ff', 'rgba(0,0,0,0.6)', 4);

    var backTex = new THREE.CanvasTexture(c);
    backTex.encoding = THREE.sRGBEncoding;
    var sideCardMat = new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.78 });
    var topCardMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.75, metalness: 0.08 });
    var cardMats = [sideCardMat, sideCardMat, topCardMat, sideCardMat, sideCardMat, sideCardMat];

    for (var i = 0; i < 6; i++) {
      var cardMesh = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.055, 1.98), cardMats);
      cardMesh.position.y = 0.12 + i * 0.052;
      cardMesh.castShadow = true;
      deckGroup.add(cardMesh);
      this.eventDeckMeshes.push(cardMesh);
    }

    // Separate flying top card used for draw animation
    var flyCard = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.055, 1.98), cardMats);
    flyCard.position.set(0, 0.44, 0);
    flyCard.visible = false;
    deckGroup.add(flyCard);
    this.eventDeckFlyCard = flyCard;

    // Glowing Aura Ring around the deck when DRAW_EVENT_CARD is active
    var aura = new THREE.Mesh(
      new THREE.RingGeometry(1.22, 1.48, 32),
      new THREE.MeshBasicMaterial({ color: 0xc084fc, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.04;
    deckGroup.add(aura);
    this.eventDeckAura = aura;

    this.eventDeckGroup = deckGroup;
    this.scene.add(deckGroup);
  };

  Board3DView.prototype.pulseTileLanding = function (tileIndex, colorHex) {
    var tr = getTileTransform(tileIndex);
    this.spawnConstructionBurst(tr.x, tr.z, colorHex || '#fbbf24');
  };

  Board3DView.prototype.focusEventDeck = function () {
    this.cam.goalTargetX = 1.6;
    this.cam.goalTargetZ = -1.4;
  };

  Board3DView.prototype.animateDrawEventCard = function (onComplete) {
    if (!this.eventDeckFlyCard) {
      if (onComplete) onComplete();
      return;
    }
    this.eventDeckFlyCard.visible = true;
    this.eventDeckFlyCard.position.set(0, 0.45, 0);
    this.eventDeckFlyCard.rotation.set(0, 0, 0);
    this.eventDeckFlyCard.scale.set(1, 1, 1);
    this.eventDeckAnim = {
      elapsed: 0,
      duration: 0.62,
      onComplete: onComplete
    };
  };

  Board3DView.prototype.spawnConstructionBurst = function (x, z, colorHex) {
    var THREE = this.THREE;
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.42, 24),
      new THREE.MeshBasicMaterial({
        color: colorHex || 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.27, z);
    this.scene.add(ring);
    this.burstRings.push({ mesh: ring, age: 0, duration: 0.7 });
  };

  Board3DView.prototype.syncState = function (state, skipPawnReset) {
    if (!this.scene || !state) return;
    var THREE = this.THREE;

    for (var i = 0; i < BD.TILES.length; i++) {
      var tile = BD.TILES[i];
      var own = state.ownership[i] || null;
      var owner = own ? CM.Engine.getPlayerById(state, own.ownerId) : null;
      var levelVal = own ? (own.level || 1) : 0;
      var sig = own ? own.ownerId + ':' + (own.shopType || own.type) + ':' + levelVal + ':' + own.closedTurnsRemaining : 'empty';

      if (this.tileSignature[i] !== sig) {
        var prevSig = this.tileSignature[i];
        var wasEmpty = prevSig === 'empty';
        var prevLevel = 0;
        if (prevSig && prevSig !== 'empty') {
          var sigParts = prevSig.split(':');
          prevLevel = Number(sigParts[2]) || 1;
        }
        var isUpgrade = !wasEmpty && levelVal > prevLevel;
        this.tileSignature[i] = sig;

        var oldTex = this.tileTopMaterials[i].map;
        var newTex = createTileTexture(THREE, tile, own, owner);
        this.tileTopMaterials[i].map = newTex;
        this.tileTopMaterials[i].needsUpdate = true;
        if (oldTex) oldTex.dispose();

        if (this.buildingGroups[i]) {
          this.scene.remove(this.buildingGroups[i]);
          delete this.buildingGroups[i];
        }

        if (tile.type === 'plot' && own && own.shopType) {
          var tr = getTileTransform(i);
          var bGroup = buildShopMesh(THREE, own.shopType, owner ? owner.color : '#fbbf24', own.closedTurnsRemaining > 0, levelVal);
          // Place building STRICTLY inside the outer parcel (localZ = +0.54)
          var offsetZ = 0.54;
          var wx = tr.x + offsetZ * Math.sin(tr.rotY);
          var wz = tr.z + offsetZ * Math.cos(tr.rotY);
          bGroup.position.set(wx, 0.24, wz);
          bGroup.rotation.y = tr.rotY;
          bGroup.scale.set(0.01, 0.01, 0.01);
          this.scene.add(bGroup);
          this.buildingGroups[i] = bGroup;
          if (wasEmpty || isUpgrade) {
            this.spawnConstructionBurst(wx, wz, owner ? owner.color : '#fbbf24');
          }
        } else if ((tile.type === 'landmark' || tile.type === 'utility') && own && owner) {
          // Mount colored owner base plinth under acquired Landmark or Utility
          var specTr = getTileTransform(i);
          var specOffsetZ = 0.54;
          var swx = specTr.x + specOffsetZ * Math.sin(specTr.rotY);
          var swz = specTr.z + specOffsetZ * Math.cos(specTr.rotY);
          var specRing = new THREE.Mesh(
            new THREE.BoxGeometry(1.24, 0.06, 0.98),
            new THREE.MeshStandardMaterial({ color: owner.color || '#fbbf24', roughness: 0.7 })
          );
          specRing.position.set(swx, 0.25, swz);
          specRing.rotation.y = specTr.rotY;
          this.scene.add(specRing);
          this.buildingGroups[i] = specRing;
          if (wasEmpty) {
            this.spawnConstructionBurst(swx, swz, owner.color || '#fbbf24');
          }
        }
      }
    }

    var current = CM.Engine.getCurrentPlayer(state);
    this.eventDeckActive = state.phase === 'DRAW_EVENT_CARD';
    this.teleportTargets = {};
    if (state.phase === 'CHOOSE_TELEPORT' && current) {
      for (var t = 1; t < BD.TILES.length; t++) {
        if (t !== current.pos && BD.TILES[t].type !== 'toptanci') {
          this.teleportTargets[t] = true;
        }
      }
    }

    this.syncPawns(state, skipPawnReset);

    if (!this.dieAnim && state.lastDie) {
      var e = getDieTargetEuler(state.lastDie);
      this.dieMesh.rotation.set(e.x, e.y, e.z);
      this.dieMesh.position.set(0, 0.64, 0);
    }
  };

  Board3DView.prototype.syncPawns = function (state, skipPositionMove) {
    var byTile = {};
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      if (!byTile[p.pos]) byTile[p.pos] = [];
      byTile[p.pos].push(p);

      if (!this.pawnGroups[p.id]) {
        this.pawnGroups[p.id] = this.createPlayerPawn(p);
        this.scene.add(this.pawnGroups[p.id]);
      }
      this.pawnGroups[p.id].visible = !p.bankrupt;
    }

    if (skipPositionMove) return;

    for (var j = 0; j < state.players.length; j++) {
      var pl = state.players[j];
      if (pl.bankrupt) continue;
      var slotGroup = byTile[pl.pos] || [pl];
      var idxInSlot = slotGroup.indexOf(pl);
      var coords = this.computePawnCoords(pl.pos, idxInSlot, slotGroup.length);
      this.pawnTargets[pl.id] = coords;
      if (!this.pawnAnim) {
        this.pawnGroups[pl.id].position.set(coords.x, 0.24, coords.z);
      }
    }
  };

  // Dedicated inner boulevard lane for pawns: zero collision with outer 3D buildings/landmarks!
  Board3DView.prototype.computePawnCoords = function (tileIndex, slotIndex, totalInSlot) {
    var tr = getTileTransform(tileIndex);
    var localX = 0;
    var localZ = -0.36;

    if (tr.isCorner) {
      // Corner monument is tucked at (-0.68, +0.68); pawns occupy inner-right plaza cleanly
      var cOffsets = [
        [0.24, -0.16],
        [0.64, -0.16],
        [0.24, 0.34],
        [0.64, 0.34]
      ];
      var picked = cOffsets[slotIndex % 4];
      localX = totalInSlot === 1 ? 0.35 : picked[0];
      localZ = totalInSlot === 1 ? -0.12 : picked[1];
    } else {
      // Regular tile: spread horizontally along the inner walkway (localZ = -0.36)
      if (totalInSlot === 1) {
        localX = 0;
      } else {
        var span = Math.min(0.95, (totalInSlot - 1) * 0.34);
        localX = -span / 2 + (slotIndex / (totalInSlot - 1)) * span;
      }
      localZ = -0.36;
    }

    var cos = Math.cos(tr.rotY);
    var sin = Math.sin(tr.rotY);
    return {
      x: tr.x + localX * cos + localZ * sin,
      z: tr.z - localX * sin + localZ * cos
    };
  };

  Board3DView.prototype.createPlayerPawn = function (player) {
    var THREE = this.THREE;
    var group = new THREE.Group();
    var pColor = player.color || '#fbbf24';

    var base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.27, 0.2, 20),
      new THREE.MeshStandardMaterial({ color: pColor, metalness: 0.35, roughness: 0.45 })
    );
    base.position.y = 0.1;
    base.castShadow = true;
    group.add(base);

    var collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.15, 0.16, 16),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.65, roughness: 0.35 })
    );
    collar.position.y = 0.26;
    group.add(collar);

    var medGroup = new THREE.Group();
    medGroup.position.y = 0.62;

    var rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31, 0.31, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.65, roughness: 0.35 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    medGroup.add(rim);

    var faceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var faceDisc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), faceMat);
    faceDisc.position.z = 0.036;
    var backDisc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), faceMat);
    backDisc.position.z = -0.036;
    backDisc.rotation.y = Math.PI;
    medGroup.add(faceDisc, backDisc);

    if (Avatar && Avatar.renderAvatarDataURL) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = 256;
        c.height = 256;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 256, 256);
        var tex = new THREE.CanvasTexture(c);
        tex.encoding = THREE.sRGBEncoding;
        faceMat.map = tex;
        faceMat.needsUpdate = true;
      };
      img.src = Avatar.renderAvatarDataURL(player.avatar, 256);
    }

    group.userData.medallion = medGroup;
    group.add(medGroup);
    return group;
  };

  Board3DView.prototype.animateDieRoll = function (value, onComplete) {
    if (!this.dieMesh) {
      if (onComplete) onComplete();
      return;
    }
    var target = getDieTargetEuler(value);
    this.dieAnim = {
      elapsed: 0,
      duration: 0.78,
      startRot: {
        x: this.dieMesh.rotation.x,
        y: this.dieMesh.rotation.y,
        z: this.dieMesh.rotation.z
      },
      endRot: {
        x: target.x + Math.PI * 4,
        y: target.y + Math.PI * 2,
        z: target.z + Math.PI * 2
      },
      onComplete: onComplete
    };
  };

  Board3DView.prototype.animatePawnMove = function (playerId, path, onStep, onComplete) {
    var pawn = this.pawnGroups[playerId];
    if (!pawn || !path || path.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    this.pawnAnim = {
      playerId: playerId,
      path: path.slice(),
      stepIndex: 0,
      stepElapsed: 0,
      stepDuration: 0.24,
      fromPos: { x: pawn.position.x, z: pawn.position.z },
      toPos: this.computePawnCoords(path[0], 0, 1),
      onStep: onStep,
      onComplete: onComplete
    };
  };

  Board3DView.prototype.zoomIn = function () {
    this.cam.goalDistance = Math.max(10.5, this.cam.goalDistance - 2.6);
  };

  Board3DView.prototype.zoomOut = function () {
    this.cam.goalDistance = Math.min(31, this.cam.goalDistance + 2.6);
  };

  Board3DView.prototype.rotateBy = function (deg) {
    this.cam.goalYaw += (deg * Math.PI) / 180;
  };

  Board3DView.prototype.resetCamera = function () {
    this.cam.goalYaw = 0.38;
    this.cam.goalPitch = 0.92;
    this.cam.goalDistance = 21.5;
    this.cam.goalTargetX = 0;
    this.cam.goalTargetZ = 0;
  };

  Board3DView.prototype.setFollowEnabled = function (enabled) {
    this.followEnabled = Boolean(enabled);
  };

  Board3DView.prototype.focusTile = function (tileIndex) {
    var tr = getTileTransform(tileIndex);
    this.cam.goalTargetX = tr.x * 0.52;
    this.cam.goalTargetZ = tr.z * 0.52;
  };

  Board3DView.prototype.bindInputEvents = function () {
    var self = this;
    var THREE = this.THREE;
    var dom = this.renderer.domElement;
    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();

    var drag = {
      active: false,
      mode: 'pan',
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      moved: 0
    };

    dom.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    dom.addEventListener('pointerdown', function (e) {
      drag.active = true;
      drag.mode = e.button === 2 || e.shiftKey ? 'orbit' : 'pan';
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.moved = 0;
    });

    global.addEventListener('pointermove', function (e) {
      var rect = dom.getBoundingClientRect();
      if (drag.active) {
        var dx = e.clientX - drag.lastX;
        var dy = e.clientY - drag.lastY;
        drag.moved += Math.hypot(dx, dy);
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;

        if (drag.mode === 'orbit') {
          self.cam.goalYaw -= dx * 0.0075;
          self.cam.goalPitch = Math.max(0.45, Math.min(1.32, self.cam.goalPitch + dy * 0.006));
        } else {
          var panSpeed = self.cam.distance * 0.0014;
          var cos = Math.cos(self.cam.yaw);
          var sin = Math.sin(self.cam.yaw);
          self.cam.goalTargetX = Math.max(-9, Math.min(9, self.cam.goalTargetX - (dx * cos + dy * sin) * panSpeed));
          self.cam.goalTargetZ = Math.max(-9, Math.min(9, self.cam.goalTargetZ - (-dx * sin + dy * cos) * panSpeed));
        }
        return;
      }

      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, self.camera);
        var deckHits = self.eventDeckMeshes.length ? raycaster.intersectObjects(self.eventDeckMeshes, false) : [];
        self.hoveredEventDeck = deckHits.length > 0;
        var hits = raycaster.intersectObjects(self.tileMeshes, false);
        self.hoveredTile = !self.hoveredEventDeck && hits.length > 0 ? hits[0].object.userData.tileIndex : null;
        dom.style.cursor = self.hoveredEventDeck || self.hoveredTile !== null ? 'pointer' : 'grab';
      }
    });

    global.addEventListener('pointerup', function (e) {
      if (!drag.active) return;
      var wasClick = drag.moved < 6 && e.button === 0;
      drag.active = false;
      if (wasClick) {
        var rect = dom.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, self.camera);
        var deckHits = self.eventDeckMeshes.length ? raycaster.intersectObjects(self.eventDeckMeshes, false) : [];
        if (deckHits.length > 0 && self.callbacks.onEventDeckClick) {
          self.callbacks.onEventDeckClick();
          return;
        }
        var hits = raycaster.intersectObjects(self.tileMeshes, false);
        if (hits.length > 0 && self.callbacks.onTileClick) {
          self.callbacks.onTileClick(hits[0].object.userData.tileIndex);
        }
      }
    });

    dom.addEventListener(
      'wheel',
      function (e) {
        e.preventDefault();
        self.cam.goalDistance = Math.max(10.5, Math.min(31, self.cam.goalDistance + e.deltaY * 0.012));
      },
      { passive: false }
    );

    global.addEventListener('resize', function () {
      if (self.disposed || !self.renderer) return;
      var w = self.container.clientWidth || global.innerWidth;
      var h = self.container.clientHeight || global.innerHeight;
      self.camera.aspect = w / h;
      self.camera.updateProjectionMatrix();
      self.renderer.setSize(w, h);
    });
  };

  Board3DView.prototype.animate = function () {
    if (this.disposed) return;
    var self = this;
    requestAnimationFrame(function () {
      self.animate();
    });

    var dt = Math.min(0.05, this.clock.getDelta());
    var elapsedTime = this.clock.elapsedTime;

    var c = this.cam;
    c.yaw += (c.goalYaw - c.yaw) * 0.12;
    c.pitch += (c.goalPitch - c.pitch) * 0.12;
    c.distance += (c.goalDistance - c.distance) * 0.12;
    c.targetX += (c.goalTargetX - c.targetX) * 0.12;
    c.targetZ += (c.goalTargetZ - c.targetZ) * 0.12;

    var horiz = Math.cos(c.pitch) * c.distance;
    this.camera.position.set(
      c.targetX + Math.sin(c.yaw) * horiz,
      Math.sin(c.pitch) * c.distance,
      c.targetZ + Math.cos(c.yaw) * horiz
    );
    this.camera.lookAt(c.targetX, 0.25, c.targetZ);

    // Building animations + steam puffs
    var bKeys = Object.keys(this.buildingGroups);
    for (var b = 0; b < bKeys.length; b++) {
      var bg = this.buildingGroups[bKeys[b]];
      if (bg.scale.x < 1) {
        var ns = Math.min(1, bg.scale.x + dt * 4.5);
        bg.scale.set(ns, ns, ns);
      }
      if (bg.userData.spinProp) {
        bg.userData.spinProp.rotation.y += dt * 1.4;
      }
      if (bg.userData.floatProp) {
        bg.userData.floatProp.position.y = bg.userData.floatBaseY + Math.sin(elapsedTime * 3) * 0.06;
      }
    }

    for (var sp = 0; sp < this.specialProps.length; sp++) {
      if (this.specialProps[sp].userData.spinProp) {
        this.specialProps[sp].userData.spinProp.rotation.y += dt * 1.2;
      }
    }

    // Expanding golden construction rings
    for (var r = this.burstRings.length - 1; r >= 0; r--) {
      var br = this.burstRings[r];
      br.age += dt;
      var prog = br.age / br.duration;
      if (prog >= 1) {
        this.scene.remove(br.mesh);
        this.burstRings.splice(r, 1);
      } else {
        var sc = 1 + prog * 2.4;
        br.mesh.scale.set(sc, sc, 1);
        br.mesh.material.opacity = (1 - prog) * 0.85;
      }
    }

    // Tile hover & teleport pulse
    for (var i = 0; i < this.tileMeshes.length; i++) {
      var tm = this.tileMeshes[i];
      var isHover = this.hoveredTile === i;
      var isTp = Boolean(this.teleportTargets[i]);
      var targetY = isHover ? 0.19 : 0.12;
      tm.position.y += (targetY - tm.position.y) * 0.22;

      var ring = tm.userData.highlightRing;
      if (isTp) {
        ring.material.color.setHex(0xa855f7);
        ring.material.opacity = 0.45 + Math.sin(elapsedTime * 6) * 0.25;
      } else if (isHover) {
        ring.material.color.setHex(0xfbbf24);
        ring.material.opacity = 0.4;
      } else {
        ring.material.opacity = 0;
      }
    }

    var pKeys = Object.keys(this.pawnGroups);
    for (var pk = 0; pk < pKeys.length; pk++) {
      var pg = this.pawnGroups[pKeys[pk]];
      if (pg.userData.medallion) {
        pg.userData.medallion.rotation.y = c.yaw;
      }
    }

    if (this.dieAnim) {
      var da = this.dieAnim;
      da.elapsed += dt;
      var t = Math.min(1, da.elapsed / da.duration);
      var ease = 1 - Math.pow(1 - t, 3);
      var arcY = Math.sin(t * Math.PI) * 2.55;
      this.dieMesh.position.y = 0.64 + arcY;
      this.dieMesh.rotation.set(
        da.startRot.x + (da.endRot.x - da.startRot.x) * ease,
        da.startRot.y + (da.endRot.y - da.startRot.y) * ease,
        da.startRot.z + (da.endRot.z - da.startRot.z) * ease
      );
      if (t >= 1) {
        var cb = da.onComplete;
        this.dieAnim = null;
        if (cb) cb();
      }
    }

    // Center 3D Event Deck aura & draw flight animation
    if (this.eventDeckAura) {
      if (this.eventDeckActive) {
        this.eventDeckAura.material.opacity = 0.5 + Math.sin(elapsedTime * 5) * 0.3;
        this.eventDeckGroup.position.y = 0.08 + Math.sin(elapsedTime * 3.5) * 0.06;
      } else {
        this.eventDeckAura.material.opacity = this.hoveredEventDeck ? 0.35 : 0;
        this.eventDeckGroup.position.y = this.hoveredEventDeck ? 0.12 : 0.06;
      }
    }
    if (this.eventDeckAnim && this.eventDeckFlyCard) {
      var ea = this.eventDeckAnim;
      ea.elapsed += dt;
      var et = Math.min(1, ea.elapsed / ea.duration);
      var ee = 1 - Math.pow(1 - et, 3);
      this.eventDeckFlyCard.position.set(0, 0.45 + ee * 3.8, ee * 1.4);
      this.eventDeckFlyCard.rotation.set(ee * 0.9, ee * Math.PI * 2, 0);
      var scCard = 1 + ee * 0.35;
      this.eventDeckFlyCard.scale.set(scCard, scCard, scCard);
      if (et >= 1) {
        this.eventDeckFlyCard.visible = false;
        var ecb = ea.onComplete;
        this.eventDeckAnim = null;
        if (ecb) ecb();
      }
    }

    if (this.pawnAnim) {
      var pa = this.pawnAnim;
      var pawn = this.pawnGroups[pa.playerId];
      pa.stepElapsed += dt;
      var st = Math.min(1, pa.stepElapsed / pa.stepDuration);
      var px = pa.fromPos.x + (pa.toPos.x - pa.fromPos.x) * st;
      var pz = pa.fromPos.z + (pa.toPos.z - pa.fromPos.z) * st;
      var py = 0.24 + Math.sin(st * Math.PI) * 0.68;
      pawn.position.set(px, py, pz);

      if (this.followEnabled) {
        c.goalTargetX = px * 0.56;
        c.goalTargetZ = pz * 0.56;
      }

      if (st >= 1) {
        if (CM.SFX && CM.SFX.playPawnHop) CM.SFX.playPawnHop();
        if (pa.onStep) pa.onStep(pa.path[pa.stepIndex]);
        pa.stepIndex += 1;
        if (pa.stepIndex >= pa.path.length) {
          var doneCb = pa.onComplete;
          this.pawnAnim = null;
          if (doneCb) doneCb();
        } else {
          pa.stepElapsed = 0;
          pa.fromPos = { x: pa.toPos.x, z: pa.toPos.z };
          pa.toPos = this.computePawnCoords(pa.path[pa.stepIndex], 0, 1);
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  Board3DView.prototype.dispose = function () {
    this.disposed = true;
    if (this.renderer) {
      this.renderer.dispose();
    }
  };

  CM.Board3D = {
    Board3DView: Board3DView
  };
})(typeof window !== 'undefined' ? window : globalThis);
