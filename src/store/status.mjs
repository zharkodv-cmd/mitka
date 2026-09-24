// Three statuses, derived from the two fields the store already keeps rather than a
// third value nobody would migrate:
//
//   open    nobody has closed it
//   done    you closed it
//   claude  I closed it — resolved, but by me, so it stays worth a look
//
// Node-free, like categories.mjs: the CLI, the middleware and the browser client all
// import it, and one rule in two places is how the panel and the CLI end up
// disagreeing about what "open" means.
export const stateOf = (c) =>
  c.status !== 'done' ? 'open' : c.doneBy === 'claude' ? 'claude' : 'done';

/** What each status is called in the panel and in the CLI. */
export const STATE_LABEL = { open: 'Open', done: 'Resolved', claude: 'Resolved by Claude' };
