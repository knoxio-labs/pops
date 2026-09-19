import DesignSystem
import SwiftUI

/// Which rows of one list are selected. Selection mode is nothing more than a
/// non-empty set: the first mark tapped enters it, the last one cleared
/// leaves it, so there is no separate Select button to forget about.
internal struct InventorySelection: Equatable {
    internal private(set) var ids: Set<String>

    internal init(_ ids: Set<String> = []) {
        self.ids = ids
    }

    internal var isSelecting: Bool { !ids.isEmpty }
    internal var count: Int { ids.count }

    internal func contains(_ id: String) -> Bool { ids.contains(id) }

    internal mutating func toggle(_ id: String) {
        if ids.remove(id) == nil { ids.insert(id) }
    }

    /// Whether every one of `all` is selected; false for an empty list.
    internal func isAllSelected(_ all: [String]) -> Bool {
        !all.isEmpty && Set(all).isSubset(of: ids)
    }

    /// Selects every one of `all`, or clears the selection when they already
    /// are, which leaves selection mode.
    internal mutating func toggleAll(_ all: [String]) {
        ids = isAllSelected(all) ? [] : ids.union(all)
    }

    internal mutating func deselectAll() {
        ids = []
    }

    /// Drops whatever is no longer in the list, so a row that left by any
    /// route stops counting, and the last one to leave ends selection mode.
    internal mutating func keepOnly(_ present: Set<String>) {
        ids.formIntersection(present)
    }
}

extension View {
    /// Makes this row selectable in `selection`: a selected row takes an
    /// amber tint, and while the list is selecting a tap anywhere on the row
    /// toggles it instead of opening it.
    /// A nil `id` leaves the row as it is.
    internal func inventorySelectable(
        _ id: String?, in selection: Binding<InventorySelection>
    ) -> some View {
        modifier(InventorySelectableRowModifier(id: id, selection: selection))
    }
}

private struct InventorySelectableRowModifier: ViewModifier {
    let id: String?
    @Binding var selection: InventorySelection

    func body(content: Content) -> some View {
        if let id {
            let isSelected = selection.contains(id)
            content
                .anchorPreference(key: InventorySelectedRowsKey.self, value: .bounds) {
                    isSelected ? [$0] : []
                }
                .overlay {
                    if selection.isSelecting {
                        Button {
                            selection.toggle(id)
                        } label: {
                            Rectangle()
                                .fill(Color.popsBackground.opacity(0))
                                .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHidden(true)
                    }
                }
                .accessibilityAddTraits(isSelected ? .isSelected : [])
                .inventoryMotion(value: isSelected)
        } else {
            content
        }
    }
}

/// The bounds of every selected row inside one panel, so the panel can tint
/// them the way a native list does rather than each row tinting itself.
private struct InventorySelectedRowsKey: PreferenceKey {
    static let defaultValue: [Anchor<CGRect>] = []

    static func reduce(value: inout [Anchor<CGRect>], nextValue: () -> [Anchor<CGRect>]) {
        value.append(contentsOf: nextValue())
    }
}

extension View {
    /// Tints every selected row inside this panel across its full width,
    /// from separator to separator, the way a native list's selected row
    /// fills. `rowOutset` is the padding the panel puts around each row, which
    /// the tint covers; a row about `edgeInset` from the panel's top or bottom
    /// reaches that edge, and `shape`'s corners clip it there. Apply it
    /// between the panel's padding and its fill. The tint runs under the
    /// separator below it, so two selected rows read as one run.
    internal func inventorySelectionHighlights<S: Shape>(
        rowOutset: CGFloat = PopsSpacing.zero, edgeInset: CGFloat = PopsSpacing.zero, in shape: S
    ) -> some View {
        backgroundPreferenceValue(InventorySelectedRowsKey.self) { anchors in
            GeometryReader { proxy in
                ForEach(anchors.indices, id: \.self) { index in
                    let row = proxy[anchors[index]]
                    let reach = edgeInset + PopsSpacing.xs
                    let top =
                        row.minY - rowOutset <= reach ? PopsSpacing.zero : row.minY - rowOutset
                    let bottom =
                        row.maxY + rowOutset >= proxy.size.height - reach
                        ? proxy.size.height : row.maxY + rowOutset + PopsBorder.hairline
                    Rectangle()
                        .fill(Color.popsInventory.opacity(0.14))
                        .frame(width: proxy.size.width, height: max(bottom - top, PopsSpacing.zero))
                        .offset(y: top)
                }
            }
            .clipShape(shape)
        }
    }
}
