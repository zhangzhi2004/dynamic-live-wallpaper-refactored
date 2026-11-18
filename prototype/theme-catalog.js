"use strict";
// Theme validation, setting defaults and browser profile persistence.
window.ThemeCatalog = Object.freeze({
  defaults(theme) {
    const values = theme.adaptive ? { adaptive: 1 } : {};
    for (const group of theme.groups || [])
      for (const param of group.params) values[param.key] = param.default;
    return values;
  },
  validate(registry) {
    if (!Array.isArray(registry?.themes) || !registry.themes.length)
      throw new Error("Empty theme catalog");
    const ids = new Set();
    for (const theme of registry.themes) {
      if (!/^[a-z][a-z0-9-]*$/.test(theme.id) || ids.has(theme.id))
        throw new Error("Invalid or duplicate theme id");
      ids.add(theme.id);
      if (
        theme.status !== "ready" ||
        theme.locked ||
        !/^[\w/-]+\.html$/.test(theme.page) ||
        theme.page.includes("..")
      )
        throw new Error("Theme requires a runnable local page: " + theme.id);
      const keys = new Set();
      for (const group of theme.groups || [])
        for (const p of group.params) {
          if (keys.has(p.key) || !Number.isFinite(p.default))
            throw new Error("Invalid parameter: " + p.key);
          keys.add(p.key);
          if (
            !p.options &&
            !(p.min <= p.default && p.default <= p.max && p.step > 0)
          )
            throw new Error("Invalid parameter range");
        }
    }
    return registry;
  },
  previewUrl(theme) {
    const url = new URL(theme.page, location.href);
    url.searchParams.set("preview", "1");
    return url.href;
  },
  loadProfile() {
    try {
      const profile = JSON.parse(
        localStorage.getItem("deskland-local-profile") || "{}",
      );
      return profile && typeof profile === "object" && !Array.isArray(profile)
        ? profile
        : {};
    } catch {
      return {};
    }
  },
  saveProfile(state) {
    try {
      localStorage.setItem(
        "deskland-local-profile",
        JSON.stringify({
          theme: state.theme,
          params: state.params,
          lang: state.langSetting,
        }),
      );
    } catch {
      /* WebView privacy modes can disable storage. */
    }
  },
});
