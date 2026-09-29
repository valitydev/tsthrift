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

  constructor(options: FlakeIdOptions = {}) {
    const id =
      typeof options.id !== "undefined"
        ? options.id & 0x3ff
        : (((options.datacenter || 0) & 0x1f) << 5) | ((options.worker || 0) & 0x1f);
    this.genId = id << 12;
    this.epoch = Number(options.epoch) || 0;
    this.seqMask = options.seqMask || 0xfff;
  }

  next(): Uint8Array {
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

    const big = (BigInt(time) << 22n) | BigInt(this.genId) | BigInt(this.seq);
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, big);
    return bytes;
  }
}

export const bs64: ReturnType<typeof baseX> = baseX(BASE64_ALPHABET);
export const defaultFlake: FlakeId = new FlakeId();

/**
 * Generates a unique ID using FlakeId and encodes it in base64.
 *
 * Is used for generating unique identifiers for
 * tracing requests, like span IDs and trace IDs.
 *
 * @returns {string} - The base64-encoded unique ID.
 */
export const generateId = (): string => bs64.encode(defaultFlake.next());

/**
 * Alias for generateId for Woody RPC tracing.
 */
export const generateTraceId: typeof generateId = generateId;
