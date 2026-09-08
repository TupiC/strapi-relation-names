export type RelationNamesSettings = {
  collections: string[];
  relations: Record<string, Record<string, string>>;
};

export type SchemaAttribute = {
  type?: string;
  targetModel?: string;
  target?: string;
  component?: string;
  private?: boolean;
  relationType?: string;
};

export type Schema = {
  uid: string;
  isDisplayed?: boolean;
  category?: string;
  info?: {
    displayName?: string;
  };
  attributes?: Record<string, SchemaAttribute>;
};

export type InitResponse = {
  data: {
    contentTypes: Schema[];
    components: Schema[];
  };
};

export type SettingsResponse = {
  data: RelationNamesSettings;
};
