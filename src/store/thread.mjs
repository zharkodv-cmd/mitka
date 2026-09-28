// A thread as it is read: the comment, my note, the replies — each with the screenshots
// that were sent with it.
//
// The store keeps a thread's screenshots in one list, each named `<id>-<ms>.<ext>` the
// moment it is filed, and files a reply's screenshot right after writing the reply. So
// a screenshot belongs to the last message written at or before its stamp. Drawing the
// list after the last message instead made a picture you sent read as mine.
//
// Node-free, like status.mjs: the panel and the CLI both place screenshots with it.
export const threadOf = (c) => {
  const msgs = [
    { author: 'you', text: c.text, at: c.createdAt, images: [] },
    ...(c.note ? [{ author: 'claude', text: c.note, at: c.updatedAt, images: [] }] : []),
    ...(c.replies || []).map((r) => ({ ...r, images: [] })),
  ];
  for (const path of c.images || []) {
    // no stamp in the name → NaN, which is never ≥ anything: the comment keeps it
    const t = Number(/-(\d+)\.\w+$/.exec(path)?.[1]);
    let owner = 0;
    msgs.forEach((m, i) => { if (Date.parse(m.at) <= t) owner = i; });
    msgs[owner].images.push(path);
  }
  return msgs;
};
