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
  poison_name: 'Poison',
  poison_desc: 'Throw a poison bolt in your aim direction. The target loses keywords every 3 seconds for 9 seconds, and more per tick when hit again (stacks). Cannot be used in a safe zone.',
  darkness_name: 'Darkness',
  darkness_desc: 'Throw a dark bolt in your aim direction. The target sees only the area around them and their nickname for 3 seconds, and loses the minimap. Cannot be used in a safe zone.',
  cleanse_name: 'Cleanse',
  cleanse_desc: 'Removes hook, poison and darkness at once. Works even while being pulled.',
} as Record<string, string>;
