/** 可增长的大端字节写入器。 */
export class BytesWriter {
    private buffer: Buffer;
    private offset = 0;

    constructor(initialCapacity = 64) {
        this.buffer = Buffer.allocUnsafe(Math.max(initialCapacity, 1));
    }

    private ensure(size: number): void {
        const required = this.offset + size;
        if (required <= this.buffer.length) {
            return;
        }
        let capacity = this.buffer.length * 2;
        while (capacity < required) {
            capacity *= 2;
        }
        const next = Buffer.allocUnsafe(capacity);
        this.buffer.copy(next, 0, 0, this.offset);
        this.buffer = next;
    }

    writeUInt8(value: number): this {
        this.ensure(1);
        this.offset = this.buffer.writeUInt8(value, this.offset);
        return this;
    }

    writeInt8(value: number): this {
        this.ensure(1);
        this.offset = this.buffer.writeInt8(value, this.offset);
        return this;
    }

    writeUInt16BE(value: number): this {
        this.ensure(2);
        this.offset = this.buffer.writeUInt16BE(value, this.offset);
        return this;
    }

    writeInt16BE(value: number): this {
        this.ensure(2);
        this.offset = this.buffer.writeInt16BE(value, this.offset);
        return this;
    }

    writeUInt32BE(value: number): this {
        this.ensure(4);
        this.offset = this.buffer.writeUInt32BE(value, this.offset);
        return this;
    }

    writeInt32BE(value: number): this {
        this.ensure(4);
        this.offset = this.buffer.writeInt32BE(value, this.offset);
        return this;
    }

    writeBigUInt64BE(value: bigint): this {
        this.ensure(8);
        this.offset = this.buffer.writeBigUInt64BE(value, this.offset);
        return this;
    }

    writeBigInt64BE(value: bigint): this {
        this.ensure(8);
        this.offset = this.buffer.writeBigInt64BE(value, this.offset);
        return this;
    }

    writeFloatBE(value: number): this {
        this.ensure(4);
        this.offset = this.buffer.writeFloatBE(value, this.offset);
        return this;
    }

    writeDoubleBE(value: number): this {
        this.ensure(8);
        this.offset = this.buffer.writeDoubleBE(value, this.offset);
        return this;
    }

    writeBuffer(value: Buffer): this {
        this.ensure(value.length);
        this.offset += value.copy(this.buffer, this.offset);
        return this;
    }

    get length(): number {
        return this.offset;
    }

    toBuffer(): Buffer {
        return Buffer.from(this.buffer.subarray(0, this.offset));
    }
}

/** 大端字节读取器。 */
export class BytesReader {
    private offset = 0;

    constructor(private readonly buffer: Buffer) {}

    readUInt8(): number {
        const value = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }

    readInt8(): number {
        const value = this.buffer.readInt8(this.offset);
        this.offset += 1;
        return value;
    }

    readUInt16BE(): number {
        const value = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readInt16BE(): number {
        const value = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readUInt32BE(): number {
        const value = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    readInt32BE(): number {
        const value = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    readBigUInt64BE(): bigint {
        const value = this.buffer.readBigUInt64BE(this.offset);
        this.offset += 8;
        return value;
    }

    readBigInt64BE(): bigint {
        const value = this.buffer.readBigInt64BE(this.offset);
        this.offset += 8;
        return value;
    }

    readFloatBE(): number {
        const value = this.buffer.readFloatBE(this.offset);
        this.offset += 4;
        return value;
    }

    readDoubleBE(): number {
        const value = this.buffer.readDoubleBE(this.offset);
        this.offset += 8;
        return value;
    }

    readBuffer(length: number): Buffer {
        const value = this.buffer.subarray(this.offset, this.offset + length);
        this.offset += length;
        return value;
    }

    get remaining(): number {
        return this.buffer.length - this.offset;
    }
}
