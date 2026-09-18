import Testing

@testable import DesignPlayground

/// Four placements that have to stay one answer.
///
/// The failure this guards against is a form that lets a person name a
/// container and a location and then has to decide which one it meant. Picking
/// a segment drops whatever the last one held, which is what makes the control
/// honest rather than four fields with one highlighted.
@Suite("Inventory placement choice")
internal struct InventoryPlacementChoiceTests {
    private let fromContainer = InventoryCreationOrigin(
        container: "Kitchen 12", location: "Kitchen")
    private let fromNowhere = InventoryCreationOrigin.none

    @Test("picking a segment lands on that segment, from every other segment")
    func everySegmentIsReachable() {
        for kind in InventoryPlacementKind.offered(for: fromContainer) {
            #expect(kind.choice(for: fromContainer).kind == kind)
        }
    }

    @Test("in hand names nothing, and the other three name exactly one thing")
    func exactlyOneTargetIsHeld() {
        #expect(InventoryPlacementKind.inHand.choice(for: fromContainer).target == nil)
        #expect(
            InventoryPlacementKind.currentContainer.choice(for: fromContainer).target
                == "Kitchen 12")
        #expect(
            InventoryPlacementKind.directLocation.choice(for: fromContainer).target == "Kitchen")
        #expect(InventoryPlacementKind.anotherContainer.choice(for: fromContainer).target == nil)
    }

    @Test("arriving from nowhere is not offered a here to put it")
    func hereNeedsAContainer() {
        #expect(!InventoryPlacementKind.offered(for: fromNowhere).contains(.currentContainer))
        #expect(InventoryPlacementKind.offered(for: fromContainer).contains(.currentContainer))
    }

    @Test("asked for a here that does not exist, it falls back to a location")
    func hereWithoutAContainerFallsBack() {
        let choice = InventoryPlacementKind.currentContainer.choice(for: fromNowhere)

        #expect(choice.kind == .directLocation)
        #expect(choice.target == nil)
    }

    @Test("in hand is answered; a container with nothing named is not")
    func resolution() {
        #expect(InventoryPlacementChoice.inHand.isResolved)
        #expect(
            !InventoryPlacementChoice.anotherContainer(container: nil, location: nil).isResolved)
        #expect(!InventoryPlacementChoice.directLocation(nil).isResolved)
        #expect(InventoryPlacementChoice.directLocation("Study").isResolved)
    }

    @Test("an unanswered segment has no placement to draw")
    func unansweredHasNoPlacement() {
        #expect(
            InventoryPlacementChoice.anotherContainer(container: nil, location: nil).placement
                == nil)
        #expect(InventoryPlacementChoice.inHand.placement == .inHand(previous: nil))
    }

    @Test("an existing item's placement comes back as the segment it belongs to")
    func readingBackAPlacement() {
        #expect(InventoryPlacementChoice(.direct(location: "Study")).kind == .directLocation)
        #expect(
            InventoryPlacementChoice(.contained(location: "Study", containers: ["Office 04"])).kind
                == .anotherContainer)
        #expect(InventoryPlacementChoice(.inHand(previous: "Drawer")).kind == .inHand)
    }

    @Test("a contained item comes back naming the container it is actually in")
    func innermostContainerIsTheTarget() {
        let choice = InventoryPlacementChoice(
            .contained(location: "Garage", containers: ["Garage tools", "Small parts tray"]))

        #expect(choice.target == "Small parts tray")
    }
}
