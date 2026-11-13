import AppCore
import Auth
import BFMClient
import DesignSystem
import FeatureEgo
import Foundation
import InventoryReplica
import SwiftUI
import Testing

@testable import Pops

@Suite("Trips shell")
@MainActor
internal struct TripsCompositionTests {
    @Test("Trips binds pairing and Ego without opening an Inventory replica")
    func bindsOnlyTripsShellServices() async throws {
        var replicaOpens = 0
        let root = composition { _ in
            replicaOpens += 1
            return try InventoryReplica()
        }
        let dependencies = root.dependencies(for: try device("first"))

        #expect(dependencies.pairing is BFMDevicePairingService)
        #expect(dependencies.ego is BFMEgoRepository)
        #expect(dependencies.inventory is UnboundInventoryStore)
        #expect(replicaOpens == 0)
        #expect(root.synchronizeInventory == nil)
        #expect(!root.inventoryStorageFull)
        await #expect(throws: RepositoryError.dependencyNotBound) {
            _ = try await dependencies.transactions.transactions(after: nil)
        }
        await #expect(throws: RepositoryError.dependencyNotBound) {
            _ = try await dependencies.accounts.accounts()
        }
        await #expect(throws: RepositoryError.dependencyNotBound) {
            _ = try await dependencies.purchases.purchaseDetail(id: "unused")
        }
    }

    @Test("Trips keeps Ego unbound until pairing and supplies Trips context")
    func egoHasTripsContext() async {
        let root = composition()

        #expect(root.pairingDependencies.pairing is BFMDevicePairingService)
        #expect(root.pairingDependencies.ego is UnboundEgoRepository)
        #expect(
            root.egoContext == EgoAppContext(app: "trips", uri: nil, route: nil, entityTitle: nil))
        await #expect(throws: RepositoryError.dependencyNotBound) {
            _ = try await root.pairingDependencies.ego.conversations(
                limit: 1, offset: 0, query: nil)
        }
    }

    @Test("Trips replaces the bound device after re-pairing without starting Inventory")
    func repairsWithoutInventory() throws {
        let root = composition()
        let first = try device("first")
        let second = try device("second")

        _ = root.dependencies(for: first)
        #expect(root.bound?.device == first)
        _ = root.dependencies(for: second)
        #expect(root.bound?.device == second)
        #expect(root.bound?.dependencies.ego is BFMEgoRepository)
        #expect(root.synchronizeInventory == nil)
    }

    @Test("only Ego participates in Trips bootstrap; the dummy is local shell content")
    func tripsDoesNotAdvertiseUnimplementedData() {
        #expect(AppExperience.trips.renderableFeatures == [FeatureEgo.feature])
        #expect(!AppExperience.trips.usesInventory)
        #expect(AppExperience.pops.renderableFeatures == RootFeature.renderable)
        #expect(AppExperience.pops.usesInventory)
    }

    @Test("the dummy screen renders visible content in both appearances")
    func placeholderRenders() async throws {
        #expect(
            try await SwiftUIViewRendering.rendersSchemeAwareContent(
                TripsPlaceholderView(), background: Color.popsBackground))
    }

    private func composition(
        openInventoryReplica: @escaping (PairedDevice) throws -> InventoryReplica = { _ in
            throw InventoryStorageError.full
        }
    ) -> AppComposition {
        AppComposition(
            experience: .trips,
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: "com.knoxiolabs.pops.tests.trips"),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(
                    suiteName: "com.knoxiolabs.pops.tests.trips")
            ),
            openInventoryReplica: openInventoryReplica
        )
    }

    private func device(_ id: String) throws -> PairedDevice {
        PairedDevice(id: id, baseURL: try #require(URL(string: "https://bfm.invalid")))
    }
}
