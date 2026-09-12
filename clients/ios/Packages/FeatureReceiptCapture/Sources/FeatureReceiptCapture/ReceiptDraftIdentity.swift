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

    /// A select, not a field.
    ///
    /// There was a text field here and it was the wrong control, because it
    /// admitted an answer the data model has no room for: a merchant is
    /// `merchantEntityId`, and a name with no id behind it is a purchase
    /// nothing can be reconciled or totalled against. Every route through
    /// this control ends at an entity — matched, chosen, or created.
    private var merchantField: some View {
        ReceiptDraftRecordSelect(
            label: ReceiptDraftCopy.merchantLabel,
            resolution: $draft.merchantResolution,
            printed: draft.printedMerchant.value,
            records: merchants.map { ReceiptDraftRecord(id: $0.id, name: $0.name) },
            symbol: "building.2",
            placeholder: ReceiptDraftCopy.merchantPlaceholderSelect,
            createTitle: ReceiptDraftCopy.createMerchantSection,
            note: merchantNote
        )
        .accessibilityIdentifier(ReceiptDraftAccessibility.merchant)
    }

    /// The gate's complaint about the merchant, unless there is no merchant —
    /// which outranks it. A reader who has not chosen one needs telling that,
    /// not reminding that the print was smudged.
    private var merchantNote: PopsFieldNote? {
        if !draft.merchantResolution.isResolved {
            return .problem(ReceiptDraftCopy.merchantUnresolved)
        }
        return hint(.merchant)
    }

    /// The same control over the chosen merchant's branches.
    ///
    /// Contacts owns the addresses and an entity owns a list of them, so a
    /// branch is a record like a merchant is — which is why this is a select
    /// and not a field. It needs a merchant first: there is nothing to offer
    /// until there is an entity whose branches these are, and a list of every
    /// address in contacts is not a help.
    private var addressField: some View {
        let known = merchants.first { $0.id == draft.merchantResolution.entityID }?.addresses ?? []
        return ReceiptDraftRecordSelect(
            label: ReceiptDraftCopy.addressLabel,
            resolution: $draft.addressResolution,
            printed: draft.printedAddress.value,
            records: known.map { ReceiptDraftRecord(id: $0.id, name: $0.value) },
            symbol: "mappin.and.ellipse",
            placeholder: ReceiptDraftCopy.addressPlaceholderSelect,
            createTitle: ReceiptDraftCopy.createAddressSection,
            note: hint(.address),
            unavailable: draft.merchantResolution.isResolved
                ? nil : ReceiptDraftCopy.addressNeedsMerchant
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
}
