import SwiftUI

/// Every foundation component on one screen, in the states that make the open
/// questions visible.
///
/// Not a screen the app will have. It is the page the five POPS-3979
/// experiments are answered on, so it is arranged to put each question where a
/// reviewer will meet it: containers beside items (silhouette), non-active
/// items in their own section (state treatment), a queued and a stale row
/// (sync visibility), someone's passport at the top (the in-hand word).
internal struct InventoryFoundationGallery: View {
    private typealias Fixtures = InventoryFoundationFixtures

    internal var body: some View {
        List {
            Section("In hand") {
                InventoryInHandRow(item: Fixtures.passport)
            }
            Section("Open containers") {
                InventoryItemRow(item: Fixtures.kitchenBox)
            }
            Section("Items") {
                ForEach([Fixtures.television, Fixtures.cable, Fixtures.screws, Fixtures.espresso]) {
                    InventoryItemRow(item: $0)
                }
            }
            Section("Needs a look") {
                InventoryItemRow(item: Fixtures.tape)
                InventoryItemRow(item: Fixtures.untyped)
                InventoryRepairRow(
                    item: Fixtures.conflicted,
                    problem: "Moved to Office 04 here, and to the hall cupboard on the web.",
                    resolution: "Choose where it is")
            }
            Section("Closed containers") {
                InventoryItemRow(item: Fixtures.linenBox)
            }
            Section("No longer counted") {
                ForEach([Fixtures.kettle, Fixtures.drill, Fixtures.lamp]) {
                    InventoryItemRow(item: $0)
                }
            }
            Section("Places") {
                InventoryLocationRow(name: "Garage", parent: nil, itemCount: 64, containerCount: 3)
                InventoryLocationRow(
                    name: "Pantry shelf", parent: "Kitchen", itemCount: 11, containerCount: 0)
            }
            Section("Recent") {
                InventoryActivityRow(
                    verb: "Picked up", subject: "Passport", detail: "From Documents drawer",
                    when: "8 min ago")
                InventoryActivityRow(
                    verb: "Closed", subject: "Linen 02", detail: "19 items", when: "Yesterday")
            }
        }
        .playgroundInsetGroupedList()
    }
}
