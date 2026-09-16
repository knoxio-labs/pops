import DesignSystem
import SwiftUI

/// Current and previous placement, drawn as two clearly-labelled rows so
/// they cannot be confused with each other, the ``InventoryItemDetail``'s
/// "Done when" criterion.
internal struct InventoryItemDetailPlacementSection: View {
    internal let detail: InventoryItemDetail

    internal var body: some View {
        Section("Where it is") {
            HStack {
                Text("Now")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
                Spacer(minLength: PopsSpacing.md)
                InventoryPlacementPath(placement: detail.item.placement)
            }
            .padding(.vertical, PopsSpacing.xs)
            if let previous = detail.previousPlacement {
                InventoryPropertyLine(key: "Before this", value: previous)
            }
        }
    }
}

/// The local-state banner: a change waiting to sync, a copy that may be
/// stale, or one the server rejected. Reuses ``PopsStatusHeader`` and
/// ``InventoryRepairRow`` rather than a fourth way of saying "something is
/// pending".
internal struct InventoryItemDetailSyncBanner: View {
    internal let detail: InventoryItemDetail

    @ViewBuilder internal var body: some View {
        if let conflict = detail.conflict {
            Section {
                InventoryRepairRow(
                    item: detail.item, problem: conflict.problem, resolution: conflict.resolution)
            }
        } else if detail.item.sync == .stale {
            Section {
                PopsStatusHeader(
                    tone: .warning, title: "May be out of date",
                    message:
                        "Last synced a while ago. Anything changed here is saved on this phone and sent when it can be."
                )
            }
        } else if detail.item.sync == .queued {
            Section {
                PopsStatusHeader(
                    tone: .information, title: "Not sent yet",
                    message:
                        "Saved on this phone. It will sync the next time it can reach the server.")
            }
        }
    }
}

/// Identifiers someone else assigned, ADR-001's distinction from POPS's own
/// inventory code, which the header already shows.
internal struct InventoryItemDetailIdentifiersSection: View {
    internal let identifiers: [InventoryDetailExternalIdentifier]

    @ViewBuilder internal var body: some View {
        if !identifiers.isEmpty {
            Section("External identifiers") {
                ForEach(identifiers) { InventoryPropertyLine(key: $0.kind, value: $0.value) }
            }
        }
    }
}

/// A description, the fields the item's type declares, and what its
/// capabilities let it do, the decided property model
/// ``InventoryTemplateVariantView`` settled on, one level down.
internal struct InventoryItemDetailFieldsSection: View {
    internal let detail: InventoryItemDetail

    @ViewBuilder internal var body: some View {
        if !detail.fields.isEmpty {
            Section(detail.item.typeName ?? "Fields") {
                ForEach(detail.fields) { InventoryPropertyLine(key: $0.key, value: $0.value) }
            }
        }
        if !detail.capabilities.isEmpty {
            Section("Capabilities") {
                InventoryChipFlow(spacing: PopsSpacing.xs) {
                    ForEach(detail.capabilities, id: \.self) {
                        InventoryPropertyChip($0, tone: .popsInventory)
                    }
                }
            }
        }
        if let description = detail.description {
            Section("Note") {
                Text(description)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            }
        }
    }
}
