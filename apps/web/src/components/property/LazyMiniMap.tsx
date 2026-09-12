'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@rentuz/ui';

/** maplibre-gl is heavy — never in the RSC critical path (§1.5 task 9). */
const PropertyMiniMap = dynamic(
  () => import('./PropertyMiniMap').then((m) => m.PropertyMiniMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full rounded-[16px]" />,
  },
);

export function LazyMiniMap(props: { lng: number; lat: number; label: string }) {
  return <PropertyMiniMap {...props} />;
}
