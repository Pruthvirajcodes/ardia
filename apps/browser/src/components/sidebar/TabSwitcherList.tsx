import { memo, useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { displayUrl } from "@ardia/core";
import { tabTitle } from "../../state/browser/model";
import { useTab } from "../../state/browser/hooks";
import { commitSwitcher, hoverSwitcherRow, leaveSwitcherRow } from "../../state/sidebar/switcher";
import { FadeLabel, Panel, Text } from "../ui";
import { useTheme } from "../ui/theme";
import { TabIcon } from "./TabIcon";
import { useRevealScroll } from "./useRevealScroll";
import { SIDEBAR_SHADOW, TAB_SWITCHER, TAB_SWITCHER_LIST as L, tabSwitcherColors } from "./tokens";

export function TabSwitcherList({ ids, index, windowWidth, windowHeight }: { ids: string[]; index: number; windowWidth: number; windowHeight: number }) {
  const theme = useTheme();
  const colors = tabSwitcherColors(theme.dark);
  const fits = Math.max(1, Math.floor((windowHeight - L.windowMargin - 2 * L.pad - L.header) / L.row));
  const count = Math.min(fits, ids.length);
  const viewport = count * L.row;
  const width = Math.min(L.width, windowWidth - L.windowMargin);
  const height = 2 * L.pad + L.header + viewport;

  return (
    <View style={{ position: "absolute", left: (windowWidth - width) / 2, top: (windowHeight - height) / 2, width, height }}>
      <Panel fill={colors.fill} radius={TAB_SWITCHER.panelRadius} border={theme.panelBorder} shadow={SIDEBAR_SHADOW.tabSwitcher} style={StyleSheet.absoluteFill} />
      <View style={{ padding: L.pad }}>
        <Text lines={1} size="caption" weight="semibold" color={colors.onPanel} style={{ height: L.header, paddingHorizontal: L.rowInset, paddingTop: L.headerTop, paddingBottom: L.headerBottom }}>
          Recent Tabs
        </Text>
        <SwitcherColumn ids={ids} index={index} viewport={viewport} overflows={count < ids.length} />
      </View>
    </View>
  );
}

function SwitcherColumn({ ids, index, viewport, overflows }: { ids: string[]; index: number; viewport: number; overflows: boolean }) {
  const { scroll, opening, onContentSizeChange, onScroll } = useRevealScroll({ axis: "y", index, viewport, size: L.row, stride: L.row });

  return (
    <ScrollView
      ref={scroll}
      showsVerticalScrollIndicator={false}
      scrollEnabled={overflows}
      scrollEventThrottle={16}
      contentOffset={opening}
      onContentSizeChange={onContentSizeChange}
      onScroll={onScroll}
      style={{ height: viewport }}
    >
      {ids.map((id, i) => (
        <SwitcherListRow key={id} tabId={id} index={i} focused={i === index} />
      ))}
    </ScrollView>
  );
}

const SwitcherListRow = memo(function SwitcherListRow({ tabId, index, focused }: { tabId: string; index: number; focused: boolean }) {
  const tab = useTab(tabId);
  const colors = tabSwitcherColors(useTheme().dark);
  useEffect(() => () => leaveSwitcherRow(index), [index]);
  if (!tab) return null;
  const url = tab.url || tab.pinnedUrl || "";

  return (
    <Pressable onPressIn={() => commitSwitcher(index)}>
      <View
        onMouseEnter={() => hoverSwitcherRow(index)}
        onMouseLeave={() => leaveSwitcherRow(index)}
        style={{
          height: L.row,
          borderRadius: L.rowRadius,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: L.rowInset,
          gap: L.rowGap,
          backgroundColor: focused ? colors.focusFill : undefined,
          borderWidth: focused ? L.ring : 0,
          borderColor: colors.restRing,
        }}
      >
        <TabIcon tabId={tab.id} url={url} favicon={tab.favicon} icon={tab.customIcon} profileId={tab.profileId} size={L.icon} color={colors.onPanel} />
        <View style={{ flex: 1 }}>
          <FadeLabel text={tabTitle(tab)} fontSize={L.titleSize} weight={focused ? "medium" : "regular"} color={colors.title} style={{ height: L.titleHeight }} />
          {url ? <FadeLabel text={displayUrl(url)} fontSize={L.urlSize} color={colors.onPanel} style={{ height: L.urlHeight }} /> : null}
        </View>
      </View>
    </Pressable>
  );
});
