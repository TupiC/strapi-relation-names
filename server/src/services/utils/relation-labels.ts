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

export type SchemaResolver = (uid: string) => SchemaLike | undefined;

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

const SYSTEM_SCALAR_FIELDS = new Set([
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'locale',
  'status',
]);

const PLACEHOLDER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const getPathValue = (value: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, segment) => {
    return isRecord(current) ? current[segment] : undefined;
  }, value);
};

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
    if (!PLACEHOLDER_PATTERN.test(name)) {
      return null;
    }

    placeholders.push(name);
    cursor = end + 1;
  }

  return placeholders.length > 0 ? placeholders : null;
};

export const compileTemplate = (
  template: string,
  targetSchema: SchemaLike | undefined,
  resolveSchema?: SchemaResolver
): CompiledTemplate | null => {
  const placeholders = parseTemplate(template);

  if (!placeholders || !targetSchema) {
    return null;
  }

  const valid = placeholders.every((path) => {
    const segments = path.split('.');
    let schema = targetSchema;

    for (const [index, segment] of segments.entries()) {
      const attribute = schema.attributes?.[segment];
      const isLastSegment = index === segments.length - 1;

      if (index === 0 && isLastSegment && SYSTEM_SCALAR_FIELDS.has(segment)) {
        return true;
      }

      if (!attribute || attribute.private === true) {
        return false;
      }

      if (isLastSegment) {
        return SCALAR_TYPES.has(attribute.type ?? '');
      }

      if (attribute.type !== 'component' || !attribute.component || !resolveSchema) {
        return false;
      }

      schema = resolveSchema(attribute.component);
      if (!schema) {
        return false;
      }
    }

    return false;
  });

  if (!valid) {
    return null;
  }

  return {
    template,
    placeholders,
    displayField: placeholders[0].split('.').slice(-1)[0] ?? placeholders[0],
  };
};

export const renderTemplate = (
  compiled: CompiledTemplate,
  values: Record<string, unknown>
): string => {
  const rendered = compiled.template.replace(
    /\{([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\}/g,
    (_match, name: string) => {
      const value = getPathValue(values, name);
      return value === null || value === undefined ? '' : String(value);
    }
  );

  return rendered.trim();
};
