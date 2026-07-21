// Chunk-based voxel world: terrain generation, meshing, edits, raycasting.
(function () {
  var G = window.Game = window.Game || {};
  var B = G.Blocks.B;
  var DEFS = G.Blocks.DEFS;

  var CS = 16;      // chunk width/depth
  var CH = 56;      // chunk height (world height cap)
  var SEA_LEVEL = 20;

  function hash2(x, z) {
    var n = x * 374761393 + z * 668265263;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = (n ^ (n >>> 16)) >>> 0;
    return n / 4294967295;
  }

  function idx(x, y, z) { return x + z * CS + y * CS * CS; }

  function Chunk(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.data = new Uint8Array(CS * CH * CS);
    this.opaqueMesh = null;
    this.waterMesh = null;
    this.generated = false;
    this.dirty = false;
  }
  Chunk.prototype.get = function (x, y, z) {
    if (x < 0 || x >= CS || z < 0 || z >= CS || y < 0 || y >= CH) return 0;
    return this.data[idx(x, y, z)];
  };
  Chunk.prototype.set = function (x, y, z, v) {
    this.data[idx(x, y, z)] = v;
  };

  function World(seed, scene) {
    this.seed = seed;
    this.scene = scene;
    this.chunks = new Map();
    this.overrides = new Map(); // "wx,wy,wz" -> blockId, persists user edits
    this.heightNoise = new G.Noise(seed);
    this.detailNoise = new G.Noise(seed + 101);
    this.biomeNoise = new G.Noise(seed + 202);
    this.caveNoise = new G.Noise(seed + 303);
    this.caveNoise2 = new G.Noise(seed + 404);
    this.oreNoise = new G.Noise(seed + 505);
    this.genQueue = [];
    this.meshQueue = [];
    this.renderDistance = 5;
    this.opaqueMaterial = new THREE.MeshLambertMaterial({ map: G.Blocks.atlasTexture, vertexColors: true });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: G.Blocks.atlasTexture, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide
    });
    this.leavesMaterial = this.opaqueMaterial; // rendered opaque group too (simplify perf), alpha not needed
  }

  World.CS = CS; World.CH = CH; World.SEA_LEVEL = SEA_LEVEL;

  World.prototype.chunkKey = function (cx, cz) { return cx + ',' + cz; };

  World.prototype.getChunk = function (cx, cz) {
    return this.chunks.get(this.chunkKey(cx, cz));
  };

  World.prototype.worldToChunk = function (wx, wz) {
    return { cx: Math.floor(wx / CS), cz: Math.floor(wz / CS) };
  };

  World.prototype.getBlock = function (wx, wy, wz) {
    // Floor defensively: a fractional index into the chunk's typed array
    // silently returns undefined, which callers would misread as "solid ground".
    wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
    if (wy < 0 || wy >= CH) return 0;
    var cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
    var c = this.getChunk(cx, cz);
    if (!c || !c.generated) return 0;
    var lx = wx - cx * CS, lz = wz - cz * CS;
    return c.get(lx, wy, lz);
  };

  World.prototype.isSolid = function (wx, wy, wz) {
    var id = this.getBlock(wx, wy, wz);
    if (id === 0) return false;
    return !!DEFS[id].solid;
  };

  World.prototype.setBlock = function (wx, wy, wz, id, skipOverride) {
    wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
    if (wy < 0 || wy >= CH) return false;
    var cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
    var c = this.getChunk(cx, cz);
    if (!c) return false;
    var lx = wx - cx * CS, lz = wz - cz * CS;
    c.set(lx, wy, lz, id);
    if (!skipOverride) this.overrides.set(wx + ',' + wy + ',' + wz, id);
    this.markDirty(cx, cz);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CS - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CS - 1) this.markDirty(cx, cz + 1);
    return true;
  };

  World.prototype.markDirty = function (cx, cz) {
    var c = this.getChunk(cx, cz);
    if (c && c.generated && !c.dirty) {
      c.dirty = true;
      this.meshQueue.push(c);
    }
  };

  // ---------- Terrain generation ----------
  World.prototype.computeColumn = function (wx, wz) {
    var continental = this.heightNoise.fbm2(wx * 0.006, wz * 0.006, 3, 2.0, 0.5);
    var detail = this.detailNoise.fbm2(wx * 0.03, wz * 0.03, 4, 2.0, 0.5);
    var biomeVal = this.biomeNoise.fbm2((wx + 4000) * 0.0035, (wz + 4000) * 0.0035, 2, 2.0, 0.5);
    var isDesert = biomeVal < -0.22;
    var amp = isDesert ? 6 : 15;
    var h = 24 + continental * amp + detail * (isDesert ? 2 : 5);
    var surfaceY = Math.max(4, Math.min(CH - 8, Math.round(h)));
    return { surfaceY: surfaceY, isDesert: isDesert };
  };

  World.prototype.isCave = function (wx, wy, wz) {
    var v = this.caveNoise.fbm3(wx * 0.05, wy * 0.08, wz * 0.05, 3, 2.0, 0.5);
    var v2 = this.caveNoise2.noise3(wx * 0.1, wy * 0.14, wz * 0.1);
    return (v > 0.34) || (v > 0.18 && v2 > 0.55);
  };

  World.prototype.oreAt = function (wx, wy, wz, surfaceY) {
    var o = this.oreNoise.noise3((wx + 5000) * 0.15, wy * 0.15, (wz + 5000) * 0.15);
    if (wy < 14 && o > 0.80) return B.DIAMOND_ORE;
    if (wy < 26 && o > 0.74) return B.GOLD_ORE;
    if (o > 0.63) return B.IRON_ORE;
    if (o > 0.53) return B.COAL_ORE;
    return 0;
  };

  World.prototype.generateChunk = function (cx, cz) {
    var key = this.chunkKey(cx, cz);
    var existing = this.chunks.get(key);
    var c = existing || new Chunk(cx, cz);
    if (!this.chunks.has(key)) this.chunks.set(key, c);
    if (c.generated) return c;

    for (var lx = 0; lx < CS; lx++) {
      for (var lz = 0; lz < CS; lz++) {
        var wx = cx * CS + lx, wz = cz * CS + lz;
        var col = this.computeColumn(wx, wz);
        var surfaceY = col.surfaceY, isDesert = col.isDesert;
        for (var y = 0; y < CH; y++) {
          var block = 0;
          if (y === 0) {
            block = B.BEDROCK;
          } else if (y < surfaceY - 4) {
            block = B.STONE;
            if (this.isCave(wx, y, wz)) block = 0;
            else {
              var ore = this.oreAt(wx, y, wz, surfaceY);
              if (ore) block = ore;
            }
          } else if (y < surfaceY) {
            block = isDesert || surfaceY <= SEA_LEVEL + 1 ? B.SAND : B.DIRT;
            if (this.isCave(wx, y, wz) && y > 2) block = 0;
          } else if (y === surfaceY) {
            block = isDesert || surfaceY <= SEA_LEVEL + 1 ? B.SAND : B.GRASS;
          } else if (y <= SEA_LEVEL) {
            block = B.WATER;
          } else {
            block = 0;
          }
          c.set(lx, y, lz, block);
        }

        // Vegetation (kept away from chunk edges so it never spills into neighbors)
        if (lx >= 2 && lx <= CS - 3 && lz >= 2 && lz <= CS - 3 && surfaceY > SEA_LEVEL) {
          var topBlock = c.get(lx, surfaceY, lz);
          var r = hash2(wx, wz);
          if (topBlock === B.GRASS && r < 0.02) {
            this.placeTree(c, lx, surfaceY, lz);
          } else if (topBlock === B.SAND && r < 0.006) {
            this.placeCactus(c, lx, surfaceY, lz);
          }
        }
      }
    }

    c.generated = true;

    // Re-apply any saved overrides that fall within this chunk.
    if (this.overrides.size) {
      this.overrides.forEach(function (val, key2) {
        var parts = key2.split(',');
        var owx = parseInt(parts[0], 10), owy = parseInt(parts[1], 10), owz = parseInt(parts[2], 10);
        var ocx = Math.floor(owx / CS), ocz = Math.floor(owz / CS);
        if (ocx === cx && ocz === cz) {
          c.set(owx - cx * CS, owy, owz - cz * CS, val);
        }
      });
    }

    return c;
  };

  World.prototype.placeTree = function (c, lx, y, lz) {
    var height = 4 + Math.floor(hash2(lx * 13 + y, lz * 7) * 2);
    for (var i = 1; i <= height; i++) {
      if (y + i < CH) c.set(lx, y + i, lz, B.WOOD);
    }
    var topY = y + height;
    for (var dx = -2; dx <= 2; dx++) {
      for (var dz = -2; dz <= 2; dz++) {
        for (var dy = -2; dy <= 1; dy++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          var lyy = topY + dy, lxx = lx + dx, lzz = lz + dz;
          if (lxx < 0 || lxx >= CS || lzz < 0 || lzz >= CS || lyy >= CH) continue;
          if (dx === 0 && dz === 0 && dy <= 0) continue; // don't overwrite trunk
          if (c.get(lxx, lyy, lzz) === 0) c.set(lxx, lyy, lzz, B.LEAVES);
        }
      }
    }
  };

  World.prototype.placeCactus = function (c, lx, y, lz) {
    var height = 1 + Math.floor(hash2(lx * 31 + y, lz * 17) * 3);
    for (var i = 1; i <= height; i++) {
      if (y + i < CH) c.set(lx, y + i, lz, B.CACTUS);
    }
  };

  World.prototype.getSurfaceY = function (wx, wz) {
    wx = Math.floor(wx); wz = Math.floor(wz);
    var cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
    this.generateChunk(cx, cz);
    for (var y = CH - 1; y >= 1; y--) {
      var id = this.getBlock(wx, y, wz);
      if (id !== 0 && id !== B.WATER && id !== B.LEAVES) return y;
    }
    return 24;
  };

  // ---------- Meshing ----------
  var FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], type: 'side', shade: 0.75 },
    { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], type: 'side', shade: 0.65 },
    { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], type: 'top', shade: 1.0 },
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], type: 'bottom', shade: 0.5 },
    { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], type: 'side', shade: 0.85 },
    { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], type: 'side', shade: 0.6 }
  ];

  function faceVisible(curId, neighId) {
    if (neighId === curId) {
      var nd = DEFS[neighId];
      if (neighId === 0) return false;
      if (!nd.solid || nd.transparent) return false;
    }
    if (neighId === 0) return true;
    var nd2 = DEFS[neighId];
    if (!nd2.solid) return true;
    if (nd2.transparent) return true;
    return false;
  }

  World.prototype.buildChunkGeometry = function (c) {
    var opaquePos = [], opaqueUv = [], opaqueColor = [], opaqueNorm = [], opaqueIdx = [];
    var waterPos = [], waterUv = [], waterColor = [], waterNorm = [], waterIdx = [];
    var self = this;
    var baseX = c.cx * CS, baseZ = c.cz * CS;

    for (var y = 0; y < CH; y++) {
      for (var lx = 0; lx < CS; lx++) {
        for (var lz = 0; lz < CS; lz++) {
          var id = c.get(lx, y, lz);
          if (id === 0) continue;
          var def = DEFS[id];
          var wx = baseX + lx, wz = baseZ + lz;
          var isWater = !!def.liquid;
          var posArr = isWater ? waterPos : opaquePos;
          var uvArr = isWater ? waterUv : opaqueUv;
          var colArr = isWater ? waterColor : opaqueColor;
          var normArr = isWater ? waterNorm : opaqueNorm;
          var idxArr = isWater ? waterIdx : opaqueIdx;

          for (var f = 0; f < 6; f++) {
            var face = FACES[f];
            var nx = lx + face.dir[0], ny = y + face.dir[1], nz = lz + face.dir[2];
            var neighId;
            if (nx >= 0 && nx < CS && nz >= 0 && nz < CS && ny >= 0 && ny < CH) {
              neighId = c.get(nx, ny, nz);
            } else {
              neighId = self.getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
            }
            if (!faceVisible(id, neighId)) continue;

            var uv = def.faces[face.type];
            var startIndex = posArr.length / 3;
            for (var k = 0; k < 4; k++) {
              var corner = face.corners[k];
              posArr.push(wx + corner[0], y + corner[1], wz + corner[2]);
              normArr.push(face.dir[0], face.dir[1], face.dir[2]);
              colArr.push(face.shade, face.shade, face.shade);
            }
            uvArr.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
            idxArr.push(startIndex, startIndex + 1, startIndex + 2, startIndex, startIndex + 2, startIndex + 3);
          }
        }
      }
    }

    function makeGeom(pos, norm, uv, col, ind) {
      if (pos.length === 0) return null;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(ind);
      return g;
    }

    return {
      opaque: makeGeom(opaquePos, opaqueNorm, opaqueUv, opaqueColor, opaqueIdx),
      water: makeGeom(waterPos, waterNorm, waterUv, waterColor, waterIdx)
    };
  };

  World.prototype.remeshChunk = function (c) {
    var geoms = this.buildChunkGeometry(c);
    if (c.opaqueMesh) { this.scene.remove(c.opaqueMesh); c.opaqueMesh.geometry.dispose(); c.opaqueMesh = null; }
    if (c.waterMesh) { this.scene.remove(c.waterMesh); c.waterMesh.geometry.dispose(); c.waterMesh = null; }
    if (geoms.opaque) {
      c.opaqueMesh = new THREE.Mesh(geoms.opaque, this.opaqueMaterial);
      c.opaqueMesh.frustumCulled = true;
      this.scene.add(c.opaqueMesh);
    }
    if (geoms.water) {
      c.waterMesh = new THREE.Mesh(geoms.water, this.waterMaterial);
      this.scene.add(c.waterMesh);
    }
    c.dirty = false;
  };

  // ---------- Streaming ----------
  World.prototype.update = function (playerPos) {
    var pcx = Math.floor(playerPos.x / CS), pcz = Math.floor(playerPos.z / CS);
    var rd = this.renderDistance;

    // Determine wanted chunks, nearest first.
    var wanted = [];
    for (var dx = -rd; dx <= rd; dx++) {
      for (var dz = -rd; dz <= rd; dz++) {
        if (dx * dx + dz * dz > rd * rd) continue;
        wanted.push({ cx: pcx + dx, cz: pcz + dz, d: dx * dx + dz * dz });
      }
    }
    wanted.sort(function (a, b) { return a.d - b.d; });

    var genBudget = 2, meshBudget = 3;
    for (var i = 0; i < wanted.length && genBudget > 0; i++) {
      var w = wanted[i];
      var key = this.chunkKey(w.cx, w.cz);
      var c = this.chunks.get(key);
      if (!c || !c.generated) {
        c = this.generateChunk(w.cx, w.cz);
        this.meshQueue.push(c);
        genBudget--;
      }
    }

    while (this.meshQueue.length && meshBudget > 0) {
      var mc = this.meshQueue.shift();
      if (mc.generated) { this.remeshChunk(mc); meshBudget--; }
    }

    // Unload far chunks.
    var unloadDist = (rd + 2);
    var self = this;
    this.chunks.forEach(function (c2, key2) {
      var ddx = c2.cx - pcx, ddz = c2.cz - pcz;
      if (ddx * ddx + ddz * ddz > unloadDist * unloadDist) {
        if (c2.opaqueMesh) { self.scene.remove(c2.opaqueMesh); c2.opaqueMesh.geometry.dispose(); }
        if (c2.waterMesh) { self.scene.remove(c2.waterMesh); c2.waterMesh.geometry.dispose(); }
        self.chunks.delete(key2);
      }
    });
  };

  World.prototype.reset = function () {
    var self = this;
    this.chunks.forEach(function (c) {
      if (c.opaqueMesh) { self.scene.remove(c.opaqueMesh); c.opaqueMesh.geometry.dispose(); }
      if (c.waterMesh) { self.scene.remove(c.waterMesh); c.waterMesh.geometry.dispose(); }
    });
    this.chunks.clear();
    this.meshQueue = [];
  };

  World.prototype.setSeed = function (seed) {
    this.seed = seed;
    this.heightNoise = new G.Noise(seed);
    this.detailNoise = new G.Noise(seed + 101);
    this.biomeNoise = new G.Noise(seed + 202);
    this.caveNoise = new G.Noise(seed + 303);
    this.caveNoise2 = new G.Noise(seed + 404);
    this.oreNoise = new G.Noise(seed + 505);
    this.reset();
  };

  // ---------- Raycasting (DDA voxel traversal) ----------
  World.prototype.raycast = function (origin, dir, maxDist) {
    var x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    var stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    var tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    var tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    var tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    var tMaxX = dir.x !== 0 ? ((stepX > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tDeltaX) : Infinity;
    var tMaxY = dir.y !== 0 ? ((stepY > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tDeltaY) : Infinity;
    var tMaxZ = dir.z !== 0 ? ((stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tDeltaZ) : Infinity;
    var normal = { x: 0, y: 0, z: 0 };
    var dist = 0;

    for (var i = 0; i < 200 && dist < maxDist; i++) {
      var id = this.getBlock(x, y, z);
      if (id !== 0 && DEFS[id].solid) {
        return { hit: true, x: x, y: y, z: z, normal: normal, prev: { x: x - normal.x, y: y - normal.y, z: z - normal.z } };
      }
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { x += stepX; dist = tMaxX; tMaxX += tDeltaX; normal = { x: -stepX, y: 0, z: 0 }; }
        else { z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; normal = { x: 0, y: 0, z: -stepZ }; }
      } else {
        if (tMaxY < tMaxZ) { y += stepY; dist = tMaxY; tMaxY += tDeltaY; normal = { x: 0, y: -stepY, z: 0 }; }
        else { z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; normal = { x: 0, y: 0, z: -stepZ }; }
      }
    }
    return { hit: false };
  };

  G.World = World;
})();
