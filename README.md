# Joshua Kimmich Archive

**A living archive of matches, words and moments.**

一个可运行、可扩展的基米希球迷档案馆与粉丝社区。项目采用 Next.js App Router、TypeScript 和 Tailwind CSS，首个版本已经包含真实文件上传、审核、视频 Range 播放、评论回复、社区、文章、比赛和管理工作台。

当前日期：2026-10-23。项目是独立粉丝档案，不隶属于 Joshua Kimmich、FC Bayern München 或 DFB。

## 当前状态

本地版本可以直接运行，不需要 Supabase、football-data.org 或任何 API Key。配置 API-Football Key 后会额外启用真实赛程、比分与基米希赛后评分：

- 奶油色 / 羊皮纸 / 复古图鉴风格的响应式界面
- 邮箱注册、登录、退出和 HttpOnly 会话
- 8–128 字符密码校验、scrypt 加盐哈希和请求频率限制
- 密码重置令牌流程（生产环境邮件发送仍需配置）
- 照片与视频真实文件上传；视频最大 250 MB，照片最大 25 MB
- 上传进度、取消、失败提示、随机服务端文件名和文件头校验
- JPEG / PNG / WebP / GIF 照片；MP4 / WebM / MOV / Ogg 视频
- JPEG APP1、PNG eXIf、WebP EXIF/XMP 的基础元数据清理
- 待审核媒体只对上传者和管理员可见
- 管理员批准 / 拒绝、审核备注、视频封面替换和删除
- HTML5 `<video>` 在线播放，支持 Range 请求、暂停、音量、全屏和移动端控制
- 照片 / 视频分类、搜索、列表和详情页
- 社区帖子、嵌套评论与回复、收藏、举报和本人内容删除
- 采访、新闻、原创与翻译文章；语言、来源和关联链接
- 拜仁与德国队比赛记录、手动录入、API-Football 比分 + 球员评分同步
- 基米希出场分钟、评分、进球、助攻、平均评分、最高评分与评分场次
- 统一搜索、个人公开页面、球员资料页和 SEO 元数据
- 管理员文章、比赛、举报、社区内容和成员角色管理
- 演示内容、外部链接、本地上传文件和原创插画都有明确标签

## 本地启动

要求 Node.js 22.13 或更高版本（推荐 Node.js 24，因为本地适配器使用内置 `node:sqlite`）。

Windows 可以直接双击项目根目录的 `start-private-site.cmd`。脚本会寻找可用 Node.js、自动打开浏览器，并在首次运行时创建本地 `.env.local`。私人本机模式使用 `127.0.0.1` 自动管理员会话，不需要手动登录；公网环境不得启用 `PRIVATE_AUTO_LOGIN`。

命令行启动方式：

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

桌面启动器默认打开 <http://127.0.0.1:4173/>；若该端口被占用，会自动选择下一个可用端口。命令行 `npm run dev` 默认仍使用 `http://localhost:3000`。

本地开发若未设置管理员变量，会建立以下一次性演示账号：

```text
管理员：admin@example.com / KimmichArchive!2026
成员： fan@example.com / DemoFan!2026
```

首次公开部署前必须修改 `.env.local`。生产模式会拒绝在缺少强管理员凭据时初始化数据库：

```dotenv
ADMIN_EMAIL=your-private-admin-email@example.com
ADMIN_PASSWORD=a-long-unique-random-password
BASE_URL=https://archive.example.com
```

不要把 `.env.local`、密码、Supabase service-role key 或 football API key 提交到 Git。

## 验证命令

```powershell
npm run typecheck
npm run build
npm test
```

`npm test` 要求先执行 `npm run build`。测试会启动生产服务器并使用临时数据库，验证：

1. 首页和 API 可访问。
2. 用户注册、管理员登录与会话 Cookie。
3. 照片上传后为 `pending`，匿名访问被拒绝。
4. 上传者仍可查看自己的待审核文件。
5. 非图片内容改扩展名后仍被拒绝。
6. 管理员批准后媒体公开。
7. 视频文件通过 Range 请求返回 `206 Partial Content`。
8. 帖子、评论和嵌套回复真实落库。
9. 普通成员无法删除他人评论、媒体或执行审核。
10. 跨站写请求被拒绝。
11. 没有足球 API Key 时比赛中心仍正常工作。
12. 使用模拟 API-Football 服务验证比分、评分、出场分钟、进球、助攻和平均分。

## 技术结构

```text
app/                     Next.js App Router 页面和 API
  api/[...path]/route.ts 统一服务端 API、上传、Range 播放和权限检查
  photos/ videos/        媒体集合与详情
  interviews/            文章集合与详情
  matches/               比赛集合与详情
  community/             社区
  admin/                 管理工作台
components/              UI 组件与交互
lib/                     数据库、认证、存储、媒体校验、比赛同步
public/assets/           原创演示插画
supabase/migrations/     PostgreSQL 表、索引和 RLS 策略
tests/                   Node 内置测试运行器端到端测试
```

本地数据库位于 `.data/archive.db`，上传文件位于 `.data/uploads/`。两者均被 `.gitignore` 排除。页面与查询使用数据库记录，不是静态假卡片。

### 存储适配层

`lib/storage.ts` 定义了可替换的 `StorageAdapter`：

- `LocalStorageAdapter`：当前默认，适合单机/VPS + 持久卷。
- `SupabaseStorageAdapter`：在 `STORAGE_PROVIDER=supabase`、URL 和 service-role key 配置后启用。

视频记录同时保存数据库元数据和独立存储路径。以后迁移到 Cloudflare Stream、Mux 或其他对象存储时，应新增适配器，而不是重写视频库。

## 数据区分规则

- `source_type=upload`：实际传入本站的文件。详情页显示 `Uploaded file`。
- `source_type=external`：第三方外部链接。详情页显示 `External media`，不会伪装成本站上传。
- `source_type=demo`：内置原创插画或演示记录，显示 `Demo`。
- `is_demo=1`：文章、比赛和社区示例数据；页面会明确提示。
- 来源 URL、作者、授权说明、文件 MIME、大小、审核状态和上传者分别保存。

内置三张插画是原创演示素材，不是基米希照片。球员资料页只使用可外链的官方参考来源，并把“档案原创”与“外部链接”分开。

## 比分、赛程与球员评分同步

首选 API-Football，因为它同时提供赛程、比分和赛后球员评分。在 `.env.local` 中设置：

```dotenv
API_FOOTBALL_API_KEY=your-server-only-key
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_TEAM_IDS=157,25
API_FOOTBALL_LOOKBACK_DAYS=365
API_FOOTBALL_LOOKAHEAD_DAYS=180
API_FOOTBALL_RATING_LIMIT=8

# Optional scores-only fallback
FOOTBALL_DATA_API_KEY=
FOOTBALL_DATA_TEAM_IDS=5,759
FOOTBALL_CRON_SECRET=your-long-cron-secret
```

API-Football 中 `157` 是拜仁慕尼黑，`25` 是德国队。管理员可从管理工作台触发同步：

`POST /api/admin/matches/refresh`

定时任务使用 `Authorization: Bearer <FOOTBALL_CRON_SECRET>` 调用同一路径。实现包含：

- API-Football 赛程、比分、状态、赛事与场地更新
- 自动搜索 Joshua Kimmich 球员档案并按 fixture 获取出场评分
- 出场分钟、评分、进球、助攻、黄牌和红牌的独立记录
- 已结束比赛评分去重，进行中的比赛可随同步刷新
- `external_id` 去重与 upsert
- 20 秒请求超时、一次失败重试与 429 退避
- `sync_logs` 成功、部分失败和失败日志
- API Key 仅从服务端环境变量读取

没有 Key 时不会影响其他功能，比赛页会明确显示 `API key not configured`。如果只配置 football-data.org，页面会明确标注比分可用但评分不可用，不会伪造评分。

## 公开部署

### 方式 A：任意 VPS + Docker + 持久卷（当前本地适配器推荐）

1. 安装 Docker 和 Docker Compose。
2. 将 `.env.example` 复制为 `.env`。
3. 设置强 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 和最终 `BASE_URL`。
4. 执行：

```powershell
docker compose up -d --build
```

5. 在服务器防火墙中只开放 80/443，通过 Caddy、Nginx 或 Cloudflare Tunnel 给 `127.0.0.1:3000` 提供 HTTPS。
6. 将域名 DNS 指向服务器或 Tunnel。
7. 验证 `/api/health`、注册、上传和重启后数据仍存在。

卷 `archive-data` 保存 SQLite 数据库和上传文件。请为该卷设置定期备份。

### 方式 B：Vercel + Supabase（需要额外接入并 live 验证）

已经提供完整初始化迁移：

`supabase/migrations/202610230001_initial_schema.sql`

其中包含 profiles、matches、articles、photos、videos、posts、post_media、comments、reports、favorites、tags、关联表和 sync_logs，以及 RLS 策略和私有 `archive-media` bucket。

手动步骤：

1. 打开 <https://supabase.com/dashboard> 并创建项目。
2. 进入项目 **SQL Editor → New query**。
3. 粘贴并运行迁移 SQL。
4. 进入 **Project Settings → API**，复制 Project URL 与 anon public key，填入本地 `.env.local`。
5. 在同一页面获取 service-role key，只填入服务端环境变量。不要使用 `NEXT_PUBLIC_` 前缀。
6. 进入 **Storage**，确认 `archive-media` bucket 存在且为私有。
7. 切换数据仓库和认证适配器，并在真实 Supabase 项目运行注册、RLS、媒体审核与签名播放测试。

注意：v1 已交付数据库/RLS 迁移和 Supabase Storage 适配器，但本地可执行数据层仍使用 SQLite。Vercel 没有持久本地磁盘，不能直接依赖 `.data`。要在 Vercel 正式上线，必须完成 Supabase 数据仓库与认证的 live 接入；这部分因当前没有你的项目凭据而尚未验证。

## 密码重置邮件

本地流程会生成一次性、30 分钟有效的重置链接。生产环境默认不把令牌返回浏览器，而需要配置邮件发送服务。当前尚未接入 SMTP / Resend / Supabase Auth 邮件，因此公网用户的自助邮件重置需要手工补齐。

## 版权与媒体限制

- 不允许把未授权的完整比赛转播重新分发给公众。
- 外部视频使用原始来源链接，不绕过登录、付费墙或访问控制。
- 举报记录进入管理员队列；管理员可隐藏或删除内容。
- 当前视频使用本机文件流播放，适合中小型档案馆。若流量或文件规模增大，应增加 TUS/分片上传、转码队列和专业视频托管。
- 生产部署应在反向代理层设置请求体上限、TLS、访问日志和备份策略。

## 尚需外部配置

以下不是首版代码阻塞项，但上线前必须处理：

- 自定义域名、HTTPS、DNS 与托管平台部署授权
- Supabase 项目创建、迁移执行、密钥配置与 live 回归
- 生产事务邮件服务（密码重置、版权投诉通知）
- API-Football Key（推荐，配置后启用真实比分和球员评分）
- football-data.org Key（可选，仅作为比分备用源）
- 存储和访问日志的长期监控与备份

## 费用提示

Supabase 免费额度、eFootball 数据 API、Vercel 带宽和视频存储都有套餐限制。视频文件会显著消耗存储与出站流量。公开前应在所选平台检查当前额度，并为媒体增长预留专业对象存储或视频托管方案。
