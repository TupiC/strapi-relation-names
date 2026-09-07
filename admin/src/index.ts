import { getTranslation } from './utils/getTranslation';
import { mutateEditLayout, mutateListHeaders } from './utils/layout';
import { PLUGIN_ID } from './pluginId';

import type { StrapiApp } from '@strapi/strapi/admin';

const plugin: StrapiApp['appPlugins'][string] = {
  register(app) {
    app.addSettingsLink('global', {
      id: PLUGIN_ID,
      to: PLUGIN_ID,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: 'Relation Names',
      },
      Component: () =>
        import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
      permissions: [],
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      isReady: true,
      name: PLUGIN_ID,
    });
  },

  bootstrap({ registerHook }) {
    registerHook('Admin/CM/pages/EditView/mutate-edit-view-layout', mutateEditLayout);
    registerHook('Admin/CM/pages/ListView/inject-column-in-table', mutateListHeaders);
  },

  registerTrads({ locales }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = (await import(`./translations/${locale}.json`)) as {
            default: Record<string, string>;
          };

          const newData: Record<string, string> = {};
          const keys = Object.keys(data);

          for (const key of keys) {
            newData[getTranslation(key)] = data[key];
          }

          return { data: newData, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};

export default plugin;
