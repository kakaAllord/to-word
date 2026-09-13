import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'to-word',
  description: 'Proofread machine transcripts against the audio, export to Word.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The player bar must not be covered by the on-screen keyboard (spec 8.6).
  viewportFit: 'cover',
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
