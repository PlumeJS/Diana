import { randomBytes } from 'node:crypto';

/** 设备信息。 */
export interface DeviceInfo {
    /** 16 字节设备 guid。 */
    guid: Buffer;
    /** 6 字节 MAC 地址。 */
    macAddress: Buffer;
    /** 设备名。 */
    deviceName: string;
    /** 系统内核名。 */
    systemKernel: string;
    /** 内核版本。 */
    kernelVersion: string;
}

/** 生成新的随机设备信息。 */
export function newDeviceInfo(): DeviceInfo {
    return {
        guid: randomBytes(16),
        macAddress: randomBytes(6),
        deviceName: `Lagrange-${randomBytes(3).toString('hex').toUpperCase()}`,
        systemKernel: 'Windows 10.0.19042',
        kernelVersion: '10.0.19042.0',
    };
}