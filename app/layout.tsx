import type { Metadata, Viewport } from 'next';
// Fonts are self-hosted so the app never waits on Google Fonts (blocked in mainland China).
import '@fontsource-variable/noto-serif-sc';
import '@fontsource-variable/source-sans-3';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hanzi Desk — Learn Chinese Characters',
  description:
    'Practice simplified Chinese characters with pinyin, pronunciation, handwriting, a built-in dictionary, and TrainChinese writing videos.',
  applicationName: 'Hanzi Desk',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Hanzi Desk',
    statusBarStyle: 'black',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#191713',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
