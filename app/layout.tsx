import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hanzi Desk — Learn Chinese Characters',
  description:
    'Practice simplified Chinese characters with pinyin, pronunciation, handwriting, a built-in dictionary, and TrainChinese writing videos.',
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
