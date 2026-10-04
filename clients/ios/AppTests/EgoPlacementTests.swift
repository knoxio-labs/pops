import AppCore
import FeatureEgo
import FeatureTransactions
import Observation
import SwiftUI
import Testing

@testable import Pops

@MainActor
@Suite("Ego placement")
internal struct EgoPlacementTests {
    @Test("Ego stays out of the tabs with or without availability")
    func egoIsExcludedFromTabs() {
        let existing: [MobileFeature] = [FeatureTransactions.feature]
        let withEgo = existing + [FeatureEgo.feature]

        #expect(!ContentView.tabs(for: existing).contains(FeatureEgo.feature))
        #expect(!ContentView.tabs(for: withEgo).contains(FeatureEgo.feature))
        #expect(ContentView.tabFeatures(for: withEgo) == existing)
    }

    @Test("the sheet entry and tab accessory follow Ego availability")
    func entryAndAccessoryFollowAvailability() {
        #expect(ContentView.showsEgoEntry(available: [FeatureEgo.feature]))
        #expect(
            !ContentView.showsEgoEntry(available: [FeatureTransactions.feature]))
        #expect(
            ContentView.showsEgoEntry(
                available: [FeatureTransactions.feature, FeatureEgo.feature]))
    }

    @Test("one regular feature plus Ego remains a single tab feature")
    func egoDoesNotChangeSingleFeatureLayoutCount() {
        let available = [FeatureTransactions.feature, FeatureEgo.feature]

        #expect(ContentView.tabFeatures(for: available).count == 1)
    }

    @Test("entity sheet bindings are inert while Ego is closed")
    func entitySheetsRespectActiveHost() throws {
        let presentation = EntityPresentation()
        let entity = try #require(
            TransactionEntity(PopsURI(pillar: "finance", type: "transaction", id: "tx-1")))
        presentation.transaction = entity
        @Bindable var bindable = presentation

        let inactive = EntitySheets.sheetBinding(
            $bindable.transaction,
            isActive: false
        )
        let active = EntitySheets.sheetBinding(
            $bindable.transaction,
            isActive: true
        )

        #expect(inactive.wrappedValue == nil)
        #expect(active.wrappedValue == entity)
        inactive.wrappedValue = nil
        #expect(presentation.transaction == entity)
        active.wrappedValue = nil
        #expect(presentation.transaction == nil)
    }
}
