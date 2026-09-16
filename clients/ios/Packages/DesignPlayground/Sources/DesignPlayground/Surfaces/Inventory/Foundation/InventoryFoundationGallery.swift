import DesignSystem
import SwiftUI

/// Every foundation component on one screen, in the states that make the open
/// questions visible.
///
/// Built in the language POPS-3981 decided for the dashboard: opaque grouped
/// panels, title-weight section headers, an open container carrying the only
/// strong colour on the page. Not a screen the app will have; it is the page
/// POPS-3979's experiments are answered on, so each question sits where a
/// reviewer meets it, and a sealed box appears only when the style can make
/// one.
internal struct InventoryFoundationGallery: View {
    private typealias Fixtures = InventoryFoundationFixtures
    @Environment(\.inventoryStyle) private var style

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                section("In hand", status: "1 awaiting placement") {
                    InventoryInHandRow(item: Fixtures.passport)
                }
                section("Open containers", status: "1 open") {
                    InventoryItemRow(item: Fixtures.kitchenBox)
                }
                section("Items", status: "4 of 846") {
                    rows([Fixtures.television, Fixtures.cable, Fixtures.screws, Fixtures.espresso])
                }
                section("Needs a look", status: "3") {
                    rows([Fixtures.tape, Fixtures.untyped])
                    PopsDivider()
                    InventoryRepairRow(
                        item: Fixtures.conflicted,
                        problem: "Moved to Office 04 here, and to the hall cupboard on the web.",
                        resolution: "Choose where it is")
                }
                section("Closed containers", status: closedStatus) {
                    rows(closedContainers)
                }
                section("No longer counted", status: "3") {
                    rows([Fixtures.kettle, Fixtures.drill, Fixtures.lamp])
                }
                section("Places", status: "9 locations") {
                    InventoryLocationRow(
                        name: "Garage", parent: nil, itemCount: 64, containerCount: 3)
                    PopsDivider()
                    InventoryLocationRow(
                        name: "Pantry shelf", parent: "Kitchen", itemCount: 11, containerCount: 0)
                }
                section("Recent work", status: "See all") {
                    InventoryActivityRow(
                        verb: "Picked up", subject: "Passport", detail: "From Documents drawer",
                        when: "8 min ago")
                    PopsDivider()
                    InventoryActivityRow(
                        verb: "Closed", subject: "Linen 02", detail: "19 items", when: "Yesterday")
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.md)
        }
        .background(Color.popsBackground)
        .tint(.popsInventory)
    }

    private var closedContainers: [InventoryFoundationItem] {
        style.closeActions == .closeAndSeal
            ? [Fixtures.linenBox, Fixtures.sealedBox] : [Fixtures.linenBox]
    }

    private var closedStatus: String {
        style.closeActions == .closeAndSeal ? "1 closed, 1 sealed" : "1 closed"
    }

    private func section<Content: View>(
        _ title: String,
        status: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(title: title, status: status)
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) { content() }
            }
        }
    }

    private func rows(_ items: [InventoryFoundationItem]) -> some View {
        ForEach(items) { item in
            InventoryItemRow(item: item)
            if item.id != items.last?.id {
                PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
            }
        }
    }
}
