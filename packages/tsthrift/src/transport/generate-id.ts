/*!
 * Adapted from flake-idgen by Tom Pawlak.
 * Copyright (c) 2014 Tom Pawlak
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import baseX from "base-x";

export const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export interface FlakeIdOptions {
  id?: number;
  datacenter?: number;
  worker?: number;
  epoch?: number;
  seqMask?: number;
  /**
   * Reproduce upstream flake-idgen failure semantics: throw when the clock moves backwards
   * or the per-millisecond sequence is exhausted. By default `next()` never throws.
   */
  strict?: boolean;
}

/**
 * Flake ID generator yielding 64-bit k-ordered, conflict-free IDs.
 * Operates without Node.js Buffer or globals, safe for browser and Node.js runtimes.
 */
export class FlakeId {
  private readonly genId: number;
  private readonly epoch: number;
  private readonly seqMask: number;
  private seq = 0;
  private lastTime = 0;
  private overflow = false;
  private readonly strict: boolean;

  constructor(options: FlakeIdOptions = {}) {
    const id =
      typeof options.id !== "undefined"
        ? options.id & 0x3ff
        : (((options.datacenter || 0) & 0x1f) << 5) | ((options.worker || 0) & 0x1f);
    this.genId = id << 12;
    this.epoch = Number(options.epoch) || 0;
    this.seqMask = options.seqMask || 0xfff;
    this.strict = options.strict ?? false;
  }

  next(): Uint8Array {
    return this.strict ? this.nextStrict() : this.nextMonotonic();
  }

  /**
   * Never throws: a backwards clock keeps the last timestamp, and an exhausted sequence
   * borrows the next millisecond. (time, seq) strictly increases, so IDs stay unique and
   * ordered while the bit layout matches flake-idgen.
   */
  private nextMonotonic(): Uint8Array {
    let time = Math.max(Date.now() - this.epoch, this.lastTime);
    if (time === this.lastTime) {
      this.seq = (this.seq + 1) & this.seqMask;
      if (this.seq === 0) time += 1;
    } else {
      this.seq = 0;
    }
    this.lastTime = time;
    return this.encode(time);
  }

  private nextStrict(): Uint8Array {
    const time = Date.now() - this.epoch;
    if (time < this.lastTime) {
      throw new Error(
        `Clock moved backwards. Refusing to generate id for ${this.lastTime - time} milliseconds`,
      );
    }
    if (time === this.lastTime) {
      if (this.overflow) {
        throw new Error("Sequence exceeded its maximum value.");
      }
      this.seq = (this.seq + 1) & this.seqMask;
      if (this.seq === 0) {
        this.overflow = true;
        throw new Error("Sequence exceeded its maximum value.");
      }
    } else {
      this.overflow = false;
      this.seq = 0;
    }
    this.lastTime = time;
    return this.encode(time);
  }

  private encode(time: number): Uint8Array {
    const big = (BigInt(time) << 22n) | BigInt(this.genId) | BigInt(this.seq);
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, big);
    return bytes;
  }
}

export const bs64: ReturnType<typeof baseX> = baseX(BASE64_ALPHABET);
let defaultFlake: FlakeId | undefined;

/**
 * Shared generator behind `generateId`, created on first use. Its 10-bit generator id is random
 * per runtime instance so that independent clients rarely share (time, generator, sequence);
 * the bit layout is unchanged.
 */
function getDefaultFlake(): FlakeId {
  return (defaultFlake ??= new FlakeId({
    id: crypto.getRandomValues(new Uint16Array(1))[0]! & 0x3ff,
  }));
}

/**
 * Generates a 64-bit Flake ID (backend-compatible layout) encoded in the legacy base64 alphabet.
 *
 * Used for tracing identifiers such as span IDs and trace IDs. Never throws: clock rollback
 * and per-millisecond sequence exhaustion are absorbed by the default generator.
 *
 * @returns {string} - The base64-encoded unique ID.
 */
export const generateId = (): string => bs64.encode(getDefaultFlake().next());
