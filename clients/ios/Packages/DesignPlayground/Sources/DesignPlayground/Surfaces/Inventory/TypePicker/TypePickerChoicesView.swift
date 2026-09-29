import DesignSystem
import SwiftUI

internal struct TypePickerChoicesView: View {
    let session: TypePickerSession
    let choose: (String?) -> Void
    @State private var query: String
    @State private var tree: TypePickerTreeState

    init(
        session: TypePickerSession, mode: TypePickerTreeMode,
        initialQuery: String, expanded: Bool, choose: @escaping (String?) -> Void
    ) {
        self.session = session
        self.choose = choose
        _query = State(initialValue: initialQuery)
        let state = TypePickerTreeState(mode: mode)
        if expanded {
            ["home-textiles", "pillows-cushions", "cushions"].forEach(state.toggle)
        }
        _tree = State(initialValue: state)
    }

    var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                recents
                TypePickerTreeView(tree: tree, choose: choose)
            } else {
                results
            }
        }
        .background(Color.popsBackground)
        .navigationTitle("Choose type")
        .playgroundTitleDisplay(large: false)
        .searchable(text: $query, prompt: "Search all types")
        .playgroundTrailingBarItem {
            Button("No type yet") { choose(nil) }
        }
    }

    @ViewBuilder private var recents: some View {
        if !session.recentTypeIDs.isEmpty {
            ScrollView(.horizontal) {
                HStack(spacing: PopsSpacing.sm) {
                    Text("Recent").foregroundStyle(Color.popsMutedForeground)
                    ForEach(session.recentTypeIDs.compactMap(TypePickerTaxonomy.node)) { node in
                        Button(node.name) { choose(node.id) }
                            .padding(.horizontal, PopsSpacing.md)
                            .frame(minHeight: PopsSize.touchTarget)
                            .background(Color.popsSurface, in: .capsule)
                    }
                    Button("Clear", action: session.clearRecentTypes)
                        .frame(minHeight: PopsSize.touchTarget)
                        .accessibilityLabel("Clear recent types")
                }
                .font(.popsSubheadline)
                .padding(.horizontal, PopsSpacing.lg)
            }
            .scrollIndicators(.hidden)
            Divider()
        }
    }

    private var results: some View {
        ScrollView {
            LazyVStack(spacing: PopsSpacing.zero) {
                let matches = TypePickerTaxonomy.search(query)
                if matches.isEmpty {
                    ContentUnavailableView.search(text: query)
                    Button("Show tree") { query = "" }
                        .frame(minHeight: PopsSize.touchTarget)
                }
                ForEach(matches) { node in
                    TypePickerOption(node: node) { choose(node.id) }
                    Divider()
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
    }
}

internal struct TypePickerOption: View {
    let node: TypePickerType
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(node.name).font(.popsBody)
                Text(TypePickerTaxonomy.breadcrumb(for: node.id))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .padding(.vertical, PopsSpacing.xs)
            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}
