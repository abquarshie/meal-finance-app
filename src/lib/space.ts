import "server-only";
import { cookies, headers } from "next/headers";
import { asSpace, SPACE_COOKIE, SPACE_HEADER, type Space } from "./apps";

/** The app this request is being shown in, as the proxy worked it out. */
export async function currentSpace(): Promise<Space> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return asSpace(h.get(SPACE_HEADER) ?? c.get(SPACE_COOKIE)?.value);
}
