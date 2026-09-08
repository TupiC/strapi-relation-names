export type SchemaAttribute = {
  type?: string;
  target?: string;
  component?: string;
  components?: string[];
  relation?: string;
  private?: boolean;
};

export type SchemaLike = {
  uid: string;
  modelType?: string;
  attributes?: Record<string, SchemaAttribute>;
};

export type CompiledTemplate = {
  template: string;
  placeholders: string[];
  displayField: string;
};

export type RelationRuntime = CompiledTemplate & {
  sourceUid: string;
  targetUid: string;
  originalMainField: string;
};

const SCALAR_TYPES = new Set([
  'string',
  'text',
  'email',
  'uid',
  'enumeration',
  'integer',
  'biginteger',
  'decimal',
  'float',
  'date',
  'datetime',
  'time',
  'boolean',
]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const parseTemplate = (template: string): string[] | null => {
  if (!template.trim()) {
    return null;
  }

  const placeholders: string[] = [];
  let cursor = 0;

  while (cursor < template.length) {
    const openingBrace = template.indexOf('{', cursor);
    const closingBrace = template.indexOf('}', cursor);

    if (closingBrace !== -1 && (openingBrace === -1 || closingBrace < openingBrace)) {
      return null;
    }

    if (openingBrace === -1) {
      break;
    }

    const end = template.indexOf('}', openingBrace + 1);
    if (end === -1) {
      return null;
    }

    const name = template.slice(openingBrace + 1, end);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return null;
    }

    placeholders.push(name);
    cursor = end + 1;
  }

  return placeholders.length > 0 ? placeholders : null;
};

export const compileTemplate = (
  template: string,
  targetSchema: SchemaLike | undefined
): CompiledTemplate | null => {
  const placeholders = parseTemplate(template);
  const attributes = targetSchema?.attributes ?? {};

  if (!placeholders || !targetSchema) {
    return null;
  }

  const valid = placeholders.every((name) => {
    const attribute = attributes[name];
    return Boolean(
      attribute && attribute.private !== true && SCALAR_TYPES.has(attribute.type ?? '')
    );
  });

  if (!valid) {
    return null;
  }

  return {
    template,
    placeholders,
    displayField: placeholders[0],
  };
};

export const renderTemplate = (
  compiled: CompiledTemplate,
  values: Record<string, unknown>
): string => {
  const rendered = compiled.template.replace(
    /\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_match, name: string) => {
      const value = values[name];
      return value === null || value === undefined ? '' : String(value);
    }
  );

  return rendered.trim();
};
