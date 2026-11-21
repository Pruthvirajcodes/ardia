import { Box, Button, PopUp, space, Text, type Option } from "../../ui";
import { Anchor, FormField, Group, Row, SectionHeader } from "../Form";
import { PictureChoice } from "../PictureChoice";
import { CtrlTabPreview } from "../ChoicePreviews";
import { setting } from "../settingsIndex";
import { chooseCtrlTab, ctrlTabCustomQuery, useCtrlTabChoice } from "../../../state/commands/commandShortcuts";
import type { CtrlTabPreset } from "../../../state/commands/ctrlTabKeys";
import { PLATFORM_TERMS } from "../../../lib/platformTerms";
import { setShortcutsQuery } from "../../../state/settings/searchState";
import { goToSettingsPane } from "../../../state/settings/settingsWindows";
import { useSettings } from "../../../state/browser/hooks";
import { updateSettings } from "../../../state/settings/actions";
import type { Settings } from "../../../state/settings/settings";

const CTRL_TAB_KEY = PLATFORM_TERMS.switchTabsKey;

const CTRL_TAB: { value: CtrlTabPreset; title: string; caption: string }[] = [
  { value: "step", title: "Step through tabs", caption: "Goes one tab down the list, like Chrome." },
  { value: "switcher", title: "Recent tabs switcher", caption: "Shows recent tabs; let go to switch, like Arc." },
];

const SWITCHER_STYLES: Option<Settings["tabSwitcherStyle"]>[] = [
  { value: "pictures", title: "Pictures" },
  { value: "list", title: "List" },
];

export function SwitchingTabsSection() {
  const choice = useCtrlTabChoice();
  const switcherStyle = useSettings((s) => s.tabSwitcherStyle);
  return (
    <>
      <SectionHeader title="Switching tabs" />
      <Anchor id="appearance.ctrlTab" shape="card">
        <FormField label={setting("appearance.ctrlTab").title}>
          <Box row gap="xl" accessibilityRole="radiogroup">
            {CTRL_TAB.map((c) => (
              <PictureChoice key={c.value} title={c.title} caption={c.caption} selected={choice === c.value} onPress={() => chooseCtrlTab(c.value)} size="l">
                <CtrlTabPreview preset={c.value} />
              </PictureChoice>
            ))}
          </Box>
          {choice === "custom" && <CustomCtrlTabNote />}
        </FormField>
      </Anchor>
      <Group>
        <Row anchor="appearance.tabSwitcherStyle">
          <PopUp value={switcherStyle} options={SWITCHER_STYLES} onChange={(v) => updateSettings({ tabSwitcherStyle: v })} minWidth={120} />
        </Row>
      </Group>
    </>
  );
}

function CustomCtrlTabNote() {
  const showKeys = () => {
    setShortcutsQuery(ctrlTabCustomQuery());
    goToSettingsPane("shortcuts");
  };
  return (
    <Box row gap="s" style={CUSTOM_NOTE}>
      <Text size="caption" tone="textSecondary" style={FILL}>
        {`Custom: you set your own keys for ${CTRL_TAB_KEY} in Shortcuts. Pick one above to use it instead.`}
      </Text>
      <Button title="Show in Shortcuts" onPress={showKeys} />
    </Box>
  );
}

const FILL = { flex: 1 } as const;
const CUSTOM_NOTE = { alignItems: "center", marginTop: space.l } as const;
