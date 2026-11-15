import AppCore
import Auth
import BFMClient

extension AppComposition {
    internal static func streamAuthorizerFactory(refresher: DeviceSessionRefresher)
        -> @Sendable (PairedDevice) -> any BFMStreamAuthorizer
    {
        { PairedDeviceStreamAuthorizer(refresher: refresher, device: $0) }
    }

    internal func documentsRepository(for device: PairedDevice) -> any DocumentsReading {
        BFMDocumentsRepository(
            client: authenticated(device), baseURL: device.baseURL,
            authorizer: boundStreamAuthorizer(device),
            expectedDevice: device)
    }

    internal func tripCaptureRepository(for device: PairedDevice) -> BFMTripCapturesRepository {
        BFMTripCapturesRepository(client: authenticated(device))
    }

    internal func tripsRepository(for device: PairedDevice) -> any TripsReading {
        BFMTripsRepository(client: authenticated(device))
    }

    internal func tripsRouteRepository(for device: PairedDevice) -> any TripsRouteReading {
        BFMTripRouteRepository(client: authenticated(device))
    }

    /// Everything a paired device's screens may reach. Built per device rather
    /// than at launch, for the reason in this type's note, and kept until the
    /// device changes.
    internal func dependencies(for device: PairedDevice) -> AppDependencies {
        if let bound, bound.device == device { return bound.dependencies }

        if experience == .trips { return tripsDependencies(for: device) }

        var storageFull = false
        let errorPresenter = errorPresenter
        let inventoryTransport = BFMInventoryTransport(
            client: authenticated(device),
            syncReadFailureObserver: { error, operation in
                await errorPresenter.present(
                    error, operation: operation, context: .background)
            }
        )
        let dependencies = AppDependencies(
            transactions: BFMTransactionsRepository(client: authenticated(device)),
            pairing: BFMDevicePairingService(credentialStore: credentialStore),
            reachability: shell,
            receiptCapture: BFMReceiptCaptureRepository(client: authenticated(device)),
            purchases: BFMPurchasesRepository(client: authenticated(device)),
            merchants: BFMMerchantDirectoryRepository(client: authenticated(device)),
            accounts: BFMAccountsRepository(client: authenticated(device)),
            inventory: inventoryStore(
                for: device, transport: inventoryTransport, storageFull: &storageFull),
            codeSuggestions: inventoryTransport,
            barcodeLookup: inventoryTransport,
            parts: inventoryTransport,
            documents: BFMInventoryDocumentsRepository(
                client: authenticated(device), baseURL: device.baseURL,
                authorizer: streamAuthorizer),
            ego: egoRepository(for: device)
        )
        bound = BoundDevice(device: device, dependencies: dependencies, storageFull: storageFull)
        return dependencies
    }

    internal var egoContext: EgoAppContext? {
        switch experience {
        case .pops: egoScreenContext.current
        case .trips: EgoAppContext(app: "trips", uri: nil, route: nil, entityTitle: nil)
        }
    }

    private func egoRepository(for device: PairedDevice) -> BFMEgoRepository {
        BFMEgoRepository(
            client: authenticated(device), baseURL: device.baseURL, authorizer: streamAuthorizer)
    }

    private func tripsDependencies(for device: PairedDevice) -> AppDependencies {
        let unbound = AppDependencies.unbound
        let dependencies = AppDependencies(
            transactions: unbound.transactions,
            pairing: pairingDependencies.pairing,
            reachability: shell,
            receiptCapture: unbound.receiptCapture,
            purchases: unbound.purchases,
            merchants: unbound.merchants,
            accounts: unbound.accounts,
            ego: egoRepository(for: device)
        )
        bound = BoundDevice(device: device, dependencies: dependencies, storageFull: false)
        return dependencies
    }
}
