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
    internal let resolvedName: String?
    internal let search: (String) async -> [ReceiptDraftRecord]
    internal let symbol: String
    internal let placeholder: String
    internal let createTitle: String
    internal let note: PopsFieldNote?

    @State private var choosing = false
    /// The record a person just picked in the sheet, kept alongside the id it
    /// answers for. The caller's `resolvedName` is only good once its own
    /// async preview has caught up to `resolution`, which is not immediate —
    /// so between closing the sheet and that arriving, this is what the label
    /// reads from. It stops answering the moment the id it was pinned to
    /// stops being the current one, which is what keeps a switch from
    /// Woolworths to Bunnings from showing "Woolworths" against the new id.
    @State private var pinned: ReceiptDraftRecord?

    private var chosen: String? {
        Self.chosenName(resolution: resolution, pinned: pinned, resolvedName: resolvedName)
    }

    /// What the control's label should read, given what is pinned locally and
    /// what the caller has resolved. A pinned record only answers for the id
    /// it was chosen with; once `resolution` points elsewhere, it is silent
    /// and `resolvedName` — the caller's own async preview — takes back over.
    internal static func chosenName(
        resolution: RecordResolution,
        pinned: ReceiptDraftRecord?,
        resolvedName: String?
    ) -> String? {
        if let value = resolution.createdValue { return value }
        guard let id = resolution.entityID else { return nil }
        if let pinned, pinned.id == id { return pinned.name }
        return resolvedName
    }

    private var selectedPreview: ReceiptDraftRecord? {
        guard let id = resolution.entityID, let resolvedName else { return nil }
        return ReceiptDraftRecord(id: id, name: resolvedName)
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            control
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
                search: search,
                selectedPreview: selectedPreview,
                selected: resolution.entityID,
                symbol: symbol,
                seed: printed,
                createTitle: createTitle,
                onChoose: { record in
                    pinned = record
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
                Text(chosen ?? unresolvedLabel)
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

    /// What to show before anything is resolved.
    ///
    /// The till's wording, not a prompt. It used to be the placeholder with
    /// the wording repeated in a sentence underneath and an error under that —
    /// three lines to say one thing, two of them prose, and the error shown
    /// before anybody had touched the form. The wording is the useful part and
    /// it is data, so it goes where the value goes.
    private var unresolvedLabel: String {
        let trimmed = printed.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? placeholder : trimmed
    }

    /// What the paper said, once the field points somewhere else.
    ///
    /// Only then: while nothing is resolved the wording is already the value
    /// above, and printing it twice at two weights says nothing.
    @ViewBuilder private var provenance: some View {
        let trimmed = printed.trimmingCharacters(in: .whitespacesAndNewlines)
        if let chosen, !trimmed.isEmpty,
            trimmed.caseInsensitiveCompare(chosen) != .orderedSame
        {
            Text(ReceiptDraftCopy.printedAs(trimmed))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
