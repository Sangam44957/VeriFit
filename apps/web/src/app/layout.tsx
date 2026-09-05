import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VeriFit — Candidate Evidence Platform',
  description: 'Intelligent candidate evidence collection and placement ranking',
  keywords: ['placement', 'recruitment', 'candidate', 'evidence', 'ranking'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>{children}</body>
    </html>
  );
}
