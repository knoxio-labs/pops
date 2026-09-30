import AppCore
import DesignSystem
import SwiftUI

/// The tags purchase lines carry, most used first, any number of them
/// chosen. A native checklist rather than chips: the list is as long as the
/// tags in use, and a checklist is what the system draws for "pick several
/// from a known set".
public struct PurchasesTagPicker: View {
    @Binding private var selection: Set<String>
    @State private var query: String
    @State private var model: PurchasesTagPickerModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Creates a tag picker over server-paged tags, toggling into `selection`.
    public init(
        selection: Binding<Set<String>>,
        repository: any PurchasesRepository,
        query: String = ""
    ) {
        _selection = selection
        _query = State(initialValue: query)
        _model = State(wrappedValue: PurchasesTagPickerModel(repository: repository))
    }

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
            if case .loading = model.state {
                Section {
                    ForEach(0..<4, id: \.self) { _ in
                        PurchasesTagRowSkeleton()
                            .listRowSeparator(.hidden)
                    }
                }
            }
            if case .loaded = model.state,
                !model.tags.isEmpty || model.paging != .exhausted
            {
                Section {
                    ForEach(model.tags, id: \.tag) { entry in
                        row(
                            title: entry.tag, count: entry.count, isAny: false,
                            isOn: selection.contains(entry.tag)
                        ) {
                            toggle(entry.tag)
                        }
                    }
                    pagingRow
                }
            }
        }
        .purchasesInsetGroupedList()
        .navigationTitle("Tags")
        .popsTitleDisplay(large: false)
        .overlay {
            emptyState
        }
        .purchasesPinnedSearchable(text: $query, prompt: "Tags")
        .onChange(of: query) { _, query in model.updateQuery(query) }
        .task(id: query) {
            model.updateQuery(query)
            await model.load()
        }
        .popsMotion(value: selection)
        .popsMotion(value: query)
        .popsMotion(value: model.pageRevision)
        .popsMotion(value: model.paging)
    }

    @ViewBuilder private var emptyState: some View {
        switch model.state {
        case .loading:
            EmptyView()
        case .failed:
            VStack(spacing: PopsSpacing.md) {
                ContentUnavailableView("Tags unavailable", systemImage: "tag.slash")
                PopsButton("Retry") { Task { await model.retryFirstPage() } }
            }
        case .loaded where model.tags.isEmpty && model.paging == .exhausted:
            switch Self.emptyState(shown: [], tagsInUse: [], isSearching: isSearching) {
            case .none: EmptyView()
            case .noTagsYet: ContentUnavailableView("No tags yet", systemImage: "tag")
            case .noMatches: ContentUnavailableView("No tags match", systemImage: "tag.slash")
            }
        case .loaded:
            EmptyView()
        }
    }

    @ViewBuilder private var pagingRow: some View {
        switch model.paging {
        case .exhausted:
            EmptyView()
        case .idle, .loading:
            PurchasesTagRowSkeleton()
                .listRowSeparator(.hidden)
                .accessibilityLabel("Loading more tags")
                .task(id: model.pageRevision) { await model.loadNextPageIfNeeded() }
        case .failed:
            HStack {
                Text("Couldn’t load more tags")
                    .foregroundStyle(Color.popsDestructive)
                Spacer()
                PopsButton("Retry") { Task { await model.retryNextPage() } }
            }
            .listRowSeparator(.hidden)
        }
    }

    private struct PurchasesTagRowSkeleton: View {
        @ScaledMetric(relativeTo: .body) private var symbolSize = PopsSize.touchTarget

        var body: some View {
            HStack(spacing: PopsSpacing.md) {
                RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                    .fill(Color.popsSurface)
                    .frame(width: symbolSize, height: symbolSize)
                Capsule().fill(Color.popsSurface)
                    .frame(width: symbolSize * 1.8, height: PopsSpacing.md)
                Spacer(minLength: PopsSpacing.sm)
                Capsule().fill(Color.popsSurface)
                    .frame(width: PopsSpacing.xl, height: PopsSpacing.md)
            }
            .frame(minHeight: PopsSize.touchTarget)
            .popsShimmer()
            .accessibilityElement(children: .ignore)
        }
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
        .transition(reduceMotion ? .identity : PopsMotion.row)
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
