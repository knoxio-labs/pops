import AppCore
import AppCoreFakes
import FeatureInventory
import Foundation
import SwiftUI
import Testing
import UIKit

@testable import Pops

/// The Parts section draws nothing until the server answers, so whatever
/// starts its read has to exist while the section is empty. Only a mounted
/// page proves that: an item page opened from a `pops://inventory/item/...`
/// link once showed no Parts at all because its read never started.
@Suite("Inventory Parts on a mounted item page")
@MainActor
internal struct InventoryPartsMountingTests {
    private actor CountingPartsService: InventoryPartsService {
        private(set) var reads: [InventoryItem.ID] = []

        func parts(of itemId: InventoryItem.ID) async throws -> InventoryItemParts {
            reads.append(itemId)
            return InventoryItemParts(canHaveParts: true, assembly: nil, parts: [])
        }

        func addPart(_ partId: InventoryItem.ID, to assemblyId: InventoryItem.ID) async throws
            -> InventoryItemParts
        {
            throw InventoryPartsError.unavailable
        }

        func removePart(_ partId: InventoryItem.ID, from assemblyId: InventoryItem.ID)
            async throws -> InventoryItemParts
        {
            throw InventoryPartsError.unavailable
        }
    }

    private static let epoch = Date(timeIntervalSinceReferenceDate: 800_000_000)

    private static func kit() -> InventoryItem {
        InventoryItem(
            id: "kit", revision: 1, seq: 1, name: "Ninja kit", typeKey: nil, code: nil,
            externalIds: [], lifecycle: .active, placement: .hand, previousPlacement: nil,
            containment: nil, photos: [], createdAt: epoch, updatedAt: epoch, deletedAt: nil)
    }

    @Test("an item page opened from a link starts reading its parts")
    func linkedItemPageReadsParts() async throws {
        let service = CountingPartsService()
        let dependencies = AppDependencies.fake(
            inventory: InMemoryInventoryStore(items: [Self.kit()]), parts: service)
        let scene = try #require(
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first,
            "the test host is not showing a window scene, so nothing can be mounted in one")
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.rootViewController = UIHostingController(
            rootView: InventoryEntityView(
                entity: .item("kit"), dependencies: dependencies,
                entityRouter: EntityRouterRegistry()))
        window.makeKeyAndVisible()
        defer { window.isHidden = true }

        var reads: [InventoryItem.ID] = []
        for _ in 0..<300 where reads.isEmpty {
            window.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(10))
            reads = await service.reads
        }

        #expect(reads == ["kit"])
    }
}
