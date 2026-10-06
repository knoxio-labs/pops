#if DEBUG && targetEnvironment(simulator)
    import FeaturePairing
    import Foundation

    internal enum SimulatorPairingURL {
        private static let scheme = "pops"
        private static let host = "e2e-pairing"
        private static let payloadQueryItem = "pairing"

        static func handle(_ url: URL, consume: (String) -> Bool) -> Bool {
            guard let payload = pairingPayload(from: url) else { return false }
            return consume(payload)
        }

        private static func pairingPayload(from url: URL) -> String? {
            guard
                let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                components.scheme == scheme,
                components.host == host,
                components.path.isEmpty,
                components.user == nil,
                components.password == nil,
                components.port == nil,
                components.fragment == nil,
                let queryItems = components.queryItems,
                queryItems.count == 1,
                queryItems[0].name == payloadQueryItem,
                let payload = queryItems[0].value,
                PairingLink.parse(payload) != nil
            else { return nil }

            return payload
        }
    }
#endif
