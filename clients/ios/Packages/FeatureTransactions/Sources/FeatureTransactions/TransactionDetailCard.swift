import DesignSystem
import SwiftUI

/// One transaction, drawn.
///
/// Split out from ``TransactionDetailView`` rather than nested inside it, and
/// the split earns its keep twice. It is the same layout for the seeded shape
/// and the filled-in one, so arriving at the second is lines appearing rather
/// than the screen being replaced under the reader. And it is a view with no
/// `.task` and no model on it, which is the only kind `ImageRenderer` can see —
/// the screen's root cannot be rasterised at all, so without this nothing about
/// what this feature draws would be checkable off a simulator.
///
/// Every colour, gap and type size here is a token; there is no point size
/// anywhere, which is what keeps this legible at the accessibility Dynamic Type
/// sizes instead of clipping at them.
internal struct TransactionDetailCard: View {
    internal let content: TransactionDetailContent

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            heading
            fields
        }
    }

    private var heading: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text(content.title)
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(content.amount)
                    .font(.popsMonospaced)
                    .foregroundStyle(amountColor)
                Text(content.date)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        // One element, one sentence. Without this VoiceOver reads three
        // fragments and the listener has to assemble the heading themselves.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(content.accessibilityLabel)
    }

    /// A record with nothing but a heading draws no second card, rather than an
    /// empty one. The alternative is a bordered rectangle with nothing in it,
    /// which reads as a section that failed to load.
    @ViewBuilder private var fields: some View {
        if !content.fields.isEmpty {
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    ForEach(content.fields) { field in
                        line(field)
                    }
                }
            }
        }
    }

    private func line(_ field: TransactionDetailContent.Field) -> some View {
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

    /// Money arriving is the only thing coloured, and it is coloured because it
    /// is the rarer event rather than because it is good — the same call the
    /// list makes, and `TransactionRowView` carries the full reasoning.
    private var amountColor: Color {
        content.isCredit ? .popsSuccess : .popsForeground
    }
}
