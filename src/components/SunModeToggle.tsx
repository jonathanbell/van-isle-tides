interface Props {
  isSun: boolean;
  onToggle: () => void;
}

export function SunModeToggle({ isSun, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isSun}
      className="sun-toggle"
      title="Toggle high-contrast sun mode"
    >
      {isSun ? 'Sun mode: on' : 'Sun mode'}
    </button>
  );
}
