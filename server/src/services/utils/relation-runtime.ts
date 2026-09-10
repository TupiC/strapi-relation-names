import type { Core } from '@strapi/strapi';

import type { RelationNamesSettings } from '../../types';
import type { TransformContext } from '../../../../shared/template';

import { compileTemplate, type RelationRuntime, type SchemaLike } from './relation-labels';

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

export const getRuntime = async (
  strapi: Core.Strapi,
  settings: RelationNamesSettings,
  sourceUid: string,
  targetField: string,
  userAbility: unknown,
  transformContext: TransformContext
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
    transformContext,
    displayField: compiled.placeholders.some((placeholder) => placeholder.includes('.'))
      ? originalMainField
      : compiled.displayField,
    sourceUid,
    targetUid: targetSchema.uid,
    originalMainField,
  };
};

export const getTransformContext = (strapi: Core.Strapi): TransformContext => {
  const config = strapi.config.get('plugin::strapi-relation-names') as
    | { locale?: unknown; timeZone?: unknown }
    | undefined;

  return {
    locale: typeof config?.locale === 'string' ? config.locale : undefined,
    timeZone: typeof config?.timeZone === 'string' ? config.timeZone : undefined,
  };
};
