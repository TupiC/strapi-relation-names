export type RelationNamesSettings = {
  collections: string[];
  relations: Record<string, Record<string, string>>;
};

export const EMPTY_SETTINGS: RelationNamesSettings = {
  collections: [],
  relations: {},
};
