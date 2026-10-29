// Fixture only: owned by auth=jwt (protects /dashboard). Never built.
export const config = { matcher: ["/dashboard/:path*"] };

export function middleware() {
  return undefined;
}
