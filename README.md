# Dynamic Live Wallpaper — Refactored

基于 [BLEZZ0102/Deskland](https://github.com/BLEZZ0102/Deskland) 的独立修改版（0.3.7），保留 **草地** 和 **沙滩** 两个自适应动态壁纸主题。移动桌面图标后，草地上的云团和沙滩的岸线会随图标位置平滑改变。

两个主题都有白天、傍晚和月夜光线。草地保留原版小猫与放风筝的孩子，沙滩增加了沿海岸散步的人物，可在设置中开关。

| 草地可调元素 | 沙滩可调元素 |
| --- | --- |
| 鲜花、蘑菇 | 遮阳伞、贝壳 |
| 蝴蝶、萤火虫 | 海星、螃蟹 |
| 兔子、风车 | 帆船、海龟 |

在实时预览的「元素」页签调节数量；设为 **0** 即隐藏。「环境」页签可以切换光线，调节云层、海岸与浅海。设置按主题单独保存。分享视频优先导出 H.264 MP4，编码不可用时回退到 WebM。分享画面使用示例图标，避免显示桌面文件名。

## 从源码在 Windows 运行

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File host\build.ps1
host\bin\Deskland.exe
```

需要 Windows 10/11 64 位及 Microsoft Edge WebView2 Runtime。构建使用 Windows 自带的 .NET Framework 编译器，首次构建会下载 WebView2 SDK。目前只覆盖主显示器；最大化或全屏窗口出现时自动暂停。

## 浏览器预览与检查

```powershell
node prototype\serve.mjs
# http://localhost:5178/settings.html

npm ci
npm test
npm run test:catalog
```

浏览器预览使用示例图标。真实桌面图标适配需运行 Windows 宿主。测试默认使用本机 Edge；也可通过 `npx playwright install chromium --only-shell` 安装独立测试浏览器，并设置 `$env:DESKLAND_TEST_CHROMIUM='1'`。

架构和变更见 [LOCAL_CHANGES.md](LOCAL_CHANGES.md)。源码许可见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，上游的名称和图标说明见 [TRADEMARKS.md](TRADEMARKS.md)。

## English

An independent enhancement of [BLEZZ0102/Deskland](https://github.com/BLEZZ0102/Deskland), keeping two adaptive live wallpapers: **Meadow** and **Beach**. Clouds and the shoreline shift smoothly when desktop icons move. Both scenes have daylight, dusk and moonlight presets. The settings panel offers a live preview, quantity controls for twelve scene elements, and an on/off switch for the beach walker.

The Windows host reads desktop icon positions. The browser preview and built-in sharing use sample icons; video export prefers H.264 MP4 and falls back to WebM if needed. See the commands above to build, preview and test. The GPL-3.0 license and upstream attribution are retained.
