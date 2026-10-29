// Fixture only: owned by frontend=next. Never built.
export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
  // forge:if auth=jwt
  authCookieName: "forge_session",
  // forge:end
};
