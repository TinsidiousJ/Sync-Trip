export default function JoinSession() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h2>Join Session</h2>

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>
          Display name
          <input placeholder="e.g. JohnDoe" style={{ width: "100%" }} />
        </label>

        <label>
          Session code
          <input placeholder="e.g. ABC123" style={{ width: "100%" }} />
        </label>

        <button>Join</button>
      </div>
    </div>
  );
}