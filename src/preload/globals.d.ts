import type { Bridge } from '@shared/api';
import type { CaptureBridge } from '@shared/capture';

declare global {
  interface Window {
    api: Bridge;
    capture: CaptureBridge;
  }
}

export {};
