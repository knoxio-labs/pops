import Testing

@testable import DesignPlayground

/// A template read off the catalogue rather than authored, the fifth
/// variant's whole claim, and the part of it a screenshot cannot check. If the
/// derivation is wrong the variant is a drawing of a promise.
@Suite("Inventory observed templates")
internal struct InventoryObservationTests {
    private var catalogue: [InventoryThing] { InventoryPropertyFixtures.all }

    @Test("an item's cluster is the others of its category, never itself")
    func clusterExcludesTheSubject() {
        let peers = InventoryObservation.cluster(
            like: InventoryPropertyFixtures.cable, in: catalogue)

        #expect(peers.map(\.id).sorted() == ["cable-1m", "cable-lightning", "cable-usbc"])
    }

    @Test("a key most of the cluster records becomes a field, and a one-off does not")
    func agreementDecidesTheFields() {
        let observed = InventoryObservation.observed(
            like: InventoryPropertyFixtures.cable, in: catalogue)

        #expect(observed?.sampleCount == 3)
        #expect(observed?.fields.map(\.key).contains("Length") == true)
        #expect(observed?.fields.map(\.key).contains("Power") == true)
        #expect(observed?.fields.map(\.key).contains("Bought with") == false)
    }

    @Test("fields come back most-used first")
    func fieldsAreOrderedByAdoption() {
        let observed = InventoryObservation.observed(
            like: InventoryPropertyFixtures.cable, in: catalogue)

        #expect(observed?.fields.first?.key == "End A")
        #expect(observed?.fields.map(\.key).firstIndex(of: "Data rate") != 0)
    }

    @Test("an item with nothing like it gets no template rather than a template of one")
    func firstOfItsKindObservesNothing() {
        #expect(
            InventoryObservation.observed(like: InventoryPropertyFixtures.sideboard, in: catalogue)
                == nil)
        #expect(
            InventoryObservation.observed(like: InventoryPropertyFixtures.bulb, in: catalogue)
                == nil
        )
    }

    @Test("a cluster of one is not enough to imply anything")
    func twoPeersAreTheFloor() {
        let pair = [InventoryPropertyFixtures.cable, InventoryPropertyFixtures.shortCable]

        #expect(
            InventoryObservation.observed(like: InventoryPropertyFixtures.cable, in: pair) == nil)
    }

    @Test("a key spelled two ways is one field, in the spelling the majority uses")
    func driftCollapsesToTheMajoritySpelling() {
        let observed = InventoryObservation.observed(
            like: InventoryPropertyFixtures.cable, in: catalogue)
        let lengths = observed?.fields.filter { $0.id == "length" } ?? []

        #expect(lengths.count == 1)
        #expect(lengths.first?.key == "Length")
    }

    @Test("the canonical spelling is offered only when it differs from yours")
    func canonicalSpelling() {
        #expect(InventoryObservation.canonicalSpelling(of: "length", in: catalogue) == "Length")
        #expect(InventoryObservation.canonicalSpelling(of: "Length", in: catalogue) == nil)
        #expect(InventoryObservation.canonicalSpelling(of: "Nothing", in: catalogue) == nil)
    }
}

/// The rename suggestion is a guess, so what matters is that it only fires
/// where it has a reason to.
@Suite("Inventory rename suggestions")
internal struct InventoryRenameSuggestionTests {
    private var subject: InventoryThing { InventoryPropertyFixtures.lightningCable }

    private var observed: InventoryObservedTemplate {
        InventoryObservation.observed(like: subject, in: InventoryPropertyFixtures.all)
            ?? InventoryObservedTemplate(name: "none", fields: [], sampleCount: 0)
    }

    @Test("a custom key measuring what an observed field measures is offered that field's name")
    func aMeasurementFindsItsField() {
        let property = InventoryProperty("Cable length", .measure(1, unit: "m"), origin: .custom)

        let suggestion = InventoryObservation.renameSuggestion(
            for: property, given: observed, on: subject)

        #expect(suggestion?.key == "Length")
    }

    @Test("the item staged for review is the one that actually carries the drift")
    func theFixtureEarnsTheSuggestion() {
        let pairs = subject.custom.compactMap { property in
            InventoryObservation.renameSuggestion(for: property, given: observed, on: subject)
        }

        #expect(pairs.map(\.key) == ["Length"])
    }

    @Test("a key with no unit is never renamed by this rule")
    func textIsNeverGuessedAt() {
        let property = InventoryProperty("Bought with", .text("Old Kindle"), origin: .custom)

        #expect(
            InventoryObservation.renameSuggestion(for: property, given: observed, on: subject)
                == nil)
    }

    @Test("a field the item already fills is not offered as a rename")
    func filledFieldsAreNotOffered() {
        let property = InventoryProperty("Cable length", .measure(4, unit: "ft"), origin: .custom)

        #expect(
            InventoryObservation.renameSuggestion(
                for: property, given: observed, on: InventoryPropertyFixtures.cable) == nil)
    }

    @Test("a unit measuring something else does not match")
    func dimensionsHaveToAgree() {
        let property = InventoryProperty("Draw", .measure(18, unit: "W"), origin: .custom)
        let lengthsOnly = InventoryObservedTemplate(
            name: "Cable",
            fields: [InventoryTemplateField("Length", "Measurement", unit: "m")],
            sampleCount: 3
        )

        #expect(
            InventoryObservation.renameSuggestion(for: property, given: lengthsOnly, on: subject)
                == nil)
    }
}

/// Swapping a type must not cost an item what it knows, whichever variant is
/// doing the swapping, the three buckets the screens draw are this.
@Suite("Inventory type swap")
internal struct InventoryTypeSwapTests {
    @Test("a cable read as tape keeps its length, carries the rest, and gains the tape fields")
    func theStagedSwapSortsEveryValue() {
        let change = InventoryTemplateChange(
            thing: InventoryPropertyFixtures.cable, changingTo: InventoryPropertyTemplates.tape)

        #expect(change.kept.map(\.key) == ["Length"])
        #expect(change.carriedAsCustom.count == 6)
        #expect(change.blankFields.map(\.key) == ["Use", "Width", "Leaves residue"])
    }

    @Test("nothing is lost, whatever bucket it lands in")
    func everyValueSurvivesTheSwap() {
        let cable = InventoryPropertyFixtures.cable
        let change = InventoryTemplateChange(
            thing: cable, changingTo: InventoryPropertyTemplates.tape)

        let after = Set((change.kept + change.carriedAsCustom).map(\.id))

        #expect(after == Set(cable.properties.map(\.id)))
    }
}
