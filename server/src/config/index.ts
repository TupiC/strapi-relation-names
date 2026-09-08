type RelationNamesConfig = {
  collections: string[];
};

const validateConfig = (config: unknown): asserts config is RelationNamesConfig => {
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    !Array.isArray((config as { collections?: unknown }).collections) ||
    !(config as { collections: unknown[] }).collections.every(
      (collection) => typeof collection === 'string'
    )
  ) {
    throw new Error('The collections config must be an array of strings');
  }
};

const config = {
  default: {
    collections: [],
  },
  validator: validateConfig,
};

export { validateConfig };
export default config;
