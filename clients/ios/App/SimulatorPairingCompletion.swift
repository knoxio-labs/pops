#if DEBUG && targetEnvironment(simulator)
    import Foundation

    internal enum SimulatorPairingCompletion {
        private struct CompletionRequest: Encodable {
            let deviceId: String
            let instanceId: String
            let generation: Int
            let paired: Bool
        }

        private static let path = "/__e2e/pair/complete"

        internal static func send(
            _ handoff: SimulatorPairingURL.Handoff,
            paired: Bool,
            sendRequest: (URLRequest) async throws -> (Data, URLResponse)
        ) async -> Bool {
            guard let completionRequest = makeRequest(handoff, paired: paired) else { return false }
            do {
                let (data, response) = try await sendRequest(completionRequest)
                return accepts(data, response: response, request: completionRequest)
            } catch {
                return false
            }
        }

        internal static func send(_ handoff: SimulatorPairingURL.Handoff, paired: Bool) async
            -> Bool
        {
            await send(handoff, paired: paired, sendRequest: SimulatorPairingRequest.send)
        }

        private static func makeRequest(
            _ handoff: SimulatorPairingURL.Handoff,
            paired: Bool
        ) -> URLRequest? {
            guard
                let brokerURL = SimulatorPairingURL.brokerURL(for: handoff),
                var components = URLComponents(url: brokerURL, resolvingAgainstBaseURL: false)
            else { return nil }
            components.path = path
            guard let url = components.url else { return nil }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONEncoder().encode(
                CompletionRequest(
                    deviceId: handoff.deviceID,
                    instanceId: handoff.instanceID,
                    generation: handoff.generation,
                    paired: paired
                )
            )
            guard request.httpBody != nil else { return nil }
            return request
        }

        private static func accepts(
            _ data: Data,
            response: URLResponse,
            request: URLRequest
        ) -> Bool {
            guard
                let response = response as? HTTPURLResponse,
                response.url == request.url,
                response.statusCode == 204,
                data.isEmpty
            else { return false }
            return response.value(forHTTPHeaderField: "Cache-Control")?
                .split(separator: ",")
                .contains(where: {
                    $0.trimmingCharacters(in: .whitespaces).lowercased() == "no-store"
                }) == true
        }
    }
#endif
