#if DEBUG && targetEnvironment(simulator)
    import Foundation
    import Testing

    @testable import Pops

    @Suite("simulator pairing completion")
    internal struct SimulatorPairingCompletionTests {
        private struct CompletionFields: Decodable, Equatable {
            let deviceId: String
            let instanceId: String
            let generation: Int
            let paired: Bool
        }

        private let deviceID = "7E817985-CBB4-4466-86C4-B0CE0D1DF50E"
        private let instanceID = "12345-1800000000000-1"
        private let generation = 7

        @Test("completion sends only public target metadata after the session is checked")
        func reportsPairingCompletionWithoutPairingMaterial() async throws {
            let handoff = try #require(handoff())
            let response = try httpResponse(status: 204, cacheControl: "no-store")
            var requestSeen: URLRequest?

            let accepted = await SimulatorPairingCompletion.send(handoff, paired: true) { request in
                requestSeen = request
                return (Data(), response)
            }

            #expect(accepted)
            #expect(requestSeen?.httpMethod == "POST")
            #expect(requestSeen?.url?.absoluteString == "http://127.0.0.1:3011/__e2e/pair/complete")
            let requestBody = try #require(requestSeen?.httpBody)
            let requestText = try #require(String(bytes: requestBody, encoding: .utf8))
            let fields = try JSONDecoder().decode(CompletionFields.self, from: requestBody)
            #expect(
                fields
                    == CompletionFields(
                        deviceId: deviceID,
                        instanceId: instanceID,
                        generation: generation,
                        paired: true
                    ))
            #expect(!requestText.contains("7QK4-9M2X-P3ND"))
            #expect(!requestText.contains("\"code\""))
            #expect(!requestText.contains("pairingUrl"))
        }

        @Test("completion rejects cacheable, redirected, mismatched and failed responses")
        func rejectsUnverifiedPairingCompletion() async throws {
            let handoff = try #require(handoff())
            let cacheable = try httpResponse(status: 204, cacheControl: "private")
            let redirect = try httpResponse(status: 302, cacheControl: "no-store")
            let wrongPath = try httpResponse(
                status: 204,
                cacheControl: "no-store",
                path: "/__e2e/pair/claim"
            )
            let results = await [
                SimulatorPairingCompletion.send(handoff, paired: true) { _ in (Data(), cacheable) },
                SimulatorPairingCompletion.send(handoff, paired: true) { _ in (Data(), redirect) },
                SimulatorPairingCompletion.send(handoff, paired: true) { _ in (Data(), wrongPath) },
                SimulatorPairingCompletion.send(handoff, paired: true) { _ in
                    throw NSError(domain: "synthetic", code: 1)
                },
            ]

            #expect(results.allSatisfy { !$0 })
        }

        @Test("pairing completion accepts only the configured BFM origin")
        func checksPairingOrigin() throws {
            let origin = try #require(URL(string: "http://127.0.0.1:3014"))
            let sameOrigin = try #require(URL(string: "http://127.0.0.1:3014/"))
            let otherOrigin = try #require(URL(string: "http://127.0.0.1:3015"))

            #expect(SimulatorPairingURL.hasSameOrigin(origin, sameOrigin))
            #expect(!SimulatorPairingURL.hasSameOrigin(origin, otherOrigin))
        }

        private func handoff() -> SimulatorPairingURL.Handoff? {
            var components = URLComponents()
            components.scheme = "pops"
            components.host = "e2e-pairing"
            components.queryItems = [
                URLQueryItem(name: "broker", value: "http://127.0.0.1:3011"),
                URLQueryItem(name: "deviceId", value: deviceID),
                URLQueryItem(name: "instanceId", value: instanceID),
                URLQueryItem(name: "generation", value: String(generation)),
            ]
            guard let trigger = components.url else { return nil }
            var result: SimulatorPairingURL.Handoff?
            _ = SimulatorPairingURL.handle(trigger) { handoff in
                result = handoff
                return true
            }
            return result
        }

        private func httpResponse(
            status: Int,
            cacheControl: String,
            path: String = "/__e2e/pair/complete"
        ) throws -> HTTPURLResponse {
            let url = try #require(URL(string: "http://127.0.0.1:3011\(path)"))
            return try #require(
                HTTPURLResponse(
                    url: url,
                    statusCode: status,
                    httpVersion: "HTTP/1.1",
                    headerFields: ["Cache-Control": cacheControl]
                )
            )
        }
    }
#endif
