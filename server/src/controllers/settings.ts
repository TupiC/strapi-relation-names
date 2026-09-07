import type { Core } from "@strapi/strapi";

const settings = ({ strapi }: { strapi: Core.Strapi }) => ({
  async find(ctx: any) {
    const data = await strapi.plugin("strapi-relation-names").service("settings").get();
    ctx.body = { data };
  },

  async update(ctx: any) {
    const body = ctx.request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return ctx.badRequest("Settings must be an object");
    }

    const data = await strapi.plugin("strapi-relation-names").service("settings").set(body);
    ctx.body = { data };
  },
});

export default settings;
