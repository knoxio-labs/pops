import AppCore
import Auth
import BFMClient
import Foundation
import InventoryReplica
import Testing

@testable import Pops

@Suite("Ego composition")
@MainActor
internal struct EgoCompositionTests {
    private func composition(
        openInventoryReplica: @escaping (PairedDevice) throws -> InventoryReplica = { _ in
            try InventoryReplica()
        }
    ) -> AppComposition {
        AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: Self.namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: Self.namespace)
            ),
            openInventoryReplica: openInventoryReplica
        )
    }

    @Test("a paired device gets the BFM-backed Ego repository")
    func pairedDeviceGetsBFMEgoRepository() throws {
        let dependencies = composition().dependencies(for: try device())

        #expect(dependencies.ego is BFMEgoRepository)
    }

    @Test("the pairing screen keeps Ego unbound")
    func pairingDependenciesKeepEgoUnbound() async {
        let ego = composition().pairingDependencies.ego

        #expect(ego is UnboundEgoRepository)
        await #expect(throws: RepositoryError.dependencyNotBound) {
            _ = try await ego.conversations(limit: 1, offset: 0, query: nil)
        }
    }

    @Test("the same device reuses its cached dependencies")
    func dependenciesAreCachedPerDevice() throws {
        var replicaOpens = 0
        let root = composition(openInventoryReplica: { _ in
            replicaOpens += 1
            return try InventoryReplica()
        })
        let device = try device()

        let first = root.dependencies(for: device)
        let firstInventory = try #require(first.inventory as? LocalFirstInventoryStore)
        let cached = try #require(root.bound)

        let second = root.dependencies(for: device)
        let cachedAgain = try #require(root.bound)
        let cachedInventory = try #require(
            cachedAgain.dependencies.inventory as? LocalFirstInventoryStore)

        #expect(first.ego is BFMEgoRepository)
        #expect(second.ego is BFMEgoRepository)
        #expect(replicaOpens == 1)
        #expect(firstInventory === (second.inventory as? LocalFirstInventoryStore))
        #expect(cachedAgain.device == cached.device)
        #expect(cachedAgain.dependencies.ego is BFMEgoRepository)
        #expect(cachedInventory === firstInventory)
    }

    private func device() throws -> PairedDevice {
        PairedDevice(
            id: "device-ego-composition",
            baseURL: try #require(URL(string: "https://bfm.invalid"))
        )
    }

    private static let namespace = "com.knoxiolabs.pops.tests.ego-composition"
}
