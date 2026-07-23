import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  expiresAt: number | null;
  onExpired: () => void;
}

/**
 * ARCH_REVIEW: Countdown timer that updates every second.
 * Shows MM:SS format. When time hits zero, calls onExpired.
 * The parent should handle cleanup; we just report the expiry event.
 */
export default function CountdownTimer({ expiresAt, onExpired }: CountdownTimerProps) {
  const [display, setDisplay] = useState<string>('30:00');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      if (remaining <= 0) {
        setDisplay('00:00');
        setIsExpired(true);
        onExpired();
        clearInterval(interval);
      } else {
        setDisplay(
          `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  if (!expiresAt) {
    return <span className="text-gray-500">--:--</span>;
  }

  return (
    <span
      className={`font-mono text-lg font-semibold tabular-nums ${
        isExpired
          ? 'text-red-400'
          : display <= '05:00'
            ? 'text-yellow-400'
            : 'text-gray-300'
      }`}
      title={`Room expires at ${new Date(expiresAt).toLocaleTimeString()}`}
    >
      {display}
    </span>
  );
}