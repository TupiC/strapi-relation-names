type RelationNamesConfig = {
  collections: string[];
  locale?: string;
  timeZone?: string;
};

const isOptionalString = (value: unknown): value is string =>
  value === undefined || typeof value === 'string';

const validateConfig = (config: unknown): asserts config is RelationNamesConfig => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('The collections config must be an array of strings');
  }

  const typedConfig = config as RelationNamesConfig & { collections?: unknown };
  if (
    !Array.isArray(typedConfig.collections) ||
    !typedConfig.collections.every((collection) => typeof collection === 'string')
  ) {
    throw new Error('The collections config must be an array of strings');
  }

  if (!isOptionalString(typedConfig.locale)) {
    throw new Error('The locale config must be a string');
  }

  if (!isOptionalString(typedConfig.timeZone)) {
    throw new Error('The timeZone config must be a string');
  }

  if (typedConfig.timeZone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: typedConfig.timeZone });
    } catch {
      throw new Error('The timeZone config must be a valid IANA timezone');
    }
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
