import { describe, expect, it } from 'vitest';
import { SsoReserveFields } from '../../src/packet/index.js';

describe('SsoReserveFields', () => {
    it('round-trips uid, traceParent and nested secureInfo', () => {
        const sign = Buffer.from([0xde, 0xad]);
        const decoded = SsoReserveFields.decode(
            SsoReserveFields.encode({
                uid: 'u_abc',
                traceParent: '00-trace-01',
                secureInfo: { sign, token: Buffer.from([0x01]) },
            }),
        );
        expect(decoded.uid).toBe('u_abc');
        expect(decoded.traceParent).toBe('00-trace-01');
        expect(decoded.secureInfo?.sign?.equals(sign)).toBe(true);
    });

    it('omits absent optional fields', () => {
        const decoded = SsoReserveFields.decode(SsoReserveFields.encode({}));
        expect(decoded.uid).toBeUndefined();
        expect(decoded.secureInfo).toBeUndefined();
    });
});
