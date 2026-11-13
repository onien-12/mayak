import { motion } from 'motion/react';

import type { LatLng } from '@/shared/lib/geo';
import { SPRING } from '@/shared/ui';

import { MapHtmlMarker } from './MapHtmlMarker';
import { PIN_PATH } from './pin';

const TAP_PIN = { width: 32, height: 37 };

/** Temporary "tapped here" pin: drops in at the given point, disappears when unmounted. */
export function MapTapPin({ position }: { position: LatLng }) {
  return (
    <MapHtmlMarker
      position={position}
      anchor={[TAP_PIN.width / 2, TAP_PIN.height - 1]}
      zIndex={45}
      passive
    >
      <motion.svg
        key={`${position.lat}:${position.lng}`}
        aria-hidden
        viewBox="0 0 40 46"
        width={TAP_PIN.width}
        height={TAP_PIN.height}
        initial={{ y: -14, opacity: 0, scale: 0.7 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={SPRING.pop}
        className="pointer-events-none origin-bottom overflow-visible drop-shadow-[0_2px_3px_rgb(11_29_46/0.35)]"
      >
        <path d={PIN_PATH} fill="var(--color-brand)" stroke="#fff" strokeWidth={2} />
        <circle cx="20" cy="20" r="5.5" fill="var(--color-beam)" />
      </motion.svg>
    </MapHtmlMarker>
  );
}
