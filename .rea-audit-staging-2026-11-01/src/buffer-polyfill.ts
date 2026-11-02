import { Buffer } from 'buffer/'

if (typeof Reflect.get(globalThis, 'Buffer') === 'undefined') {
  Object.defineProperty(globalThis, 'Buffer', { value: Buffer, configurable: true, writable: true })
}
