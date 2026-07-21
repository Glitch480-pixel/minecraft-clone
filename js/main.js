// Entry point: scene setup, day/night cycle, input wiring, game loop.
(function () {
  var G = window.Game;
  var DEFS = G.Blocks.DEFS;
  var DAY_LENGTH = 300; // seconds per full day/night cycle

  var scene, camera, renderer;
  var world, player, mobManager, gunManager, inventory, ui;
  var sunLight, moonLight, ambientLight;
  var highlightBox;
  var damageFlashEl;

  var dayTime = 0.3, dayCount = 1;
  var leftDown = false;
  var miningKey = null, miningProgress = 0;
  var gameStarted = false;
  var suppressAutoRelock = false;

  var game = {}; // shared handle passed to Save.js

  function isDay() {
    var theta = (dayTime - 0.25) * Math.PI * 2;
    return Math.sin(theta) > 0;
  }
  function sunHeight() {
    var theta = (dayTime - 0.25) * Math.PI * 2;
    return Math.sin(theta);
  }

  function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    sunLight = new THREE.DirectionalLight(0xfff2d0, 0.9);
    scene.add(sunLight);
    scene.add(sunLight.target);
    moonLight = new THREE.DirectionalLight(0x9fb4ff, 0.0);
    scene.add(moonLight);
    scene.add(moonLight.target);

    var saveData = G.Save.hasLocalSave() ? G.Save.loadFromLocalStorage() : null;
    var seed = saveData && saveData.seed ? saveData.seed : Math.floor(Math.random() * 1e9);

    world = new G.World(seed, scene);
    player = new G.Player(camera, world, renderer.domElement);
    inventory = new G.Inventory();
    mobManager = new G.MobManager(scene, world, player);
    gunManager = new G.GunManager(scene, world, player, mobManager);
    ui = new G.UI();

    game.world = world; game.player = player; game.inventory = inventory;
    Object.defineProperty(game, 'dayTime', { get: function () { return dayTime; }, set: function (v) { dayTime = v; } });
    Object.defineProperty(game, 'dayCount', { get: function () { return dayCount; }, set: function (v) { dayCount = v; } });

    // Ensure spawn chunk exists before positioning the player / camera.
    world.generateChunk(0, 0);

    if (saveData) {
      G.Save.applyToGame(game, saveData);
    } else {
      player.respawn(8, 8);
    }
    player.invulnerable = inventory.isCreative();
    world.update(player.position);

    damageFlashEl = document.getElementById('damageFlash');

    var edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    highlightBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
    highlightBox.visible = false;
    scene.add(highlightBox);

    mobManager.onPlayerHit = function () { flashDamage(); };

    setupInput();
    setupButtons();

    ui.showStart(G.Save.hasLocalSave(), false);

    window.addEventListener('resize', onResize);

    G.debug = {
      game: game, world: world, player: player, inventory: inventory, mobManager: mobManager,
      setDayTime: function (t) { dayTime = t; }, isDay: isDay, resetGameState: resetGameState
    };

    requestAnimationFrame(animate);
  }

  function resetGameState(mode) {
    var newSeed = Math.floor(Math.random() * 1e9);
    world.setSeed(newSeed);
    world.overrides.clear();
    inventory.reset(mode);
    mobManager.mobs.forEach(function (m) { m.remove(scene); });
    mobManager.mobs = [];
    mobManager.arrows.forEach(function (a) { scene.remove(a.mesh); });
    mobManager.arrows = [];
    dayTime = 0.3; dayCount = 1;
    world.generateChunk(0, 0);
    player.respawn(8, 8);
    player.invulnerable = inventory.isCreative();
    world.update(player.position);
  }

  function flashDamage() {
    if (!damageFlashEl) return;
    damageFlashEl.style.opacity = '1';
    setTimeout(function () { damageFlashEl.style.opacity = '0'; }, 150);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function playerAABBIntersectsCell(x, y, z) {
    var hw = player.width / 2, p = player.position;
    var pminX = p.x - hw, pmaxX = p.x + hw;
    var pminY = p.y, pmaxY = p.y + player.height;
    var pminZ = p.z - hw, pmaxZ = p.z + hw;
    return !(x + 1 <= pminX || x >= pmaxX || y + 1 <= pminY || y >= pmaxY || z + 1 <= pminZ || z >= pmaxZ);
  }

  function tryPlaceBlock() {
    if (!player.alive || ui.isCraftingOpen()) return;
    if (inventory.getSelectedGunId()) return;
    var blockId = inventory.getSelectedBlockId();
    if (!blockId) { ui.toast('No blocks left in this slot'); return; }
    var origin = player.getEyePosition(), dir = player.getForward();
    var hit = world.raycast(origin, dir, player.reach);
    if (!hit.hit) return;
    var px = hit.prev.x, py = hit.prev.y, pz = hit.prev.z;
    if (world.getBlock(px, py, pz) !== 0) return;
    if (playerAABBIntersectsCell(px, py, pz)) return;
    world.setBlock(px, py, pz, blockId);
    inventory.consumeSelectedBlock();
  }

  function setupInput() {
    renderer.domElement.addEventListener('mousedown', function (e) {
      if (!player.locked) return;
      if (e.button === 0) leftDown = true;
      if (e.button === 2) tryPlaceBlock();
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) leftDown = false;
    });
    window.addEventListener('blur', function () { leftDown = false; });

    window.addEventListener('wheel', function (e) {
      if (!player.locked) return;
      var dir = e.deltaY > 0 ? 1 : -1;
      inventory.selectSlot((inventory.selected + dir + 9) % 9);
    });

    player.onSpecialKey = function (code) {
      if (code >= 'Digit1' && code <= 'Digit9') {
        inventory.selectSlot(code.charCodeAt(5) - '1'.charCodeAt(0));
      } else if (code === 'KeyC' || code === 'KeyE') {
        var opened = ui.toggleCrafting(inventory);
        if (opened) { suppressAutoRelock = true; player.unlock(); }
        else { suppressAutoRelock = false; player.lock(); }
      }
    };

    player.onLockChange = function (locked) {
      if (!locked && gameStarted && player.alive && !suppressAutoRelock && !ui.isCraftingOpen()) {
        ui.showStart(false, true);
      }
    };

    player.onDeath = function () {
      ui.showDeath();
      player.unlock();
    };

    // F5/F9 work regardless of pointer-lock state, since locked gameplay has no
    // visible cursor to click the on-screen Save/Load buttons with.
    window.addEventListener('keydown', function (e) {
      if (e.code === 'F5') { e.preventDefault(); quickSave(); }
      else if (e.code === 'F9') { e.preventDefault(); quickLoad(); }
    });
  }

  function quickSave() {
    if (!gameStarted) return;
    G.Save.saveToLocalStorage(game);
    ui.toast('Game saved (F5)');
  }

  function quickLoad() {
    if (!gameStarted) return;
    var data = G.Save.loadFromLocalStorage();
    if (!data) { ui.toast('No save found'); return; }
    if (data.seed !== world.seed) world.setSeed(data.seed);
    else world.reset();
    G.Save.applyToGame(game, data);
    player.invulnerable = inventory.isCreative();
    world.update(player.position);
    ui.toast('Game loaded (F9)');
  }

  function enterPlay() {
    ui.hideStart();
    gameStarted = true;
    ui.showPlayUI();
    player.lock();
  }

  function setupButtons() {
    document.getElementById('survivalBtn').addEventListener('click', function () {
      resetGameState('survival');
      enterPlay();
    });
    document.getElementById('creativeBtn').addEventListener('click', function () {
      resetGameState('creative');
      enterPlay();
    });
    document.getElementById('continueBtn').addEventListener('click', enterPlay);
    document.getElementById('respawnBtn').addEventListener('click', function () {
      ui.hideDeath();
      player.respawn(player.position.x, player.position.z);
      player.lock();
    });
    document.getElementById('saveBtn').addEventListener('click', quickSave);
    document.getElementById('loadBtn').addEventListener('click', quickLoad);
    document.getElementById('exportBtn').addEventListener('click', function () {
      G.Save.exportToFile(game);
    });
    document.getElementById('importBtn').addEventListener('click', function () {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      G.Save.importFromFile(file, function (err, data) {
        if (err) { ui.toast('Invalid save file'); return; }
        if (data.seed !== world.seed) world.setSeed(data.seed);
        else world.reset();
        G.Save.applyToGame(game, data);
        player.invulnerable = inventory.isCreative();
        world.update(player.position);
        ui.toast('Save imported');
      });
      e.target.value = '';
    });
  }

  var lastNoPickaxeToast = -999;

  function updateMiningAndShooting(dt) {
    if (!leftDown || !player.locked || !player.alive || ui.isCraftingOpen()) {
      miningKey = null; miningProgress = 0;
      return;
    }
    var gunId = inventory.getSelectedGunId();
    if (gunId) {
      gunManager.shoot(gunId, inventory);
      return;
    }
    var origin = player.getEyePosition(), dir = player.getForward();
    var hit = world.raycast(origin, dir, player.reach);
    if (!hit.hit) { miningKey = null; miningProgress = 0; return; }
    var blockId = world.getBlock(hit.x, hit.y, hit.z);
    var def = DEFS[blockId];
    if (!def || def.hardness === Infinity) return;

    if (!inventory.canMine(def)) {
      miningKey = null; miningProgress = 0;
      var now = performance.now();
      if (now - lastNoPickaxeToast > 1500) {
        lastNoPickaxeToast = now;
        ui.toast('Need a pickaxe to mine ' + def.name);
      }
      return;
    }

    var key = hit.x + ',' + hit.y + ',' + hit.z;
    if (key !== miningKey) { miningKey = key; miningProgress = 0; }
    miningProgress += dt;
    var required = inventory.isCreative() ? 0 : def.hardness;
    if (miningProgress >= required) {
      if (!inventory.isCreative()) inventory.onBlockBroken(blockId);
      world.setBlock(hit.x, hit.y, hit.z, 0);
      miningKey = null; miningProgress = 0;
    }
  }

  function updateHighlight() {
    if (!player.locked || !player.alive || ui.isCraftingOpen()) { highlightBox.visible = false; return; }
    var origin = player.getEyePosition(), dir = player.getForward();
    var hit = world.raycast(origin, dir, player.reach);
    if (hit.hit) {
      highlightBox.visible = true;
      highlightBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      highlightBox.visible = false;
    }
  }

  function updateSky() {
    var h = sunHeight();
    var t = THREE.MathUtils.clamp((h + 0.2) / 1.15, 0, 1);
    var dayColor = new THREE.Color(0x8fc7ea);
    var nightColor = new THREE.Color(0x050818);
    var skyColor = nightColor.clone().lerp(dayColor, t);
    // subtle warm tint near sunrise/sunset
    var horizonFactor = 1 - Math.min(1, Math.abs(h) / 0.35);
    if (horizonFactor > 0) skyColor.lerp(new THREE.Color(0xffa860), horizonFactor * 0.35 * (h > -0.3 ? 1 : 0));
    scene.background = skyColor;
    if (!scene.fog) scene.fog = new THREE.Fog(skyColor, 40, 140);
    scene.fog.color = skyColor;
    var rd = world.renderDistance * 16;
    scene.fog.near = rd * 0.5;
    scene.fog.far = rd * 0.98;

    var theta = (dayTime - 0.25) * Math.PI * 2;
    var sunDir = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0.35).normalize();
    sunLight.position.copy(player.position).addScaledVector(sunDir, 80);
    sunLight.target.position.copy(player.position);
    sunLight.intensity = Math.max(0, t) * 0.95;

    var moonDir = sunDir.clone().multiplyScalar(-1);
    moonLight.position.copy(player.position).addScaledVector(moonDir, 80);
    moonLight.target.position.copy(player.position);
    moonLight.intensity = Math.max(0, 1 - t) * 0.28;

    ambientLight.intensity = 0.22 + t * 0.33;
  }

  var clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.1);

    if (gameStarted && player.alive) {
      dayTime += dt / DAY_LENGTH;
      if (dayTime >= 1) { dayTime -= 1; dayCount++; }
    }

    updateSky();

    if (gameStarted) {
      player.update(dt);
      world.update(player.position);
      mobManager.update(dt, isDay());
      gunManager.update(dt);
      updateMiningAndShooting(dt);
      updateHighlight();

      ui.updateHealth(player.health, player.maxHealth);
      ui.updateHotbar(inventory);
      ui.updateResources(inventory);
      ui.updateDayNight(isDay(), dayCount, dayTime);
      ui.updateMode(inventory.mode);
    }

    renderer.render(scene, camera);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
