// The Party: a floating window that shows every player character at a glance.
// Reads the Stonetop system's own data; writes nothing to any actor.

const MODULE_ID = "stonetop-party";
const SYSTEM_ID = "stonetop-pwd";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// The Stonetop system's words for each load tier.
const LOAD = {
	light:      { word: "Light",      pips: 1 },
	normal:     { word: "Normal",     pips: 2 },
	heavy:      { word: "Heavy",      pips: 3 },
	overloaded: { word: "Overloaded", pips: 3 },
};

// ── Reading a character (mirrors the system's own helpers in module/utils/playbook-actors.js) ──

/** The party, by the system's rule: characters with a player owner, or every character if none has one. */
function partyCharacters() {
	const chars = (game.actors?.contents ?? []).filter(a => a.type === "character");
	const owned = chars.filter(a => a.hasPlayerOwner);
	// A to Z, so a newly made character doesn't sit at the bottom until the next reload.
	return (owned.length ? owned : chars).sort((a, b) => a.name.localeCompare(b.name));
}

/** The playbook as the sheet names it: a Would-Be Hero who has crossed off "Would-be" reads "The Hero". */
function playbookTitle(actor) {
	const name = actor.system?.playbook?.name ?? "";
	if (name === "The Would-Be Hero" && actor.getFlag(SYSTEM_ID, "wbhBecameHero")) return "The Hero";
	return name;
}

// After death a character may take an insert (Book I): Ghost, Revenant or Thrall. The sheet then shows the
// insert's name with the old playbook struck through; the playbook comes back if the insert is removed.
const INSERTS = ["ghost", "revenant", "thrall"];

function insertSlug(actor) {
	const slug = actor.getFlag(SYSTEM_ID, "postDeathInsert")?.slug;
	return INSERTS.includes(slug) ? slug : null;
}

/** The insert's name as the sheet shows it ("Revenant"), asked of the system. */
async function insertName(actor, slug) {
	try {
		const name = await actor.typedActor?.postDeathInsertName?.();
		if (name) return name;
	} catch (err) {
		console.warn(`${MODULE_ID} | could not read the insert name for ${actor.name}`, err);
	}
	return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function emblemFor(actor) {
	const insert = insertSlug(actor);
	if (insert) return `systems/${SYSTEM_ID}/assets/icons/playbooks/${insert}_icon.webp`;
	const slug = actor.system?.playbook?.slug
		?? actor.items?.find(i => i.type === "playbook")?.system?.slug
		?? "";
	return slug ? `systems/${SYSTEM_ID}/assets/icons/playbooks/${slug.replace(/-/g, "_")}_icon.webp` : null;
}

/** The load tier the Inventory tab shows, worked out by the system from the marked ◇. */
async function loadTier(actor) {
	try {
		return (await actor.typedActor?.currentLoadTier?.()) ?? null;
	} catch (err) {
		console.warn(`${MODULE_ID} | could not read load for ${actor.name}`, err);
		return null;
	}
}

async function rowFor(actor) {
	const attrs = actor.system?.attributes ?? {};
	const hp = Number(attrs.hp?.value) || 0;
	const hpMax = Number(attrs.hp?.max) || 0;

	const tier = await loadTier(actor);
	const insert = insertSlug(actor);
	const load = LOAD[tier] ?? { word: "", pips: 0 };

	const debilities = Object.values(attrs.debilities?.options ?? {})
		.filter(d => d?.value)
		.map(d => d.label);

	const wounds = (attrs.wounds ?? [])
		.filter(w => !w.healed)
		.map(w => ({ text: (w.text ?? "").trim() || "Wound", status: w.status || "problematic" }));

	return {
		name: actor.name,
		playbook: playbookTitle(actor),
		insert: insert ? await insertName(actor, insert) : null,
		emblem: emblemFor(actor),
		armor: Number(attrs.armor?.value) || 0,
		hp,
		hpMax,
		hpPct: hpMax > 0 ? Math.max(0, Math.min(100, (hp / hpMax) * 100)) : 0,
		isLow: hpMax > 0 && hp <= hpMax / 3,
		load: {
			word: load.word,
			isOver: tier === "overloaded",
			pips: [1, 2, 3].map(n => n <= load.pips),
		},
		debilities: debilities.join(" · "),
		wounds,
		hasHarm: debilities.length > 0 || wounds.length > 0,
	};
}

// ── The window ──

class PartyTracker extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "stonetop-party",
		classes: ["stonetop-themed", "stonetop-party"],
		window: { title: "The Party", resizable: false },
		position: { width: 346, height: "auto" },
	};

	static PARTS = {
		list: { template: `modules/${MODULE_ID}/templates/party.hbs` },
	};

	async _prepareContext() {
		const rows = await Promise.all(partyCharacters().map(rowFor));
		return { rows, empty: rows.length === 0 };
	}

	/** Remember where the window was left, per person. */
	_onPosition(position) {
		super._onPosition?.(position);
		if (!this.rendered) return;
		savePosition({ left: position.left, top: position.top });
	}
}

const savePosition = foundry.utils.debounce(pos => game.settings.set(MODULE_ID, "position", pos), 400);

let tracker = null;

function toggle() {
	if (tracker?.rendered) return tracker.close();
	const saved = game.settings.get(MODULE_ID, "position") ?? {};
	const position = Number.isFinite(saved.left) && Number.isFinite(saved.top) ? { left: saved.left, top: saved.top } : {};
	tracker ??= new PartyTracker();
	tracker.render({ force: true, position });
}

// Redraw when anything the rows read changes. Load comes from items and flags, so item changes count too.
const refresh = foundry.utils.debounce(() => { if (tracker?.rendered) tracker.render(); }, 150);
const isCharacter = doc => doc?.type === "character";

// ── Setup ──

Hooks.once("init", () => {
	game.settings.register(MODULE_ID, "position", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	game.keybindings.register(MODULE_ID, "toggle", {
		name: "Open or Close The Party",
		hint: "Shows each player character's HP, armor, load, debilities and wounds.",
		editable: [{ key: "KeyP" }],
		onDown: () => { toggle(); return true; },
		precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
	});
});

Hooks.once("ready", () => {
	if (game.system.id !== SYSTEM_ID) return;
	for (const hook of ["createActor", "updateActor", "deleteActor"]) {
		Hooks.on(hook, actor => { if (isCharacter(actor)) refresh(); });
	}
	for (const hook of ["createItem", "updateItem", "deleteItem"]) {
		Hooks.on(hook, item => { if (isCharacter(item.parent)) refresh(); });
	}
	Hooks.on("updateUser", refresh);
	game.modules.get(MODULE_ID).api = { toggle };
});
