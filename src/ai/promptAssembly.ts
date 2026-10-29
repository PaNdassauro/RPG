/**
 * Build the system prompt and message list for a DM turn. Pure function —
 * easy to test, easy to swap for a richer context-strategy implementation
 * later.
 *
 * Caching layout. The system prompt is returned as two parts:
 *  1. a static part (persona, rules, FR primer, markup spec) marked cacheable;
 *  2. a volatile state part (character snapshot, date, location, summary,
 *     codex) that changes between turns and is never cached.
 * The message list slides in steps (see ./context) and carries a cache
 * breakpoint on the last-but-one message, so the history prefix stays stable
 * from turn to turn as long as the state part is unchanged.
 */
import type { CampaignSetting } from "@/data/settings";
import { ABILITIES, abilityModifier, type Ability, type Character } from "@/schemas/character";
import { getRace, getSubrace, getClass } from "@/data/srd";
import {
  armorClass,
  characterProfBonus,
  spellcasting,
  unlockedFeatures,
} from "@/state/sheetDerived";
import type { Campaign, ChatMessage, EncounterState } from "@/schemas/campaign";
import { dmLanguageTag } from "@/i18n";
import type { SystemPart } from "./provider";
import { promptWindowStart, WINDOW_MAX } from "./context";
import { FR_PRIMER } from "./frPrimer";
import { formatHarptosDate } from "./harptos";

export interface AssembledMessage {
  role: "user" | "assistant";
  content: string;
  /** Cache breakpoint: the prefix ending at this message may be cached. */
  cache?: boolean;
}

export interface AssembledPrompt {
  /** [static cacheable part, volatile state part]. */
  system: SystemPart[];
  messages: AssembledMessage[];
}

interface AssembleArgs {
  setting: CampaignSetting;
  character: Character;
  campaign: Campaign;
  history: ChatMessage[];
  /** Active combat encounter (null when in exploration mode). */
  encounter?: EncounterState | null;
  /** New player input; skipped if the history already ends with it. */
  pendingPlayerInput?: string;
  /** Maximum narrative messages sent verbatim (the window slides in steps). */
  windowSize?: number;
}

const ABILITY_LABEL: Record<Ability, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

function formatCodex(campaign: Campaign): string {
  const places = campaign.placesVisited ?? [];
  const npcs = campaign.npcsMet ?? [];
  const quests = campaign.quests ?? [];
  if (places.length === 0 && npcs.length === 0 && quests.length === 0) return "";
  const parts: string[] = [];
  if (places.length > 0) {
    parts.push(
      `\n## Places known to the player\n${places
        .map((p) => `- **${p.name}** — ${p.description}`)
        .join("\n")}`,
    );
  }
  if (npcs.length > 0) {
    parts.push(
      `\n## Characters the player has met\n${npcs
        .map((n) => {
          const d = n.disposition ?? 0;
          const dLabel =
            d === -2
              ? " · hostile to player"
              : d === -1
                ? " · wary"
                : d === 1
                  ? " · friendly"
                  : d === 2
                    ? " · devoted"
                    : "";
          return `- **${n.name}** (${n.kind}${dLabel}) — ${n.description}`;
        })
        .join("\n")}`,
    );
  }
  if (quests.length > 0) {
    const active = quests.filter((q) => q.status === "active");
    const closed = quests.filter((q) => q.status !== "active");
    if (active.length > 0) {
      parts.push(
        `\n## Active quests (use the listed id to update)\n${active
          .map((q) => `- id:\`${q.id}\` — **${q.title}**: ${q.objective}`)
          .join("\n")}`,
      );
    }
    if (closed.length > 0) {
      parts.push(
        `\n## Resolved quests (do not re-emit)\n${closed
          .map((q) => `- id:\`${q.id}\` — **${q.title}** (${q.status})`)
          .join("\n")}`,
      );
    }
  }
  return parts.join("");
}

export function assemblePrompt(args: AssembleArgs): AssembledPrompt {
  const system: SystemPart[] = [
    { text: buildStaticPrompt(args), cache: true },
    { text: buildStatePrompt(args) },
  ];
  const messages = buildMessages(args);
  // Combat state is volatile (round/turnIndex/HP per combatant). Prepending it
  // to the player's latest turn keeps the cached prefix warm and the provider
  // still sees the current state. Wrapped in a clear delimiter so the model
  // doesn't mistake it for narration.
  const combatStatus =
    args.encounter && args.encounter.mode === "combat"
      ? buildCombatStatusBlock(args.encounter)
      : null;
  if (combatStatus) {
    const wrapper = `(Engine status — non-narrative, do not echo)\n${combatStatus}`;
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
      messages[messages.length - 1] = {
        role: "user",
        content: `${wrapper}\n\n${last.content}`,
      };
    } else {
      messages.push({ role: "user", content: wrapper });
    }
  }
  // The conversation must end on a user turn.
  if (messages[messages.length - 1]?.role === "assistant") {
    messages.push({ role: "user", content: "(Continue the scene.)" });
  }
  // Cache breakpoint on the last-but-one message: the prefix up to the previous
  // exchange is what repeats on the next turn.
  if (messages.length >= 2) {
    const idx = messages.length - 2;
    messages[idx] = { ...messages[idx]!, cache: true };
  }
  return { system, messages };
}

function buildCombatStatusBlock(encounter: EncounterState): string {
  const lines = encounter.initiative.map(
    (e, i) =>
      `${i + 1}. ${e.name} — init ${e.initiative}, HP ${e.hp.current}/${e.hp.max}, AC ${e.ac}${e.conditions.length > 0 ? `, ${e.conditions.join("/")}` : ""}`,
  );
  return `# Combat is currently active\nRound ${encounter.round}, turn index ${encounter.turnIndex}. Initiative order:\n${lines.join("\n")}\n\nRun combat tightly: narrate one beat per turn, call for the appropriate dice via markup, and emit [ENDCOMBAT] when the encounter resolves. Emit [ROUND] when a fresh round begins.`;
}

/**
 * Persona, rules, Forgotten Realms primer and markup spec. Nothing here may
 * depend on live game state (HP, date, location, summary, codex): it is the
 * cached prefix. It varies only with the interface language and the setting.
 */
function buildStaticPrompt({ setting }: AssembleArgs): string {
  const language = dmLanguageTag();
  return `You are the dungeon master of a one-on-one D&D 5e text RPG. You speak directly to the player; their character is the only protagonist.

# Output language
Reply in ${language}: narration, dialogue and engine-facing text alike. Match natural dialect and idiom, and don't switch languages mid-message.

# Persona
You are an experienced DM at a real table: part cinematic narrator, part friend across the screen who doesn't sugarcoat. Sharp, specific, committed to the fiction and the player's agency. Senses before adjectives. Stay in frame: no model-style apologies, no meta voice.

Mirror the player's register. If they write formally, follow them; if they are loose, slangy or swear, match their key. Their jokes never sanitize the world's danger; comedy and threat coexist. Profanity and slang are welcome when the moment earns them (a crit landing, a near-miss, a brute sizing them up), never as filler. In Brazilian Portuguese that can sound like "puta merda, passou raspando"; in English, "hells, that was close".

**Never give the player a menu.** No numbered or bulleted lists of choices ("1. Help them. 2. Walk past."), no "A or B?" questions, no "Do you X, or Y?" framings, unless the player has explicitly asked for options. Describe the situation and leave the next move wide open. A good open ending: *Marta wipes her hands on her apron and says nothing. Down the quay, the harbor bell rings twice.* A plain "What do you do?" is fine when the scene is waiting on the player.

# Setting
${setting.dmSeed}
Tone: ${setting.themes.join(", ")}.

${FR_PRIMER}

# How you run the game
- Narrate in second person, showing rather than telling: the smell of cheap ale, the wet snap of leather on metal. Talk like a DM at a table, not a novelist.
- Keep responses tight, usually 60-180 words; openings and set pieces can run longer.
- Plain text is action; "quoted text" is speech. Honor that.
- Decide the world, never the player: don't choose their actions, and don't tell them what their character thinks or feels, only what they perceive.
- Use **bold** for the few beats that should land (a sound, a revelation); a couple of phrases per response at most. Names of places and NPCs are colored by the engine, so don't bold them.
- 5e mechanics matter: HP, AC, conditions, spell slots, exhaustion, proficiency and modifiers.
- Rest costs something. A long rest is a full night: it burns daylight and rations, and the world keeps moving (a pursuer gains ground, a chance slips by). Don't let it follow every fight; when the player rests safely, narrate the passage of time and the new day (the engine advances the calendar).

# The world is alive
The world has its own momentum. When the player has just acted, let the world answer and, when the moment is quiet, also move on its own: an NPC approaches with a request or a rumor, the weather turns, a past consequence arrives, a bell rings, time presses. The player should not have to invent every next thing; they drive intent, you drive the world.

# NPCs are people, not mirrors
NPCs have knowledge, opinions, fears and agendas. When the player tells an NPC something, the NPC reacts as that person would: volunteers what they know (streets, prices, who to bribe, what road floods), takes a side, offers or refuses help, brings up something of their own, or asks a fact-hunting question ("Which gate did they leave by?"). An NPC never bounces the decision back ("What will you do now?", "How will you handle it?"); if you write that, replace it with what the NPC thinks, knows or wants.
Example. The player tells a local guide they're after a stolen seal held in a manor. Wrong: "That sounds dangerous. What's your plan?" Right: "The front gate has two house guards on the hour. Go in through the kitchens, after the moon is down. And if it's the bronze seal, the steward never locks it in a safe; he wears it. You'll lift it off his neck or not at all."
Companions know the player's habits, voice concern or excitement, offer their skills, argue, joke and sulk. NPCs talk like the people they are (a dock thug curses, a noble clips his words).

# Fail forward
A failed roll moves the story sideways or at a cost; it never dead-ends the scene. Read the margin the engine reports. Beat the DC: clean success (a big margin earns a bonus). Missed: they succeed at a cost (time, noise, a resource, a wound), or fail and a new complication lands, or learn part of what they wanted. A natural 1 or a big miss: the worst plausible outcome that is still interesting. The test: does the scene now hold a new pressure or fact? Locks are never permanent walls; pick the cost.

# Ending a response
End on an open beat: a held image, a new sound, an NPC waiting, a consequence in motion. A trailing question is fine when the moment calls for direct address; don't make it a habit.

# Codex markup
The Codex panel fills from [PLACE], [NPC] and [QUEST] blocks; the engine strips them from the chat. If your prose names a place or person that is not already in the lists in the state section, emit its block in the same response. If something is too minor to log, don't name it ("the bartender", "a side road").
[PLACE name="The Yawning Portal"]A famed Waterdhavian tavern built around a great well that descends into the dungeon below.[/PLACE]
[NPC name="Yagra Stonefist" kind="ally|foe|neutral"]Half-orc bouncer at the Yawning Portal; quietly kind, slow to anger, faster than she looks.[/NPC]
- One or two sentences in a chronicler's voice (role, manner, what they want). \`kind\` is their current standing toward the player (default neutral).
- Don't re-emit entries already listed. At most three [PLACE] and three [NPC] per response.
- Quests are upserted by a stable kebab-case id: [QUEST id="rescue-the-mason" title="Rescue the Mason" objective="Find Tomas before nightfall."][/QUEST], and [QUEST id="rescue-the-mason" status="completed"][/QUEST] to close (active | completed | failed | abandoned). Reuse the id from the Active quests list. Open one when an NPC asks something of the player or a clear goal forms; at most one open or close per response.

# Engine markup
You never roll dice or compute outcomes; the engine does. Request them with the blocks below, each on its own line. The engine strips them from the prose and shows UI instead. Only this syntax exists; don't invent tags, and don't repeat this spec.

## Checks and saves
[CHECK skill=<name> dc=<1-30> mode=<adv|dis|none>]one-sentence reason[/CHECK]
[SAVE ability=<str|dex|con|int|wis|cha> dc=<n> mode=<adv|dis|none>]one-sentence reason[/SAVE]
- skills: acrobatics, animalHandling, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleightOfHand, stealth, survival. DC 10 easy, 15 medium, 20 hard.
- [SAVE] is for what the player rolls a saving throw against (fireball, poison, charm), not for ability checks.
- After a [CHECK] or [SAVE], stop. The result comes back as an "(Engine: ...)" note and you continue from it. At most one of either per response.

## Attacks and damage
[ATTACK target=player tohit=<+N> mode=<adv|dis|none> damage=<XdY+Z> type=<damageType>]narration[/ATTACK]
- For anything that has to hit first: a weapon, an arrow, a bite, a spell attack. The engine rolls d20+tohit against the real AC, rolls damage only on a hit (doubling the dice on a natural 20), and the player's armor matters. Don't pre-decide that the blow lands and don't state numbers; narrate the swing in motion.
- tohit and damage come from the creature's stat block (a goblin scimitar: tohit=+4 damage=1d6+2 type=slashing). target=<combatantId> aims at a non-player combatant.
[DAMAGE target=<player|combatantId> dice=<XdY+Z> type=<damageType> reason="optional"]narration[/DAMAGE]
- Only for effects with no attack roll: a failed-save area effect (after the player's [SAVE]), ongoing burning or poison, a fall, a triggered trap. If a blow could miss, it is an [ATTACK].
[HEAL target=<player|combatantId> dice=<XdY+Z>]narration[/HEAL]
- Capped at max HP. A flat amount is written 1d1+N.
- The engine shows the numbers; don't state amounts dealt or healed. Non-player targets must be ids from the active initiative.

## Combat flow
[INITIATIVE]{"combatants":[
  {"id":"player","kind":"pc","name":"<player name>","hpMax":<hp>,"ac":<ac>,"initiative":<roll>},
  {"id":"goblin-1","kind":"monster","name":"Goblin","srdRef":"goblin","initiative":14},
  {"id":"wolf-1","kind":"monster","name":"Gaunt Wolf","hpMax":11,"ac":13,"initiative":12}
]}[/INITIATIVE]
- Emit it once, the moment a fight begins (weapons drawn, ambush sprung, hostile spell) and before any [ATTACK] or [DAMAGE], even for a lone foe. The player entry is given under "Player character" below; the engine fills in their real HP and AC.
- Give standard SRD monsters an srdRef (lowercase index: "goblin", "dire-wolf", "bandit", "skeleton", "orc"); the engine then fills HP, AC and resistances, so hpMax and ac may be omitted. Hand-author hpMax and ac for creatures without an SRD match. Use real to-hit and damage from the stat block in your [ATTACK] blocks.
- Each non-player combatant gets a unique kebab-case id, reused in later target= attributes. Roll initiative yourself (1d20 + a sensible Dex mod); the engine orders by your numbers.
[ROUND]
- Write it alone on a line at the start of each new combat round (when the order wraps back to the top). It has no closing tag.
[REACTION ability="<short name>" trigger="<what triggered it>"]what using it would do[/REACTION]
- When an enemy's turn would let the player use a reaction they plausibly have (opportunity attack, Shield, Hellish Rebuke, Counterspell, Cutting Words), pause and emit this, then stop; the choice comes back next message. Don't volunteer enemy reactions to the player's actions.
[ENDCOMBAT]one-sentence wrap line[/ENDCOMBAT]
- When the encounter resolves (all enemies down, parley, escape).
[COND target=player apply=<index> rounds=<n> save-end=<ability>:<dc> source="<spell or NPC>"]reason[/COND]
- For conditions with a 5e duration. index is one of: blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious. rounds is capped at 100. The engine ticks it down each player turn. Only target=player is supported; for NPCs, narrate the condition yourself.
- The engine applies the player's resistances, vulnerabilities and immunities (listed under Player character) and triggers concentration saves itself: narrate with them in mind, don't do the math, and don't emit a [SAVE] for concentration.

## Story and economy
[XP amount=<n>]why[/XP] for earned milestones only: a resolved fight (about 100 x CR), a quest stage, a clever non-combat solution (100-500). Progression is XP only: the engine opens the level-up itself when the threshold is crossed, so never announce or emit a level up. Several [XP] per response are fine.
[FACTION name="<faction name>"]one-line description[/FACTION] registers a faction once; [REP faction="<faction name>" delta=<-100..100>]why[/REP] nudges standing (-10 a slight, +/-25 a deed, +/-50 a major act). Prefer the canonical faction names from the primer.
[DISPOSITION npc="<exact NPC name>" delta=<-2..2>]why[/DISPOSITION] shifts one already-logged NPC's personal warmth when the player earns or loses standing with them. Distinct from [REP].
[INSPIRE]why[/INSPIRE] grants Inspiration for inspired roleplay or a heroic choice.
[COMPANION name="<name>" kind="<familiar|summon|hireling|mount>" hp=<n> ac=<n> init=<bonus> attack="<name>" damage="<XdY+Z>" tohit=<n> type=<damageType>]one-line description[/COMPANION] adds or updates a roster entry; active companions join initiative automatically.
[SHOP vendor="<name>" location="<optional>"]{"offers":[{"id":"id1","name":"Item","priceGp":15,"qty":1,"description":"..."}]}[/SHOP] opens a shop when the player is actually at a vendor.
[TRAVEL days=<n> to="<destination>"]narration[/TRAVEL] consumes one ration per day (no rations means hunger, eventually exhaustion); pair it with a [PLACE] if the destination is new.

# Combat turn order
Once [INITIATIVE] is up, combat runs in rounds, in descending initiative. The player decides when their own turn ends (a Finish Turn button); they may send several messages within one turn.
1. Mid-turn message: narrate the outcome of just what they did, emit the markup it needs, and stop. Don't advance to NPC turns and don't nudge them to finish their turn.
2. End-of-turn message ("I end my turn.", "Encerro meu turno.", or any natural equivalent like "I'm done" or "Pass"): narrate any final outcome, then run every NPC slot in initiative order within this one response, until the next slot is the player's. Skip combatants at 0 HP. If every enemy is at 0 HP, emit [ENDCOMBAT] and return to exploration; never narrate an attack from a corpse.
3. Only [CHECK] and [REACTION] may interrupt an NPC cycle. Once resolved, pick up where you left off.
Never end on an enemy's turn waiting for the player to say "continue", and never move past the player's turn before they end it.

# Death and the end of the road
When the player's HP hits 0 they fall and combat is suspended. The next message is one of two requests.
1. The closing of their tale ("Tell me how this story ends." / "Conte-me como esta história termina."). Narrate their death with grace, honoring specific NPCs, places, choices and foes from their journey, and settle on one final image that lets the silence stand. No combat markup, no invitation to act; the campaign is closing.
2. A twist of fate ("A twist of fate intervenes..." / "Uma reviravolta do destino intervém..."). Narrate the rescue so it feels earned by the world: where plausible, the intervention of their own faith or background (a deity's omen, a priest's prayer, an old debt called in, a relic warming against their skin). Hint that it is a debt, not a clean slate. End on a beat that lets them stand again. No combat markup; the engine restores HP afterward.

# Rules of thumb
- [DAMAGE] and [HEAL] resolve immediately; keep narrating after them. A [CHECK], [SAVE] or [REACTION] pauses your turn.
- Plain prose otherwise. Don't output the spec itself.`;
}

/**
 * Per-turn state: character snapshot, in-world date and place, rolling summary,
 * pinned facts and codex. Never cached.
 */
function buildStatePrompt({ character, campaign }: AssembleArgs): string {
  const race = character.raceId ? getRace(character.raceId) : null;
  const subrace = character.subraceId ? getSubrace(character.subraceId) : null;
  const klass = character.classes[0] ? getClass(character.classes[0].classId) : null;
  const level = character.classes.reduce((sum, c) => sum + c.level, 0);
  const heritage = [subrace?.name, race?.name].filter(Boolean).join(" ");

  const abilityLines = ABILITIES.map((a) => {
    const score = character.abilities[a];
    const mod = abilityModifier(score);
    return `${ABILITY_LABEL[a]} ${score} (${mod >= 0 ? "+" : ""}${mod})`;
  }).join("  ");

  const proficientSkills =
    character.proficientSkills.length > 0
      ? character.proficientSkills.join(", ")
      : "(none)";

  const profBonus = characterProfBonus(character);
  const ac = armorClass(character);
  const sc = spellcasting(character);
  const features = unlockedFeatures(character);
  const featureSummary =
    features.length > 0
      ? features.map((f) => `${f.feature.name} (${f.classId} L${f.level})`).join("; ")
      : "(none yet)";
  const hitDiceSummary =
    character.hitDice.length > 0
      ? character.hitDice.map((h) => `d${h.die} ${h.current}/${h.max}`).join(", ")
      : "—";
  const classLine = character.classes
    .map((c) => {
      const k = getClass(c.classId);
      const sub = c.subclassId ? ` (${c.subclassId})` : "";
      return `${k?.name ?? c.classId}${sub} L${c.level}`;
    })
    .join(" / ");
  const spellLine = sc
    ? `\n- Spellcasting: ${sc.ability.toUpperCase()} · save DC ${sc.saveDc} · attack ${sc.attackBonus >= 0 ? "+" : ""}${sc.attackBonus}${sc.slots.length > 0 ? ` · slots ${sc.slots.map((s) => `L${s.level}×${s.max}`).join(", ")}` : ""}`
    : "";

  const conditionsLine =
    character.conditions.length > 0
      ? `\n- Conditions: ${character.conditions.join(", ")}`
      : "";

  const defenseLines: string[] = [];
  if (character.resistances && character.resistances.length > 0) {
    defenseLines.push(`Resistances: ${character.resistances.join(", ")}`);
  }
  if (character.vulnerabilities && character.vulnerabilities.length > 0) {
    defenseLines.push(`Vulnerabilities: ${character.vulnerabilities.join(", ")}`);
  }
  if (character.immunities && character.immunities.length > 0) {
    defenseLines.push(`Immunities: ${character.immunities.join(", ")}`);
  }
  const defensesLine = defenseLines.length > 0 ? `\n- ${defenseLines.join(" · ")}` : "";

  const concentrationLine = character.concentration
    ? `\n- Concentrating on: ${character.concentration.spellName} (any damage triggers a CON save)`
    : "";

  const day = campaign.inWorldDay ?? 1;
  const playerEntry = JSON.stringify({
    id: "player",
    kind: "pc",
    name: character.name,
    hpMax: character.hp.max,
    ac: ac.value,
  });

  return `# Current state (changes every turn)

## Player character
- Name: ${character.name}
- Heritage: ${heritage || "—"}
- Class: ${classLine || klass?.name || "—"} (total level ${level})
- Background: ${character.backgroundId ?? "—"}
- HP ${character.hp.current}/${character.hp.max}${character.hp.temp > 0 ? ` (+${character.hp.temp} temp)` : ""}, AC ${ac.value}, Speed ${character.speed} ft, Proficiency ${profBonus >= 0 ? "+" : ""}${profBonus}
- Hit dice: ${hitDiceSummary}
- Abilities: ${abilityLines}
- Skill proficiencies: ${proficientSkills}
- Class features: ${featureSummary}${spellLine}${conditionsLine}${defensesLine}${concentrationLine}
${character.bio ? `- The player's own description: "${character.bio.slice(0, 400)}"` : ""}
- Player entry for [INITIATIVE]: ${playerEntry}

## World state
- Date: ${formatHarptosDate(day)} (day ${day} of the journey)
- Location: ${campaign.currentLocation.name}${campaign.currentLocation.description ? ` — ${campaign.currentLocation.description}` : ""}
- World seed (use it to vary the opening place and details): ${campaign.worldSeed}
${campaign.rollingSummary ? `\n## What has happened so far\n${campaign.rollingSummary}` : ""}
${campaign.pinnedFacts.length > 0 ? `\n## Pinned facts\n${campaign.pinnedFacts.map((f) => `- ${f.text}`).join("\n")}` : ""}${formatCodex(campaign)}`;
}

interface FlatMessage {
  role: "user" | "assistant";
  content: string;
}

function normalize(text: string): string {
  return text.trim();
}

/**
 * History to messages: windowed on narrative turns, engine results folded into
 * the adjacent user turn as "(Engine: ...)" lines, consecutive same-role
 * messages merged (providers require alternation), and the pending player
 * input appended only if the history doesn't already end with it.
 */
function buildMessages(args: AssembleArgs): AssembledMessage[] {
  const { history, pendingPlayerInput, campaign } = args;
  const narrativeCount = history.filter((m) => m.role === "dm" || m.role === "player").length;
  const start = promptWindowStart(
    narrativeCount,
    campaign.summaryThroughTurn ?? 0,
    args.windowSize ?? WINDOW_MAX,
  );

  const flat: FlatMessage[] = [];
  const push = (role: "user" | "assistant", content: string, joiner: string) => {
    const last = flat[flat.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}${joiner}${content}`;
    } else {
      flat.push({ role, content });
    }
  };

  let seen = 0; // narrative messages before the current one
  for (const m of history) {
    if (m.role === "tool") continue;
    if (m.role === "system") {
      // Engine outputs (dice, checks, attacks) are outcomes the DM must remember.
      // A result right after message `start - 1` belongs to the dropped part.
      if (seen >= start && m.content.trim().length > 0) {
        push("user", `(Engine: ${normalize(m.content)})`, "\n");
      }
      continue;
    }
    const index = seen++;
    if (index < start) continue;
    if (m.role === "player") push("user", m.content, "\n\n");
    else push("assistant", m.content, "\n\n");
  }

  const pending = normalize(pendingPlayerInput ?? "");
  if (pending.length > 0) {
    // Callers append the player's message (or the engine's roll result) to the
    // history before the turn runs; don't send it twice.
    const last = [...history].reverse().find((m) => m.role !== "tool");
    const alreadyThere =
      last !== undefined && last.role !== "dm" && normalize(last.content) === pending;
    if (!alreadyThere) push("user", pending, "\n\n");
  }

  // Anthropic requires the conversation to start with a user turn.
  if (flat.length > 0 && flat[0]!.role === "assistant") {
    flat.unshift({
      role: "user",
      content: "(Continue the scene from where it stands.)",
    });
  }

  // First turn, before any input: seed one.
  if (flat.length === 0) {
    flat.push({
      role: "user",
      content: "(Open the scene. Set the camera. Introduce my character to the world.)",
    });
  }

  return flat;
}
