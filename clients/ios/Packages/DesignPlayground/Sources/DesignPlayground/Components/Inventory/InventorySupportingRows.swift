import DesignSystem
import SwiftUI

/// A place in the home. Not an item (ADR-001), so no code, no lifecycle, no
/// sync mark — only what it holds and where it sits.
internal struct InventoryLocationRow: View {
    internal let name: String
    internal let parent: String?
    internal let itemCount: Int
    internal let containerCount: Int
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: InventorySymbol.location.system)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsMutedForeground)
                .frame(width: size, height: size)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private var detail: String {
        let contents =
            containerCount == 0
            ? "\(itemCount) items"
            : "\(itemCount) items · \(containerCount) containers"
        return parent.map { "\(contents) · in \($0)" } ?? contents
    }
}

/// An item somebody is holding, with the one action that row exists for.
///
/// "Put back" returns it to its previous placement in one tap; anywhere else
/// is a move, and lives on the detail screen. The row is an item row, so it
/// inherits every open question about rows instead of re-answering them.
internal struct InventoryInHandRow: View {
    internal let item: InventoryFoundationItem

    internal var body: some View {
        HStack(alignment: .center, spacing: PopsSpacing.sm) {
            InventoryItemRow(item: item)
            if case .inHand(let previous?) = item.placement {
                Button("Put back") {}
                    .font(.popsSubheadline.weight(.semibold))
                    .playgroundGlassButton()
                    .accessibilityHint("Returns it to \(previous)")
            }
        }
    }
}

/// Something that happened, said the way the ADR's verbs say it.
internal struct InventoryActivityRow: View {
    internal let verb: String
    internal let subject: String
    internal let detail: String
    internal let when: String

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            Image(systemName: InventorySymbol.activity.system)
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(verb) \(subject)")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Text("\(detail) · \(when)")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }
}

/// A change the server would not take, with what happened and what to do.
///
/// Says which item, what disagreed, and offers one resolution — never "an
/// error occurred", because a repair row the reader cannot act on is a
/// notification, not a repair.
internal struct InventoryRepairRow: View {
    internal let item: InventoryFoundationItem
    internal let problem: String
    internal let resolution: String

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                Image(systemName: InventorySymbol.attention.system)
                    .foregroundStyle(Color.popsDestructive)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(item.name)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text(problem)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            Button(resolution) {}
                .font(.popsSubheadline.weight(.semibold))
                .playgroundGlassButton()
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}
