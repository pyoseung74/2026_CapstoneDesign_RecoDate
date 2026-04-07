import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { SearchMode } from "../../shared/domain/course-flow.types";
import type { CourseCardSummary } from "./model/selection-hub.types";

function translateSearchMode(value: SearchMode | null) {
  switch (value) {
    case "quick-start":
      return "Quick Start";
    case "deep-dive":
      return "Deep Dive";
    case "simple-refresh":
      return "\uB2E8\uC21C \uC7AC\uAC80\uC0C9";
    case "deep-dive-research":
      return "\uC870\uAC74 \uC218\uC815 \uD6C4 \uC7AC\uAC80\uC0C9";
    default:
      return "-";
  }
}

function translateSource(value: "api" | "mock" | null) {
  switch (value) {
    case "api":
      return "FastAPI";
    case "mock":
      return "Mock fallback";
    default:
      return "-";
  }
}

export function SelectionHubScreen(props: {
  cards: CourseCardSummary[];
  resultSource: "api" | "mock" | null;
  selectedCourseId: string | null;
  lastSearchMode: SearchMode | null;
  isRefreshing: boolean;
  onBackToInput: () => void;
  onSimpleRefresh: () => void;
  onOpenDeepDive: () => void;
  onSelectCourse: (courseId: string, title: string) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={props.isRefreshing}
          onRefresh={props.onSimpleRefresh}
        />
      }
    >
      <Text style={styles.eyebrow}>PHASE 2 / SELECTION HUB</Text>
      <Text style={styles.title}>
        \uCD94\uCC9C \uCF54\uC2A4 \uC120\uD0DD \uD5C8\uBE0C
      </Text>
      <Text style={styles.subtitle}>
        {
          "3~5\uAC1C \uD480\uCF54\uC2A4 \uCE74\uB4DC\uB97C \uD655\uC778\uD558\uACE0, \uB2E8\uC21C \uC7AC\uAC80\uC0C9 \uB610\uB294 \uC138\uBD80 \uC870\uAC74 \uC218\uC815 \uD6C4 \uC7AC\uAC80\uC0C9\uC73C\uB85C \uD750\uB984\uC744 \uACB0\uC815\uD558\uB294 \uD654\uBA74\uC785\uB2C8\uB2E4."
        }
      </Text>

      <View style={styles.summaryCard}>
        <SummaryRow
          label="\uACB0\uACFC \uC18C\uC2A4"
          value={translateSource(props.resultSource)}
        />
        <SummaryRow
          label="\uB9C8\uC9C0\uB9C9 \uAC80\uC0C9 \uBC29\uC2DD"
          value={translateSearchMode(props.lastSearchMode)}
        />
        <SummaryRow
          label="\uCD94\uCC9C \uCF54\uC2A4 \uC218"
          value={`${props.cards.length}\uAC1C`}
        />
      </View>

      <View style={styles.actionRow}>
        <ActionButton
          label="\uB2E8\uC21C \uC7AC\uAC80\uC0C9"
          onPress={props.onSimpleRefresh}
          variant="primary"
        />
        <ActionButton
          label="\uC138\uBD80 \uC870\uAC74 \uC218\uC815"
          onPress={props.onOpenDeepDive}
          variant="secondary"
        />
      </View>

      <ActionButton
        label="\uAE30\uBCF8 \uC785\uB825 \uD654\uBA74\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30"
        onPress={props.onBackToInput}
        variant="secondary"
      />

      <View style={styles.cardList}>
        {props.cards.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              \uD45C\uC2DC\uD560 \uCD94\uCC9C \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4
            </Text>
            <Text style={styles.emptyBody}>
              {
                "\uB2E8\uC21C \uC7AC\uAC80\uC0C9\uC744 \uC2DC\uB3C4\uD558\uAC70\uB098 \uC138\uBD80 \uC870\uAC74\uC744 \uC218\uC815\uD55C \uB4A4 \uB2E4\uC2DC \uCD94\uCC9C\uC744 \uC2E4\uD589\uD574\uC8FC\uC138\uC694."
              }
            </Text>
          </View>
        ) : null}

        {props.cards.map((card) => {
          const selected = props.selectedCourseId === card.courseId;
          return (
            <Pressable
              key={card.courseId}
              onPress={() => props.onSelectCourse(card.courseId, card.title)}
              style={[
                styles.courseCard,
                selected ? styles.courseCardSelected : null,
              ]}
            >
              <View style={styles.courseCardHeader}>
                <Text style={styles.courseTitle}>{card.title}</Text>
                <Text style={styles.courseBadge}>
                  {selected
                    ? "\uC120\uD0DD \uC644\uB8CC"
                    : "\uC120\uD0DD \uAC00\uB2A5"}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <MetaPill
                  label={`\uC608\uC0B0 ${card.estimatedBudget.toLocaleString()}\uC6D0`}
                />
                <MetaPill
                  label={`\uC18C\uC694 ${card.totalDurationMinutes}\uBD84`}
                />
              </View>

              <View style={styles.tagRow}>
                {card.tags.map((tag) => (
                  <View key={`${card.courseId}-${tag}`} style={styles.tagChip}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.footerNote}>
        {
          "\uCE74\uB4DC\uB97C \uC120\uD0DD\uD558\uBA74 Selection Hub \uB2E8\uACC4\uC5D0\uC11C \uCF54\uC2A4 \uD655\uC815 \uC900\uBE44\uAE4C\uC9C0 \uC9C4\uD589\uB429\uB2C8\uB2E4. \uB2E4\uC74C \uAD6C\uD604 \uB2E8\uACC4\uC5D0\uC11C\uB294 Phase 3 \uC0C1\uC138 \uD3B8\uC9D1\uC73C\uB85C \uC774\uC5B4\uC9D1\uB2C8\uB2E4."
        }
      </Text>
    </ScrollView>
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

function ActionButton(props: {
  label: string;
  onPress: () => void;
  variant: "primary" | "secondary";
}) {
  const isPrimary = props.variant === "primary";

  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.actionButton,
        isPrimary ? styles.actionButtonPrimary : styles.actionButtonSecondary,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          isPrimary
            ? styles.actionButtonTextPrimary
            : styles.actionButtonTextSecondary,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 14,
    backgroundColor: "#f8fafc",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#1d4ed8",
    textTransform: "uppercase",
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: "#111827",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: "#4b5563",
  },
  summaryCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
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
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPrimary: {
    backgroundColor: "#111827",
  },
  actionButtonSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  actionButtonTextPrimary: {
    color: "#ffffff",
  },
  actionButtonTextSecondary: {
    color: "#111827",
  },
  cardList: {
    gap: 12,
  },
  courseCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  courseCardSelected: {
    borderColor: "#111827",
    backgroundColor: "#eef2ff",
  },
  emptyCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#6b7280",
  },
  courseCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  courseTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  courseBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1d4ed8",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  footerNote: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: "#6b7280",
  },
});
