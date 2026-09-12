import DesignSystem
import SwiftUI

/// One record the reader can point a field at.
internal struct ReceiptDraftRecord: Identifiable, Hashable, Sendable {
    internal let id: String
    internal let name: String
}

/// A field that points at a record, never at a string.
///
/// Both the merchant and the branch are this: contacts owns the entities, an
/// entity owns a list of addresses, and the question the form asks is *which
/// of those* rather than *what does it say*. So there is no text field — a
/// text field admits an answer the data model has no room for, and that is how
/// purchases end up attributed to a name nothing can reconcile against.
///
/// Every route out ends at a record. Choose one, or create one. The till's
/// wording is shown beneath when it differs, as provenance rather than as an
/// answer: it is what a later match would be attempted against.
///
/// ## The mark says where it came from
///
/// A record the server matched is a *proposal* — nobody has looked at it — and
/// one a person chose or created is settled. Drawing them the same would
/// collect agreement nobody gave. The glyphs differ in shape as well as
/// colour, because a state told only by a hue is a state some readers do not
/// have.
internal struct ReceiptDraftRecordSelect: View {
    internal let label: String
    @Binding internal var resolution: RecordResolution
    /// What the till printed. Shown under the value when the two differ.
    internal let printed: String
    internal let records: [ReceiptDraftRecord]
    internal let symbol: String
    internal let placeholder: String
    internal let createTitle: String
    internal let note: PopsFieldNote?
    /// Said when there is nothing to choose from yet — an address before a
    /// merchant is chosen, for instance, which is a different situation from
    /// a merchant with no branches on file.
    internal var unavailable: String?

    @State private var choosing = false

    private var chosen: String? {
        if let value = resolution.createdValue { return value }
        guard let id = resolution.entityID else { return nil }
        return records.first { $0.id == id }?.name
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            if let unavailable {
                Text(unavailable)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                control
            }
            provenance
            if let note {
                Text(note.text)
                    .font(.popsCaption)
                    .foregroundStyle(note.tone.color)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            PopsDivider()
        }
        .sheet(isPresented: $choosing) {
            ReceiptDraftRecordSheet(
                title: label,
                records: records,
                selected: resolution.entityID,
                symbol: symbol,
                seed: printed,
                createTitle: createTitle,
                onChoose: { record in
                    resolution = .chosen(id: record.id)
                    choosing = false
                },
                onCreate: { value in
                    resolution = .created(value: value)
                    choosing = false
                }
            )
        }
    }

    private var control: some View {
        Button {
            choosing = true
        } label: {
            HStack(spacing: PopsSpacing.sm) {
                Text(chosen ?? placeholder)
                    .font(.popsBody)
                    .foregroundStyle(
                        chosen == nil ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                mark
                Spacer(minLength: PopsSpacing.sm)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .frame(minHeight: PopsSize.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var mark: some View {
        switch resolution {
        case .chosen:
            seal("checkmark.seal.fill", Color.popsSuccess, ReceiptDraftCopy.resolvedByPerson)
        case .created:
            seal("plus.circle.fill", Color.popsSuccess, ReceiptDraftCopy.resolvedByCreation)
        case .matched:
            seal("checkmark.seal", Color.popsMutedForeground, ReceiptDraftCopy.resolvedByServer)
        case .unresolved:
            EmptyView()
        }
    }

    private func seal(_ symbol: String, _ tone: Color, _ label: String) -> some View {
        Image(systemName: symbol)
            .font(.popsCaption)
            .foregroundStyle(tone)
            .accessibilityLabel(label)
    }

    /// What the paper said, when that is not what the field now points at.
    /// Absent when they agree, because repeating the same words at two
    /// weights says nothing.
    @ViewBuilder private var provenance: some View {
        let trimmed = printed.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty, trimmed.caseInsensitiveCompare(chosen ?? "") != .orderedSame {
            Text(ReceiptDraftCopy.printedAs(trimmed))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

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
    internal let title: String
    internal let records: [ReceiptDraftRecord]
    internal let selected: String?
    internal let symbol: String
    internal let seed: String
    internal let createTitle: String
    internal let onChoose: (ReceiptDraftRecord) -> Void
    internal let onCreate: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var newName: String

    internal init(
        title: String,
        records: [ReceiptDraftRecord],
        selected: String?,
        symbol: String,
        seed: String,
        createTitle: String,
        onChoose: @escaping (ReceiptDraftRecord) -> Void,
        onCreate: @escaping (String) -> Void
    ) {
        self.title = title
        self.records = records
        self.selected = selected
        self.symbol = symbol
        self.seed = seed
        self.createTitle = createTitle
        self.onChoose = onChoose
        self.onCreate = onCreate
        _newName = State(initialValue: seed.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private var matches: [ReceiptDraftRecord] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return records }
        return records.filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
    }

    private var creatable: String {
        newName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    internal var body: some View {
        NavigationStack {
            List {
                if records.isEmpty {
                    Text(ReceiptDraftCopy.nothingOnFile)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                } else if matches.isEmpty {
                    Text(ReceiptDraftCopy.noMatches)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                } else {
                    ForEach(matches) { record in
                        row(record)
                    }
                }
                create
            }
            .navigationTitle(title)
            .searchable(text: $query, prompt: ReceiptDraftCopy.searchChoices)
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
                        .foregroundStyle(Color.popsAccent)
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
            Button {
                onCreate(creatable)
            } label: {
                Label(ReceiptDraftCopy.createRecord(creatable), systemImage: "plus.circle")
            }
            .disabled(creatable.isEmpty)
        }
    }
}
