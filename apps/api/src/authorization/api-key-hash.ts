import { createHash, randomBytes } from "node:crypto";

/**
 * Prefixo que identifica uma API Key (F4.1) em vez de um JWT de sessão.
 * Permite ao AuthenticationGuard decidir o caminho de autenticação sem
 * tentar decodificar o token duas vezes.
 */
export const API_KEY_PREFIX = "axk_";

/**
 * SHA-256 é suficiente (e correto) aqui: a chave já nasce com alta entropia
 * (32 bytes aleatórios), diferente de uma senha humana. O objetivo do hash
 * não é retardar força bruta (não há o que adivinhar), é permitir a busca
 * por igualdade no banco sem armazenar a chave em texto puro.
 */
export function hashApiKey(plainKey: string): string {
  return createHash("sha256").update(plainKey, "utf8").digest("hex");
}

export function generateApiKey(): { plainKey: string; keyPrefix: string } {
  const raw = randomBytes(32).toString("base64url");
  const plainKey = `${API_KEY_PREFIX}${raw}`;
  return { plainKey, keyPrefix: plainKey.slice(0, 12) };
}
