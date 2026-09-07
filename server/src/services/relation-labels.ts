import type { Core } from '@strapi/strapi';

import type { RelationNamesSettings } from '../types';

type SchemaAttribute = {
  type?: string;
  target?: string;
  component?: string;
  components?: string[];
  relation?: string;
  private?: boolean;
};

type SchemaLike = {
  uid: string;
  modelType?: string;
  attributes?: Record<string, SchemaAttribute>;
};

type CompiledTemplate = {
  template: string;
  placeholders: string[];
  displayField: string;
};

type RelationRuntime = CompiledTemplate & {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseTemplate = (template: string): string[] | null => {
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

const compileTemplate = (
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

const renderTemplate = (compiled: CompiledTemplate, values: Record<string, unknown>): string => {
  const rendered = compiled.template.replace(
    /\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_match, name: string) => {
      const value = values[name];
      return value === null || value === undefined ? '' : String(value);
    }
  );

  return rendered.trim();
};

const getOriginalMainField = async (
  strapi: Core.Strapi,
  sourceSchema: SchemaLike,
  targetSchema: SchemaLike,
  targetField: string,
  userAbility: unknown
): Promise<string> => {
  const serviceName = sourceSchema.modelType === 'component' ? 'components' : 'content-types';
  const configuration = await strapi
    .plugin('content-manager')
    .service(serviceName)
    .findConfiguration(sourceSchema);
  const configuredMainField = configuration?.metadatas?.[targetField]?.edit?.mainField;

  if (
    typeof configuredMainField !== 'string' ||
    configuredMainField === 'documentId' ||
    configuredMainField === 'id'
  ) {
    return configuredMainField === 'documentId' ? 'documentId' : 'id';
  }

  const permissionChecker = strapi
    .plugin('content-manager')
    .service('permission-checker')
    .create({ userAbility, model: targetSchema.uid });

  const attribute = targetSchema.attributes?.[configuredMainField];
  if (
    !attribute ||
    attribute.private === true ||
    permissionChecker.cannot.read(null, configuredMainField)
  ) {
    return 'documentId';
  }

  return configuredMainField;
};

const getRuntime = async (
  strapi: Core.Strapi,
  settings: RelationNamesSettings,
  sourceUid: string,
  targetField: string,
  userAbility: unknown
): Promise<RelationRuntime | null> => {
  const sourceSchema = strapi.getModel(sourceUid as never) as unknown as SchemaLike | undefined;
  const attribute = sourceSchema?.attributes?.[targetField];

  if (!sourceSchema || !attribute || attribute.type !== 'relation' || !attribute.target) {
    return null;
  }

  const template = settings.relations[sourceUid]?.[targetField];
  const targetSchema = strapi.getModel(attribute.target as never) as unknown as
    | SchemaLike
    | undefined;
  const compiled = typeof template === 'string' ? compileTemplate(template, targetSchema) : null;

  if (!compiled || !targetSchema) {
    return null;
  }

  return {
    ...compiled,
    sourceUid,
    targetUid: targetSchema.uid,
    originalMainField: await getOriginalMainField(
      strapi,
      sourceSchema,
      targetSchema,
      targetField,
      userAbility
    ),
  };
};

const getIdentity = (value: Record<string, unknown>, modelType?: string): unknown =>
  modelType === 'component' ? value.id : (value.documentId ?? value.id);

const matchesRelation = (
  source: Record<string, unknown>,
  candidate: Record<string, unknown>,
  targetModelType?: string
): boolean => {
  if (source.id !== undefined && candidate.id === source.id) {
    return true;
  }

  if (source.documentId !== undefined && candidate.documentId === source.documentId) {
    if (source.locale !== undefined && candidate.locale !== source.locale) {
      return false;
    }
    if (source.publishedAt !== undefined && candidate.publishedAt !== source.publishedAt) {
      return false;
    }
    return true;
  }

  return getIdentity(source, targetModelType) === getIdentity(candidate, targetModelType);
};

const hydrateValues = async (
  strapi: Core.Strapi,
  ctx: any,
  runtime: RelationRuntime,
  values: Record<string, unknown>[]
): Promise<Map<Record<string, unknown>, Record<string, unknown>>> => {
  const targetSchema = strapi.getModel(runtime.targetUid as never) as unknown as SchemaLike;
  const targetModelType = targetSchema.modelType;
  const missingFields = runtime.placeholders.filter((field) =>
    values.some((value) => !Object.prototype.hasOwnProperty.call(value, field))
  );

  if (missingFields.length === 0) {
    return new Map(values.map((value) => [value, value]));
  }

  const identities = values
    .map((value) => getIdentity(value, targetModelType))
    .filter((identity) => identity !== undefined && identity !== null);

  if (identities.length === 0) {
    return new Map(values.map((value) => [value, value]));
  }

  try {
    const permissionChecker = strapi
      .plugin('content-manager')
      .service('permission-checker')
      .create({ userAbility: ctx.state.userAbility, model: runtime.targetUid });
    const fields = Array.from(
      new Set([
        ...runtime.placeholders,
        runtime.originalMainField,
        'id',
        'documentId',
        'locale',
        'publishedAt',
      ])
    );
    const identityField = targetModelType === 'component' ? 'id' : 'documentId';
    const permissionQuery = await permissionChecker.sanitizedQuery.read({
      fields,
      filters: { [identityField]: { $in: identities } },
    });
    const query = strapi.get('query-params').transform(runtime.targetUid, permissionQuery);
    const hydrated = (await strapi.db.query(runtime.targetUid).findMany(query)) as Record<
      string,
      unknown
    >[];

    return new Map(
      values.map((value) => [
        value,
        hydrated.find((candidate) => matchesRelation(value, candidate, targetModelType)) ?? value,
      ])
    );
  } catch {
    return new Map(values.map((value) => [value, value]));
  }
};

const applyLabel = (
  value: Record<string, unknown>,
  hydrated: Record<string, unknown>,
  runtime: RelationRuntime
): Record<string, unknown> => {
  const label = renderTemplate(runtime, hydrated);

  if (label) {
    return { ...value, [runtime.displayField]: label };
  }

  if (runtime.displayField === runtime.originalMainField) {
    return value;
  }

  const fallbackField =
    runtime.originalMainField === 'id' ? 'documentId' : runtime.originalMainField;
  const fallback = Object.prototype.hasOwnProperty.call(hydrated, fallbackField)
    ? hydrated[fallbackField]
    : undefined;

  return { ...value, [runtime.displayField]: fallback };
};

const relationValues = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  return isRecord(value) ? [value] : [];
};

const replaceRelationValue = (
  original: unknown,
  values: Record<string, unknown>[],
  hydrated: Map<Record<string, unknown>, Record<string, unknown>>,
  runtime: RelationRuntime
): unknown => {
  const decorated = values.map((value) => applyLabel(value, hydrated.get(value) ?? value, runtime));
  return Array.isArray(original) ? decorated : (decorated[0] ?? original);
};

const relationLabels = ({ strapi }: { strapi: Core.Strapi }) => {
  const getSettings = () => strapi.plugin('strapi-relation-names').service('settings').get();

  const decorateRelationResults = async (
    ctx: any,
    sourceUid: string,
    targetField: string,
    results: unknown[]
  ): Promise<unknown[]> => {
    const runtime = await getRuntime(
      strapi,
      await getSettings(),
      sourceUid,
      targetField,
      ctx.state.userAbility
    );
    if (!runtime) {
      return results;
    }

    const values = results.filter(isRecord);
    const hydrated = await hydrateValues(strapi, ctx, runtime, values);
    return results.map((result) =>
      isRecord(result) ? applyLabel(result, hydrated.get(result) ?? result, runtime) : result
    );
  };

  const decorateConfiguration = async (configuration: any, sourceUid: string) => {
    if (!configuration || !isRecord(configuration.metadatas)) {
      return configuration;
    }

    const settings = await getSettings();
    const metadatas = { ...configuration.metadatas };
    const relationNames: Record<string, { mainField: string }> = {};

    for (const [fieldName, metadata] of Object.entries(metadatas)) {
      const sourceSchema = strapi.getModel(sourceUid as never) as unknown as SchemaLike | undefined;
      const attribute = sourceSchema?.attributes?.[fieldName];
      if (!attribute || attribute.type !== 'relation' || !attribute.target) {
        continue;
      }

      const targetSchema = strapi.getModel(attribute.target as never) as unknown as
        | SchemaLike
        | undefined;
      const compiled = compileTemplate(
        settings.relations[sourceUid]?.[fieldName] ?? '',
        targetSchema
      );
      if (!compiled || !isRecord(metadata)) {
        continue;
      }

      metadatas[fieldName] = {
        ...metadata,
        edit: {
          ...(isRecord(metadata.edit) ? metadata.edit : {}),
          mainField: compiled.displayField,
        },
        list: {
          ...(isRecord(metadata.list) ? metadata.list : {}),
          mainField: compiled.displayField,
        },
      };
      relationNames[fieldName] = { mainField: compiled.displayField };
    }

    return {
      ...configuration,
      metadatas,
      settings: {
        ...(isRecord(configuration.settings) ? configuration.settings : {}),
        relationNames,
      },
    };
  };

  const decorateContentManagerConfiguration = async (data: any, sourceUid: string) => {
    if (!isRecord(data)) {
      return data;
    }

    const next = { ...data };
    if (next.contentType) {
      next.contentType = await decorateConfiguration(next.contentType, sourceUid);
    }
    if (next.component) {
      next.component = await decorateConfiguration(next.component, sourceUid);
    }
    if (isRecord(next.components)) {
      const components = { ...next.components };
      for (const [uid, configuration] of Object.entries(components)) {
        components[uid] = await decorateConfiguration(configuration, uid);
      }
      next.components = components;
    }
    return next;
  };

  const decorateCollectionResults = async (ctx: any, sourceUid: string, results: unknown[]) => {
    const settings = await getSettings();
    const runtimeCache = new Map<string, RelationRuntime | null>();
    const sourceSchemas = new Map<string, SchemaLike | undefined>();

    const getSchema = (uid: string) => {
      if (!sourceSchemas.has(uid)) {
        sourceSchemas.set(uid, strapi.getModel(uid as never) as unknown as SchemaLike | undefined);
      }
      return sourceSchemas.get(uid);
    };

    const visit = async (value: unknown, uid: string): Promise<void> => {
      if (Array.isArray(value)) {
        for (const item of value) {
          await visit(item, uid);
        }
        return;
      }
      if (!isRecord(value)) {
        return;
      }

      const schema = getSchema(uid);
      for (const [fieldName, attribute] of Object.entries(schema?.attributes ?? {})) {
        if (attribute.type === 'relation' && attribute.target) {
          const cacheKey = `${uid}:${fieldName}`;
          if (!runtimeCache.has(cacheKey)) {
            runtimeCache.set(
              cacheKey,
              await getRuntime(strapi, settings, uid, fieldName, ctx.state.userAbility)
            );
          }
          const runtime = runtimeCache.get(cacheKey);
          if (runtime) {
            const originalRelation = value[fieldName];
            const relationItems = relationValues(originalRelation);
            const hydrated = await hydrateValues(strapi, ctx, runtime, relationItems);
            value[fieldName] = replaceRelationValue(
              originalRelation,
              relationItems,
              hydrated,
              runtime
            );
          }
        }

        if (attribute.type === 'component' && attribute.component) {
          await visit(value[fieldName], attribute.component);
        }

        if (attribute.type === 'dynamiczone' && Array.isArray(attribute.components)) {
          for (const item of relationValues(value[fieldName])) {
            if (
              typeof item.__component === 'string' &&
              attribute.components.includes(item.__component)
            ) {
              await visit(item, item.__component);
            }
          }
        }
      }
    };

    for (const result of results) {
      await visit(result, sourceUid);
    }
    return results;
  };

  return {
    decorateCollectionResults,
    decorateConfiguration: decorateContentManagerConfiguration,
    decorateRelationResults,
    compileTemplate,
    parseTemplate,
    renderTemplate,
  };
};

export { compileTemplate, parseTemplate, renderTemplate };
export default relationLabels;
