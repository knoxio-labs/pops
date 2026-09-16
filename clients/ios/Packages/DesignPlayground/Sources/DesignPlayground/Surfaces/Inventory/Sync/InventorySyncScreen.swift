import DesignSystem
import SwiftUI

/// What the `inventory/sync-repair` route opens: everything this phone has
/// that POPS does not, and everything POPS would not take.
///
/// A list, so it may scroll, and the only screen here that may. It opens with
/// what needs a person, then what is simply waiting, then what settled itself,
/// which is the order of decreasing obligation rather than of recency, a queue
/// nobody has to act on must not come before a repair somebody does.
internal struct InventorySyncScreen: View {
    internal let scene: InventorySyncScene

    internal var body: some View {
        List {
            if scene.isFirstRun {
                InventorySyncFirstRunSection()
            } else {
                headerSection
                repairSection
                queueSection
                resolvedSection
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Sync & repair")
        .tint(.popsInventory)
    }

    @ViewBuilder private var headerSection: some View {
        Section {
            InventoryQueueSummary(operations: scene.operations)
            if let minutes = scene.minutesSinceSync {
                InventorySyncFreshnessRow(minutesSinceSync: minutes)
            }
        }
    }

    @ViewBuilder private var repairSection: some View {
        if !scene.conflicts.isEmpty {
            Section("Needs you · \(scene.conflicts.count)") {
                ForEach(scene.conflicts) { conflict in
                    NavigationLink(value: InventoryRoute.item(conflict.id)) {
                        InventoryRepairRow(conflict: conflict)
                    }
                }
            }
        }
    }

    @ViewBuilder private var queueSection: some View {
        let pending = scene.pending
        if pending.isEmpty {
            Section("Waiting to sync") {
                Text("Nothing. Every change on this phone has reached POPS.")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        } else {
            Section("Waiting to sync · \(pending.count)") {
                ForEach(pending) { InventoryQueuedRow(operation: $0) }
            }
        }
    }

    @ViewBuilder private var resolvedSection: some View {
        if scene.showsResolved {
            Section("Settled without you") {
                ForEach(InventorySyncFixtures.resolved) { InventoryResolvedRow(entry: $0) }
            }
        }
    }
}

/// How old this phone's copy is, said plainly, at whatever volume its age has
/// earned.
internal struct InventorySyncFreshnessRow: View {
    internal let minutesSinceSync: Int

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: symbol.system)
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(isStale ? Color.popsWarning : Color.popsMutedForeground)
                .accessibilityHidden(true)
            Text(
                "Last heard from POPS \(InventoryStaleness.age(minutesSinceSync: minutesSinceSync))"
            )
            .font(.popsSubheadline)
            .foregroundStyle(Color.popsMutedForeground)
            Spacer(minLength: PopsSpacing.sm)
        }
        .accessibilityElement(children: .combine)
    }

    private var isStale: Bool {
        InventoryStaleness.disclosure(minutesSinceSync: minutesSinceSync) == .stale
    }

    private var symbol: InventorySymbol { isStale ? .stale : .offline }
}

/// Before this phone has a catalogue at all.
///
/// Not an empty state: an empty catalogue is one with nothing in it, and this
/// is one that has not arrived. The difference matters because the action is
/// different, and because "you have no items" would be a lie.
internal struct InventorySyncFirstRunSection: View {
    internal var body: some View {
        Section {
            PopsStatusHeader(
                tone: .information,
                title: "Nothing on this phone yet",
                message:
                    "Your catalogue has not been copied here. Until it is, search and scanning have "
                    + "nothing to look in. Anything you add now is saved on this phone and sent after.",
                caption: "846 items · 37 containers · 9 locations")
            Button("Copy my catalogue to this phone") {}
                .font(.popsHeadline)
                .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                .buttonStyle(.borderedProminent)
                .tint(.popsInventory)
            Button("Start adding without it") {}
                .font(.popsSubheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
        }
    }
}
