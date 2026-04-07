import { type ReactNode, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { MVP_REGION_SCOPE } from "../../shared/config/region-scope";
import type {
  DeepDiveFilters,
  SearchMode,
  TransportMethod,
} from "../../shared/domain/course-flow.types";
import {
  requestRecommendationPreview,
  type RecommendationPreviewResult,
} from "../../shared/api/recommendations";
import { createInitialCourseFlowState } from "../../shared/state/create-course-flow-state";
import { SelectionHubScreen } from "../phase2-selection-hub/SelectionHubScreen";
import type { SelectionHubState } from "../phase2-selection-hub/model/selection-hub.types";
import type { InitialInputSubmission } from "./model/initial-input.types";

type AppView = "dashboard" | "input" | "deep-dive" | "selection-hub";
type DeepDiveEntryPoint = "input" | "selection-hub";
type BaseInfo = ReturnType<typeof createInitialCourseFlowState>["baseInfo"];

const TRANSPORT_OPTIONS: Array<{ label: string; value: TransportMethod }> = [
  { label: "\uB3C4\uBCF4", value: "walk" },
  { label: "\uB300\uC911\uAD50\uD1B5", value: "public-transport" },
  { label: "\uC790\uAC00\uC6A9", value: "car" },
  { label: "\uBCF5\uD569", value: "mixed" },
];

const TIME_OPTIONS = [
  { label: "\uC624\uC804 10:00", value: "10:00" },
  { label: "\uC624\uD6C4 14:00", value: "14:00" },
  { label: "\uC800\uB141 18:00", value: "18:00" },
  { label: "\uBC24 20:00", value: "20:00" },
];

const DATE_GENRE_OPTIONS = [
  "\uB85C\uB9E8\uD2F1",
  "\uD790\uB9C1",
  "\uC561\uD2F0\uBE44\uD2F0",
  "\uB9DB\uC9D1 \uD0D0\uBC29",
  "\uAC10\uC131 \uCE74\uD398",
];

const PLACE_PREFERENCE_OPTIONS: Array<{
  label: string;
  value: DeepDiveFilters["placePreference"];
}> = [
  { label: "\uC9C1\uC811 \uC120\uC815", value: "direct" },
  { label: "\uBB34\uC791\uC704", value: "random" },
  { label: "\uC74C\uC2DD \uC885\uB958", value: "food-type" },
];

const EMPTY_SELECTION_STATE: SelectionHubState = {
  cards: [],
  lastSearchMode: null,
  selectedCourse: null,
};

export function Phase1DemoApp() {
  const [view, setView] = useState<AppView>("dashboard");
  const [flowState, setFlowState] = useState(createInitialCourseFlowState);
  const [selectionHubState, setSelectionHubState] =
    useState<SelectionHubState>(EMPTY_SELECTION_STATE);
  const [lastSubmission, setLastSubmission] =
    useState<InitialInputSubmission | null>(null);
  const [resultSource, setResultSource] = useState<"api" | "mock" | null>(null);
  const [deepDiveEntryPoint, setDeepDiveEntryPoint] =
    useState<DeepDiveEntryPoint>("input");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmitBaseInfo = useMemo(() => {
    const { transport, scheduledAt } = flowState.baseInfo;
    return transport !== "unselected" && Boolean(scheduledAt);
  }, [flowState.baseInfo]);

  const updateBaseInfo = <K extends keyof BaseInfo>(
    key: K,
    value: BaseInfo[K],
  ) => {
    setFlowState((current) => ({
      ...current,
      baseInfo: {
        ...current.baseInfo,
        [key]: value,
      },
    }));
  };

  const updateDeepDive = <K extends keyof DeepDiveFilters>(
    key: K,
    value: DeepDiveFilters[K],
  ) => {
    setFlowState((current) => ({
      ...current,
      deepDive: {
        ...current.deepDive,
        [key]: value,
      },
    }));
  };

  const createSubmission = (
    type: InitialInputSubmission["type"],
  ): InitialInputSubmission => {
    if (type === "quick-start") {
      return {
        type: "quick-start",
        baseInfo: flowState.baseInfo,
      };
    }

    return {
      type: "deep-dive",
      baseInfo: flowState.baseInfo,
      filters: flowState.deepDive,
    };
  };

  const applyRecommendationResult = (
    preview: RecommendationPreviewResult,
    searchMode: SearchMode,
  ) => {
    setResultSource(preview.source);
    setSelectionHubState({
      cards: preview.courses,
      lastSearchMode: searchMode,
      selectedCourse: null,
    });
    setFlowState((current) => ({
      ...current,
      phase: "phase2-selection-hub",
      searchMode,
    }));
    setView("selection-hub");
  };

  const runRecommendation = async (
    submission: InitialInputSubmission,
    searchMode: SearchMode,
  ) => {
    setIsSubmitting(true);

    try {
      const preview = await requestRecommendationPreview(submission, searchMode);
      setLastSubmission(submission);
      applyRecommendationResult(preview, searchMode);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPhase1 = async (type: InitialInputSubmission["type"]) => {
    if (!canSubmitBaseInfo) {
      Alert.alert(
        "\uAE30\uBCF8 \uC815\uBCF4 \uBBF8\uC644\uB8CC",
        "\uC774\uB3D9 \uC218\uB2E8\uACFC \uB370\uC774\uD2B8 \uC2DC\uC791 \uC2DC\uAC04\uC744 \uBA3C\uC800 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.",
      );
      return;
    }

    const submission = createSubmission(type);
    const searchMode: SearchMode =
      type === "quick-start"
        ? "quick-start"
        : deepDiveEntryPoint === "selection-hub"
          ? "deep-dive-research"
          : "deep-dive";

    await runRecommendation(submission, searchMode);
  };

  const handleSimpleRefresh = async () => {
    if (!lastSubmission) {
      return;
    }

    await runRecommendation(lastSubmission, "simple-refresh");
  };

  const handleOpenDeepDiveFromInput = () => {
    setDeepDiveEntryPoint("input");
    setView("deep-dive");
  };

  const handleOpenDeepDiveFromSelection = () => {
    setDeepDiveEntryPoint("selection-hub");
    setFlowState((current) => ({
      ...current,
      phase: "phase1-initial-input",
    }));
    setView("deep-dive");
  };

  const handleDeepDiveBack = () => {
    if (
      deepDiveEntryPoint === "selection-hub" &&
      selectionHubState.cards.length > 0
    ) {
      setView("selection-hub");
      return;
    }

    setView("input");
  };

  const handleSelectCourse = (courseId: string, title: string) => {
    setSelectionHubState((current) => ({
      ...current,
      selectedCourse: {
        courseId,
        title,
      },
    }));
    setFlowState((current) => ({
      ...current,
      selectedCourse: {
        courseId,
        title,
      },
    }));

    Alert.alert(
      "\uCF54\uC2A4 \uC120\uD0DD \uC644\uB8CC",
      `${title}\n\nPhase 3 \uC0C1\uC138 \uD3B8\uC9D1 \uD654\uBA74 \uC5F0\uACB0\uC740 \uB2E4\uC74C \uAD6C\uD604 \uB2E8\uACC4\uC785\uB2C8\uB2E4.`,
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {view === "dashboard" ? (
        <DashboardScreen onStart={() => setView("input")} />
      ) : null}

      {view === "input" ? (
        <InitialInputScreen
          baseInfo={flowState.baseInfo}
          canSubmit={canSubmitBaseInfo}
          isSubmitting={isSubmitting}
          onBack={() => setView("dashboard")}
          onChangeBaseInfo={updateBaseInfo}
          onQuickStart={() => void submitPhase1("quick-start")}
          onOpenDeepDive={handleOpenDeepDiveFromInput}
        />
      ) : null}

      {view === "deep-dive" ? (
        <DeepDiveScreen
          baseInfo={flowState.baseInfo}
          deepDive={flowState.deepDive}
          canSubmit={canSubmitBaseInfo}
          isSubmitting={isSubmitting}
          submitLabel={
            deepDiveEntryPoint === "selection-hub"
              ? "\uC218\uC815 \uC870\uAC74\uC73C\uB85C \uB2E4\uC2DC \uCD94\uCC9C"
              : "\uC138\uBD80 \uC124\uC815\uC73C\uB85C \uCD94\uCC9C \uBC1B\uAE30"
          }
          onBack={handleDeepDiveBack}
          onChangeBaseInfo={updateBaseInfo}
          onChangeDeepDive={updateDeepDive}
          onSubmit={() => void submitPhase1("deep-dive")}
        />
      ) : null}

      {view === "selection-hub" ? (
        <SelectionHubScreen
          cards={selectionHubState.cards}
          resultSource={resultSource}
          selectedCourseId={selectionHubState.selectedCourse?.courseId ?? null}
          lastSearchMode={selectionHubState.lastSearchMode}
          isRefreshing={isSubmitting}
          onBackToInput={() => {
            setFlowState((current) => ({
              ...current,
              phase: "phase1-initial-input",
              searchMode: null,
            }));
            setView("input");
          }}
          onSimpleRefresh={() => void handleSimpleRefresh()}
          onOpenDeepDive={handleOpenDeepDiveFromSelection}
          onSelectCourse={handleSelectCourse}
        />
      ) : null}
    </SafeAreaView>
  );
}

function DashboardScreen({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.dashboard}>
      <Text style={styles.eyebrow}>PHASE 1 DEMO</Text>
      <Text style={styles.logo}>{"Rec\u2764\uFE0FDate"}</Text>
      <Text style={styles.heroTitle}>
        {
          "\uC7A5\uC18C \uACC4\uD68D\uC774 \uC5B4\uB824\uC6B8 \uB54C,\n\uB370\uC774\uD2B8 \uCF54\uC2A4\uB97C \uBE60\uB974\uAC8C \uC2DC\uC791\uD558\uAE30"
        }
      </Text>
      <Text style={styles.heroBody}>
        {
          "\uAC15\uB989\uC2DC MVP \uAE30\uC900\uC73C\uB85C \uC774\uB3D9 \uC218\uB2E8, \uC9C0\uC5ED, \uC2DC\uAC04\uC744 \uC785\uB825\uD558\uBA74 Quick Start \uB610\uB294 \uC138\uBD80 \uC124\uC815 \uD750\uB984\uC73C\uB85C \uBC14\uB85C \uCD94\uCC9C\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4."
        }
      </Text>

      <Pressable style={styles.heroButton} onPress={onStart}>
        <Text style={styles.heroButtonText}>
          {"Rec\u2764\uFE0FDate \uBC84\uD2BC \uB204\uB974\uAE30"}
        </Text>
      </Pressable>
    </View>
  );
}

function InitialInputScreen(props: {
  baseInfo: BaseInfo;
  canSubmit: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onQuickStart: () => void;
  onOpenDeepDive: () => void;
  onChangeBaseInfo: <K extends keyof BaseInfo>(
    key: K,
    value: BaseInfo[K],
  ) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header
        eyebrow="PHASE 1 / INITIAL INPUT"
        title="\uAE30\uBCF8 \uC815\uBCF4 \uC785\uB825"
        subtitle={
          "\uC774\uB3D9 \uC218\uB2E8, \uC9C0\uC5ED, \uC2DC\uAC04\uC744 \uC124\uC815\uD55C \uB4A4 Quick Start\uB85C \uBC14\uB85C \uCD94\uCC9C\uC744 \uBC1B\uAC70\uB098, \uC138\uBD80 \uC124\uC815\uC73C\uB85C \uB354 \uC815\uAD50\uD558\uAC8C \uC870\uAC74\uC744 \uB2E4\uB4EC\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
        }
        onBack={props.onBack}
      />

      <Card>
        <Text style={styles.sectionTitle}>1. \uC774\uB3D9 \uC218\uB2E8</Text>
        <ChipGroup
          options={TRANSPORT_OPTIONS}
          value={props.baseInfo.transport}
          onChange={(value) => props.onChangeBaseInfo("transport", value)}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>2. \uC9C0\uC5ED \uC120\uD0DD</Text>
        <ChipGroup
          options={MVP_REGION_SCOPE.citySelectOptions}
          value={props.baseInfo.city}
          onChange={(value) => props.onChangeBaseInfo("city", value)}
        />
        <Text style={styles.helperText}>
          {
            "\uD604\uC7AC MVP\uB294 \uAC15\uB989\uC2DC\uB9CC \uC9C0\uC6D0\uD558\uBA70, \uC2DC/\uAD6C \uD655\uC7A5\uC740 \uCD94\uD6C4 \uB2E8\uACC4\uC5D0\uC11C \uC9C4\uD589\uD569\uB2C8\uB2E4."
          }
        </Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>3. \uC2DC\uC791 \uC2DC\uAC04</Text>
        <ChipGroup
          options={TIME_OPTIONS}
          value={props.baseInfo.scheduledAt}
          onChange={(value) => props.onChangeBaseInfo("scheduledAt", value)}
        />
        <Text style={styles.helperText}>
          {
            "\uC2DC\uC5F0 \uBC84\uC804\uC740 \uD504\uB9AC\uC14B \uC2DC\uAC04 \uAE30\uC900\uC73C\uB85C \uC9C4\uD589\uD558\uACE0, \uCD94\uD6C4 \uB0A0\uC9DC/\uC2DC\uAC04 \uD53C\uCEE4\uB85C \uD655\uC7A5\uD569\uB2C8\uB2E4."
          }
        </Text>
      </Card>

      <View style={styles.actionColumn}>
        <PrimaryButton
          label={
            props.isSubmitting
              ? "\uCD94\uCC9C \uC900\uBE44 \uC911..."
              : "Quick Start"
          }
          onPress={props.onQuickStart}
          disabled={!props.canSubmit || props.isSubmitting}
          loading={props.isSubmitting}
          variant="primary"
        />
        <PrimaryButton
          label="\uC138\uBD80 \uCE74\uD14C\uACE0\uB9AC \uC124\uC815"
          onPress={props.onOpenDeepDive}
          disabled={props.isSubmitting}
          loading={false}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
}

function DeepDiveScreen(props: {
  baseInfo: BaseInfo;
  deepDive: DeepDiveFilters;
  canSubmit: boolean;
  isSubmitting: boolean;
  submitLabel: string;
  onBack: () => void;
  onSubmit: () => void;
  onChangeBaseInfo: <K extends keyof BaseInfo>(
    key: K,
    value: BaseInfo[K],
  ) => void;
  onChangeDeepDive: <K extends keyof DeepDiveFilters>(
    key: K,
    value: DeepDiveFilters[K],
  ) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header
        eyebrow="PHASE 1 / DEEP DIVE"
        title="\uC138\uBD80 \uCE74\uD14C\uACE0\uB9AC \uC124\uC815"
        subtitle={
          "Quick Start \uC870\uAC74\uC5D0 \uCD94\uAC00\uB85C \uC608\uC0B0, \uC774\uB3D9 \uBC94\uC704, \uCF54\uC2A4 \uAC1C\uC218, \uB370\uC774\uD2B8 \uC7A5\uB974\uB97C \uC9C1\uC811 \uC870\uC815\uD558\uB294 \uD654\uBA74\uC785\uB2C8\uB2E4."
        }
        onBack={props.onBack}
      />

      <Card>
        <Text style={styles.sectionTitle}>
          \uAE30\uBCF8 \uC815\uBCF4 \uC7AC\uD655\uC778
        </Text>
        <ChipGroup
          options={TRANSPORT_OPTIONS}
          value={props.baseInfo.transport}
          onChange={(value) => props.onChangeBaseInfo("transport", value)}
        />
        <View style={styles.spacer16} />
        <ChipGroup
          options={MVP_REGION_SCOPE.citySelectOptions}
          value={props.baseInfo.city}
          onChange={(value) => props.onChangeBaseInfo("city", value)}
        />
        <View style={styles.spacer16} />
        <ChipGroup
          options={TIME_OPTIONS}
          value={props.baseInfo.scheduledAt}
          onChange={(value) => props.onChangeBaseInfo("scheduledAt", value)}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>
          \uC7A5\uC18C \uD2B9\uC131 \uC124\uC815
        </Text>
        <ChipGroup
          options={PLACE_PREFERENCE_OPTIONS}
          value={props.deepDive.placePreference}
          onChange={(value) => props.onChangeDeepDive("placePreference", value)}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>
          \uC608\uC0B0 \uC0C1\uD55C (\uC6D0)
        </Text>
        <TextInput
          style={styles.textInput}
          keyboardType="number-pad"
          placeholder="ex. 50000"
          value={
            props.deepDive.budgetLimit === null
              ? ""
              : String(props.deepDive.budgetLimit)
          }
          onChangeText={(value) =>
            props.onChangeDeepDive("budgetLimit", value ? Number(value) : null)
          }
        />

        <View style={styles.spacer16} />
        <Text style={styles.sectionTitle}>
          \uC774\uB3D9 \uBC18\uACBD (m)
        </Text>
        <TextInput
          style={styles.textInput}
          keyboardType="number-pad"
          placeholder="ex. 3000"
          value={
            props.deepDive.movementRadiusMeters === null
              ? ""
              : String(props.deepDive.movementRadiusMeters)
          }
          onChangeText={(value) =>
            props.onChangeDeepDive(
              "movementRadiusMeters",
              value ? Number(value) : null,
            )
          }
        />

        <View style={styles.spacer16} />
        <Text style={styles.sectionTitle}>
          \uCD94\uCC9C \uCF54\uC2A4 \uAC1C\uC218
        </Text>
        <TextInput
          style={styles.textInput}
          keyboardType="number-pad"
          placeholder="1~5"
          value={
            props.deepDive.courseCount === null
              ? ""
              : String(props.deepDive.courseCount)
          }
          onChangeText={(value) =>
            props.onChangeDeepDive("courseCount", value ? Number(value) : null)
          }
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>
          \uB370\uC774\uD2B8 \uC7A5\uB974
        </Text>
        <ChipGroup
          options={DATE_GENRE_OPTIONS.map((option) => ({
            label: option,
            value: option,
          }))}
          value={props.deepDive.dateGenre}
          onChange={(value) => props.onChangeDeepDive("dateGenre", value)}
        />
      </Card>

      <PrimaryButton
        label={
          props.isSubmitting
            ? "\uCD94\uCC9C \uC900\uBE44 \uC911..."
            : props.submitLabel
        }
        onPress={props.onSubmit}
        disabled={!props.canSubmit || props.isSubmitting}
        loading={props.isSubmitting}
        variant="primary"
      />
    </ScrollView>
  );
}

function Header(props: {
  eyebrow: string;
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.headerBlock}>
      <Pressable onPress={props.onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>{"\u2190"}</Text>
      </Pressable>
      <Text style={styles.eyebrow}>{props.eyebrow}</Text>
      <Text style={styles.headerTitle}>{props.title}</Text>
      <Text style={styles.headerSubtitle}>{props.subtitle}</Text>
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant: "primary" | "secondary";
}) {
  const isPrimary = props.variant === "primary";

  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        props.disabled ? styles.buttonDisabled : null,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={isPrimary ? "#ffffff" : "#1f2937"} />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          isPrimary ? styles.buttonTextPrimary : styles.buttonTextSecondary,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function ChipGroup<T extends string | null>(props: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chipGroup}>
      {props.options.map((option) => {
        const selected = props.value === option.value;
        return (
          <Pressable
            key={`${option.label}-${String(option.value)}`}
            onPress={() => props.onChange(option.value)}
            style={[styles.chip, selected ? styles.chipSelected : null]}
          >
            <Text
              style={[
                styles.chipLabel,
                selected ? styles.chipLabelSelected : null,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  dashboard: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: "center",
    backgroundColor: "#fff7f8",
  },
  screen: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },
  headerBlock: {
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#d13b63",
    textTransform: "uppercase",
  },
  logo: {
    fontSize: 42,
    fontWeight: "900",
    color: "#111827",
    marginTop: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 36,
    color: "#111827",
    marginTop: 20,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 24,
    color: "#4b5563",
    marginTop: 12,
    marginBottom: 28,
  },
  heroButton: {
    borderRadius: 18,
    backgroundColor: "#111827",
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: "center",
  },
  heroButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: "#4b5563",
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
    shadowColor: "#111827",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#6b7280",
  },
  chipGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipSelected: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  chipLabelSelected: {
    color: "#ffffff",
  },
  actionColumn: {
    gap: 12,
  },
  button: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonPrimary: {
    backgroundColor: "#111827",
  },
  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "800",
  },
  buttonTextPrimary: {
    color: "#ffffff",
  },
  buttonTextSecondary: {
    color: "#111827",
  },
  textInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  spacer16: {
    height: 4,
  },
});
