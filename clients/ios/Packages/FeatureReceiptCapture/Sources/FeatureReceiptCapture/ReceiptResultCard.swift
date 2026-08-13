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

    private func createdCard(_ content: ReceiptResultContent.CreatedContent) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    Text(content.heading)
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsSuccess)
                    Text(content.message)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                    Text(content.reference)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    Text(content.noDestinationNote)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(content.accessibilityLabel)
        }
    }

    private func needsReviewCard(_ content: ReceiptResultContent.NeedsReviewContent) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            heading(
                title: content.heading, message: content.message, caption: content.photoCount,
                tone: .popsWarning)
            fieldsCard(title: ReceiptResultCopy.needsReviewWhatFailed, fields: content.failureLines)
            fieldsCard(title: ReceiptResultCopy.needsReviewWhatWeRead, fields: content.extractedFields)
        }
    }

    private func unreadableCard(_ content: ReceiptResultContent.UnreadableContent) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            heading(
                title: content.heading, message: content.message, caption: content.photoCount,
                tone: .popsDestructive)
            PopsCard {
                Text(content.reason)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(content.accessibilityLabel)
    }

    private func heading(title: String, message: String, caption: String?, tone: Color) -> some View
    {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text(title)
                    .font(.popsTitle)
                    .foregroundStyle(tone)
                Text(message)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                if let caption {
                    Text(caption)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    /// A section with nothing in it draws no card, rather than an empty one —
    /// the same call `TransactionDetailCard` makes about a record with no
    /// fields. `needsReview` always has at least one failure line, but the
    /// extracted table can be empty when the model read nothing at all.
    @ViewBuilder private func fieldsCard(title: String, fields: [ReceiptResultContent.Field])
        -> some View
    {
        if !fields.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text(title)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                PopsCard {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        ForEach(fields) { field in
                            line(field)
                        }
                    }
                }
            }
        }
    }

    private func line(_ field: ReceiptResultContent.Field) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(field.label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Text(field.value)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(field.accessibilityLabel)
    }
}
