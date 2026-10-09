import { z } from "zod";

const neoUrlSchema = z
  .string()
  .trim()
  .url()
  .pipe(
    z.string().refine(value => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    })
  );

export type EmbeddedApplication = {
  id: string;
  name: string;
  src: string;
  origin: string;
  defaultHeight: number;
  minHeight: number;
  maxHeight: number;
  maxWidth: number;
};

export type CommunicationConfiguration =
  | { status: "disabled" | "invalid" }
  | {
      status: "ready";
      mode: "iframe" | "tab";
      application: EmbeddedApplication;
    };

const frameDimensionSchema = z.coerce.number().int().min(320).max(1600);
const openingConfigurationSchema = z.object({
  mode: z.enum(["iframe", "tab"]),
  height: frameDimensionSchema,
  maxWidth: frameDimensionSchema,
});

export function readCommunicationApplication(
  env: Record<string, string | undefined>
): CommunicationConfiguration {
  const value = env.NEO_INTERACT_URL?.trim();
  if (!value) return { status: "disabled" };
  const result = neoUrlSchema.safeParse(value);
  if (!result.success) return { status: "invalid" };
  const opening = openingConfigurationSchema.safeParse({
    mode: env.NEO_INTERACT_MODE?.trim() || "iframe",
    height: env.NEO_INTERACT_FRAME_HEIGHT?.trim() || 800,
    maxWidth: env.NEO_INTERACT_FRAME_MAX_WIDTH?.trim() || 1600,
  });
  if (!opening.success) return { status: "invalid" };
  const url = new URL(result.data);
  if (env.WEB_ORIGIN) {
    try {
      if (url.origin === new URL(env.WEB_ORIGIN.trim()).origin)
        return { status: "invalid" };
    } catch {
      return { status: "invalid" };
    }
  }
  return {
    status: "ready",
    mode: opening.data.mode,
    application: {
      id: "neo-interact",
      name: "NEO Interact",
      src: url.href,
      origin: url.origin,
      defaultHeight: opening.data.height,
      minHeight: 320,
      maxHeight: 1600,
      maxWidth: opening.data.maxWidth,
    },
  };
}

const frameMessageSchema = z.object({
  type: z.literal("TOGGLE_IFRAME_SIZE"),
  isExpanded: z.boolean(),
  width: z.number().finite().positive().max(10000).optional(),
  height: z.number().finite().positive().max(10000).optional(),
});
export type FrameSize = Pick<
  z.infer<typeof frameMessageSchema>,
  "isExpanded" | "width" | "height"
>;
export function parseFrameMessage(value: unknown) {
  return frameMessageSchema.safeParse(value);
}

export function resolveFrameDimensions(
  message: FrameSize,
  containerWidth: number,
  application?: EmbeddedApplication
) {
  const defaults = application ?? {
    defaultHeight: 800,
    minHeight: 320,
    maxHeight: 1600,
    maxWidth: 1600,
  };
  if (!message.isExpanded)
    return { width: "100%", height: defaults.defaultHeight };
  const available =
    Number.isFinite(containerWidth) && containerWidth > 0
      ? containerWidth
      : defaults.maxWidth;
  return {
    width: `${Math.round(Math.max(1, Math.min(message.width ?? available, available, defaults.maxWidth)))}px`,
    height: Math.round(
      Math.max(
        defaults.minHeight,
        Math.min(message.height ?? defaults.defaultHeight, defaults.maxHeight)
      )
    ),
  };
}
