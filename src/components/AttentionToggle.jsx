export default function AttentionToggle({ value, onChange, count }) {
  return (
    <section className="controls">
      <label className="attention-toggle">
        <input
          type="checkbox"
          checked={value}
          onChange={e => onChange(e.target.checked)}
          aria-describedby="attention-toggle-count"
        />
        ⚠ Solo necesitan atención{' '}
        <span id="attention-toggle-count" className="attention-toggle-count">({count})</span>
      </label>
    </section>
  );
}
