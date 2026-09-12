import type { Metadata } from 'next';
import { MapExplorer } from '@/components/map/MapExplorer';

export const metadata: Metadata = {
  title: 'Xarita',
  description: "Xaritada ijara uylarni hudud bo'yicha ko'ring.",
};

export default function MapPage() {
  return <MapExplorer />;
}
