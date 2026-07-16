let baiduMapPromise = null;
let activeAk = "";
let pendingAk = "";
let lastScriptAkTail = "";
let lastAkSource = "none";

function cleanAk(value) {
  return String(value || "").trim();
}

function akTail(ak) {
  return ak ? ak.slice(-4) : "none";
}

function viteEnvValue(key) {
  return cleanAk(import.meta.env?.[key]);
}

function resolveBaiduAk() {
  const fromStorage = cleanAk(window.localStorage?.getItem("QIAOXI_BAIDU_MAP_AK"));
  if (fromStorage) {
    return { ak: fromStorage, source: "localStorage.QIAOXI_BAIDU_MAP_AK" };
  }

  const fromVite = viteEnvValue("VITE_BAIDU_MAP_AK");
  if (fromVite) {
    return { ak: fromVite, source: "import.meta.env.VITE_BAIDU_MAP_AK" };
  }

  return { ak: "", source: "none" };
}

function resolveBaiduStyleId() {
  const fromStorage = cleanAk(window.localStorage?.getItem("QIAOXI_BAIDU_MAP_STYLE_ID"));
  if (fromStorage) return fromStorage;
  return viteEnvValue("VITE_BAIDU_MAP_STYLE_ID");
}

function clearStoredConfigFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("clear_baidu_ak") !== "1") return;

  window.localStorage?.removeItem("QIAOXI_BAIDU_MAP_AK");
  window.localStorage?.removeItem("QIAOXI_BAIDU_MAP_STYLE_ID");
  params.delete("clear_baidu_ak");
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
  console.info("Baidu Maps GL stored config cleared", {
    akPresent: false,
    styleIdPresent: false,
  });
}

function removeBaiduScript() {
  document
    .querySelectorAll('script[src*="api.map.baidu.com/api"], #baidu-map-gl-script')
    .forEach((script) => script.remove());
  try {
    delete window.BMapGL;
  } catch (error) {
    window.BMapGL = undefined;
  }
  try {
    delete window.BMAP_STATUS_SUCCESS;
  } catch (error) {
    window.BMAP_STATUS_SUCCESS = undefined;
  }
}

function currentDiagnostics() {
  const scripts = [
    ...document.querySelectorAll('script[src*="api.map.baidu.com/api"]'),
  ];
  const script = document.getElementById("baidu-map-gl-script") || scripts.at(-1);
  let scriptAkTail = lastScriptAkTail || "none";
  if (script?.src) {
    try {
      const url = new URL(script.src);
      scriptAkTail = akTail(url.searchParams.get("ak"));
    } catch (error) {
      scriptAkTail = "unreadable";
    }
  }
  return {
    akPresent: Boolean(activeAk),
    akSource: lastAkSource,
    bmapLoaded: Boolean(window.BMapGL),
    scriptAkTail,
    activeAkTail: akTail(activeAk),
  };
}

async function loadBaiduMap() {
  const { ak, source } = resolveBaiduAk();
  lastAkSource = source;
  activeAk = ak;

  console.info("Baidu Maps GL AK", {
    present: Boolean(ak),
    source,
    tail: akTail(ak),
  });

  if (!ak) {
    baiduMapPromise = null;
    throw new Error("缺少浏览器端百度地图 AK。请在页面表单中保存 AK，或设置 VITE_BAIDU_MAP_AK。");
  }

  if (window.BMapGL && lastScriptAkTail === akTail(ak)) {
    return window.BMapGL;
  }

  if (baiduMapPromise && pendingAk === ak) {
    return baiduMapPromise;
  }

  removeBaiduScript();
  pendingAk = ak;
  lastScriptAkTail = akTail(ak);

  baiduMapPromise = new Promise((resolve, reject) => {
    const callbackName = "__onBaiduMapGLLoaded_" + Math.random().toString(36).slice(2);
    const timeout = window.setTimeout(() => {
      cleanup();
      baiduMapPromise = null;
      pendingAk = "";
      reject(new Error("百度地图 GL API 加载超时。"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      try {
        delete window[callbackName];
      } catch (error) {
        window[callbackName] = undefined;
      }
    }

    window[callbackName] = () => {
      cleanup();
      if (!window.BMapGL) {
        baiduMapPromise = null;
        pendingAk = "";
        reject(new Error("百度地图脚本已返回，但 window.BMapGL 不存在。"));
        return;
      }
      activeAk = ak;
      resolve(window.BMapGL);
    };

    const script = document.createElement("script");
    script.id = "baidu-map-gl-script";
    script.async = true;
    script.defer = true;
    script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${encodeURIComponent(ak)}&callback=${callbackName}`;
    console.info("Baidu Maps GL script request", {
      endpoint: "https://api.map.baidu.com/api?v=1.0&type=webgl&ak=****",
      akTail: akTail(ak),
      source,
    });
    script.onerror = () => {
      cleanup();
      baiduMapPromise = null;
      pendingAk = "";
      reject(new Error("百度地图 JavaScript API GL 网络加载失败。"));
    };

    document.head.appendChild(script);
  }).catch((error) => {
    baiduMapPromise = null;
    pendingAk = "";
    throw error;
  });

  return baiduMapPromise;
}

function clearRuntimeOnly() {
  removeBaiduScript();
  baiduMapPromise = null;
  activeAk = "";
  pendingAk = "";
  lastScriptAkTail = "";
}

function clearStoredBaiduAk() {
  window.localStorage?.removeItem("QIAOXI_BAIDU_MAP_AK");
  clearRuntimeOnly();
  lastAkSource = "none";
}

window.QiaoxiBaiduMapLoader = {
  loadBaiduMap,
  resolveBaiduAk,
  resolveBaiduStyleId,
  currentDiagnostics,
  clearRuntimeOnly,
  clearStoredBaiduAk,
};

clearStoredConfigFromUrl();
