// Resource pool, hotbar (8 block slots + 1 gun slot), and crafting recipes.
(function () {
  var G = window.Game = window.Game || {};
  var B = G.Blocks.B;
  var DEFS = G.Blocks.DEFS;
  var HOTBAR_IDS = G.HOTBAR_BLOCK_IDS;

  function Inventory(mode) {
    this.mode = mode === 'creative' ? 'creative' : 'survival';
    this.resources = { wood: 0, stone: 0, sand: 0, iron: 0, coal: 0, gold: 0, diamond: 0, ammo: 4 };
    this.hotbar = HOTBAR_IDS.map(function (id, i) {
      return { kind: 'block', id: id, count: i === 1 ? 24 : (i === 5 ? 12 : 0) }; // starter dirt + planks
    });
    this.hotbar.push({ kind: 'gun', id: null, count: 0 });
    this.selected = 0;
    this.guns = { pistol: false, shotgun: false };
    this.equippedGun = null;
    this.tools = { pickaxe: false };
  }

  Inventory.prototype.reset = function (mode) {
    Inventory.call(this, mode);
  };

  Inventory.prototype.isCreative = function () { return this.mode === 'creative'; };

  Inventory.prototype.setMode = function (mode) {
    this.mode = mode === 'creative' ? 'creative' : 'survival';
  };

  Inventory.prototype.canMine = function (blockDef) {
    if (this.isCreative()) return true;
    if (blockDef.requiresPickaxe && !this.tools.pickaxe) return false;
    return true;
  };

  Inventory.prototype.findBlockSlot = function (blockId) {
    for (var i = 0; i < 8; i++) if (this.hotbar[i].id === blockId) return this.hotbar[i];
    return null;
  };

  Inventory.prototype.addBlock = function (blockId, count) {
    var slot = this.findBlockSlot(blockId);
    if (slot) slot.count += count;
  };

  Inventory.prototype.addResource = function (key, amount) {
    if (this.resources[key] === undefined) this.resources[key] = 0;
    this.resources[key] += amount;
  };

  Inventory.prototype.onBlockBroken = function (blockId) {
    var def = DEFS[blockId];
    if (!def) return;
    if (def.resource) this.addResource(def.resource, 1);
    if (def.drop) this.addBlock(def.drop, 1);
  };

  Inventory.prototype.getSelectedBlockId = function () {
    var s = this.hotbar[this.selected];
    if (s.kind === 'block' && (s.count > 0 || this.isCreative())) return s.id;
    return null;
  };

  Inventory.prototype.getSelectedGunId = function () {
    var s = this.hotbar[this.selected];
    if (s.kind === 'gun' && s.id) return s.id;
    return null;
  };

  Inventory.prototype.consumeSelectedBlock = function () {
    if (this.isCreative()) return;
    var s = this.hotbar[this.selected];
    if (s.kind === 'block' && s.count > 0) s.count--;
  };

  Inventory.prototype.selectSlot = function (i) {
    if (i >= 0 && i < this.hotbar.length) this.selected = i;
  };

  Inventory.prototype.canAfford = function (cost) {
    for (var k in cost) if ((this.resources[k] || 0) < cost[k]) return false;
    return true;
  };
  Inventory.prototype.pay = function (cost) {
    for (var k in cost) this.resources[k] -= cost[k];
  };

  function buildRecipes() {
    var list = [
      { id: 'planks', name: 'Planks x4', cost: { wood: 1 }, give: { block: B.PLANKS, count: 4 } },
      { id: 'glass', name: 'Glass x2', cost: { sand: 2 }, give: { block: B.GLASS, count: 2 } },
      { id: 'brick', name: 'Brick x2', cost: { stone: 2 }, give: { block: B.BRICK, count: 2 } },
      { id: 'ammo', name: 'Ammo x10', cost: { iron: 2, coal: 1 }, give: { resource: 'ammo', count: 10 } },
      { id: 'pickaxe', name: 'Wooden Pickaxe', cost: { wood: 3 }, give: { tool: 'pickaxe' } },
      { id: 'pistol', name: 'Pistol', cost: G.GUN_DEFS.pistol.cost, give: { gun: 'pistol' } },
      { id: 'shotgun', name: 'Shotgun', cost: G.GUN_DEFS.shotgun.cost, give: { gun: 'shotgun' } }
    ];
    return list;
  }
  var RECIPES = buildRecipes();

  Inventory.prototype.craft = function (recipeId) {
    var recipe = null;
    for (var i = 0; i < RECIPES.length; i++) if (RECIPES[i].id === recipeId) { recipe = RECIPES[i]; break; }
    if (!recipe) return { ok: false, msg: 'Unknown recipe' };
    if (recipe.give.gun && this.guns[recipe.give.gun]) return { ok: false, msg: 'Already crafted' };
    if (recipe.give.tool && this.tools[recipe.give.tool]) return { ok: false, msg: 'Already crafted' };
    if (!this.isCreative() && !this.canAfford(recipe.cost)) return { ok: false, msg: 'Not enough resources' };
    if (!this.isCreative()) this.pay(recipe.cost);
    if (recipe.give.block !== undefined) this.addBlock(recipe.give.block, recipe.give.count);
    if (recipe.give.resource) this.addResource(recipe.give.resource, recipe.give.count);
    if (recipe.give.tool) this.tools[recipe.give.tool] = true;
    if (recipe.give.gun) {
      this.guns[recipe.give.gun] = true;
      this.equippedGun = recipe.give.gun;
      this.hotbar[8].id = recipe.give.gun;
      this.selected = 8;
    }
    return { ok: true, msg: 'Crafted ' + recipe.name };
  };

  Inventory.prototype.serialize = function () {
    return {
      mode: this.mode,
      resources: this.resources,
      hotbar: this.hotbar.map(function (s) { return { kind: s.kind, id: s.id, count: s.count }; }),
      selected: this.selected,
      guns: this.guns,
      tools: this.tools,
      equippedGun: this.equippedGun
    };
  };

  Inventory.prototype.deserialize = function (data) {
    if (!data) return;
    if (data.mode) this.setMode(data.mode);
    if (data.resources) this.resources = Object.assign(this.resources, data.resources);
    if (data.hotbar) {
      for (var i = 0; i < this.hotbar.length && i < data.hotbar.length; i++) {
        this.hotbar[i].count = data.hotbar[i].count || 0;
        if (this.hotbar[i].kind === 'gun') this.hotbar[i].id = data.hotbar[i].id || null;
      }
    }
    if (data.guns) this.guns = data.guns;
    if (data.tools) this.tools = Object.assign(this.tools, data.tools);
    if (data.equippedGun) { this.equippedGun = data.equippedGun; this.hotbar[8].id = data.equippedGun; }
    if (typeof data.selected === 'number') this.selected = data.selected;
  };

  G.Inventory = Inventory;
  G.RECIPES = RECIPES;
})();
