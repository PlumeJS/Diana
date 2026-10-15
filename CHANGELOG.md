# 更新日志

本项目所有值得记录的变更都会记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- **协议核心（`@diana/core`）**
  - NTQQ SSO 登录与二维码登录，会话持久化、a1 续期与失效回退扫码。
  - 报文编解码：TLV、Protobuf、SSO 帧、HTTP 连接与断线重连。
  - Highway 媒体传输：图片、语音、视频的上传下载，含缩略图与闪传。
  - OIDB 业务接口：群、群成员、群文件、群通知、群反应、好友、用户信息、戳一戳、文件等。
  - 消息能力：文本与富媒体收发、引用、合并转发、撤回、长消息、群/好友消息历史。
- **OneBot 11（`@diana/onebot`）**
  - 服务端：正向 WebSocket、反向 WebSocket、HTTP API、HTTP POST 上报。
  - 鉴权与心跳：accessToken 校验、可配置心跳间隔。
  - 事件转换：`message` / `message_sent` / `notice` / `request` / `meta_event`。
  - 消息段与媒体转存，以及 OneBot 11 常用 API 动作（详见 README）。
- **运行时入口（`@diana/app`）**
  - YAML 配置加载与 zod 校验。
  - 连接、登录、服务组装与 OneBot 启动的一体化流程。
  - 终端 ASCII Banner 与版本信息展示。
- 结构化日志系统：分级日志与模块彩色标签。
