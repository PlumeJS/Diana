# Diana

**PC NTQQ 协议的 TypeScript 实现。**

Diana 是一个使用 TypeScript 编写的 QQ（NTQQ）机器人框架。它在协议层复刻 PC 端 QQ 的登录、收发消息、媒体上传与各类 OIDB 业务接口，并在其之上提供符合 [OneBot 11](https://github.com/botuniverse/onebot-11) 标准的服务端，便于用任意 OneBot 客户端或框架接入。

> 协议实现严格对齐 [LagrangeDev/acidify](https://github.com/LagrangeDev/acidify)（Kotlin）的报文结构与字段定义。

## 免责声明

本项目仅供学习与研究协议之用。使用本项目所产生的一切后果由使用者自行承担，请遵守相关法律法规与平台服务条款。

## 特性

- **SSO / 扫码登录**：支持密码登录与二维码登录，session 持久化（a1 续期，失效自动回退扫码）。
- **消息收发**：私聊、群聊文本与富媒体消息，支持引用、合并转发、撤回、长消息。
- **媒体传输**：基于 Highway 的图片、语音、视频上传下载，含缩略图与闪传。
- **群与好友管理**：群成员、群文件、入群/加好友请求处理、禁言、管理设置、群名片、精华、加精反应等。
- **OneBot 11 服务端**：正向 WS、反向 WS、HTTP API、HTTP POST 上报，accessToken 校验与心跳。
- **结构化日志**：分级（fatal/error/warn/info/debug/trace）与模块彩色标签，仅在 TTY 下着色。
- **断线重连**：连接断开后自动重连；被踢下线时停止重连以避免风控。

## 架构

Diana 是一个 pnpm workspace monorepo，拆分为三个包：

| 包 | 名称 | 职责 |
| --- | --- | --- |
| `packages/core` | `@diana/core` | QQ (NTQQ) 协议核心实现：登录、报文编解码（TLV / PB / SSO 帧）、Highway 媒体、OIDB 及各类业务服务。 |
| `packages/onebot` | `@diana/onebot` | OneBot 11 协议实现：事件转换、消息段、媒体转存、API 动作与服务端。 |
| `packages/app` | `@diana/app` | 运行时入口：读取配置、连接登录、组装服务并启动 OneBot。 |

```
Diana/
├── packages/
│   ├── core/       # @diana/core   协议核心
│   ├── onebot/     # @diana/onebot OneBot 11 实现
│   └── app/        # @diana/app    运行时入口
├── config.yaml     # 运行配置（位于 packages/app）
└── pnpm-workspace.yaml
```

## 环境要求

- **Node.js >= 22**
- **pnpm >= 10**（推荐 `pnpm@10.14.0`）

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 构建全部包
pnpm build

# 3. 编辑配置（见下节）
#    packages/app/config.yaml

# 4. 启动
pnpm start
```

首次启动若无可用的会话，会输出登录二维码到终端，并保存到 `.diana/qrcode.png`，使用手机 QQ 扫码登录即可。登录成功后会话会写入 `.diana/session.json`，后续启动将复用。

## 配置

配置文件位于 [packages/app/config.yaml](packages/app/config.yaml)，由 zod 校验。主要字段：

```yaml
protocol:
  os: linux                 # 协议平台：windows / linux（对应 AppInfo 预设）
  version: 'custom'         # 客户端版本：留空用预设；填 custom 则读取 app-info.json
  server: msfwifi.3g.qq.com:8080  # SSO 登录服务器
  signServer: ''            # 签名服务器地址（POST，留空则不签名）
  signToken: ''             # 签名服务器 token
  interval: 5000            # 二维码轮询间隔（毫秒）

onebot:
  forwardWs:                # 正向 WebSocket：本端监听
    host: 0.0.0.0
    port: 3000
  reverseWs: []             # 反向 WebSocket：主动连接的对端地址列表
  http:                     # HTTP API：本端监听
    host: 0.0.0.0
    port: 3001
  httpPost: []              # HTTP POST：事件上报地址列表
  accessToken: ''           # 访问令牌（留空则不校验）
  heartbeatInterval: 30000  # 心跳间隔（毫秒），0 表示关闭

log:
  level: info               # trace / debug / info / warn / error / fatal

sessionFile: .diana/session.json   # 登录会话持久化路径
qrImageFile: .diana/qrcode.png     # 二维码图片保存路径
```

当 `protocol.version` 设为 `custom` 时，将读取工作目录下的 [app-info.json](packages/app/app-info.json) 作为客户端信息（版本、AppId、签名位图等）。

## 接入 OneBot

启动后 Diana 会同时提供以下接入方式（按配置启用）：

- **正向 WebSocket**：客户端连接 `ws://<host>:<port>/`（默认 `3000`）。
- **反向 WebSocket**：Diana 主动连接 `reverseWs` 中配置的地址。
- **HTTP API**：向 `http://<host>:<port>/`（默认 `3001`）POST 调用。
- **HTTP POST 上报**：事件推送到 `httpPost` 中配置的地址。

若设置了 `accessToken`，则需在请求中以 `Authorization: Bearer <token>` 或 `access_token` 传递以通过校验。

### 事件

支持 OneBot 11 的 `post_type`：`message`、`message_sent`、`notice`、`request`、`meta_event`。

- **通知（notice）**：群文件上传、群管理变更、群成员增减、群禁言、好友添加、群/好友撤回、戳一戳通知、精华、群名变更、群表情回应等。
- **请求（request）**：加好友、加群请求。

### 已支持的 Action

| 分类 | Action |
| --- | --- |
| 信息 | `get_login_info`、`get_status`、`get_version_info`、`can_send_image`、`can_send_record`、`get_model_show`、`set_model_show` |
| 消息 | `send_private_msg`、`send_group_msg`、`send_msg`、`delete_msg`、`get_msg`、`get_group_msg_history`、`get_friend_msg_history`、`get_roam_msg` |
| 转发 | `send_private_forward_msg`、`send_group_forward_msg`、`get_forward_msg` |
| 媒体 | `get_image`、`get_record`、`download_file`、`upload_group_file`、`upload_private_file`、`get_group_file_url`、`get_group_file_system_info`、`get_group_root_files`、`get_group_files_by_folder`、`delete_group_file`、`rename_group_file`、`move_group_file`、`create_group_file_folder` |
| 好友 | `get_friend_list`、`get_stranger_info`、`send_like`、`friend_poke`、`set_friend_add_request`、`delete_friend` |
| 群 | `get_group_list`、`get_group_info`、`get_group_member_list`、`get_group_member_info`、`group_poke`、`send_poke`、`set_group_message_reaction`、`set_msg_emoji_like`、`set_essence_msg`、`delete_essence_msg`、`get_essence_msg_list`、`send_group_sign`、`set_group_ban`、`set_group_whole_ban`、`set_group_card`、`set_group_kick`、`set_group_name`、`set_group_leave`、`set_group_admin`、`set_group_special_title`、`set_group_add_request` |
| 其他 | `clean_cache`、`set_qq_profile`、`set_qq_avatar`、`set_group_portrait` |

暂不支持：`get_cookies`、`get_csrf_token`、`get_credentials`、`get_private_file_url`、`get_group_honor_info`、`set_group_anonymous`、`set_group_anonymous_ban`、`set_restart`。

## 开发

```bash
pnpm build       # 构建全部包
pnpm typecheck   # 类型检查
pnpm lint        # ESLint 检查
pnpm format      # Biome 格式化
pnpm check       # Biome 检查并修复
pnpm test        # 运行 Vitest 测试
```

## License

本项目基于 [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）发布。

Copyright (C) 2026 Diana contributors
