const DATA_PATHS = {
  content: "data/content.json",
  nodes: "data/nodes.json",
  routes: "data/routes.json",
  designs: "data/totem_designs.json",
  materials: "data/materials.json",
  audio: "data/audio.json",
};

const SITE_PHOTO_PLACEHOLDER = "/images/placeholders/site-photo-placeholder.svg";

const state = {
  lang: "zh",
  content: null,
  nodes: [],
  routes: [],
  designs: {},
  materials: [],
  audio: {},
  activeRouteId: "heritage",
  activeNodeId: null,
  hoveredNodeId: null,
  detailNodeId: null,
  activePanel: "overview",
  imageMode: "existing",
  lastAudioText: "",
  lastAudioLang: "zh-CN",
  baiduMap: null,
  BMapGL: null,
  baiduOverlays: [],
  baiduMarkers: new Map(),
  resolvedLocations: [],
  anchorPoint: null,
  lastMapClick: null,
  mapStatus: "idle",
  mapError: "",
  mapStyleId: "",
  locationsResolved: 0,
  level3Visible: false,
  lightbox: {
    images: [],
    index: 0,
  },
  three: {
    THREE: null,
    OrbitControls: null,
    container: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    raycaster: null,
    pointer: null,
    model: null,
    parts: [],
    animationId: null,
    animationStarted: false,
    resizeObserver: null,
    pointerDown: null,
    initialized: false,
    initializing: null,
    debugLogged: false,
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Cannot load ${path}`);
  }
  return response.json();
}

async function loadProjectData() {
  try {
    const [content, nodes, routes, designs, materials, audio] = await Promise.all([
      loadJson(DATA_PATHS.content),
      loadJson(DATA_PATHS.nodes),
      loadJson(DATA_PATHS.routes),
      loadJson(DATA_PATHS.designs),
      loadJson(DATA_PATHS.materials),
      loadJson(DATA_PATHS.audio),
    ]);
    return { content, nodes, routes, designs, materials, audio };
  } catch (error) {
    if (window.QIAOXI_RUNTIME_DATA) {
      return window.QIAOXI_RUNTIME_DATA;
    }
    throw error;
  }
}

function t(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[state.lang] || value.zh || value.en || "";
}

function nodeById(id) {
  return state.nodes.find((node) => node.id === id);
}

function activeNode() {
  return nodeById(state.activeNodeId) || state.nodes[0];
}

function detailNode() {
  return nodeById(state.detailNodeId) || activeNode();
}

function activeRoute() {
  return state.routes.find((route) => route.id === state.activeRouteId) || state.routes[0];
}

function mergeDeep(base, override) {
  if (!override) return cloneData(base);
  const output = Array.isArray(base) ? [...base] : { ...base };
  Object.entries(override).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = mergeDeep(base[key], value);
      return;
    }
    output[key] = value;
  });
  return output;
}

function cloneData(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function activeDesign() {
  const node = activeNode();
  return mergeDeep(state.designs.default || {}, state.designs[node.id] || {});
}

function activeAudio() {
  const node = activeNode();
  if (state.audio[node.id]) return state.audio[node.id];
  return {
    zh: {
      current_location: node.audio_cn || t(node.description),
      direction_instruction: t(node.accessibility_information?.summary),
      accessibility_notice: t(node.accessibility_information?.tactile_note),
      cultural_interpretation: t(node.description),
    },
    en: {
      current_location: node.audio_en || t(node.description),
      direction_instruction: t(node.accessibility_information?.summary),
      accessibility_notice: t(node.accessibility_information?.tactile_note),
      cultural_interpretation: t(node.description),
    },
  };
}

function materialById(id) {
  return state.materials.find((material) => material.id === id);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function applyLanguage() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.body.classList.toggle("lang-zh", state.lang === "zh");
  document.body.classList.toggle("lang-en", state.lang === "en");
  $("#language-toggle").textContent = state.lang === "zh" ? "EN" : "中";

  $$("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (state.content.ui[key]) {
      element.textContent = t(state.content.ui[key]);
    }
  });

  renderRouteTabs();
  renderLocationList();
  updateRouteSummary();
  updateMapLabels();
  updateLocationDetail();
  if (state.activeNodeId) {
    renderNodeExperience();
  }
}

function nodeIndexLabel(index) {
  return String(index + 1).padStart(2, "0");
}

function rawNodePoint(node) {
  return {
    lng: Number(node.lng ?? node.longitude),
    lat: Number(node.lat ?? node.latitude),
  };
}

function isFiniteLocation(location) {
  return Number.isFinite(Number(location?.lng)) && Number.isFinite(Number(location?.lat));
}

function isResolvedLocation(location) {
  return location?.status === "resolved" && isFiniteLocation(location);
}

function resolvedLocationById(nodeId) {
  return state.resolvedLocations.find((location) => location.id === nodeId);
}

function validResolvedLocations() {
  return state.resolvedLocations.filter(isResolvedLocation);
}

function locationToPoint(BMapGL, location) {
  return new BMapGL.Point(Number(location.lng), Number(location.lat));
}

function makePendingLocation(node, status = "pending", source = "none") {
  return {
    id: node.id,
    nameZh: node.nameZh || node.name_cn || t(node.name),
    nameEn: node.nameEn || node.name_en,
    matchedName: "",
    address: node.address || "",
    lng: null,
    lat: null,
    source,
    coordinateSystem: "BD09",
    status,
    fallback: false,
    verified: false,
  };
}

function renderRouteTabs() {
  const root = $("#route-tabs");
  if (!root) return;
  root.innerHTML = "";

  state.routes.forEach((route, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `route-tab${route.id === state.activeRouteId ? " is-active" : ""}`;
    button.dataset.routeId = route.id;
    button.innerHTML = `<span data-index="R${String(index + 1).padStart(2, "0")}">${t(route.name)}</span><small>${route.distance}</small>`;
    button.addEventListener("click", () => setActiveRoute(route.id));
    root.appendChild(button);
  });
}

function renderLocationList() {
  const root = $("#location-list");
  if (!root) return;
  root.innerHTML = "";
  state.nodes.forEach((node, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "location-list-item";
    button.dataset.nodeId = node.id;
    button.setAttribute("aria-label", `${nodeIndexLabel(index)} ${t(node.name)}`);
    button.setAttribute("aria-current", node.id === state.detailNodeId ? "true" : "false");
    button.innerHTML = `
      <span class="location-index">${nodeIndexLabel(index)}</span>
      <span class="location-copy">
        <strong>${node.nameZh || node.name_cn}</strong>
        <small>${node.nameEn || node.name_en}</small>
      </span>
      <span class="location-type">${node.type}</span>
    `;
    button.addEventListener("mouseenter", () => setHoveredLocation(node.id));
    button.addEventListener("mouseleave", () => setHoveredLocation(null));
    button.addEventListener("focus", () => setHoveredLocation(node.id));
    button.addEventListener("blur", () => setHoveredLocation(null));
    button.addEventListener("click", () => selectLocation(node.id, { pan: true, open: true }));
    root.appendChild(button);
  });
  updateLocationStates();
}

function setHoveredLocation(nodeId) {
  state.hoveredNodeId = nodeId;
  updateLocationStates();
}

function selectLocation(nodeId, options = {}) {
  if (!nodeById(nodeId)) return;
  state.activeNodeId = nodeId;
  state.detailNodeId = nodeId;
  updateLocationStates();
  updateLocationDetail();
  if (options.pan) panToNode(nodeById(nodeId));
  if (options.open) showLocationDetail();
  if ($("#audio-first-toggle")?.checked) playActiveNodeAudio();
}

function updateLocationStates() {
  $$(".location-list-item").forEach((item) => {
    const nodeId = item.dataset.nodeId;
    const isActive = nodeId === state.detailNodeId;
    const isHovered = nodeId === state.hoveredNodeId;
    item.classList.toggle("is-active", isActive);
    item.classList.toggle("is-hovered", isHovered);
    item.setAttribute("aria-current", isActive ? "true" : "false");
  });
  updateMapLabels();
}

function updateLocationDetail() {
  const card = $("#location-detail-card");
  if (!card || !state.detailNodeId) return;
  const node = detailNode();
  const index = state.nodes.findIndex((item) => item.id === node.id);
  const image = $("#detail-card-image");
  setText("#detail-card-index", nodeIndexLabel(index));
  setText("#detail-card-title", node.nameZh || node.name_cn);
  setText("#detail-card-en", node.nameEn || node.name_en);
  setText("#detail-card-copy", state.lang === "zh" ? node.shortDescriptionZh : node.shortDescriptionEn);
  setText("#ask-site-response", state.lang === "zh"
    ? "此处可通过语音优先方式获得当前位置、下一节点与文化背景的简短回答。"
    : "This concept panel suggests voice-first answers for current position, next stop, and cultural context.");
  if (image) {
    image.src = node.image || node.existing_image;
    image.alt = `${t(node.name)} preview`;
  }
}

function showLocationDetail() {
  const card = $("#location-detail-card");
  if (!card) return;
  card.hidden = false;
  requestAnimationFrame(() => card.classList.add("is-open"));
}

function hideLocationDetail() {
  const card = $("#location-detail-card");
  if (!card || card.hidden) return;
  card.classList.remove("is-open");
  window.setTimeout(() => {
    if (!card.classList.contains("is-open")) card.hidden = true;
  }, 260);
  state.detailNodeId = null;
  updateLocationStates();
}

function panToNode(node) {
  if (!node) return;
  const BMapGL = state.BMapGL || window.BMapGL;
  const location = resolvedLocationById(node.id);
  if (state.baiduMap && BMapGL && isResolvedLocation(location)) {
    state.baiduMap.panTo(locationToPoint(BMapGL, location));
    return;
  }
  console.warn("Location is unresolved; map will not pan to fallback coordinates.", {
    id: node.id,
    name: node.nameZh || node.name_cn,
  });
}

function fitAllLocations() {
  const BMapGL = state.BMapGL || window.BMapGL;
  const locations = validResolvedLocations();
  if (state.baiduMap && BMapGL && locations.length) {
    const points = locations.map((location) => locationToPoint(BMapGL, location));
    const viewport = state.baiduMap.getViewport(points, {
      margins: [120, 160, 120, 420],
      zoomFactor: -1,
    });
    if (viewport?.center && viewport?.zoom) {
      state.baiduMap.centerAndZoom(viewport.center, viewport.zoom);
    }
  }
}

async function resolveLocationsWithBaidu() {
  const BMapGL = state.BMapGL || window.BMapGL;
  if (!state.baiduMap || !BMapGL || !BMapGL.LocalSearch) {
    state.resolvedLocations = state.nodes.map((node) => makePendingLocation(node, "unresolved", "none"));
    updateMapDiagnostics();
    return;
  }

  state.resolvedLocations = state.nodes.map((node) => makePendingLocation(node));
  state.locationsResolved = 0;
  state.anchorPoint = null;
  updateMapDiagnostics();
  drawBaiduOverlays();

  const anchorNode = state.nodes.find((node) => node.id === "gongchen-bridge") || state.nodes[0];
  const anchorLocation = await resolveLocation(anchorNode, null);
  if (isResolvedLocation(anchorLocation)) {
    state.anchorPoint = locationToPoint(BMapGL, anchorLocation);
  }

  const otherLocations = await Promise.all(
    state.nodes
      .filter((node) => node.id !== anchorNode.id)
      .map((node) => resolveLocation(node, state.anchorPoint)),
  );
  const resolvedLocations = state.nodes.map((node) => (
    node.id === anchorNode.id
      ? anchorLocation
      : otherLocations.find((location) => location.id === node.id) || makePendingLocation(node, "unresolved", "none")
  ));

  state.resolvedLocations = resolvedLocations;
  state.locationsResolved = validResolvedLocations().length;
  applyResolvedLocationsToNodes();
  logResolvedLocationsTable();
  drawBaiduOverlays();
  fitAllLocations();
  renderLocationList();
  updateLocationDetail();
  updateMapDiagnostics();
}

async function resolveLocation(node, anchorPoint) {
  const manualLocation = readManualLocation(node);
  if (manualLocation) return manualLocation;

  const verifiedLocation = readVerifiedNodeLocation(node);
  if (verifiedLocation) return verifiedLocation;

  const keywords = node.searchKeywords || [node.searchKeyword].filter(Boolean);
  for (const keyword of keywords) {
    const results = await searchBaiduPoi(keyword, anchorPoint);
    const candidate = selectBestCandidate(results, node, anchorPoint);
    if (candidate) {
      const point = candidate.point;
      return {
        ...makePendingLocation(node, "resolved", "Baidu LocalSearch"),
        matchedName: candidate.title || "",
        address: candidate.address || node.address || "",
        lng: Number(point.lng),
        lat: Number(point.lat),
        score: candidate.score,
        keyword,
        coordinateSystem: "BD09",
        fallback: false,
        verified: true,
      };
    }
  }

  console.warn("Baidu LocalSearch unresolved", {
    id: node.id,
    displayName: node.nameZh || node.name_cn,
    attemptedKeywords: keywords,
  });
  return makePendingLocation(node, "unresolved", "none");
}

function readVerifiedNodeLocation(node) {
  if (node.source !== "manually-confirmed-bd09" || node.coordinateSystem !== "BD09" || node.verified !== true) {
    return null;
  }
  const point = rawNodePoint(node);
  if (!isFiniteLocation(point)) return null;
  return {
    ...makePendingLocation(node, "resolved", "manually-confirmed-bd09"),
    matchedName: "Manual BD-09 coordinate",
    address: node.address || "",
    lng: point.lng,
    lat: point.lat,
    source: "manually-confirmed-bd09",
    coordinateSystem: "BD09",
    fallback: false,
    verified: true,
  };
}

function searchBaiduPoi(keyword, anchorPoint) {
  const BMapGL = state.BMapGL || window.BMapGL;
  return new Promise((resolve) => {
    const local = new BMapGL.LocalSearch("杭州市", {
      onMarkersSet() {},
      onInfoHtmlSet() {},
      onResultsHtmlSet() {},
      onSearchComplete(results) {
        if (!results || local.getStatus() !== window.BMAP_STATUS_SUCCESS) {
          resolve([]);
          return;
        }
        resolve(extractLocalSearchCandidates(results));
      },
    });

    if (anchorPoint && typeof local.searchNearby === "function") {
      local.searchNearby(keyword, anchorPoint, 2200);
      return;
    }
    local.search(keyword);
  });
}

function extractLocalSearchCandidates(results) {
  const candidates = [];
  const count = typeof results.getCurrentNumPois === "function" ? results.getCurrentNumPois() : 0;
  for (let index = 0; index < count; index += 1) {
    const poi = results.getPoi(index);
    if (poi?.point && Number.isFinite(Number(poi.point.lng)) && Number.isFinite(Number(poi.point.lat))) {
      candidates.push(poi);
    }
  }
  return candidates;
}

function selectBestCandidate(candidates, location, anchorPoint) {
  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, location, anchorPoint),
    }))
    .filter((candidate) => candidate.score >= 70)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function scoreCandidate(candidate, location, anchorPoint) {
  const title = candidate.title || "";
  const address = candidate.address || "";
  const city = candidate.city || candidate.cityName || "";
  const point = candidate.point;
  const primaryName = location.primaryName || location.nameZh || location.name_cn || "";
  const aliases = [primaryName, location.searchKeyword, ...(location.searchKeywords || [])].filter(Boolean);
  const text = `${title} ${address} ${city}`;
  let score = 0;

  if (!point) return -999;
  if (/(\d+\s*路|公交|公交站|地铁|站牌)/.test(text)) score -= 160;
  if (location.id === "gongchen-bridge" && title === "拱宸桥") score += 120;
  if (location.id === "gongchen-bridge" && title !== "拱宸桥" && /站|西$|东$|南$|北$/.test(title)) score -= 80;
  if (city && !/杭州/.test(city)) score -= 100;
  if (!/(拱墅区|拱宸桥|桥西|小河路|运河|杭州)/.test(text)) score -= 60;

  aliases.forEach((alias) => {
    const normalized = alias.replace(/^杭州\s*/, "").replace(/\s*拱墅区$/, "").trim();
    if (normalized && title.includes(normalized)) score += normalized === primaryName ? 100 : 70;
    if (normalized && text.includes(normalized)) score += 25;
  });
  if (title.includes(primaryName)) score += 100;
  if (text.includes("拱宸桥")) score += 30;
  if (text.includes("桥西")) score += 30;
  if (text.includes("拱墅区")) score += 20;
  if (text.includes("小河路")) score += 15;
  if (text.includes("运河")) score += 10;

  if (anchorPoint && state.baiduMap) {
    const distance = state.baiduMap.getDistance(anchorPoint, point);
    candidate.distanceToAnchor = distance;
    if (distance > 3000) score -= 200;
    else if (distance <= 2200) score += 30;
    else score += 10;
  }

  return score;
}

function readManualLocation(node) {
  try {
    const raw = window.localStorage?.getItem(`QIAOXI_NODE_LOCATION_${node.id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.verified || parsed.coordinateSystem !== "BD09" || !isFiniteLocation(parsed)) return null;
    return {
      ...makePendingLocation(node, "resolved", "manually-confirmed-bd09"),
      matchedName: parsed.matchedName || "Manual BD-09 coordinate",
      address: parsed.address || node.address || "",
      lng: Number(parsed.lng),
      lat: Number(parsed.lat),
      source: "manually-confirmed-bd09",
      coordinateSystem: "BD09",
      fallback: false,
      verified: true,
    };
  } catch (error) {
    console.warn("Invalid manual location override ignored.", { id: node.id, error });
    return null;
  }
}

function applyResolvedLocationsToNodes() {
  state.resolvedLocations.forEach((location) => {
    const node = nodeById(location.id);
    if (!node) return;
    node.locationStatus = location.status;
    node.locationSource = location.source;
    node.baiduResolvedName = location.matchedName;
    node.needsManualConfirmation = location.status !== "resolved";
    if (isResolvedLocation(location)) {
      node.lng = location.lng;
      node.longitude = location.lng;
      node.lat = location.lat;
      node.latitude = location.lat;
      node.address = location.address || node.address;
      node.coordinateSystem = "BD09";
    }
  });
}

function logResolvedLocationsTable() {
  window.__QIAOXI_DEBUG_LOCATIONS__ = state.resolvedLocations.map((item) => ({ ...item }));
  console.table(
    state.resolvedLocations.map((item) => ({
      id: item.id,
      displayName: item.nameZh,
      matchedName: item.matchedName,
      address: item.address,
      lng: item.lng,
      lat: item.lat,
      source: item.source,
      coordinateSystem: item.coordinateSystem,
      status: item.status,
    })),
  );
}

function updateMapDiagnostics() {
  const panel = $("#map-diagnostics");
  if (!panel) return;
  panel.hidden = !isMapDebugEnabled();
  if (panel.hidden) return;
  const warnings = mapLocationWarnings();
  const locations = state.resolvedLocations.length
    ? state.resolvedLocations
    : state.nodes.map((node) => makePendingLocation(node, "unresolved", "none"));
  panel.innerHTML = `
    <p>Map source: Baidu Maps GL</p>
    <p>AK present: ${getCachedAkPresent() ? "Yes" : "No"}</p>
    <p>BMapGL loaded: ${window.BMapGL ? "Yes" : "No"}</p>
    <p>Map initialized: ${state.baiduMap ? "Yes" : "No"}</p>
    <p>Style ID: ${state.mapStyleId ? escapeHtml(state.mapStyleId) : "Default Baidu style"}</p>
    <p>Locations resolved: ${state.locationsResolved} / ${state.nodes.length}</p>
    <p>Coordinate system: BD-09</p>
    <p>Fallback active: No</p>
    ${state.lastMapClick ? `<p>Last click: ${state.lastMapClick.lng.toFixed(6)}, ${state.lastMapClick.lat.toFixed(6)}</p>` : ""}
    ${warnings.length ? `<div class="map-debug-alert">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : ""}
    <div class="map-debug-list">
      ${locations.map((location) => renderDebugLocation(location)).join("")}
    </div>
  `;
  panel.querySelectorAll("[data-confirm-location]").forEach((button) => {
    button.addEventListener("click", () => saveManualLocation(button.dataset.confirmLocation));
  });
  panel.querySelectorAll("[data-clear-location]").forEach((button) => {
    button.addEventListener("click", () => clearManualLocation(button.dataset.clearLocation));
  });
}

function isMapDebugEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get("debug_map") === "1" || window.localStorage?.getItem("QIAOXI_DEBUG_MAP") === "1";
}

function getCachedAkPresent() {
  return Boolean(window.QiaoxiBaiduMapLoader?.currentDiagnostics?.().akPresent);
}

function renderDebugLocation(location) {
  const canConfirm = location.id === "gongchen-bridge" && Boolean(state.lastMapClick);
  const fallbackText = location.fallback ? "Yes" : "No";
  return `
    <section class="map-debug-item ${location.status === "resolved" ? "is-resolved" : "is-unresolved"}">
      <h3>${escapeHtml(location.nameZh)}</h3>
      <dl>
        <div><dt>Matched</dt><dd>${escapeHtml(location.matchedName || "需要确认位置")}</dd></div>
        <div><dt>Address</dt><dd>${escapeHtml(location.address || "-")}</dd></div>
        <div><dt>Lng</dt><dd>${Number.isFinite(Number(location.lng)) ? Number(location.lng).toFixed(6) : "-"}</dd></div>
        <div><dt>Lat</dt><dd>${Number.isFinite(Number(location.lat)) ? Number(location.lat).toFixed(6) : "-"}</dd></div>
        <div><dt>Source</dt><dd>${escapeHtml(location.source || "none")}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(location.status || "unresolved")}</dd></div>
        <div><dt>Fallback</dt><dd>${fallbackText}</dd></div>
      </dl>
      ${location.id === "gongchen-bridge" ? `
        <div class="map-debug-actions">
          <button type="button" data-confirm-location="${escapeAttribute(location.id)}" ${canConfirm ? "" : "disabled"}>Use clicked point for Node 01</button>
          <button type="button" data-clear-location="${escapeAttribute(location.id)}">Clear Node 01 manual</button>
        </div>
      ` : ""}
    </section>
  `;
}

function mapLocationWarnings() {
  const warnings = [];
  const valid = validResolvedLocations();
  if (state.resolvedLocations.some((location) => location.fallback || /fallback/i.test(location.source || ""))) {
    warnings.push("Error: fallback location is active.");
  }
  if (state.resolvedLocations.some((location) => location.status === "unresolved")) {
    warnings.push("Warning: unresolved locations are hidden and need confirmation.");
  }
  const unique = new Set(valid.map((location) => `${Number(location.lng).toFixed(6)},${Number(location.lat).toFixed(6)}`));
  if (valid.length > 1 && unique.size !== valid.length) {
    warnings.push("Error: at least two locations share identical coordinates.");
  }
  for (let a = 0; a < valid.length; a += 1) {
    for (let b = a + 1; b < valid.length; b += 1) {
      if (approxDistanceMeters(valid[a], valid[b]) < 12) {
        warnings.push(`Error: ${valid[a].nameZh} and ${valid[b].nameZh} are suspiciously close.`);
      }
    }
  }
  return warnings;
}

function approxDistanceMeters(a, b) {
  const lngMeters = (Number(a.lng) - Number(b.lng)) * 111320 * Math.cos((Number(a.lat) * Math.PI) / 180);
  const latMeters = (Number(a.lat) - Number(b.lat)) * 110540;
  return Math.sqrt(lngMeters ** 2 + latMeters ** 2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function saveManualLocation(nodeId) {
  if (nodeId !== "gongchen-bridge") return;
  const node = nodeById(nodeId);
  if (!node || !state.lastMapClick) return;
  const location = {
    id: node.id,
    nameZh: node.nameZh || node.name_cn,
    lng: state.lastMapClick.lng,
    lat: state.lastMapClick.lat,
    coordinateSystem: "BD09",
    source: "manually-confirmed-bd09",
    matchedName: "Manual BD-09 coordinate",
    address: node.address || "",
    verified: true,
  };
  node.lng = location.lng;
  node.longitude = location.lng;
  node.lat = location.lat;
  node.latitude = location.lat;
  node.source = "manually-confirmed-bd09";
  node.coordinateSystem = "BD09";
  node.verified = true;
  window.localStorage.setItem(`QIAOXI_NODE_LOCATION_${node.id}`, JSON.stringify(location));
  resolveLocationsWithBaidu();
}

function clearManualLocation(nodeId) {
  if (nodeId !== "gongchen-bridge") return;
  window.localStorage.removeItem(`QIAOXI_NODE_LOCATION_${nodeId}`);
  resolveLocationsWithBaidu();
}

function renderMapError(message) {
  state.mapStatus = "error";
  state.mapError = message;
  state.baiduMap = null;
  state.BMapGL = null;
  const root = $("#baidu-map");
  const loading = $("#map-loading");
  const diagnostics = window.QiaoxiBaiduMapLoader?.currentDiagnostics?.() || {
    akPresent: false,
    akSource: "none",
    bmapLoaded: Boolean(window.BMapGL),
    scriptAkTail: "none",
    activeAkTail: "none",
  };
  console.error("Baidu Maps GL load diagnostics", diagnostics);
  if (root) root.innerHTML = "";
  if (loading) {
    const isMissingAk = /VITE_BAIDU_MAP_AK|AK/.test(message);
    const savedAk = window.localStorage?.getItem("QIAOXI_BAIDU_MAP_AK") || "";
    const savedStyleId = window.localStorage?.getItem("QIAOXI_BAIDU_MAP_STYLE_ID") || "";
    loading.hidden = false;
    loading.innerHTML = `
      <div class="map-error-panel" role="alert">
        <p class="section-label">Baidu Maps GL</p>
        <h2>百度地图未加载</h2>
        <p>${message}</p>
        <dl class="map-error-diagnostics">
          <div><dt>AK exists</dt><dd>${diagnostics.akPresent ? "Yes" : "No"}</dd></div>
          <div><dt>AK source</dt><dd>${escapeHtml(diagnostics.akSource || "none")}</dd></div>
          <div><dt>BMapGL loaded</dt><dd>${diagnostics.bmapLoaded ? "Yes" : "No"}</dd></div>
          <div><dt>Script AK tail</dt><dd>${escapeHtml(diagnostics.scriptAkTail || "none")}</dd></div>
        </dl>
        ${isMissingAk ? `
          <form class="map-config-form" id="baidu-map-config-form">
            <label>
              <span>Baidu Browser AK</span>
              <input
                id="baidu-ak-input"
                name="ak"
                type="password"
                autocomplete="off"
                placeholder="粘贴百度地图开放平台浏览器端 AK"
                value="${escapeAttribute(savedAk)}"
                required
              >
            </label>
            <label>
              <span>Style ID / optional</span>
              <input
                id="baidu-style-input"
                name="styleId"
                type="text"
                autocomplete="off"
                placeholder="可选：百度个性化地图 styleId"
                value="${escapeAttribute(savedStyleId)}"
              >
            </label>
            <p class="map-config-note">AK 只保存在当前浏览器的 localStorage；需要调试信息时，在地址后加 <code>?debug_map=1</code>。</p>
            <div class="map-config-actions">
              <button type="submit">Save and Load</button>
              <button type="button" id="clear-baidu-map-config">Clear</button>
            </div>
          </form>
        ` : ""}
        <button type="button" id="retry-baidu-map">Retry</button>
      </div>
    `;
    $("#retry-baidu-map")?.addEventListener("click", initBaiduLoader);
    $("#baidu-map-config-form")?.addEventListener("submit", saveBaiduMapConfig);
    $("#clear-baidu-map-config")?.addEventListener("click", clearBaiduMapConfig);
  }
  updateMapDiagnostics();
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function saveBaiduMapConfig(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const ak = form.ak.value.trim();
  const styleId = form.styleId.value.trim();
  if (!ak) return;
  window.localStorage.setItem("QIAOXI_BAIDU_MAP_AK", ak);
  if (styleId) {
    window.localStorage.setItem("QIAOXI_BAIDU_MAP_STYLE_ID", styleId);
  } else {
    window.localStorage.removeItem("QIAOXI_BAIDU_MAP_STYLE_ID");
  }
  window.QiaoxiBaiduMapLoader?.clearRuntimeOnly?.();
  initBaiduLoader();
}

function clearBaiduMapConfig() {
  window.QiaoxiBaiduMapLoader?.clearStoredBaiduAk?.();
  window.localStorage.removeItem("QIAOXI_BAIDU_MAP_STYLE_ID");
  renderMapError("缺少 VITE_BAIDU_MAP_AK，无法加载百度地图真实底图。");
}

function setMapLoading(message) {
  state.mapStatus = "loading";
  const loading = $("#map-loading");
  if (loading) {
    loading.hidden = false;
    loading.innerHTML = `<p>${message}</p>`;
  }
  updateMapDiagnostics();
}

function setMapReady() {
  state.mapStatus = "ready";
  const loading = $("#map-loading");
  if (loading) loading.hidden = true;
  updateMapDiagnostics();
}

function setActiveRoute(routeId) {
  state.activeRouteId = routeId;
  renderRouteTabs();
  updateRouteSummary();
  drawMapRoute();
  renderPublicScreen();

  if ($("#audio-first-toggle").checked) {
    speakRoute();
  }
}

function updateRouteSummary() {
  const route = activeRoute();
  setText("#route-title", t(route.name));
  setText("#route-description", t(route.description));
  setText("#route-distance", route.distance);
  setText("#route-time", route.time[state.lang]);
  setText("#route-nodes", String(route.node_ids.length));
  setText("#detail-route-title", t(route.name));
  setText("#detail-route-description", t(route.description));

  const list = $("#route-node-list");
  if (list) {
    list.innerHTML = "";
    route.node_ids.forEach((id) => {
      const node = nodeById(id);
      if (!node) return;
      const item = document.createElement("li");
      item.textContent = `${t(node.name)} - ${t(node.accessibility_information.summary)}`;
      list.appendChild(item);
    });
  }
}

async function initBaiduLoader() {
  setMapLoading("正在载入百度地图 GL");
  try {
    if (!window.QiaoxiBaiduMapLoader) {
      throw new Error("百度地图加载器缺失。");
    }
    const [BMapGL, styleId] = await Promise.all([
      window.QiaoxiBaiduMapLoader.loadBaiduMap(),
      window.QiaoxiBaiduMapLoader.resolveBaiduStyleId(),
    ]);
    await initBaiduMap(BMapGL, styleId);
  } catch (error) {
    console.error(error);
    renderMapError(error instanceof Error ? error.message : "百度地图加载失败。");
  }
}

async function initBaiduMap(BMapGL, styleId = "") {
  if (!BMapGL) {
    renderMapError("百度地图脚本已返回，但 window.BMapGL 不存在。");
    return;
  }

  const mapConfig = state.content.map;
  const center = new BMapGL.Point(mapConfig.center.lng, mapConfig.center.lat);
  state.BMapGL = BMapGL;
  state.baiduMap = new BMapGL.Map("baidu-map", {
    enableMapClick: false,
    minZoom: mapConfig.min_zoom,
    maxZoom: mapConfig.max_zoom,
  });
  state.baiduMap.centerAndZoom(center, mapConfig.zoom);
  state.baiduMap.enableScrollWheelZoom(true);
  state.baiduMap.enableDragging();
  state.baiduMap.enableDoubleClickZoom();
  hideBaiduDefaultControls();
  applyBaiduDisplayOptions();

  if (styleId) {
    state.baiduMap.setMapStyleV2({ styleId });
    state.mapStyleId = styleId;
  } else {
    state.mapStyleId = "";
  }
  updateMapStyleNotice();

  state.baiduMap.addEventListener("moveend", clampBaiduBounds);
  state.baiduMap.addEventListener("zoomend", clampBaiduBounds);
  state.baiduMap.addEventListener("click", handleBaiduMapClick);
  setMapReady();
  state.resolvedLocations = state.nodes.map((node) => makePendingLocation(node));
  drawBaiduOverlays();
  await resolveLocationsWithBaidu();
}

function hideBaiduDefaultControls() {
  if (!state.baiduMap) return;
  if (typeof state.baiduMap.clearControls === "function") {
    state.baiduMap.clearControls();
  }
}

function applyBaiduDisplayOptions() {
  if (!state.baiduMap || typeof state.baiduMap.setDisplayOptions !== "function") return;
  state.baiduMap.setDisplayOptions({
    poiText: false,
    poiIcon: false,
    building: true,
  });
}

function updateMapStyleNotice() {
  const notice = $("#map-style-notice");
  if (!notice) return;
  const showNotice = state.baiduMap && !state.mapStyleId;
  notice.hidden = !showNotice;
  if (!showNotice) {
    notice.innerHTML = "";
    return;
  }
  notice.innerHTML = `
    <span>Default Baidu map style</span>
    <small>Set <code>VITE_BAIDU_MAP_STYLE_ID</code> or save a Style ID in the map form for POI-filtered custom styling.</small>
  `;
}

function handleBaiduMapClick(event) {
  hideLocationDetail();
  const point = event.latlng || event.point;
  if (point && Number.isFinite(Number(point.lng)) && Number.isFinite(Number(point.lat))) {
    state.lastMapClick = {
      lng: Number(point.lng),
      lat: Number(point.lat),
      coordinateSystem: "BD09",
    };
    console.log("BD09 point:", state.lastMapClick.lng, state.lastMapClick.lat);
    updateNode01PickPanel();
    updateMapDiagnostics();
  }
}

function updateNode01PickPanel() {
  const panel = $("#node01-pick-panel");
  if (!panel) return;
  const shouldShow = isMapDebugEnabled() && Boolean(state.lastMapClick);
  panel.hidden = !shouldShow;
  if (!shouldShow) {
    panel.innerHTML = "";
    return;
  }
  panel.innerHTML = `
    <span>Node 01 BD-09 pick</span>
    <dl>
      <div><dt>lng</dt><dd>${state.lastMapClick.lng.toFixed(6)}</dd></div>
      <div><dt>lat</dt><dd>${state.lastMapClick.lat.toFixed(6)}</dd></div>
    </dl>
    <button type="button" id="use-click-for-node01">Use for Node 01</button>
  `;
  $("#use-click-for-node01")?.addEventListener("click", () => saveManualLocation("gongchen-bridge"));
}

function clampBaiduBounds() {
  const BMapGL = state.BMapGL || window.BMapGL;
  if (!state.baiduMap || !BMapGL) return;
  const mapConfig = state.content.map;
  const center = state.baiduMap.getCenter();
  const lng = Math.min(Math.max(center.lng, mapConfig.bounds.west), mapConfig.bounds.east);
  const lat = Math.min(Math.max(center.lat, mapConfig.bounds.south), mapConfig.bounds.north);
  if (lng !== center.lng || lat !== center.lat) {
    state.baiduMap.panTo(new BMapGL.Point(lng, lat));
  }
}

function clearBaiduOverlays() {
  state.baiduOverlays.forEach((overlay) => state.baiduMap.removeOverlay(overlay));
  state.baiduOverlays = [];
  state.baiduMarkers.clear();
}

function drawBaiduOverlays() {
  const BMapGL = state.BMapGL || window.BMapGL;
  if (!state.baiduMap || !BMapGL) return;
  clearBaiduOverlays();

  const mapConfig = state.content.map;
  const boundary = [
    new BMapGL.Point(mapConfig.bounds.west, mapConfig.bounds.south),
    new BMapGL.Point(mapConfig.bounds.east, mapConfig.bounds.south),
    new BMapGL.Point(mapConfig.bounds.east, mapConfig.bounds.north),
    new BMapGL.Point(mapConfig.bounds.west, mapConfig.bounds.north),
  ];
  const boundaryPolygon = new BMapGL.Polygon(boundary, {
    strokeColor: state.content.theme.primaryBlue,
    strokeWeight: 1,
    strokeOpacity: 0.72,
    fillColor: state.content.theme.primaryBlue,
    fillOpacity: 0,
    strokeStyle: "dashed",
  });
  state.baiduMap.addOverlay(boundaryPolygon);
  state.baiduOverlays.push(boundaryPolygon);

  state.routes.forEach((route) => {
    const routePoints = route.node_ids
      .map((nodeId) => resolvedLocationById(nodeId))
      .filter(isResolvedLocation)
      .map((location) => locationToPoint(BMapGL, location));
    if (routePoints.length < 2) return;
    const style = window.QiaoxiMapStyle.routeStyle(route.id);
    const isActive = route.id === state.activeRouteId;
    const polyline = new BMapGL.Polyline(routePoints, {
      strokeColor: route.color || state.content.theme.route,
      strokeWeight: isActive ? 4 : 2,
      strokeOpacity: isActive ? 0.78 : 0.32,
      strokeStyle: style.dash ? "dashed" : "solid",
    });
    state.baiduMap.addOverlay(polyline);
    state.baiduOverlays.push(polyline);
  });

  validResolvedLocations().forEach((location) => {
    const node = nodeById(location.id);
    if (!node) return;
    const index = state.nodes.findIndex((item) => item.id === node.id);
    const point = locationToPoint(BMapGL, location);
    const labelText = nodeIndexLabel(index);
    const size = window.QiaoxiNodeStyle.markerSize(node.heritage_level);
    const isActive = node.id === state.detailNodeId;
    const isHovered = node.id === state.hoveredNodeId;
    const marker = new BMapGL.Marker(point, {
      icon: new BMapGL.Icon(
        window.QiaoxiNodeStyle.markerDataUrl(labelText, node.heritage_level, state.content.theme.node, {
          active: isActive,
          hover: isHovered,
        }),
        new BMapGL.Size(size, size),
        {
          imageSize: new BMapGL.Size(size, size),
          anchor: new BMapGL.Size(size / 2, size / 2),
        },
      ),
    });
    const label = new BMapGL.Label(`${labelText} ${t(node.name)}`, {
      offset: new BMapGL.Size(size + 4, -8),
    });
    label.setStyle({
      display: "none",
      border: `1px solid ${state.content.theme.line}`,
      color: state.content.theme.ink,
      backgroundColor: "#ffffff",
      fontFamily: "Times New Roman",
      fontSize: "12px",
      padding: "3px 6px",
    });
    marker.setLabel(label);
    marker.addEventListener("mouseover", () => {
      label.setStyle({ display: "block" });
      setHoveredLocation(node.id);
    });
    marker.addEventListener("mouseout", () => {
      label.setStyle({ display: "none" });
      setHoveredLocation(null);
    });
    marker.addEventListener("click", (event) => {
      event.domEvent?.stopPropagation?.();
      selectLocation(node.id, { pan: true, open: true });
    });
    state.baiduMap.addOverlay(marker);
    state.baiduOverlays.push(marker);
    state.baiduMarkers.set(node.id, marker);
  });
}

function drawMapRoute() {
  if (state.baiduMap) {
    drawBaiduOverlays();
    return;
  }
  updateMapDiagnostics();
}

function updateMapLabels() {
  $$(".map-marker").forEach((marker) => {
    const node = nodeById(marker.dataset.nodeId);
    if (!node) return;
    marker.setAttribute("aria-label", t(node.name));
    marker.classList.toggle("is-active", node.id === state.detailNodeId);
    marker.classList.toggle("is-hovered", node.id === state.hoveredNodeId);
    const label = marker.querySelector(".map-label");
    if (label) label.innerHTML = `${node.name_en}<small>${node.name_cn}</small>`;
  });
  if (state.baiduMap) drawBaiduOverlays();
}

function projectLng(lng) {
  const bounds = state.content.map.bounds;
  return ((lng - bounds.west) / (bounds.east - bounds.west)) * 100;
}

function projectLat(lat) {
  const bounds = state.content.map.bounds;
  return (1 - (lat - bounds.south) / (bounds.north - bounds.south)) * 100;
}

function openNode(nodeId) {
  state.activeNodeId = nodeId;
  state.imageMode = "existing";
  $("#map-screen").classList.remove("is-active");
  $("#experience-screen").hidden = false;
  $("#experience-screen").classList.add("is-active");
  $("#back-to-map").hidden = false;
  renderNodeExperience();
  setActivePanel("overview");
  requestAnimationFrame(() => {
    if (state.activePanel === "totem") initTotemViewer();
  });
}

function closeNode() {
  $("#experience-screen").classList.remove("is-active");
  $("#experience-screen").hidden = true;
  $("#map-screen").classList.add("is-active");
  $("#back-to-map").hidden = true;
  window.TotemSpeech.stop();
}

function renderNodeExperience() {
  const node = activeNode();
  const design = activeDesign();
  const category = t(state.content.categories[node.category]) || node.category;
  const level = t(state.content.levels[`level_${node.heritage_level}`]);
  setText("#node-name", t(node.name));
  setText("#node-meta", `${level} / ${category}`);
  setText("#node-description", localizedField(node, "shortDescription") || t(node.description));
  renderNodeImage();
  renderSitePhotography();
  renderOverviewPanel();
  renderTactileBoard();
  renderPublicScreen();
  renderAudioModule();
  renderMaterialsModule();
  updateRouteSummary();
  updateComponentCaption(null);
  setText("#overview-title", t(design.title));
  setText("#overview-summary", t(design.summary));
}

function renderNodeImage() {
  const node = activeNode();
  const image = $("#node-image");
  const isExisting = state.imageMode === "existing";
  image.src = isExisting ? node.existing_image : node.design_image;
  image.alt = isExisting
    ? `${t(node.name)} ${t(state.content.ui.existing_condition)}`
    : `${t(node.name)} ${t(state.content.ui.design_proposal)}`;
  setText(
    "#node-image-caption",
    isExisting ? t(node.existing_caption) : t(node.design_caption),
  );
  bindManagedImage(image);

  $$(".media-toggle button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.imageMode === state.imageMode);
  });
}

function localizedField(item, base) {
  if (!item) return "";
  if (state.lang === "zh") return item[`${base}Zh`] || item[`${base}_zh`] || item[`${base}Cn`] || "";
  return item[`${base}En`] || item[`${base}_en`] || "";
}

function localizedImageField(image, base) {
  if (!image) return "";
  return state.lang === "zh" ? image[`${base}Zh`] || "" : image[`${base}En`] || "";
}

function nodeImages(node) {
  return Array.isArray(node.images) && node.images.length ? node.images : [];
}

function renderSitePhotography() {
  const root = $("#site-photography");
  if (!root) return;
  const node = activeNode();
  const images = nodeImages(node);
  const hero = images[0] || placeholderImageForNode(node);
  const gallery = images.slice(1);
  const fullDescription = localizedField(node, "fullDescription") || localizedField(node, "shortDescription") || t(node.description);

  root.innerHTML = `
    <div class="site-photo-heading">
      <p class="section-label">${state.lang === "zh" ? "场地实拍" : "Site Photography"}</p>
      <h4>${state.lang === "zh" ? node.nameZh || node.name_cn : node.nameEn || node.name_en}</h4>
    </div>
    <figure class="location-hero-image">
      <button class="location-image-button" type="button" data-lightbox-index="0">
        <img
          src="${escapeAttribute(hero.src || SITE_PHOTO_PLACEHOLDER)}"
          alt="${escapeAttribute(localizedImageField(hero, "alt"))}"
          width="1600"
          height="900"
          fetchpriority="high"
        >
      </button>
      <figcaption>
        <span>${escapeHtml(localizedImageField(hero, "caption") || (state.lang === "zh" ? "图片待补充" : "Image pending"))}</span>
        ${renderImageSource(hero)}
      </figcaption>
    </figure>
    <div class="location-description">
      <p>${escapeHtml(fullDescription)}</p>
    </div>
    <div class="location-gallery" aria-label="${state.lang === "zh" ? "附图画廊" : "Image gallery"}">
      ${gallery.length
        ? gallery.map((image, index) => renderGalleryImage(image, index + 1)).join("")
        : `<p class="gallery-empty">${state.lang === "zh" ? "附图待补充" : "Additional images pending"}</p>`}
    </div>
  `;

  root.querySelectorAll("img").forEach(bindManagedImage);
  root.querySelectorAll("[data-lightbox-index]").forEach((button) => {
    button.addEventListener("click", () => openImageLightbox(images.length ? images : [hero], Number(button.dataset.lightboxIndex)));
  });
}

function placeholderImageForNode(node) {
  return {
    id: `${node.id}-placeholder`,
    src: SITE_PHOTO_PLACEHOLDER,
    altZh: `${node.nameZh || node.name_cn} 场地照片待补充`,
    altEn: `${node.nameEn || node.name_en} site photo pending`,
    captionZh: "图片待补充",
    captionEn: "Image pending",
    sourceName: "",
    sourceUrl: "",
    credit: "",
    license: "",
  };
}

function renderGalleryImage(image, index) {
  return `
    <figure class="gallery-item">
      <button class="location-image-button" type="button" data-lightbox-index="${index}">
        <img
          src="${escapeAttribute(image.src || SITE_PHOTO_PLACEHOLDER)}"
          alt="${escapeAttribute(localizedImageField(image, "alt"))}"
          width="1200"
          height="800"
          loading="lazy"
        >
      </button>
      <figcaption>
        <span>${escapeHtml(localizedImageField(image, "caption") || (state.lang === "zh" ? "图片待补充" : "Image pending"))}</span>
        ${renderImageSource(image)}
      </figcaption>
    </figure>
  `;
}

function renderImageSource(image) {
  const label = state.lang === "zh" ? "图片来源" : "Image source";
  const pending = state.lang === "zh" ? "来源待补充" : "Source pending";
  const sourceName = image?.sourceName || pending;
  const source = image?.sourceUrl
    ? `<a href="${escapeAttribute(image.sourceUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(sourceName)}</a>`
    : `<span>${escapeHtml(pending)}</span>`;
  const credit = image?.credit ? `<small>${state.lang === "zh" ? "图片" : "Photo"}: ${escapeHtml(image.credit)}</small>` : "";
  const license = image?.license ? `<small>${state.lang === "zh" ? "许可" : "License"}: ${escapeHtml(image.license)}</small>` : "";
  return `<span class="image-source">${label}: ${source}${credit}${license}</span>`;
}

function bindManagedImage(img) {
  if (!img) return;
  img.classList.add("is-loading");
  img.addEventListener("load", () => {
    img.classList.remove("is-loading");
    img.classList.add("is-loaded");
  }, { once: true });
  img.addEventListener("error", handleImageError);
}

function handleImageError(event) {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied === "true") return;
  img.dataset.fallbackApplied = "true";
  img.src = SITE_PHOTO_PLACEHOLDER;
  img.classList.remove("is-loading");
  img.classList.add("is-loaded");
}

function openImageLightbox(images, index = 0) {
  state.lightbox.images = images.length ? images : [placeholderImageForNode(activeNode())];
  state.lightbox.index = Math.max(0, Math.min(index, state.lightbox.images.length - 1));
  renderImageLightbox();
  const lightbox = $("#image-lightbox");
  lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
}

function renderImageLightbox() {
  const image = state.lightbox.images[state.lightbox.index] || placeholderImageForNode(activeNode());
  const img = $("#lightbox-image");
  const caption = $("#lightbox-caption");
  img.src = image.src || SITE_PHOTO_PLACEHOLDER;
  img.alt = localizedImageField(image, "alt");
  bindManagedImage(img);
  caption.innerHTML = `
    <span>${escapeHtml(localizedImageField(image, "caption") || (state.lang === "zh" ? "图片待补充" : "Image pending"))}</span>
    ${renderImageSource(image)}
  `;
  $("#lightbox-prev").disabled = state.lightbox.images.length <= 1;
  $("#lightbox-next").disabled = state.lightbox.images.length <= 1;
}

function closeImageLightbox() {
  const lightbox = $("#image-lightbox");
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
}

function stepImageLightbox(direction) {
  if (!state.lightbox.images.length) return;
  const total = state.lightbox.images.length;
  state.lightbox.index = (state.lightbox.index + direction + total) % total;
  renderImageLightbox();
}

function renderOverviewPanel() {
  const node = activeNode();
  const design = activeDesign();
  const nextNode = nodeById(design.next_node_id);
  const root = $("#overview-grid");
  if (!root) return;

  root.innerHTML = `
    <section class="analysis-block">
      <p class="section-label">Design Intent</p>
      <h4>${t(design.title)}</h4>
      <p>${t(design.summary)}</p>
    </section>
    <section class="analysis-block">
      <p class="section-label">Node Specificity</p>
      <dl class="annotation-list">
        <div><dt>Current Node</dt><dd>${node.name_en}<br><span>${node.name_cn}</span></dd></div>
        <div><dt>Next Stop</dt><dd>${nextNode ? `${nextNode.name_en}<br><span>${nextNode.name_cn}</span>` : "-"}</dd></div>
        <div><dt>Route Focus</dt><dd>${design.route_focus}</dd></div>
        <div><dt>Reachable Braille Zone</dt><dd>${design.braille_band.height_range}</dd></div>
      </dl>
    </section>
    <section class="analysis-block wide">
      <p class="section-label">Dedicated Side Audio Buttons</p>
      <div class="side-button-spec">
        ${design.side_buttons.map((button) => `
          <button type="button" data-audio-section="${button.audio_section}">
            <span class="shape-token ${button.shape}"></span>
            <strong>${t(button.label)}</strong>
          </button>
        `).join("")}
      </div>
    </section>
  `;

  root.querySelectorAll("[data-audio-section]").forEach((button) => {
    button.addEventListener("click", () => playAudioSection(button.dataset.audioSection, state.lang));
  });
}

function setActivePanel(panelId) {
  state.activePanel = panelId;
  $$(".module-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-${panelId}`);
  });
  $$("[data-panel-target]").forEach((button) => {
    if (button.closest(".experience-actions") && panelId === "route") return;
    button.classList.toggle("is-active", button.dataset.panelTarget === panelId);
  });
  if (panelId === "totem") {
    requestAnimationFrame(() => {
      initTotemViewer();
      requestAnimationFrame(() => {
        resizeThreeScene();
        fitCameraToModel();
      });
    });
  }
}

function audioTextForNode(node) {
  const audio = state.audio[node.id];
  if (!audio) return state.lang === "zh" ? node.audio_cn : node.audio_en;
  return audioTextForLanguage(state.lang);
}

function playActiveNodeAudio() {
  playAudioLanguage(state.lang);
}

function audioTextForLanguage(lang) {
  const audio = activeAudio()[lang] || {};
  return [
    audio.current_location,
    audio.direction_instruction,
    audio.accessibility_notice,
    audio.cultural_interpretation,
  ].filter(Boolean).join(lang === "zh" ? "。" : ". ");
}

function playAudioLanguage(lang) {
  const text = audioTextForLanguage(lang);
  if (!text) return;
  const speechLang = lang === "zh" ? "zh-CN" : "en-US";
  state.lastAudioText = text;
  state.lastAudioLang = speechLang;
  window.TotemSpeech.speak(text, speechLang);
}

function playAudioSection(section, lang = state.lang) {
  const text = activeAudio()[lang]?.[section];
  if (!text) return;
  const speechLang = lang === "zh" ? "zh-CN" : "en-US";
  state.lastAudioText = text;
  state.lastAudioLang = speechLang;
  window.TotemSpeech.speak(text, speechLang);
}

function speakRoute() {
  const route = activeRoute();
  const text = [
    t(route.name),
    t(route.description),
    `${t(state.content.ui.distance)}: ${route.distance}`,
    `${t(state.content.ui.time)}: ${route.time[state.lang]}`,
  ].join(state.lang === "zh" ? "。" : ". ");
  window.TotemSpeech.speak(text, state.lang === "zh" ? "zh-CN" : "en-US");
}

function renderTactileBoard() {
  const board = $("#tactile-board");
  if (!board) return;
  board.innerHTML = "";
  const route = activeRoute();
  const routeNodes = route.node_ids.map(nodeById).filter(Boolean);
  const projected = routeNodes.map((node) => ({
    node,
    x: projectLng(node.longitude),
    y: projectLat(node.latitude),
  }));

  for (let i = 0; i < projected.length - 1; i += 1) {
    const current = projected[i];
    const next = projected[i + 1];
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const routeEl = document.createElement("span");
    routeEl.className = "tactile-route";
    routeEl.style.left = `${current.x}%`;
    routeEl.style.top = `${current.y}%`;
    routeEl.style.width = `${length}%`;
    routeEl.style.transform = `rotate(${angle}deg)`;
    board.appendChild(routeEl);
  }

  projected.forEach(({ node }, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tactile-node";
    button.style.left = `${projectLng(node.longitude)}%`;
    button.style.top = `${projectLat(node.latitude)}%`;
    button.textContent = String(index + 1);
    button.setAttribute("aria-label", t(node.name));
    button.addEventListener("click", () => {
      state.activeNodeId = node.id;
      renderNodeExperience();
      setText("#tactile-caption", t(node.accessibility_information.tactile_note));
      playActiveNodeAudio();
    });
    board.appendChild(button);

    const braille = document.createElement("span");
    braille.className = "braille-label";
    braille.style.left = `${projectLng(node.longitude)}%`;
    braille.style.top = `${projectLat(node.latitude)}%`;
    braille.textContent = node.accessibility_information.braille;
    board.appendChild(braille);
  });

  setText("#tactile-caption", t(activeNode().accessibility_information.tactile_note));
  renderBrailleDetail();
}

function renderPublicScreen() {
  const grid = $("#screen-route-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const design = activeDesign();

  state.routes.forEach((route) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `screen-route-button${route.id === state.activeRouteId ? " is-active" : ""}`;
    button.dataset.routeId = route.id;
    button.textContent = t(route.name);
    button.addEventListener("click", () => setActiveRoute(route.id));
    grid.appendChild(button);
  });

  const node = activeNode();
  setText("#screen-language", state.lang === "zh" ? "中文 / English" : "English / 中文");
  setText("#screen-current-node", `${node.name_en} / ${node.name_cn}`);
  setText("#screen-current-desc", `${t(design.screen_ui.priority_message)} ${t(design.screen_ui.map_note)}`);
  renderScreenMap(design);
  renderScreenQuickActions(design);
}

function renderScreenMap(design) {
  const screen = $(".public-screen");
  if (!screen) return;
  let map = screen.querySelector(".screen-map-diagram");
  if (!map) {
    map = document.createElement("section");
    map.className = "screen-map-diagram";
    screen.insertBefore(map, screen.querySelector(".screen-info"));
  }
  const node = activeNode();
  const nextNode = nodeById(design.next_node_id);
  const structure = design.screen_ui.map_structure || {};
  map.innerHTML = `
    <div class="screen-map-line" aria-hidden="true">
      <span class="screen-map-node current">${structure.current_marker || "YOU"}</span>
      <span class="screen-map-route"></span>
      <span class="screen-map-node next">${nextNode ? nextNode.name_en : "NEXT"}</span>
    </div>
    <dl>
      <div><dt>Current</dt><dd>${node.name_en}<br><span>${node.name_cn}</span></dd></div>
      <div><dt>Next</dt><dd>${nextNode ? `${nextNode.name_en}<br><span>${nextNode.name_cn}</span>` : "-"}</dd></div>
      <div><dt>Route Cue</dt><dd>${t(structure.route_cue)}</dd></div>
      <div><dt>Access Cue</dt><dd>${t(structure.accessibility_cue)}</dd></div>
      <div><dt>Canal Reference</dt><dd>${t(structure.canal_reference)}</dd></div>
    </dl>
  `;
}

function renderBrailleDetail() {
  const root = $("#braille-detail");
  if (!root) return;
  const node = activeNode();
  const design = activeDesign();
  const nextNode = nodeById(design.next_node_id);
  root.innerHTML = `
    <section class="braille-band-diagram">
      <p class="section-label">Right-side Braille Strip / 900-1200mm</p>
      ${design.braille_band.items.map((item) => `
        <div>
          <strong>${t(item.label)}</strong>
          <span>${brailleValueForItem(item.key, node, nextNode)}</span>
        </div>
      `).join("")}
    </section>
    <section class="use-flow">
      <p class="section-label">Use Flow</p>
      <ol>
        <li>${state.lang === "zh" ? "触摸节点名称" : "Touch node name"}</li>
        <li>${state.lang === "zh" ? "按下Audio按钮" : "Press audio button"}</li>
        <li>${state.lang === "zh" ? "获得当前位置语音" : "Receive current-location audio"}</li>
        <li>${state.lang === "zh" ? "获得下一节点方向" : "Receive next-stop direction"}</li>
      </ol>
    </section>
  `;
}

function brailleValueForItem(key, node, nextNode) {
  const values = {
    node_name: `${node.accessibility_information.braille} / ${t(node.name)}`,
    current_position: t(activeAudio()[state.lang]?.current_location),
    next_direction: nextNode ? `${nextNode.name_en} / ${nextNode.name_cn}` : "-",
    risk_notice: t(activeAudio()[state.lang]?.accessibility_notice),
  };
  return values[key] || "-";
}

function renderScreenQuickActions(design) {
  const screen = $(".public-screen");
  if (!screen) return;
  let actions = screen.querySelector(".screen-quick-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "screen-quick-actions";
    screen.insertBefore(actions, screen.querySelector(".screen-info"));
  }
  actions.innerHTML = design.screen_ui.quick_actions.map((action) => `
    <button type="button" data-audio-section="${action.audio_section}">${t(action.label)}</button>
  `).join("");
  actions.querySelectorAll("[data-audio-section]").forEach((button) => {
    button.addEventListener("click", () => playAudioSection(button.dataset.audioSection, state.lang));
  });
}

function renderAudioModule() {
  const node = activeNode();
  const root = $("#audio-module");
  const audio = activeAudio();
  if (!root) return;
  setText("#audio-title", `${node.name_en} / ${node.name_cn}`);
  const sections = [
    ["current_location", "Current Location / 当前位置"],
    ["direction_instruction", "Direction Instruction / 方向指引"],
    ["accessibility_notice", "Accessibility Notice / 无障碍提示"],
    ["cultural_interpretation", "Cultural Interpretation / 文化说明"],
  ];
  root.innerHTML = sections.map(([key, label]) => `
    <section class="audio-transcript">
      <p class="section-label">${label}</p>
      <p>${audio.zh?.[key] || "-"}</p>
      <p>${audio.en?.[key] || "-"}</p>
      <button type="button" data-audio-section="${key}">${state.lang === "zh" ? "播放本段" : "Play section"}</button>
    </section>
  `).join("");
  root.querySelectorAll("[data-audio-section]").forEach((button) => {
    button.addEventListener("click", () => playAudioSection(button.dataset.audioSection, state.lang));
  });
}

function renderMaterialsModule() {
  const root = $("#materials-module");
  const design = activeDesign();
  if (!root) return;
  setText("#materials-title", state.lang === "zh" ? "材料清单与可持续策略" : "Material Schedule and Sustainability Strategy");
  setText("#materials-summary", state.lang === "zh"
    ? "材料策略强调模块化可替换、低维护、可回收与历史街区微更新。"
    : "The material strategy prioritizes modular replacement, low maintenance, recyclability, and historic district micro-renewal.");

  root.innerHTML = `
    <section class="materials-grid">
      ${state.materials.map((material) => `
        <article class="material-item">
          <p class="section-label">${material.applied_to}</p>
          <h4>${state.lang === "zh" ? material.name_cn : material.name_en}</h4>
          <ul>
            ${(state.lang === "zh" ? material.benefits_cn : material.benefits_en).map((benefit) => `<li>${benefit}</li>`).join("")}
          </ul>
          <p>${state.lang === "zh" ? material.sustainability_note_cn : material.sustainability_note_en}</p>
        </article>
      `).join("")}
    </section>
    <section class="sustainability-strip">
      ${design.sustainability.strategy.map((item, index) => `
        <div><span>0${index + 1}</span>${t(item)}</div>
      `).join("")}
    </section>
  `;
}

function updateComponentCaption(component) {
  const components = activeDesign().components;
  const fallback = state.lang === "zh"
    ? "点击模型组件查看说明：主屏幕、触觉地图、右侧盲文区、Audio按钮、太阳能模块、模块化底座。"
    : "Click a model component: main screen, tactile map, braille strip, audio buttons, solar module, or modular base.";
  if (!component || !components[component]) {
    $("#component-caption").innerHTML = `<p>${fallback}</p>`;
    return;
  }
  const info = components[component];
  const material = materialById(info.material);
  $("#component-caption").innerHTML = `
    <p class="section-label">${t(info.name)}</p>
    <dl>
      <div><dt>${state.lang === "zh" ? "设计作用" : "Design role"}</dt><dd>${t(info.role)}</dd></div>
      <div><dt>${state.lang === "zh" ? "无障碍意义" : "Accessibility value"}</dt><dd>${t(info.accessibility)}</dd></div>
      <div><dt>${state.lang === "zh" ? "材料建议" : "Material"}</dt><dd>${material ? (state.lang === "zh" ? material.name_cn : material.name_en) : "-"}</dd></div>
    </dl>
  `;
}

async function loadThreeModules() {
  if (state.three.THREE && state.three.OrbitControls) {
    return state.three;
  }

  const [threeModule, controlsModule] = await Promise.all([
    import("three"),
    import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js"),
  ]);
  state.three.THREE = threeModule;
  state.three.OrbitControls = controlsModule.OrbitControls;
  return state.three;
}

async function initTotemViewer() {
  const canvas = $("#totem-canvas");
  const container = $("#three-container");
  if (!canvas || !container || state.activePanel !== "totem") return;

  if (state.three.initializing) {
    await state.three.initializing;
    resizeThreeScene();
    fitCameraToModel();
    return;
  }

  if (state.three.initialized) {
    resizeThreeScene();
    fitCameraToModel();
    return;
  }

  state.three.initializing = setupTotemScene(canvas, container).catch((error) => {
    console.error("Three.js Totem setup failed:", error);
    renderTotemFallback();
  }).finally(() => {
    state.three.initializing = null;
  });

  await state.three.initializing;
}

async function setupTotemScene(canvas, container) {
  const { THREE, OrbitControls } = await loadThreeModules();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambient = new THREE.AmbientLight(0xffffff, 0.78);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(4, 5, 6);
  scene.add(keyLight);

  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.22 });
  const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x263646, roughness: 0.32, metalness: 0.05 });
  const tactileMaterial = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.58, metalness: 0.18 });
  const brailleMaterial = new THREE.MeshStandardMaterial({ color: 0x7d8a8f, roughness: 0.5, metalness: 0.35 });
  const buttonMaterial = new THREE.MeshStandardMaterial({ color: 0x23415c, roughness: 0.4, metalness: 0.28 });
  const solarMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2f3d, roughness: 0.34, metalness: 0.08 });
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.52, metalness: 0.35 });

  const model = new THREE.Group();
  const body = makeBox("body", [1.42, 0.18, 3.5], [0, 0, 0], shellMaterial);
  const screen = makeBox("screen", [1.12, 0.08, 1.08], [0, -0.11, 0.9], screenMaterial);
  const tactile = makeBox("tactile", [1.12, 0.08, 0.6], [0, -0.12, -0.32], tactileMaterial);
  const lowerInfo = makeBox("tactile", [1.12, 0.08, 0.24], [0, -0.13, -0.88], tactileMaterial);
  const braillePanel = makeBox("braille_panel", [0.16, 0.16, 1.28], [0.81, -0.02, -0.15], brailleMaterial);
  const solar = makeBox("solar", [1.24, 0.48, 0.07], [0, 0.06, 1.88], solarMaterial);
  solar.rotation.x = -0.22;
  const plinth = makeBox("base", [1.82, 0.38, 0.24], [0, 0, -1.88], baseMaterial);
  const servicePanel = makeBox("base", [0.64, 0.04, 0.16], [0, -0.22, -1.78], shellMaterial);

  const buttons = [
    makeCylinder("audio_buttons", 0.085, [0.84, -0.13, 0.44], buttonMaterial),
    makeCylinder("audio_buttons", 0.085, [0.84, -0.13, 0.12], buttonMaterial),
    makeCylinder("audio_buttons", 0.085, [0.84, -0.13, -0.2], buttonMaterial),
    makeCylinder("audio_buttons", 0.085, [0.84, -0.13, -0.52], buttonMaterial),
  ];

  [body, screen, tactile, lowerInfo, braillePanel, solar, plinth, servicePanel, ...buttons].forEach((part) => model.add(part));

  const modelBox = new THREE.Box3().setFromObject(model);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  model.position.sub(modelCenter);
  scene.add(model);

  const grid = new THREE.GridHelper(5, 10, 0xb8c0c8, 0xd9dde2);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -1.95;
  scene.add(grid);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 12;
  controls.addEventListener("change", updateTotemDebugDataset);

  Object.assign(state.three, {
    THREE,
    OrbitControls,
    container,
    scene,
    camera,
    renderer,
    controls,
    model,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    parts: [screen, tactile, lowerInfo, braillePanel, solar, plinth, servicePanel, ...buttons],
    initialized: true,
  });

  canvas.hidden = false;
  $("#totem-fallback").hidden = true;
  canvas.addEventListener("pointerdown", handleTotemPointerDown);
  canvas.addEventListener("pointerup", handleTotemPointerUp);

  state.three.resizeObserver = new ResizeObserver(() => {
    resizeThreeScene();
    fitCameraToModel();
  });
  state.three.resizeObserver.observe(container);

  resizeThreeScene();
  fitCameraToModel(model);
  exposeTotemDebugState();
  updateTotemDebugDataset();
  logThreeDebugInfo();
  if (!state.three.animationStarted) {
    state.three.animationStarted = true;
    animateThree();
  }
}

function makeBox(component, size, position, material) {
  const THREE = state.three.THREE;
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.userData.component = component;
  return mesh;
}

function makeCylinder(component, radius, position, material) {
  const THREE = state.three.THREE;
  const geometry = new THREE.CylinderGeometry(radius, radius, 0.08, 36);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.userData.component = component;
  return mesh;
}

function resizeThreeScene() {
  const { container, renderer, camera } = state.three;
  if (!container || !renderer || !camera) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function fitCameraToModel(object = state.three.model) {
  const { THREE, camera, controls } = state.three;
  if (!THREE || !camera || !controls || !object) return;

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  let cameraDistance = maxSize / (2 * Math.tan(fov / 2));
  cameraDistance *= 1.5;

  camera.position.set(
    center.x + cameraDistance * 0.6,
    center.y + cameraDistance * 0.25,
    center.z + cameraDistance,
  );
  camera.near = Math.max(cameraDistance / 100, 0.01);
  camera.far = cameraDistance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

function animateThree() {
  const { renderer, scene, camera, controls } = state.three;
  if (!renderer) return;
  if (controls) controls.update();
  renderer.render(scene, camera);
  state.three.animationId = window.requestAnimationFrame(animateThree);
}

function handleTotemPointerDown(event) {
  state.three.pointerDown = { x: event.clientX, y: event.clientY };
}

function handleTotemPointerUp(event) {
  const start = state.three.pointerDown;
  state.three.pointerDown = null;
  if (!start) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.sqrt(dx * dx + dy * dy) > 5) return;
  handleTotemClick(event);
}

function handleTotemClick(event) {
  const { renderer, camera, raycaster, pointer, parts } = state.three;
  if (!renderer || !camera || !raycaster || !pointer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(parts)[0];
  if (hit) {
    updateComponentCaption(hit.object.userData.component);
  }
}

function logThreeDebugInfo() {
  const { container, renderer, camera, controls, parts, debugLogged } = state.three;
  if (debugLogged || !container || !renderer || !camera) return;
  state.three.debugLogged = true;
  console.info("Qiaoxi 3D Totem debug", {
    container: {
      width: container.clientWidth,
      height: container.clientHeight,
    },
    canvas: {
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      clientWidth: renderer.domElement.clientWidth,
      clientHeight: renderer.domElement.clientHeight,
    },
    cameraAspect: camera.aspect,
    orbitControlsEnabled: Boolean(controls?.enabled),
    clickableObjects: parts.length,
  });
}

function updateTotemDebugDataset() {
  const { renderer, camera, controls, parts } = state.three;
  if (!renderer || !camera || !controls) return;
  const canvas = renderer.domElement;
  canvas.dataset.threeReady = "true";
  canvas.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(4)).join(",");
  canvas.dataset.controlsTarget = controls.target.toArray().map((value) => value.toFixed(4)).join(",");
  canvas.dataset.controlsEnabled = String(Boolean(controls.enabled));
  canvas.dataset.clickableObjects = String(parts.length);
}

function exposeTotemDebugState() {
  window.QiaoxiTotemDebug = () => {
    const { container, renderer, camera, controls, parts, animationId } = state.three;
    return {
      container: container
        ? { width: container.clientWidth, height: container.clientHeight }
        : null,
      canvas: renderer
        ? {
            width: renderer.domElement.width,
            height: renderer.domElement.height,
            clientWidth: renderer.domElement.clientWidth,
            clientHeight: renderer.domElement.clientHeight,
          }
        : null,
      camera: camera
        ? {
            aspect: camera.aspect,
            position: camera.position.toArray(),
            near: camera.near,
            far: camera.far,
          }
        : null,
      controls: controls
        ? {
            enabled: controls.enabled,
            enableRotate: controls.enableRotate,
            enableZoom: controls.enableZoom,
            enablePan: controls.enablePan,
            minDistance: controls.minDistance,
            maxDistance: controls.maxDistance,
            target: controls.target.toArray(),
          }
        : null,
      clickableObjects: parts.length,
      animationLoopRunning: Boolean(animationId),
      animationStarted: state.three.animationStarted,
    };
  };
}

function renderTotemFallback() {
  $("#totem-canvas").hidden = true;
  const fallback = $("#totem-fallback");
  fallback.hidden = false;
  fallback.innerHTML = `
    <div class="fallback-totem">
      <button class="fallback-part screen" type="button" data-component="screen">Interactive Screen</button>
      <button class="fallback-part tactile" type="button" data-component="tactile">Tactile Map</button>
      <button class="fallback-part braille" type="button" data-component="braille_panel">Braille</button>
      <button class="fallback-part audio" type="button" data-component="audio_buttons">Audio</button>
    </div>
  `;
  fallback.querySelectorAll("[data-component]").forEach((button) => {
    button.addEventListener("click", () => updateComponentCaption(button.dataset.component));
  });
}

function bindEvents() {
  $("#language-toggle").addEventListener("click", () => {
    state.lang = state.lang === "zh" ? "en" : "zh";
    applyLanguage();
  });

  $("#back-to-map").addEventListener("click", closeNode);
  $("#show-all-locations")?.addEventListener("click", () => {
    hideLocationDetail();
    fitAllLocations();
  });
  $("#show-all-map")?.addEventListener("click", () => {
    hideLocationDetail();
    fitAllLocations();
  });
  $("#toggle-about")?.addEventListener("click", () => {
    const about = $("#about-card");
    if (about) about.hidden = !about.hidden;
  });
  $("#close-location-card")?.addEventListener("click", hideLocationDetail);
  $("#detail-locate-map")?.addEventListener("click", () => panToNode(detailNode()));
  $("#detail-view-experience")?.addEventListener("click", () => openNode(detailNode().id));
  $("#detail-view-totem")?.addEventListener("click", () => {
    openNode(detailNode().id);
    setActivePanel("totem");
  });
  $("#ask-site-toggle")?.addEventListener("click", () => {
    const panel = $("#ask-site-panel");
    if (panel) panel.hidden = !panel.hidden;
  });

  $("#contrast-toggle").addEventListener("change", (event) => {
    document.body.classList.toggle("high-contrast", event.target.checked);
  });
  $("#large-text-toggle").addEventListener("change", (event) => {
    document.body.classList.toggle("large-text", event.target.checked);
  });
  $("#audio-first-toggle").addEventListener("change", (event) => {
    if (event.target.checked) speakRoute();
  });

  $$(".media-toggle button").forEach((button) => {
    button.addEventListener("click", () => {
      state.imageMode = button.dataset.imageMode;
      renderNodeImage();
    });
  });

  $$("[data-panel-target]").forEach((button) => {
    button.addEventListener("click", () => setActivePanel(button.dataset.panelTarget));
  });

  $("#play-audio").addEventListener("click", playActiveNodeAudio);
  $("#pause-audio").addEventListener("click", window.TotemSpeech.pause);
  $("#repeat-audio").addEventListener("click", window.TotemSpeech.repeat);
  $("#play-audio-zh").addEventListener("click", () => playAudioLanguage("zh"));
  $("#play-audio-en").addEventListener("click", () => playAudioLanguage("en"));
  $("#pause-audio-module").addEventListener("click", window.TotemSpeech.pause);
  $("#repeat-audio-module").addEventListener("click", window.TotemSpeech.repeat);

  $("#lightbox-close")?.addEventListener("click", closeImageLightbox);
  $("#lightbox-prev")?.addEventListener("click", () => stepImageLightbox(-1));
  $("#lightbox-next")?.addEventListener("click", () => stepImageLightbox(1));
  $("#image-lightbox")?.addEventListener("click", (event) => {
    if (event.target.id === "image-lightbox") closeImageLightbox();
  });
  document.addEventListener("keydown", (event) => {
    const lightbox = $("#image-lightbox");
    if (!lightbox || lightbox.hidden) return;
    if (event.key === "Escape") closeImageLightbox();
    if (event.key === "ArrowLeft") stepImageLightbox(-1);
    if (event.key === "ArrowRight") stepImageLightbox(1);
  });
}

async function start() {
  try {
    const { content, nodes, routes, designs, materials, audio } = await loadProjectData();
    state.content = content;
    state.nodes = nodes;
    state.routes = routes;
    state.designs = designs || {};
    state.materials = materials || [];
    state.audio = audio || {};
    state.activeRouteId = routes[0].id;
    state.activeNodeId = nodes[0].id;
    window.QiaoxiMapStyle.applyTheme(content.theme);
    bindEvents();
    applyLanguage();
    initBaiduLoader();
  } catch (error) {
    $("#map-loading").innerHTML = "<p>Data loading failed. Please check the JSON files.</p>";
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", start);
