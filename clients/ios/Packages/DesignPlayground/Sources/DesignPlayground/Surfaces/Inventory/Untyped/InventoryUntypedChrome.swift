import DesignSystem
import SwiftUI

/// The pieces every screen in the untyped path draws the same way.

/// The mark an untyped item carries beside typed ones, when the style gives it
/// one at all.
///
/// Amber, which on an Inventory screen is not an alarm: the pillar is amber, so
/// the chip reads as a label rather than as a warning. That is the reason the
/// row's own wash is reserved for open containers.
internal struct InventoryNoTypeBadge: View {
    internal var body: some View {
        Text("No type")
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsInventory)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .background(Color.popsInventory.opacity(0.14), in: .capsule)
            .accessibilityLabel("No type yet")
    }
}

/// One untyped item as a list shows it: the foundation row, whatever the style
/// adds to it, and the note when the note is the only thing it knows.
internal struct InventoryUntypedRow: View {
    internal let entry: InventoryUntypedItem
    internal let showsNote: Bool
    @Environment(\.inventoryUntypedStyle) private var style

    internal init(entry: InventoryUntypedItem, showsNote: Bool = false) {
        self.entry = entry
        self.showsNote = showsNote
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            HStack(alignment: .top, spacing: PopsSpacing.sm) {
                InventoryItemRow(item: entry.item)
                if style.listPresence == .badge && entry.item.typeName == nil {
                    InventoryNoTypeBadge()
                }
            }
            if showsNote && !entry.note.isEmpty {
                Text(entry.note)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(2)
            }
        }
    }
}

/// Where a type comes from, said wherever somebody is looking for one that is
/// not there.
///
/// It earns its place by predicting what happens next: without it the only
/// reading of an empty type search is that the person is doing it wrong, and
/// the next thing they look for is the button that makes one. There is no such
/// button, by decision, so the screen has to say so.
internal struct InventoryTypeSourceNote: View {
    internal let detail: String

    internal init(_ detail: String = "A type arrives with an app update. Nothing here makes one.") {
        self.detail = detail
    }

    internal var body: some View {
        Text(detail)
            .font(.popsCaption)
            .foregroundStyle(Color.popsMutedForeground)
    }
}

/// A row offering one of the two things a person can do about a thing no type
/// covers, drawn as a choice rather than as a fallback.
internal struct InventoryUntypedChoiceRow: View {
    internal let title: String
    internal let detail: String
    internal let symbol: InventorySymbol
    internal let isPreferred: Bool

    internal var body: some View {
        Button {
        } label: {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: symbol.system)
                    .font(.popsHeadline)
                    .foregroundStyle(isPreferred ? Color.popsInventory : Color.popsMutedForeground)
                    .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(title)
                        .font(.popsBody.weight(isPreferred ? .semibold : .regular))
                        .foregroundStyle(Color.popsForeground)
                    Text(detail)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.sm)
            }
        }
        .buttonStyle(.plain)
        .accessibilityHint(detail)
    }
}
