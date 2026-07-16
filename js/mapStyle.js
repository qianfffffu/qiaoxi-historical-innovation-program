(function () {
  const DEFAULT_THEME = {
    background: "#ffffff",
    context: "#eeeeee",
    building: "#d9dde2",
    water: "#b9d4dd",
    primaryBlue: "#23415c",
    route: "#567c8d",
    node: "#4b5563",
    ink: "#17202a",
    muted: "#6b7280",
    line: "#b8c0c8",
  };

  const routeStyles = {
    heritage: { color: "var(--route-heritage)", dash: "5 5" },
    accessible: { color: "var(--route-accessible)", dash: "2 5" },
    slow: { color: "var(--route-slow)", dash: "8 5 2 5" },
  };

  function applyTheme(theme = {}) {
    const merged = { ...DEFAULT_THEME, ...theme };
    const root = document.documentElement;
    Object.entries({
      "--background": merged.background,
      "--bg": merged.background,
      "--context": merged.context,
      "--building": merged.building,
      "--water": merged.water,
      "--primary-blue": merged.primaryBlue,
      "--primary-dark": merged.primaryDark || merged.primaryBlue,
      "--primary-soft": merged.primarySoft || "#dceaf4",
      "--route": merged.route,
      "--node": merged.node,
      "--ink": merged.ink,
      "--muted": merged.muted,
      "--line": merged.line,
      "--route-heritage": merged.routeHeritage || merged.route,
      "--route-accessible": merged.routeAccessible || "#7d8a8f",
      "--route-slow": merged.routeSlow || "#6d796f",
    }).forEach(([name, value]) => root.style.setProperty(name, value));
  }

  function baiduStyle(theme = DEFAULT_THEME) {
    return [
      { featureType: "land", elementType: "geometry", stylers: { color: theme.background || DEFAULT_THEME.background } },
      { featureType: "water", elementType: "geometry", stylers: { color: theme.water || DEFAULT_THEME.water } },
      { featureType: "building", elementType: "geometry", stylers: { color: theme.building || DEFAULT_THEME.building } },
      { featureType: "road", elementType: "geometry", stylers: { color: theme.context || DEFAULT_THEME.context } },
      { featureType: "green", elementType: "geometry", stylers: { color: theme.background || DEFAULT_THEME.background } },
      { featureType: "poilabel", elementType: "labels", stylers: { visibility: "off" } },
      { featureType: "road", elementType: "labels", stylers: { visibility: "off" } },
      { featureType: "manmade", elementType: "labels", stylers: { visibility: "off" } },
      { featureType: "districtlabel", elementType: "labels", stylers: { visibility: "off" } },
    ];
  }

  function routeStyle(routeId) {
    return routeStyles[routeId] || routeStyles.heritage;
  }

  function nodeNumber(index) {
    return `N${String(index + 1).padStart(2, "0")}`;
  }

  window.QiaoxiMapStyle = {
    DEFAULT_THEME,
    applyTheme,
    baiduStyle,
    routeStyle,
    nodeNumber,
  };
})();
