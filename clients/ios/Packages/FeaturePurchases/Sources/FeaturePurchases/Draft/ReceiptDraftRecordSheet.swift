import DesignSystem
import Observation
import SwiftUI

/// The records, searchable, with a way to add one.
///
/// Search is the primary control rather than a refinement: there will be
/// hundreds of merchants, and a list that long rendered in one column with no
/// way to narrow it is a list somebody reads rather than one somebody finds
/// something in.
///
/// The create row is seeded with what the till printed, because that is
/// overwhelmingly what the new record should be called and retyping it is the
/// tax a form charges for the machine not having recognised something. It is
/// editable, because a till's wording is frequently not what anybody calls
/// the shop.
internal struct ReceiptDraftRecordSheet: View {
    internal enum ResultState: Equatable {
        case prompt
        case searching
        case noMatches
        case records([ReceiptDraftRecord])
    }

    internal let title: String
    internal let search: (String) async -> [ReceiptDraftRecord]
    internal let selectedPreview: ReceiptDraftRecord?
    internal let selected: String?
    internal let symbol: String
    internal let seed: String
    internal let createTitle: String
    internal let onChoose: (ReceiptDraftRecord) -> Void
    internal let onCreate: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var newName: String
    @State private var searchState = ReceiptDraftRecordSearch()

    internal init(
        title: String,
        search: @escaping (String) async -> [ReceiptDraftRecord],
        selectedPreview: ReceiptDraftRecord?,
        selected: String?,
        symbol: String,
        seed: String,
        createTitle: String,
        onChoose: @escaping (ReceiptDraftRecord) -> Void,
        onCreate: @escaping (String) -> Void
    ) {
        self.title = title
        self.search = search
        self.selectedPreview = selectedPreview
        self.selected = selected
        self.symbol = symbol
        self.seed = seed
        self.createTitle = createTitle
        self.onChoose = onChoose
        self.onCreate = onCreate
        _newName = State(initialValue: seed.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private var creatable: String {
        newName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var resultState: ResultState {
        Self.resultState(
            query: searchState.trimmedQuery,
            isSearching: searchState.isSearching,
            results: searchState.results,
            selectedPreview: selectedPreview)
    }

    internal static func resultState(
        query: String,
        isSearching: Bool,
        results: [ReceiptDraftRecord],
        selectedPreview: ReceiptDraftRecord?
    ) -> ResultState {
        if isSearching { return .searching }
        if query.isEmpty {
            return selectedPreview.map { .records([$0]) } ?? .prompt
        }
        return results.isEmpty ? .noMatches : .records(results)
    }

    internal var body: some View {
        NavigationStack {
            List {
                switch resultState {
                case .searching:
                    ProgressView()
                case .prompt:
                    Text(ReceiptDraftCopy.searchChoices)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                case .noMatches:
                    Text(ReceiptDraftCopy.noMatches)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                case .records(let records):
                    ForEach(records) { record in
                        row(record)
                    }
                }
                create
            }
            .navigationTitle(title)
            .searchable(text: $query, prompt: ReceiptDraftCopy.searchChoices)
            .task(id: query) {
                await searchState.update(query: query, search: search)
            }
            .toolbar {
                ToolbarItem {
                    Button(ReceiptDraftCopy.cancelChoosing) { dismiss() }
                }
            }
        }
    }

    private func row(_ record: ReceiptDraftRecord) -> some View {
        Button {
            onChoose(record)
        } label: {
            HStack(spacing: PopsSpacing.md) {
                Label(record.name, systemImage: symbol)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if record.id == selected {
                    Image(systemName: "checkmark")
                        .font(.popsCaption)
                        .foregroundStyle(.tint)
                }
            }
        }
    }

    private var create: some View {
        Section(createTitle) {
            PopsTextField(
                placeholder: ReceiptDraftCopy.newRecordPlaceholder,
                text: $newName
            )
            .accessibilityIdentifier(ReceiptDraftAccessibility.newRecordName)
            Button {
                onCreate(creatable)
            } label: {
                Label(ReceiptDraftCopy.createRecord(creatable), systemImage: "plus.circle")
            }
            .disabled(creatable.isEmpty)
            .accessibilityIdentifier(ReceiptDraftAccessibility.createRecord)
        }
    }
}

@MainActor
@Observable
internal final class ReceiptDraftRecordSearch {
    internal private(set) var trimmedQuery = ""
    internal private(set) var results: [ReceiptDraftRecord] = []
    internal private(set) var isSearching = false

    internal func update(
        query: String,
        search: @escaping (String) async -> [ReceiptDraftRecord],
        wait: @escaping () async -> Void = {
            try? await Task.sleep(for: .milliseconds(300))
        }
    ) async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        trimmedQuery = trimmed
        guard !trimmed.isEmpty else {
            results = []
            isSearching = false
            return
        }

        isSearching = true
        await wait()
        guard !Task.isCancelled else { return }
        let matches = await search(trimmed)
        guard !Task.isCancelled else { return }
        results = matches
        isSearching = false
    }
}
