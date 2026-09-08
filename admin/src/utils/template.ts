const FIELD_TYPES = new Set([
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

const SYSTEM_SCALAR_FIELDS = [
  'id',
  'documentId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'locale',
  'status',
];

type TemplateAttribute = {
  type?: string;
  component?: string;
  private?: boolean;
};

type TemplateSchema = {
  attributes?: Record<string, TemplateAttribute>;
};

const PLACEHOLDER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

const getPlaceholders = (template: string): string[] | null => {
  if (!template.trim()) {
    return null;
  }

  const placeholders: string[] = [];
  const matches = template.matchAll(/\{([^{}]*)\}/g);
  let cursor = 0;

  for (const match of matches) {
    if (match.index !== cursor && template.slice(cursor, match.index).includes('{')) {
      return null;
    }

    const name = match[1];
    if (!PLACEHOLDER_PATTERN.test(name)) {
      return null;
    }

    placeholders.push(name);
    cursor = match.index + match[0].length;
  }

  if (template.slice(cursor).includes('{') || template.slice(cursor).includes('}')) {
    return null;
  }

  return placeholders.length > 0 ? placeholders : null;
};

const validateTemplate = (
  template: string,
  attributes: Record<string, TemplateAttribute> | undefined,
  schemas?: ReadonlyMap<string, TemplateSchema>
): string | null => {
  const placeholders = getPlaceholders(template);
  if (!placeholders) {
    return 'Use at least one valid {fieldName} placeholder.';
  }

  const invalidField = placeholders.find((path) => {
    const segments = path.split('.');
    let currentAttributes = attributes;

    for (const [index, segment] of segments.entries()) {
      if (index === 0 && segments.length === 1 && SYSTEM_SCALAR_FIELDS.includes(segment)) {
        return false;
      }

      const attribute = currentAttributes?.[segment];
      const isLastSegment = index === segments.length - 1;

      if (!attribute || attribute.private === true) {
        return true;
      }

      if (isLastSegment) {
        return !FIELD_TYPES.has(attribute.type ?? '');
      }

      if (attribute.type !== 'component' || !attribute.component) {
        return true;
      }

      currentAttributes = schemas?.get(attribute.component)?.attributes;
    }

    return true;
  });
  return invalidField ? `“${invalidField}” is not an available scalar field.` : null;
};

const getAvailableFields = (
  schema: TemplateSchema | undefined,
  schemas: ReadonlyMap<string, TemplateSchema>,
  prefix = '',
  ancestors = new Set<string>()
): string[] => {
  if (!schema) {
    return [];
  }

  const fields = Object.entries(schema.attributes ?? {}).flatMap(([name, attribute]) => {
    if (attribute.private === true) {
      return [];
    }

    const path = `${prefix}${name}`;
    if (FIELD_TYPES.has(attribute.type ?? '')) {
      return [path];
    }

    if (
      attribute.type !== 'component' ||
      !attribute.component ||
      ancestors.has(attribute.component)
    ) {
      return [];
    }

    return getAvailableFields(
      schemas.get(attribute.component),
      schemas,
      `${path}.`,
      new Set([...ancestors, attribute.component])
    );
  });

  const systemFields = prefix === '' ? SYSTEM_SCALAR_FIELDS : [];
  return [...systemFields, ...fields.filter((field) => !systemFields.includes(field))];
};

export { getAvailableFields, getPlaceholders, validateTemplate };
