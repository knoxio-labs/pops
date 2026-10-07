#if DEBUG && targetEnvironment(simulator)
    import Foundation

    internal enum SimulatorPairingRequest {
        internal static func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.urlCache = nil
            configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
            configuration.httpShouldSetCookies = false
            let session = URLSession(
                configuration: configuration,
                delegate: RejectPairingRedirects(),
                delegateQueue: nil
            )
            defer { session.invalidateAndCancel() }
            return try await session.data(for: request)
        }
    }

    private final class RejectPairingRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(
            _ session: URLSession,
            task: URLSessionTask,
            willPerformHTTPRedirection response: HTTPURLResponse,
            newRequest request: URLRequest,
            completionHandler: @escaping (URLRequest?) -> Void
        ) {
            completionHandler(nil)
        }
    }
#endif
