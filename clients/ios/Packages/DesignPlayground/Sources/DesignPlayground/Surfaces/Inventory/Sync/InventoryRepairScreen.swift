import DesignSystem
import SwiftUI

/// One repair, in full: which item, what disagreed, and every way out.
///
/// The three obligations in that order, and none of them optional. A screen
/// that opened with the choices would be asking a person to pick before they
/// know what they are picking between; one that stopped at the disagreement
/// would be a notification wearing a repair's clothes.
internal struct InventoryRepairScreen: View {
    internal let conflict: InventoryConflict

    internal var body: some View {
        List {
            Section {
                PopsStatusHeader(
                    tone: conflict.kind.stopsTheQueue ? .danger : .warning,
                    title: conflict.kind.headline,
                    message: conflict.kind.disagreement,
                    caption: caption)
            }
            Section("The item") {
                InventoryItemRow(item: conflict.item)
            }
            Section(comparisonHeading) {
                InventoryConflictComparison(conflict: conflict)
            }
            Section("What should happen") {
                ForEach(conflict.resolutions) { resolution in
                    InventoryResolutionRow(
                        resolution: resolution, isLeading: resolution.id == conflict.leading?.id)
                }
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Repair")
        .playgroundTitleDisplay(large: false)
        .tint(.popsInventory)
    }

    private var caption: String? {
        guard conflict.heldCount > 0 else { return conflict.when }
        return "\(conflict.when) · \(conflict.heldCount) later changes are waiting behind it"
    }

    private var comparisonHeading: String {
        conflict.fields.isEmpty ? "What is at stake" : "What disagreed"
    }
}

/// One way out, with what it does under what it is called.
///
/// The leading resolution is prominent and the rest are not, which is the
/// screen making a recommendation rather than laying four equal doors in front
/// of somebody. Anything that throws work away is drawn like everything else
/// and never leads: destructive red is reserved for what cannot be undone
/// (ADR-001), and a discarded intent can be made again by hand.
internal struct InventoryResolutionRow: View {
    internal let resolution: InventoryResolution
    internal let isLeading: Bool

    internal var body: some View {
        Button {
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                HStack(spacing: PopsSpacing.sm) {
                    Text(resolution.title)
                        .font(.popsHeadline)
                        .foregroundStyle(
                            isLeading ? Color.popsInventory : Color.popsForeground)
                    if resolution.effect == .discardsIntent {
                        Text("Loses this change")
                            .font(.popsCaption.weight(.semibold))
                            .foregroundStyle(Color.popsMutedForeground)
                            .padding(.horizontal, PopsSpacing.sm)
                            .padding(.vertical, PopsSpacing.xs)
                            .background(Color.popsMutedForeground.opacity(0.12), in: .capsule)
                    }
                }
                Text(resolution.outcome)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: PopsSize.touchTarget)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(resolution.outcome)
    }
}

/// Every repair's grammar on one screen, so the wording can be judged as a set.
///
/// Nine repairs read one at a time are nine screens that each sound fine. Read
/// together they are where "could not be saved" turns up beside "its container
/// is gone" and has to justify itself.
internal struct InventoryRepairGrammarList: View {
    internal var body: some View {
        List {
            ForEach(InventorySyncFixtures.everyRepair) { conflict in
                Section(conflict.kind.headline) {
                    InventoryRepairRow(conflict: conflict)
                }
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Repair grammar")
        .playgroundTitleDisplay(large: false)
        .tint(.popsInventory)
    }
}
