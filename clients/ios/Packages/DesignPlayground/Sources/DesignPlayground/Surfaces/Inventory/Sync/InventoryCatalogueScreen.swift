import DesignSystem
import SwiftUI

/// Browsing the catalogue while the phone is on its own.
///
/// The screen that decides whether ordinary offline use looks broken. Most of
/// what is here is simply readable: rows carry the marks the foundation
/// decided on, and nothing announces that the network is missing unless the
/// style says something should.
internal struct InventoryCatalogueScreen: View {
    internal let scene: InventorySyncScene
    @Environment(\.inventorySyncStyle) private var style

    internal var body: some View {
        List {
            if let conflict = scene.interrupting(under: style.interruption) {
                Section { InventoryInterruptionCard(conflict: conflict) }
            }
            if style.globalStatus == .banner {
                Section { InventoryOfflineBanner(scene: scene) }
            }
            if style.repairPlacement != .inline && !scene.conflicts.isEmpty {
                Section { InventoryRepairInboxRow(count: scene.conflicts.count) }
            }
            Section(header: itemsHeader) {
                ForEach(InventoryCatalogueRows.items) { item in
                    InventoryItemRow(item: item)
                }
                if style.repairPlacement != .inbox, let conflict = scene.conflicts.first {
                    InventoryRepairRow(conflict: conflict)
                }
            }
            if style.globalStatus == .activityRow {
                Section("Recent work") { InventorySyncActivityRow(scene: scene) }
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Garage")
        .tint(.popsInventory)
    }

    @ViewBuilder private var itemsHeader: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text("64 items")
            Spacer(minLength: PopsSpacing.sm)
            if style.globalStatus == .capsule {
                InventorySyncCapsule(state: scene.capsuleState)
            }
        }
    }
}

/// The rows a catalogue list shows while the phone is offline, one per sync
/// state the foundation makes visible.
internal enum InventoryCatalogueRows {
    internal static let items: [InventoryFoundationItem] = [
        InventoryFoundationFixtures.kitchenBox,
        InventoryFoundationFixtures.screws,
        InventoryFoundationFixtures.espresso,
        InventoryFoundationFixtures.tape,
        InventoryFoundationFixtures.untyped,
    ]
}

/// Offline as a line across the top of the list.
internal struct InventoryOfflineBanner: View {
    internal let scene: InventorySyncScene

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: InventorySymbol.offline.system)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("Working on this phone")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                InventoryQueueSummary(operations: scene.operations)
            }
            Spacer(minLength: PopsSpacing.sm)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Offline as something that happened, filed with everything else that did.
internal struct InventorySyncActivityRow: View {
    internal let scene: InventorySyncScene

    internal var body: some View {
        InventoryActivityRow(
            verb: "Lost", subject: "the connection to POPS",
            detail: "\(scene.pending.count) changes saved here since",
            when: scene.minutesSinceSync.map(InventoryStaleness.age) ?? "just now")
    }
}

/// One row standing in for every repair, wherever repairs are collected.
internal struct InventoryRepairInboxRow: View {
    internal let count: Int

    internal var body: some View {
        NavigationLink(value: InventoryRoute.syncRepair) {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: InventorySymbol.attention.system)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsDestructive)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text("\(count) changes need you")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text("POPS would not take them. Nothing is lost.")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .frame(minHeight: PopsSize.touchTarget)
        }
    }
}

/// A repair that has put itself in front of somebody mid-task.
///
/// Drawn in the list rather than as a sheet on purpose: what is being judged
/// is whether this deserves to take the top of the screen at all, and a modal
/// answers that question by force before anyone can look at it.
internal struct InventoryInterruptionCard: View {
    internal let conflict: InventoryConflict

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(conflict.kind.headline)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Text(conflict.kind.disagreement)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
            HStack(spacing: PopsSpacing.sm) {
                Button(conflict.leading?.title ?? "Open the repair") {}
                    .font(.popsSubheadline.weight(.semibold))
                    .playgroundGlassButton()
                    .tint(.popsInventory)
                Button("Not now") {}
                    .font(.popsSubheadline)
                    .frame(minHeight: PopsSize.touchTarget)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
