import type { Core } from '@strapi/strapi';

import type { RelationNamesSettings } from '../types';

import {
  compileTemplate,
  getPathValue,
  isRecord,
  parseTemplate,
  renderTemplate,
  type RelationRuntime,
  type SchemaLike,
} from './utils/relation-labels';
import {
  applyLabel,
  getIdentity,
  matchesRelation,
  relationValues,
  replaceRelationValue,
} from './utils/relation-values';
import { isCollectionEnabled } from './utils/collections';

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
  const compiled =
    typeof template === 'string'
      ? compileTemplate(
          template,
          targetSchema,
          (uid) => strapi.getModel(uid as never) as unknown as SchemaLike | undefined
        )
      : null;

  if (!compiled || !targetSchema) {
    return null;
  }

  const originalMainField = await getOriginalMainField(
    strapi,
    sourceSchema,
    targetSchema,
    targetField,
    userAbility
  );

  return {
    ...compiled,
    displayField: compiled.placeholders.some((placeholder) => placeholder.includes('.'))
      ? originalMainField
      : compiled.displayField,
    sourceUid,
    targetUid: targetSchema.uid,
    originalMainField,
  };
};

type Populate = Record<string, true | { populate: Populate }>;

const buildPopulate = (placeholders: string[]): Populate | undefined => {
  const populate: Populate = {};

  for (const placeholder of placeholders) {
    const segments = placeholder.split('.');
    if (segments.length < 2) {
      continue;
    }

    let current = populate;
    for (const [index, segment] of segments.slice(0, -1).entries()) {
      const existing = current[segment];
      if (existing === true) {
        break;
      }

      if (index === segments.length - 2) {
        current[segment] = existing ?? true;
        break;
      }

      if (!existing) {
        current[segment] = { populate: {} };
      }

      const next = current[segment];
      if (next !== true) {
        current = next.populate;
      }
    }
  }

  return Object.keys(populate).length > 0 ? populate : undefined;
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
    values.some((value) => getPathValue(value, field) === undefined)
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
        ...runtime.placeholders.filter((field) => !field.includes('.')),
        runtime.originalMainField,
        'id',
        'documentId',
        'locale',
        'publishedAt',
      ])
    );
    const populate = buildPopulate(runtime.placeholders);
    const identityField = targetModelType === 'component' ? 'id' : 'documentId';
    const permissionQuery = await permissionChecker.sanitizedQuery.read({
      fields,
      filters: { [identityField]: { $in: identities } },
      ...(populate ? { populate } : {}),
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

const relationLabels = ({ strapi }: { strapi: Core.Strapi }) => {
  const getSettings = () => strapi.plugin('strapi-relation-names').service('settings').get();

  const decorateRelationResults = async (
    ctx: any,
    sourceUid: string,
    targetField: string,
    results: unknown[]
  ): Promise<unknown[]> => {
    const settings = await getSettings();
    if (!isCollectionEnabled(settings.collections, sourceUid)) {
      return results;
    }

    const runtime = await getRuntime(
      strapi,
      settings,
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
        targetSchema,
        (uid) => strapi.getModel(uid as never) as unknown as SchemaLike | undefined
      );
      if (!compiled || !isRecord(metadata)) {
        continue;
      }

      const editMetadata = isRecord(metadata.edit) ? metadata.edit : {};
      const configuredMainField =
        typeof editMetadata.mainField === 'string' ? editMetadata.mainField : 'id';
      const displayField = compiled.placeholders.some((placeholder) => placeholder.includes('.'))
        ? configuredMainField
        : compiled.displayField;

      metadatas[fieldName] = {
        ...metadata,
        edit: {
          ...editMetadata,
          mainField: displayField,
        },
        list: {
          ...(isRecord(metadata.list) ? metadata.list : {}),
          mainField: displayField,
        },
      };
      relationNames[fieldName] = { mainField: displayField };
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

    const settings = await getSettings();
    if (!isCollectionEnabled(settings.collections, sourceUid)) {
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
    if (!isCollectionEnabled(settings.collections, sourceUid)) {
      return results;
    }

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

export { buildPopulate };
export { compileTemplate, parseTemplate, renderTemplate } from './utils/relation-labels';
export default relationLabels;
