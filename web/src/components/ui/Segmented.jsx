/**
 * Segmented control — a nicer alternative to a <select> for small option sets.
 * options: [{ value, label }]; value/onChange controlled.
 */
export default function Segmented({ options, value, onChange, label }) {
  return (
    <div className="seg-wrap">
      {label && <span className="seg-label">{label}</span>}
      <div className="segmented" role="tablist">
        {options.map((o) => (
          <button
            key={o.value}
            role="tab"
            aria-selected={value === o.value}
            className={"seg-btn" + (value === o.value ? " active" : "")}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
