import { useCallback, useEffect, useState } from 'react';

// Converts the percent-based seat layout into container-local pixel coords.
// Returns a callback ref — attach it to the table container div.
// (A normal ref + one-shot effect misses the container when it mounts late,
//  e.g. after the "connecting" screen — that left size at 0x0 forever.)
export function useSeatCoords(seatToVisual) {
  const [el, setEl] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!el) return;
    const update = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const pctToPx = useCallback((pct) => {
    const x = (parseFloat(pct.left) / 100) * size.w;
    const y = (parseFloat(pct.top) / 100) * size.h;
    return { x, y };
  }, [size]);

  const getSeatXY = useCallback((position) => {
    const v = seatToVisual.get(position);
    return v ? pctToPx(v.seat) : { x: size.w / 2, y: size.h / 2 };
  }, [seatToVisual, pctToPx, size]);

  const getBetXY = useCallback((position) => {
    const v = seatToVisual.get(position);
    return v ? pctToPx(v.bet) : { x: size.w / 2, y: size.h / 2 };
  }, [seatToVisual, pctToPx, size]);

  const centerXY = { x: size.w / 2, y: size.h * 0.42 };
  const ready = size.w > 0 && size.h > 0;

  return { containerRefCb: setEl, getSeatXY, getBetXY, centerXY, containerSize: size, ready };
}
