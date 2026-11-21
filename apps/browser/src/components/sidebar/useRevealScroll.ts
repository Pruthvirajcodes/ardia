import { useEffect, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";
import { revealedOffset } from "./switcherScroll";

const OWN_SCROLL_MS = 120;
const OWN_ANIMATED_SCROLL_MS = 450;

type RevealScroll = { axis: "x" | "y"; index: number; viewport: number; size: number; stride: number; onWheel?: () => void };

export function useRevealScroll({ axis, index, viewport, size, stride, onWheel }: RevealScroll) {
  const scroll = useRef<ScrollView>(null);
  const reveal = (at: number, from: number) => revealedOffset(at, from, viewport, size, stride);
  const [opening] = useState(() => {
    const start = reveal(index, 0);
    return axis === "x" ? { x: start, y: 0 } : { x: 0, y: start };
  });
  const offset = useRef(axis === "x" ? opening.x : opening.y);
  const placed = useRef(false);
  const shownIndex = useRef(index);
  const ownScrollUntil = useRef(0);
  const wheeled = useRef(false);

  const scrollTo = (to: number, animated: boolean) => {
    offset.current = to;
    ownScrollUntil.current = performance.now() + (animated ? OWN_ANIMATED_SCROLL_MS : OWN_SCROLL_MS);
    scroll.current?.scrollTo(axis === "x" ? { x: to, animated } : { y: to, animated });
  };

  useEffect(() => {
    const moved = shownIndex.current !== index;
    shownIndex.current = index;
    if (!placed.current) return;
    const next = reveal(index, offset.current);
    if (Math.abs(next - offset.current) >= 0.5) scrollTo(next, moved);
  }, [index, viewport]);

  const onContentSizeChange = () => {
    if (placed.current) return void (ownScrollUntil.current = performance.now() + OWN_SCROLL_MS);
    placed.current = true;
    scrollTo(reveal(shownIndex.current, offset.current), false);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset[axis];
    if (wheeled.current || performance.now() < ownScrollUntil.current) return;
    wheeled.current = true;
    onWheel?.();
  };

  return { scroll, opening, onContentSizeChange, onScroll };
}
