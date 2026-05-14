'use client';

import { ReactFlowProvider } from '@xyflow/react';
import FlowCanvas from '@/components/flow/FlowCanvas';

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#121212]">
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </main>
  );
}
