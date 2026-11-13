import { ImageOff } from 'lucide-react';
import { motion, useTransform } from 'motion/react';
import { useState, type RefObject } from 'react';

import { cn } from '../../lib/cn';
import type { ViewerPhoto } from './types';
import type { LightboxMotion } from './useLightboxGestures';

interface LightboxSlideProps {
  photo: ViewerPhoto;
  alt: string;
  left: number;
  width: number;
  /** The shown photo: it follows the pull and carries the zoom. */
  current: boolean;
  zoomed: boolean;
  motion: LightboxMotion;
  imageRef: RefObject<HTMLImageElement | null>;
}

/** One photo on the viewer's track; neighbours are rendered too, so they are already loaded. */
export function LightboxSlide({
  photo,
  alt,
  left,
  width,
  current,
  zoomed,
  motion: values,
  imageRef,
}: LightboxSlideProps) {
  const [failed, setFailed] = useState(false);
  const shrink = useTransform(values.pull, [0, 600], [1, 0.82]);

  return (
    <motion.div
      style={{ left, width, y: current ? values.pull : 0, scale: current ? shrink : 1 }}
      className="absolute inset-y-0 flex items-center justify-center px-2 pt-[max(64px,calc(env(safe-area-inset-top)+56px))] pb-[max(64px,calc(env(safe-area-inset-bottom)+56px))] md:px-20 md:py-24"
    >
      {failed ? (
        <p className="flex flex-col items-center gap-2 text-sm text-white/70">
          <ImageOff size={28} aria-hidden />
          Фото не загрузилось
        </p>
      ) : (
        <motion.img
          ref={current ? imageRef : undefined}
          src={photo.url}
          alt={alt}
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={current ? { x: values.panX, y: values.panY, scale: values.scale } : undefined}
          className={cn(
            'max-h-full max-w-full rounded-control object-contain shadow-float select-none',
            current && (zoomed ? 'pointer-fine:cursor-grab' : 'pointer-fine:cursor-zoom-in'),
          )}
        />
      )}
    </motion.div>
  );
}
