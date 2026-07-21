// Save/load: localStorage persistence + JSON file export/import.
// Only the world *diff* (player-modified blocks) is stored - terrain is regenerated
// deterministically from the seed, so saves stay small.
(function () {
  var G = window.Game = window.Game || {};
  var STORAGE_KEY = 'voxelcraft_save_v1';

  function serialize(game) {
    var overridesObj = {};
    game.world.overrides.forEach(function (val, key) { overridesObj[key] = val; });
    return {
      version: 1,
      seed: game.world.seed,
      dayTime: game.dayTime,
      dayCount: game.dayCount,
      player: {
        x: game.player.position.x, y: game.player.position.y, z: game.player.position.z,
        yaw: game.player.yaw, pitch: game.player.pitch, health: game.player.health
      },
      inventory: game.inventory.serialize(),
      overrides: overridesObj
    };
  }

  function saveToLocalStorage(game) {
    try {
      var data = serialize(game);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Save failed', e);
      return false;
    }
  }

  function loadFromLocalStorage() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function hasLocalSave() {
    return !!localStorage.getItem(STORAGE_KEY);
  }

  function exportToFile(game) {
    var data = serialize(game);
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'voxelcraft-save.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importFromFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        cb(null, data);
      } catch (e) {
        cb(e, null);
      }
    };
    reader.onerror = function (e) { cb(e, null); };
    reader.readAsText(file);
  }

  function applyToGame(game, data) {
    if (!data) return;
    game.dayTime = typeof data.dayTime === 'number' ? data.dayTime : game.dayTime;
    game.dayCount = data.dayCount || 1;
    if (data.player) {
      game.player.position.set(data.player.x, data.player.y, data.player.z);
      game.player.yaw = data.player.yaw || 0;
      game.player.pitch = data.player.pitch || 0;
      game.player.health = typeof data.player.health === 'number' ? data.player.health : game.player.maxHealth;
      game.player.alive = game.player.health > 0;
    }
    if (data.inventory) game.inventory.deserialize(data.inventory);
    if (data.overrides) {
      var map = new Map();
      for (var k in data.overrides) map.set(k, data.overrides[k]);
      game.world.overrides = map;
    }
  }

  G.Save = {
    serialize: serialize,
    saveToLocalStorage: saveToLocalStorage,
    loadFromLocalStorage: loadFromLocalStorage,
    hasLocalSave: hasLocalSave,
    exportToFile: exportToFile,
    importFromFile: importFromFile,
    applyToGame: applyToGame
  };
})();
