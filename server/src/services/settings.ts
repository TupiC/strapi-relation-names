import type { Core } from '@strapi/strapi';

import { isRecord } from '../../../shared/records';
import { PLUGIN_ID } from '../constants';
import { EMPTY_SETTINGS } from '../types';
import type { RelationNamesSettings } from '../types';

const STORE_KEY = 'settings';

const normalizeSettings = (value: unknown, collections: string[] = []): RelationNamesSettings => {
  if (!isRecord(value) || !isRecord(value.relations)) {
    return { collections, relations: {} };
  }

  const relations: RelationNamesSettings['relations'] = {};

  for (const [sourceUid, sourceRelations] of Object.entries(value.relations)) {
    if (!isRecord(sourceRelations)) {
      continue;
    }

    const normalizedRelations: Record<string, string> = {};

    for (const [fieldName, template] of Object.entries(sourceRelations)) {
      if (typeof template === 'string' && template.length > 0) {
        normalizedRelations[fieldName] = template;
      }
    }

    if (Object.keys(normalizedRelations).length > 0) {
      relations[sourceUid] = normalizedRelations;
    }
  }

  return { collections, relations };
};

const settings = ({ strapi }: { strapi: Core.Strapi }) => {
  const getCollections = (): string[] => {
    const config = strapi.config.get('plugin::strapi-relation-names') as
      | { collections?: unknown }
      | undefined;

    return Array.isArray(config?.collections)
      ? config.collections.filter(
          (collection): collection is string => typeof collection === 'string'
        )
      : [];
  };

  const store = () =>
    strapi.store({
      type: 'plugin',
      name: PLUGIN_ID,
      key: STORE_KEY,
    });

  return {
    async get(): Promise<RelationNamesSettings> {
      const value = await store().get();
      return normalizeSettings(value ?? EMPTY_SETTINGS, getCollections());
    },

    async set(value: unknown): Promise<RelationNamesSettings> {
      const normalized = normalizeSettings(value, getCollections());
      await store().set({ value: normalized });
      return normalized;
    },
  };
};

export { normalizeSettings };
export default settings;
