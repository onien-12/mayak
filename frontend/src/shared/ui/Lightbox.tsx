import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useScrollLock } from '../hooks/useScrollLock';
import { IconButton } from './IconButton';
import { LightboxSlide } from './lightbox/LightboxSlide';
import { PhotoInfo } from './lightbox/PhotoInfo';
import { LightboxThumbs } from './lightbox/LightboxThumbs';
import type { ViewerPhoto } from './lightbox/types';
import { SLIDE_GAP, useLightboxGestures } from './lightbox/useLightboxGestures';
import { fadeVariants, SPRING } from './motion';
import { useDialogFocus } from './useDialogFocus';

export type { ViewerPhoto } from './lightbox/types';

interface LightboxProps {
  /** Our `Photo` records as they are, or hot-linked photos with their `source`. */
  photos: readonly ViewerPhoto[];
  /** Index of the shown photo, `null` when closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  alt: string;
}

const ZOOM_STEP = 1.6;

function Viewer({ photos, index, onIndexChange, alt }: LightboxProps & { index: number }) {
  const count = photos.length;
  const photo = photos[index];
  const close = () => onIndexChange(null);
  const go = (next: number) => {
    if (next >= 0 && next < count && next !== index) onIndexChange(next);
  };
  const reduced = useReducedMotion() ?? false;
  const { stageRef, imageRef, ...gestures } = useLightboxGestures({
    index,
    count,
    onIndexChange: go,
    onClose: close,
    reduced,
  });
  const backdrop = useTransform(gestures.motion.pull, [0, 300], [1, 0.2]);
  const dialogRef = useDialogFocus<HTMLDivElement>(true, close);
  useScrollLock(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(index + 1);
      else if (event.key === 'ArrowLeft') go(index - 1);
      else if (event.key === '+' || event.key === '=') gestures.zoomBy(ZOOM_STEP);
      else if (event.key === '-') gestures.zoomBy(1 / ZOOM_STEP);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const slot = gestures.width + SLIDE_GAP;
  const near = [index - 1, index, index + 1].filter((i) => i >= 0 && i < count);

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${alt}: фото ${index + 1} из ${count}`}
      tabIndex={-1}
      variants={fadeVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[90] overflow-hidden outline-none"
    >
      <motion.div
        aria-hidden
        style={{ opacity: backdrop }}
        className="absolute inset-0 bg-ink/95"
      />
      <div
        ref={stageRef}
        {...gestures.handlers}
        className="absolute inset-0 touch-none select-none"
      >
        <motion.div
          initial={{ scale: 0.96 }}
          animate={{ scale: 1, transition: SPRING.sheet }}
          className="absolute inset-0"
        >
          {gestures.width > 0 && (
            <motion.div style={{ x: gestures.motion.track }} className="absolute inset-0">
              {near.map((i) => {
                const item = photos[i];
                return (
                  item && (
                    <LightboxSlide
                      key={`${i}:${item.url}`}
                      photo={item}
                      alt={`${alt} — фото ${i + 1}`}
                      left={i * slot}
                      width={gestures.width}
                      current={i === index}
                      zoomed={gestures.zoomed}
                      motion={gestures.motion}
                      imageRef={imageRef}
                    />
                  )
                );
              })}
            </motion.div>
          )}
        </motion.div>
      </div>

      {count > 1 && (
        <p
          aria-hidden
          className="absolute top-[max(12px,env(safe-area-inset-top))] left-3 flex h-11 items-center rounded-full bg-ink/60 px-3.5 text-sm font-semibold text-white tabular-nums backdrop-blur-sm"
        >
          {index + 1} / {count}
        </p>
      )}
      <IconButton
        icon={X}
        label="Закрыть"
        variant="overlay"
        size="lg"
        className="absolute top-[max(12px,env(safe-area-inset-top))] right-3 rounded-full"
        onClick={close}
      />
      {index > 0 && (
        <IconButton
          icon={ChevronLeft}
          label="Предыдущее фото"
          variant="overlay"
          size="lg"
          className="absolute top-1/2 left-4 hidden -translate-y-1/2 rounded-full md:inline-flex"
          onClick={() => go(index - 1)}
        />
      )}
      {index < count - 1 && (
        <IconButton
          icon={ChevronRight}
          label="Следующее фото"
          variant="overlay"
          size="lg"
          className="absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-full md:inline-flex"
          onClick={() => go(index + 1)}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-3">
        {photo && <PhotoInfo photo={photo} onClose={close} />}
        {count > 1 && <LightboxThumbs photos={photos} index={index} onSelect={go} />}
      </div>
    </motion.div>
  );
}

/**
 * Full-screen photo viewer for every photo in the product. Desktop: arrows, thumbnails,
 * ← → Esc, + / − and the wheel to zoom, click outside the photo to close. Touch: swipe
 * between photos, pull down to dismiss, pinch or double tap to zoom and drag to look around.
 * Focus is trapped and returned, the page does not scroll underneath, neighbours preload.
 */
export function Lightbox({ photos, index, onIndexChange, alt }: LightboxProps) {
  return createPortal(
    <AnimatePresence>
      {index !== null && index < photos.length && (
        <Viewer photos={photos} index={index} onIndexChange={onIndexChange} alt={alt} />
      )}
    </AnimatePresence>,
    document.body,
  );
}
