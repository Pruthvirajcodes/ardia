import assert from "node:assert/strict";
import { test } from "node:test";

const { FRAME_UNDER_OLD_PEEK_GAP, noteSidebarJumpHide, noteSidebarPeekFrame, takeDockCounts } = await import("./dockCounts.ts");

test("a peek on a frame thinner than the old 4 pt peek gap is counted, and the count resets once taken", () => {
  takeDockCounts();
  for (const inset of [0, 1, 2, 3, FRAME_UNDER_OLD_PEEK_GAP, 9, 12]) noteSidebarPeekFrame(inset);
  assert.equal(takeDockCounts().sidebar_thin_frame_peeks, 4);
  assert.equal(takeDockCounts().sidebar_thin_frame_peeks, 0);
});

test("a hide that doesn't slide is counted apart from the slides, and the count resets once taken", () => {
  takeDockCounts();
  noteSidebarJumpHide();
  const taken = takeDockCounts();
  assert.equal(taken.sidebar_jump_hides, 1);
  assert.equal(taken.sidebar_slides, 0);
  assert.equal(takeDockCounts().sidebar_jump_hides, 0);
});
