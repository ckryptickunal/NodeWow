'use client';

import { useParams } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import FlowCanvas from '@/components/flow/FlowCanvas';

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#121212]">
      <ReactFlowProvider>
        <FlowCanvas loadRunId={runId} />
      </ReactFlowProvider>
    </main>
  );
}
