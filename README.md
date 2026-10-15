# Python Visual Learning · Python 互动教学

把代码，看明白。10 个独立的 Python 互动实验室，通过等距可视化、预设示例与逐步演示，帮助理解程序中的状态和结果。

**[在线学习 / Landing Page](https://bennix.github.io/PythonVisualLearning/)** · **[下载完整项目 ZIP](https://github.com/bennix/PythonVisualLearning/archive/refs/heads/main.zip)** · **[作者作品集](https://bennix.github.io/)**

## 实验室

| 主题 | 内容 | 在线体验 |
| --- | --- | --- |
| 变量与数据类型 | 名称、绑定、14 种类型样本与类型判断 | [进入](https://bennix.github.io/PythonVisualLearning/Python变量与数据类型实验室/index.html) |
| 列表与生成式 | 索引、嵌套、共享引用与生成式 | [进入](https://bennix.github.io/PythonVisualLearning/Python列表与生成式实验室/index.html) |
| 元组 | 不可变序列、嵌套与转换 | [进入](https://bennix.github.io/PythonVisualLearning/Python元组实验室/index.html) |
| 字符串 | 索引、拆分、拼接与文本变换 | [进入](https://bennix.github.io/PythonVisualLearning/Python字符串实验室/index.html) |
| 正则表达式 | 文本匹配与模式规则 | [进入](https://bennix.github.io/PythonVisualLearning/Python正则表达式实验室/index.html) |
| 流程控制 | 条件、循环与控制流 | [进入](https://bennix.github.io/PythonVisualLearning/Python流程控制实验室/index.html) |
| 函数 | 调用、参数、组合与排序 | [进入](https://bennix.github.io/PythonVisualLearning/Python函数实验室/index.html) |
| 异常与断言 | 异常传播、处理与断言 | [进入](https://bennix.github.io/PythonVisualLearning/Python异常与断言实验室/index.html) |
| 文件读写 | 文件操作、缓冲与 CSV | [进入](https://bennix.github.io/PythonVisualLearning/Python文件读写实验室/index.html) |
| 数据分析与可视化 | 25 个 pandas / Matplotlib 预设示例 | [进入](https://bennix.github.io/PythonVisualLearning/Python数据分析与可视化实验室/index.html) |

## 离线使用

下载 ZIP 并解压，双击根目录 `index.html` 进入课程首页，也可直接打开任一实验室的 `index.html`。无需安装 Python 或启动服务。每个实验室成品的样式、交互、SVG 与示例数据均已内联，可单独复制使用。首页搜索和筛选需要浏览器开启 JavaScript。

这是**预设示例的教学演示，不是 Python 解释器**，浏览器不执行任意 Python 代码。请结合实际 Python 环境验证和扩展示例。深浅主题、播放与键盘操作等支持情况以各实验室的 `使用说明.txt` 为准。

## 项目结构与维护

- 根目录 `index.html`、`landing.css`、`landing.js`：课程 Landing Page。
- `labs.json`：实验室目录。
- 各实验室的 `source/`：模板、构建脚本、交互、真值数据及原有测试。
- 各实验室的 `验证/` 或 `screenshots/`：已有验证截图。
- `scripts/build-site.py`：生成 `_site/`，仅包含官网与可运行的独立课程页面。
- `.github/workflows/pages.yml`：在 `main` 更新后自动部署 GitHub Pages。

生成发布目录：

```sh
python3 scripts/build-site.py
python3 -m http.server 8000 --directory _site
```

浏览器访问 `http://localhost:8000`。重新构建某个实验室需要 Node.js，进入对应目录运行 `node source/build.mjs`；重新生成真值数据所需 Python 及科学计算依赖见各实验室说明。原有教学内容和构建来源均保留，不把已有说明中的验证记录当作本次重新执行的结果。

项目中 `source/iso-kit.mjs` 等第三方代码保留其原有许可与署名。
