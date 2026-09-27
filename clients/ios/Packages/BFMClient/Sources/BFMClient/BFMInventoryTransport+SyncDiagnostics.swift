import AppCore
import Foundation
import OpenAPIRuntime

extension BFMInventoryTransport {
    internal func observedSyncRead<Value>(
        operation: String,
        mapClientError: (ClientError) -> any Error,
        read: () async throws -> Value
    ) async throws -> Value {
        do {
            return try await read()
        } catch let error as ClientError {
            let mappedError = mapClientError(error)
            if !isResyncRequired(mappedError) {
                await recordSyncReadFailure(error, operation: operation)
            }
            throw mappedError
        } catch {
            if !isResyncRequired(error) {
                await recordSyncReadFailure(error, operation: operation)
            }
            throw error
        }
    }

    private func recordSyncReadFailure(_ error: Error, operation: String) async {
        guard !Task.isCancelled, !(error is CancellationError) else { return }
        if let clientError = error as? ClientError,
            isCancellation(clientError.underlyingError)
        {
            return
        }
        await syncReadFailureObserver(Self.syncDiagnostic(for: error), operation)
    }

    private func isResyncRequired(_ error: Error) -> Bool {
        guard let error = error as? InventorySyncTransportError else { return false }
        if case .resyncRequired = error { return true }
        return false
    }

    private func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        guard let error = error as? URLError else { return false }
        return error.code == .cancelled
    }

    private static func syncDiagnostic(for error: Error) -> PopsError {
        if let error = error as? ClientError {
            return clientSyncDiagnostic(error)
        }
        if let error = error as? PopsError { return error }
        if let error = error as? RepositoryError {
            return PopsError(
                repositoryError: error, fallbackMessage: "Inventory sync read failed.")
        }
        if let error = error as? InventorySyncTransportError {
            switch error {
            case .resyncRequired:
                return PopsError(
                    code: "ios.inventory.sync.resync_required",
                    message: "Inventory needs to resync.", retryable: true, kind: .client)
            case .clientTooOld:
                return PopsError(
                    code: "ios.inventory.sync.client_too_old",
                    message: "This app version cannot read the inventory response.",
                    retryable: false, kind: .client)
            case .suggestionsUnavailable, .mediaTooLarge, .mediaUnsupported:
                return PopsError(
                    code: "ios.inventory.sync.unexpected_failure",
                    message: "Inventory sync read failed.", retryable: false, kind: .client)
            }
        }
        return PopsError(
            code: "ios.inventory.sync.unknown_failure", message: "Inventory sync read failed.",
            retryable: true, kind: .server)
    }

    private static func clientSyncDiagnostic(_ error: ClientError) -> PopsError {
        if error.response?.status.kind == .successful, error.underlyingError is DecodingError {
            return PopsError(
                code: "ios.decode.failed",
                message: "The server returned a response this version could not read",
                requestID: BFMErrorDecodingMiddleware.requestID(from: error.response),
                retryable: false, kind: .client)
        }
        if let runtimeFailure = PopsError.runtimeFailure(from: error) {
            return runtimeFailure
        }
        if let status = error.response?.status.code {
            return PopsError.http(
                status: status,
                requestID: BFMErrorDecodingMiddleware.requestID(from: error.response))
        }
        return PopsError(
            code: "ios.inventory.sync.unknown_failure", message: "Inventory sync read failed.",
            retryable: true, kind: .server)
    }
}
