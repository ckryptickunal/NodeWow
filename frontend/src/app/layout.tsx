import type { Metadata } from 'next';
import './globals.css';
import { ToastStack } from '@/components/ui/ToastStack';

export const metadata: Metadata = {
  title: 'NodeWow — Scene Orchestrator',
  description: 'Two-level LLM orchestration for parallel cinematic image generation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased font-body">
        {children}
        <ToastStack />
      </body>
    </html>
  );
}
