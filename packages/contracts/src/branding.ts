import { z } from "zod";

// Inline raster images avoid external tracking and executable SVG/HTML content.
export const BrandingLogoSchema = z
  .string()
  .max(87410)
  .refine(value => {
    if (value === "") return true;
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value
    );
    if (!match || match[2]!.length % 4 !== 0) return false;
    return match[1] === "png"
      ? match[2]!.startsWith("iVBORw0KGgo")
      : match[2]!.startsWith("/9j/");
  }, "Use uma imagem PNG ou JPEG de até 64 KB.");
export const TenantBrandingSchema = z
  .object({
    logo: BrandingLogoSchema,
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    menuColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
export type TenantBranding = z.infer<typeof TenantBrandingSchema>;
export const defaultBranding: TenantBranding = {
  logo: "",
  primaryColor: "#0e7490",
  menuColor: "#fbfcfd",
};
