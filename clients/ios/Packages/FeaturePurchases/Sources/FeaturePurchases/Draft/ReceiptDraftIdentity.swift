import DesignSystem
import SwiftUI

extension ReceiptDraftForm {
    /// Merchant, address and date at three weights, as the read-only reading
    /// draws them. A merchant is what a reader recognises the receipt by; the
    /// address and the date place it. Three fields at one size is the
    /// flatness this surface was built to leave behind.
    internal var identity: some View {
        section(ReceiptDraftCopy.identitySection) {
            if lock?.locks(.merchant) == true {
                ReceiptDraftLockedRow(label: ReceiptDraftCopy.merchantLabel, value: merchantName)
            } else {
                merchantField
            }
            if presentation.showsCaptureOnlyFields {
                if !draft.online { addressField }
                onlineToggle
            }
            if lock?.locks(.date) == true {
                ReceiptDraftLockedRow(label: ReceiptDraftCopy.dateLabel, value: draft.date.value)
            } else {
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

    /// The merchant as the purchase holds it: the entity's name when it has
    /// one, the till's wording when it does not.
    private var merchantName: String {
        if let created = draft.merchantResolution.createdValue { return created }
        let id = draft.merchantResolution.entityID
        if resolvedMerchant?.id == id, let name = resolvedMerchant?.name { return name }
        return draft.printedMerchant.value
    }

    /// A select, not a field.
    ///
    /// There was a text field here and it was the wrong control, because it
    /// admitted an answer the data model has no room for: a merchant is
    /// `merchantEntityId`, and a name with no id behind it is a purchase
    /// nothing can be reconciled or totalled against. Every route through
    /// this control ends at an entity — matched, chosen, or created.
    private var merchantField: some View {
        return ReceiptDraftRecordSelect(
            label: ReceiptDraftCopy.merchantLabel,
            resolution: merchantBinding,
            printed: draft.printedMerchant.value,
            resolvedName: resolvedMerchant?.name,
            search: { query in
                await searchMerchants(query).map {
                    ReceiptDraftRecord(id: $0.id, name: $0.name)
                }
            },
            symbol: "building.2",
            placeholder: ReceiptDraftCopy.merchantPlaceholderSelect,
            createTitle: ReceiptDraftCopy.createMerchantSection,
            note: merchantNote
        )
        .task(id: draft.merchantResolution.entityID) {
            guard let id = draft.merchantResolution.entityID else {
                resolvedMerchant = nil
                return
            }
            resolvedMerchant = await merchantPreview(id)
        }
        .accessibilityIdentifier(ReceiptDraftAccessibility.merchant)
    }

    /// An unresolved merchant is what stops a save, so it outranks the gate's
    /// complaint about the same field, exactly as a missing total does.
    ///
    /// Without it the Save button is disabled and nothing on screen says why:
    /// the control shows the till's wording, which is muted for the reason it
    /// is muted everywhere else, and reads as an ordinary value rather than
    /// as the one thing left to answer. It says so only once
    /// ``ReceiptDraft/reportsUnresolvedMerchant`` does, so a blank form does
    /// not open by naming what nobody has failed to do yet.
    private var merchantNote: PopsFieldNote? {
        if draft.reportsUnresolvedMerchant {
            return .problem(ReceiptDraftCopy.merchantUnresolved)
        }
        return hint(.merchant)
    }

    /// Writes the merchant, and drops the branch when the merchant changes.
    ///
    /// A branch belongs to a merchant. Switching from Woolworths to Kmart
    /// leaves a Woolworths branch id attached to a Kmart purchase, and nothing
    /// downstream would catch it: the address select scopes its list to the
    /// new merchant so the control shows a placeholder, while the stored id is
    /// still the old one — and an address is not gated on save, so it would be
    /// written. Dropping it is the only honest answer, since no branch of the
    /// new merchant has been chosen.
    ///
    /// The rule itself lives on ``ReceiptDraft/setMerchant(_:)`` — an
    /// invariant between two fields belongs with them, not in whichever view
    /// happens to write one.
    private var merchantBinding: Binding<RecordResolution> {
        Binding(
            get: { draft.merchantResolution },
            set: { draft.setMerchant($0) }
        )
    }

    /// The same control over the chosen merchant's branches.
    ///
    /// Contacts owns the addresses and an entity owns a list of them, so a
    /// branch is a record like a merchant is — which is why this is a select
    /// and not a field. It needs a merchant first: there is nothing to offer
    /// until there is an entity whose branches these are, and a list of every
    /// address in contacts is not a help.
    private var addressField: some View {
        let liveDraft = $draft
        return ReceiptDraftRecordSelect(
            label: ReceiptDraftCopy.addressLabel,
            resolution: $draft.addressResolution,
            printed: draft.printedAddress.value,
            resolvedName: resolvedAddress?.value,
            search: { _ in
                await Self.addressRecords(
                    draft: liveDraft,
                    addressesForMerchant: addressesForMerchant)
            },
            symbol: "mappin.and.ellipse",
            placeholder: ReceiptDraftCopy.addressPlaceholderSelect,
            createTitle: ReceiptDraftCopy.createAddressSection,
            note: hint(.address)
        )
        .task(
            id: [
                draft.merchantResolution.entityID ?? "",
                draft.addressResolution.entityID ?? "",
            ]
        ) {
            guard let merchantID = draft.merchantResolution.entityID,
                let addressID = draft.addressResolution.entityID
            else {
                resolvedAddress = nil
                return
            }
            resolvedAddress = await addressPreview(merchantID, addressID)
        }
        .accessibilityIdentifier(ReceiptDraftAccessibility.address)
    }

    internal static func addressRecords(
        draft: Binding<ReceiptDraft>,
        addressesForMerchant: ReceiptAddressesForMerchant
    ) async -> [ReceiptDraftRecord] {
        guard let merchantID = draft.wrappedValue.merchantResolution.entityID else { return [] }
        return await addressesForMerchant(merchantID).map {
            ReceiptDraftRecord(id: $0.id, name: $0.value)
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
    }
}
