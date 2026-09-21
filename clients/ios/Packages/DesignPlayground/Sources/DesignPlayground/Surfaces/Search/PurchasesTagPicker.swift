import DesignSystem
import SwiftUI

/// The tags purchases' lines carry, most used first, any number of them
/// chosen. A native checklist rather than chips: the list is as long as the
/// tags in use, and a checklist is what the system draws for "pick several
/// from a known set".
internal struct PurchasesTagPicker: View {
    @Binding internal var selection: Set<String>
    internal let tags: [(tag: String, count: Int)]
    @State private var query: String

    internal init(
        selection: Binding<Set<String>>, tags: [(tag: String, count: Int)], query: String = ""
    ) {
        _selection = selection
        self.tags = tags
        _query = State(initialValue: query)
    }

    private var shown: [(tag: String, count: Int)] { Self.matching(tags, query) }
    private var isSearching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    internal var body: some View {
        List {
            // Any clears the choice rather than naming a tag, so it has
            // nothing to match and steps aside while a query narrows the list.
            if !isSearching {
                Section {
                    row(title: "Any", count: nil, isOn: selection.isEmpty) { selection = [] }
                }
            }
            if !shown.isEmpty {
                Section {
                    ForEach(shown, id: \.tag) { entry in
                        row(
                            title: entry.tag, count: entry.count,
                            isOn: selection.contains(entry.tag)
                        ) {
                            toggle(entry.tag)
                        }
                    }
                }
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Tags")
        .playgroundTitleDisplay(large: false)
        .overlay {
            if shown.isEmpty { ContentUnavailableView("No tags match", systemImage: "tag.slash") }
        }
        .playgroundPinnedSearchable(text: $query, prompt: "Tags")
        .inventoryMotion(value: selection)
        .inventoryMotion(value: query)
    }

    /// The tags whose name holds the query, case-insensitively, in the order
    /// given. A blank query keeps every tag.
    nonisolated internal static func matching(
        _ tags: [(tag: String, count: Int)], _ query: String
    ) -> [(tag: String, count: Int)] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return tags }
        return tags.filter { $0.tag.localizedCaseInsensitiveContains(trimmed) }
    }

    private func row(
        title: String, count: Int?, isOn: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: PopsSpacing.sm) {
                Label(title, systemImage: count == nil ? "tag.slash" : "tag")
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if let count {
                    Text("\(count)")
                        .font(.popsCaption)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Image(systemName: "checkmark")
                    .font(.popsBody.weight(.semibold))
                    .foregroundStyle(.tint)
                    .opacity(isOn ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private func toggle(_ tag: String) {
        if selection.contains(tag) {
            selection.remove(tag)
        } else {
            selection.insert(tag)
        }
    }
}
