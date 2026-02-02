export default function Landing() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Sync-Trip</h1>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <a href="/create"><button>Create Session</button></a>
        <a href="/join"><button>Join Session</button></a>
      </div>
    </div>
  );
}