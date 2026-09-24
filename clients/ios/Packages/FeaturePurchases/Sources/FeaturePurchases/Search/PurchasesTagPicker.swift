import AppCore
import DesignSystem
import SwiftUI

/// The tags purchase lines carry, most used first, any number of them
/// chosen. A native checklist rather than chips: the list is as long as the
/// tags in use, and a checklist is what the system draws for "pick several
/// from a known set".
public struct PurchasesTagPicker: View {
    @Binding private var selection: Set<String>
    private let tags: [PurchaseTagCount]
    @State private var query: String

    /// Creates a tag picker over the tags in use, toggling into `selection`.
    public init(
        selection: Binding<Set<String>>, tags: [PurchaseTagCount], query: String = ""
    ) {
        _selection = selection
        self.tags = tags
        _query = State(initialValue: query)
    }

    private var shown: [PurchaseTagCount] { Self.matching(tags, query) }
    private var isSearching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    public var body: some View {
        List {
            // Any clears the choice rather than naming a tag, so it has
            // nothing to match and steps aside while a query narrows the list.
            if !isSearching {
                Section {
                    row(title: "Any", count: nil, isAny: true, isOn: selection.isEmpty) {
                        selection = []
                    }
                }
            }
            if !shown.isEmpty {
                Section {
                    ForEach(shown, id: \.tag) { entry in
                        row(
                            title: entry.tag, count: entry.count, isAny: false,
                            isOn: selection.contains(entry.tag)
                        ) {
                            toggle(entry.tag)
                        }
                    }
                }
            }
        }
        .purchasesInsetGroupedList()
        .navigationTitle("Tags")
        .popsTitleDisplay(large: false)
        .overlay {
            switch Self.emptyState(shown: shown, tagsInUse: tags, isSearching: isSearching) {
            case .none: EmptyView()
            case .noTagsYet: ContentUnavailableView("No tags yet", systemImage: "tag")
            case .noMatches: ContentUnavailableView("No tags match", systemImage: "tag.slash")
            }
        }
        .purchasesPinnedSearchable(text: $query, prompt: "Tags")
        .popsMotion(value: selection)
        .popsMotion(value: query)
    }

    /// The tags whose name holds the query, case-insensitively, in the order
    /// given. A blank query keeps every tag.
    ///
    /// `nonisolated` because a main-actor static trapped when a nonisolated
    /// test called it.
    nonisolated public static func matching(
        _ tags: [PurchaseTagCount], _ query: String
    ) -> [PurchaseTagCount] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return tags }
        return tags.filter { $0.tag.localizedCaseInsensitiveContains(trimmed) }
    }

    /// The digits shown beside a row for its use count, or `nil` for the
    /// "Any" row, which names no count. Pulled out of `row` purely so the
    /// text it puts on screen has something a test can call directly.
    nonisolated internal static func countLabel(_ count: Int?) -> String? {
        count.map(String.init)
    }

    /// Which empty message, if any, the list's overlay should draw.
    ///
    /// Distinguishes a genuinely empty tag vocabulary (``noTagsYet``, nothing
    /// to search yet) from a query that filtered every tag out
    /// (``noMatches``) — the two read very differently to someone who just
    /// hasn't tagged anything.
    internal enum EmptyState: Equatable {
        case none
        case noTagsYet
        case noMatches
    }

    /// `nonisolated` for the same reason ``matching(_:_:)`` is.
    nonisolated internal static func emptyState(
        shown: [PurchaseTagCount], tagsInUse: [PurchaseTagCount], isSearching: Bool
    ) -> EmptyState {
        guard shown.isEmpty else { return .none }
        return tagsInUse.isEmpty && !isSearching ? .noTagsYet : .noMatches
    }

    private func row(
        title: String, count: Int?, isAny: Bool, isOn: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: PopsSpacing.sm) {
                Label(title, systemImage: isAny ? "tag.slash" : "tag")
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if let label = Self.countLabel(count) {
                    Text(label)
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
        selection = Self.toggling(tag, in: selection)
    }

    /// `selection` with `tag` removed when present, or added when it is not.
    nonisolated internal static func toggling(
        _ tag: String, in selection: Set<String>
    ) -> Set<String> {
        var toggled = selection
        if toggled.contains(tag) {
            toggled.remove(tag)
        } else {
            toggled.insert(tag)
        }
        return toggled
    }
}
