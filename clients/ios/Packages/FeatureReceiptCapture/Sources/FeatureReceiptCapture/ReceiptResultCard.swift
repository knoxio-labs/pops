import DesignSystem
import SwiftUI

/// One outcome, drawn.
///
/// Split out from ``ReceiptResultView`` rather than nested inside it, for the
/// same reason `TransactionDetailCard` is: this is a view with no `.task` on
/// it, which is the only kind `ImageRenderer` can see — the screen's root
/// carries the submission, and nothing about what this card draws would be
/// checkable off a simulator otherwise.
///
/// ## What the three outcomes share, and what they must not
///
/// All three open with a ``PopsStatusHeader``, whose tone comes from
/// ``ReceiptResultContent/tone`` rather than from a choice made here. That is
/// what makes them one designed surface rather than three: same opening
/// shape, same place for the sentence — and a glyph and a colour that differ
/// before a word is read, which is what they were missing when they were
/// three grey cards distinguished only by their copy.
///
/// Underneath, they diverge as much as their content does. `created` is a
/// figure with a merchant over it; `needsReview` is a receipt laid out the
/// way the paper is, so a reviewer can run down two columns at once;
/// `unreadable` is a sentence.
///
/// Every colour, gap and type size here is a token; there is no point size
/// anywhere, which is what keeps this legible at the accessibility Dynamic
/// Type sizes instead of clipping at them.
internal struct ReceiptResultCard: View {
    internal let content: ReceiptResultContent

    internal var body: some View {
        switch content {
        case .created(let created):
            createdCard(created)
        case .needsReview(let needsReview):
            needsReviewCard(needsReview)
        case .unreadable(let unreadable):
            unreadableCard(unreadable)
        }
    }
}

// MARK: created

extension ReceiptResultCard {
    /// The confirmation. One figure, larger than anything else on the screen,
    /// under the name of who took it — which is the pair a reader checks
    /// against the paper in their hand before they put it in the bin.
    ///
    /// The reference sits last, monospaced and small. It identifies the
    /// purchase and describes nothing about it, so it is the one thing here
    /// nobody has to read.
    private func createdCard(_ content: ReceiptResultContent.CreatedContent) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            PopsStatusHeader(
                tone: content.tone,
                title: content.heading,
                message: content.message)
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    if let merchantName = content.merchantName {
                        Text(merchantName)
                            .font(.popsTitle)
                            .foregroundStyle(Color.popsForeground)
                    }
                    if let purchasedOn = content.purchasedOn {
                        Text(purchasedOn)
                            .font(.popsSubheadline)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    PopsDivider()
                    total(content)
                    if let itemCount = content.itemCount {
                        Text(itemCount)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    Text(content.reference)
                        .font(.popsMonospacedCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
        // One element, one sentence. Without this VoiceOver reads five
        // fragments and the listener has to assemble the confirmation
        // themselves — which is why `CreatedContent` carries a one-line
        // summary it never draws.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(content.accessibilityLabel)
        .accessibilityIdentifier(ReceiptResultAccessibility.created)
    }

    /// The label and the figure, with the figure given the whole of the
    /// remaining width so it lands on the right edge — the place a total is
    /// printed on every receipt ever issued.
    private func total(_ content: ReceiptResultContent.CreatedContent) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            Text(ReceiptResultCopy.createdTotalLabel)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            Spacer(minLength: PopsSpacing.sm)
            Text(content.total)
                .font(.popsAmount)
                .foregroundStyle(Color.popsForeground)
        }
    }
}

// MARK: needs review

extension ReceiptResultCard {
    private func needsReviewCard(_ content: ReceiptResultContent.NeedsReviewContent) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            PopsStatusHeader(
                tone: content.tone,
                title: content.heading,
                message: content.message,
                caption: content.photoCount
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(content.accessibilityLabel)
            complaints(content.failureLines)
            reading(content)
        }
        .accessibilityIdentifier(ReceiptResultAccessibility.needsReview)
    }

    /// What the gate objected to, one row each, each led by the same glyph
    /// the heading carries — so a reader scanning down sees how many separate
    /// problems there are before reading any of them.
    @ViewBuilder private func complaints(_ failures: [ReceiptResultContent.Field]) -> some View {
        if !failures.isEmpty {
            section(ReceiptResultCopy.needsReviewWhatFailed) {
                ForEach(failures) { failure in
                    HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                        Image(systemName: PopsStatusHeader.Tone.warning.symbolName)
                            .font(.popsCaption)
                            .foregroundStyle(PopsStatusHeader.Tone.warning.color)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(failure.label)
                                .font(.popsHeadline)
                                .foregroundStyle(Color.popsForeground)
                            Text(failure.value)
                                .font(.popsBody)
                                .foregroundStyle(Color.popsMutedForeground)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(failure.accessibilityLabel)
                }
            }
        }
    }

    /// The reading, laid out the way the paper is: who and when at the top,
    /// the items in a column, what adjusts them, then the total at the foot.
    ///
    /// A card with nothing in it draws nothing rather than an empty rectangle
    /// — the same call `TransactionDetailCard` makes about a record with no
    /// fields, and it matters more here: an empty bordered box under "What
    /// was read" reads as a section that failed to load rather than as a
    /// reading that found nothing.
    @ViewBuilder private func reading(_ content: ReceiptResultContent.NeedsReviewContent)
        -> some View
    {
        if !content.orderedFields.isEmpty || !content.lines.isEmpty {
            section(ReceiptResultCopy.needsReviewWhatWeRead) {
                identity(content.identity)
                if !content.lines.isEmpty {
                    if !content.identity.isEmpty { PopsDivider() }
                    ForEach(content.lines) { line in
                        ReceiptLineRow(line: line)
                    }
                }
                if content.total != nil || !content.adjustments.isEmpty {
                    PopsDivider()
                    ForEach(content.adjustments) { adjustment in
                        amountRow(adjustment, emphasised: false)
                    }
                    if let total = content.total {
                        amountRow(total, emphasised: true)
                    }
                }
                if let notes = content.notes {
                    PopsDivider()
                    labelledLine(notes)
                }
            }
        }
    }

    /// The merchant is the receipt's own headline; the address and the date
    /// place it. Three weights, because they are three different kinds of
    /// fact — the flat version of this is what made the reading unscannable.
    @ViewBuilder private func identity(_ identity: ReceiptResultContent.Identity) -> some View {
        if !identity.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                if let merchant = identity.merchant {
                    Text(merchant.value)
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                        .accessibilityLabel(merchant.accessibilityLabel)
                }
                if let address = identity.address {
                    Text(address.value)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityLabel(address.accessibilityLabel)
                }
                if let date = identity.date {
                    Text(date.value)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityLabel(date.accessibilityLabel)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// A name on the left and a figure on the right, monospaced so a column
    /// of them lines up on the decimal point.
    private func amountRow(_ field: ReceiptResultContent.Field, emphasised: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            Text(field.label)
                .font(emphasised ? Font.popsHeadline : Font.popsSubheadline)
                .foregroundStyle(emphasised ? Color.popsForeground : Color.popsMutedForeground)
            Spacer(minLength: PopsSpacing.sm)
            Text(field.value)
                .font(.popsMonospaced)
                .foregroundStyle(Color.popsForeground)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(field.accessibilityLabel)
    }

    /// A field whose value is prose rather than a figure, so it wraps under
    /// its label instead of being squeezed beside it.
    private func labelledLine(_ field: ReceiptResultContent.Field) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(field.label)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            Text(field.value)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(field.accessibilityLabel)
    }

    /// A named group of rows in one card. The label sits outside the card
    /// rather than as its first row, so the card's edge is the group's edge
    /// and a reader can tell where one section stops.
    private func section(_ title: String, @ViewBuilder rows: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    rows()
                }
            }
        }
    }
}

// MARK: unreadable

extension ReceiptResultCard {
    private func unreadableCard(_ content: ReceiptResultContent.UnreadableContent) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            PopsStatusHeader(
                tone: content.tone,
                title: content.heading,
                message: content.message,
                caption: content.photoCount)
            PopsCard {
                Text(content.reason)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(content.accessibilityLabel)
        .accessibilityIdentifier(ReceiptResultAccessibility.unreadable)
    }
}
