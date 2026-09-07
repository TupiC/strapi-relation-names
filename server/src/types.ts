export type RelationNamesSettings = {
  relations: Record<string, Record<string, string>>;
};

export const EMPTY_SETTINGS: RelationNamesSettings = {
  relations: {},
};
