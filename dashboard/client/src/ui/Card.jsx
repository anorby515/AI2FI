import './Card.css';

/**
 * Bento Card — the one container primitive for all dashboard content.
 * variant: 'flat' (default) | 'grad' (gradient surface, for hero cards)
 * hover: lift on hover (true when clickable)
 * interactive: show pointer cursor + hover
 */
export default function Card({
  children,
  variant = 'flat',
  hover = false,
  interactive = false,
  onClick,
  className = '',
  style,
  as: Tag = 'div',
}) {
  const classes = [
    'ui-card',
    variant === 'grad' && 'ui-card--grad',
    (hover || interactive || onClick) && 'ui-card--hover',
    onClick && 'ui-card--interactive',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tag className={classes} style={style} onClick={onClick}>
      {children}
    </Tag>
  );
}
