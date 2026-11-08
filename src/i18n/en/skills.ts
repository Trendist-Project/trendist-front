/**
 * Skill names and descriptions (4.33). Keys: <skill code>_name and _desc. When adding a skill, add a row to the DB (skills) and these two lines here.
 */
export default {
  dash_name: 'Dash',
  dash_desc: 'Dash briefly in the direction you are moving. Only usable while moving.',
  shockwave_name: 'Shockwave',
  shockwave_desc: "Send out a shockwave that pushes away the circles it touches. They don't lose keywords. Not usable in safe zones.",
  hook_name: 'Hook',
  hook_desc: 'Throw a hook toward your aim. The circle it hits loses a keyword and is pulled to you. Not usable in safe zones.',
  shield_name: 'Shield',
  shield_desc: 'Briefly pass through other circles without colliding.',
  stealth_name: 'Stealth',
  stealth_desc: 'Briefly blend into the background for others. Ends when you use an attack skill.',
} as Record<string, string>;
