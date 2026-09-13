import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RentUZ',
    short_name: 'RentUZ',
    description: "O'zbekistondagi ijara uylarni izlang — narx, hudud va sharoit bo'yicha.",
    start_url: '/',
    display: 'standalone',
    background_color: '#080808',
    theme_color: '#080808',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
    ],
  };
}
