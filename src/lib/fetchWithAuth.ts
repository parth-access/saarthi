import { authHeaders } from "@/lib/authHeaders";

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const auth = await authHeaders();

  if (!auth) {
    throw new Error("User not authenticated");
  }

  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "Content-Type": "application/json",
      ...auth,
    },
  });
}
