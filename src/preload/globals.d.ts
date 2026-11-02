import type { Bridge } from '@shared/api';
import type { CaptureBridge } from '@shared/capture';
import type { LiveBridge } from '@shared/live';

declare global {
  interface Window {
    api: Bridge;
    capture: CaptureBridge;
    live: LiveBridge;
  }
}

export {};
