import Icon from "../Icon.jsx";

/**
 * Card — the primary surface. Optional title (with lucide icon), header-right
 * slot, and an "accent" color stripe. Reveals with a fade-up animation on mount.
 */
export default function Card({ title, icon, headRight, accent, children, className = "", style }) {
  return (
    <section className={`card ${accent ? "card-accent card-accent-" + accent : ""} ${className}`} style={style}>
      {(title || headRight) && (
        <header className="card-head">
          {title ? (
            <h2>
              {icon && <span className="h-ic"><Icon name={icon} size={16} /></span>}
              {title}
            </h2>
          ) : <span />}
          {headRight}
        </header>
      )}
      {children}
    </section>
  );
}
