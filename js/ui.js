// DOM/HUD glue: hotbar, health, resources, day/night readout, crafting panel, toasts.
(function () {
  var G = window.Game = window.Game || {};
  var DEFS = G.Blocks.DEFS;

  var RESOURCE_LABELS = { wood: 'Wood', stone: 'Stone', sand: 'Sand', iron: 'Iron', coal: 'Coal', gold: 'Gold', diamond: 'Diamond', ammo: 'Ammo' };

  var iconCache = {};
  function blockIconDataURL(blockId) {
    if (iconCache[blockId]) return iconCache[blockId];
    var atlasImg = G.Blocks.atlasTexture.image;
    var grid = G.Blocks.TILE_GRID;
    var tileSize = atlasImg.width / grid;
    var uv = DEFS[blockId].faces.top;
    var sx = uv.u0 * atlasImg.width, sy = (1 - uv.v1) * atlasImg.height;
    var c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlasImg, sx, sy, tileSize, tileSize, 0, 0, 32, 32);
    var url = c.toDataURL();
    iconCache[blockId] = url;
    return url;
  }

  function gunIconDataURL(gunId) {
    var key = 'gun_' + gunId;
    if (iconCache[key]) return iconCache[key];
    var c = document.createElement('canvas'); c.width = 32; c.height = 32;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#2a2a2a';
    if (gunId === 'pistol') {
      ctx.fillRect(6, 14, 18, 6);
      ctx.fillRect(8, 20, 6, 8);
    } else {
      ctx.fillRect(4, 13, 24, 5);
      ctx.fillRect(6, 18, 5, 9);
      ctx.fillStyle = '#5c3e22';
      ctx.fillRect(20, 13, 6, 5);
    }
    var url = c.toDataURL();
    iconCache[key] = url;
    return url;
  }

  function UI() {
    this.hud = document.getElementById('hud');
    this.crosshair = document.getElementById('crosshair');
    this.hotbarEl = document.getElementById('hotbar');
    this.healthFill = document.getElementById('healthFill');
    this.resourceBar = document.getElementById('resourceBar');
    this.dnIcon = document.getElementById('dnIcon');
    this.dnLabel = document.getElementById('dnLabel');
    this.toastEl = document.getElementById('toast');
    this.craftingPanel = document.getElementById('craftingPanel');
    this.craftResources = document.getElementById('craftResources');
    this.craftRecipes = document.getElementById('craftRecipes');
    this.deathScreen = document.getElementById('deathScreen');
    this.startScreen = document.getElementById('startScreen');
    this.loadHint = document.getElementById('loadHint');
    this.toastTimer = null;

    this.slots = [];
    for (var i = 0; i < 9; i++) {
      var el = document.createElement('div');
      el.className = 'hotbar-slot';
      el.innerHTML = '<span class="key">' + (i + 1) + '</span><img class="swatch"><span class="count"></span><span class="label"></span>';
      this.hotbarEl.appendChild(el);
      this.slots.push(el);
    }
  }

  UI.prototype.showPlayUI = function () {
    this.hud.classList.add('visible');
    this.hotbarEl.classList.add('visible');
    this.crosshair.style.display = 'block';
  };
  UI.prototype.hidePlayUI = function () {
    this.hud.classList.remove('visible');
    this.hotbarEl.classList.remove('visible');
    this.crosshair.style.display = 'none';
  };

  UI.prototype.updateHealth = function (health, maxHealth) {
    var pct = Math.max(0, health / maxHealth) * 100;
    this.healthFill.style.width = pct + '%';
  };

  UI.prototype.updateResources = function (inv) {
    var parts = [];
    for (var k in RESOURCE_LABELS) {
      var v = inv.resources[k] || 0;
      if (v > 0 || k === 'ammo') parts.push(RESOURCE_LABELS[k] + ': ' + v);
    }
    this.resourceBar.innerHTML = parts.join('<br>');
  };

  UI.prototype.updateHotbar = function (inv) {
    for (var i = 0; i < 9; i++) {
      var slotData = inv.hotbar[i];
      var el = this.slots[i];
      el.classList.toggle('selected', inv.selected === i);
      var img = el.querySelector('.swatch');
      var count = el.querySelector('.count');
      var label = el.querySelector('.label');
      if (slotData.kind === 'block') {
        img.style.visibility = 'visible';
        img.src = blockIconDataURL(slotData.id);
        count.textContent = slotData.count > 0 ? slotData.count : '';
        label.textContent = slotData.count > 0 ? G.Blocks.DEFS[slotData.id].name : '';
        el.style.opacity = slotData.count > 0 ? '1' : '0.45';
      } else { // gun
        if (slotData.id) {
          img.style.visibility = 'visible';
          img.src = gunIconDataURL(slotData.id);
          label.textContent = G.GUN_DEFS[slotData.id].name;
          count.textContent = '';
          el.style.opacity = '1';
        } else {
          img.style.visibility = 'hidden';
          label.textContent = 'Gun';
          count.textContent = '';
          el.style.opacity = '0.3';
        }
      }
    }
  };

  UI.prototype.updateDayNight = function (isDay, dayCount, frac) {
    this.dnIcon.innerHTML = isDay ? '&#9728;' : '&#9789;';
    this.dnLabel.textContent = (isDay ? 'Day ' : 'Night ') + dayCount;
  };

  UI.prototype.toast = function (msg) {
    var self = this;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(function () { self.toastEl.classList.remove('show'); }, 2200);
  };

  UI.prototype.toggleCrafting = function (inv) {
    var hidden = this.craftingPanel.classList.contains('hidden');
    if (hidden) this.openCrafting(inv); else this.closeCrafting();
    return hidden;
  };

  UI.prototype.openCrafting = function (inv) {
    this.craftingPanel.classList.remove('hidden');
    this.refreshCrafting(inv);
  };
  UI.prototype.closeCrafting = function () {
    this.craftingPanel.classList.add('hidden');
  };
  UI.prototype.isCraftingOpen = function () {
    return !this.craftingPanel.classList.contains('hidden');
  };

  UI.prototype.refreshCrafting = function (inv, onCraft) {
    var parts = [];
    for (var k in RESOURCE_LABELS) parts.push(RESOURCE_LABELS[k] + ': ' + (inv.resources[k] || 0));
    this.craftResources.innerHTML = parts.join(' &nbsp;|&nbsp; ');

    var self = this;
    this.craftRecipes.innerHTML = '';
    G.RECIPES.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'recipe';
      var costStr = Object.keys(r.cost).map(function (k) { return r.cost[k] + ' ' + RESOURCE_LABELS[k]; }).join(', ');
      var already = r.give.gun && inv.guns[r.give.gun];
      row.innerHTML = '<div class="info">' + r.name + '<span class="cost">' + costStr + '</span></div>';
      var btn = document.createElement('button');
      btn.textContent = already ? 'Owned' : 'Craft';
      btn.disabled = already || !inv.canAfford(r.cost);
      btn.addEventListener('click', function () {
        var res = inv.craft(r.id);
        self.toast(res.msg);
        self.refreshCrafting(inv);
        if (onCraft) onCraft(res);
      });
      row.appendChild(btn);
      self.craftRecipes.appendChild(row);
    });
  };

  UI.prototype.showDeath = function () { this.deathScreen.classList.remove('hidden'); };
  UI.prototype.hideDeath = function () { this.deathScreen.classList.add('hidden'); };

  UI.prototype.showStart = function (hasSave) {
    this.startScreen.classList.remove('hidden');
    this.loadHint.textContent = hasSave ? 'A saved world was found — it will load automatically.' : '';
  };
  UI.prototype.hideStart = function () { this.startScreen.classList.add('hidden'); };

  G.UI = UI;
})();
