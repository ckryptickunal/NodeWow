import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import { PlanSchema, type Plan } from './schema.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const ORCHESTRATOR_SYSTEM = `You are a visual scene planner for cinematic image generation.
Given a collated prompt describing multiple scenes, decompose it into individual scenes and frames.

Return ONLY a valid JSON object (no markdown, no code fences) with this exact structure:
{
  "totalFrames": <number>,
  "scenes": [
    { "sceneId": "scene-1", "title": "Short title", "summary": "Brief description" }
  ],
  "frames": [
    {
      "id": "frame-1",
      "sceneId": "scene-1",
      "frameIndex": 0,
      "prompt": "The image generation prompt for this frame",
      "visualConsistencyNotes": "Notes for visual consistency with sibling frames"
    }
  ]
}

SCENE DETECTION — be intelligent about finding boundaries:
- Explicit labels: "Scene 1", "Scene 2:", "SCENE A —", "#1", "Shot 1"
- Titled sections: "Scene 1 — The Strike", "Scene 5 — Mehendi Mid-Draw"
- Numbered paragraphs, bullet points, or any clear structural separation
- Thematic shifts in subject, location, or mood when no explicit labels exist
- A single block of text with no separation = 1 scene with 1 frame
- Each distinct scene described by the user = 1 scene, 1 frame (unless the user explicitly asks for multiple angles/frames per scene)
- Do NOT split a single scene into multiple frames unless the user clearly describes multiple distinct shots within it

PROMPT HANDLING — critical:
- If the user's scene description is already detailed (mentions camera, lighting, composition, style, mood, lens, or technical photography terms), use it VERBATIM as the frame prompt. Do NOT paraphrase, summarise, or rewrite it. Copy it exactly.
- Only generate/expand a prompt if the user's description is brief or vague (e.g. "a sunset on a beach").
- For detailed prompts, your job is STRUCTURAL (scene/frame decomposition) not CREATIVE (rewriting).
- Strip only the scene label/number prefix (e.g. "Scene 1 — The Strike") from the prompt body; keep everything else intact.

Rules:
- totalFrames MUST exactly equal frames.length
- Each scene must have at least one frame
- Maintain visual consistency notes across frames in the same scene
- Frame IDs: "frame-1", "frame-2", …  Scene IDs: "scene-1", "scene-2", …`;

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
}

export async function orchestrate(collatedPrompt: string): Promise<Plan> {
  const response = await ai.models.generateContent({
    model: config.orchestratorModel,
    contents: `${ORCHESTRATOR_SYSTEM}\n\nCollated prompt:\n${collatedPrompt}`,
  });

  const raw = stripFences(response.text?.trim() ?? '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const retry = await ai.models.generateContent({
      model: config.orchestratorModel,
      contents: `The following was supposed to be valid JSON but failed to parse. Return ONLY the corrected JSON, nothing else:\n\n${raw}`,
    });
    parsed = JSON.parse(stripFences(retry.text?.trim() ?? ''));
  }

  return PlanSchema.parse(parsed);
}

/** Extract a short human-readable message from Gemini SDK errors. */
export function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  try {
    const body = JSON.parse(err.message);
    if (body?.error?.message) return body.error.message;
  } catch { /* not JSON */ }
  return err.message;
}

export interface ReferenceImage {
  mimeType: string;
  data: string;
}

export async function generateFrameImage(
  prompt: string,
  references: ReferenceImage[] = [],
): Promise<Buffer> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (references.length > 0) {
    parts.push({ text: `Use the following ${references.length} reference image(s) as style/mood/composition guidance for generation. Match their visual language closely.\n\n${prompt}` });
    for (const ref of references) {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
    }
  } else {
    parts.push({ text: prompt });
  }

  const response = await ai.models.generateContent({
    model: config.imageModel,
    contents: [{ role: 'user', parts }],
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: config.imageAspectRatio,
        imageSize: config.imageSize,
      },
    },
  });

  const responseParts = response.candidates?.[0]?.content?.parts;
  if (!responseParts?.length) {
    throw new Error('No image generated — the model returned an empty result');
  }

  for (const part of responseParts) {
    const p = part as Record<string, unknown>;
    if (p.inlineData) {
      const inline = p.inlineData as { data: string; mimeType: string };
      if (inline.data) {
        return Buffer.from(inline.data, 'base64');
      }
    }
  }

  throw new Error('No image data found in model response');
}
