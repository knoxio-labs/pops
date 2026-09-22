import DesignSystem
import SwiftUI

/// One editable line.
///
/// Its own view rather than a method for the reason ``ReceiptLineRow`` is: it
/// reads the environment. At the accessibility text sizes a description and an
/// amount side by side leave the description a column two words wide, so the
/// row stacks — and it stacks on the same rule the read-only row uses, so the
/// reading and the form break at the same size rather than at two.
internal struct ReceiptDraftLineRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Both columns grow with the text. A fixed column around scaling type is
    /// the clipping the design system exists to prevent, arrived at from the
    /// other side — and it is worse in a field than in a label, because what
    /// gets cut off is what somebody is in the middle of typing.
    @ScaledMetric(relativeTo: .body) private var amountColumn = PopsSize.amountColumn
    @ScaledMetric(relativeTo: .caption) private var countColumn = PopsSize.countField

    @Binding internal var line: ReceiptDraftLine
    internal let problem: String?
    internal let remove: () -> Void

    /// Whether the second tier is showing. Opens itself for a line that has
    /// something in it, so nothing the paper said is hidden behind a tap — it
    /// is the empty ones that stay shut, and those are the majority.
    @State private var showsDetails: Bool

    internal init(
        line: Binding<ReceiptDraftLine>, problem: String?, remove: @escaping () -> Void
    ) {
        _line = line
        self.problem = problem
        self.remove = remove
        _showsDetails = State(initialValue: line.wrappedValue.hasQualifiers)
    }

    /// ## Why the qualifiers are behind a disclosure
    ///
    /// Every field draws its own underline, which is how this form keeps the
    /// shape of the paper. Four fields a line is four rules a line, and a
    /// five-item receipt came out as a page of horizontal lines with the
    /// receipt somewhere behind them — and three of the four are usually
    /// empty, because most lines are a name and a price.
    ///
    /// So the second tier opens on demand, and opens itself when there is
    /// anything in it. The rules that remain are the two fields every line
    /// has.
    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            primary
            if showsDetails {
                qualifiers
            } else if line.hasQualifiers {
                summary
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// What the hidden tier says, when it is hidden and has something to say.
    /// `2 · $4.90/kg · was 5.50` in one muted line — readable without being
    /// four more fields.
    @ViewBuilder private var summary: some View {
        let parts = [
            line.quantity.value.isEmpty ? nil : line.quantity.value,
            line.unitNote.value.isEmpty ? nil : line.unitNote.value,
            line.listPrice.value.isEmpty
                ? nil
                : "\(ReceiptDraftCopy.itemListPriceLabel.lowercased()) \(line.listPrice.value)",
        ].compactMap { $0 }
        if !parts.isEmpty {
            Button {
                showsDetails = true
            } label: {
                Text(parts.joined(separator: " · "))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private var primary: some View {
        if ReceiptLineLayout.stacks(at: dynamicTypeSize) {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                description
                HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                    amount
                    detailsToggle
                    removeButton
                }
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                description
                amount
                    .frame(maxWidth: Self.amountWidth(at: dynamicTypeSize, column: amountColumn))
                detailsToggle
                removeButton
            }
        }
    }

    /// The control that opens the second tier, in the row that is always
    /// there. A chevron rather than a label, because it is the least
    /// important thing on the line and a word would give it the weight of the
    /// amount beside it.
    private var detailsToggle: some View {
        Button {
            showsDetails.toggle()
        } label: {
            Image(systemName: showsDetails ? "chevron.up" : "chevron.down")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .buttonStyle(.plain)
        .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
        .contentShape(Rectangle())
        .accessibilityLabel(ReceiptDraftCopy.itemDetails)
    }

    private var description: some View {
        PopsTextField(
            placeholder: ReceiptDraftCopy.itemDescriptionPlaceholder,
            text: $line.description.value
        )
        .accessibilityIdentifier(ReceiptDraftAccessibility.itemDescription)
    }

    private var amount: some View {
        PopsTextField(
            placeholder: ReceiptDraftCopy.amountPlaceholder,
            text: $line.amount.value,
            font: .popsMonospaced,
            alignment: .trailing,
            keyboard: .decimal,
            note: problem.map(PopsFieldNote.problem)
        )
        .accessibilityIdentifier(ReceiptDraftAccessibility.itemAmount)
    }

    /// The quantity and the unit note, under the pair they qualify and
    /// smaller than it — they are what the receipt said *about* the price,
    /// not the price.
    private var qualifiers: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                PopsTextField(
                    ReceiptDraftCopy.itemQuantityLabel,
                    placeholder: ReceiptDraftCopy.itemQuantityPlaceholder,
                    text: $line.quantity.value,
                    font: .popsCaption,
                    keyboard: .number
                )
                .frame(maxWidth: Self.quantityWidth(at: dynamicTypeSize, column: countColumn))
                PopsTextField(
                    placeholder: ReceiptDraftCopy.itemUnitNotePlaceholder,
                    text: $line.unitNote.value,
                    font: .popsCaption
                )
            }
            // What it would have cost, beside what it did. A separate field
            // rather than a second reading of `amount`: the charged figure is
            // the one the gate checked and this one is checked against
            // nothing, so they must not look like the same kind of number.
            PopsTextField(
                ReceiptDraftCopy.itemListPriceLabel,
                placeholder: ReceiptDraftCopy.itemListPricePlaceholder,
                text: $line.listPrice.value,
                font: .popsCaption,
                alignment: .trailing,
                keyboard: .decimal
            )
            .frame(maxWidth: Self.amountWidth(at: dynamicTypeSize, column: amountColumn))
        }
    }

    private var removeButton: some View {
        Button(action: remove) {
            Image(systemName: "minus.circle")
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .buttonStyle(.plain)
        .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
        .contentShape(Rectangle())
        .accessibilityLabel(ReceiptDraftCopy.removeItem(line.description.value))
        .accessibilityIdentifier(ReceiptDraftAccessibility.removeItem)
    }

    /// How much of the row the amount may take when the row is still a row.
    ///
    /// A value rather than a modifier buried in `body`, so the rule is
    /// assertable — the same reason ``ReceiptLineLayout`` is one. `nil` above
    /// the stacking threshold because there is no side-by-side row left to
    /// divide, and a width cap on a stacked field would just squeeze it.
    internal nonisolated static func amountWidth(at size: DynamicTypeSize, column: CGFloat)
        -> CGFloat?
    {
        ReceiptLineLayout.stacks(at: size) ? nil : column
    }

    /// Wide enough for a count and no wider — until the row stacks, when
    /// capping it would squeeze a field that now has the whole width.
    internal nonisolated static func quantityWidth(at size: DynamicTypeSize, column: CGFloat)
        -> CGFloat?
    {
        ReceiptLineLayout.stacks(at: size) ? nil : column
    }
}

/// What the reconciliation line says and in what tone.
///
/// A value rather than a `switch` inside the view, so "a reading that
/// balanced is reported in the success tone, and an edited one is not
/// reported as either" is a claim a test can make without rasterising
/// anything.
internal struct ReceiptDraftReconciliationCopy: Hashable, Sendable {
    internal let text: String
    internal let tone: PopsStatusHeader.Tone

    internal init(_ reconciliation: ReceiptDraftReconciliation) {
        switch reconciliation {
        case .reconciledAsRead:
            text = ReceiptDraftCopy.reconciledAsRead
            tone = .success
        case .disputedAsRead(let detail):
            text = [ReceiptDraftCopy.disputedAsRead, detail].compactMap { $0 }.joined(
                separator: " ")
            tone = .warning
        case .notRechecked:
            text = ReceiptDraftCopy.notRechecked
            // Nothing has gone wrong and nothing is confirmed. The tone for a
            // fact the reader did not get wrong and cannot be blamed for.
            tone = .information
        }
    }
}
