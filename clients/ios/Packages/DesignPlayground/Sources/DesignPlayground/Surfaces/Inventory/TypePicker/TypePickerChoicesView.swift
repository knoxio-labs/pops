import DesignSystem
import SwiftUI

internal struct TypePickerChoicesView: View {
    let recentIDs: [String]
    let startsBrowsing: Bool
    let initialQuery: String
    let clearRecents: () -> Void
    let choose: (String?) -> Void
    @State private var query = ""
    @State private var browsing = false
    @State private var branch: [String] = []
    @State private var hidesRecents = false

    var body: some View {
        List {
            if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                results
            } else if browsing {
                tree
            } else {
                shortcuts
            }
            Section {
                Button("No type yet") { choose(nil) }
                    .frame(minHeight: PopsSize.touchTarget)
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Choose type")
        .searchable(text: $query, prompt: "Name, synonym or family")
        .onAppear {
            query = initialQuery
            browsing = startsBrowsing
        }
    }

    private var results: some View {
        Section {
            let matches = TypePickerTaxonomy.search(query)
            if matches.isEmpty {
                ContentUnavailableView.search(text: query)
                Button("Browse all types") {
                    query = ""
                    browsing = true
                }
                .frame(minHeight: PopsSize.touchTarget)
            }
            ForEach(matches) { node in
                TypePickerOption(node: node) { choose(node.id) }
            }
        }
    }

    private var shortcuts: some View {
        Group {
            if !recentIDs.isEmpty && !hidesRecents {
                Section("Recently used") {
                    ForEach(recentIDs.compactMap(TypePickerTaxonomy.node)) { node in
                        TypePickerOption(node: node) { choose(node.id) }
                    }
                    Button("Clear recents") {
                        clearRecents()
                        hidesRecents = true
                    }
                    .frame(minHeight: PopsSize.touchTarget)
                }
            }
            Section {
                Button {
                    browsing = true
                } label: {
                    Label("Browse all types", systemImage: "square.grid.2x2")
                        .frame(minHeight: PopsSize.touchTarget)
                }
            } footer: {
                Text("Try “insert”, “cover” or “bedding”.")
            }
        }
    }

    private var tree: some View {
        Section {
            if branch.isEmpty && !startsBrowsing {
                Button("Back to recents") { browsing = false }
                    .frame(minHeight: PopsSize.touchTarget)
            }
            if let parentID = branch.last, let parent = TypePickerTaxonomy.node(parentID) {
                Button {
                    branch.removeLast()
                } label: {
                    Label("Up one level", systemImage: "chevron.left")
                        .frame(minHeight: PopsSize.touchTarget)
                }
                TypePickerOption(node: parent, prefix: "Choose ") { choose(parent.id) }
            }
            ForEach(TypePickerTaxonomy.children(of: branch.last ?? "item")) { node in
                if TypePickerTaxonomy.children(of: node.id).isEmpty {
                    TypePickerOption(node: node) { choose(node.id) }
                } else {
                    Button {
                        branch.append(node.id)
                    } label: {
                        HStack {
                            Text(node.name)
                            Spacer()
                            Image(systemName: "chevron.right").accessibilityHidden(true)
                        }
                        .frame(minHeight: PopsSize.touchTarget)
                    }
                    .accessibilityHint("Browse subtypes")
                }
            }
        } header: {
            Text(TypePickerTaxonomy.breadcrumb(for: branch.last ?? "item"))
        }
    }
}

internal struct TypePickerOption: View {
    let node: TypePickerType
    var prefix = ""
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(prefix + node.name).font(.popsBody)
                Text(TypePickerTaxonomy.breadcrumb(for: node.id))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}
