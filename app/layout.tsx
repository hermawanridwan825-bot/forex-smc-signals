import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SMC • ICT Signals Hub | Forex & Gold Realtime',
  description: 'Smart Money Concepts & ICT Institutional Forex and Gold (XAUUSD) Trading Signals',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark bg-zinc-950 text-zinc-100 antialiased">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
