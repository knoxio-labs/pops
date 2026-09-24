import AppCore
import AppCoreFakes
import Auth
import FeaturePurchases
import Testing

@testable import Pops

@Suite("App composition search model")
@MainActor
internal struct AppCompositionSearchTests {
    @Test("the composed search model reads the tag vocabulary from the Purchases repository")
    func composedModelLoadsTags() async {
        let tags = [PurchaseTagCount(tag: "garden", count: 4)]
        let dependencies = AppDependencies.fake(
            purchases: InMemoryPurchasesRepository(tagsInUse: tags))
        let model = Self.composition().searchModel(
            for: dependencies, available: [FeaturePurchases.feature])

        await model.loadTags()

        #expect(model.tags == tags)
    }

    private static func composition() -> AppComposition {
        AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: namespace)))
    }

    private static let namespace = "com.knoxiolabs.pops.tests.composition-search"
}
