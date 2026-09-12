import DesignSystem
import Foundation
import SwiftUI

extension ReceiptDraftForm {
    /// Merchant, address and date at three weights, as the read-only reading
    /// draws them. A merchant is what a reader recognises the receipt by; the
    /// address and the date place it. Three fields at one size is the
    /// flatness this surface was built to leave behind.
    internal var identity: some View {
        section(ReceiptDraftCopy.identitySection) {
            merchantField
            if !draft.online { addressField }
            onlineToggle
            PopsTextField(
                ReceiptDraftCopy.dateLabel,
                placeholder: ReceiptDraftCopy.datePlaceholder,
                text: $draft.date.value,
                note: hint(.date)
            )
            .accessibilityIdentifier(ReceiptDraftAccessibility.date)
        }
    }

    /// One field, with the known merchants attached to it.
    ///
    /// It was a picker *and* a text field, which put two controls on one
    /// value: a reading resolves no entity on the handset, so the form opened
    /// with an empty picker beside the name it had just read. The value has
    /// one place to be, and choosing from the list is a way of filling it
    /// rather than a second thing to fill.
    ///
    /// Typing clears ``ReceiptDraft/merchantEntityID``, because a name typed
    /// over a chosen entity is the reader saying it was the wrong entity —
    /// keeping the id would file the purchase under a merchant whose name is
    /// no longer on screen. Picking sets it, which is the whole reason the
    /// list is here: `merchantEntityId` is the operative half of the pair, and
    /// a form that only ever produced a label could never attach one.
    private var merchantField: some View {
        ReceiptDraftFieldWithChoices(
            label: ReceiptDraftCopy.merchantLabel,
            placeholder: ReceiptDraftCopy.merchantPlaceholder,
            text: $draft.merchant.value,
            font: .popsTitle,
            note: hint(.merchant),
            choices: merchants.map(\.name),
            resolved: draft.merchantEntityID != nil,
            onChoose: { name in
                if let merchant = merchants.first(where: { $0.name == name }) {
                    choose(merchant)
                }
            },
            onType: { draft.merchantEntityID = nil }
        )
        .accessibilityIdentifier(ReceiptDraftAccessibility.merchant)
    }

    /// The same, over the chosen merchant's branches.
    ///
    /// There is nothing to offer until there is a merchant to offer it for,
    /// and a list of every address in contacts is not a help — so an
    /// unresolved merchant leaves this a plain field, which is also what an
    /// entity with no address on file gets.
    private var addressField: some View {
        let known = merchants.first { $0.id == draft.merchantEntityID }?.addresses ?? []
        return ReceiptDraftFieldWithChoices(
            label: ReceiptDraftCopy.addressLabel,
            placeholder: ReceiptDraftCopy.addressPlaceholder,
            text: $draft.address.value,
            font: .popsSubheadline,
            note: hint(.address),
            choices: known,
            resolved: known.contains(trimmedAddress),
            onChoose: { draft.address.value = $0 },
            onType: {}
        )
        .accessibilityIdentifier(ReceiptDraftAccessibility.address)
    }

    /// Removes the address field rather than disabling it. A field that is
    /// present and greyed still reads as something missing; a field that is
    /// gone reads as something that does not apply, which is what an online
    /// order's branch is.
    private var onlineToggle: some View {
        Toggle(isOn: $draft.online) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(ReceiptDraftCopy.onlineLabel)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                if draft.online {
                    Text(ReceiptDraftCopy.onlineCaption)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
        .tint(Color.popsAccent)
    }

    /// `trimmed` is `fileprivate` to the model's own file, and widening it
    /// for a comparison here would put a string helper on the package's
    /// surface for the sake of one call site.
    fileprivate var trimmedAddress: String {
        draft.address.value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func choose(_ merchant: ReceiptMerchantChoice) {
        draft.merchantEntityID = merchant.id
        draft.merchant.value = merchant.name
        if !merchant.addresses.contains(trimmedAddress) {
            draft.address.value = merchant.addresses.count == 1 ? merchant.addresses[0] : ""
        }
    }
}
