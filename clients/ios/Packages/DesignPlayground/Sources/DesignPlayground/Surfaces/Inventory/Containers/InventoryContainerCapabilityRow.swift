import DesignSystem
import SwiftUI

/// The one place containment turns on or off for an item, when that is even
/// on the table.
///
/// ADR-001 grants the capability by type, but a record does not have to use
/// it: a spare tote of a container-capable type is a plain item until
/// somebody starts packing it. Turning it off again is withheld while the
/// container still holds something, rather than offered and then refused,
/// because emptying it first is a real step, not a formality.
internal struct InventoryContainerCapabilityRow: View {
    internal let profile: InventoryContainerProfile

    @ViewBuilder internal var body: some View {
        if profile.canEnableContainment {
            row(
                title: "Turn on containment",
                detail: "\(profile.item.name) can hold other items once this is on.",
                symbol: InventorySymbol.capability)
        } else if profile.item.isContainer {
            row(
                title: profile.canDisableContainment ? "Turn off containment" : "Containment is on",
                detail: profile.canDisableContainment
                    ? "Only possible while it is empty."
                    : "Empty it first to turn this off.",
                symbol: InventorySymbol.capability,
                disabled: !profile.canDisableContainment)
        }
    }

    private func row(title: String, detail: String, symbol: InventorySymbol, disabled: Bool = false)
        -> some View
    {
        Button {
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Label(title, systemImage: symbol.system)
                    .font(.popsBody)
                    .foregroundStyle(disabled ? Color.popsMutedForeground : Color.popsInventory)
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        }
        .disabled(disabled)
    }
}
