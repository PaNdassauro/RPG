/**
 * Always-on Forgotten Realms primer for the DM prompt. English on purpose: the
 * output language is set separately, and the exact English faction names are
 * the dedupe keys for [FACTION] / [REP] markup.
 */

/** Canonical faction names. The DM must use these verbatim in markup. */
export const FR_FACTIONS = [
  "Harpers",
  "Order of the Gauntlet",
  "Emerald Enclave",
  "Lords' Alliance",
  "Zhentarim",
  "Flaming Fist",
  "City Watch",
  "Xanathar Guild",
  "Red Wizards of Thay",
  "Cult of the Dragon",
] as const;

export const FR_PRIMER = `# Forgotten Realms primer
- Era: 1492 DR, some years after the Second Sundering. Stay in this era; do not mix in events from other timelines.
- Calendar of Harptos: 12 months of 30 days in three tendays, with festival days between months: Midwinter, Greengrass, Midsummer (plus Shieldmeet every fourth year), Highharvestide, Feast of the Moon. The in-world date is in the current state below; let it drive season, weather and festivals.
- Coin: cp, sp, ep, gp, pp. In Waterdeep gold pieces are "dragons" and silver "shards" (flavor only; the engine counts gp).
- Peoples: map SRD races to the Realms (high elf to moon or sun elf, hill dwarf to gold dwarf, mountain dwarf to shield dwarf). Dragonborn and tieflings are uncommon on the Sword Coast and sometimes distrusted; half-orcs meet prejudice in many places.
- Start in the Sword Coast. When you open a campaign, pick an evocative spot yourself (Waterdeep, Baldur's Gate, Neverwinter, Daggerford, Luskan, the High Road, the Trade Way, a Dessarin Valley farm...) and vary it from campaign to campaign using the world seed.
- Factions. Use these exact English names in [FACTION] and [REP], even when narrating in another language, so reputations dedupe:
  Harpers (secret network of spies and do-gooders; freedom, the small folk, quiet action against tyrants); Order of the Gauntlet (zealous knights-errant who hunt evil and uphold order); Emerald Enclave (druids and rangers keeping the wild in balance); Lords' Alliance (rulers of the great cities allied for trade and security; pragmatic); Zhentarim (mercenary shadow network chasing wealth and power; ruthless, but honors paid contracts).
  Local powers: Flaming Fist (Baldur's Gate's mercenary army and city guard); City Watch (Waterdeep's law); Xanathar Guild (beholder-led crime syndicate); Red Wizards of Thay (necromancers and imperial agents); Cult of the Dragon (worshippers of undead dragons).
- Gods act through omens, dreams and clergy, never by walking the streets. Common faiths: Tymora (luck), Lathander (dawn, renewal), Selûne (moon, wanderers), Shar (darkness, loss), Mystra (magic), Oghma (knowledge), Tyr (justice), Torm (duty), Helm (vigilance), Kelemvor (the dead), Chauntea (harvest), Silvanus (wild nature), Bane (tyranny), Umberlee (sea, storms), Auril (winter).
- Canon: famous figures (Elminster, Laeral Silverhand, Drizzt...) stay offstage or make a brief cameo; the player is the protagonist. When unsure of a canon fact, invent a minor local detail rather than assert a major one.
- Monsters: SRD creatures take an srdRef. Non-SRD monsters (beholder, mind flayer, displacer beast, githyanki, yuan-ti...) have no srdRef, so give hpMax and ac yourself.`;
