import SwiftUI

/// The label and action for a search bar's optional add control.
public struct PopsSearchBarAdd {
    fileprivate let label: String
    fileprivate let action: () -> Void

    /// Creates an add control with the label VoiceOver reads.
    public init(label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }
}

/// A Mail-style search field with filter, scan, dictation and optional add controls.
public struct PopsSearchBar<FilterOptions: View>: View {
    @Binding private var query: String
    private let tint: Color
    private let prompt: String
    private let isFiltered: Bool
    private let filterSummary: String
    private let add: PopsSearchBarAdd?
    private let onFilter: (() -> Void)?
    private let scan: (() -> Void)?
    private let onSubmit: () -> Void
    @ViewBuilder private let filterOptions: () -> FilterOptions
    @ScaledMetric(relativeTo: .body) private var height = PopsSize.touchTarget
    @FocusState private var isFocused: Bool

    internal enum TrailingControl: Equatable {
        case scan
        case dictate
        case clearSearch

        internal var accessibilityLabel: String {
            switch self {
            case .scan: "Scan"
            case .dictate: "Dictate"
            case .clearSearch: "Clear search"
            }
        }
    }

    internal var trailingControl: TrailingControl {
        if !query.isEmpty { return .clearSearch }
        return scan == nil ? .dictate : .scan
    }

    internal var filterAccessibilityValue: String {
        filterSummary.isEmpty ? "None" : filterSummary
    }

    /// Creates a filter menu, or invokes `onFilter` when an action is supplied.
    public init(
        query: Binding<String>, tint: Color, prompt: String = "Search", isFiltered: Bool,
        filterSummary: String = "", add: PopsSearchBarAdd? = nil,
        onFilter: (() -> Void)? = nil, scan: (() -> Void)? = nil,
        onSubmit: @escaping () -> Void = {},
        @ViewBuilder filterOptions: @escaping () -> FilterOptions
    ) {
        self._query = query
        self.tint = tint
        self.prompt = prompt
        self.isFiltered = isFiltered
        self.filterSummary = filterSummary
        self.add = add
        self.onFilter = onFilter
        self.scan = scan
        self.onSubmit = onSubmit
        self.filterOptions = filterOptions
    }

    public var body: some View {
        PopsGlassGroup(spacing: PopsSpacing.sm) {
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
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
            TextField(prompt, text: $query)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .tint(tint)
                .focused($isFocused)
                .onSubmit(onSubmit)
            trailingButton
        }
        .font(.popsBody)
        .padding(.leading, PopsSpacing.md)
        .padding(.trailing, PopsSpacing.sm)
        .frame(minHeight: height)
        .popsGlass(in: Capsule())
        .contentShape(Capsule())
        .popsMotion(value: query.isEmpty)
    }

    @ViewBuilder private var trailingButton: some View {
        switch trailingControl {
        case .scan:
            if let scan {
                Button(action: scan) {
                    Image(systemName: "qrcode.viewfinder")
                        .foregroundStyle(tint)
                        .padding(.horizontal, PopsSpacing.xs)
                        .frame(minHeight: height)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(trailingControl.accessibilityLabel)
                .transition(.opacity)
            }
        case .dictate:
            Button {
                isFocused = true
            } label: {
                Image(systemName: "mic")
                    .foregroundStyle(tint)
                    .padding(.horizontal, PopsSpacing.xs)
                    .frame(minHeight: height)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(trailingControl.accessibilityLabel)
            .transition(.opacity)
        case .clearSearch:
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
            .accessibilityLabel(trailingControl.accessibilityLabel)
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
            .popsMotion(value: isFiltered)
        }
        .accessibilityLabel("Filter")
        .accessibilityValue(filterAccessibilityValue)
    }

    private func filterButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            circle(filled: isFiltered) {
                Image(systemName: "line.3.horizontal.decrease")
            }
            .popsMotion(value: isFiltered)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Filter")
        .accessibilityValue(filterAccessibilityValue)
    }

    private func addButton(_ add: PopsSearchBarAdd) -> some View {
        Button(action: add.action) {
            circle(filled: false) {
                Image(systemName: "plus")
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(add.label)
    }

    private func circle(filled: Bool, @ViewBuilder glyph: () -> some View) -> some View {
        glyph()
            .font(.popsBody.weight(.semibold))
            .foregroundStyle(filled ? Color.popsBackground : tint)
            .frame(width: height, height: height)
            .background {
                if filled {
                    Circle().fill(tint)
                }
            }
            .popsGlass(in: Circle())
            .contentShape(Circle())
    }
}

extension PopsSearchBar where FilterOptions == EmptyView {
    /// Creates a search bar whose filter control invokes an action, such as opening a sheet.
    public init(
        query: Binding<String>, tint: Color, prompt: String = "Search", isFiltered: Bool,
        filterSummary: String = "", onFilter: @escaping () -> Void,
        scan: (() -> Void)? = nil, onSubmit: @escaping () -> Void = {},
        add: PopsSearchBarAdd? = nil
    ) {
        self.init(
            query: query, tint: tint, prompt: prompt, isFiltered: isFiltered,
            filterSummary: filterSummary, add: add, onFilter: onFilter, scan: scan,
            onSubmit: onSubmit, filterOptions: { EmptyView() })
    }
}
