import AppCore
import DesignSystem
import SwiftUI

/// One transaction.
///
/// Built on `PopsRow` rather than beside it, so the redesign that changes what
/// a row looks like changes one file in `DesignSystem` and not this one. Every
/// colour, gap and type size here is a token; there is no point size anywhere,
/// which is what keeps the row legible at the accessibility Dynamic Type sizes
/// instead of clipping at them.
/// `SwiftUI.Transaction` and `AppCore.Transaction` are both in scope here, and
/// the SwiftUI one is not the one this row draws. Every mention of the type in
/// this module's SwiftUI files is qualified for that reason — unqualified, the
/// ambiguity resolves to the animation type and the errors point at member
/// lookup rather than at the name.
internal struct TransactionRowView: View {
    internal let transaction: AppCore.Transaction
    internal let presentation: TransactionPresentation

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsRow(title: transaction.description, subtitle: presentation.subtitle(transaction)) {
                Text(presentation.amount(transaction))
                    .font(.popsMonospaced)
                    .foregroundStyle(amountColor)
            }
            Text(presentation.caption(transaction))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        // One element, one sentence. Without this VoiceOver reads four
        // fragments and the reader has to assemble the row themselves.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(presentation.accessibilityLabel(transaction))
    }

    /// Money arriving is the only thing coloured, and it is coloured because it
    /// is the rarer event on this screen rather than because it is good.
    ///
    /// Spending deliberately stays on `popsForeground`: `popsDestructive` means
    /// "this failed" or "this cannot be undone" everywhere else in the app, and
    /// borrowing it for every purchase would make the token mean nothing and
    /// tell the reader their groceries were an error.
    private var amountColor: Color {
        presentation.isCredit(transaction) ? .popsSuccess : .popsForeground
    }
}
