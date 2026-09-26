import { useEffect, useMemo, useState } from "react";
import { deviceClient } from "../../services/deviceClient";
import type { CommandProgress } from "../../services/commandProgress";
import { useHomeStore, type HomeState } from "../../store/useHomeStore";

/** UI-only admission identity; never persisted or sent to a command transport. */
export type CommandActivityProgress = CommandProgress & Readonly<{
  admissionSequence: number;
}>;

const EMPTY_ACTIVITY: readonly CommandActivityProgress[] = [];

/** Include every identity boundary even when devices reuse the same IDs. */
export function getCommandActivityScope(state: HomeState): string {
  return JSON.stringify([
    state.authenticatedUserId,
    state.sessionEpoch,
    state.accountHomeId,
    state.activeHomeId,
    state.activeMemberId,
  ]);
}

/**
 * Observe only commands admitted while this enabled scope is subscribed.
 * Existing service history deliberately is not rehydrated: its metadata has
 * no account/member identity, so reused IDs cannot establish ownership. The
 * caller must additionally filter these results through current device access.
 */
export function useCommandActivity(
  scope: string,
  enabled: boolean,
  onReset: () => void,
): readonly CommandActivityProgress[] {
  // A new token hides the previous snapshot during render, before effect
  // cleanup runs, including a disable/re-enable cycle in the same scope.
  const subscription = useMemo(() => ({ scope, enabled }), [scope, enabled]);
  const [snapshot, setSnapshot] = useState<{
    subscription: typeof subscription | null;
    commands: readonly CommandActivityProgress[];
  }>({ subscription: null, commands: EMPTY_ACTIVITY });

  useEffect(() => {
    let disposed = false;
    const admissions = new Map<string, number>();
    let nextAdmissionSequence = 0;
    setSnapshot({ subscription, commands: EMPTY_ACTIVITY });
    if (!enabled) return;

    const unsubscribe = deviceClient.subscribeCommandProgress((event) => {
      if (
        disposed ||
        getCommandActivityScope(useHomeStore.getState()) !== scope
      ) return;

      if (event.type === "reset") {
        admissions.clear();
        setSnapshot({ subscription, commands: EMPTY_ACTIVITY });
        onReset();
        return;
      }

      // Read the service's bounded authoritative snapshot instead of appending
      // events: terminal-entry eviction does not emit a separate removal event.
      const history = deviceClient.getCommandHistory();
      const retainedIds = new Set(history.map((command) => command.commandId));
      for (const commandId of admissions.keys()) {
        if (!retainedIds.has(commandId)) admissions.delete(commandId);
      }
      // A fresh admission gets its own UI identity even if its command ID and
      // timestamps match an evicted entry. Ignore replayed pending snapshots.
      if (
        event.command.status === "pending" &&
        !admissions.has(event.command.commandId) &&
        history.some((command) =>
          command.commandId === event.command.commandId &&
          command.status === "pending",
        )
      ) {
        nextAdmissionSequence += 1;
        admissions.set(event.command.commandId, nextAdmissionSequence);
      }
      setSnapshot({
        subscription,
        commands: history.flatMap((command) => {
          const admissionSequence = admissions.get(command.commandId);
          return admissionSequence === undefined
            ? []
            : [{ ...command, admissionSequence }];
        }),
      });
    });

    return () => {
      disposed = true;
      admissions.clear();
      unsubscribe();
    };
  }, [scope, enabled, subscription, onReset]);

  return enabled && snapshot.subscription === subscription
    ? snapshot.commands
    : EMPTY_ACTIVITY;
}
