export default function CreateSession() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h2>Create a New Trip Session</h2>

      <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>
          Display name
          <input placeholder="e.g. JohnDoe" style={{ width: "100%" }} />
        </label>

        <label>
          Session name
          <input placeholder="e.g. Paris 2026" style={{ width: "100%" }} />
        </label>

        <label>
          Planning stage
          <select style={{ width: "100%" }}>
            <option>Accommodation</option>
            <option>Activities</option>
          </select>
        </label>

        <label>
          Destination
          <input placeholder="e.g. Paris" style={{ width: "100%" }} />
        </label>

        <hr />

        <h3>Share with your group</h3>
        <div style={{ border: "1px solid #ccc", padding: 12 }}>
          <strong>Session Code:</strong> 
          <button style={{ marginLeft: 12 }}>Copy</button>
        </div>

        <button style={{ marginTop: 12 }}>Start Session</button>
      </div>
    </div>
  );
}