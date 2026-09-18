import DesignSystem
import SwiftUI

/// Inventory's search, in the shape of Mail's: a touch-target-tall glass
/// capsule with the magnifying glass leading, dictation trailing while it is
/// empty and a clear button once it is not. Beside it, a filter circle of the
/// same height, amber-filled only while a filter narrows the list, and, when
/// the list can grow from here, an add circle.
///
/// The filter circle calls `onFilter`, which presents the filter sheet;
/// `filterSummary` is what VoiceOver reads as its value. With `scan` set, the
/// field's trailing glyph opens the scanner rather than dictation. Dictation
/// itself is the keyboard's: the glyph focuses the field, whose keyboard
/// carries the microphone.
internal struct InventorySearchBar: View {
    @Binding internal var query: String
    internal var prompt = "Search"
    internal let isFiltered: Bool
    internal var filterSummary = ""
    internal let onFilter: () -> Void
    internal var scan: (() -> Void)?
    internal var add: InventorySearchBarAdd?
    internal var onSubmit: () -> Void = {}
    @FocusState private var isFocused: Bool
    @ScaledMetric(relativeTo: .body) private var height = PopsSize.touchTarget

    internal var body: some View {
        InventoryGlassGroup(spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                field
                filterButton
                if let add {
                    addButton(add)
                }
            }
        }
    }

    private var field: some View {
        HStack(spacing: PopsSpacing.sm) {
            InventorySymbol.search.image
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
            TextField(prompt, text: $query)
                .focused($isFocused)
                .submitLabel(.search)
                .onSubmit(onSubmit)
                .autocorrectionDisabled()
                .tint(.popsInventory)
            trailingButton
        }
        .font(.popsBody)
        .padding(.leading, PopsSpacing.md)
        .padding(.trailing, PopsSpacing.sm)
        .frame(minHeight: height)
        .inventoryGlass(in: Capsule())
        .contentShape(Capsule())
        .inventoryMotion(value: query.isEmpty)
    }

    @ViewBuilder private var trailingButton: some View {
        if query.isEmpty, let scan {
            fieldButton(.scan, label: "Scan", tone: .popsInventory, action: scan)
        } else if query.isEmpty {
            fieldButton(.dictate, label: "Dictate", tone: .popsInventory) { isFocused = true }
        } else {
            fieldButton(
                InventorySymbol(system: "xmark.circle.fill"), label: "Clear search",
                tone: .popsMutedForeground
            ) { query = "" }
        }
    }

    private func fieldButton(
        _ symbol: InventorySymbol, label: String, tone: Color, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            symbol.image
                .foregroundStyle(tone)
                .padding(.horizontal, PopsSpacing.xs)
                .frame(minHeight: height)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .transition(.opacity)
    }

    private var filterButton: some View {
        Button(action: onFilter) {
            circle(filled: isFiltered) {
                Image(systemName: "line.3.horizontal.decrease")
            }
            .inventoryMotion(value: isFiltered)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Filter")
        .accessibilityValue(filterSummary.isEmpty ? "None" : filterSummary)
    }

    private func addButton(_ add: InventorySearchBarAdd) -> some View {
        Button(action: add.action) {
            circle(filled: false) {
                InventorySymbol.addNew.image
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(add.label)
    }

    private func circle(filled: Bool, @ViewBuilder glyph: () -> some View) -> some View {
        glyph()
            .font(.popsBody.weight(.semibold))
            .foregroundStyle(filled ? Color.popsBackground : Color.popsInventory)
            .frame(width: height, height: height)
            .background {
                if filled {
                    Circle().fill(Color.popsInventory)
                }
            }
            .inventoryGlass(in: Circle())
            .contentShape(Circle())
    }
}

/// The search bar's add circle: what VoiceOver calls it and what it does.
internal struct InventorySearchBarAdd {
    internal let label: String
    internal let action: () -> Void
}
