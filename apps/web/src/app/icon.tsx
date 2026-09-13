import { ImageResponse } from 'next/og';

/** App icon — §3 brand yellow "R" tile on the dark background. */
export default function icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080808',
          color: '#FFA31A',
          fontSize: 140,
          fontWeight: 700,
          borderRadius: 20,
        }}
      >
        R
      </div>
    ),
    { width: 256, height: 256 },
  );
}

export const size = { width: 256, height: 256 };
export const contentType = 'image/png';
