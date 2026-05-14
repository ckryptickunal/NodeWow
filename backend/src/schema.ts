import { z } from 'zod';

export const SceneSchema = z.object({
  sceneId: z.string(),
  title: z.string(),
  summary: z.string(),
});

export const FrameSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  frameIndex: z.number().int().nonnegative(),
  prompt: z.string().min(10),
  visualConsistencyNotes: z.string().optional(),
});

export const PlanSchema = z
  .object({
    totalFrames: z.number().int().positive(),
    scenes: z.array(SceneSchema).min(1),
    frames: z.array(FrameSchema).min(1),
  })
  .refine((p) => p.totalFrames === p.frames.length, {
    message: 'totalFrames must equal frames.length',
  });

export type Scene = z.infer<typeof SceneSchema>;
export type Frame = z.infer<typeof FrameSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export const RunRequestSchema = z.object({
  collatedPrompt: z.string().min(10, 'Prompt must be at least 10 characters'),
});
