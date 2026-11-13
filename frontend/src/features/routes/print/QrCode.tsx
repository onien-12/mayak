import { create } from 'qrcode';
import { useMemo } from 'react';

const QUIET_ZONE = 2;

/** Crisp vector QR code (prints sharp at any size). */
export function QrCode({
  value,
  size,
  className,
}: {
  value: string;
  size: number;
  className?: string;
}) {
  const { path, total } = useMemo(() => {
    const { modules } = create(value, { errorCorrectionLevel: 'M' });
    const cells: string[] = [];
    for (let row = 0; row < modules.size; row += 1) {
      for (let col = 0; col < modules.size; col += 1) {
        if (modules.data[row * modules.size + col]) {
          cells.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
        }
      }
    }
    return { path: cells.join(''), total: modules.size + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label="QR-код со ссылкой на маршрут"
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={path} fill="#0B1D2E" />
    </svg>
  );
}
