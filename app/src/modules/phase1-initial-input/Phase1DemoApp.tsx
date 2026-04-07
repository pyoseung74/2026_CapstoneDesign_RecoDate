import { useMemo, useState } from "react";
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

import type {
  DeepDiveFilters,
  TransportMethod,
} from "../../shared/domain/course-flow.types";
import { createInitialCourseFlowState } from "../../shared/state/create-course-flow-state";
import { MVP_REGION_SCOPE } from "../../shared/config/region-scope";
import { requestRecommendationPreview } from "../../shared/api/recommendations";
import type { InitialInputSubmission } from "./model/initial-input.types";

type Phase1View = "dashboard" | "input" | "deep-dive" | "handoff";
type BaseInfo = ReturnType<typeof createInitialCourseFlowState>["baseInfo"];

const TRANSPORT_OPTIONS: Array<{ label: string; value: TransportMethod }> = [
  { label: "\ub3c4\ubcf4", value: "walk" },
  { label: "\ub300\uc911\uad50\ud1b5", value: "public-transport" },
  { label: "\uc790\uac00\uc6a9", value: "car" },
  { label: "\ubcf5\ud569", value: "mixed" },
];

const TIME_OPTIONS = [
  { label: "\uc624\uc804 10:00", value: "10:00" },
  { label: "\uc624\ud6c4 14:00", value: "14:00" },
  { label: "\uc800\ub141 18:00", value: "18:00" },
  { label: "\ubc24 20:00", value: "20:00" },
];

const DATE_GENRE_OPTIONS = [
  "\ub85c\ub9e8\ud2f1",
  "\ud790\ub9c1",
  "\uc561\ud2f0\ube44\ud2f0",
  "\ub9db\uc9d1 \ud0d0\ubc29",
  "\uac10\uc131 \uce74\ud398",
];

const PLACE_PREFERENCE_OPTIONS: Array<{
  label: string;
  value: DeepDiveFilters["placePreference"];
}> = [
  { label: "\uc9c1\uc811 \uc120\uc815", value: "direct" },
  { label: "\ubb34\uc791\uc704", value: "random" },
  { label: "\uc74c\uc2dd \uc885\ub958", value: "food-type" },
];

export function Phase1DemoApp() {
  const [view, setView] = useState<Phase1View>("dashboard");
  const [flowState, setFlowState] = useState(createInitialCourseFlowState);
  const [previewSource, setPreviewSource] = useState<"api" | "mock" | null>(
    null,
  );
  const [previewTitles, setPreviewTitles] = useState<string[]>([]);
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
    mode: InitialInputSubmission["type"],
  ): InitialInputSubmission => {
    if (mode === "quick-start") {
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

  const submitPhase1 = async (mode: InitialInputSubmission["type"]) => {
    if (!canSubmitBaseInfo) {
      Alert.alert(
        "\uae30\ubcf8 \uc815\ubcf4 \ubbf8\uc644\ub8cc",
        "\uc774\ub3d9 \uc218\ub2e8\uacfc \ub370\uc774\ud2b8 \uc2dc\uc791 \uc2dc\uac04\uc744 \uba3c\uc800 \uc120\ud0dd\ud574\uc8fc\uc138\uc694.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const submission = createSubmission(mode);
      const preview = await requestRecommendationPreview(submission);

      setPreviewSource(preview.source);
      setPreviewTitles(preview.courses.map((course) => course.title));
      setFlowState((current) => ({
        ...current,
        phase: "phase2-selection-hub",
        searchMode: mode === "quick-start" ? "quick-start" : "deep-dive",
      }));
      setView("handoff");
    } finally {
      setIsSubmitting(false);
    }
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
          onOpenDeepDive={() => setView("deep-dive")}
        />
      ) : null}

      {view === "deep-dive" ? (
        <DeepDiveScreen
          baseInfo={flowState.baseInfo}
          deepDive={flowState.deepDive}
          canSubmit={canSubmitBaseInfo}
          isSubmitting={isSubmitting}
          onBack={() => setView("input")}
          onChangeBaseInfo={updateBaseInfo}
          onChangeDeepDive={updateDeepDive}
          onSubmit={() => void submitPhase1("deep-dive")}
        />
      ) : null}

      {view === "handoff" ? (
        <HandoffPreviewScreen
          baseInfo={flowState.baseInfo}
          deepDive={flowState.deepDive}
          previewSource={previewSource}
          previewTitles={previewTitles}
          onBackToInput={() => {
            setFlowState((current) => ({
              ...current,
              phase: "phase1-initial-input",
              searchMode: null,
            }));
            setView("input");
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function DashboardScreen({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.dashboard}>
      <Text style={styles.eyebrow}>PHASE 1 DEMO</Text>
      <Text style={styles.logo}>Rec❤️Date</Text>
      <Text style={styles.heroTitle}>
        {"\uc7a5\uc18c \uacc4\ud68d\uc774 \uc5b4\ub824\uc6b8 \ub54c,\n\ub370\uc774\ud2b8 \ucf54\uc2a4\ub97c \ube60\ub974\uac8c \uc2dc\uc791\ud558\uae30"}
      </Text>
      <Text style={styles.heroBody}>
        {
          "\uac15\ub989\uc2dc MVP \uae30\uc900\uc73c\ub85c \uc774\ub3d9 \uc218\ub2e8, \uc9c0\uc5ed, \uc2dc\uac04\ub9cc \uc785\ub825\ud558\uba74 Quick Start\ub85c \ubc14\ub85c \ucd94\ucc9c\uc744 \uc2dc\uc791\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4."
        }
      </Text>

      <Pressable style={styles.heroButton} onPress={onStart}>
        <Text style={styles.heroButtonText}>
          {"Rec\u2764\ufe0fDate \ubc84\ud2bc \ub204\ub974\uae30"}
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
        eyebrow="PHASE 1 · INITIAL INPUT"
        title={"기본 정보 입력"}
        subtitle={
          "기본정보는 이동 수단, 지역, 시간입니다. 이 상태에서 바로 Quick Start를 실행하거나 세부카테고리 설정으로 이동할 수 있습니다."
        }
        onBack={props.onBack}
      />

      <Card>
        <Text style={styles.sectionTitle}>1. 이동 수단</Text>
        <ChipGroup
          options={TRANSPORT_OPTIONS}
          value={props.baseInfo.transport}
          onChange={(value) => props.onChangeBaseInfo("transport", value)}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>2. 지역</Text>
        <ChipGroup
          options={MVP_REGION_SCOPE.citySelectOptions}
          value={props.baseInfo.city}
          onChange={(value) => props.onChangeBaseInfo("city", value)}
        />
        <Text style={styles.helperText}>
          {
            "\ud604\uc7ac MVP\ub294 \uac15\ub989\uc2dc\ub9cc \uc9c0\uc6d0\ud558\uba70, \uad6c \ub2e8\uc704 \ud655\uc7a5\uc740 \ucd94\ud6c4 \uc9c4\ud589\ud569\ub2c8\ub2e4."
          }
        </Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>3. 데이트 시작 시간</Text>
        <ChipGroup
          options={TIME_OPTIONS}
          value={props.baseInfo.scheduledAt}
          onChange={(value) => props.onChangeBaseInfo("scheduledAt", value)}
        />
        <Text style={styles.helperText}>
          {
            "\uc2dc\uc5f0\uc6a9 \ubc84\uc804\uc740 \ud504\ub9ac\uc14b \uc2dc\uac04 \uae30\ubc18\uc73c\ub85c \uc9c4\ud589\ud558\uace0, \ucd94\ud6c4 \ub0a0\uc9dc/\uc2dc\uac04 \ud53c\ucee4\ub85c \ud655\uc7a5\ud569\ub2c8\ub2e4."
          }
        </Text>
      </Card>

      <View style={styles.actionColumn}>
        <PrimaryButton
          label={props.isSubmitting ? "\ucd94\ucc9c \uc900\ube44 \uc911..." : "Quick Start"}
          onPress={props.onQuickStart}
          disabled={!props.canSubmit || props.isSubmitting}
          variant="primary"
        />
        <PrimaryButton
          label={"세부카테고리 설정"}
          onPress={props.onOpenDeepDive}
          disabled={props.isSubmitting}
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
        eyebrow="PHASE 1 · DEEP DIVE"
        title={"세부카테고리 설정"}
        subtitle={
          "Quick Start보다 더 섬세한 추천을 원하는 사용자를 위한 선택형 상세 설정입니다."
        }
        onBack={props.onBack}
      />

      <Card>
        <Text style={styles.sectionTitle}>기본 정보 확인</Text>
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
        <Text style={styles.sectionTitle}>장소 특성</Text>
        <ChipGroup
          options={PLACE_PREFERENCE_OPTIONS}
          value={props.deepDive.placePreference}
          onChange={(value) => props.onChangeDeepDive("placePreference", value)}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>예산 한도 (원)</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="number-pad"
          placeholder="예: 50000"
          value={
            props.deepDive.budgetLimit === null
              ? ""
              : String(props.deepDive.budgetLimit)
          }
          onChangeText={(value) =>
            props.onChangeDeepDive(
              "budgetLimit",
              value ? Number(value) : null,
            )
          }
        />

        <View style={styles.spacer16} />
        <Text style={styles.sectionTitle}>이동 범위 (m)</Text>
        <TextInput
          style={styles.textInput}
          keyboardType="number-pad"
          placeholder="예: 3000"
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
        <Text style={styles.sectionTitle}>코스 개수</Text>
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
        <Text style={styles.sectionTitle}>데이트 장르</Text>
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
          props.isSubmitting ? "\ucd94\ucc9c \uc900\ube44 \uc911..." : "세부 설정으로 추천 시작"
        }
        onPress={props.onSubmit}
        disabled={!props.canSubmit || props.isSubmitting}
        variant="primary"
      />
    </ScrollView>
  );
}

function HandoffPreviewScreen(props: {
  baseInfo: BaseInfo;
  deepDive: DeepDiveFilters;
  previewSource: "api" | "mock" | null;
  previewTitles: string[];
  onBackToInput: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Header
        eyebrow="PHASE 1 COMPLETE"
        title={"Selection Hub 전달 준비 완료"}
        subtitle={
          "현재는 Phase 1 시연용으로 입력과 전달 상태를 보여줍니다. 아래 추천 미리보기는 다음 단계의 결과 허브에 연결될 예정입니다."
        }
        onBack={props.onBackToInput}
      />

      <Card>
        <Text style={styles.sectionTitle}>기본 정보 요약</Text>
        <SummaryRow
          label="이동 수단"
          value={translateTransport(props.baseInfo.transport)}
        />
        <SummaryRow label="지역" value={translateCity(props.baseInfo.city)} />
        <SummaryRow label="시간" value={props.baseInfo.scheduledAt ?? "-"} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>세부 설정 요약</Text>
        <SummaryRow
          label="장소 특성"
          value={translatePlacePreference(props.deepDive.placePreference)}
        />
        <SummaryRow
          label="예산"
          value={
            props.deepDive.budgetLimit === null
              ? "-"
              : `${props.deepDive.budgetLimit.toLocaleString()}원`
          }
        />
        <SummaryRow
          label="이동 범위"
          value={
            props.deepDive.movementRadiusMeters === null
              ? "-"
              : `${props.deepDive.movementRadiusMeters.toLocaleString()}m`
          }
        />
        <SummaryRow
          label="코스 개수"
          value={
            props.deepDive.courseCount === null
              ? "-"
              : `${props.deepDive.courseCount}개`
          }
        />
        <SummaryRow
          label="데이트 장르"
          value={props.deepDive.dateGenre ?? "-"}
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Selection Hub 미리보기</Text>
        <Text style={styles.helperText}>
          {props.previewSource === "api"
            ? "FastAPI 추천 응답을 사용했습니다."
            : "백엔드가 연결되지 않아 mock 추천 결과를 사용했습니다."}
        </Text>
        <View style={styles.previewList}>
          {props.previewTitles.map((title, index) => (
            <View key={`${title}-${index}`} style={styles.previewItem}>
              <Text style={styles.previewBadge}>{index + 1}</Text>
              <Text style={styles.previewTitle}>{title}</Text>
            </View>
          ))}
        </View>
      </Card>

      <PrimaryButton
        label={"입력 화면으로 돌아가기"}
        onPress={props.onBackToInput}
        variant="secondary"
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

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
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
      {props.disabled ? (
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
              style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function translateTransport(value: TransportMethod) {
  switch (value) {
    case "walk":
      return "\ub3c4\ubcf4";
    case "public-transport":
      return "\ub300\uc911\uad50\ud1b5";
    case "car":
      return "\uc790\uac00\uc6a9";
    case "mixed":
      return "\ubcf5\ud569";
    default:
      return "-";
  }
}

function translateCity(value: string | null) {
  if (value === "gangneung-si") {
    return "\uac15\ub989\uc2dc";
  }

  return "\uc120\ud0dd \uc548 \ud568";
}

function translatePlacePreference(value: DeepDiveFilters["placePreference"]) {
  switch (value) {
    case "direct":
      return "\uc9c1\uc811 \uc120\uc815";
    case "random":
      return "\ubb34\uc791\uc704";
    case "food-type":
      return "\uc74c\uc2dd \uc885\ub958";
    default:
      return "-";
  }
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "700",
  },
  summaryValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    color: "#111827",
    fontWeight: "800",
  },
  previewList: {
    gap: 10,
    marginTop: 4,
  },
  previewItem: {
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  previewBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
    backgroundColor: "#111827",
    color: "#ffffff",
    fontWeight: "800",
    paddingTop: 4,
  },
  previewTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
});
