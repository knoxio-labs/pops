import DesignSystem
import SwiftUI
import Testing
import ViewInspector

@testable import DesignPlayground

@Suite("Trip Today issue source actions")
@MainActor
internal struct TripTodayIssuesViewTests {
    @Test("each source button in one issue row has an independent style and opens its own original")
    func sourceButtonsAreIndependent() throws {
        let state = tripsTodayFixture()
        let first = try #require(state.stays.first)
        let second = try #require(state.stays.last)
        #expect(first.id != second.id)
        let finding = TripsTodayFinding(
            id: "two-stays", message: "Review these accommodation sources.",
            sourceIDs: [first.id, second.id, "missing-source"])
        var opened: [String] = []
        let view = TripTodayIssuesView(state: state, findings: [finding]) { opened.append($0.id) }
        let inspector = try view.inspect()
        let buttons = inspector.findAll(ViewType.Button.self)
        #expect(buttons.count == 2)
        for source in [first, second] {
            let button = try inspector.find(viewWithAccessibilityLabel: "Open \(source.name)")
                .button()
            #expect(try button.buttonStyle() is BorderlessButtonStyle)
            #expect(try button.flexFrame().minHeight == PopsSize.touchTarget)
            try button.tap()
            #expect(opened.last == source.id)
        }
        #expect(opened == [first.id, second.id])
    }
}
