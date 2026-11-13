import { ChevronLeft, ChevronRight, MapPinCheck, Flag } from 'lucide-react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { useMapActions, useWatchUserLocation } from '@/features/map';
import type { RouteDetail } from '@/shared/api';
import { boundsOfPoints } from '@/shared/lib/geo';
import { Button, IconButton, PanelLayout, SPRING, TWEEN } from '@/shared/ui';

import { pathToPoints } from '../lib/geometry';
import { numberStops } from '../lib/stops';
import { RouteMapLayer } from '../map/RouteMapLayer';
import { NextStopGuide } from './NextStopGuide';
import { useWalkProgress } from './useWalkProgress';
import { WalkFinish } from './WalkFinish';
import { WalkStopCard } from './WalkStopCard';

const SWIPE_OFFSET_PX = 70;
const SWIPE_VELOCITY = 400;

const slide = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 48 }),
  center: { opacity: 1, x: 0, transition: SPRING.sheet },
  exit: (direction: number) => ({ opacity: 0, x: direction * -48, transition: TWEEN.fast }),
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-canvas"
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full origin-left rounded-full bg-beam"
        initial={false}
        animate={{ scaleX: value }}
        transition={SPRING.soft}
      />
    </div>
  );
}

interface WalkModeProps {
  route: RouteDetail;
  onExit: () => void;
}

/**
 * «Пройти маршрут» — a focused phone stepper: the current stop, the landmark and live
 * direction to the next one, progress, swipe or buttons between stops, «Я на месте» to
 * advance, and a finish screen. The map follows the active stop; progress survives reloads.
 */
export function WalkMode({ route, onExit }: WalkModeProps) {
  const stops = useMemo(() => numberStops(route), [route]);
  const progress = useWalkProgress(route.id, stops.length);
  const { flyTo, fitBounds } = useMapActions();
  const [direction, setDirection] = useState(1);
  useWatchUserLocation(!progress.finished);

  const current = stops[progress.index];
  const next = stops[progress.index + 1];
  const last = progress.index >= stops.length - 1;

  useEffect(() => {
    if (!progress.finished) {
      if (current) flyTo(current.stop, { minZoom: 16 });
      return;
    }
    const bounds = boundsOfPoints(pathToPoints(route.path));
    if (bounds) fitBounds(bounds);
  }, [current, progress.finished, flyTo, fitBounds, route.path]);

  const go = (delta: number) => {
    const target = progress.index + delta;
    if (target < 0 || target >= stops.length) return;
    setDirection(delta);
    progress.goTo(target);
  };

  const arrive = () => (last ? progress.finish() : go(1));

  const onSwipe = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_OFFSET_PX || info.velocity.x < -SWIPE_VELOCITY) go(1);
    else if (info.offset.x > SWIPE_OFFSET_PX || info.velocity.x > SWIPE_VELOCITY) go(-1);
  };

  const title = progress.finished ? 'Финиш' : `Точка ${progress.index + 1} из ${stops.length}`;

  return (
    <>
      <RouteMapLayer
        path={route.path}
        stops={stops}
        activePosition={progress.finished ? null : (current?.stop.position ?? null)}
        onStopClick={(position) => {
          const index = stops.findIndex((item) => item.stop.position === position);
          if (index !== -1) go(index - progress.index);
        }}
        fit={false}
      />
      <PanelLayout
        title={title}
        subtitle={route.title}
        onBack={onExit}
        backLabel="Выйти из прогулки"
        toolbar={
          <ProgressBar
            value={progress.finished ? 1 : (progress.index + 1) / Math.max(1, stops.length)}
          />
        }
        footer={
          !progress.finished && (
            <div className="flex items-center gap-2">
              <IconButton
                icon={ChevronLeft}
                label="Предыдущая точка"
                size="lg"
                variant="surface"
                disabled={progress.index === 0}
                onClick={() => go(-1)}
              />
              <Button
                block
                size="lg"
                icon={last ? Flag : MapPinCheck}
                onClick={arrive}
                className="flex-1"
              >
                {last ? 'Завершить маршрут' : 'Я на месте'}
              </Button>
              <IconButton
                icon={ChevronRight}
                label="Следующая точка"
                size="lg"
                variant="surface"
                disabled={last}
                onClick={() => go(1)}
              />
            </div>
          )
        }
      >
        {progress.finished ? (
          <WalkFinish
            route={route}
            onRestart={() => {
              setDirection(-1);
              progress.restart();
            }}
            onClose={onExit}
          />
        ) : (
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            {current && (
              <motion.div
                key={current.stop.position}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.25}
                onDragEnd={onSwipe}
                data-sheet-ignore
                className="flex touch-pan-y flex-col gap-4"
              >
                <WalkStopCard
                  item={current}
                  total={stops.length}
                  guide={next && <NextStopGuide next={next} />}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </PanelLayout>
    </>
  );
}
