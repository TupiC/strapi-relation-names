import { isRecord } from './records';

export { isRecord } from './records';

export type TemplateAttribute = {
  type?: string;
  target?: string;
  targetModel?: string;
  component?: string;
  components?: string[];
  relation?: string;
  private?: boolean;
};

export type TemplateSchema = {
  uid?: string;
  attributes?: Record<string, TemplateAttribute>;
};

export type SchemaResolver = (uid: string) => TemplateSchema | undefined;

export type TemplateExpression = {
  path: string;
  transforms: string[];
};

export type TemplateToken =
  | { type: 'text'; value: string }
  | { type: 'expression'; expression: TemplateExpression };

export type TemplateAst = {
  tokens: TemplateToken[];
  expressions: TemplateExpression[];
};

export type TransformContext = {
  locale?: string;
  timeZone?: string;
};

export type TransformDefinition = {
  accepts: (fieldType: string | undefined) => boolean;
  apply: (value: unknown, context: TransformContext) => unknown;
};

export type CompiledTemplate = {
  template: string;
  placeholders: string[];
  displayField: string;
  tokens?: TemplateToken[];
  expressions?: TemplateExpression[];
  transformContext?: TransformContext;
};

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

const DATE_TYPES = new Set(['date', 'datetime']);

const SYSTEM_SCALAR_TYPES: Record<string, string> = {
  id: 'integer',
  documentId: 'string',
  createdAt: 'datetime',
  updatedAt: 'datetime',
  publishedAt: 'datetime',
  locale: 'string',
  status: 'string',
};

const SYSTEM_SCALAR_FIELDS = Object.keys(SYSTEM_SCALAR_TYPES);
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

const getNestedSchemaUid = (attribute: TemplateAttribute): string | undefined => {
  if (attribute.type === 'component') {
    return attribute.component;
  }

  if (attribute.type === 'relation') {
    return attribute.targetModel ?? attribute.target;
  }

  return undefined;
};

const getDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const isDateOnly = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const formatDate = (
  value: unknown,
  options: Intl.DateTimeFormatOptions,
  context: TransformContext,
  preserveDateOnly: boolean
): string => {
  const date = getDate(value);
  if (!date) {
    return '';
  }

  const timeZone = preserveDateOnly && isDateOnly(value) ? 'UTC' : context.timeZone;
  return new Intl.DateTimeFormat(context.locale, {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
};

export const TRANSFORMS: Readonly<Record<string, TransformDefinition>> = {
  toLocalDate: {
    accepts: (fieldType) => DATE_TYPES.has(fieldType ?? ''),
    apply: (value, context) => formatDate(value, { dateStyle: 'short' }, context, true),
  },
  toLocalDateTime: {
    accepts: (fieldType) => fieldType === 'datetime',
    apply: (value, context) =>
      formatDate(value, { dateStyle: 'short', timeStyle: 'short' }, context, false),
  },
};

export const getPathValue = (value: unknown, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      return current
        .map((item) => (isRecord(item) ? item[segment] : undefined))
        .filter((item) => item !== undefined);
    }

    return isRecord(current) ? current[segment] : undefined;
  }, value);
};

const parseExpression = (value: string): TemplateExpression | null => {
  const parts = value.split('|').map((part) => part.trim());
  const [path, ...transforms] = parts;

  if (
    !path ||
    !PATH_PATTERN.test(path) ||
    transforms.some((name) => !IDENTIFIER_PATTERN.test(name))
  ) {
    return null;
  }

  return { path, transforms };
};

export const parseTemplateAst = (template: string): TemplateAst | null => {
  if (!template.trim()) {
    return null;
  }

  const tokens: TemplateToken[] = [];
  const expressions: TemplateExpression[] = [];
  let cursor = 0;

  while (cursor < template.length) {
    const openingBrace = template.indexOf('{', cursor);
    const closingBrace = template.indexOf('}', cursor);

    if (closingBrace !== -1 && (openingBrace === -1 || closingBrace < openingBrace)) {
      return null;
    }

    if (openingBrace === -1) {
      tokens.push({ type: 'text', value: template.slice(cursor) });
      break;
    }

    if (openingBrace > cursor) {
      tokens.push({ type: 'text', value: template.slice(cursor, openingBrace) });
    }

    const end = template.indexOf('}', openingBrace + 1);
    if (end === -1) {
      return null;
    }

    const expression = parseExpression(template.slice(openingBrace + 1, end));
    if (!expression) {
      return null;
    }

    tokens.push({ type: 'expression', expression });
    expressions.push(expression);
    cursor = end + 1;
  }

  return expressions.length > 0 ? { tokens, expressions } : null;
};

export const parseTemplate = (template: string): string[] | null => {
  const ast = parseTemplateAst(template);
  return ast?.expressions.map(({ path }) => path) ?? null;
};

const resolvePathType = (
  path: string,
  targetSchema: TemplateSchema,
  resolveSchema?: SchemaResolver
): string | undefined => {
  const segments = path.split('.');
  let schema = targetSchema;

  for (const [index, segment] of segments.entries()) {
    const isLastSegment = index === segments.length - 1;
    if (index === 0 && isLastSegment && SYSTEM_SCALAR_TYPES[segment]) {
      return SYSTEM_SCALAR_TYPES[segment];
    }

    const attribute = schema.attributes?.[segment];
    if (!attribute || attribute.private === true) {
      return undefined;
    }

    if (isLastSegment) {
      return FIELD_TYPES.has(attribute.type ?? '') ? attribute.type : undefined;
    }

    const nestedSchemaUid = getNestedSchemaUid(attribute);
    if (!nestedSchemaUid || !resolveSchema) {
      return undefined;
    }

    const nestedSchema = resolveSchema(nestedSchemaUid);
    if (!nestedSchema) {
      return undefined;
    }

    schema = nestedSchema;
  }

  return undefined;
};

export const compileTemplate = (
  template: string,
  targetSchema: TemplateSchema | undefined,
  resolveSchema?: SchemaResolver
): CompiledTemplate | null => {
  const ast = parseTemplateAst(template);

  if (!ast || !targetSchema) {
    return null;
  }

  const valid = ast.expressions.every(({ path, transforms }) => {
    const fieldType = resolvePathType(path, targetSchema, resolveSchema);
    return Boolean(fieldType && transforms.every((name) => TRANSFORMS[name]?.accepts(fieldType)));
  });

  if (!valid) {
    return null;
  }

  return {
    ...ast,
    template,
    placeholders: ast.expressions.map(({ path }) => path),
    displayField: ast.expressions[0].path.split('.').slice(-1)[0] ?? ast.expressions[0].path,
  };
};

const applyTransform = (value: unknown, name: string, context: TransformContext): unknown => {
  const transform = TRANSFORMS[name];
  if (!transform) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyTransform(item, name, context));
  }

  return transform.apply(value, context);
};

export const renderTemplate = (
  compiled: CompiledTemplate,
  values: Record<string, unknown>,
  context: TransformContext = compiled.transformContext ?? {}
): string => {
  const tokens = compiled.tokens ?? parseTemplateAst(compiled.template)?.tokens ?? [];
  const rendered = tokens
    .map((token) => {
      if (token.type === 'text') {
        return token.value;
      }

      const expressionValue = token.expression.transforms.reduce(
        (value, name) => applyTransform(value, name, context),
        getPathValue(values, token.expression.path)
      );

      return expressionValue === null || expressionValue === undefined
        ? ''
        : String(expressionValue);
    })
    .join('');

  return rendered.trim();
};

export const validateTemplate = (
  template: string,
  attributes: Record<string, TemplateAttribute> | undefined,
  schemas?: ReadonlyMap<string, TemplateSchema>
): string | null => {
  const ast = parseTemplateAst(template);
  if (!ast) {
    return 'Use at least one valid {fieldName} placeholder.';
  }

  const targetSchema: TemplateSchema = { attributes };
  const invalidExpression = ast.expressions.find(({ path, transforms }) => {
    const fieldType = resolvePathType(path, targetSchema, (uid) => schemas?.get(uid));
    if (!fieldType) {
      return true;
    }

    return transforms.some((name) => !TRANSFORMS[name] || !TRANSFORMS[name].accepts(fieldType));
  });

  if (!invalidExpression) {
    return null;
  }

  const invalidTransform = invalidExpression.transforms.find(
    (name) =>
      !TRANSFORMS[name] ||
      !TRANSFORMS[name].accepts(
        resolvePathType(invalidExpression.path, targetSchema, (uid) => schemas?.get(uid))
      )
  );

  return invalidTransform
    ? `“${invalidTransform}” is not a valid transformation for “${invalidExpression.path}”.`
    : `“${invalidExpression.path}” is not an available scalar field.`;
};

export const getAvailableFields = (
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

    const nestedSchemaUid = getNestedSchemaUid(attribute);
    if (!nestedSchemaUid || ancestors.has(nestedSchemaUid)) {
      return [];
    }

    return getAvailableFields(
      schemas.get(nestedSchemaUid),
      schemas,
      `${path}.`,
      new Set([...ancestors, nestedSchemaUid])
    );
  });

  const systemFields = prefix === '' ? SYSTEM_SCALAR_FIELDS : [];
  return [...systemFields, ...fields.filter((field) => !systemFields.includes(field))];
};

export const getPlaceholders = (template: string): string[] | null => parseTemplate(template);
