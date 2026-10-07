extension DeviceCredentialStore {
    func performWipe(ifRevision expectedRevision: UInt64?) throws -> Bool {
        try mutationState.withLock { revision in
            let snapshot: PairedDeviceSnapshot?
            do {
                snapshot = try pairedDeviceStore.loadSnapshot()
            } catch {
                guard expectedRevision == nil else { throw error }
                snapshot = nil
            }
            let currentRevision = max(revision ?? 0, snapshot?.revision ?? 0)
            revision = currentRevision
            if let expectedRevision, currentRevision != expectedRevision { return false }
            let nextRevision = try Self.nextRevision(after: currentRevision)
            revision = nextRevision

            var tokenFailure: (any Error)?
            var keyFailure: (any Error)?
            var identityFailure: (any Error)?

            do { try tokenStore.wipe() } catch { tokenFailure = error }
            do { try keyStore.deleteKey() } catch { keyFailure = error }
            do {
                try pairedDeviceStore.saveSnapshot(
                    PairedDeviceSnapshot(revision: nextRevision, device: nil))
            } catch {
                identityFailure = error
            }

            if tokenFailure != nil || keyFailure != nil || identityFailure != nil {
                throw DeviceCredentialWipeError(
                    tokenStoreFailure: tokenFailure,
                    keyStoreFailure: keyFailure,
                    pairedDeviceStoreFailure: identityFailure
                )
            }
            return true
        }
    }
}
