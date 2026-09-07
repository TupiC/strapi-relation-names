import type { Core } from '@strapi/strapi';

import { PLUGIN_ID } from './constants';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  const relationLabels = strapi.plugin(PLUGIN_ID).service('relation-labels');
  const controllers = strapi.get('controllers');

  controllers.extend('plugin::content-manager.relations', (controller: any) => ({
    ...controller,
    async findAvailable(ctx: any, next: any) {
      await controller.findAvailable(ctx, next);
      if (Array.isArray(ctx.body?.results)) {
        ctx.body.results = await relationLabels.decorateRelationResults(
          ctx,
          ctx.params.model,
          ctx.params.targetField,
          ctx.body.results
        );
      }
    },
    async findExisting(ctx: any, next: any) {
      await controller.findExisting(ctx, next);
      if (Array.isArray(ctx.body?.results)) {
        ctx.body.results = await relationLabels.decorateRelationResults(
          ctx,
          ctx.params.model,
          ctx.params.targetField,
          ctx.body.results
        );
      }
    },
  }));

  controllers.extend('plugin::content-manager.collection-types', (controller: any) => ({
    ...controller,
    async find(ctx: any, next: any) {
      await controller.find(ctx, next);
      if (Array.isArray(ctx.body?.results)) {
        ctx.body.results = await relationLabels.decorateCollectionResults(
          ctx,
          ctx.params.model,
          ctx.body.results
        );
      }
    },
  }));

  const decorateConfiguration = async (ctx: any, sourceUid: string) => {
    if (ctx.body?.data) {
      ctx.body.data = await relationLabels.decorateConfiguration(ctx.body.data, sourceUid);
    }
  };

  controllers.extend('plugin::content-manager.content-types', (controller: any) => ({
    ...controller,
    async findContentTypeConfiguration(ctx: any, next: any) {
      await controller.findContentTypeConfiguration(ctx, next);
      await decorateConfiguration(ctx, ctx.params.uid);
    },
    async updateContentTypeConfiguration(ctx: any, next: any) {
      await controller.updateContentTypeConfiguration(ctx, next);
      await decorateConfiguration(ctx, ctx.params.uid);
    },
  }));

  controllers.extend('plugin::content-manager.components', (controller: any) => ({
    ...controller,
    async findComponentConfiguration(ctx: any, next: any) {
      await controller.findComponentConfiguration(ctx, next);
      await decorateConfiguration(ctx, ctx.params.uid);
    },
    async updateComponentConfiguration(ctx: any, next: any) {
      await controller.updateComponentConfiguration(ctx, next);
      await decorateConfiguration(ctx, ctx.params.uid);
    },
  }));
};

export default register;
