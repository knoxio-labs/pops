import AppCore
import DesignSystem
import SwiftUI

/// An item's inventory code, when it has one: monospaced because it is read
/// character by character against a sticker, and never truncated.
internal struct InventoryCodeBadge: View {
    internal let code: String

    internal var body: some View {
        HStack(spacing: PopsSpacing.xs) {
            InventorySymbol.code.image
                .font(.popsCaption)
            Text(code)
                .font(.popsMonospacedCaption)
                .lineLimit(1)
                .fixedSize()
        }
        .foregroundStyle(Color.popsMutedForeground)
        .padding(.horizontal, PopsSpacing.sm)
        .padding(.vertical, PopsSpacing.xs)
        .background(Color.popsMutedForeground.opacity(0.12), in: .capsule)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Inventory code \(code)")
    }
}

/// A state worth telling the reader about. Lifecycle shows only when it is
/// not active; access shows on every container. The two are separate marks,
/// never one badge for both.
internal struct InventoryStateMark: Identifiable, Equatable {
    internal let id: String
    internal let label: String
    /// Drawn in Inventory's colour at full strength. Only an open container
    /// is, because it is the one state that is work still in progress.
    internal let isHighlighted: Bool

    /// The manual Full switch, drawn as a mark rather than read from access
    /// or lifecycle.
    internal static let full = InventoryStateMark(id: "full", label: "Full", isHighlighted: false)

    internal static func marks(for record: InventoryDetailRecord) -> [InventoryStateMark] {
        marks(access: record.access, lifecycle: record.lifecycle)
    }

    /// The same marks read straight off an item, for a screen with no
    /// `InventoryDetailRecord` of its own (a container's page, a place's
    /// rows).
    internal static func marks(for item: InventoryItem) -> [InventoryStateMark] {
        marks(access: item.containment?.access, lifecycle: item.lifecycle)
    }

    private static func marks(
        access: InventoryAccess?, lifecycle: InventoryLifecycle
    ) -> [InventoryStateMark] {
        var marks: [InventoryStateMark] = []
        if let access {
            marks.append(
                InventoryStateMark(
                    id: "access", label: access == .open ? "Open" : "Closed",
                    isHighlighted: access == .open))
        }
        if lifecycle != .active {
            marks.append(
                InventoryStateMark(id: "lifecycle", label: lifecycle.label, isHighlighted: false))
        }
        return marks
    }
}

/// One state mark drawn as a chip.
internal struct InventoryStateBadge: View {
    internal let mark: InventoryStateMark

    internal var body: some View {
        Text(mark.label)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(tone)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .background(tone.opacity(0.14), in: .capsule)
    }

    private var tone: Color { mark.isHighlighted ? .popsInventory : .popsMutedForeground }
}

/// A key and its value on one line, or stacked when they do not fit.
internal struct InventoryPropertyLine: View {
    internal let key: String
    internal let value: String
    internal var tone: Color = .popsForeground

    internal var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                keyText
                Spacer(minLength: PopsSpacing.md)
                valueText.multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                keyText
                valueText
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private var keyText: some View {
        Text(key)
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
    }

    private var valueText: some View {
        Text(value)
            .font(.popsBody.weight(.medium))
            .foregroundStyle(tone)
    }
}

/// The path from a room to the thing holding an item, collapsing to room …
/// container when it does not fit rather than truncating mid-word.
internal struct InventoryPlacementPath: View {
    internal let trail: InventoryDetailTrail

    /// A path with nothing to hold on tap: a container's own page, a
    /// place's rows, and anywhere else that has crumbs but no
    /// `InventoryDetailTrail` of its own.
    internal init(crumbs: [String], isInHand: Bool) {
        trail = InventoryDetailTrail(crumbs: crumbs, isInHand: isInHand, holder: nil)
    }

    internal init(trail: InventoryDetailTrail) {
        self.trail = trail
    }

    internal var body: some View {
        if trail.isInHand {
            Label {
                Text("In hand")
            } icon: {
                InventorySymbol.inHand.image
            }
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsInventory)
        } else if trail.crumbs.isEmpty {
            Text("Location unknown")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        } else {
            ViewThatFits(in: .horizontal) {
                path(trail.crumbs)
                path(trail.collapsedCrumbs)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(trail.crumbs.joined(separator: ", then "))
        }
    }

    private func path(_ crumbs: [String]) -> some View {
        HStack(spacing: PopsSpacing.xs) {
            ForEach(Array(crumbs.enumerated()), id: \.offset) { index, crumb in
                if index > 0 {
                    Image(systemName: "chevron.forward")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Text(crumb)
                    .font(.popsCaption)
                    .foregroundStyle(
                        index == crumbs.count - 1 ? Color.popsForeground : Color.popsMutedForeground
                    )
                    .lineLimit(1)
                    .fixedSize()
            }
        }
    }
}

extension View {
    /// Fades the view in the first time it appears, and shows it at once
    /// under Reduce Motion.
    internal func inventoryFadeIn() -> some View {
        modifier(InventoryFadeInModifier())
    }
}

private struct InventoryFadeInModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .onAppear {
                guard !shown else { return }
                withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) { shown = true }
            }
    }
}
