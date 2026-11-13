import AppCore
import Foundation

extension AppComposition {
    internal func tripCaptureDraftStore(for device: PairedDevice, root: URL? = nil)
        -> ProtectedTripCaptureDraftStore
    {
        ProtectedTripCaptureDraftStore(
            owner: TripCaptureDraftOwner(device: device),
            root: {
                if let root { return root }
                return try Self.tripCaptureDraftRoot()
            },
            isCurrent: {
                guard self.session.state == .paired(device) else { return false }
                return try self.credentialStore.pairedDeviceStore.load() == device
            })
    }

    internal static func tripCaptureDraftRoot() throws -> URL {
        try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
            create: true
        ).appendingPathComponent("TripsCaptureDrafts", isDirectory: true)
    }

    internal func captureSessionChanged(
        from previous: SessionState, to current: SessionState, root: URL? = nil
    ) async {
        guard case .paired(let device) = previous,
            case .revoked(.revokedByOperator, let revision?) = current,
            revision == device.credentialRevision
        else { return }
        let (removedRevision, overflow) = revision.addingReportingOverflow(1)
        guard !overflow else { return }
        do {
            guard let snapshot = try credentialStore.pairedDeviceStore.loadSnapshot(),
                snapshot.device == nil, snapshot.revision == removedRevision
            else { return }
            try tripCaptureDraftStore(for: device, root: root).purgeConfirmedOwner()
        } catch {
            errorPresenter.present(
                PopsError(
                    code: "ios.trips.capture.draft_removal_failed",
                    message: "Saved capture drafts could not be removed.",
                    retryable: true, kind: .client),
                operation: "remove revoked capture drafts", context: .background)
        }
    }
}
