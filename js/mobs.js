// Zombies and skeletons: spawning at night, simple chase/ranged AI, daylight burning.
(function () {
  var G = window.Game = window.Game || {};

  var MOB_WIDTH = 0.6, MOB_HEIGHT = 1.85;
  var GRAVITY = 26;

  function box(w, h, d, color) {
    var geo = new THREE.BoxGeometry(w, h, d);
    var mat = new THREE.MeshLambertMaterial({ color: color });
    return new THREE.Mesh(geo, mat);
  }

  function buildZombieMesh() {
    var g = new THREE.Group();
    var skin = 0x3a8f3a, shirt = 0x2f6f92, pants = 0x30407a;
    var head = box(0.5, 0.5, 0.5, skin); head.position.y = 1.6; g.add(head);
    var eyeL = box(0.08, 0.08, 0.05, 0x111111); eyeL.position.set(-0.12, 1.62, 0.26); g.add(eyeL);
    var eyeR = box(0.08, 0.08, 0.05, 0x111111); eyeR.position.set(0.12, 1.62, 0.26); g.add(eyeR);
    var body = box(0.5, 0.75, 0.28, shirt); body.position.y = 1.02; g.add(body);
    var armL = box(0.22, 0.72, 0.22, skin); armL.position.set(-0.36, 1.02, 0); armL.name = 'armL'; g.add(armL);
    var armR = box(0.22, 0.72, 0.22, skin); armR.position.set(0.36, 1.02, 0); armR.name = 'armR'; g.add(armR);
    var legL = box(0.22, 0.7, 0.22, pants); legL.position.set(-0.14, 0.35, 0); legL.name = 'legL'; g.add(legL);
    var legR = box(0.22, 0.7, 0.22, pants); legR.position.set(0.14, 0.35, 0); legR.name = 'legR'; g.add(legR);
    g.userData.parts = { armL: armL, armR: armR, legL: legL, legR: legR, head: head };
    g.userData.baseMats = [head.material, body.material, armL.material, armR.material, legL.material, legR.material];
    return g;
  }

  function buildSkeletonMesh() {
    var g = new THREE.Group();
    var bone = 0xd9d3b8, dark = 0x8a8468;
    var head = box(0.46, 0.46, 0.46, bone); head.position.y = 1.62; g.add(head);
    var eyeL = box(0.08, 0.08, 0.05, 0x111111); eyeL.position.set(-0.1, 1.64, 0.24); g.add(eyeL);
    var eyeR = box(0.08, 0.08, 0.05, 0x111111); eyeR.position.set(0.1, 1.64, 0.24); g.add(eyeR);
    var body = box(0.42, 0.75, 0.22, dark); body.position.y = 1.02; g.add(body);
    var armL = box(0.16, 0.7, 0.16, bone); armL.position.set(-0.3, 1.02, 0); armL.name = 'armL'; g.add(armL);
    var armR = box(0.16, 0.7, 0.16, bone); armR.position.set(0.3, 1.02, 0); armR.name = 'armR'; g.add(armR);
    var legL = box(0.16, 0.7, 0.16, bone); legL.position.set(-0.12, 0.35, 0); legL.name = 'legL'; g.add(legL);
    var legR = box(0.16, 0.7, 0.16, bone); legR.position.set(0.12, 0.35, 0); legR.name = 'legR'; g.add(legR);
    var bow = box(0.08, 0.55, 0.08, 0x6b4a2b); bow.position.set(0.42, 1.05, 0.1); bow.name = 'bow'; g.add(bow);
    g.userData.parts = { armL: armL, armR: armR, legL: legL, legR: legR, head: head, bow: bow };
    g.userData.baseMats = [head.material, body.material, armL.material, armR.material, legL.material, legR.material];
    return g;
  }

  function makeFireSprite() {
    var c = document.createElement('canvas'); c.width = 32; c.height = 32;
    var ctx = c.getContext('2d');
    var grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,240,150,0.95)');
    grad.addColorStop(0.5, 'rgba(255,140,20,0.75)');
    grad.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
    var tex = new THREE.CanvasTexture(c);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    return new THREE.Sprite(mat);
  }

  function exposedToSky(world, x, y, z) {
    var bx = Math.floor(x), bz = Math.floor(z);
    for (var yy = Math.floor(y) + 1; yy < G.World.CH; yy++) {
      if (world.isSolid(bx, yy, bz)) return false;
    }
    return true;
  }

  function collides(world, x, y, z, w, h) {
    var hw = w / 2;
    var minX = Math.floor(x - hw), maxX = Math.floor(x + hw);
    var minY = Math.floor(y), maxY = Math.floor(y + h - 0.01);
    var minZ = Math.floor(z - hw), maxZ = Math.floor(z + hw);
    for (var bx = minX; bx <= maxX; bx++)
      for (var by = minY; by <= maxY; by++)
        for (var bz = minZ; bz <= maxZ; bz++)
          if (world.isSolid(bx, by, bz)) return true;
    return false;
  }

  function Mob(type, pos, scene) {
    this.type = type;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.health = type === 'zombie' ? 20 : 14;
    this.maxHealth = this.health;
    this.alive = true;
    this.onGround = false;
    this.burning = false;
    this.attackCooldown = 0;
    this.shootCooldown = Math.random() * 1.5;
    this.wanderTimer = 0;
    this.wanderDir = new THREE.Vector3();
    this.walkAnim = 0;
    this.mesh = type === 'zombie' ? buildZombieMesh() : buildSkeletonMesh();
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
    this.fireSprite = null;
  }

  Mob.prototype.remove = function (scene) {
    scene.remove(this.mesh);
    if (this.fireSprite) scene.remove(this.fireSprite);
  };

  function Arrow(pos, dir, scene) {
    this.pos = pos.clone();
    this.vel = dir.clone().multiplyScalar(20);
    this.life = 3;
    var geo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5);
    geo.rotateX(Math.PI / 2);
    var mat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  function MobManager(scene, world, player) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.mobs = [];
    this.arrows = [];
    this.maxMobs = 14;
    this.spawnTimer = 0;
    this.onPlayerHit = null;
  }

  MobManager.prototype.trySpawn = function (isDay) {
    if (isDay) return;
    if (this.mobs.length >= this.maxMobs) return;
    var p = this.player.position;
    var angle = Math.random() * Math.PI * 2;
    var dist = 14 + Math.random() * 18;
    var wx = Math.floor(p.x + Math.cos(angle) * dist);
    var wz = Math.floor(p.z + Math.sin(angle) * dist);
    var sy = this.world.getSurfaceY(wx, wz);
    if (sy <= G.World.SEA_LEVEL) return;
    var type = Math.random() < 0.5 ? 'zombie' : 'skeleton';
    var mob = new Mob(type, new THREE.Vector3(wx + 0.5, sy + 1, wz + 0.5), this.scene);
    this.mobs.push(mob);
  };

  MobManager.prototype.damageMob = function (mob, amount) {
    mob.health -= amount;
    if (mob.health <= 0 && mob.alive) {
      mob.alive = false;
    }
  };

  MobManager.prototype.findClosestHit = function (origin, dir, maxDist) {
    var best = null, bestDist = maxDist;
    for (var i = 0; i < this.mobs.length; i++) {
      var m = this.mobs[i];
      if (!m.alive) continue;
      var center = m.pos.clone().add(new THREE.Vector3(0, 0.95, 0));
      var toMob = center.clone().sub(origin);
      var proj = toMob.dot(dir);
      if (proj < 0 || proj > maxDist) continue;
      var closest = origin.clone().add(dir.clone().multiplyScalar(proj));
      var d = closest.distanceTo(center);
      if (d < 0.65 && proj < bestDist) { best = m; bestDist = proj; }
    }
    return best;
  };

  MobManager.prototype.update = function (dt, isDay) {
    this.spawnTimer += dt;
    if (this.spawnTimer > 2.2) {
      this.spawnTimer = 0;
      this.trySpawn(isDay);
    }

    var p = this.player;
    var playerFeet = p.position;

    for (var i = this.mobs.length - 1; i >= 0; i--) {
      var m = this.mobs[i];

      // Burning in daylight
      if (isDay && exposedToSky(this.world, m.pos.x, m.pos.y, m.pos.z)) {
        m.burning = true;
        m.health -= dt * 5;
        if (!m.fireSprite) {
          m.fireSprite = makeFireSprite();
          m.fireSprite.scale.set(0.9, 0.9, 0.9);
          this.scene.add(m.fireSprite);
        }
        m.fireSprite.position.set(m.pos.x, m.pos.y + 1.0, m.pos.z);
        var parts = m.mesh.userData.baseMats;
        for (var pm = 0; pm < parts.length; pm++) parts[pm].color.setHex(0xff5a2e);
      } else if (m.burning) {
        m.burning = false;
        if (m.fireSprite) { this.scene.remove(m.fireSprite); m.fireSprite = null; }
        var parts2 = m.mesh.userData.baseMats;
        var origColors = m.type === 'zombie' ? [0x3a8f3a, 0x2f6f92, 0x3a8f3a, 0x3a8f3a, 0x30407a, 0x30407a] : [0xd9d3b8, 0x8a8468, 0xd9d3b8, 0xd9d3b8, 0xd9d3b8, 0xd9d3b8];
        for (var pm2 = 0; pm2 < parts2.length; pm2++) parts2[pm2].color.setHex(origColors[pm2]);
      }

      if (!m.alive || m.health <= 0) {
        m.remove(this.scene);
        this.mobs.splice(i, 1);
        continue;
      }

      var dx = playerFeet.x - m.pos.x, dz = playerFeet.z - m.pos.z;
      var horizDist = Math.sqrt(dx * dx + dz * dz);
      var aggro = horizDist < 20 && p.alive;

      var desired = new THREE.Vector3();
      if (aggro) {
        m.yaw = Math.atan2(dx, dz);
        if (m.type === 'zombie') {
          if (horizDist > 1.1) {
            desired.set(dx, 0, dz).normalize().multiplyScalar(3.3);
          }
          if (horizDist < 1.4) {
            m.attackCooldown -= dt;
            if (m.attackCooldown <= 0) {
              m.attackCooldown = 1.0;
              p.damage(3 + Math.random() * 2);
              if (this.onPlayerHit) this.onPlayerHit();
            }
          }
        } else { // skeleton kiting behavior
          if (horizDist > 11) desired.set(dx, 0, dz).normalize().multiplyScalar(2.6);
          else if (horizDist < 6) desired.set(-dx, 0, -dz).normalize().multiplyScalar(2.4);
          m.shootCooldown -= dt;
          if (m.shootCooldown <= 0 && horizDist < 18) {
            m.shootCooldown = 1.5 + Math.random() * 0.6;
            var eye = new THREE.Vector3(m.pos.x, m.pos.y + 1.5, m.pos.z);
            var targetEye = p.getEyePosition();
            var dir = targetEye.clone().sub(eye).normalize();
            this.arrows.push(new Arrow(eye, dir, this.scene));
          }
        }
      } else {
        m.wanderTimer -= dt;
        if (m.wanderTimer <= 0) {
          m.wanderTimer = 2 + Math.random() * 3;
          var a = Math.random() * Math.PI * 2;
          m.wanderDir.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(1.6);
        }
        desired.copy(m.wanderDir);
        if (desired.lengthSq() > 0.0001) m.yaw = Math.atan2(desired.x, desired.z);
      }

      m.vel.x = desired.x; m.vel.z = desired.z;
      m.vel.y -= GRAVITY * dt;
      if (m.vel.y < -50) m.vel.y = -50;

      var w = this.world;
      var nx = m.pos.x + m.vel.x * dt;
      if (!collides(w, nx, m.pos.y, m.pos.z, MOB_WIDTH, MOB_HEIGHT)) m.pos.x = nx;
      var nz = m.pos.z + m.vel.z * dt;
      if (!collides(w, m.pos.x, m.pos.y, nz, MOB_WIDTH, MOB_HEIGHT)) m.pos.z = nz;

      // auto-step / jump over obstacles
      if ((desired.x !== 0 || desired.z !== 0) && m.onGround) {
        var aheadX = m.pos.x + Math.sign(desired.x) * 0.4;
        var aheadZ = m.pos.z + Math.sign(desired.z) * 0.4;
        if (collides(w, aheadX, m.pos.y, aheadZ, MOB_WIDTH, MOB_HEIGHT) &&
            !collides(w, aheadX, m.pos.y + 1.05, aheadZ, MOB_WIDTH, MOB_HEIGHT)) {
          m.vel.y = 8.0; m.onGround = false;
        }
      }

      var ny = m.pos.y + m.vel.y * dt;
      if (!collides(w, m.pos.x, ny, m.pos.z, MOB_WIDTH, MOB_HEIGHT)) {
        m.pos.y = ny; m.onGround = false;
      } else {
        if (m.vel.y < 0) m.onGround = true;
        m.vel.y = 0;
      }

      m.mesh.position.copy(m.pos);
      m.mesh.rotation.y = m.yaw;

      // walk animation (swing arms/legs)
      var moving = desired.lengthSq() > 0.01;
      if (moving) m.walkAnim += dt * 8; else m.walkAnim *= 0.9;
      var swing = Math.sin(m.walkAnim) * 0.6;
      var parts3 = m.mesh.userData.parts;
      if (parts3.armL) parts3.armL.rotation.x = swing;
      if (parts3.armR) parts3.armR.rotation.x = -swing;
      if (parts3.legL) parts3.legL.rotation.x = -swing;
      if (parts3.legR) parts3.legR.rotation.x = swing;
    }

    // arrows
    for (var ai = this.arrows.length - 1; ai >= 0; ai--) {
      var a = this.arrows[ai];
      a.life -= dt;
      a.pos.add(a.vel.clone().multiplyScalar(dt));
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.clone().add(a.vel));
      var eye = p.getEyePosition();
      var hitPlayer = p.alive && a.pos.distanceTo(eye) < 0.7;
      var hitBlock = this.world.isSolid(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z));
      if (hitPlayer) {
        p.damage(3 + Math.random() * 2);
        if (this.onPlayerHit) this.onPlayerHit();
      }
      if (hitPlayer || hitBlock || a.life <= 0) {
        this.scene.remove(a.mesh);
        this.arrows.splice(ai, 1);
      }
    }
  };

  G.MobManager = MobManager;
})();
