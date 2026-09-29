import DesignSystem
import SwiftUI

/// The shared full-height type picker used by item forms and search filters.
///
/// Item forms opt into recent saved types; filters keep their existing `Any`
/// choice but use the same tree, search and selection treatment.
internal struct InventoryFormTypePicker: View {
    @Binding internal var selection: String?
    internal let options: [InventoryFormTypeOption]
    internal let noneTitle: String?
    internal let noneAccessibilityIdentifier: String?
    internal let onChoose: (@MainActor (String?) -> Void)?
    private let initialQuery: String
    private let showsRecents: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var query: String
    @State private var tree: InventoryTypePickerTreeState
    @State private var recentIDs: [String]

    internal init(
        selection: Binding<String?>, options: [InventoryFormTypeOption], title: String = "Type",
        noneTitle: String? = nil, noneAccessibilityIdentifier: String? = nil, query: String = "",
        showsRecents: Bool = false,
        onChoose: (@MainActor (String?) -> Void)? = nil
    ) {
        _selection = selection
        self.options = options
        self.noneTitle = noneTitle
        self.noneAccessibilityIdentifier = noneAccessibilityIdentifier
        self.onChoose = onChoose
        navigationTitle = title
        initialQuery = query
        self.showsRecents = showsRecents
        _query = State(initialValue: query)
        _tree = State(
            initialValue: InventoryTypePickerTreeState(
                options: options, selectedID: selection.wrappedValue))
        _recentIDs = State(
            initialValue: showsRecents
                ? InventoryTypeRecents.load(
                    validIDs: Set(options.filter { !$0.isArchived }.map(\.id)))
                : [])
    }

    private let navigationTitle: String

    internal var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                if showsRecents { recentSection }
                if let noneTitle { noneRow(title: noneTitle) }
                InventoryFormTypeTreeView(tree: tree, selection: selection) { id in
                    choose(id)
                }
            } else {
                searchRows
            }
        }
        .background(Color.popsBackground)
        .navigationTitle(navigationTitle)
        .searchable(text: $query, prompt: "Search types")
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
        .onAppear { query = initialQuery }
    }

    @ViewBuilder private var recentSection: some View {
        let visible = recentIDs.compactMap { id in options.first { $0.id == id } }
        if !visible.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                HStack {
                    Text("Recent types")
                        .font(.popsSubheadline.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                    Spacer()
                    Button("Clear") {
                        InventoryTypeRecents.clear()
                        recentIDs.removeAll()
                    }
                    .font(.popsCaption)
                    .frame(minHeight: PopsSize.touchTarget)
                    .accessibilityLabel("Clear recent types")
                }
                .padding(.horizontal, PopsSpacing.lg)
                ScrollView(.horizontal) {
                    HStack(spacing: PopsSpacing.md) {
                        ForEach(visible) { option in
                            Button {
                                choose(option.id)
                            } label: {
                                Label(option.label, systemImage: option.symbol.system)
                                    .fixedSize(horizontal: true, vertical: false)
                                    .padding(.horizontal, PopsSpacing.lg)
                                    .padding(.vertical, PopsSpacing.sm)
                                    .frame(minHeight: PopsSize.touchTarget)
                                    .background(
                                        selection == option.id
                                            ? Color.popsInventory.opacity(0.12) : Color.popsSurface,
                                        in: .capsule)
                            }
                            .accessibilityIdentifier(option.accessibilityIdentifier)
                            .accessibilityAddTraits(selection == option.id ? .isSelected : [])
                        }
                    }
                    .font(.popsSubheadline)
                    .padding(.horizontal, PopsSpacing.lg)
                }
                .scrollIndicators(.hidden)
            }
            .padding(.top, PopsSpacing.sm)
            .padding(.bottom, PopsSpacing.lg)
            Divider()
        }
    }

    private var searchRows: some View {
        ScrollView {
            LazyVStack(spacing: PopsSpacing.zero) {
                if searchOptions.isEmpty {
                    ContentUnavailableView.search(text: query)
                    Button("Show tree") { query = "" }
                        .frame(minHeight: PopsSize.touchTarget)
                }
                ForEach(searchOptions) { option in
                    Button {
                        choose(option.id)
                    } label: {
                        HStack(spacing: PopsSpacing.md) {
                            option.symbol.image.foregroundStyle(Color.popsInventory)
                            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                                Text(option.label).font(.popsBody)
                                Text(option.path)
                                    .font(.popsCaption)
                                    .foregroundStyle(Color.popsMutedForeground)
                            }
                            Spacer(minLength: PopsSpacing.sm)
                            if selection == option.id {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Color.popsInventory)
                            }
                        }
                        .padding(.horizontal, PopsSpacing.lg)
                        .frame(
                            maxWidth: .infinity, minHeight: PopsSize.touchTarget,
                            alignment: .leading
                        )
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .disabled(option.isArchived)
                    .accessibilityIdentifier(option.accessibilityIdentifier)
                    .accessibilityLabel(
                        selection == option.id
                            ? "Selected \(option.label)" : "Choose \(option.label)"
                    )
                    .accessibilityHint(option.path)
                    .accessibilityAddTraits(selection == option.id ? .isSelected : [])
                    Divider().padding(.leading, PopsSpacing.lg)
                }
            }
            .padding(.vertical, PopsSpacing.sm)
        }
    }

    @ViewBuilder private func noneRow(title: String) -> some View {
        Button {
            choose(nil)
        } label: {
            HStack {
                Text(title)
                Spacer(minLength: PopsSpacing.sm)
                if selection == nil {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.popsInventory)
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .frame(minHeight: PopsSize.touchTarget)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(noneAccessibilityIdentifier ?? "")
        .accessibilityAddTraits(selection == nil ? .isSelected : [])
    }

    private var searchOptions: [InventoryFormTypeOption] {
        let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return options.filter { $0.path.localizedCaseInsensitiveContains(value) }
            .sorted { left, right in
                switch left.path.localizedCaseInsensitiveCompare(right.path) {
                case .orderedAscending: true
                case .orderedDescending: false
                case .orderedSame: left.id < right.id
                }
            }
    }

    private func choose(_ id: String?) {
        guard id == nil || options.contains(where: { $0.id == id && !$0.isArchived }) else {
            return
        }
        if let onChoose {
            onChoose(id)
        } else {
            selection = id
            dismiss()
        }
    }
}
