// First-person controller: pointer-lock mouse look, WASD movement, gravity, AABB collision.
(function () {
  var G = window.Game = window.Game || {};
  var GRAVITY = 26;
  var WALK_SPEED = 4.6;
  var SPRINT_SPEED = 7.4;
  var JUMP_SPEED = 8.6;

  function Player(camera, world, domElement) {
    this.camera = camera;
    this.world = world;
    this.dom = domElement;

    this.position = new THREE.Vector3(0, 40, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; this.pitch = 0;
    this.width = 0.6; this.height = 1.8; this.eyeHeight = 1.62;
    this.onGround = false;
    this.health = 20; this.maxHealth = 20;
    this.alive = true;
    this.locked = false;
    this.reach = 6;
    this.sensitivity = 0.0022;
    this.lastDamageTime = -999;

    this.keys = {};
    this._bindEvents();
  }

  Player.prototype._bindEvents = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      self.keys[e.code] = true;
      if (self.onSpecialKey) self.onSpecialKey(e.code);
    });
    window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });

    document.addEventListener('pointerlockchange', function () {
      self.locked = document.pointerLockElement === self.dom;
      if (self.onLockChange) self.onLockChange(self.locked);
    });

    document.addEventListener('mousemove', function (e) {
      if (!self.locked) return;
      self.yaw -= e.movementX * self.sensitivity;
      self.pitch -= e.movementY * self.sensitivity;
      var lim = Math.PI / 2 - 0.02;
      if (self.pitch > lim) self.pitch = lim;
      if (self.pitch < -lim) self.pitch = -lim;
    });

    this.dom.addEventListener('mousedown', function (e) {
      if (!self.locked) return;
      if (self.onMouseDown) self.onMouseDown(e.button);
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  Player.prototype.lock = function () { this.dom.requestPointerLock(); };
  Player.prototype.unlock = function () { document.exitPointerLock(); };

  Player.prototype.getForward = function () {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
  };

  Player.prototype.getEyePosition = function () {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  };

  Player.prototype._collides = function (x, y, z) {
    var w = this.world, hw = this.width / 2;
    var minX = Math.floor(x - hw), maxX = Math.floor(x + hw);
    var minY = Math.floor(y), maxY = Math.floor(y + this.height - 0.01);
    var minZ = Math.floor(z - hw), maxZ = Math.floor(z + hw);
    for (var bx = minX; bx <= maxX; bx++)
      for (var by = minY; by <= maxY; by++)
        for (var bz = minZ; bz <= maxZ; bz++)
          if (w.isSolid(bx, by, bz)) return true;
    return false;
  };

  Player.prototype.update = function (dt) {
    if (!this.alive) return;
    dt = Math.min(dt, 0.05);
    var keys = this.keys;
    var forwardFlat = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    var rightFlat = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    var move = new THREE.Vector3();
    if (keys['KeyW']) move.add(forwardFlat);
    if (keys['KeyS']) move.sub(forwardFlat);
    if (keys['KeyD']) move.add(rightFlat);
    if (keys['KeyA']) move.sub(rightFlat);
    var sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
    var speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (move.lengthSq() > 0) { move.normalize().multiplyScalar(speed); }

    this.velocity.x = move.x;
    this.velocity.z = move.z;

    if (keys['Space'] && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -50) this.velocity.y = -50;

    // X axis
    var nx = this.position.x + this.velocity.x * dt;
    if (!this._collides(nx, this.position.y, this.position.z)) this.position.x = nx;
    // Z axis
    var nz = this.position.z + this.velocity.z * dt;
    if (!this._collides(this.position.x, this.position.y, nz)) this.position.z = nz;
    // Y axis
    var ny = this.position.y + this.velocity.y * dt;
    if (!this._collides(this.position.x, ny, this.position.z)) {
      this.position.y = ny;
      this.onGround = false;
    } else {
      if (this.velocity.y < 0) this.onGround = true;
      this.velocity.y = 0;
    }

    // fell out of world safety net
    if (this.position.y < -10) {
      this.damage(this.maxHealth);
    }

    var eye = this.getEyePosition();
    this.camera.position.copy(eye);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  };

  Player.prototype.damage = function (amount) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastDamageTime = performance.now();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      if (this.onDeath) this.onDeath();
    }
  };

  Player.prototype.heal = function (amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  };

  Player.prototype.respawn = function (x, z) {
    var y = this.world.getSurfaceY(x, z) + 2;
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.alive = true;
  };

  G.Player = Player;
})();
