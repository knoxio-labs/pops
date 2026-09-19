import DesignSystem
import SwiftUI

/// Inventory's search, in the shape of Mail's: a touch-target-tall glass
/// capsule with the magnifying glass leading, dictation trailing while it is
/// empty and a clear button once it is not. Beside it, a filter circle of the
/// same height, amber-filled only while a filter narrows the list, and, when
/// the list can grow from here, an add circle.
///
/// The filter circle opens `filterOptions` as its menu, or calls `onFilter`
/// when a screen presents its filters as a sheet instead; `filterSummary` is
/// what VoiceOver reads as the filter's value. With `scan` set, the field's
/// trailing glyph opens the scanner rather than dictation.
internal struct InventorySearchBar<FilterOptions: View>: View {
    @Binding internal var query: String
    internal var prompt = "Search"
    internal let isFiltered: Bool
    internal var filterSummary = ""
    internal var add: InventorySearchBarAdd?
    internal var onFilter: (() -> Void)?
    internal var scan: (() -> Void)?
    @ViewBuilder internal let filterOptions: () -> FilterOptions
    @ScaledMetric(relativeTo: .body) private var height = PopsSize.touchTarget

    internal var body: some View {
        InventoryGlassGroup(spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                field
                if let onFilter {
                    filterButton(onFilter)
                } else {
                    filterMenu
                }
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
                .submitLabel(.search)
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
            Button(action: scan) {
                InventorySymbol.scan.image
                    .foregroundStyle(Color.popsInventory)
                    .padding(.horizontal, PopsSpacing.xs)
                    .frame(minHeight: height)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Scan")
            .transition(.opacity)
        } else if query.isEmpty {
            Button {
            } label: {
                InventorySymbol.dictate.image
                    .foregroundStyle(Color.popsInventory)
                    .padding(.horizontal, PopsSpacing.xs)
                    .frame(minHeight: height)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dictate")
            .transition(.opacity)
        } else {
            Button {
                query = ""
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(Color.popsMutedForeground)
                    .padding(.horizontal, PopsSpacing.xs)
                    .frame(minHeight: height)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Clear search")
            .transition(.opacity)
        }
    }

    private var filterMenu: some View {
        Menu {
            filterOptions()
        } label: {
            circle(filled: isFiltered) {
                Image(systemName: "line.3.horizontal.decrease")
            }
            .inventoryMotion(value: isFiltered)
        }
        .accessibilityLabel("Filter")
        .accessibilityValue(filterSummary.isEmpty ? "None" : filterSummary)
    }

    private func filterButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
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

extension InventorySearchBar where FilterOptions == EmptyView {
    /// A bar whose filter circle opens a sheet.
    internal init(
        query: Binding<String>, prompt: String, isFiltered: Bool, filterSummary: String,
        onFilter: @escaping () -> Void, scan: (() -> Void)? = nil,
        add: InventorySearchBarAdd? = nil
    ) {
        self.init(
            query: query, prompt: prompt, isFiltered: isFiltered, filterSummary: filterSummary,
            add: add, onFilter: onFilter, scan: scan, filterOptions: { EmptyView() })
    }
}

/// The search bar's add circle: what VoiceOver calls it and what it does.
internal struct InventorySearchBarAdd {
    internal let label: String
    internal let action: () -> Void
}
