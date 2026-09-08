export const isCollectionEnabled = (collections: string[], uid: string): boolean =>
  collections.length === 0 || collections.includes(uid);
