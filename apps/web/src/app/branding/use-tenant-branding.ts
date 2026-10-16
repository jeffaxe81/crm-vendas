"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  defaultBranding,
  TenantBrandingSchema,
  type TenantBranding,
  type AuthSessionResponse,
} from "@axes/contracts";
import { apiRequest } from "../../lib/api-client";

export const brandingStorageKey = "axes-crm:last-tenant-branding:v1";
type Remembered = { organizationId: string; branding: TenantBranding };
export function useTenantBranding(session: AuthSessionResponse | null) {
  const currentSession = useRef(session);
  currentSession.current = session;
  const [remembered, setRemembered] = useState<Remembered | null>(null);
  const [loaded, setLoaded] = useState<Remembered | null>(null);
  const [error, setError] = useState("");
  const organizationId = session?.organization.id;
  const accessToken = session?.accessToken;
  useEffect(() => {
    try {
      const cached = JSON.parse(
        localStorage.getItem(brandingStorageKey) ?? "null"
      );
      const parsed = TenantBrandingSchema.safeParse(cached?.branding);
      if (typeof cached?.organizationId === "string" && parsed.success)
        setRemembered({
          organizationId: cached.organizationId,
          branding: parsed.data,
        });
    } catch {
      /* Browser storage is optional. */
    }
  }, []);
  function remember(value: Remembered) {
    setRemembered(value);
    try {
      localStorage.setItem(brandingStorageKey, JSON.stringify(value));
    } catch {
      /* Identity remains usable when storage is disabled. */
    }
  }
  useEffect(() => {
    if (!organizationId || !accessToken) return;
    let active = true;
    setError("");
    void apiRequest<unknown>("/organization/branding", { accessToken })
      .then(body => {
        const branding = TenantBrandingSchema.parse(body);
        if (!active) return;
        const value = { organizationId, branding };
        setLoaded(value);
        remember(value);
      })
      .catch(() => {
        if (!active) return;
        setError(
          "Não foi possível carregar a identidade visual. Usando o padrão."
        );
        // Never display a previous tenant's profile on a failed tenant load.
        const value = { organizationId, branding: { ...defaultBranding } };
        setLoaded(value);
        remember(value);
      });
    return () => {
      active = false;
    };
  }, [organizationId, accessToken]);
  const branding = session
    ? loaded && loaded.organizationId === organizationId
      ? loaded.branding
      : defaultBranding
    : (remembered?.branding ?? defaultBranding);
  async function save(input: TenantBranding) {
    if (!session) throw Error("Sessão necessária.");
    const body = await apiRequest<unknown>("/organization/branding", {
      accessToken: session.accessToken,
      method: "PUT",
      body: input,
    });
    if (
      currentSession.current?.organization.id !== session.organization.id ||
      currentSession.current?.accessToken !== session.accessToken
    )
      throw Error("A sessão mudou. Reabra a configuração da empresa atual.");
    const value = {
      organizationId: session.organization.id,
      branding: TenantBrandingSchema.parse(body),
    };
    setLoaded(value);
    remember(value);
    setError("");
    return value.branding;
  }
  return {
    branding,
    save,
    error,
    loading: Boolean(session && loaded?.organizationId !== organizationId),
  };
}

export function foreground(color: string): string {
  const channels = [1, 3, 5]
    .map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(value =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
  const luminance =
    channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return luminance > 0.179 ? "#111111" : "#ffffff";
}
export function brandingStyle(branding: TenantBranding): CSSProperties {
  return {
    "--crm-primary": branding.primaryColor,
    "--crm-primary-hover": branding.primaryColor,
    "--branding-primary-text": foreground(branding.primaryColor),
    "--branding-menu": branding.menuColor,
    "--branding-menu-text": foreground(branding.menuColor),
  } as CSSProperties;
}
