(function () {
  function markerSize(level) {
    if (level === 1) return 48;
    if (level === 2) return 40;
    return 34;
  }

  function markerSvg(label, level = 1) {
    const size = markerSize(level);
    const outer = size / 2 - 1;
    const inner = level === 1 ? size * 0.32 : size * 0.3;
    const fontSize = level === 3 ? 9 : 10;
    return `
      <svg class="node-marker-svg" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle cx="${size / 2}" cy="${size / 2}" r="${inner}"></circle>
        <circle cx="${size / 2}" cy="${size / 2}" r="${outer}"></circle>
        <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" font-size="${fontSize}">${label}</text>
      </svg>
    `;
  }

  function markerDataUrl(label, level = 1, color = "#4b5563", options = {}) {
    const size = markerSize(level);
    const outer = size / 2 - 1;
    const inner = level === 1 ? size * 0.32 : size * 0.3;
    const fontSize = level === 3 ? 9 : 10;
    const active = Boolean(options.active);
    const hover = Boolean(options.hover);
    const fill = active ? color : "#ffffff";
    const text = active ? "#ffffff" : color;
    const ringOpacity = active ? 0.42 : hover ? 0.34 : 0.2;
    const strokeWidth = active ? 2 : 1.4;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${outer}" fill="${color}" fill-opacity="${ringOpacity}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${inner}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"/>
        <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" font-family="Times New Roman, Times, serif" font-size="${fontSize}" fill="${text}">${label}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  window.QiaoxiNodeStyle = {
    markerSize,
    markerSvg,
    markerDataUrl,
  };
})();
