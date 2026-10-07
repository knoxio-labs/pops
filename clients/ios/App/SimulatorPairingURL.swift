#if DEBUG && targetEnvironment(simulator)
    import Foundation

    internal enum SimulatorPairingURL {
        internal struct Handoff: Hashable, Sendable {
            internal let brokerURL: URL
            internal let deviceID: String
            internal let instanceID: String
            internal let generation: Int
        }

        internal struct PairingDetails: Decodable, Equatable, Sendable {
            internal let deviceId: String
            internal let instanceId: String
            internal let generation: Int
            internal let pairingBaseUrl: String
            internal let code: String
            internal let expiresAt: String
        }

        private struct ClaimRequest: Encodable {
            let deviceId: String
            let instanceId: String
            let generation: Int
        }

        private static let scheme = "pops"
        private static let host = "e2e-pairing"
        private static let claimPath = "/__e2e/pair/claim"
        private static let simulatorID =
            #"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$"#
        private static let handoffInstanceID = #"^[0-9]+-[0-9]+-[0-9]+$"#

        internal static func handle(_ url: URL, consume: (Handoff) -> Bool) -> Bool {
            guard let handoff = handoff(from: url) else { return false }
            return consume(handoff)
        }

        internal static func claim(
            _ handoff: Handoff,
            now: Date = Date(),
            send: (URLRequest) async throws -> (Data, URLResponse)
        ) async -> PairingDetails? {
            guard let request = claimRequest(for: handoff) else { return nil }
            do {
                let (data, response) = try await send(request)
                return parseClaim(data, response: response, handoff: handoff, now: now)
            } catch {
                return nil
            }
        }

        internal static func claim(_ handoff: Handoff) async -> PairingDetails? {
            guard let request = claimRequest(for: handoff) else { return nil }
            do {
                let (data, response) = try await SimulatorPairingRequest.send(request)
                return parseClaim(data, response: response, handoff: handoff, now: Date())
            } catch {
                return nil
            }
        }

        internal static func hasSameOrigin(_ lhs: URL, _ rhs: URL) -> Bool {
            guard
                let lhs = pairingBaseURL(lhs.absoluteString),
                let rhs = pairingBaseURL(rhs.absoluteString)
            else { return false }
            return lhs == rhs
        }

        internal static func brokerURL(for handoff: Handoff) -> URL? {
            guard
                isSimulatorID(handoff.deviceID),
                isHandoffInstanceID(handoff.instanceID),
                handoff.generation > 0
            else { return nil }
            return loopbackBrokerURL(handoff.brokerURL.absoluteString)
        }

        private static func handoff(from url: URL) -> Handoff? {
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
                queryItems.count == 4,
                let brokerValue = queryItems.first(where: { $0.name == "broker" })?.value,
                let deviceID = queryItems.first(where: { $0.name == "deviceId" })?.value,
                let instanceID = queryItems.first(where: { $0.name == "instanceId" })?.value,
                let generationValue = queryItems.first(where: { $0.name == "generation" })?.value,
                let generation = Int(generationValue),
                generation > 0,
                Set(queryItems.map(\.name)) == ["broker", "deviceId", "generation", "instanceId"],
                isSimulatorID(deviceID),
                isHandoffInstanceID(instanceID),
                let brokerURL = loopbackBrokerURL(brokerValue)
            else { return nil }

            return Handoff(
                brokerURL: brokerURL,
                deviceID: deviceID,
                instanceID: instanceID,
                generation: generation
            )
        }

        private static func loopbackBrokerURL(_ value: String) -> URL? {
            guard
                let components = URLComponents(string: value),
                components.scheme == "http",
                components.host == "127.0.0.1",
                let port = components.port,
                (1...65_535).contains(port),
                components.path.isEmpty || components.path == "/",
                components.query == nil,
                components.fragment == nil,
                components.user == nil,
                components.password == nil,
                components.url != nil
            else { return nil }

            return URL(string: "http://127.0.0.1:\(port)", relativeTo: nil)
        }

        private static func claimRequest(for handoff: Handoff) -> URLRequest? {
            guard
                let brokerURL = brokerURL(for: handoff),
                var components = URLComponents(url: brokerURL, resolvingAgainstBaseURL: false)
            else { return nil }
            components.path = claimPath
            guard let url = components.url else { return nil }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONEncoder().encode(
                ClaimRequest(
                    deviceId: handoff.deviceID,
                    instanceId: handoff.instanceID,
                    generation: handoff.generation
                )
            )
            guard request.httpBody != nil else { return nil }
            return request
        }

        private static func parseClaim(
            _ data: Data,
            response: URLResponse,
            handoff: Handoff,
            now: Date
        ) -> PairingDetails? {
            guard
                let response = response as? HTTPURLResponse,
                response.statusCode == 200,
                response.mimeType == "application/json",
                response.value(forHTTPHeaderField: "Cache-Control")?
                    .split(separator: ",")
                    .contains(where: {
                        $0.trimmingCharacters(in: .whitespaces).lowercased() == "no-store"
                    }) == true,
                let details = try? JSONDecoder().decode(PairingDetails.self, from: data),
                details.deviceId == handoff.deviceID,
                details.instanceId == handoff.instanceID,
                details.generation == handoff.generation,
                let baseURL = pairingBaseURL(details.pairingBaseUrl),
                !details.code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                details.code.utf16.count <= 64,
                let expiresAt = expirationDate(details.expiresAt),
                expiresAt > now
            else { return nil }

            return PairingDetails(
                deviceId: details.deviceId,
                instanceId: details.instanceId,
                generation: details.generation,
                pairingBaseUrl: baseURL.absoluteString,
                code: details.code,
                expiresAt: details.expiresAt
            )
        }

        private static func pairingBaseURL(_ value: String) -> URL? {
            guard
                let components = URLComponents(string: value),
                ["http", "https"].contains(components.scheme ?? ""),
                let host = components.host,
                !host.isEmpty,
                components.path.isEmpty || components.path == "/",
                components.query == nil,
                components.fragment == nil,
                components.user == nil,
                components.password == nil,
                let url = components.url,
                components.scheme == "https" || host == "127.0.0.1"
            else { return nil }

            return URL(string: url.originString)
        }

        private static func expirationDate(_ value: String) -> Date? {
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: value) { return date }
            let wholeSeconds = ISO8601DateFormatter()
            wholeSeconds.formatOptions = [.withInternetDateTime]
            return wholeSeconds.date(from: value)
        }

        private static func isSimulatorID(_ value: String) -> Bool {
            value.range(of: simulatorID, options: [.regularExpression, .caseInsensitive]) != nil
        }

        private static func isHandoffInstanceID(_ value: String) -> Bool {
            value.range(of: handoffInstanceID, options: .regularExpression) != nil
        }
    }

    extension URL {
        fileprivate var originString: String {
            var components = URLComponents(url: self, resolvingAgainstBaseURL: false)
            components?.path = ""
            components?.query = nil
            components?.fragment = nil
            return components?.string ?? absoluteString
        }
    }

#endif
