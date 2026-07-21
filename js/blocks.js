// Block registry + procedural texture atlas (canvas based, no image assets needed).
(function () {
  var G = window.Game = window.Game || {};

  var TILE = 16;      // px per tile
  var GRID = 8;        // 8x8 tile atlas
  var ATLAS_PX = TILE * GRID;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function speckle(ctx, x, y, size, base, variants, count, rand) {
    for (var i = 0; i < count; i++) {
      var c = variants[Math.floor(rand() * variants.length)];
      ctx.fillStyle = c;
      var px = x + Math.floor(rand() * size);
      var py = y + Math.floor(rand() * size);
      ctx.fillRect(px, py, 1, 1);
    }
  }

  function drawTile(ctx, idx, base, variants, rand) {
    var x = (idx % GRID) * TILE, y = Math.floor(idx / GRID) * TILE;
    ctx.fillStyle = base;
    ctx.fillRect(x, y, TILE, TILE);
    speckle(ctx, x, y, TILE, base, variants, 26, rand);
  }

  // Build the atlas canvas once.
  var canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX; canvas.height = ATLAS_PX;
  var ctx = canvas.getContext('2d');
  var rand = mulberry32(42);

  var TILES = {
    grass_top: 0, grass_side: 1, dirt: 2, stone: 3,
    sand: 4, wood_side: 5, wood_top: 6, leaves: 7,
    planks: 8, coal_ore: 9, iron_ore: 10, glass: 11,
    water: 12, brick: 13, gold_ore: 14, bedrock: 15,
    diamond_ore: 16, cactus: 17
  };

  drawTile(ctx, TILES.grass_top, '#5a9e3f', ['#6bb94b', '#4c8a34', '#71c454'], rand);
  drawTile(ctx, TILES.grass_side, '#8a5a34', ['#7a4d2b', '#96633c'], rand);
  // overlay green strip on top of grass_side
  (function () {
    var x = (TILES.grass_side % GRID) * TILE, y = Math.floor(TILES.grass_side / GRID) * TILE;
    ctx.fillStyle = '#5a9e3f';
    ctx.fillRect(x, y, TILE, 5);
    speckle(ctx, x, y, TILE, '#5a9e3f', ['#6bb94b', '#4c8a34'], 10, rand);
  })();
  drawTile(ctx, TILES.dirt, '#8a5a34', ['#7a4d2b', '#96633c', '#6b3f22'], rand);
  drawTile(ctx, TILES.stone, '#8a8a8a', ['#7d7d7d', '#959595', '#6f6f6f'], rand);
  drawTile(ctx, TILES.sand, '#e0d2a0', ['#d6c68f', '#eadcb0'], rand);
  drawTile(ctx, TILES.wood_side, '#6b4a2b', ['#5c3e22', '#7a5735'], rand);
  (function () { // vertical bark lines
    var x = (TILES.wood_side % GRID) * TILE, y = Math.floor(TILES.wood_side / GRID) * TILE;
    ctx.fillStyle = '#4a3018';
    for (var i = 0; i < TILE; i += 3) ctx.fillRect(x + i, y, 1, TILE);
  })();
  drawTile(ctx, TILES.wood_top, '#a9814f', ['#8e6a3f', '#c2985f'], rand);
  drawTile(ctx, TILES.leaves, '#3d7a2e', ['#347025', '#488a35', '#2c6420'], rand);
  drawTile(ctx, TILES.planks, '#c19a5b', ['#b28a4d', '#d0a866'], rand);
  (function () { // plank lines
    var x = (TILES.planks % GRID) * TILE, y = Math.floor(TILES.planks / GRID) * TILE;
    ctx.fillStyle = '#9c7a45';
    for (var i = 0; i < TILE; i += 4) ctx.fillRect(x, y + i, TILE, 1);
  })();
  drawTile(ctx, TILES.coal_ore, '#8a8a8a', ['#7d7d7d', '#959595'], rand);
  (function () {
    var x = (TILES.coal_ore % GRID) * TILE, y = Math.floor(TILES.coal_ore / GRID) * TILE;
    ctx.fillStyle = '#1a1a1a';
    for (var i = 0; i < 5; i++) ctx.fillRect(x + 2 + Math.floor(rand() * 11), y + 2 + Math.floor(rand() * 11), 2, 2);
  })();
  drawTile(ctx, TILES.iron_ore, '#8a8a8a', ['#7d7d7d', '#959595'], rand);
  (function () {
    var x = (TILES.iron_ore % GRID) * TILE, y = Math.floor(TILES.iron_ore / GRID) * TILE;
    ctx.fillStyle = '#d8b48a';
    for (var i = 0; i < 5; i++) ctx.fillRect(x + 2 + Math.floor(rand() * 11), y + 2 + Math.floor(rand() * 11), 2, 2);
  })();
  drawTile(ctx, TILES.gold_ore, '#8a8a8a', ['#7d7d7d', '#959595'], rand);
  (function () {
    var x = (TILES.gold_ore % GRID) * TILE, y = Math.floor(TILES.gold_ore / GRID) * TILE;
    ctx.fillStyle = '#f2d94e';
    for (var i = 0; i < 5; i++) ctx.fillRect(x + 2 + Math.floor(rand() * 11), y + 2 + Math.floor(rand() * 11), 2, 2);
  })();
  drawTile(ctx, TILES.diamond_ore, '#8a8a8a', ['#7d7d7d', '#959595'], rand);
  (function () {
    var x = (TILES.diamond_ore % GRID) * TILE, y = Math.floor(TILES.diamond_ore / GRID) * TILE;
    ctx.fillStyle = '#5be3e3';
    for (var i = 0; i < 5; i++) ctx.fillRect(x + 2 + Math.floor(rand() * 11), y + 2 + Math.floor(rand() * 11), 2, 2);
  })();
  drawTile(ctx, TILES.glass, '#bfe8f0', ['#a9dbe6', '#d3f0f5'], rand);
  drawTile(ctx, TILES.water, '#3a72c4', ['#2f5fa8', '#4a80d0'], rand);
  drawTile(ctx, TILES.brick, '#9c4a3a', ['#8c3f30', '#ac5a48'], rand);
  (function () {
    var x = (TILES.brick % GRID) * TILE, y = Math.floor(TILES.brick / GRID) * TILE;
    ctx.fillStyle = '#6b2f24';
    for (var i = 0; i < TILE; i += 4) ctx.fillRect(x, y + i, TILE, 1);
    for (var i = 0; i < TILE; i += 8) { ctx.fillRect(x + i, y, 1, TILE); ctx.fillRect(x + i + 4, y + 4, 1, TILE); }
  })();
  drawTile(ctx, TILES.bedrock, '#3a3a3a', ['#2c2c2c', '#484848', '#1f1f1f'], rand);
  drawTile(ctx, TILES.cactus, '#3f8a3f', ['#377b37', '#489648'], rand);

  var texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  function uvOf(idx) {
    var x = (idx % GRID) / GRID, y = 1 - Math.floor(idx / GRID) / GRID - (1 / GRID);
    return { u0: x, v0: y, u1: x + 1 / GRID, v1: y + 1 / GRID };
  }

  // Block IDs
  var B = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6,
    PLANKS: 7, COAL_ORE: 8, IRON_ORE: 9, GLASS: 10, WATER: 11, BRICK: 12,
    GOLD_ORE: 13, BEDROCK: 14, DIAMOND_ORE: 15, CACTUS: 16
  };

  function faceSet(top, side, bottom) {
    return { top: uvOf(top), side: uvOf(side), bottom: uvOf(bottom || side) };
  }

  var DEFS = {};
  DEFS[B.GRASS] = { name: 'Grass', solid: true, transparent: false, faces: faceSet(TILES.grass_top, TILES.grass_side, TILES.dirt), hardness: 0.4, drop: B.DIRT, hotbar: true };
  DEFS[B.DIRT] = { name: 'Dirt', solid: true, transparent: false, faces: faceSet(TILES.dirt, TILES.dirt, TILES.dirt), hardness: 0.4, drop: B.DIRT, hotbar: true };
  DEFS[B.STONE] = { name: 'Stone', solid: true, transparent: false, faces: faceSet(TILES.stone, TILES.stone, TILES.stone), hardness: 1.2, drop: B.STONE, hotbar: true, requiresPickaxe: true };
  DEFS[B.SAND] = { name: 'Sand', solid: true, transparent: false, faces: faceSet(TILES.sand, TILES.sand, TILES.sand), hardness: 0.4, drop: B.SAND, hotbar: true };
  DEFS[B.WOOD] = { name: 'Wood Log', solid: true, transparent: false, faces: faceSet(TILES.wood_top, TILES.wood_side, TILES.wood_top), hardness: 0.9, drop: B.WOOD, hotbar: true, resource: 'wood' };
  DEFS[B.LEAVES] = { name: 'Leaves', solid: true, transparent: true, faces: faceSet(TILES.leaves, TILES.leaves, TILES.leaves), hardness: 0.2, drop: 0, hotbar: false };
  DEFS[B.PLANKS] = { name: 'Planks', solid: true, transparent: false, faces: faceSet(TILES.planks, TILES.planks, TILES.planks), hardness: 0.7, drop: B.PLANKS, hotbar: true };
  DEFS[B.COAL_ORE] = { name: 'Coal Ore', solid: true, transparent: false, faces: faceSet(TILES.coal_ore, TILES.coal_ore, TILES.coal_ore), hardness: 1.4, drop: 0, hotbar: false, resource: 'coal', requiresPickaxe: true };
  DEFS[B.IRON_ORE] = { name: 'Iron Ore', solid: true, transparent: false, faces: faceSet(TILES.iron_ore, TILES.iron_ore, TILES.iron_ore), hardness: 1.8, drop: 0, hotbar: false, resource: 'iron', requiresPickaxe: true };
  DEFS[B.GLASS] = { name: 'Glass', solid: true, transparent: true, faces: faceSet(TILES.glass, TILES.glass, TILES.glass), hardness: 0.4, drop: B.GLASS, hotbar: true };
  DEFS[B.WATER] = { name: 'Water', solid: false, transparent: true, liquid: true, faces: faceSet(TILES.water, TILES.water, TILES.water), hardness: 9999, drop: 0, hotbar: false };
  DEFS[B.BRICK] = { name: 'Brick', solid: true, transparent: false, faces: faceSet(TILES.brick, TILES.brick, TILES.brick), hardness: 1.2, drop: B.BRICK, hotbar: true, requiresPickaxe: true };
  DEFS[B.GOLD_ORE] = { name: 'Gold Ore', solid: true, transparent: false, faces: faceSet(TILES.gold_ore, TILES.gold_ore, TILES.gold_ore), hardness: 2.0, drop: 0, hotbar: false, resource: 'gold', requiresPickaxe: true };
  DEFS[B.BEDROCK] = { name: 'Bedrock', solid: true, transparent: false, faces: faceSet(TILES.bedrock, TILES.bedrock, TILES.bedrock), hardness: Infinity, drop: 0, hotbar: false };
  DEFS[B.DIAMOND_ORE] = { name: 'Diamond Ore', solid: true, transparent: false, faces: faceSet(TILES.diamond_ore, TILES.diamond_ore, TILES.diamond_ore), hardness: 2.5, drop: 0, hotbar: false, resource: 'diamond', requiresPickaxe: true };
  DEFS[B.CACTUS] = { name: 'Cactus', solid: true, transparent: false, faces: faceSet(TILES.cactus, TILES.cactus, TILES.cactus), hardness: 0.4, drop: B.CACTUS, hotbar: false };

  G.Blocks = { B: B, DEFS: DEFS, atlasTexture: texture, TILE_GRID: GRID };
  G.HOTBAR_BLOCK_IDS = [B.GRASS, B.DIRT, B.STONE, B.SAND, B.WOOD, B.PLANKS, B.GLASS, B.BRICK];
})();
