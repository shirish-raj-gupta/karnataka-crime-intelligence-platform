import Icon from "../Icon.jsx";

/** Page header: icon tile + title + subtitle, with an optional right-side slot. */
export default function PageHead({ icon, title, subtitle, right }) {
  return (
    <div className="page-head">
      <div className="page-head-main">
        <h2>
          <span className="page-icon"><Icon name={icon} size={20} /></span>
          {title}
        </h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right && <div className="page-head-right">{right}</div>}
    </div>
  );
}
