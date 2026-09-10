import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from '../constants';

const settings = ({ strapi }: { strapi: Core.Strapi }) => ({
  async find(ctx: any) {
    const data = await strapi.plugin(PLUGIN_ID).service('settings').get();
    ctx.body = { data };
  },

  async update(ctx: any) {
    const body = ctx.request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return ctx.badRequest('Settings must be an object');
    }

    const data = await strapi.plugin(PLUGIN_ID).service('settings').set(body);
    ctx.body = { data };
  },
});

export default settings;
