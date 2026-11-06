# Ambient Hands · 中文说明

一句话：**摄像头拍到你的两只手 → ml5 给出关键点 → 代码把“掌心位置”和“张开度”换算成音区与强度 → 左手控制 Pad（铺底）、右手控制 Bell（铃音），两个生成器各自按自己的计时器决定“什么时候响、响哪个音”。**

- 英文原版：[README.md](README.md)
- 默认生成器：`harmony`（和声生成器）；在地址后加 `?generator=random` 可切回随机生成器对比。
- 默认调式：C Ionian（C 大调），24 个音区从 **G2 排到 B5**。
- 依赖：p5.js 2.3.4、p5.sound（新版，基于 Tone.js 15.0.2）、ml5.js 1.4.0，都放在 `js/` 里，离线可用（但 ml5 的手部模型文件首次加载时从 CDN 下载）。

---

## 目录

1. [怎么跑起来](#1-怎么跑起来)
2. [30 秒上手（演奏说明）](#2-30-秒上手演奏说明)
3. [文件结构](#3-文件结构)
4. [一帧里发生了什么（数据流）](#4-一帧里发生了什么数据流)
5. [音高系统：24 个音区到底对应哪些音](#5-音高系统24-个音区到底对应哪些音)
6. [手势如何变成 0–1 的“张开度”](#6-手势如何变成-01-的张开度)
7. [两个生成器](#7-两个生成器)
8. [Bell 速度：一个常数决定节奏](#8-bell-速度一个常数决定节奏)
9. [音频引擎](#9-音频引擎)
10. [画面与 UI](#10-画面与-ui)
11. [性能与稳定性上的取舍](#11-性能与稳定性上的取舍)
12. [验证方法](#12-验证方法)
13. [常见问题排查](#13-常见问题排查)
14. [调参地图](#14-调参地图)
15. [文档与代码的一致性](#15-文档与代码的一致性)

---

## 1. 怎么跑起来

浏览器不允许 `file://` 下的 ES module 和摄像头，必须用一个本地 HTTP 服务打开（VS Code 的 Live Server 也行）：

```sh
python -m http.server 8000 --bind 127.0.0.1
```

然后打开 <http://127.0.0.1:8000/>。

`index.html` 只做三件事（见 `index.html:8-18`）：

1. 加载样式 `css/normalize.css`、`css/style.css`；
2. 依次加载 `js/helper.js`（光标隐藏 + 窗口缩放）、`js/p5.min.js`、`js/p5.sound.min.js`、`js/ml5.min.js`；
3. 以 **唯一的 ES module 入口** 加载 `src/sketch.js`。

`index.html` 里没有 `<canvas>`，画布由 p5 在 `setup()` 里创建，尺寸是 `windowWidth × windowHeight`（全窗口）。

浏览器要求**用户手势**之后才允许出声，所以页面加载后要点一下左上角的 ▶ 按钮；同时浏览器会弹摄像头权限，必须允许。

---

## 2. 30 秒上手（演奏说明）

| 动作 | 会发生什么 |
| --- | --- |
| 伸出左手 | Pad（绿色）开始发声，手的位置决定音高 |
| 伸出右手 | Bell（金色）开始发声，手的位置决定音高 |
| 手往**上**移 / 往**下**移 | 音变高 / 变低（屏幕上半部分 = 高音区，下半部分 = 低音区） |
| 手往**左/右**移 | 在同一行里逐个音阶移动（不是逐个半音） |
| 把手**完全张开** | 强度 100%，Bell 音符最密、乐句最长；Pad 每次决策都发声 |
| 把手**慢慢握拳** | 强度下降 → Bell 间隔变长（最长 5 倍），Pad 出现休止 |
| 握拳 / 手离开画面 | 该乐器停止（Pad 释放；Bell 取消排队中的音符） |
| 左上角百分比 | 该手当前的强度（0–100%），手不在画面里时变淡 |
| 5 秒不碰鼠标/键盘 | 光标自动隐藏（`js/helper.js:15-40`，方便展览时画面干净） |

> 注意：**“行”是音阶行，不是半音行**。屏幕宽度被分成 12 列，但每一列是“下一个音阶级数”，不是“下一个半音”。详见第 5 节。

---

## 3. 文件结构

```text
index.html                  # 唯一入口；不画任何东西，只负责加载
src/
├── sketch.js               # p5 生命周期、主设置、UI 控件、把各模块接起来
├── handTracker.js          # 摄像头 + ml5 模型的生命周期，把原始检测结果回调出去
├── gestureMapper.js        # 手的身份/掌心/张开度、平滑、屏幕坐标、音区换算
├── musicTheory.js          # 六种调式、音区→MIDI、MIDI→频率、音名标签（纯函数）
├── audioEngine.js          # Pad/Bell 的振荡器、包络、声部池、混响、抢占
├── generativeEngine.js     # 随机生成器：独立计时、概率、邻近音选择、Bell 速度公式
├── harmonicEngine.js       # 和声实验：共享和弦上下文、Pad 和弦、Bell 乐句
└── visuals.js              # 镜像摄像头、cover 裁切、音区网格、颗粒噪点、手部标记
css/                        # normalize.css + style.css（控件、光标隐藏、字体）
js/                         # 本地依赖：helper.js、p5、p5.sound、ml5
assets/fonts/               # 本地字体 Helvetica / Helvetica Light（见 assets/fonts/README.md）
reference/ml5lib/           # 最初参考的 ml5 poseNet 示例（p5 0.7.2 + ml5 0.1.1），不被应用加载
work/                       # 开发期检查脚本、fixture、截图；见第 12 节
```

只有 `src/` 里这 8 个文件会进入运行时。`src/sketch.js` 是模块入口，它 import 其余 7 个模块（`src/sketch.js:1-7`），并把 `setup()` / `draw()` 挂到 `window` 上，让 p5 2.x 的全局模式继续工作（`src/sketch.js:181-184`）。

---

## 4. 一帧里发生了什么（数据流）

```text
摄像头 video
   │  ml5.handPose.detectStart(video, cb)      每帧异步检测
   ▼
gotHands(results, nowMs)                        src/gestureMapper.js:69
   │  按 handedness 分组、取 confidence 最高的一只
   │  PalmCenter = (wrist + 4 个 MCP) / 5       src/gestureMapper.js:20
   │  opennessRatio = 指尖平均距离 / 掌长        src/gestureMapper.js:33
   ▼  只写“目标值”（targetX/targetY/targetOpen）
draw()（p5 每帧）                               src/sketch.js:72
   │
   ├─ updateScale()                             校验调式名、切调式时清状态
   ├─ cameraRect(...)                           cover 裁切参数            src/visuals.js:15
   ├─ gestures.updateHands(nowMs, deltaTime)    指数平滑 + 失手判定       src/gestureMapper.js:96
   │     screenX = view.x + videoX * view.zoom
   ├─ handZone(hand, width, height)             屏幕坐标 → 0..23 音区     src/gestureMapper.js:57
   ├─ drawCamera / drawZones / drawGrain / drawHandMarker                   src/visuals.js
   ├─ generative.updateNoteGenerator(pad,  padZone,  intensity, now)      Pad  的发声决策
   ├─ generative.updateNoteGenerator(bell, bellZone, intensity, now)      Bell 的发声决策
   └─ updateReadouts(...)                       更新左上角百分比
```

关键点：**检测回调只写“目标值”，真正的平滑和发声都在 `draw()` 里做**。这样“手部数据有多快”和“画面/声音更新有多快”解耦，检测回调不会直接触发声音，避免了同一帧内多次触发。

`src/sketch.js:34-70` 的 `setup()` 还做了几件容易被忽略的事：

| 行号 | 做的事 | 为什么 |
| --- | --- | --- |
| `src/sketch.js:35-38` | `await document.fonts.load(...)` 等两个本地字体就绪 | 不等就可能先用系统字体渲染一帧再跳变 |
| `src/sketch.js:44-61` | 创建 audio / gestures / generator / visuals / tracker，并注入依赖 | 每个模块自己持有状态，只拿自己需要的东西，方便单独测试 |
| `src/sketch.js:46-47` | 从 URL 读 `?generator=`，否则用常量 `GENERATOR` | 可以不改代码做 A/B 听感对比 |
| `src/sketch.js:56` | `window.quietReply = { generator, generative }` | 浏览器控制台调试入口 |
| `src/sketch.js:63-66` | 建 UI → 建颗粒贴图 → 校验调式 → 启动摄像头 | `statusLabel` 必须先存在，摄像头状态回调才能写进去 |
| `src/sketch.js:67-69` | 页面隐藏且正在出声时自动暂停 | 切标签页时不会继续响 |

---

## 5. 音高系统：24 个音区到底对应哪些音

### 5.1 数据从哪来

`src/musicTheory.js` 是唯一的“乐理数据”模块，不碰摄像头、不发声、不画图。

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `SCALES` | 6 个调式 | 相对 C 的半音间隔数组（`src/musicTheory.js:3-10`） |
| `ZONE_COLUMNS` | 12 | 屏幕横向切 12 列 |
| `ZONE_ROWS` | 2 | 屏幕纵向切 2 行 |
| `ZONE_COUNT` | 24 | 12 × 2，音区总数 |
| `BASE_MIDI` | 36 | 最低的基准音：C2 |
| `START_DEGREE` | 4 | 网格从“C 往上第 4 个音级”开始，即 G |

六种调式的间隔（数字是相对 C 的半音数）：

| 调式 | 半音间隔 | 特点 |
| --- | --- | --- |
| Ionian（默认） | 0 2 4 5 7 9 11 | 大调；第 7 音是 B |
| Dorian | 0 2 3 5 7 9 10 | 小三度 + 大六度 |
| Phrygian | 0 1 3 5 7 8 10 | 降二级，最“暗” |
| Lydian | 0 2 4 6 7 9 11 | 升四级（F#），最“亮” |
| Mixolydian | 0 2 4 5 7 9 10 | 大调 + 降七级 |
| Aeolian | 0 2 3 5 7 8 10 | 自然小调 |

### 5.2 音区 → MIDI 的公式

```js
// src/musicTheory.js:19-26
absoluteDegree = START_DEGREE + degree          // 4 + 0..23
octave         = floor(absoluteDegree / 7)      // 每 7 个音级一个八度
index          = ((absoluteDegree % 7) + 7) % 7 // 写这个是为了兼容负的 degree
midi           = 36 + octave * 12 + intervals[index]
```

把它当成“在音阶上数格子”：**每数 7 个音区，音高升一个八度**，所以音区是“音阶级数”而不是半音级数。

举例（Ionian）：

- `degree = 0` → `absoluteDegree = 4` → octave 0，index 4 → `36 + 0 + 7 = 43` → **G2**（G 是 C 大调的第五级，MIDI 43 ≈ **98.0 Hz**）
- `degree = 11` → octave 2，index 1 → `36 + 24 + 2 = 62` → **D4**
- `degree = 23` → `absoluteDegree = 27` → octave 3，index 6 → `36 + 36 + 11 = 83` → **B5**（≈ **987.8 Hz**）

频率换算（`src/musicTheory.js:28-30`）：`f = 440 × 2^((midi − 69) / 12)`，即 A4 = 440 Hz 的标准十二平均律。

### 5.3 24 个音区的实际音名（默认 Ionian）

屏幕**下半行**（音区 0–11，从左到右）：

| 列 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 音 | G2 | A2 | B2 | C3 | D3 | E3 | F3 | G3 | A3 | B3 | C4 | D4 |

屏幕**上半行**（音区 12–23，从左到右）：

| 列 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 音 | E4 | F4 | G4 | A4 | B4 | C5 | D5 | E5 | F5 | G5 | A5 | B5 |

这里有个常见的误解：`ZONE_COLUMNS = 12` 看起来像 12 个半音，其实 12 只是**布局列数**；真正的音高是“音阶级数”。所以 C 音出现在第 4 列（C3）、第 11 列（C4）以及上一行的第 6 列（C5）——**每 7 列回到一次 C**。

### 5.4 音区编号与像素坐标的对应

`zoneForPosition()`（`src/gestureMapper.js:47-55`）：

```js
column       = floor(x / canvasWidth  * 12)   // 0..11
rowFromBottom = 1 - floor(y / canvasHeight * 2)  // 0 = 下半行，1 = 上半行
zone         = rowFromBottom * 12 + column
```

- 画布的 y 轴向下，但低音在屏幕下方，所以先算“从下往上是第几行”。
- 越界（`x < 0`、`x ≥ 宽`、`y < 0`、`y ≥ 高`）或坐标/画布尺寸不是有限数 → 返回 `-1`（= 没有音区）。
- 例：1920×1080 画布上，手在 `(960, 500)`：列 `floor(0.5 × 12) = 6`，`floor(500/1080 × 2) = 0` → 行 1 → `zone = 12 + 6 = 18` → **D5**；把手往下移到 `y = 600` → 行 0 → `zone = 6` → **F3**。

### 5.5 改了会怎样

| 想做的事 | 改哪里 | 副作用 |
| --- | --- | --- |
| 整体升八度 | `BASE_MIDI` 36 → 48（`src/musicTheory.js:15`） | 所有音区一起升；Bell 音域偏高，注意听感 |
| 换调式 | `Current_Scale`（`src/sketch.js:11`） | 音程关系变，但网格布局不变；运行时会自动重建和声库 |
| 换起始音 | `START_DEGREE`（`src/musicTheory.js:16`） | 会同时改变网格起始音和和声生成器里的 `stepClass` 映射 |
| 改成 8×3 = 24 个音区 | `ZONE_COLUMNS` / `ZONE_ROWS`（`src/musicTheory.js:12-13`） | 音区总数不变就还能用；`ZONE_COUNT` 会自动算，和声的 `voiceChord` 越界判断也用的是它 |
| 加新调式 | 往 `SCALES` 里加一项（间隔必须是 7 个半音数） | 名字要写对，`updateScale()` 会用 `Object.hasOwn` 校验，拼错会警告并回退到 Ionian |

---

## 6. 手势如何变成 0–1 的“张开度”

### 6.1 掌心位置：平均 5 个点，比指尖稳

```js
// src/gestureMapper.js:20-31
PalmCenter = (wrist + index_mcp + middle_mcp + ring_mcp + pinky_mcp) / 5
```

为什么不用指尖？指尖在握拳/张开时移动幅度大得多，会让音高抖动；腕部 + 4 个掌指关节（MCP，掌指关节）几乎不会因为手指动作而移动。

### 6.2 张开度：用“掌长”当尺子

```js
// src/gestureMapper.js:33-45
palmLength = dist(wrist, middle_finger_mcp)          // 视频像素
ratio      = 平均(4 个指尖到 wrist 的距离) / palmLength
openness   = clamp((ratio - FIST_RATIO) / (OPEN_RATIO - FIST_RATIO), 0, 1)
```

把“指尖离腕的距离”除以掌长，**手离摄像头远近会同时放大分子和分母，比值不变**——所以人靠近/远离镜头不会改变音量/密度。

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `FIST_RATIO` | 1.05 | 握拳时的比值，映射为 0 |
| `OPEN_RATIO` | 1.75 | 完全张开时的比值，映射为 1 |

代入具体数字：掌长 100px、指尖平均 175px → `ratio = 1.75` → 张开度 `(1.75 − 1.05) / 0.7 = 1.0`；指尖平均 140px → `ratio = 1.4` → `(1.4 − 1.05) / 0.7 = 0.5`。

还有一个防呆：`palmLength < 1` 时直接返回 `FIST_RATIO`（`src/gestureMapper.js:39`）。也就是“检测到了但掌部退化到几乎为零”会被当成握拳（不发声），而不是除零得到 `Infinity`。

### 6.3 平滑：与帧率无关的指数平滑

```js
// src/gestureMapper.js:96-108
amount = 1 - exp(-deltaTimeMs / HAND_SMOOTH_MS)   // HAND_SMOOTH_MS = 90
value += (target - value) * amount
```

- 60fps 时 `deltaTime ≈ 16.7ms` → 每帧只走 `1 − exp(−16.7/90) ≈ 16.9%` 的差距；
- 时间常数 90ms 意味着大约 **90ms 走完 63%**、~300ms 基本追平；
- 因为它用 `deltaTime` 而不是固定系数，所以 30fps 和 120fps 下手感一致。

**位置和张开度用的是同一个 `amount`**。所以手突然出现时不会“从上一位置滑过来”（下面 6.4 处理），但位置和开合变化看起来是同一节奏。

### 6.4 失手与重新出现

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `HAND_LOST_MS` | 300 | 超过 300ms 没检测到 → `visible = false`，`open` 目标变 0 |

两个细节：

1. **重新出现时直接跳位**：如果上次看到这只手已经超过 300ms，`gotHands()` 会把平滑起点直接设成新位置（`src/gestureMapper.js:87-91`），避免手从旧位置“滑”到新位置时掠过一堆音区。
2. **短暂丢失不算丢失**：300ms 内重新出现，`visible` 一直是 true，不会触发反复的“停止/重启”。这也是为什么抖动不会产生额外的 Pad 释放。

### 6.5 两只手的身份

ml5 会返回 `handedness`（"Left"/"Right"）。`gotHands()` 对同一侧可能返回的多只手**只保留 confidence 最高的那只**（`src/gestureMapper.js:71-77`）。如果摄像头镜像导致左右标反，把 `SWAP_HANDS` 改成 `true`（`src/gestureMapper.js:4`）。

左右手各自控制什么是在 `src/sketch.js:12-13` 定的：

```js
const PAD_HAND  = "Left";   // 左手 → Pad
const BELL_HAND = "Right";  // 右手 → Bell
```

把这两行交换，就是“右手 Pad、左手 Bell”，声音和颜色也会跟着换（颜色由 `visuals` 按 role 分配，与左右手无关）。

### 6.6 屏幕坐标

```js
// src/gestureMapper.js:106-107
hand.x = view.x + hand.videoX * view.zoom;
hand.y = view.y + hand.videoY * view.zoom;
```

`view` 来自 `cameraRect()` 的 cover 裁切（第 10 节）。`videoX/videoY` 是 ml5 返回的**视频像素坐标**（ml5 1.4 的手部关键点会按输入图像尺寸缩放，不是 0–1 归一化），`zoom` 是“视频像素 → 屏幕像素”的倍率，所以这一步把手的视频坐标搬到屏幕上。画面是镜像的、ml5 又用 `flipped: true` 检测，两次镜像相互抵消，所以屏幕坐标直接加即可，见 10.2。

---

## 7. 两个生成器

两个生成器暴露**完全相同的接口**，所以 `src/sketch.js:46-54` 可以一行切换：

```js
{ pad, bell, updateNoteGenerator, resetTimers, clearGlows }
```

- `pad` / `bell`：各自的状态对象（`glow[24]` 用于视觉反馈、`hand` 指向哪只手）。
- `updateNoteGenerator(voice, zone, intensity, nowMs)`：每帧对 Pad 和 Bell 各调一次。
- `resetTimers(nowMs)`：启动/暂停/切调式后重置计时，避免“补发一串音符”。
- `clearGlows()`：清空视觉余辉。

两个生成器都**没有“每帧随机决定响不响”**的逻辑：它们只在“到时间点”的那一刻掷一次骰子。这保证了节奏不随帧率变化，也避免卡顿后突然补发一串音符。

### 7.1 随机生成器（`src/generativeEngine.js`）

对应 `?generator=random`。

**Pad（左手）**

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `PAD_MIN_HOLD_MS` / `PAD_MAX_HOLD_MS` | 100 / 1000 | 每次决策后至少等多久再决策 |
| 发声概率 | `random() < intensity` | 张开度就是“这次决策发声的概率”，其余时间 `releasePad()` 静音 |

音高选择 `chooseNearbyDegree()`（`src/generativeEngine.js:44-57`）：

| 相对当前音区的偏移 | 概率 |
| --- | --- |
| 0（原地） | 0.4 |
| −1 | 0.2 |
| +1 | 0.2 |
| −2 | 0.1 |
| +2 | 0.1 |

它在边界处会**先过滤掉越界的选项，再按剩余权重重新归一化**（`totalWeight` 求和，`roll < accumulated` 判定）。例如手在最左边第 0 个音区时，负偏移全被过滤，只剩 0/+1/+2 → 概率变成 0.4/0.4/0.2（相对值）。这样在屏幕边缘不会出现“半个音区没有声音”。

**Bell（右手）**

- 没有乐句概念，每个音符独立；
- 基础间隔在 `BELL_OPEN_MIN_GAP_MS`(30) 到 `BELL_OPEN_MAX_GAP_MS`(190) 之间**均匀**取值；
- 握拳（≤5%）或丢手 → 取消排队音符、保留当前等待、不再出新音；
- 每次决策的间隔会先按当前张开度即时缩放（见第 8 节）。

### 7.2 和声生成器（`src/harmonicEngine.js`，默认）

思路：Pad 手负责“选一个和弦并铺开”，Bell 手负责“在这个和弦上吹一段小旋律”。两边共享一个 `harmony` 上下文：

```js
// src/harmonicEngine.js:206
harmony = { scale, bank, chord, voicing, changedAt }
```

Pad 手离开画面时这个上下文**保留**（最后一次的和弦继续作为 Bell 的背景），回来后接着用。

#### 7.2.1 和弦库：17 个和弦，覆盖 6 种调式

```js
// src/harmonicEngine.js:17-21
CHORD_SHAPES = [
  { name: "triad",   steps: [0, 2, 4],    weight: 1 },
  { name: "sus2",    steps: [0, 1, 4],    weight: 0.3,  requires: { 1: [2] } },
  { name: "seventh", steps: [0, 2, 4, 6], weight: 0.35, requires: { 6: [10, 11] } },
];
```

`steps` 是“相对和弦根音的音阶级数”，不是半音。`buildChordBank()`（`src/harmonicEngine.js:75-97`）逐个调式生成：

1. 对每个根音（0–6，即 I–VII 级）× 每种形状；
2. 用 `stepSemitones()` 把音阶级数换成半音；
3. **必须有纯五度**（`semitones[4]` 必须 = 7）→ 自动排除减三和弦；
4. 检查 `requires`：sus2 要求二级是大二度（2 个半音，排除 Phrygian 的降二度色彩）；七和弦要求七音是 10 或 11 个半音（小七/大七，排除减七）；
5. 权重 = 形状权重 × `ROOT_WEIGHTS[root]`（I 级 1.6、V 级 1.1、其余 0.7–1.1，见 `src/harmonicEngine.js:23`）。

结果每个调式正好 **17 个和弦**。以 Ionian 为例（`node work/harmony-check.mjs` 会打印）：

```text
C  Csus2  Cmaj7  Dm  Dsus2  Dm7  Em  Em7  F  Fsus2  Fmaj7  G  Gsus2  G7  Am  Asus2  Am7
```

#### 7.2.2 选和弦：手按在哪个音上，和弦就必须包含它

`chooseChord(zone, current, bank, random)`（`src/harmonicEngine.js:119-130`）：

1. 只保留包含“手所在的音级”的和弦（`chord.steps.includes(handStep)`，`handStep = stepClass(zone)`）；
2. 每个候选权重 = 和弦权重 × 角色权重 × 变化偏好：

| 乘数 | 值 | 何时生效 |
| --- | --- | --- |
| `ROLE_WEIGHTS` | 根音 1、二级 0.5、三级 0.6、五级 0.8、七级 0.4 | 手音在这个和弦里扮演什么角色（`src/harmonicEngine.js:25`） |
| `STAY_WEIGHT` | 3 | 新和弦标签与当前和弦相同 → 倾向于保持 |
| `COLOR_WEIGHT` | 2.8 | 同根音、不同形状（如 Dm → Dm7）→ 倾向于只换色彩 |

以“手停在 A3（音区 8，`stepClass = (4+8) % 7 = 5`）、当前和弦是 C”为例。包含 A 这个音级的候选有 9 个，按公式算出的权重（`和弦权重 × 角色权重`，当前和弦是 C，不触发保持/换色彩偏好）从高到低是：

| 候选 | 手音的角色 | 权重 | 归一化概率 |
| --- | --- | --- | --- |
| Am | 根音 | 0.90 | 26.0% |
| F | 三级 | 0.66 | 19.0% |
| Dm | 五级 | 0.56 | 16.2% |
| Am7 | 根音 | 0.315 | 9.1% |
| Asus2 | 根音 | 0.27 | 7.8% |
| Fmaj7 | 三级 | 0.231 | 6.7% |
| Dm7 | 五级 | 0.196 | 5.7% |
| Dsus2 | 五级 | 0.168 | 4.8% |
| Gsus2 | 二级 | 0.165 | 4.8% |

所以 Am 最可能，但不是“必定”；如果当前已经是 Am，Am 的权重再乘 `STAY_WEIGHT = 3`（0.90 → 2.7），概率升到约 51%——既不会跳得太频繁，也不会一直不动。

这套规则的效果是：**Pad 手移动时音乐会在保持“能对上手的音”的前提下慢慢转和弦**，而不是完全随机跳。

#### 7.2.3 配声：手附近最近的“密集排列”

`voiceChord(chord, zone)`（`src/harmonicEngine.js:134-143`）：

1. 从手所在音区开始**向下**找第一个属于该和弦根音的音区（用 `stepClass` 比较）；
2. 找不到（手在根音下方）就改为向上找；
3. 根音往上排三度/五度/七度；
4. 如果最高音超出第 24 个音区，整个和弦下移 7 个音区（一个八度）。

例：手在 A3（音区 8），选中 Am → `stepClass(8) = 5` 正好是 Am 的根音级 → 根音就是 8 → 配声是 `8, 10, 12` = **A3 · C4 · E4**；手在 B3（音区 9），选中 Em → 向下找到的根音是 5（E3）→ 配声 `5, 7, 9` = **E3 · G3 · B3**。所有音都是 0–23 的音区，所以**每个正在响的 Pad 音都会在网格上亮一个格**（`pad.glow`）。

#### 7.2.4 Pad 的决策循环

`updatePad()`（`src/harmonicEngine.js:222-254`）每帧被调用，只在“到时间点”时真正决策：

| 情况 | 行为 |
| --- | --- |
| 手丢了 / 张开度 = 0 | `releasePad()`，把下一次机会设为 `now` |
| 距离上次换和弦不足 `PAD_MIN_CHORD_MS`(1000ms) | 可以重配音，但不能换和弦 |
| 手离开了当前和弦（且已满 1000ms） | **允许提前跳**，不用等完当前 hold |
| 张开度做概率：`random() >= intensity` | 休止 50–200ms（`PAD_REST_MIN_MS/MAX_MS`） |
| 能换和弦 | `chooseChord()` |
| 不能换（刚回来） | 保持和弦，只改配声 |
| 声部还没空出来 | 90ms 后重试（`PAD_RETRY_MS`），不消耗决策 |
| 成功 | 下一次机会 = now + 200–1000ms（`PAD_CHORD_MIN/MAX_HOLD_MS`）；若和弦标签变了才更新 `changedAt` |

注意“张开度是概率”这条：手半闭时 Pad 会断续；完全张开（intensity = 1）时 `random() < 1` 恒真，所以不会休止。

#### 7.2.5 Bell 的乐句

`updateBell()`（`src/harmonicEngine.js:262-300`）只在“没有乐句”时开新乐句：

```js
maxNotes  = BELL_PHRASE_MIN_NOTES + intensity × (BELL_PHRASE_MAX_NOTES − BELL_PHRASE_MIN_NOTES)
notesLeft = round(random(2, maxNotes))   // 2..8 个音
```

- 完全张开 → 最多 8 个音；半开 → 约 5 个音；越松的乐句结束得越快。
- **乐句边界没有额外休止**：最后一个音之后用的间隔和普通音完全一样（`src/harmonicEngine.js:298-299`），所以“手一直张开”时音符是连续的。
- `noteGap()`（`src/harmonicEngine.js:256-260`）：三档加权间隔 30 / 110 / 190ms（权重 0.3 / 0.45 / 0.25）再乘抖动，最后夹到 30–190ms（抖动细节见第 15 节）。

`chooseMelodyNote()`（`src/harmonicEngine.js:155-196`）负责“下一个音弹什么”：

1. **必须先解决挂留音**：如果上一音是经过音（passing tone），下一音必须沿同方向级进到和弦音；如果和弦已经变了导致落不到和弦音，就反向退一步（`src/harmonicEngine.js:158-162`）。
2. **偶尔用经过音**：`PASSING_TONE_CHANCE = 0.15`，且要求本乐句还剩 ≥2 个音（要留一个音回来），从上一音 ±1 级进到一个非和弦音，且再走一步是同方向的和弦音（`src/harmonicEngine.js:168-177`）。
3. **其余情况选择和弦音**：
   - 范围 `MELODY_RANGE = 3`：只考虑手势中心 ±3 个音区内的音；
   - 权重 = `1/(1 + |音区 − 手音区|)` × `leapWeight(|音区 − 上一音|)`；
   - `leapWeight()`（`src/harmonicEngine.js:145-151`）：同音 0.3、级进（≤2）1、小跳（≤4）0.55、大跳 0.25；
   - **乐句最后一个音若是和弦根音，权重 × 4.5**（`ENDING_ROOT_WEIGHT`），让乐句有“落回主音”的收束感。

例：中心 B3（音区 9）、和弦 Em（和弦音是 7=G3、9=B3、12=E4）→ 首音权重：9（原地）1.0、7 约 1/3、12 约 1/4，所以更可能在 B3 附近游走；若这是乐句最后一个音且落在 12（E4，Em 的根音），权重再 ×4.5，收束感更强。

### 7.3 两个生成器的行为差异（听感对照）

| 维度 | random | harmony（默认） |
| --- | --- | --- |
| 音高来源 | 当前音区 ±{0,±1,±2}，按权重 | 和弦音为主 + 15% 经过音 |
| Pad 发声 | 单音（2 个声部做交叉淡化） | 3–4 音和弦（独立 8 声部池） |
| Pad 节奏 | 每 100–1000ms 决策一次 | 每 200–1000ms 决策一次，换和弦最快 1000ms 一次 |
| Bell 节奏 | 30–190ms 均匀 | 30/110/190ms 三档加权 + 抖动 |
| Bell 结构 | 无乐句，逐音独立 | 2–8 音的乐句，有经过音/解决/收束 |
| 两者关系 | 各自独立 | Bell 跟着 Pad 的和弦走 |

---

## 8. Bell 速度：一个常数决定节奏

这是 `src/generativeEngine.js` 顶部的一组共享设置（两个生成器都读它）：

| 常量 | 值 | 单位 | 作用 |
| --- | --- | --- | --- |
| `BELL_OPEN_MIN_GAP_MS` | 30 | ms | 手完全张开时的最短音符间隔 |
| `BELL_OPEN_MAX_GAP_MS` | 190 | ms | 手完全张开时的最长音符间隔 |
| `BELL_GAP_CLOSED_SCALE` | 5 | 倍 | 手完全握起时间隔放大到 5 倍 |
| `BELL_FIST_THRESHOLD` | 0.05 | 0–1 | 张开度 ≤5% 视为“握拳”，停止出新音 |

核心公式（`src/generativeEngine.js:21-24`）：

```js
bellGapScale(intensity) = 1 + (BELL_GAP_CLOSED_SCALE − 1) × (1 − intensity)
                        = 1 + 4 × (1 − intensity)
```

| 张开度 | 倍率 | 30–190ms 的基础间隔变成 |
| --- | --- | --- |
| 1.00（全开） | 1× | 30–190ms |
| 0.75 | 2× | 60–380ms |
| 0.50（半开） | 3× | 90–570ms |
| 0.20 | 4.2× | 126–798ms |
| 0.00（握拳） | 5× | 150–950ms（但 ≤5% 已经直接停音） |

实现上有三个关键设计：

1. **等待中的 deadline 每帧重算，但不由“现在”重算**：`refreshBellWait()`（`src/generativeEngine.js:32-36`）用 `waitStartedAt + baseWaitMs × scale(当前张开度)`。如果从“现在”重算，deadline 会永远向后跑，手一直半闭就永远不出音；从起点重算则只是“把同一个等待拉长/缩短”。
2. **不重新掷骰子**：手合拢再张开时，基础等待 `baseWaitMs` 保持不变，只改缩放倍率。所以“快速抖动”不会额外产生音符（`work/bell-timing-check.mjs` 专门测这条）。
3. **握拳时保留上一次等待**：`refreshBellWait()` 在 `baseWaitMs` 为空时直接返回；握拳分支调用它只是为了按当前开合度重算，不会清零计时。

#### 实际听起来的密度（实测）

`noteGap()` 的抖动是 `random(1 − 0.96, 1 + 0.96)` 再夹到 30–190ms。用真实代码路径跑 20 万次采样（本次会话实测）：

| 指标 | 值 |
| --- | --- |
| 最小 / 平均 / 最大 | 30ms / **96.8ms** / 190ms |
| 10% / 90% 分位 | 30ms / 190ms |
| 正好落在 30ms 的比例 | 22.1% |
| 正好落在 190ms 的比例 | 18.0% |

也就是说：**全开手时平均约 10 个音/秒，而且有约 40% 的音挤在最快/最慢两个极端上**。这不是 bug，是抖动乘 0.04–1.96 之后再被 30–190ms 夹住的结果；想要更均匀的节奏，把抖动改小（见 15.3）。

#### 想调快/调慢

| 目标 | 改哪里 |
| --- | --- |
| 整体变快 | `BELL_OPEN_MIN_GAP_MS` / `BELL_OPEN_MAX_GAP_MS` 调小 |
| 握拳时“慢下来”更明显 | `BELL_GAP_CLOSED_SCALE` 调大（如 8） |
| 手稍微一合就停 | `BELL_FIST_THRESHOLD` 调大（如 0.12） |
| 更平稳、更少极端值 | `harmonicEngine.js` 的 `BELL_GAP_JITTER` 改小（如 0.12） |

验证命令：`node work/bell-timing-check.mjs` 会在 60 秒模拟里检查“手越合越慢”“不会出现 NaN 时间”“抖动不产生额外音符”。

---

## 9. 音频引擎

`src/audioEngine.js` 不关心手势，只负责“给我一个 MIDI 音，我把它响出来”。两条独立的信号链：

### 9.1 Pad 单音（random 模式）

```text
SinOsc(基频) ─┐
              ├─→ Envelope(ADSR 1.6 / 1.8 / 0.65 / 2.0) ─→ LowPass(1300Hz) ─→ Reverb(5s, wet 0.65) ─→ 输出
TriOsc(基频) ─┘        （triangle 电平 ×0.0001）
```

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `PAD_ATTACK` | 1.6 s | 慢起音，Pad 的“铺底”感 |
| `PAD_DECAY` | 1.8 s | 衰减到 sustain |
| `PAD_SUSTAIN` | 0.65 | 持续电平（是电平不是时长） |
| `PAD_RELEASE` | 2.0 s | 松手后的余音 |
| `PAD_VOLUME` | 0.36 | 正弦振幅，再乘 0.8–1 的随机力度 |
| `PAD_TRIANGLE_LEVEL` | 0.0001 | 三角波电平系数（实际等于不可闻，见 15.3） |
| `PAD_FILTER_CUTOFF` | 1300 Hz | 低通截止，削掉高频 |
| `PAD_REVERB_SECONDS` / `WET` | 5 s / 0.65 | 混响长度与湿声比例 |

**两个声部**（`createPadVoices()`，`src/audioEngine.js:41-50`）：换音时旧音在 2 秒 release 里淡出，新音在新声部起音，不会“切断”。`playPad(midi)`（`src/audioEngine.js:108-127`）有两个细节：

- **同一音高不重触发**：`activePadVoice.midi === midi` 直接返回 true，保持 sustain，避免手停在同一个音上时不断“重启”包络；
- **不抢释音中的声部**：只从 `freeAt <= now` 的声部里找；找不到返回 false，宁可这拍不响也不切断余音。

### 9.2 Pad 和弦（harmony 模式）

```text
每个音：SinOsc + TriOsc → 自己的 Envelope → 共享 LowPass → 共享 Reverb
```

`PAD_CHORD_VOICES = 8` 个声部的**懒加载池**：直到第一次弹和弦才创建（`src/audioEngine.js:74-76`），所以默认的 random 模式音频图和拆分前完全一致（`work/module-check.mjs` 会验证这一点）。

`playPadChord(midis)`（`src/audioEngine.js:72-101`）会：

1. 去重；
2. 已有的同音声部（`freeAt === Infinity` 且 midi 在新和弦里）**保持不动**——这就是“共同音保持”（common tone），和弦变化时只有真正变化的音在淡入淡出；
3. 其余正在响的声部释放；
4. 新音从 `free.length` 里取，空位不够就整体放弃（返回 false，生成器 90ms 后重试），**绝不改写仍在淡出的声部**；
5. 整体电平 = `PAD_VOLUME × PAD_CHORD_NOTE_LEVEL(0.5) × random(0.8,1)` → 每个音约 0.14–0.18，3–4 音和弦总电平不会明显高于单音 Pad。

### 9.3 Bell

```text
SinOsc(f)    ─┐
              ├─→ Envelope(0.0006 / 3.9 / 0 / 0.99) ─→ Reverb(6s, wet 0.84) ─→ 输出
SinOsc(2f)   ─┘        （泛音电平 ×0.18）
```

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `VOICE_COUNT` | 12 | 声部数（固定池，运行时不新建节点） |
| `BELL_ATTACK` | 0.0006 s | 几乎瞬时的起音 |
| `BELL_DECAY` | 3.9 s | 衰减到 0（sustain = 0，所以是“敲一下然后消失”） |
| `BELL_RELEASE` | 0.99 s | 被抢占/暂停时的释放时间（sustain = 0，所以平时自然衰减） |
| `BELL_VOLUME` | 0.15 | 基频振幅 × random(0.7,1) |
| `OVERTONE_LEVEL` | 0.18 | 二次谐波（高八度）比例 |
| `BELL_REVERB_SECONDS` / `WET` | 6 s / 0.84 | 长混响 + 高湿声，铃音的空间感 |

一个 Bell 声部从触发到可复用要 `BELL_ATTACK + BELL_DECAY + 0.06 ≈ 3.96s`（`startBellVoice()`，`src/audioEngine.js:208-218`）。12 个声部 × 约 4 秒意味着**全开手时（约 10 音/秒）池子会在 1.2 秒左右填满**，所以高密度下几乎每个音都走“抢占”路径：

`playBell()`（`src/audioEngine.js:167-206`）分两步：

1. **有空闲声部**（`pendingTimer === null` 且 `freeAt <= now`）→ 直接开始；
2. **没有空闲** → 抢占“最早可以释放”的声部（`freeAt` 最小的）：
   - 把它的 releaseTime 临时改成 `BELL_STEAL_FADE_MS = 15ms`，触发 release → 15ms 内快速淡出；
   - 记下“等 15ms 后改用新音”；
   - 定时器里**同时检查墙钟和音频时钟**（`src/audioEngine.js:193-197`）：浏览器音频上下文被挂起时墙钟照样走，所以必须等 `audioContext.currentTime` 真的走到 `readyAt` 才重新触发，否则会在错误的时刻换音；
   - 用 `pendingRequest` 身份对象丢弃过期回调（暂停/再次抢占后旧回调不会误触发）；
   - 完成后恢复 `releaseTime(BELL_RELEASE)` 再触发新音。

如果所有声部都在待处理状态（`pendingTimer` 非空），`playBell` 返回 false：harmony 生成器 30ms 后重试（`BELL_RETRY_MS`），random 生成器则等下一个正常间隔，**不会丢拍子、也不会补发**（`work/continuous-bell-check.mjs` 会验证“100 次快速触发、音频图不增长、最大间隔 ≤ 20+15ms”）。

### 9.4 启动与暂停

```js
await context.resume();   // 解锁浏览器音频上下文
p.userStartAudio();       // p5 的“用户手势后启动”辅助
createPadVoices(); createBellVoices();   // 两个乐器都建好（它们要能同时响）
audioRunning = true;
```

- `start()`（`src/audioEngine.js:243-259`）有 `audioStarting` 守卫，防止双击重复初始化；
- `pause()`（`src/audioEngine.js:261-265`）先把 `audioRunning = false`，再 `releasePad()` + `releaseBellVoices()`（后者会先 `cancelPendingBellNotes()`，取消所有排队中的抢占，避免暂停后“复活”一个旧音）；
- 再次 `start()` 时池子已存在 → **直接复用，不重建节点**，所以内存/音频图不会越用越大（`work/module-check.mjs` 的 Start/Pause 复用检查会验证）。

### 9.5 为什么都要手动 `disconnect()`

`src/audioEngine.js:57-59`、`153-155` 里对每个节点先 `disconnect()` 再 `connect()`：这版 p5.sound 的振荡器/包络默认会直接连到输出，如果不去掉默认连线，声音会绕过包络和滤波器（于是“Release 不生效”“低通没用”）。这是该版本 p5.sound 的一个必须注意的细节。

---

## 10. 画面与 UI

### 10.1 绘制顺序（`src/sketch.js:86-94`）

```js
visuals.drawCamera(...)     // 底色 + 镜像摄像头 + 半透明米色覆盖
visuals.drawZones(...)      // 24 个音区、当前手音区高亮、余辉、网格线、音名
visuals.drawGrain()         // 颗粒滤镜
visuals.drawHandMarker(...) // Pad 一个圈、Bell 一个圈
```

余辉在 `drawZones()` 里每帧乘一次 `exp(-deltaTime/450)`（`src/visuals.js:50`、`72-73`）：时间常数 450ms，所以亮起后约 0.3 秒还有 50%，1 秒后约 10%。因为衰减发生在绘制阶段，逻辑模块只负责“把 glow 设成 1”，视觉和音乐状态是分开的。

### 10.2 镜像与 cover 裁切

`cameraRect()`（`src/visuals.js:15-25`）：

```js
zoom = max(canvasW / videoW, canvasH / videoH)   // cover：填满画布，不拉伸
x = (canvasW − videoW × zoom) / 2                // 居中
y = (canvasH − videoH × zoom) / 2
```

例：1920×1080 画布 + 640×480 视频 → `zoom = max(3, 2.25) = 3` → 视频被放大到 1920×1440，`y = (1080 − 1440)/2 = −180`，上下各裁掉 60 个视频像素。

`drawCamera()`（`src/visuals.js:31-44`）先 `translate(width, 0); scale(-1, 1)` 做水平镜像，再用 `p.drawingContext.filter` 给摄像头画面加 `grayscale(0.6) contrast(0.82) brightness(1.08) blur(0.6px)`，最后盖一层 `fill(239,239,232, 120)` 的米色 wash，把实拍画面压成柔和的背景。

镜像不会让手的位置错位，因为**两次镜像互相抵消**：绘制时镜像了视频；ml5 用 `flipped: true` 检测，返回的关键点 x 已经是镜像后的坐标。于是“视频像素 x → 屏幕 x”就是 `view.x + x * zoom`。

### 10.3 音区网格

- 每个音区一个矩形，颜色按 `(列 + 行) % 2` 交替（`ZONE_TINT_A/B`，都是很淡的半透明）；
- 当前 Pad / Bell 所在音区各盖一层对应色（alpha 55）；
- Pad/Bell 的余辉叠加（alpha = `glow × 120`）；
- 每列左边界有一条竖线；
- 每个格子的底部中央写音名（`midiToLabel`，即 `zoneNotes[i]`），字号取 body 的 `font-size`（16px），所以窗口缩放不会让文字糊掉。

颜色常量（`src/visuals.js:12-13`）：Pad 是灰绿色 `rgb(116,150,138)`，Bell 是金棕色 `rgb(207,172,105)`；UI 里的百分比文字用同色系（`css/style.css:110-116`）。

### 10.4 颗粒噪点

`createGrainTiles()`（`src/visuals.js:85-103`）在初始化时预生成 4 张 180×180 的噪声贴图（每像素灰度 110–255），做成可重复的 canvas pattern。`drawGrain()`（`src/visuals.js:105-118`）每帧：

- 每 9 帧（`GRAIN_FRAMES_PER_TILE`）换一张贴图；
- 换图时同时随机偏移一个贴图尺寸以内的位移；
- 以 `globalAlpha = 0.16` 铺满全屏。

为什么不用 `p.noise()` 逐像素算？全屏逐像素噪声在 1080p 每帧要算 200 万+ 个值，会直接吃满 CPU；预生成 4 张 180×180 的贴图只需要画一个 pattern，几乎零成本，视觉上仍然在“跳”。

### 10.5 手部标记

`drawHandMarker()`（`src/visuals.js:120-130`）：一个空心圆（直径 18 + 张开度×34）+ 一个实心小点（4px）。可见时 alpha 200；不可见时 alpha 乘 `open`（平滑后的值会趋近 0），所以手一离开画面圈会淡出而不是突然消失。

### 10.6 控件

`createControls()`（`src/sketch.js:140-166`）用 p5 的 DOM API 建：

- `.controls` 容器（固定左上角，`pointer-events: none`，只有按钮能点，见 `css/style.css:59-70`）；
- `.scale-label`：显示 `C · Ionian`；
- `.controls-row`：播放/暂停按钮（内联 SVG 图标，按钮就是图标）、Pad 百分比、Bell 百分比；
- `.status-label`：摄像头/模型的状态文字（空内容时 CSS 隐藏）。

百分比是“平滑后的张开度 × 100”，手不在画面里时加 `.absent` 类变淡（`src/sketch.js:173-177`）。

---

## 11. 性能与稳定性上的取舍

| 取舍 | 代码位置 | 好处 |
| --- | --- | --- |
| 检测回调只写目标值，绘制时统一平滑 | `src/gestureMapper.js:69-109` | 检测频率和渲染频率解耦；不会一帧内触发多次声音 |
| 指数平滑用 `deltaTime` | `src/gestureMapper.js:97` | 不同刷新率下手感一致 |
| Pad/Bell 声部固定池化；和弦池只建一次 | `src/audioEngine.js:41-68`、`144-165`、`74-76` | 避免 GC 卡顿、避免音频图膨胀 |
| 没有每帧概率，只在“到点”时决策 | `src/generativeEngine.js:85-104`、`src/harmonicEngine.js:270-300` | 帧率不影响节奏；卡顿后不会补发一串音符 |
| 等待 deadline 从起点重算而非从“现在” | `src/generativeEngine.js:32-36` | 手半闭时不会“永远 wait”、“永不发声” |
| 墙钟 + 音频时钟双检查 | `src/audioEngine.js:193-197` | 标签页休眠/音频上下文挂起后不会在错误时刻换音 |
| `pendingRequest` 身份对象 | `src/audioEngine.js:185-204` | 过期回调不会误触发（取消/重复抢占都安全） |
| 颗粒贴图预生成 | `src/visuals.js:85-118` | 视觉质感几乎零 CPU 成本 |
| 和弦声部池懒加载 | `src/audioEngine.js:74-76` | 默认 random 模式不创建额外节点，音频图与拆分前完全一致 |
| 字体先加载再建画布 | `src/sketch.js:35-38` | 避免先渲染系统字体再跳变 |
| 左右手分别取最高置信度 | `src/gestureMapper.js:71-77` | 有人误入镜头时不会两只手抢同一个角色 |
| 页面隐藏时暂停音频 | `src/sketch.js:67-69` | 切标签页不会继续响 |

---

## 12. 验证方法

### 12.1 四个 Node 检查（本次会话已实际运行，全部 exit 0）

```sh
node work/bell-timing-check.mjs
node work/continuous-bell-check.mjs
node work/harmony-check.mjs
node work/module-check.mjs
```

| 命令 | 覆盖什么 | 输出 |
| --- | --- | --- |
| `bell-timing-check.mjs` | 两个生成器的 Bell 速度：越合越慢且单调、deadline 永远有限（NaN 回归）、等待中改变开合度不重掷骰子、握拳/丢手静音、暂停恢复不补发、声部忙时不消耗音符、Pad 与和声选音代码与快照一致 | `result: "PASS"` + 每种开合度的音符数/间隔统计 |
| `continuous-bell-check.mjs` | 乐句边界用普通间隔（没有额外休止）、全开手不会随机跳过乐句、握拳取消排队音、固定声部池在快速输入下保持连续、音频图不增长、音频时钟检查 | `result: "PASS"` + 声部池统计 |
| `harmony-check.mjs` | 六个调式的和弦库（都在调内、有纯五度、无减和弦、每个音级都可被覆盖）、选和弦/配声始终包含手音、10 分钟模拟（确定性、和弦最小时长、经过音解决、乐句不结束在经过音）、真实音频引擎的和弦池行为（懒加载、共同音保持、不抢释音声部、暂停后复用） | `result: "PASS"` + 和弦库/密度/乐句统计 |
| `module-check.mjs` | 拆分后的模块与“拆分前单文件快照”的等价性：所有配置常量、六调式音高换算、手势识别/平滑/失手/cover 映射、1000 帧 Pad 调度、音频节点连线的参数与顺序、摄像头/模型就绪顺序、`index.html` 入口与 8 个模块是否齐全 | `result: "PASS"` + 6 条检查说明 |

> 说明：`module-check.mjs` 的参照物 `work/sketch-before-modules.js` 是拆分前的历史快照。快照之后项目**有意调整过 5 个值**（Bell 衰减 1.9→3.9s、Pad 音量 0.16→0.36、Pad hold 1100→1000ms、颗粒换图 3→9 帧、Bell 混响湿声 0.64→0.84，最后一项在旧文件里是字面量）。脚本会把这 5 个值同步成当前值再做对比，注释写在 `work/module-check.mjs:12-26`，这样既能继续验证“拆分本身没有改变其他行为”，又不会因为后期调音而误报。

### 12.2 浏览器 fixture（无需摄像头权限）

```sh
python -m http.server 8000 --bind 127.0.0.1
# 打开 http://127.0.0.1:8000/work/modular-browser-check.html
```

`work/modular-browser-check.html` 用“假摄像头 + 假手部模型”替换浏览器的真实 API，**加载的是未修改的生产代码**（`/src/sketch.js` 及其导入的全部 7 个模块）。页面右下角三个按钮可以切到“握拳 / 隐藏手 / 张开手”，`#module-check` 元素会持续输出 JSON：

- 画布数量、摄像头回调次数、检测循环次数；
- 两个百分比读数与 `absent` 状态；
- 播放按钮的 aria-label；
- p5 逻辑尺寸 vs 视口尺寸、缩放钩子是否存在；
- Pad/Bell 的触发次数、混响峰值；
- 字体加载状态。

用于确认“模块在浏览器里能真正连起来、音频节点真的产生声音、UI 状态会跟着手变”这三件事。（该页面必须通过 HTTP 打开，因为它用的是 `/css/...`、`/src/...` 绝对路径。）

### 12.3 `work/` 里的其他文件

`work/` 里其余文件是开发过程的历史产物，**不被应用加载**：

| 文件 | 说明 |
| --- | --- |
| `sketch-before-modules.js`、`index-before-modules.html` | 拆分前单文件版本（`module-check.mjs` 的参照物） |
| `generative-before-bell-speed.js`、`harmonic-before-bell-speed.js` | Bell 速度改造前的版本（`bell-timing-check.mjs` 用来确认 Pad/选音代码没被改动） |
| `pad-check.cjs` | 拆分前针对根目录 `sketch.js` 的旧检查；该文件已不存在，**现在不能运行** |
| `bell-speed-browser-check.html`、`pad-audio-check.html`、`font-rendering-check.html` | 早期浏览器 fixture / 字体对比页 |
| `*-preview.png`、`24-zones-preview.png` 等 | 开发时的截图 |

---

## 13. 常见问题排查

**画面是灰底、没有摄像头画面**

- 没允许摄像头权限，或摄像头被其他程序占用。看左上角状态文字：10 秒内没起来会显示 `Camera unavailable`（`src/handTracker.js:21-23`）。

**有画面但手没有圈、也没声音**

- 状态栏出现 `Hand tracking unavailable`：ml5 模型加载失败。首次运行需要联网从 CDN 下载模型；断网/被拦截就会失败（`src/handTracker.js:30-48`）。
- 控制台报 `Unable to load the hand model` 也是同一原因。

**有圈但没声音**

- 没点左上角 ▶。浏览器要求用户手势后才允许音频。
- 或者点了但报 `Audio could not start`（看控制台 `Unable to start audio`）。
- 标签页在后台时音频会被自动暂停（`src/sketch.js:67-69`），回到前台需要再点一次 ▶。

**左右手反了 / 明明伸右手却亮左手**

- 把 `SWAP_HANDS` 改成 `true`（`src/gestureMapper.js:4`）。

**音符太密 / 太稀**

- 见第 8 节的“想调快/调慢”。默认全开手约 10 音/秒，是偏密的；把 `BELL_OPEN_MIN_GAP_MS` 调到 60–80 会更舒展。

**Pad 一直停在一个和弦上不换**

- 和弦最快 1000ms 换一次（`PAD_MIN_CHORD_MS`）；且手停在同一个音区时，`chooseChord` 会更倾向于保持当前和弦（`STAY_WEIGHT = 3`）。把手移到别的音区即可。

**想听两个生成器的差别**

- `?generator=random` 和 `?generator=harmony` 来回切，不用改代码。

**调试**

```js
// 浏览器控制台
window.quietReply.generator                 // 当前生成器名
window.quietReply.generative.harmony?.chord // 当前和弦（只有 harmony 模式有）
```

**`file://` 打开一片空白**

- ES module 和摄像头都需要 HTTP/HTTPS，用第 1 节的本地服务器。

---

## 14. 调参地图

| 想改 | 文件:行 | 常量 / 位置 |
| --- | --- | --- |
| 调式 | `src/sketch.js:11` | `Current_Scale` |
| 哪只手控制哪个乐器 | `src/sketch.js:12-13` | `PAD_HAND` / `BELL_HAND` |
| 默认生成器 | `src/sketch.js:16` | `GENERATOR` |
| 音域 / 起始音 | `src/musicTheory.js:15-16` | `BASE_MIDI` / `START_DEGREE` |
| 音区布局 | `src/musicTheory.js:12-13` | `ZONE_COLUMNS` / `ZONE_ROWS` |
| 握拳/张开的判定阈值 | `src/gestureMapper.js:5-6` | `FIST_RATIO` / `OPEN_RATIO` |
| 平滑手感 | `src/gestureMapper.js:7-8` | `HAND_SMOOTH_MS` / `HAND_LOST_MS` |
| Bell 速度 | `src/generativeEngine.js:5-8` | `BELL_OPEN_MIN/MAX_GAP_MS`、`BELL_GAP_CLOSED_SCALE`、`BELL_FIST_THRESHOLD` |
| 随机生成器的 Pad 节奏/音高权重 | `src/generativeEngine.js:11-19` | `PAD_MIN/MAX_HOLD_MS`、`NOTE_CHOICES` |
| 和弦库/选和弦偏好 | `src/harmonicEngine.js:17-27` | `CHORD_SHAPES`、`ROOT_WEIGHTS`、`ROLE_WEIGHTS`、`STAY/COLOR_WEIGHT` |
| 和弦节奏 | `src/harmonicEngine.js:30-37` | `PAD_CHORD_MIN/MAX_HOLD_MS`、`PAD_REST_*`、`PAD_MIN_CHORD_MS`、`PAD_RETRY_MS` |
| Bell 乐句 | `src/harmonicEngine.js:40-51` | `BELL_PHRASE_MIN/MAX_NOTES`、`BELL_NOTE_GAPS`、`BELL_GAP_JITTER`、`MELODY_RANGE`、`PASSING_TONE_CHANCE`、`ENDING_ROOT_WEIGHT` |
| Pad/Bell 音色 | `src/audioEngine.js:4-27` | 包络、音量、泛音、混响、滤波器、声部数 |
| 画面颜色 | `src/visuals.js:10-13` | `ZONE_TINT_A/B`、`PAD_COLOR`、`BELL_COLOR` |
| 摄像头滤镜 | `src/visuals.js:4-5` | `CAMERA_FILTER`、`CAMERA_WASH` |
| 颗粒噪点 | `src/visuals.js:6-9` | `GRAIN_AMOUNT`、`GRAIN_TILE_SIZE`、`GRAIN_FRAMES_PER_TILE` |
| 控件样式 | `css/style.css` | `.controls`、`.readout.*`、`.icon-toggle` |

改完声音参数后，先跑一次 `node work/harmony-check.mjs` 和 `node work/continuous-bell-check.mjs`，能覆盖大部分音频/调度回归。

---

## 15. 文档与代码的一致性

本节记录“读代码时发现文档/注释与实际行为不一致”的地方，以及处理方式。**以下数值都以代码为准**。

### 15.1 已修正（不影响声音，只影响可读性/可验证性）

| 位置 | 原来写的 | 代码实际 | 处理 |
| --- | --- | --- | --- |
| `src/generativeEngine.js:4` | 手合拢时间隔“趋向 3 倍” | `BELL_GAP_CLOSED_SCALE = 5`，是 5 倍 | 注释改为 5x |
| `src/audioEngine.js:176` | Bell 尾音“1.9 秒” | `BELL_DECAY = 3.9` 秒 | 注释改为 3.9 秒 |
| `index.html:17` | “导入另外六个模块” | `src/sketch.js` 导入另外 7 个 | 注释改为 7 个 |
| `work/bell-timing-check.mjs:16-19` | 期望 `bellGapScale(.5)=2`、`(0)=3` | 实际 `3`、`5` | 改为从 `BELL_GAP_CLOSED_SCALE` 推导，不再写死 |
| `work/module-check.mjs` | 直接对比历史快照，遇到后期调音就报错 | 5 个参数已被有意调整 | 在脚本里显式同步这 5 个值（带注释），其余行为继续严格对比 |

### 15.2 英文 README 同步修正

`README.md` 的“Bell speed / Local verification”两节已按当前代码改写：补上了抖动与夹取的实际效果，并注明四个 Node 检查当前全部通过、`module-check` 会同步 5 个后期调音值。

### 15.3 仍然值得知道的两处“代码行为与直觉不同”

1. **`BELL_GAP_JITTER = 0.96` 不是 ±12%**（`src/harmonicEngine.js:47`）。它是乘 `random(0.04, 1.96)` 再夹到 30–190ms，所以实际是 **±96%**（近似“宽范围抖动”），这也是第 8 节实测中 40% 的音落在两个极端上的原因。如果本意是“轻微 ±12%”，应改成 `0.12`——节奏会明显更均匀，听感更规整。代码按现在的方式运行，注释已改成“乘 0.04–1.96 再夹取”。
2. **`PAD_TRIANGLE_LEVEL = 0.0001` 等于三角波不可闻**（`src/audioEngine.js:20`）。三角波振幅 = 0.36 × 0.0001 = 0.000036，实际只起“万一正弦被某种处理削掉时仍有极弱底噪”的作用。若希望三角波真正参与音色，把它调到 0.05–0.15 这类量级。

这两处都保留为“记录在案”的状态：README 描述当前真实行为，想改就按上面的说明改。

---

## 附：一句话总结

**摄像头 → ml5 关键点 → 掌心/张开度 → 屏幕坐标 → 24 个音区（G2–B5，音阶级数）→ 两个独立计时器（random 或 harmony）→ 固定声部池的 Pad/Bell 合成 → 镜像摄像头 + 网格 + 颗粒的画面。** 改音色看 `audioEngine.js`，改节奏看 `generativeEngine.js`，改和声看 `harmonicEngine.js`，改画面看 `visuals.js`。
