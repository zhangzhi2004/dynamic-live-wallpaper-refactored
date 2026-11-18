"use strict";
const host = window.chrome && window.chrome.webview;
const send = (m) => {
  if (host) host.postMessage(JSON.stringify(m));
  else queueMicrotask(() => ThemeCatalog.saveProfile(state));
};

const state = {
  registry0: null,
  registry: null,
  theme: "beach",
  params: {},
  screen: null,
  icons: null,
  langSetting: "auto",
  langSys: "zh-CN",
  controlTab: "elements",
  autostartWarn: false,
  autostartSw: "",
  updateVersion: "",
  updateStatus: "",
  updateProgress: -1,
  updateError: "",
};
const $ = (id) => document.getElementById(id);
const frame = $("preview");

/* ---------- 界面语言：文字表在 i18n/<语言>.json（ui：界面文字；themes：主题名和参数——简体中文的就是 themes.json 本身） ---------- */
// 增加语言时同步宿主 I18n.Supported 与体验版导出的语言列表。
const LANGS = { en: "English", "zh-CN": "简体中文" };
const I18N = {};
let lang = "zh-CN";
const loadLang = (code) =>
  I18N[code]
    ? Promise.resolve()
    : fetch("i18n/" + code + ".json?v=0.3.7", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          I18N[code] = j;
        })
        .catch(() => {
          I18N[code] = {};
        });
// 一句界面文字：当前语言 → 英文 → 简体中文；{名字} 换成 vars 里的值
function t(key, vars) {
  const pick = (c) => I18N[c] && I18N[c].ui && I18N[c].ui[key];
  let str = pick(lang) ?? pick("en") ?? pick("zh-CN") ?? key;
  if (vars) str = str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  return str;
}
// 更新、授权和反馈共用同一组底层连接错误；各业务仍可覆盖成更具体的提示。
function connectionErrorText(code) {
  const keys = {
    network_timeout: "networkTimeout",
    network_dns: "networkDns",
    network_tls: "networkTls",
    network_local: "networkLocal",
    network_error: "networkLocal",
    server_unavailable: "serverUnavailable",
    server_rejected: "serverRejected",
    server_invalid: "serverInvalid",
    download_invalid: "downloadInvalid",
  };
  return keys[code] ? t(keys[code]) : "";
}
// 没有宿主时（浏览器里调界面）"跟随系统"按浏览器的语言
function browserLang() {
  for (const l of navigator.languages || [navigator.language]) {
    const x = (l || "").toLowerCase();
    if (x.startsWith("zh")) return "zh-CN";
    if (LANGS[x.slice(0, 2)]) return x.slice(0, 2);
  }
  return "en";
}
// 主题名、说明、分组、参数按界面语言换：当前语言 → 英文 → themes.json 原文（简体中文）
function localizeRegistry() {
  const reg = JSON.parse(JSON.stringify(state.registry0));
  const srcs =
    lang === "zh-CN"
      ? []
      : [lang, "en"].map((c) => (I18N[c] && I18N[c].themes) || {});
  for (const th of reg.themes) {
    const trs = srcs.map((x) => x[th.id]).filter(Boolean);
    const get = (f) => {
      for (const x of trs) {
        const v = f(x);
        if (v != null) return v;
      }
      return null;
    };
    th.name = get((x) => x.name) ?? th.name;
    th.desc = get((x) => x.desc) ?? th.desc;
    (th.groups || []).forEach((g, gi) => {
      g.name = get((x) => x.groups && x.groups[gi]) ?? g.name;
      for (const p of g.params) {
        const q = (f) =>
          get((x) => (x.params && x.params[p.key] ? f(x.params[p.key]) : null));
        p.label = q((y) => y.label) ?? p.label;
        p.hint = q((y) => y.hint) ?? p.hint;
        p.options = q((y) => y.options) ?? p.options;
        p.unit = q((y) => y.unit) ?? p.unit;
      }
    });
  }
  state.registry = reg;
}
function applyStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nLabel));
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    el.alt = t(el.dataset.i18nAlt);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  $("lang").innerHTML =
    `<option value="auto" title="${t("langAutoWith", { name: LANGS[state.langSys] || "" })}">${t("langAuto")}</option>` +
    Object.entries(LANGS)
      .map(([c, n]) => `<option value="${c}">${n}</option>`)
      .join("");
  $("lang").value = state.langSetting in LANGS ? state.langSetting : "auto";
  $("lang").setAttribute("aria-label", t("language"));
}
async function setLang(code) {
  if (!LANGS[code]) code = "en";
  await Promise.all([loadLang("zh-CN"), loadLang("en"), loadLang(code)]);
  lang = code;
  localizeRegistry();
  applyStatic();
}
// 换了语言：界面上的字都重新填一遍（预览不用重新加载）
function rerenderTexts() {
  if (!state.screen) return;
  renderHead();
  renderThemes();
  renderControls();
  updateFoot();
  shareBusy(shareState);
  showAutostartWarn();
  showUpdate();
}
$("lang").addEventListener("change", (e) => {
  state.langSetting = e.target.value;
  if (host)
    send({ t: "lang", v: state.langSetting }); // 宿主存下来、换托盘菜单的文字，再回一条 lang（实际用哪种）
  else
    setLang(
      state.langSetting === "auto" ? state.langSys : state.langSetting,
    ).then(() => {
      rerenderTexts();
      ThemeCatalog.saveProfile(state);
    });
});

/* ---------- 主题清单 ---------- */
const themeById = (id) => state.registry.themes.find((t) => t.id === id);
const defaultsOf = (theme) => ThemeCatalog.defaults(theme);
function valuesOf(theme) {
  return Object.assign(defaultsOf(theme), state.params[theme.id] || {});
}
function fmt(p, v) {
  if (p.options) return p.options[v] || "";
  if (p.format === "times") return "×" + v.toFixed(2);
  if (p.format === "percent") return Math.round(v * 100) + "%";
  const s = Number.isInteger(p.step) ? String(Math.round(v)) : v.toFixed(2);
  return p.unit ? s + " " + p.unit : s;
}

const thumbUrl = (value, id) =>
  themeById(id)?.thumbnail ||
  window.DESKLAND_THUMBS?.[id] ||
  String(value || "").match(/^url\(([^)]+)\)/)?.[1] ||
  "";
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
function renderThemes() {
  const container = $("themes");
  const focused =
    container.contains(document.activeElement) &&
    document.activeElement.dataset.id;
  container.innerHTML =
    state.registry.themes
      .map((th) => {
        const on = th.id === state.theme;
        return `<button class="theme${on ? " on" : ""}" data-id="${th.id}" aria-pressed="${on}" aria-label="${escapeHtml(th.name)}">
      <span class="thumb" style="background:${th.thumb || "#ccc"}"><img src="${thumbUrl(th.thumb, th.id)}" alt="" decoding="async"></span>
      <span class="theme-copy"><span class="name">${escapeHtml(th.name)}</span></span>
      ${on ? `<span class="badge" aria-hidden="true">${t("badgeOn")}</span>` : ""}</button>`;
      })
      .join("") || `<p class="empty">${t("emptySearch")}</p>`;
  if (focused)
    container
      .querySelector(`[data-id="${focused}"]`)
      ?.focus({ preventScroll: true });
}
$("themes").addEventListener("click", (e) => {
  const b = e.target.closest(".theme");
  if (!b || b.disabled) return;
  if (b.dataset.id === state.theme) return;
  if (scheduled) flush();
  state.theme = b.dataset.id;
  send({ t: "theme", id: state.theme });
  if (seedOf(state.theme) === undefined) setSeed(newSeed(), false); // 还没有种子：给一个，桌面和预览从一开始就是同一张
  showTheme();
});

/* ---------- 刷新：换一张（新的种子，按主题存进设置；桌面和预览用同一个种子） ---------- */
const newSeed = () => Math.floor(Math.random() * 1e6);
const seedOf = (id) => (state.params[id] || {}).seed;
function setSeed(v, live) {
  (state.params[state.theme] = state.params[state.theme] || {}).seed = v;
  send({ t: "set", theme: state.theme, key: "seed", value: v });
  if (live) toPreview({ t: "settings", v: { seed: v } });
}
$("reseed").addEventListener("click", () => setSeed(newSeed(), true));

/* ---------- 参数控件（按清单自动生成） ---------- */
const isToggle = (p) =>
  p.options?.length === 2 || (p.element && p.min === 0 && p.max === 1);
function renderParam(p, value) {
  const toggle = isToggle(p);
  const count = p.element && !toggle;
  const changed = value !== p.default;
  const label = escapeHtml(p.label);
  const hint = escapeHtml(p.hint || p.label);
  const thumbnail = p.element && SceneElements.thumbnail(p.key);
  const controlId = `${toggle ? "toggle" : count ? "count" : "range"}-${p.key}`;
  const labelAttr =
    p.options && !toggle ? `id="label-${p.key}"` : `for="${controlId}"`;
  const reset = `<button class="undo" data-reset="${p.key}"${changed ? "" : " disabled"} title="${escapeHtml(t("resetOne", { v: fmt(p, p.default) }))}" aria-label="${escapeHtml(t("resetOneAria", { label: p.label }))}">↺</button>`;
  let valueControl;
  if (toggle) {
    valueControl = `<label class="switch-row"><input type="checkbox" id="${controlId}" data-toggle="${p.key}" role="switch" aria-label="${label}"${value === 1 ? " checked" : ""}><i class="switch" aria-hidden="true"></i></label>`;
  } else if (count) {
    valueControl = `<span class="count-stepper"><button data-count-step="${p.key}" data-delta="-1" ${value <= p.min ? "disabled" : ""} aria-label="${escapeHtml(t("decreaseElement", { name: p.label }))}">−</button><input type="number" id="${controlId}" data-count="${p.key}" min="${p.min}" max="${p.max}" step="1" value="${value}" aria-label="${escapeHtml(t("elementCount", { name: p.label }))}"><button data-count-step="${p.key}" data-delta="1" ${value >= p.max ? "disabled" : ""} aria-label="${escapeHtml(t("increaseElement", { name: p.label }))}">+</button></span>`;
  } else {
    valueControl = `<span class="value" id="v-${p.key}">${escapeHtml(fmt(p, value))}</span>`;
  }
  let secondary = "";
  if (p.options && !toggle) {
    secondary = `<div class="opts" data-key="${p.key}" role="radiogroup" aria-labelledby="label-${p.key}">${p.options.map((option, i) => `<button data-opt="${i}" role="radio" aria-checked="${value === i}" tabindex="${value === i ? 0 : -1}">${escapeHtml(option)}</button>`).join("")}</div>`;
  } else if (!p.options && !toggle && !count) {
    secondary = `<div class="track" title="${escapeHtml(t("dblclickReset", { v: fmt(p, p.default) }))}"><input type="range" id="${controlId}" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}"></div>`;
  }
  return `<div class="param${count ? " element-param" : ""}${toggle ? " param-toggle" : ""}${changed ? " changed" : ""}" id="p-${p.key}" data-value="${value}">
    <div class="row">${thumbnail ? `<span class="element-art" aria-hidden="true"><img src="${thumbnail}" alt=""></span>` : ""}
    <label class="label" ${labelAttr} title="${hint}">${label}${p.hint && !count ? `<span class="hint">${escapeHtml(p.hint.split("；")[0].split(". Set to")[0])}</span>` : ""}</label>
    <span class="right">${reset}${valueControl}</span></div>${secondary}</div>`;
}
function renderControls() {
  const theme = themeById(state.theme),
    vals = valuesOf(theme);
  if (!theme.groups) {
    $("controls").innerHTML = '<div class="empty">' + t("noParams") + "</div>";
    return;
  }
  const groupsHTML = theme.groups
    .map(
      (g) => `
    <div data-section="${g.kind !== "environment" && (g.kind === "extras" || g.params.some((p) => p.element || p.options)) ? "elements" : "environment"}" class="group${g.kind === "extras" ? " extra-group" : ""}">
      <div class="group-head"><h3>${escapeHtml(g.name)}</h3>${g.kind === "extras" ? `<div class="extras-actions"><button class="ghost-btn" data-extras="clear">${t("clearExtras")}</button><button class="ghost-btn" data-extras="restore">${t("restoreExtras")}</button></div>` : ""}</div>
      ${g.kind === "extras" ? `<p class="elements-note">${t("elementsNote")}</p>` : ""}
      ${g.params.map((p) => renderParam(p, vals[p.key])).join("")}
      ${g.soon ? `<div class="soon">${t("comingSoon")}${g.soon.map((s) => `<span class="chip">${s}</span>`).join("")}</div>` : ""}
    </div>`,
    )
    .join("");
  const content = document.createElement("template");
  content.innerHTML = groupsHTML;
  $("controls").replaceChildren();
  for (const tab of ["elements", "environment"]) {
    const panel = document.createElement("div");
    panel.id = "panel-" + tab;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "tab-" + tab);
    panel.tabIndex = 0;
    panel.append(
      ...content.content.querySelectorAll(`[data-section="${tab}"]`),
    );
    $("controls").append(panel);
  }
  selectControlTab(state.controlTab);
  $("controls").querySelectorAll("input[type=range]").forEach(fill);
}
function selectControlTab(tab, focus = false) {
  state.controlTab = tab;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const on = button.dataset.tab === tab;
    button.setAttribute("aria-selected", on);
    button.tabIndex = on ? 0 : -1;
    if (on && focus) button.focus();
  });
  document
    .querySelectorAll("[role=tabpanel]")
    .forEach((panel) => (panel.hidden = panel.id !== "panel-" + tab));
  $("controls").scrollTop = 0;
}
document.querySelector(".control-tabs").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) selectControlTab(tab.dataset.tab);
});
document.querySelector(".control-tabs").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  selectControlTab(
    e.key === "Home"
      ? "elements"
      : e.key === "End"
        ? "environment"
        : state.controlTab === "elements"
          ? "environment"
          : "elements",
    true,
  );
});
function fill(inp) {
  inp.style.setProperty(
    "--p",
    ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + "%",
  );
}
const paramOf = (key) =>
  themeById(state.theme)
    .groups.flatMap((g) => g.params)
    .find((x) => x.key === key);

// 改一个参数：更新界面，并排队发给宿主和预览（拖动时每帧最多发一次）
let pending = {},
  scheduled = false,
  pendingTheme = null;
function setParam(key, v) {
  const theme = themeById(state.theme);
  if (key === "adaptive") {
    if (!theme.adaptive || (v !== 0 && v !== 1)) return;
    $("adaptive").checked = v === 1;
  } else {
    const p = paramOf(key);
    if (!p || !Number.isFinite(v)) return;
    const toggle = isToggle(p);
    v = p.options
      ? Math.max(0, Math.min(p.options.length - 1, Math.round(v)))
      : Math.max(p.min, Math.min(p.max, p.element ? Math.round(v) : v));
    const row = $("p-" + key);
    const focus = document.activeElement;
    let control;
    if (toggle) {
      control = $("toggle-" + key);
      control.checked = v === 1;
    } else if (p.options) {
      row.querySelectorAll("[data-opt]").forEach((button) => {
        const on = +button.dataset.opt === v;
        button.setAttribute("aria-checked", on);
        button.tabIndex = on ? 0 : -1;
        if (on) control = button;
      });
    } else if (p.element) {
      control = $("count-" + key);
      control.value = v;
      row.querySelectorAll("[data-count-step]").forEach((button) => {
        button.disabled = +button.dataset.delta < 0 ? v <= p.min : v >= p.max;
      });
    } else {
      control = $("range-" + key);
      if (+control.value !== v) control.value = v;
      fill(control);
    }
    const value = $("v-" + key);
    if (value) value.textContent = fmt(p, v);
    row.dataset.value = v;
    row.classList.toggle("changed", v !== p.default);
    row.querySelector(".undo").disabled = v === p.default;
    if (row.contains(focus) && focus.disabled)
      control?.focus({ preventScroll: true });
  }
  if (valuesOf(theme)[key] === v) return;
  if (pendingTheme && pendingTheme !== state.theme) flush();
  pendingTheme = state.theme;
  (state.params[state.theme] = state.params[state.theme] || {})[key] = v;
  pending[key] = v;
  // 不用 requestAnimationFrame：窗口在后台或被遮住时它会暂停，消息就积压了
  if (!scheduled) {
    scheduled = true;
    setTimeout(flush, 30);
  }
}
$("controls").addEventListener("input", (e) => {
  const { key, toggle } = e.target.dataset;
  if (key) setParam(key, e.target.valueAsNumber);
  if (toggle) setParam(toggle, Number(e.target.checked));
});
// 单项恢复默认：点 ↺，或双击滑块
function commitCount(input) {
  const key = input.dataset.count;
  const value = input.valueAsNumber;
  if (Number.isFinite(value)) {
    setParam(key, value);
    if (scheduled) flush();
  } else input.value = valuesOf(themeById(state.theme))[key];
}
$("controls").addEventListener("change", (e) => {
  if (e.target.dataset.count) commitCount(e.target);
});
$("controls").addEventListener("keydown", (e) => {
  const { count, opt } = e.target.dataset;
  if (count && e.key === "Enter") {
    commitCount(e.target);
    e.preventDefault();
  }
  if (count && e.key === "Escape") {
    e.target.value = valuesOf(themeById(state.theme))[count];
  }
  if (opt === undefined) return;
  const group = e.target.closest(".opts");
  const options = [...group.querySelectorAll("[data-opt]")];
  const current = options.indexOf(e.target);
  let next;
  switch (e.key) {
    case "Home":
      next = 0;
      break;
    case "End":
      next = options.length - 1;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      next = (current + options.length - 1) % options.length;
      break;
    case "ArrowRight":
    case "ArrowDown":
      next = (current + 1) % options.length;
      break;
    default:
      return;
  }
  e.preventDefault();
  setParam(group.dataset.key, next);
  options[next].focus();
});
$("controls").addEventListener("click", (e) => {
  const step = e.target.closest("[data-count-step]");
  if (step) {
    const key = step.dataset.countStep;
    setParam(key, valuesOf(themeById(state.theme))[key] + +step.dataset.delta);
    return;
  }
  const bulk = e.target.closest("[data-extras]");
  if (bulk) {
    for (const g of themeById(state.theme).groups)
      if (g.kind === "extras")
        for (const p of g.params)
          setParam(p.key, bulk.dataset.extras === "clear" ? 0 : p.default);
    return;
  }
  const b = e.target.closest("[data-reset]");
  if (b) setParam(b.dataset.reset, paramOf(b.dataset.reset).default);
  const o = e.target.closest("[data-opt]");
  if (o) setParam(o.closest(".opts").dataset.key, +o.dataset.opt);
});
$("controls").addEventListener("dblclick", (e) => {
  const inp =
    e.target.closest(".track") &&
    e.target.closest(".track").querySelector("input");
  if (inp) setParam(inp.dataset.key, paramOf(inp.dataset.key).default);
});
function flush() {
  scheduled = false;
  const batch = pending,
    theme = pendingTheme;
  pending = {};
  pendingTheme = null;
  if (!Object.keys(batch).length) return;
  for (const k in batch) send({ t: "set", theme, key: k, value: batch[k] });
  if (theme === state.theme) toPreview({ t: "settings", v: batch });
  flashSaved();
}
let savedT = 0;
function flashSaved() {
  clearTimeout(savedT);
  $("saved").textContent = t("saved");
  $("saved").classList.add("flash");
  savedT = setTimeout(() => {
    $("saved").textContent = t("autosave");
    $("saved").classList.remove("flash");
  }, 1600);
}

$("autostart").addEventListener("change", (e) =>
  send({ t: "autostart", v: e.target.checked }),
);
$("adaptive").addEventListener("change", (e) =>
  setParam("adaptive", e.target.checked ? 1 : 0),
);
$("autostartWarnOk").addEventListener("click", () => {
  state.autostartWarn = false;
  showAutostartWarn();
  send({ t: "autostartWarnSeen" });
});
// 开机自启被拦的提醒：宿主只给安全软件的名字，句子按界面语言拼
function showAutostartWarn() {
  $("autostartWarnText").textContent = state.autostartSw
    ? t("autostartWarnSw", { sw: state.autostartSw })
    : t("autostartWarnGeneric");
  $("autostartWarn").hidden = !state.autostartWarn;
}

/* ---------- 程序更新：版本、阶段、进度和错误全部来自宿主 ---------- */
function showUpdate() {
  const status = state.updateStatus,
    checking = status === "checking";
  const busy = status === "downloading" || status === "installing";
  const available = !!status;
  $("updateNotice").hidden = !available;
  if (!available) return;
  const percent =
    state.updateProgress >= 0 && state.updateProgress <= 1
      ? Math.round(state.updateProgress * 100) + "%"
      : "";
  const errors = {
    canceled: "updateCanceled",
    error_low_battery: "updateLowBattery",
    error_wifi_recommended: "updateWifiRecommended",
    error_wifi_required: "updateWifiRequired",
    microsoft_package_required: "updateStoreRequired",
  };
  let detail = state.updateVersion
    ? t("updateVersion", { version: state.updateVersion })
    : "";
  if (checking) detail = t("updateChecking");
  else if (busy)
    detail = t(
      status === "installing" ? "updateInstalling" : "updateDownloading",
      { progress: percent },
    );
  else if (status === "completed") detail = t("updateCompleted");
  else if (status === "error") {
    const key = errors[state.updateError];
    detail = key
      ? t(key)
      : connectionErrorText(state.updateError) || t("updateFailed");
  }
  const titleKey =
    status === "completed"
      ? "updateCompletedTitle"
      : checking
        ? "updateCheckingTitle"
        : status === "error"
          ? state.updateVersion
            ? "updateFailedTitle"
            : "updateCheckFailedTitle"
          : "updateAvailable";
  document.querySelector(".update-copy b").textContent = t(titleKey);
  $("updateVersion").textContent = detail;
  $("updateProgram").disabled = busy || checking || status === "completed";
  $("updateProgram").textContent = t(
    status === "completed"
      ? "updateDone"
      : busy || checking
        ? "updateWorking"
        : status === "error"
          ? "updateRetry"
          : "updateProgram",
  );
}
$("updateProgram").addEventListener("click", () => {
  if ($("updateProgram").disabled) return;
  if (state.updateStatus === "error" && !state.updateVersion) {
    send({ t: "updateCheck" });
    return;
  }
  if (state.updateVersion) send({ t: "updateProgram" });
});

/* ---------- 实时预览：iframe 按整块桌面的尺寸排版，再整体缩小 ---------- */
const toPreview = (m) => {
  if (frame.contentWindow)
    frame.contentWindow.postMessage(JSON.stringify(m), "*");
};
let previewReady = false;
let advertisedPreviewScale = 0;
function screenCss() {
  const k = window.devicePixelRatio || 1;
  return {
    w: Math.round(state.screen.w / k),
    h: Math.round(state.screen.h / k),
  };
}
function layoutPreview() {
  if (!state.screen) return;
  const s = screenCss(),
    stage = $("stage").getBoundingClientRect();
  const k = Math.max(0.05, Math.min(stage.width / s.w, stage.height / s.h));
  $("previewBox").style.width = Math.floor(s.w * k) + "px";
  $("previewBox").style.height = Math.floor(s.h * k) + "px";
  frame.style.width = s.w + "px";
  frame.style.height = s.h + "px";
  frame.style.transform = `scale(${k})`;
  const scale = k * (window.devicePixelRatio || 1);
  if (previewReady && Math.abs(scale - advertisedPreviewScale) > 0.012) {
    advertisedPreviewScale = scale;
    toPreview({ t: "view", scale });
  }
}
addEventListener("resize", layoutPreview);
new ResizeObserver(layoutPreview).observe($("stage"));
function expandPreview(expanded) {
  document.body.classList.toggle("preview-expanded", expanded);
  $("expandPreview").setAttribute("aria-expanded", expanded);
  $("expandPreview").setAttribute(
    "aria-label",
    t(expanded ? "collapsePreview" : "expandPreview"),
  );
  $("expandPreview").title = t(expanded ? "collapsePreview" : "expandPreview");
  // The original iframe stays alive, with the same clock and desktop geometry.
  document.querySelector(".themes").inert = expanded;
  document.querySelector(".inspector").inert = expanded;
  document.querySelector(".top").inert = expanded;
  document.querySelector(".bottom").inert = expanded;
  layoutPreview();
}
$("expandPreview").addEventListener("click", () =>
  expandPreview(!document.body.classList.contains("preview-expanded")),
);
addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    document.body.classList.contains("preview-expanded")
  ) {
    expandPreview(false);
    $("expandPreview").focus();
  }
});
addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow) return;
  let m;
  try {
    m = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
  } catch {
    return;
  }
  if (!m) return;
  if (m.t === "ready") {
    const expected = new URL(frame.src, location.href);
    if (frame.contentWindow.location.pathname !== expected.pathname) return;
    previewReady = true;
    $("stage").setAttribute("aria-busy", "false");
    layoutPreview();
    // 预览页面加载好了：先给设置，再给图标
    toPreview({ t: "settings", v: valuesOf(themeById(state.theme)) });
    if (state.icons) toPreview(state.icons);
  }
});
function updateFoot() {
  $("previewFoot").textContent = state.icons
    ? state.icons.vis
      ? t("previewIcons", { n: state.icons.r.length })
      : t("previewNoIcons")
    : t("livePreview");
}

function renderHead() {
  const th = themeById(state.theme);
  document.body.dataset.theme = th.id;
  $("themeName").textContent = th.name;
  $("themeDescription").textContent = th.desc;
  $("adaptiveRow").hidden = !th.adaptive;
  $("adaptive").checked = valuesOf(th).adaptive !== 0;
  $("adaptive").setAttribute("aria-label", t("adaptive"));
  $("expandPreview").setAttribute(
    "aria-label",
    t(
      document.body.classList.contains("preview-expanded")
        ? "collapsePreview"
        : "expandPreview",
    ),
  );
}
function showTheme() {
  renderHead();
  renderThemes();
  renderControls();
  updateFoot();
  const next = new URL(
    ThemeCatalog.previewUrl(themeById(state.theme)),
    location.href,
  ).href;
  if (frame.src !== next) {
    previewReady = false;
    advertisedPreviewScale = 0;
    $("stage").setAttribute("aria-busy", "true");
    frame.src = next;
  }
  layoutPreview();
}

/* ---------- 分享：宿主让壁纸页面画一张图 / 录一段动画（示例图标、名字是色块），保存、复制到剪贴板，再把预览发回来 ---------- */
let shareState = null;
function shareBusy(which) {
  // which：null（空闲）/ 'image' / 'video'
  shareState = which;
  $("share").disabled = $("shareVideo").disabled = !!which;
  $("shareText").textContent = t(
    which === "image" ? "generating" : "shareImage",
  );
  $("shareVideoText").textContent = t(
    which === "video" ? "preparingRec" : "shareVideo",
  );
}
function shareProgress(p) {
  $("shareVideoText").textContent =
    p < 1 ? t("recording", { p: Math.round(p * 100) }) : t("savingVideo");
}
function showShare(r) {
  shareBusy(null);
  if (!r.ok) {
    alert(
      t(r.kind === "video" ? "shareFailVideo" : "shareFailImage", {
        msg: r.msg || t("unknownReason"),
      }),
    );
    return;
  }
  const video = r.kind === "video",
    inHost = !!host;
  $("shareTitle").textContent = t(
    video ? "shareReadyVideo" : "shareReadyImage",
  );
  $("shareImg").hidden = video;
  $("shareVid").hidden = !video;
  if (video) {
    $("shareVid").src = r.url;
    $("shareVid").poster = r.thumb || "";
  } else {
    $("shareImg").src = r.thumb;
    $("shareVid").removeAttribute("src");
  }
  $("shareSub").textContent =
    t("sharePrivacy") +
    (inHost
      ? t(video ? "shareCopiedVideo" : "shareCopiedImage")
      : t("shareBrowserHint", { btn: t(video ? "saveVideo" : "saveImage") }));
  $("sharePath").textContent = r.path ? t("savedTo", { path: r.path }) : "";
  $("shareOpen").textContent = t(video ? "openVideo" : "openImage");
  $("shareReveal").hidden = $("shareOpen").hidden = !inHost;
  $("shareDownload").hidden = inHost;
  if (!inHost) {
    $("shareDownload").href = r.full;
    $("shareDownload").textContent = t(video ? "saveVideo" : "saveImage");
    $("shareDownload").download =
      "Deskland." + (video ? r.ext || "mp4" : "png");
  }
  $("shareModal").hidden = false;
  $("shareClose").focus();
}
function closeShare() {
  $("shareModal").hidden = true;
  $("shareVid").pause();
}
$("share").addEventListener("click", () => {
  shareBusy("image");
  if (host) {
    send({ t: "share" });
    return;
  }
  setTimeout(() => {
    // 没有宿主：直接让预览里的页面画一张（让按钮先显示"正在生成…"）
    try {
      const r = frame.contentWindow.desklandSnapshot();
      showShare({
        ok: true,
        thumb: r.thumb,
        full: r.canvas.toDataURL("image/png"),
      });
    } catch (e) {
      showShare({ ok: false, msg: e.message });
    }
  }, 30);
});
$("shareVideo").addEventListener("click", () => {
  shareBusy("video");
  if (host) {
    send({ t: "shareVideo" });
    return;
  }
  frame.contentWindow.desklandRecord(shareProgress).then(
    (r) => {
      // 没有宿主：让预览里的页面录一段
      const url = URL.createObjectURL(r.blob);
      showShare({
        ok: true,
        kind: "video",
        url,
        full: url,
        thumb: r.poster,
        ext: r.mime === "video/webm" ? "webm" : "mp4",
      });
    },
    (e) => showShare({ ok: false, kind: "video", msg: e.message }),
  );
});
$("shareClose").addEventListener("click", closeShare);
$("shareModal").addEventListener("click", (e) => {
  if (e.target === $("shareModal")) closeShare();
});

/* ---------- 使用帮助 ---------- */
let helpReturnFocus = null;
function openHelp() {
  helpReturnFocus = document.activeElement;
  $("helpModal").hidden = false;
  $("helpCloseX").focus();
}
function closeHelp() {
  if ($("helpModal").hidden) return;
  $("helpModal").hidden = true;
  if (helpReturnFocus) helpReturnFocus.focus();
}
$("helpOpen").addEventListener("click", openHelp);
$("helpCloseX").addEventListener("click", closeHelp);
$("helpDone").addEventListener("click", closeHelp);
$("helpModal").addEventListener("click", (e) => {
  if (e.target === $("helpModal")) closeHelp();
});

addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeShare();
    closeHelp();
  }
});
$("shareOpen").addEventListener("click", () => send({ t: "openShare" }));
$("shareReveal").addEventListener("click", () => send({ t: "revealShare" }));

/* ---------- 和宿主通信 ---------- */
function onHost(m) {
  if (m.t === "init") {
    state.langSetting = m.lang || "auto";
    state.langSys = m.langSys || "zh-CN";
    setLang(m.langEff || state.langSys).then(() => {
      // 先按界面语言把文字表读进来，再画界面
      state.theme =
        themeById(m.theme) && themeById(m.theme).status === "ready"
          ? m.theme
          : "beach";
      state.params = m.params || {};
      state.screen = m.screen;
      $("autostart").checked = !!m.autostart;
      state.autostartWarn = !!m.autostartWarn;
      state.autostartSw = m.autostartSw || "";
      showAutostartWarn();
      showUpdate();
      showTheme();
      document.documentElement.classList.add("ready");
    });
  } else if (m.t === "themeChanged") {
    if (
      m.id === state.theme ||
      !themeById(m.id) ||
      themeById(m.id).status !== "ready"
    )
      return;
    state.theme = m.id;
    showTheme();
  } else if (m.t === "updateState") {
    state.updateVersion = String(m.version || "").trim();
    state.updateStatus = m.status || (state.updateVersion ? "available" : "");
    state.updateProgress = typeof m.progress === "number" ? m.progress : -1;
    state.updateError = m.error || "";
    showUpdate();
  } else if (m.t === "updateAvailable") {
    // 兼容旧开发联调消息
    onHost({
      t: "updateState",
      version: m.version,
      status: "available",
      progress: -1,
    });
  } else if (m.t === "lang") {
    // 换了语言（宿主已经存好、换好托盘菜单）
    state.langSetting = m.v;
    state.langSys = m.sys || state.langSys;
    setLang(m.eff).then(rerenderTexts);
  } else if (m.t === "icons") {
    state.icons = m;
    toPreview(m);
    updateFoot();
  } else if (m.t === "autostart") {
    $("autostart").checked = !!m.v;
  } else if (m.t === "recProgress") {
    shareProgress(m.p);
  } else if (m.t === "shareResult") {
    showShare(m);
  }
}

// 单独在浏览器里打开时（没有宿主）：用模拟的桌面数据，方便调界面
function mockHost() {
  const k = window.devicePixelRatio || 1,
    W = 1707,
    H = 1067,
    r = [];
  const cell = (c, row) => {
    const x = 4 + c * 76,
      y = 6 + row * 100;
    r.push([x * k, y * k, (x + 76) * k, (y + 92) * k]);
  };
  for (let c = 0; c < 4; c++) for (let row = 0; row < 9; row++) cell(c, row);
  for (const [c, row] of [
    [6, 0],
    [6, 1],
    [7, 3],
    [8, 3],
    [8, 4],
    [12, 1],
    [13, 1],
    [14, 1],
    [13, 2],
    [14, 2],
    [20, 0],
    [21, 0],
    [19, 5],
    [20, 5],
  ])
    cell(c, row);
  const bl = browserLang();
  const saved = ThemeCatalog.loadProfile();
  const preferredLang =
    saved.lang === "en" || saved.lang === "zh-CN" ? saved.lang : bl;
  onHost({
    t: "init",
    theme: saved.theme || "meadow",
    params:
      saved.params && typeof saved.params === "object" ? saved.params : {},
    screen: { w: W * k, h: H * k },
    autostart: false,
    lang: saved.lang || "auto",
    langEff: preferredLang,
    langSys: bl,
  });
  onHost({ t: "icons", vis: true, r });
  if (new URLSearchParams(location.search).has("updateDemo"))
    onHost({
      t: "updateState",
      version: "0.2.0",
      status: "available",
      progress: -1,
    });
}

fetch("themes.json", { cache: "no-store" })
  .then((r) => r.json())
  .then(ThemeCatalog.validate)
  .then(async (reg) => {
    state.registry0 = state.registry = reg;
    await Promise.all(reg.themes.map((theme) => SceneArt.load(theme.id)));
    if (host) {
      host.addEventListener("message", (e) => onHost(JSON.parse(e.data)));
      send({ t: "hello" });
    } else mockHost();
  })
  .catch((error) => {
    console.error(error);
    document.documentElement.classList.add("ready");
    $("themes").textContent = "主题清单加载失败 / Could not load theme catalog";
  });
