import DesignSystem
import SwiftUI

/// One line as the receipt printed it.
///
/// Its own view rather than a method on the card because it reads the
/// environment: at the accessibility text sizes a description and an amount
/// side by side leave the description a column two words wide, so the row
/// stacks instead. ``ReceiptLineLayout`` owns that decision, so it is a value
/// a test can assert rather than something only a screenshot could show.
internal struct ReceiptLineRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    internal let line: ReceiptResultContent.LineItem

    internal var body: some View {
        layout
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(line.accessibilityLabel)
    }

    @ViewBuilder private var layout: some View {
        if ReceiptLineLayout.stacks(at: dynamicTypeSize) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                description
                amount
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                description
                Spacer(minLength: PopsSpacing.sm)
                amount
            }
        }
    }

    private var description: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(line.description)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
            if let note = line.note {
                Text(note)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    private var amount: some View {
        Text(line.amount)
            .font(.popsMonospaced)
            .foregroundStyle(Color.popsForeground)
    }
}

/// Whether a line item's description and its amount fit on one row.
///
/// A value rather than a modifier chain, so the rule is assertable without a
/// rendered hierarchy. A layout decision that exists only inside a `body` is
/// one a test can prove nothing about — the same gap that let "layout" suites
/// elsewhere in this app pass with their `ScrollView` deleted.
internal enum ReceiptLineLayout {
    /// Two columns until the text sizes where two columns stop being two
    /// columns. Keyed on `isAccessibilitySize` rather than on a chosen
    /// threshold, because that is the boundary the platform itself draws
    /// between "larger text" and "text large enough that layouts have to
    /// change".
    internal static func stacks(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }
}
