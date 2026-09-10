import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../constants';
import {
  compileTemplate,
  isRecord,
  parseTemplate,
  type RelationRuntime,
  renderTemplate,
  type SchemaLike,
} from './utils/relation-labels';
import { applyLabel, relationValues, replaceRelationValue } from './utils/relation-values';
import { isCollectionEnabled } from './utils/collections';
import { buildPopulate, hydrateValues } from './utils/relation-hydration';
import { getRuntime, getTransformContext } from './utils/relation-runtime';

const relationLabels = ({ strapi }: { strapi: Core.Strapi }) => {
  const getSettings = () => strapi.plugin(PLUGIN_ID).service('settings').get();

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
      ctx.state.userAbility,
      getTransformContext(strapi)
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
    const sourceSchema = strapi.getModel(sourceUid as never) as unknown as SchemaLike | undefined;

    for (const [fieldName, metadata] of Object.entries(metadatas)) {
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
      const isNestedTemplate = compiled.placeholders.some((placeholder) =>
        placeholder.includes('.')
      );
      const isIdentityField = configuredMainField === 'id' || configuredMainField === 'documentId';

      const displayField =
        isNestedTemplate && isIdentityField
          ? 'label'
          : isNestedTemplate
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

  const sanitizeConfigurationUpdate = (configuration: any) => {
    if (!isRecord(configuration) || !isRecord(configuration.metadatas)) {
      return configuration;
    }

    const configurationSettings = isRecord(configuration.settings) ? configuration.settings : {};
    const relationNames = isRecord(configurationSettings.relationNames)
      ? configurationSettings.relationNames
      : {};
    const { relationNames: _relationNames, ...sanitizedSettings } = configurationSettings;
    const metadatas = { ...configuration.metadatas };

    for (const [fieldName, metadata] of Object.entries(metadatas)) {
      const relationName = relationNames[fieldName];
      if (!isRecord(relationName) || !isRecord(metadata)) {
        continue;
      }

      const sanitizedMetadata = { ...metadata };
      if (isRecord(metadata.list)) {
        const { mainField: _mainField, ...sanitizedList } = metadata.list;
        sanitizedMetadata.list = sanitizedList;
      }
      if (
        relationName.mainField === 'label' &&
        isRecord(metadata.edit) &&
        metadata.edit.mainField === 'label'
      ) {
        sanitizedMetadata.edit = { ...metadata.edit, mainField: 'id' };
      }

      metadatas[fieldName] = sanitizedMetadata;
    }

    return { ...configuration, settings: sanitizedSettings, metadatas };
  };

  const decorateCollectionResults = async (ctx: any, sourceUid: string, results: unknown[]) => {
    const settings = await getSettings();
    if (!isCollectionEnabled(settings.collections, sourceUid)) {
      return results;
    }

    const runtimeCache = new Map<string, RelationRuntime | null>();
    const sourceSchemas = new Map<string, SchemaLike | undefined>();
    const transformContext = getTransformContext(strapi);

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
              await getRuntime(
                strapi,
                settings,
                uid,
                fieldName,
                ctx.state.userAbility,
                transformContext
              )
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
    sanitizeConfigurationUpdate,
    decorateRelationResults,
    compileTemplate,
    parseTemplate,
    renderTemplate,
  };
};

export { buildPopulate };
export { compileTemplate, parseTemplate, renderTemplate } from './utils/relation-labels';
export default relationLabels;
