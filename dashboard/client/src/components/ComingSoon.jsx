export default function ComingSoon({ title }) {
  return (
    <div className="coming-soon">
      <div className="coming-soon-icon">🚧</div>
      <h2 className="coming-soon-title">{title}</h2>
      <p className="coming-soon-subtitle">Coming Soon</p>
      <p className="coming-soon-desc">This page is under construction. Check back later.</p>
    </div>
  );
}
