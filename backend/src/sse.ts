import { EventEmitter } from 'events';

export const runEvents = new EventEmitter();
runEvents.setMaxListeners(200);

export interface RunEvent {
  type:
    | 'connected'
    | 'plan_ready'
    | 'frame_queued'
    | 'frame_started'
    | 'frame_done'
    | 'frame_failed'
    | 'run_complete'
    | 'run_killed'
    | 'orchestrator_failed'
    | 'video_started'
    | 'video_motion_ready'
    | 'video_done'
    | 'video_failed';
  runId: string;
  data: Record<string, unknown>;
}

export function emitRunEvent(event: RunEvent) {
  runEvents.emit(`run:${event.runId}`, event);
}
