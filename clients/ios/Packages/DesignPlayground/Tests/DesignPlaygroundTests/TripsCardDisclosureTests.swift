import AppCore
import Foundation
import SwiftUI
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Trip card navigation affordances")
@MainActor
internal struct TripsCardDisclosureTests {
    @Test(arguments: [DynamicTypeSize.large, .accessibility5])
    internal func inboxOriginal(_ size: DynamicTypeSize) async throws {
        let model = TripsInboxModel(reader: OriginalReader())
        model.select(7)
        await model.readTask?.value
        let view = TripsInboxView(model: model, capture: nil)
            .environment(\.dynamicTypeSize, size)
        let inspected = try view.inspect()
        #expect(inspected.findAll(ViewType.Button.self).isEmpty)
        let names = try inspected.findAll(ViewType.Image.self).map { try $0.actualImage().name() }
        #expect(names.contains("tray"))
        #expect(!names.contains("chevron.right"))
    }

    @Test(arguments: [DynamicTypeSize.large, .accessibility5])
    internal func readOnlyHeading(_ size: DynamicTypeSize) throws {
        let view = TripsSourceHeading(title: "Original", symbol: "tray", showsDisclosure: false)
            .environment(\.dynamicTypeSize, size)
        let images = try view.inspect().findAll(ViewType.Image.self)
        let names = try images.map { try $0.actualImage().name() }
        #expect(names.contains("tray"))
        #expect(!names.contains("chevron.right"))
    }

    @Test(arguments: [DynamicTypeSize.large, .accessibility5])
    internal func navigableHeading(_ size: DynamicTypeSize) throws {
        let view = TripsSourceHeading(title: "Booking", symbol: "bed.double")
            .environment(\.dynamicTypeSize, size)
        let images = try view.inspect().findAll(ViewType.Image.self)
        let names = try images.map { try $0.actualImage().name() }
        #expect(names.contains("bed.double"))
        #expect(names.filter { $0 == "chevron.right" }.count == 1)
    }
}

private struct OriginalReader: TripCapturesReading {
    func captures(tripID: Int) async throws -> TripCaptureWorkspace {
        TripCaptureWorkspace(captures: [
            TripCaptureRecord(
                id: 1, tripId: tripID, originalText: "Original note", originalUrl: nil,
                attachments: [], title: "Original", notes: "", classification: .note,
                placeId: nil, visitId: nil, revision: 1, removedAt: nil,
                createdAt: Date(timeIntervalSince1970: 0), updatedAt: Date(timeIntervalSince1970: 0)
            )
        ])
    }
}
