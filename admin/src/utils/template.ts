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
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
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
  attributes: Record<string, { type?: string }> | undefined
): string | null => {
  const placeholders = getPlaceholders(template);
  if (!placeholders) {
    return 'Use at least one valid {fieldName} placeholder.';
  }

  const invalidField = placeholders.find(
    (field) => !FIELD_TYPES.has(attributes?.[field]?.type ?? '')
  );
  return invalidField ? `“${invalidField}” is not an available scalar field.` : null;
};

export { getPlaceholders, validateTemplate };
