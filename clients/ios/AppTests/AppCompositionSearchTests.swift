import AppCore
import Auth
import FeaturePurchases
import Testing

@testable import Pops

@Suite("App composition search model")
@MainActor
internal struct AppCompositionSearchTests {
    @Test("the composed model only exposes features enabled by the mobile surface")
    func composedModelFiltersAvailablePillars() {
        let dependencies = AppDependencies.fake()
        let model = Self.composition().searchModel(
            for: dependencies, available: [FeaturePurchases.feature])

        #expect(model.available == [.purchases])
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
