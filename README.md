# 饭小圈 · 微信小程序

> 快速决定吃什么 + 看附近人吃什么。

一个可直接导入微信开发者工具的原生微信小程序（非离线 HTML 原型，无跨端框架），产品结构与交互路径均已落地，数据接入**微信云开发**（云数据库 + 云函数），多用户真实互通。

<p>
<img alt="platform" src="https://img.shields.io/badge/platform-%E5%BE%AE%E4%BF%A1%E5%B0%8F%E7%A8%8B%E5%BA%8F-07C160">
<img alt="framework" src="https://img.shields.io/badge/framework-%E5%8E%9F%E7%94%9F%20WXML%2FWXSS-FF6B35">
<img alt="backend" src="https://img.shields.io/badge/backend-%E5%BE%AE%E4%BF%A1%E4%BA%91%E5%BC%80%E5%8F%91-2E6BE6">
<img alt="db" src="https://img.shields.io/badge/database-%E4%BA%91%E6%95%B0%E6%8D%AE%E5%BA%93%2014%20%E9%9B%86%E5%90%88-73B84B">
<img alt="libVersion" src="https://img.shields.io/badge/%E5%9F%BA%E7%A1%80%E5%BA%93-3.17.1-E8432E">
<img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
</p>

---

## 目录

- [产品概览](#产品概览)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [云开发配置](#云开发配置)
- [云函数接口一览](#云函数接口一览)
- [数据模型](#数据模型)
- [功能详解](#功能详解)
- [设计规范](#设计规范)
- [文档索引](#文档索引)
- [上线前检查清单](#上线前检查清单)
- [已知限制](#已知限制)

---

## 产品概览

| 主导航 | 说明 |
| --- | --- |
| **饭小圈** | 三子视图容器：饭小圈（全部晒吃流）/ 附近（50km 内）/ 大厨TV（做饭教程） |
| **决定** | 大锅转盘（30 选 1，每盘自动换批）+ 蒸笼盲盒，结果支持复制 / 收藏 / 去点外卖 |
| **我的** | 等级与经验、徽章墙、收藏、最近决定、兑换码、消息入口、更多（反馈 / 打赏） |

核心闭环：**决定吃什么 → 去点外卖（复制菜名）→ 晒吃 → 点赞评论拿经验 → 升级解锁徽章 → 看附近人吃什么 → 互关私信**。

- **12 个页面**、**7 个自定义组件**、**1 个云函数**、**14 个云数据库集合**
- **104 个源码文件 / 约 12,600 行**（不含图片与设计稿）
- 等级系统 0~10 级、**16 枚成就徽章**、每日发帖上限、兑换码、意见反馈（含邮件通知）、打赏（信任制 + 纪念徽章）

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | 微信小程序原生框架（WXML / WXSS / JS），自定义组件 + 自定义 tabBar |
| 图形 | Canvas 2D（转盘 / 离屏画布换盘动画）、CSS 绘制（蒸笼、蒸汽、进度光环） |
| 后端 | 微信云开发：云函数 `cloudfunctions/api`（1805 行，单函数多 action 分发） |
| 数据库 | 云数据库 14 个集合，`_.inc` / `_.addToSet` 原子操作保证并发正确性 |
| 对象存储 | 阿里云 OSS 直传（POST policy 客户端签名，`utils/oss.js` 纯 JS 实现 HMAC-SHA1） |
| 邮件 | nodemailer + SMTP（反馈通知，环境变量配置，缺失时自动跳过） |
| 定位 | `utils/location.js` 统一封装（gcj02、缓存 TTL 15min、会话频率保护、腾讯位置服务逆编码） |
| 工具链 | 纯 Node 脚本（tabBar 图标生成 / 校验、`Foods.md` → 菜品图映射生成） |

---

## 目录结构

```
fanxiaoquan/
├── app.js / app.json / app.wxss      # 小程序入口、页面与 tabBar 注册、全局设计令牌
├── project.config.json               # 开发者工具项目配置（cloudfunctionRoot 已指向 cloudfunctions/）
├── sitemap.json
├── pages/                            # 12 个页面
│   ├── feed/                         # 饭小圈：饭小圈 / 附近 / 大厨TV 三子视图 + 检索
│   ├── decide/                       # 决定：大锅转盘 + 蒸笼盲盒
│   ├── profile/                      # 我的：等级、徽章墙、收藏、最近决定、兑换码
│   ├── user/                         # 用户主页：作品 / 关注 / 粉丝
│   ├── messages/ · chat/             # 会话列表 + 互关私信
│   ├── feedback/ · feedback-list/ · feedback-detail/   # 意见反馈提交 / 列表 / 详情
│   ├── more/ · reward/               # 更多入口、打赏开发者
│   └── docs/                         # 项目经理视角（产品说明页）
├── components/                       # 7 个自定义组件
│   ├── login-panel/                  # 登录面板（头像昵称填写能力）
│   ├── order-hint/                   # 外卖提示层（L1 复制菜名 → 模拟平台搜索页）
│   ├── redeem-code/                  # 兑换码卡片
│   └── badge-coin / badge-modal / badge-toast / badge-all   # 徽章圆盘 / 详情 / 解锁提示 / 徽章墙
├── custom-tab-bar/                   # 悬浮胶囊 Dock（方案 B）
├── utils/
│   ├── api.js                        # 云数据层，一页一函数，全部返回 Promise
│   ├── mock.js                       # 静态菜品目录（10 分类 × 8 菜 = 80 道菜 + 转盘配色 + 采样）
│   ├── level.js                      # 等级曲线 0~10 级 + 称号
│   ├── badges.js                     # 16 枚徽章定义 + 头像框权益计算
│   ├── location.js                   # 定位统一封装（授权链 / 缓存 / 频控 / 逆编码）
│   ├── oss.js                        # 阿里云 OSS 直传（POST policy 签名）
│   ├── dishes-img.js                 # 200 道菜 → OSS 图片 URL 映射（脚本生成）
│   ├── feedback.js / util.js
├── cloudfunctions/api/               # 云函数：全部业务读写 + 经验/徽章/校验
│   ├── index.js · config.json · package.json
├── images/                           # 品牌图 / tabBar 图标 / 打赏码
├── UI/                               # 设计文档、规格、可交互 HTML 原型、图标源文件（不参与打包）
├── tools/                            # 纯 Node 工具脚本 + 历史遗留图（不参与打包）
├── REDEEM_CODES.md                   # 初始兑换码（固定值，与云函数 SEED_CODES 一致）
├── LICENSE · .gitignore
└── README.md
```

> `UI/` 与 `tools/` 已在 `project.config.json` 的 `packOptions.ignore` 中排除，不影响小程序包体积。

---

## 快速开始

1. 打开**微信开发者工具**（建议稳定版，基础库 3.17.1）
2. 「导入项目」→ 项目目录选择本仓库根目录
3. AppID 填自己的小程序 AppID（仓库内为占位 AppID；游客/测试号不支持配置合法域名，真机预览请用正式 AppID）
4. 开通并部署云开发（见下节），然后编译运行

首次启动会自动创建 14 个集合、播种兑换码，并清理历史遗留的演示种子帖（饭小圈初始为空，由用户自己晒吃）。

**验证多用户互通**：用模拟器 + 真机预览各登录一个账号，发帖 / 点赞后互相可见。

---

## 云开发配置

1. 开发者工具顶部「云开发」→ 开通环境
2. （可选）`utils/api.js` 顶部 `ENV_ID` 填云开发环境 ID（只有一个环境可留空）
3. 资源管理器 → `cloudfunctions/api` → 右键 → **「上传并部署：云端安装依赖」**（含 `wx-server-sdk`、`nodemailer`）
4. 重新编译运行

**可选环境变量**（云开发控制台 → 云函数 `api` → 配置 → 环境变量）：

| 变量 | 用途 |
| --- | --- |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_TO` | 反馈通知邮件（SMTP）；未配置时自动跳过，不影响落库 |

**图片上传（阿里云 OSS）**：在 `utils/oss.js` 顶部 `OSS_CONFIG` 填写 `accessKeyId` / `accessKeySecret`。

> ⚠️ **本仓库已脱敏**：`OSS_CONFIG.accessKeyId` / `accessKeySecret` 已置空，请勿把真实 AK/SK 提交到公开仓库。正式环境请改用 STS 临时凭证——`getCredentials()` 已留好替换钩子，从自己的服务端换取凭证即可，上传流程不变。

`region` / `bucket` / `baseUrl` / `folder` 已按现有地址预填（`oss-cn-beijing` / `fanxiaoquan`）。

---

## 云函数接口一览

所有业务读写集中在单个云函数 `cloudfunctions/api`，通过 `event.action` 分发（约 60 个动作）：

| 模块 | 动作 |
| --- | --- |
| 帖子 | `posts.list` `posts.add` `posts.delete` `posts.like` `posts.todayCount` `posts.mine` `nearby.list` `search` |
| 评论 | `comments.list` `comments.add` |
| 大厨TV | `cooks.list` `cooks.add` `cooks.like` `cooks_comments.list` `cooks_comments.add` |
| 收藏 / 历史 | `favorites.list` `favorites.toggle` `favorites.check` `history.list` `history.add` `history.clear` |
| 用户 | `user.get` `user.set` `user.stats` |
| 社交 | `follow.toggle` `follow.status` `follow.list` `follow.fans` `user.profile` `user.works` |
| 私信 | `messages.list` `messages.send` `messages.read` `conversations.unread` |
| 隐藏（踩） | `hides.add` `hides.list` |
| 兑换码 | `codes.list` `codes.redeem` `reward.claim` `seed` |
| 反馈 | `feedback.add` `feedback.list` `feedback.detail` |
| 徽章 / 经验 | `checkBadgeUnlocks`（内部）、`addExp`（内部） |

---

## 数据模型

云数据库 14 个集合（云函数 `COLLECTIONS` 首次启动自动创建）：

| 集合 | 关键字段 |
| --- | --- |
| `posts` | `openid` `nick` `avatar` `dish` `category` `images` `likes` `likedBy` `lat/lng` `createTime` |
| `comments` | `postId` `openid` `content` `createTime` |
| `cooks` / `cooks_comments` | 大厨TV 教程（一条最多 9 图）与评论 |
| `users` | `_id=openid` `nick` `avatar` `exp` `totalLikes` `badges` `platform` `lat/lng` `address` `rewardCode` |
| `favorites` / `history` | 收藏菜品、决定历史（含盲盒来源） |
| `hides` | `_id = openid:postId`，踩（永久隐藏） |
| `follows` | `followOpenid` `followeeOpenid` 关注关系 |
| `messages` / `conversations` | `threadKey = [双方openid].sort().join(':')`，未读数 `unreadA/unreadB` |
| `codes` / `redeems` | 兑换码（普通 / 徽章码）+ 兑换去重记录 `_id = openid:code` |
| `feedbacks` | 反馈类型、内容、附图、联系方式、状态与客服回复 |

集合按需建索引建议：`posts.createTime`、`comments.postId`、`follows.followOpenid`、`messages.threadKey`。

---

## 功能详解

### 页面结构

TabBar 为 3 个 tab；「饭小圈」页内分为 **3 个子视图**（顶部子 tab 条切换）：

| 子视图 | 说明 |
| --- | --- |
| 饭小圈 | 全部晒吃流：点赞、评论、复制菜名（L1 提示层）、发帖（每日上限 3 条） |
| 附近 | 以我的定位为中心，展示 **50km 内**大家的晒吃（需位置权限，无发帖入口） |
| 大厨TV | 发表做饭教程/经历，**一条最多 9 张图**；点赞评论与饭小圈同一套经验规则 |

| 页面 | 说明 |
| --- | --- |
| pages/feed 饭小圈 | 三子视图容器（饭小圈 / 附近 / 大厨TV）；帖子/评论/教程头像可点进作者主页 |
| pages/decide 决定 | 转转盘（可剔除不想吃的分类）+ 开盲盒；结果弹层支持复制 / 收藏 / 去点外卖 |
| pages/profile 我的 | 等级（经验进度条）、我的主页入口、消息入口（未读红点）、默认外卖平台偏好、收藏、最近决定（默认折叠近 10 条可展开）、兑换码（`components/redeem-code`） |
| pages/user 用户主页 | 头像昵称等级称号、关注/粉丝/作品三计数、关注按钮状态矩阵、作品·关注·粉丝三 tab（作品聚合晒吃帖+教程） |
| pages/messages 消息 | 会话列表（按最后消息倒序，未读红点数字），入口在「我的」页 |
| pages/chat 聊天 | 互关私信：仅互相关注可发、单条 ≤500 字、进入会话清未读、5s 轮询新消息 |

### 定位与附近（V2 统一封装，按 `UI/定位与地址获取设计方案.md` V0.1 实现）

- **统一封装 `utils/location.js`**：`ensureLocation({refresh})` —— 坐标系 **gcj02**、高精度 5s 超时自动降级普通定位、缓存 `fxq_loc` TTL 15 分钟、会话频率保护 60s（规避 2.17.0 频率限制）、授权链（未询问 `wx.authorize` / 已拒绝返回 `DENIED` 由页面按钮引导 `wx.openSetting`）、逆地理编码（腾讯位置服务，`LOC_KEY` 配置后生效）、定位成功自动上报 `users.lat/lng/address`
- **登录时获取定位**：登录面板确认后自动 `ensureLocation()`，经纬度存 users 文档（`lat`/`lng`）；用户拒绝不阻塞登录
- **附近页地址文案**：进入附近 tab 显示「📍 当前定位：xx市 · xx区」+ 刷新按钮（强制重定位，走频率保护）；无逆编码结果显示"当前位置"；已拒绝授权显示现有引导卡（"开启定位"→ `wx.openSetting`，开启后自动重试）
- 发帖时把发帖人的位置写入帖子；帖子/教程卡片上的距离按查看者定位实时计算（Haversine，<1km 显示米、≥1km 显示 x.xkm）
- **附近 50km**：`nearby.list` 云函数以查看者定位为中心过滤 ≤50km 的帖子；云函数端零改动（仍读 `users.lat/lng`，`needLocation` 兜底）
- 云函数 `user.set` / `user.get` 新增可空字段 `address` / `addressTs`（老用户兼容）
- 旧帖子（无经纬度）不会出现在「附近」里
- app.json 已声明 `permission.scope.userLocation`（开发者工具需在「详情 → 本地设置」勾选不校验合法域名等）
- **上线前合规**：小程序后台「开发管理 → 接口设置」开通 `getLocation`（需对应类目，未开通提审拦截）；隐私保护指引声明"位置信息"收集用途；配置 `request` 合法域名 `https://apis.map.qq.com`（逆编码，key 提供后生效）

### 数据与交互

- **已接入微信云开发，用户之间互通**：帖子（含点赞）、评论、教程（大厨TV）、收藏、决定历史、登录用户、外卖平台偏好、定位、经验等级都存云数据库（经 `cloudfunctions/api` 云函数读写），任何人的帖子/点赞/评论/收藏/教程都实时共享
- `utils/mock.js`：本地静态菜品目录（分类 / 80 道菜及专属 emoji / 转盘配色 / 采样逻辑），不随用户变化
- `utils/level.js`：等级曲线配置（0~10 级，升级所需经验逐级增加）+ 等级计算函数；云函数内有同步副本（无法 require 包外文件）
- `utils/api.js`：云数据层，函数名与页面调用一一对应，全部返回 Promise
- 决定页转盘：**每盘 30 道菜、30 选 1**（10 分类 × 8 菜 = 80 道菜候选池随机抽 30），**每次打开页面自动换一批**，页内还有「换一批」按钮；剔除的分类不会出现在盘面上
- 换一批按钮居中转盘下方居中，点击有缩小弹大 + ↻ 旋转的动画；换盘为**滑入滑出**：旧盘面向左滑出屏幕左缘、新盘面从右侧滑入居中，两盘共用同一根缓动曲线同时运动（600ms easeInOutQuart），全程连贯
- **每次转完自动换一批**：结果弹层出现约 0.6s 后盘面自动滑入新一批（同款动画，弹层半透明可见）；期间用户手动换批或再次转动会取消/跳过这次自动刷新，不会与进行中的动画打架
- 换盘动画用离屏画布（`wx.createOffscreenCanvas`，基础库 2.16.1+）快照新旧盘面后逐帧平移绘制；不支持离屏画布时自动退回直接重绘
- 发帖：分类**可选**（不选显示「未分类」）；帖子头像和昵称取登录用户的微信授权信息，未登录用兜底表情

### 等级系统（0~10 级）

- 经验来源：

| 行为 | 经验 | 获得者 | 每日上限 |
| --- | --- | --- | --- |
| 发晒吃帖 / 发大厨TV教程 | +10 | 发布者 | 晒吃帖每天 3 条（见下节）；教程不限 |
| 点赞（行为） | +1 | 点赞者本人（自己点自己不给自己加） | 前 10 次 |
| 获得点赞 | +2 | 帖子作者（取消点赞 -2 对冲，含自己点自己，单账号可测试） | 不限 |
| 评论（行为） | +1 | 评论者本人 | 前 10 次 |
| 被评论 | +1 | 帖子作者 | 不限 |

- 每日点赞/评论额度按自然日（本地日期）计算，取消点赞**不返还**当日额度
- 升级曲线：升到每一级所需累计经验为 0 / 30 / 90 / 180 / 300 / 450 / 630 / 840 / 1080 / 1350 / 1650（每升一级比上一级多 30），满级 10 级
- 等级展示：「我的」页有等级徽章 + 经验进度条；饭小圈每条帖子的昵称旁有 Lv 徽章（等级越高颜色越深）
- 经验到账可靠性的关键：云函数 `addExp` **先确保用户文档存在再原子自增**（云开发对不存在文档的 update 是静默跳过，直接 update 会丢经验）
- 等级阈值配置在 `utils/level.js`，云函数 `cloudfunctions/api/index.js` 的 `LEVEL_THRESHOLDS` 需同步
- 经验到账的展示保障：「我的」页经验/等级单独拉取即时刷新，不再被收藏/历史/帖子任一接口偶发失败拖垮整页（之前 Promise.all 一锅端，列表接口失败时经验"看着不到账"）；云函数超时已调到 10s（config.json），发经验前最多 6 次 DB 操作的链路冷启动不会超时
- 每日点赞/评论额度按**北京时间**自然日计算（云函数在 UTC 时区，已做 +8h 校正，否则额度在早上 8 点才重置）

### 成就徽章系统（16 枚，详见 UI/成就徽章设计文档.md）

- **16 枚徽章**：创作（初来乍到/干饭达人/饕餮/大厨之星/美食作家/快门美食家）、互动（暖心点赞/金口玉言/人气王）、探索（品味收藏家/饭桌锦鲤/锦鲤附体）、荣誉（兑换收藏家/满级传说）、特殊（开发者/打赏开发者）
- **图标**：手工 SVG（暖金描边 + 主题色渐变 + 浮雕高光），base64 data URI 直供 `<image>`，零外部依赖；稀有度外环（普通灰蓝/稀有葱绿/史诗紫晶/传说金穗/特殊虹彩）
- **视觉**（严格按设计文档「设计须知」）：正圆双层金边 #D4AF37、径向渐变底（圆心亮边缘暗）、图标留 8% 金边距、流光扫光（3s/圈 + 0.2s 停顿，层级在图标上、金边下）；未解锁整盘灰显带锁
- **解锁**：行为后云函数 `checkBadgeUnlocks` 检查进度并 `_.addToSet` 原子补录（幂等），动作返回 `newBadges`，前端弹「恭喜解锁」弹层
- **进度**：`users.badges` 存解锁记录；`totalLikes` 为累计点赞冗余计数（暖心点赞进度，取消点赞回退；与每日经验计数 `likeCount` 区分）
- **展示位**：帖子昵称行 / 用户主页**仅展示已拥有的徽章**（目录顺序前 5 枚，点击展开全部徽章面板，面板内可看单枚详情）；「我的」页等级卡下 5 列徽章墙默认折叠一行，可「展开全部 / 收起」（仿「最近决定」卡片，含进度条详情）
- **头像框权益**（纯荣誉）：拥有任一传说徽章 → 头像**金框**；拥有开发者徽章或集齐 15/15 → 头像**虹彩框**（帖子头像 / 用户主页 / 「我的」页三处展示，`utils/badges.js` 的 `avatarRingOf` 计算）
- **通用组件**：`components/badge-coin`（徽章圆盘，全站复用）、`badge-modal`（详情弹层）、`badge-toast`（解锁提示）
- **开发者徽章**：专用兑换码兑换获得（★ 隐藏途径：码值与获取途径均不在小程序内展示）；码值配置于 `cloudfunctions/api/index.js` 的 `DEV_BADGE_CODES`，随 `seed` 幂等入库（带 `badge` 标记、单次使用），`codes.list` 已过滤带标记码不展示，`codes.redeem` 步骤 4 附赠徽章
- **同步维护**：云函数 `BADGES` 与 `utils/badges.js` 的 key/name/rarity/type/target 必须一致（云函数无法 require 包外文件）

### 每日发帖上限（3 条/天）

- 每个用户每天最多发 **3 条**晒吃帖（按 openid + 当天 0 点后计数，云端强制校验，跨端作弊无效）
- 每次发布成功 toast 提醒剩余可发条数；发满 3 条后「晒吃」按钮变灰，点击提示「今日已经分享很多啦！明天再分享吧~」
- 今日剩余次数在进入饭小圈页时从 `posts.todayCount` 拉取

### 兑换码（每个码限用 100 次，兑换得经验）

- 首次启动（`seed`）自动初始化 **3 个兑换码**（`codes` 集合为空时创建），每个码 **+30 经验、最多 100 次**（`CODE_MAX_USES` / `CODE_EXP` 在云函数顶部可调）
- **兑换码具体数值见项目根目录 `REDEEM_CODES.md`**（固定值，与云函数 `SEED_CODES` 一致）；小程序界面只提供兑换输入框，不回显兑换码与剩余次数
- 兑换入口在「我的」页：输入兑换码（不区分大小写）→ 兑换，成功立即 +30 经验并刷新等级
- 规则与防刷：
  - 每个账号每个码**只能兑换一次**（`redeems` 集合 `_id = openid:code` 原子去重）
  - 次数扣减用「条件更新」`usedCount < 100` 才成功，另加回读兜底，并发下也不会超发
  - 兑换码不存在 / 已使用完 / 已兑换过，各有明确提示
- 次数用尽后可在云开发控制台把 `codes` 对应文档 `usedCount` 重置为 0（或删除文档由 seed 重建）

### 踩（不感兴趣，隐藏帖子）

- 饭小圈 / 附近帖子卡片上的 💔 圆钮：**默认中心白色裂心，点击后裂心变灰**，请求成功后该帖子对该用户**永久隐藏**（`hides` 集合按 `openid:postId` 存储，帖子在 `posts.list` / `nearby.list` 云端过滤，换设备/重进不复发）
- 只影响本人，不影响帖子作者和其它用户；不可恢复（无取消入口）
- 大厨TV 教程暂不支持踩（按需求仅限饭小圈）

### 删除自己发布的帖子

- 自己发的晒吃帖（饭小圈 / 附近）卡片右侧有「删除」按钮：二次确认后删除，**不可恢复**
- 云端 `posts.delete` 校验 openid 归属，只能删自己的；连带删除该帖的评论与踩记录

### 社交功能（V1 关注/主页 + V2 互关私信）

按 `UI/社交功能设计文档.md` 实现（所有 [待确认] 项采用文档默认值）。

**V1 关注与主页（F1-F7）**

- **头像入口**：饭小圈帖子 / 帖子评论 / 大厨TV教程 / 教程评论的头像都可点进作者主页；种子帖（系统推荐，无作者）点击提示「暂无主页」
- **用户主页**（`pages/user`）：任意头像进入 `user?userId=xxx`，无参 = 自己的主页；展示头像、昵称、Lv 徽章（9+ 虹彩 / 6-8 金 / 3-5 银 / 0-2 陶土）、称号与 tagline、关注/粉丝/作品三计数（实时计数）
- **关注状态矩阵**：自己=编辑资料占位；对方=＋关注 / 已关注（灰）/ ＋回关（对方关注我）/ 互相关注（描边）；「发消息」按钮仅在互相关注时可点；取关有二次确认，按钮防抖幂等
- **作品聚合**：晒吃帖 + 大厨TV教程按时间倒序合并（每页 10 条，触底加载）；卡片内可直接点赞（复用现有动作）、删除自己的晒吃帖；主页不展示经验数字
- **关注/粉丝列表**：分页 20 条，显示昵称、Lv、互相关注标记；列表项可点进对方主页；列表中不提供直接取关
- **未登录**：可浏览主页；关注/发消息先弹登录面板

**V2 互关私信（F8-F10）**

- **会话**：`conversations` 集合以 `threadKey = [双方openid].sort().join(':')` 为 _id，双方互关才会创建会话；会话列表按最后消息倒序，未读红点数字
- **聊天页**：仅互相关注可发消息（**服务端二次校验**，防客户端绕过）；单条 ≤500 字带字数统计；进入会话自动清空我方未读；demo 级实时性（5s 轮询，无长连接）
- **未读红点**：「我的」页消息入口显示未读总数（>99 显示 99+）；会话列表逐会话显示未读数

数据模型（云函数 `cloudfunctions/api/index.js` 社交代码块）：`follows`（openid→targetOpenid 双向查询）、`messages`（threadKey + fromOpenid + content）、`conversations`（userA/userB + unreadA/unreadB + lastMessage/lastTime）。`posts.list` / `comments.list` / `cooks.list` / `cooks_comments.list` 均返回 `authorOpenid` 供头像入口跳转。

### 意见反馈（V1 提交/列表/详情 + 邮件通知）

按 `UI/反馈功能设计文档.md` 实现。类型：功能建议 / 问题反馈 / 内容举报 / 其他。

- **入口**：「我的」页首行「更多」→ 更多页（`pages/more`）「意见反馈」与「我的反馈」两行（未登录先弹登录面板；自打赏功能落地起反馈入口从「我的」页迁入更多页）
- **提交页**（`pages/feedback`）：类型单选（默认问题反馈）、内容必填 10–500 字实时计数、附图 ≤3 张（复用 OSS 直传、缩略图可删）、联系方式选填（微信号/手机号/邮箱，格式校验、仅后台可见）；提交成功跳「我的反馈」
- **我的反馈列表**（`pages/feedback-list`）：仅本人反馈（云函数强制 openid 过滤），时间倒序分页 10 条，类型标签 + 状态徽章（已收到=灰 #A8A19A / 处理中=暖橙 #FFB020 / 已解决=葱绿 #73B84B，色值与「我的反馈」图标内状态色一一对应）+ 摘要两行截断
- **反馈详情**（`pages/feedback-detail`）：完整内容、附图预览、状态时间线、客服回复气泡；状态与回复只读（后台在云开发控制台修改 `status` / `reply`）
- **服务端强制校验**：type 白名单、长度、附图域名（仅项目 OSS 前缀）、联系方式、每日上限 5 条（北京时间自然日）、相同内容 10 分钟内去重（MD5）
- **邮件通知（客户需求）**：提交反馈时云函数自动发通知邮件到指定邮箱（nodemailer + SMTP，含类型/内容/附图链接/联系方式/处理指引）；邮件失败不影响落库。配置：云开发控制台 → 云函数 api → 环境变量 `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_TO`，未配置时自动跳过
- 部署：右键 `cloudfunctions/api` → 「上传并部署：云端安装依赖」（本次新增 nodemailer 依赖）

### 打赏功能（V2 UI 优化，按 `UI/打赏功能设计文档.md` V0.2 实现）

用户自愿支持开发者的轻量入口：**"请饭小圈吃顿饭"**，回馈是一枚纪念徽章（无任何权益加成）。

- **我的页首行**：「退出/登录」右侧新增「更多」按钮（品牌橙浅底，间距 16rpx），点击进更多页
- **更多页**（`pages/more`）：意见反馈 / 我的反馈（自本页迁入，跳转逻辑不变）+ 独立分区的「打赏开发者」（暖色渐变卡 + 白盘徽章图标，副文案"请饭小圈吃顿饭 🍚"）；未登录也可进页，点反馈入口按需弹登录
- **打赏页**（`pages/reward`）：徽章 hero 区（柔光托底 + 蒸汽飘浮动效）→ 主标语"请饭小圈吃顿饭 🍚" → 客户指定副标语一字不差 → **微信赞赏码卡片置顶**（`images/reward/wechat-qr.jpg` 原封不动 + `show-menu-by-longpress` 长按识别 + "长按识别"角标）→ **爱发电卡片置底**（占位"开发中"）→ 领取按钮（橙橙渐变胶囊 + 徽章白盘 chip）→"不打赏也没关系"自由度文案；**不接支付链路**，打赏在外部平台完成
- **领取徽章**（信任制 + 每击出码，`reward.claim` 云函数动作）：点「我已打赏」→ 未登录先弹登录面板 → 云端生成兑换码（`FXQR` + 6 位，`codes` 集合 `type:'badge'` / `badgeKey:'reward'` / `maxUses:1` / `exp:0`）并绑定 `users.rewardCode`；**每次点击都展示兑换码**（首击生成，之后返回同一枚，`repeated:true` 不拒绝）→ 弹层展示完整奖章图 + "感谢您的打赏，你获得打赏徽章！兑换码为：xxxxx"（点击复制 / 去兑换）
- **兑换解锁**：`codes.redeem` 已支持徽章码（步骤 4 附赠徽章），兑换后徽章墙出现第 16 枚「打赏开发者」徽章（特殊稀有度；徽章详情弹层展示完整奖章图，未解锁灰显；`utils/badges.js` + 云函数 `BADGES` 已同步）
- **徽章定稿**（V0.2）：客户定稿为**圆形**奖章（外圈 `#E96B0C` / 内芯 `#FFE8A6`，左圆眼 + 右弧线眯眼，丝带带两侧飘尾），`UI/reward/reward-badge.svg` 定稿源文件 → 128/81 PNG 已同步进 `images/`（`reward-badge-128.png` / `reward-badge-81.png`）；`utils/badges.js` 吉祥物图标右眼同步为弧线
- 边界：重复点击"我已打赏"返回同一枚码不拒绝；`codes.list` 过滤 `type='badge'` 码不外显；码每人一枚永久有效
- 待客户确认（设计文档 7.3）：爱发电主页地址与二维码素材（当前占位"开发中"）；打赏等级 Lv.1–5 是否 V2 落地

### 菜品图片回显（按 `UI/菜品图片回显设计方案.md` V0.2 定稿，2026-08-11 落地）

所有**菜品 emoji 回显**替换为 **OSS 菜品图**（白底 512×512，`Foods.md` 200 道菜一一对应）：

- **映射层**：`utils/dishes-img.js`（由脚本从 `Foods.md` 自动生成，200 项零手抄）；`getDishImage(菜名)` → `https://fanxiaoquan.oss-cn-beijing.aliyuncs.com/dishes/dish_001.png ~ dish_200.png`，未收录菜名返回空串
- **六处回显点**：盲盒揭晓 / 结果弹层（decide）、帖子无图占位（feed）、收藏行 / 历史行（profile）、用户主页作品占位（user）—— 前端 setData 前补 `img` 字段，WXML `wx:if(img)/wx:elif(img)/wx:else(emoji)` 三级兜底，`binderror` 加载失败回退 emoji
- **不改**：分类 chips（决定页 / 发帖页**保留分类 emoji**）、操作图标、头像、等级称号、徽章、空态引导、大厨TV（无图不占位）
- **云函数 / 数据库零改动**，老数据按 `dish` 实时映射天然兼容
- 上线前需在小程序后台配置 `downloadFile` 合法域名：`https://fanxiaoquan.oss-cn-beijing.aliyuncs.com`（原型 `urlCheck:false` 不受限）

### 检索（饭小圈 / 附近 / 大厨TV 三栏目共用）

按 `UI/检索功能设计文档.md` 实现（待确认项全部取默认值）。

- **搜索条**：饭小圈页子 tab 下方，placeholder 随栏目变化（菜名/分类/昵称 → 教程标题/内容），点击进入搜索态并聚焦
- **交互**：防抖 400ms 自动搜索（键盘搜索键立即触发）、请求序号竞态保护（旧结果不闪回）、✕ 清空 / 取消退出搜索态、"共 N 条结果"（上限 100）、空态引导、触底分页每页 10 条
- **检索范围**：饭小圈/附近 = 菜名 + 分类 + 昵称（含昵称，"找人"场景）；大厨TV = 标题 + 正文 + 昵称；不区分大小写；正则特殊字符服务端转义
- **附近检索**：服务端 50km Haversine 过滤（与附近列表同逻辑），无定位引导开启（开启后自动重搜）
- **已踩过滤**：搜索结果不出现已"踩"（隐藏）的帖子
- **结果卡片**：完全复用现有帖子/教程卡片（点赞、评论、踩、复制菜名、删除、徽章展开面板、头像框均可操作）；搜索态隐藏发帖按钮
- 云函数：新增 `search` 动作；教程装饰逻辑提取为 `decorateCooks`（与 `cooks.list` 共用）

### 品牌图标（客户交付 UI/Photos 设计稿，2026-08-10 落地）

客户在 `UI/Photos/` 交付 3 张品牌图（主图标·橙锅、绿色辅助图标、宣传图），已落地：

- **`images/brand/logo.png`（512px 透明）**：主图标抠白底生成；用于微信小程序头像（见下）、tabBar 品牌位
- **`images/brand/logo-128.png`**：页面内小尺寸版本
- **`images/brand/icon-green.png`（320px 透明）**：绿色辅助图标（预留，暂未使用）
- **`images/brand/share.jpg`（800x640）**：宣传图中心裁剪 5:4，作为分享卡片图
- **应用位置**：自定义 tabBar「饭小圈」tab 由 🍜 换为主图标图（custom-tab-bar/index.js，`iconType: 'img'`）；饭小圈页头部标题前加品牌小图标；feed / decide / profile 三页分享卡片使用宣传图
- **小程序头像**：微信公众平台（mp.weixin.qq.com）→ 设置 → 基本设置 → 小程序头像，上传 `images/brand/logo.png`（透明底方形，平台会展示为圆形，居中即可）
- 说明：绿色辅助图标用途待客户确认；原 `images/` 下无引用的演示大图（冬阴功火锅 PNG）已移入 `tools/legacy-images/`（不参与打包）

### UI 图标更换（客户定稿 `UI/图标更换设计规格.md` V0.3，2026-08-10 落地）

4 枚新图标（我的主页 / 决定 / 意见反馈 / 我的反馈）全部落地，色板统一（品牌橙 `#FF8A1F` 系 + 决定绿 `#73B84B`）：

- **Dock 三 tab 全图化**（`custom-tab-bar/index.js`）：饭小圈=品牌 logo、决定=`images/brand/decide-128.png`、我的=`images/brand/my-home-128.png`
- **「我的」页反馈入口**（`pages/profile`）：意见反馈 / 我的反馈 由 emoji 换为 `feedback-128.png` / `my-feedback-128.png`（`.entry-icon` 48rpx）
- **原生 tabBar 兜底**（`images/tabbar/`）：decide / profile 两对图标换为 81px 新图标（feed 保留饭碗）
- **状态色业务联动**（规格 5.4）：反馈状态徽章已收到=灰 `#A8A19A` / 处理中=暖橙 `#FFB020` / 已解决=葱绿 `#73B84B`，与「我的反馈」图标内状态色一一对应（`pages/feedback-list` / `pages/feedback-detail` 两处 wxss + `utils/feedback.js` 注释同步）
- 待设计确认（规格第 7 节，非阻塞）：决定绿图标在 Dock 橙色选中底下的观感、饭小圈 tab 是否也换本套风格

### 微信授权登录

- 首次打开小程序（未登录时）弹出登录面板：微信一键登录（`wx.login` 拿 code）→ 授权昵称头像 → 确认进入；选「暂不登录」后本会话不再打扰，可从「我的」页随时登录
- 昵称头像用的是**微信官方「头像昵称填写能力」**（`button open-type="chooseAvatar"` 直接选用微信头像 + `input type="nickname"` 一键填入昵称）——`wx.getUserProfile` 自 2022 年 10 月起只能返回匿名数据，已无法直接拿真实昵称头像
- 头像会上传到 OSS `fanxiaoqian/avatars/` 目录持久化；登录信息存在 `fxq_user`，退出登录在「我的」页头部
- 正式版：`wx.login` 的 code 需要由后端换取 openid / session_key（原型只记录 code）

### 图片上传（阿里云 OSS）

发帖支持上传图片，直传阿里云 OSS（POST policy 签名，客户端签名，代码在 `utils/oss.js`）。已预填 `region` / `bucket` / `baseUrl` / `folder`，仅需补 AK/SK（见[云开发配置](#云开发配置)）。

**真机上传失败 / 上传后图片不显示的排查清单**（原型最常见两类问题，均与代码无关）：

1. **真机无法上传**（提示域名/配置问题）：真机上 `wx.uploadFile` 强校验服务器域名白名单，`project.config.json` 的 `urlCheck: false` **只对开发者工具生效**。请在
   mp.weixin.qq.com → 开发管理 → 服务器域名 → **uploadFile 合法域名** 添加 `https://fanxiaoquan.oss-cn-beijing.aliyuncs.com`。
   游客/测试号不支持配置合法域名，真机预览请用正式 AppID。
2. **上传成功但图片不显示**：bucket 是**私有读**，签名上传（PutObject）能成功，但回显直链是匿名 GET，会被 OSS 拒绝（403）。请在阿里云 OSS 控制台 → 桶 `fanxiaoquan` → 权限管理 → 读写权限 → 改为 **公共读**（原型够用）；正式方案是换签名 URL 或 CDN。
3. **真机图片回显还要配 downloadFile 合法域名**：`<image>` 组件加载走 downloadFile 校验，同样加上面的域名。

**上线前必须处理**：

- 正式版不要在小程序里暴露 AK/SK，改为 STS 临时凭证（`utils/oss.js` 的 `getCredentials()` 已留替换钩子，从自己的服务端换取）
- 图片回显用直链，需要 bucket 公开读，或换成签名 URL（私有桶时）

### 外卖联动的落地表达

| 阶段 | 方案 | 原型中的表现 |
| --- | --- | --- |
| L1 | 复制菜名 + 提示层演示交互路径 | 已实现：`components/order-hint`（已复制菜名 → 模拟平台搜索页） |
| L2 | 接目标平台小程序 path / 白名单 H5 | 待调研：跳转协议、登录态与定位参数透传（见 docs 页） |
| L3 | 商务合作拿到精确商品跳转与回流数据 | 商务阶段：结算分佣、回流归因（见 docs 页） |

---

## 设计规范

- 整体风格：极简、清爽、偏轻量生活方式；主色 #FF6B35（食欲橙）
- 重点场景：快速决定吃什么 + 看附近人吃什么
- 主导航：饭小圈 / 决定 / 我的（3 个 Tab）

### UI 整体升级（烟火实验室 · Warm Kitchen Lab）

按 `UI/设计规范.md` + `UI/mockups/`（index / decide / feed / profile 四个可交互 HTML 原型）完成的全套视觉换皮。**交互与数据逻辑零改动**，纯样式层升级：

- **设计令牌**：暖灶台语境——蒸汽米白底 `#FFF6EC`、炭黑棕文字 `#241812`、汤底红主色 `#E8432E`、食欲橙 `#FF6B35`、暖橙阴影；令牌集中在 `app.wxss` 顶部
- **底部导航方案 B 悬浮胶囊 Dock**（`custom-tab-bar/`）：app.json `tabBar.custom: true`，白底圆角胶囊悬浮底部，选中项橙红渐变；三个 tab 页在 `onShow` 里 `getTabBar().setData({ selected })` 同步选中态，页面底部预留 180rpx
- **决定页 · 大锅转盘**：canvas 加金属锅沿（深铁底 + 顶部高光弧）+ 扇区间距线改暖白；筷子指针（双棍微张 + 金色筷头）、蘸料碟中心按钮（开涮/转转盘）、锅沿 3 缕蒸汽循环上飘；**命中扇区高亮**：转盘落定时命中的扇区白闪一下，随后被自动换批动画接走；30 扇区文字超 5 字省略（fitText）
- **决定页 · 蒸笼盲盒**：0ms 摇笼（笼盖发抖 0.6s）→ 600ms 揭盖（盖子上浮旋转渐隐 + 4 缕热气 + 8 颗彩色星点四溅 + 美食 emoji 弹性弹出）→ 900ms 定板（蒸笼变蔬菜绿 + 结果弹层）；连续点击重放全程（`opening` 挡连点），「味」字封条、盖钮金钮、竹纹盖沿用 CSS 绘制
- **饭小圈页**：子 tab 改为文字 + **筷子划痕**（6rpx 渐变下划线）；卡片餐垫化（暖线描边 + 暖阴影）；无图帖子用「渐变暖底 + 两缕蒸汽 + 大 emoji」占位；Lv 徽章分层（9+ 虹彩 / 6-8 金 / 3-5 银 / 0-2 陶土）；点赞 ❤️ 带心跳动画；发帖入口改渐变胶囊 FAB
- **我的页 · 星级食神**：等级徽章 = 白底圆盘 + conic-gradient 进度光环（`--ring` 由 JS 按称号色/等级进度生成，9+ 级虹彩全环）+ 浮动称号 emoji；进度条改**一碗饭**（米色碗身 + 金黄米饭渐变 + 米粒纹理 + 🥢 勺子跟随进度）；11 级称号渲染（萌新食客 → 食神驾到）与「下一称号」提示；经验文案按要求显示「目前该等级经验 / 升级所需」
- **动效细节**：换一批按钮点击缩小弹大 + ↻ 旋转；结果弹层蒸汽顶光 + 回弹弹入；蒸汽语言（`steam-rise`）统一全 App 的出锅感反馈
- 组件（外卖提示层 / 登录面板）、发帖弹窗、空态同步暖色；`LEVEL_TITLES` 仅小程序端展示（云函数无需称号），`LEVEL_THRESHOLDS` / `CATEGORIES` 仍与云函数保持同步

---

## 文档索引

仓库内设计与需求文档统一放在 `UI/` 目录（不参与小程序打包）：

| 文档 | 内容 |
| --- | --- |
| `UI/定位与地址获取设计方案.md` | 定位封装、附近 50km、逆地理编码 |
| `UI/打赏功能设计文档.md` | 打赏入口、纪念徽章、信任制出码 |
| `UI/菜品图片回显设计方案.md` | emoji → OSS 菜品图映射与兜底 |
| `UI/图标更换设计规格.md` | 4 枚新图标与状态色联动 |
| `UI/getLocation接口申请指南.md` | 小程序 `getLocation` 接口开通步骤 |
| `UI/Foods.md` | 200 种热门食物 Emoji 目录（含菜品图文件名对照） |
| `UI/dishes-check.html` | 菜品图批量核对页（本地打开） |
| `UI/icons/preview.html`、`UI/reward/preview.html` | 图标 / 奖章预览页 |
| `UI/assets/图标提取参考/` | 设计稿切片与提取参考图 |
| `REDEEM_CODES.md` | 初始兑换码与运营维护方式 |

> 正文中提到的 `UI/设计规范.md`、`UI/成就徽章设计文档.md`、`UI/社交功能设计文档.md`、`UI/反馈功能设计文档.md`、`UI/检索功能设计文档.md`、`UI/mockups/` 等文档在开发过程中使用，但**未包含在本仓库**中；正文相关内容已完整描述实现口径，可按正文为准。

---

## 上线前检查清单

- [ ] **密钥**：`utils/oss.js` 使用 STS 临时凭证（当前 AK/SK 已脱敏置空，切勿提交真实值）
- [ ] **AppID**：`project.config.json` 换为正式 AppID
- [ ] **合法域名**：`uploadFile` / `downloadFile` 加 OSS 域名；`request` 加 `https://apis.map.qq.com`（逆编码）
- [ ] **位置接口**：小程序后台「开发管理 → 接口设置」开通 `getLocation`；隐私保护指引声明位置信息用途
- [ ] **OSS 权限**：bucket 改公共读，或改为签名 URL / CDN
- [ ] **云函数**：重新「上传并部署：云端安装依赖」；按需配置 SMTP 环境变量
- [ ] **同步副本**：`utils/mock.js` / `utils/level.js` / `utils/badges.js` 与云函数内 `CATEGORIES` / `LEVEL_THRESHOLDS` / `BADGES` 保持一致
- [ ] **兑换码**：如不希望初始码公开，上线前在云函数调整 `SEED_CODES`（`REDEEM_CODES.md` 目前为公开仓库可见的固定值）
- [ ] **合规**：用户内容（晒吃帖/评论/私信）需补充内容安全校验与举报处置链路

---

## 已知限制

- 私信实时性为 demo 级（5s 轮询，无长连接 / WebSocket 推送）
- 登录仅记录 `wx.login` 的 code，未由服务端换取 openid / session_key（正式版需接入）
- 打赏为信任制，不接支付链路，无支付回调校验
- 反馈状态与客服回复需在云开发控制台手工修改，无管理后台
- 大厨TV 教程不支持「踩」，附近页无发帖入口（按需求设计）
- 用户生成内容尚未接入微信内容安全接口（`msgSecCheck` / `imgSecCheck`）

---

## License

[MIT](LICENSE) © 2026 fanxiaoquan
