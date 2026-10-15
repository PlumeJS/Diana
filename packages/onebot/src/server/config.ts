/** 正向 WebSocket 配置。 */
export interface ForwardWsConfig {
    host?: string;
    port: number;
}

/** HTTP 配置。 */
export interface HttpConfig {
    host?: string;
    port: number;
}

/** OneBot 服务端配置。 */
export interface OneBotConfig {
    /** 正向 WebSocket：本端监听，客户端连接。 */
    forwardWs?: ForwardWsConfig;
    /** 反向 WebSocket：主动连接的对端地址列表。 */
    reverseWs?: string[];
    /** HTTP API：本端监听。 */
    http?: HttpConfig;
    /** HTTP POST：事件上报地址列表。 */
    httpPost?: string[];
    /** 访问令牌（存在时校验）。 */
    accessToken?: string;
    /** 心跳间隔（毫秒），0 表示关闭。 */
    heartbeatInterval?: number;
}