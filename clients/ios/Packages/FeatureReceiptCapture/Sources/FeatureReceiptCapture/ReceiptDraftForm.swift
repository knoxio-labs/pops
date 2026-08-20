import DesignSystem
import SwiftUI

/// The reading, editable.
///
/// Split from ``ReceiptDraftView`` for the reason this package keeps splitting
/// views out: the screen owns a scroll and a bar, and neither is something
/// `ImageRenderer` can see into. This is the part with the layout in it.
///
/// ## It is still laid out like the paper
///
/// The groups and their order are the read-only reading's — who and when at
/// the top, the items in a column with their amounts in a column of their own,
/// what adjusts them, then the total at the foot. That is not inherited by
/// accident. The reader's job on this screen is running the form against the
/// receipt in their hand, and a form that reorganised the reading into a
/// settings list would make every comparison a search.
///
/// The fields are underlined rather than boxed for the same reason
/// (``PopsTextField`` says why at more length): the shape of the paper
/// survives, and every value is live from the first frame.
internal struct ReceiptDraftForm: View {
    @Binding internal var draft: ReceiptDraft

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            unattachedHints
            identity
            items
            totals
        }
    }
}

// MARK: the complaints that are about the paper

extension ReceiptDraftForm {
    /// A gate complaint that names no field — the receipt looked damaged, or
    /// something did not check out that has no field to point at.
    ///
    /// Every other hint is drawn against the field it is about. These are the
    /// remainder, and they are drawn once, at the top, in the same warning
    /// tone: they are a reason to look carefully at the whole thing rather
    /// than at one line.
    @ViewBuilder private var unattachedHints: some View {
        if !draft.unattachedHints.isEmpty {
            section(ReceiptDraftCopy.generalHintsLabel) {
                ForEach(draft.unattachedHints, id: \.self) { hint in
                    HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                        Image(systemName: PopsStatusHeader.Tone.warning.symbolName)
                            .font(.popsCaption)
                            .foregroundStyle(PopsStatusHeader.Tone.warning.color)
                            .accessibilityHidden(true)
                        Text(hint)
                            .font(.popsBody)
                            .foregroundStyle(Color.popsForeground)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

// MARK: who and when

extension ReceiptDraftForm {
    /// Merchant, address and date at three weights, as the read-only reading
    /// draws them. A merchant is what a reader recognises the receipt by; the
    /// address and the date place it. Three fields at one size is the
    /// flatness this surface was built to leave behind.
    private var identity: some View {
        section(ReceiptDraftCopy.identitySection) {
            PopsTextField(
                ReceiptDraftCopy.merchantLabel,
                placeholder: ReceiptDraftCopy.merchantPlaceholder,
                text: $draft.merchant.value,
                font: .popsTitle,
                note: hint(.merchant)
            )
            .accessibilityIdentifier(ReceiptDraftAccessibility.merchant)
            PopsTextField(
                ReceiptDraftCopy.addressLabel,
                placeholder: ReceiptDraftCopy.addressPlaceholder,
                text: $draft.address.value,
                font: .popsSubheadline,
                note: hint(.address)
            )
            .accessibilityIdentifier(ReceiptDraftAccessibility.address)
            PopsTextField(
                ReceiptDraftCopy.dateLabel,
                placeholder: ReceiptDraftCopy.datePlaceholder,
                text: $draft.date.value,
                note: hint(.date)
            )
            .accessibilityIdentifier(ReceiptDraftAccessibility.date)
        }
    }
}

// MARK: the items

extension ReceiptDraftForm {
    /// The column, plus the two things a reading of a receipt cannot do
    /// without: adding a row the model missed and removing one it invented.
    ///
    /// Both are ordinary controls rather than a destructive-looking edit
    /// mode. Three identical amounts summing to the exact printed total is
    /// decent evidence the lines are real, but only the person holding the
    /// paper knows, and the screen should not make saying so feel like an
    /// intervention.
    private var items: some View {
        section(
            ReceiptDraftCopy.itemsSection, caption: ReceiptDraftCopy.itemCount(draft.lines.count)
        ) {
            ForEach($draft.lines) { $line in
                ReceiptDraftLineRow(
                    line: $line,
                    problem: draft.problem(forLine: line.id) == nil
                        ? nil : ReceiptDraftCopy.lineAmountMissing,
                    remove: { draft.removeLine(id: line.id) }
                )
                if line.id != draft.lines.last?.id { PopsDivider() }
            }
            if let hint = hint(.lines) {
                Text(hint.text)
                    .font(.popsCaption)
                    .foregroundStyle(hint.tone.color)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            PopsButton(ReceiptDraftCopy.addItem) { draft.addLine() }
                .accessibilityIdentifier(ReceiptDraftAccessibility.addItem)
        }
    }
}

// MARK: what it came to

extension ReceiptDraftForm {
    /// The adjustments, then the total, then what is known about whether the
    /// two agree.
    ///
    /// The total is the one figure on this screen in ``Font/popsAmount``, as
    /// it is on the confirmation. A form is still a screen with a subject.
    private var totals: some View {
        section(ReceiptDraftCopy.totalsSection) {
            ForEach($draft.adjustments) { $adjustment in
                PopsTextField(
                    adjustment.kind.label,
                    placeholder: ReceiptDraftCopy.amountPlaceholder,
                    text: $adjustment.amount.value,
                    font: .popsMonospaced,
                    alignment: .trailing,
                    keyboard: .decimal
                )
            }
            if let hint = hint(.adjustments) {
                Text(hint.text)
                    .font(.popsCaption)
                    .foregroundStyle(hint.tone.color)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !draft.adjustments.isEmpty { PopsDivider() }
            PopsTextField(
                ReceiptDraftCopy.totalLabel,
                placeholder: ReceiptDraftCopy.amountPlaceholder,
                text: $draft.total.value,
                font: .popsAmount,
                alignment: .trailing,
                keyboard: .decimal,
                note: totalNote
            )
            .accessibilityIdentifier(ReceiptDraftAccessibility.total)
            reconciliation
        }
    }

    /// A missing total is what stops a save, so it outranks the gate's
    /// complaint about the same field: a reader who has just emptied the
    /// total needs to be told that, not reminded the print was smudged.
    private var totalNote: PopsFieldNote? {
        if draft.reportsMissingTotal { return .problem(ReceiptDraftCopy.totalMissing) }
        return hint(.total)
    }

    /// Whether the figures are known to agree — and, once one of them has
    /// been changed, that nobody has checked since.
    ///
    /// Drawn in ``PopsStatusHeader/Tone/success`` when it balanced, because
    /// that is the case this line exists for: it tells a reader who came here
    /// to rename three items which numbers they can safely leave alone.
    @ViewBuilder private var reconciliation: some View {
        let state = ReceiptDraftReconciliationCopy(draft.reconciliation)
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Image(systemName: state.tone.symbolName)
                .font(.popsCaption)
                .foregroundStyle(state.tone.color)
                .accessibilityHidden(true)
            Text(state.text)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.text)
        .accessibilityIdentifier(ReceiptDraftAccessibility.reconciliation)
    }
}

// MARK: shared chrome

extension ReceiptDraftForm {
    /// The gate's complaint about one field, as a note beside it. Never a
    /// problem: the extractor being unsure is a reason to look, and nothing
    /// the reader has to resolve before saving.
    private func hint(_ field: ReceiptDraftField) -> PopsFieldNote? {
        guard let hints = draft.hints[field], !hints.isEmpty else { return nil }
        return .hint(hints.joined(separator: " "))
    }

    /// A named group of fields in one card, with the label outside it — the
    /// same shape ``ReceiptResultCard`` uses, so the form and the reading it
    /// replaces are recognisably one screen in two states.
    private func section(
        _ title: String, caption: String? = nil, @ViewBuilder rows: () -> some View
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                Text(title)
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
                if let caption {
                    Spacer(minLength: PopsSpacing.sm)
                    Text(caption)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    rows()
                }
            }
        }
    }
}
