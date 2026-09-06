import { SetMetadata } from '@nestjs/common';

export interface ThrottleOptions {
  /** Key prefix — policies are named per 0_Phase.md §4. */
  key: string;
  points: number;
  /** Window in seconds. */
  duration: number;
  blockDuration?: number;
}

export const THROTTLE_KEY = 'throttle';
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_KEY, options);
