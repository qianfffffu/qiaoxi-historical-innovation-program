# Qiaoxi Inclusive Wayfinding Totem

桥西历史文化街区包容性电子导览牌更新系统网页端交互原型。

当前版本将界面从“旅游地图 APP”升级为“建筑场地分析图 + 数字导览系统”：打开后直接进入全屏场地分析地图，点击 N01 / N02 等干预节点后进入 Design Intervention View，查看 Overview、3D Totem、Tactile + Braille、Screen UI、Audio Guide、Materials + Sustainability 六个节点级模块。

## 技术结构

- 前端：HTML / CSS / JavaScript
- 地图：百度地图 JavaScript API；未配置 AK 时显示本地建筑分析示意底图
- 三维：Three.js
- 数据：JSON
- 语音：Web Speech API
- 后端 / 数据库 / npm：不需要
- 框架：无 React / 无复杂框架

## 目录结构

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── mapStyle.js
│   ├── nodeStyle.js
│   └── speech.js
├── data/
│   ├── content.json
│   ├── nodes.json
│   ├── totem_designs.json
│   ├── materials.json
│   ├── audio.json
│   ├── routes.json
│   └── runtimeData.js
└── assets/
    ├── images/
    └── sketches/
```

## 运行方式

可直接双击或用浏览器打开 `index.html`。页面会优先读取 JSON；如果浏览器因本地文件权限拦截 JSON，会使用 `data/runtimeData.js` 中的同结构数据兜底。

也可以使用静态服务：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 修改地图范围

在 [data/content.json](/Users/xuanj/Documents/workshop/data/content.json) 中修改：

```json
"bounds": {
  "south": 30.3158,
  "west": 120.1378,
  "north": 30.3204,
  "east": 120.1452
}
```

同时检查同一文件里的 `center`、`zoom`、`min_zoom`、`max_zoom`。百度地图会通过这些值限制在桥西历史街区尺度，本地示意底图也会使用同一范围投影节点和路线。

## 配置百度地图

浏览器端 AK 只从页面表单保存的 `localStorage.QIAOXI_BAIDU_MAP_AK` 读取；如果使用 Vite，则可通过环境变量提供：

```env
VITE_BAIDU_MAP_AK=
```

地图视觉样式由 [js/mapStyle.js](/Users/xuanj/Documents/workshop/js/mapStyle.js) 管理，会隐藏商业 POI、默认道路文字和普通导航式标注，并保留白底、浅灰建筑、低透明道路、浅灰蓝水体。

## 增加或修改节点

节点数据在 [data/nodes.json](/Users/xuanj/Documents/workshop/data/nodes.json)。核心字段：

```json
{
  "id": "gongchen_bridge",
  "name_cn": "拱宸桥",
  "name_en": "Gongchen Bridge",
  "latitude": 30.31872,
  "longitude": 120.14167,
  "heritage_level": 1,
  "category": "bridge",
  "existing_image": "assets/images/gongchen-bridge-existing.png",
  "design_image": "assets/sketches/gongchen-bridge-design.png",
  "audio_cn": "...",
  "audio_en": "...",
  "accessibility_information": {},
  "route_priority": 1
}
```

节点视觉符号由 [js/nodeStyle.js](/Users/xuanj/Documents/workshop/js/nodeStyle.js) 管理，会自动生成 N01 / N02 圆形 diagram marker。新增节点后，如果希望它出现在路线中，还需要把节点 `id` 加入 [data/routes.json](/Users/xuanj/Documents/workshop/data/routes.json) 的 `node_ids`，并在 `path` 中加入对应经纬度。

## 修改路线

路线在 [data/routes.json](/Users/xuanj/Documents/workshop/data/routes.json)：

- `heritage`：Heritage Route
- `accessible`：Accessible Route
- `slow`：Slow Experience Route

每条路线的 `path` 控制地图虚线路径，`node_ids` 控制路线详情与触觉地图中的节点顺序。

## 修改颜色

颜色优先在 [data/content.json](/Users/xuanj/Documents/workshop/data/content.json) 的 `theme` 中修改：

```json
"theme": {
  "background": "#ffffff",
  "building": "#d9dde2",
  "water": "#b9d4dd",
  "primaryBlue": "#23415c",
  "route": "#567c8d",
  "node": "#4b5563"
}
```

[css/styles.css](/Users/xuanj/Documents/workshop/css/styles.css) 使用同名 CSS 变量作为默认值；页面启动后会用 JSON 主题覆盖这些变量。

## 替换图片

图片路径写在 `nodes.json` 的 `existing_image` 和 `design_image`：

- 现状照片：`assets/images/`
- 设计 sketch / render：`assets/sketches/`

只要 JSON 路径正确，文件名可以自由调整。

## 修改节点导览牌设计

每个节点的专属导览牌方案在 [data/totem_designs.json](/Users/xuanj/Documents/workshop/data/totem_designs.json) 中维护。`default` 提供通用结构，各节点可覆盖其中字段：

- `title` / `summary`：导览牌设计标题和说明
- `next_node_id` / `route_focus`：下一节点与路线重点
- `braille_band`：右侧盲文触摸带的标签、内容类型和可触达高度
- `side_buttons`：4 个侧边 Audio 按钮的标签、形状和触发音频段落
- `components`：3D 模型部件说明，包含设计作用、无障碍意义和材料引用
- `screen_ui`：电子屏界面内容、简化地图结构、快捷操作
- `sustainability`：节点展示的可持续策略

## 修改材料与可持续策略

材料清单在 [data/materials.json](/Users/xuanj/Documents/workshop/data/materials.json)：

- `id`：供 `totem_designs.json` 的组件引用
- `name_cn` / `name_en`：材料名称
- `applied_to`：对应部件
- `benefits_cn` / `benefits_en`：材料优势列表
- `sustainability_note_cn` / `sustainability_note_en`：可持续说明

## 修改 Audio Guide

四段式语音文本在 [data/audio.json](/Users/xuanj/Documents/workshop/data/audio.json)：

- `current_location`：当前位置
- `direction_instruction`：方向指引
- `accessibility_notice`：无障碍提示
- `cultural_interpretation`：文化说明

每个节点都包含 `zh` 和 `en` 两套文本。`nodes.json` 中的 `audio_cn` / `audio_en` 仍作为旧数据兜底。

页面不会自动播放语音，必须由用户点击播放按钮触发。暂停与重复由 Web Speech API 完成。

## 直接打开时的数据兜底

如果你修改了 `content.json`、`nodes.json`、`routes.json`、`totem_designs.json`、`materials.json` 或 `audio.json`，并且希望双击 `index.html` 时也使用最新数据，请同步更新 [data/runtimeData.js](/Users/xuanj/Documents/workshop/data/runtimeData.js)。使用静态服务运行时，页面会直接读取 JSON，不依赖兜底文件。
