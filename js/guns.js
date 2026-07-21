// Craftable ranged weapons: pistol & shotgun. Hitscan shooting against mobs.
(function () {
  var G = window.Game = window.Game || {};

  var GUN_DEFS = {
    pistol: {
      id: 'pistol', name: 'Pistol', damage: 9, range: 45, fireRate: 0.28,
      ammoPerShot: 1, pellets: 1, spread: 0.012,
      cost: { wood: 1, iron: 3 }
    },
    shotgun: {
      id: 'shotgun', name: 'Shotgun', damage: 5, range: 16, fireRate: 0.85,
      ammoPerShot: 2, pellets: 6, spread: 0.11,
      cost: { wood: 2, iron: 5, coal: 2 }
    }
  };

  function GunManager(scene, world, player, mobManager) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.mobManager = mobManager;
    this.tracers = [];
    this.lastShotTime = -999;
    this.flashLight = new THREE.PointLight(0xffcc66, 0, 8);
    scene.add(this.flashLight);
    this.flashTimer = 0;
    this.onFire = null;
    this.onNoAmmo = null;
  }

  GunManager.prototype.shoot = function (gunId, inventory) {
    var def = GUN_DEFS[gunId];
    if (!def) return false;
    var now = performance.now() / 1000;
    if (now - this.lastShotTime < def.fireRate) return false;
    if (inventory.resources.ammo < def.ammoPerShot) {
      if (this.onNoAmmo) this.onNoAmmo();
      return false;
    }
    inventory.resources.ammo -= def.ammoPerShot;
    this.lastShotTime = now;

    var origin = this.player.getEyePosition();
    var baseDir = this.player.getForward();
    var pellets = def.pellets;

    for (var i = 0; i < pellets; i++) {
      var dir = baseDir.clone();
      if (def.spread > 0) {
        dir.x += (Math.random() - 0.5) * def.spread;
        dir.y += (Math.random() - 0.5) * def.spread;
        dir.z += (Math.random() - 0.5) * def.spread;
        dir.normalize();
      }
      var hitMob = this.mobManager.findClosestHit(origin, dir, def.range);
      var endPoint;
      if (hitMob) {
        this.mobManager.damageMob(hitMob, def.damage);
        endPoint = hitMob.pos.clone().add(new THREE.Vector3(0, 0.95, 0));
      } else {
        var bh = this.world.raycast(origin, dir, def.range);
        endPoint = bh.hit ? new THREE.Vector3(bh.x + 0.5, bh.y + 0.5, bh.z + 0.5) : origin.clone().add(dir.clone().multiplyScalar(def.range));
      }
      this._addTracer(origin, endPoint);
    }

    this.flashLight.position.copy(origin).add(baseDir.clone().multiplyScalar(0.5));
    this.flashLight.intensity = 2.2;
    this.flashTimer = 0.06;

    if (this.onFire) this.onFire(gunId);
    return true;
  };

  GunManager.prototype._addTracer = function (start, end) {
    var geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    var mat = new THREE.LineBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9 });
    var line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line: line, life: 0.08 });
  };

  GunManager.prototype.update = function (dt) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashLight.intensity = 0;
    }
    for (var i = this.tracers.length - 1; i >= 0; i--) {
      var t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.08) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  };

  G.GUN_DEFS = GUN_DEFS;
  G.GunManager = GunManager;
})();
