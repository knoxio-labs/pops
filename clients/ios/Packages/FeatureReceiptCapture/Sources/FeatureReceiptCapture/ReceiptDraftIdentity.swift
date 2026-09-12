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

    /// A picker when there is anything to pick from, and the same text field
    /// as before when there is not.
    ///
    /// Picking is what sets `merchantEntityID`, which is the operative half of
    /// the pair and the reason the picker exists at all. Typing stays possible
    /// and clears the id, because a name typed over a chosen entity is the
    /// reader saying it was the wrong entity — keeping the id then would file
    /// the purchase under a merchant whose name is no longer on screen.
    @ViewBuilder private var merchantField: some View {
        if merchants.isEmpty {
            PopsTextField(
                ReceiptDraftCopy.merchantLabel,
                placeholder: ReceiptDraftCopy.merchantPlaceholder,
                text: $draft.merchant.value,
                font: .popsTitle,
                note: hint(.merchant)
            )
            .accessibilityIdentifier(ReceiptDraftAccessibility.merchant)
        } else {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                ReceiptDraftPicker(
                    label: ReceiptDraftCopy.merchantLabel,
                    value: draft.merchant.value,
                    placeholder: ReceiptDraftCopy.chooseMerchant,
                    font: .popsTitle,
                    resolved: draft.merchantEntityID != nil
                ) {
                    ForEach(merchants) { merchant in
                        Button {
                            choose(merchant)
                        } label: {
                            Label(merchant.name, systemImage: "building.2")
                        }
                    }
                    Divider()
                    Button {
                        draft.merchantEntityID = nil
                    } label: {
                        Label(ReceiptDraftCopy.newMerchant, systemImage: "plus")
                    }
                }
                .accessibilityIdentifier(ReceiptDraftAccessibility.merchant)
                if draft.merchantEntityID == nil {
                    PopsTextField(
                        placeholder: ReceiptDraftCopy.merchantPlaceholder,
                        text: $draft.merchant.value,
                        note: hint(.merchant)
                    )
                }
            }
        }
    }

    /// The chosen merchant's addresses, or free text when no merchant is
    /// resolved — there is nothing to offer until there is a merchant to offer
    /// it for, and a list of every address in contacts is not a help.
    @ViewBuilder private var addressField: some View {
        let known = merchants.first { $0.id == draft.merchantEntityID }?.addresses ?? []
        if known.isEmpty {
            PopsTextField(
                ReceiptDraftCopy.addressLabel,
                placeholder: ReceiptDraftCopy.addressPlaceholder,
                text: $draft.address.value,
                font: .popsSubheadline,
                note: hint(.address)
            )
            .accessibilityIdentifier(ReceiptDraftAccessibility.address)
        } else {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                ReceiptDraftPicker(
                    label: ReceiptDraftCopy.addressLabel,
                    value: draft.address.value,
                    placeholder: ReceiptDraftCopy.chooseAddress,
                    font: .popsSubheadline,
                    resolved: known.contains(trimmedAddress)
                ) {
                    ForEach(known, id: \.self) { address in
                        Button {
                            draft.address.value = address
                        } label: {
                            Label(address, systemImage: "mappin.and.ellipse")
                        }
                    }
                    Divider()
                    Button {
                        draft.address.value = ""
                    } label: {
                        Label(ReceiptDraftCopy.newAddress, systemImage: "plus")
                    }
                }
                .accessibilityIdentifier(ReceiptDraftAccessibility.address)
                if !known.contains(trimmedAddress) {
                    PopsTextField(
                        placeholder: ReceiptDraftCopy.addressPlaceholder,
                        text: $draft.address.value,
                        note: hint(.address)
                    )
                }
            }
        }
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
