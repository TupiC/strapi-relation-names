export default () => ({
  type: "admin",
  routes: [
    {
      method: "GET",
      path: "/settings",
      handler: "settings.find",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
      },
    },
    {
      method: "PUT",
      path: "/settings",
      handler: "settings.update",
      config: {
        policies: ["admin::isAuthenticatedAdmin"],
      },
    },
  ],
});
