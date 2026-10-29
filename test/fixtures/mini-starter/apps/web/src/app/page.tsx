// Fixture only: owned by frontend=next. Never built.
export default function HomePage() {
  return (
    <main>
      <h1>mini-starter</h1>
      {/* forge:if auth=jwt */}
      <a href="/login">Sign in</a>
      {/* forge:end */}
    </main>
  );
}
