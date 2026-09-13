import type { Metadata } from 'next';
import { MapExplorer } from '@/components/map/MapExplorer';

export const metadata: Metadata = {
  title: 'Xarita',
  description: "Xaritada ijara uylarni hudud bo'yicha ko'ring — region, narx va tur filtrlari bilan.",
  alternates: { canonical: '/map' },
  openGraph: {
    title: 'Xarita — RentUZ',
    description: "Xaritada ijara uylarni hudud bo'yicha ko'ring.",
    url: '/map',
    siteName: 'RentUZ',
    type: 'website',
  },
};

export default function MapPage() {
  return <MapExplorer />;
}
