import './Button.css';

/**
 * Button — primary (accent fill), ghost (default), subtle (no border).
 * size: 'sm' | 'md' (default)
 */
export default function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  disabled,
  type = 'button',
  className = '',
  style,
}) {
  const classes = ['ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}
