import AppCore
import OpenAPIRuntime

internal enum BFMBarcodeFailure {
    internal static func provider(_ error: Components.Schemas.ErrorBody?) -> PopsError {
        PopsError(
            code: error?.code ?? "ios.barcode.unavailable",
            message: error?.message ?? "Barcode lookup is unavailable. Try again or use text.",
            requestID: error?.requestId, retryable: error?.retryable ?? true,
            kind: error?.code == "barcode.lookup.invalid_code" ? .client : .server)
    }

    internal static func from(_ error: ClientError) -> PopsError {
        let failure = PopsError.runtimeFailureDetails(from: error)
        let status = failure?.statusCode ?? error.response?.status.code
        let requestID =
            failure?.popsError.requestID
            ?? BFMErrorDecodingMiddleware.requestID(from: error.response)
        let original = failure?.popsError
        return PopsError(
            code: original?.code == "capability_not_granted"
                ? "ios.auth.capability_not_granted"
                : original?.code ?? status.map { "ios.http.\($0)" } ?? "ios.barcode.transport",
            message: message(status: status, kind: original?.kind),
            requestID: requestID,
            retryable: original?.retryable ?? (status.map { $0 >= 500 } ?? true),
            kind: original?.kind ?? (status.map { $0 >= 500 ? .server : .client } ?? .server)
        )
    }

    internal static func http(_ status: Int) -> PopsError {
        PopsError(
            code: "ios.http.\(status)", message: message(status: status, kind: nil),
            retryable: status == 408 || status == 429 || status >= 500,
            kind: status >= 500 ? .server : .client)
    }

    internal static func capabilityDenied() -> PopsError {
        PopsError(
            code: "ios.auth.capability_not_granted",
            message: message(status: 403, kind: nil),
            retryable: false,
            kind: .client
        )
    }

    private static func message(status: Int?, kind: PopsError.Kind?) -> String {
        switch kind {
        case .offline: return "You're offline. Connect to look up this barcode."
        case .timeout: return "Barcode lookup timed out. Try again or use text."
        default: break
        }
        switch status ?? 0 {
        case 200..<300: return "The barcode response couldn't be read. Check for an app update."
        case 400: return "This barcode isn't valid for lookup. Use text instead."
        case 401: return "Your session needs attention. Reconnect Pops and try again."
        case 403: return "This device doesn't have permission to look up barcodes."
        case 408: return "Barcode lookup timed out. Try again or use text."
        case 429: return "Too many barcode lookups. Wait a moment and try again."
        case 500...599:
            return "The barcode lookup service is having trouble. Try again or use text."
        default: return "Barcode lookup couldn't reach the service. Try again or use text."
        }
    }
}
