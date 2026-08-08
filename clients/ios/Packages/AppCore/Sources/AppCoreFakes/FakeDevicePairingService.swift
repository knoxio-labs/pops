import AppCore
import Foundation

/// A ``DevicePairingService`` that answers with whatever it was handed, and
/// records what it was asked.
public actor FakeDevicePairingService: DevicePairingService {
    public private(set) var callCount = 0
    public private(set) var requests: [PairingRequest] = []

    private var result: Result<PairedDevice, PairingError>

    public init(result: Result<PairedDevice, PairingError> = .success(.fake())) {
        self.result = result
    }

    public func setResult(_ result: Result<PairedDevice, PairingError>) {
        self.result = result
    }

    public func pair(_ request: PairingRequest) async throws -> PairedDevice {
        callCount += 1
        requests.append(request)
        return try result.get()
    }
}
