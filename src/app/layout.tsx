import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KINETIX | Almgren-Chriss Optimal Execution Terminal',
  description: 'Production-grade institutional algorithmic execution engine for dreamDEX on Somnia.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-slate-100 min-h-screen antialiased selection:bg-accent/30 selection:text-accent">
        {children}
      </body>
    </html>
  );
}
