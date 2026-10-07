#if DEBUG && targetEnvironment(simulator)
    import Foundation
    import Testing

    @testable import Pops

    @Suite("simulator pairing handoff")
    internal struct SimulatorPairingURLTests {
        private let deviceID = "7E817985-CBB4-4466-86C4-B0CE0D1DF50E"
        private let instanceID = "12345-1800000000000-1"
        private let generation = 7
        private let now = Date(timeIntervalSince1970: 1_800_000_000)

        @Test("debug simulator app permits only local networking for the pairing broker")
        func debugSimulatorNetworkingPolicy() throws {
            let info = try #require(Bundle.main.infoDictionary)
            let transportSecurity = try #require(
                info["NSAppTransportSecurity"] as? [String: Any]
            )

            #expect(transportSecurity["NSAllowsLocalNetworking"] as? Bool == true)
            #expect(transportSecurity["NSAllowsArbitraryLoads"] as? Bool != true)
        }

        @Test("a loopback trigger carries only public simulator and broker metadata")
        func handlesValidHandoff() throws {
            let url = try #require(triggerURL())
            var received: SimulatorPairingURL.Handoff?

            let handled = SimulatorPairingURL.handle(url) { handoff in
                received = handoff
                return true
            }

            #expect(handled)
            #expect(received?.brokerURL.absoluteString == "http://127.0.0.1:3011")
            #expect(received?.deviceID == deviceID)
            #expect(received?.instanceID == instanceID)
            #expect(received?.generation == generation)
            #expect(!url.absoluteString.contains("code"))
            #expect(!url.absoluteString.contains("pairing="))
        }

        @Test(
            "malformed, non-loopback and credential-bearing URLs never reach the handoff",
            arguments: [
                "pops://inventory/item/one",
                "https://bfm.example.com/devices/pair?code=SYNTHETIC-PAIR-CODE",
                "pops://other-pairing?broker=http%3A%2F%2F127.0.0.1%3A3011&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&instanceId=12345-1800000000000-1&generation=7",
                "pops://e2e-pairing?broker=https%3A%2F%2F127.0.0.1%3A3011&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&instanceId=12345-1800000000000-1&generation=7",
                "pops://e2e-pairing?broker=http%3A%2F%2Flocalhost%3A3011&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&instanceId=12345-1800000000000-1&generation=7",
                "pops://e2e-pairing?broker=http%3A%2F%2F127.0.0.1%2F&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&instanceId=12345-1800000000000-1&generation=7",
                "pops://e2e-pairing?broker=http%3A%2F%2F127.0.0.1%3A3011&deviceId=bad&instanceId=12345-1800000000000-1&generation=7",
                "pops://e2e-pairing?broker=http%3A%2F%2F127.0.0.1%3A3011&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&instanceId=opaque&generation=7",
                "pops://e2e-pairing?broker=http%3A%2F%2F127.0.0.1%3A3011&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&instanceId=12345-1800000000000-1&generation=0",
                "pops://e2e-pairing?broker=http%3A%2F%2F127.0.0.1%3A3011&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&instanceId=12345-1800000000000-1&generation=7&code=SYNTHETIC-PAIR-CODE",
                "pops://e2e-pairing?broker=http%3A%2F%2F127.0.0.1%3A3011&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&deviceId=7E817985-CBB4-4466-86C4-B0CE0D1DF50E&instanceId=12345-1800000000000-1&generation=7",
            ]
        )
        func rejectsUnrecognizedURL(rawURL: String) throws {
            let url = try #require(URL(string: rawURL))
            var invocationCount = 0

            let handled = SimulatorPairingURL.handle(url) { _ in
                invocationCount += 1
                return true
            }

            #expect(!handled)
            #expect(invocationCount == 0)
        }

        @Test("the claim request carries only the public target metadata")
        func claimsPairingDetailsFromTheLoopbackBody() async throws {
            let handoff = try #require(handoff())
            let responseData = try claimData()
            let response = try httpResponse(status: 200, headers: ["Cache-Control": "no-store"])
            var requestSeen: URLRequest?

            let details = await SimulatorPairingURL.claim(handoff, now: now) { request in
                requestSeen = request
                return (responseData, response)
            }

            #expect(details?.deviceId == deviceID)
            #expect(details?.instanceId == instanceID)
            #expect(details?.generation == generation)
            #expect(details?.pairingBaseUrl == "http://127.0.0.1:3014")
            #expect(details?.code == "7QK4-9M2X-P3ND")
            #expect(requestSeen?.httpMethod == "POST")
            #expect(requestSeen?.url?.absoluteString == "http://127.0.0.1:3011/__e2e/pair/claim")
            let requestBody = try #require(requestSeen?.httpBody)
            let requestText = try #require(String(bytes: requestBody, encoding: .utf8))
            #expect(requestText.contains(deviceID))
            #expect(requestText.contains(instanceID))
            #expect(requestText.contains("\"generation\":\(generation)"))
            #expect(!requestText.contains("7QK4-9M2X-P3ND"))
            #expect(!requestText.contains("/devices/pair"))
        }

        @Test("the claim rejects wrong target, expired details, cacheable responses and redirects")
        func rejectsUnsafeClaimResponses() async throws {
            let handoff = try #require(handoff())
            let validData = try claimData()
            let noStore = try httpResponse(status: 200, headers: ["Cache-Control": "no-store"])
            let cacheable = try httpResponse(status: 200, headers: ["Cache-Control": "private"])
            let redirect = try httpResponse(status: 302, headers: ["Cache-Control": "no-store"])
            let wrongTarget = try claimData(deviceId: "33333333-3333-4333-8333-333333333333")
            let wrongInstance = try claimData(instanceId: "12345-1800000000000-2")
            let wrongGeneration = try claimData(generation: generation + 1)
            let expired = try claimData(expiresAt: "2026-01-01T00:00:00.000Z")
            let unsafeOrigin = try claimData(pairingBaseUrl: "http://bfm.example.com")
            let pathOrigin = try claimData(pairingBaseUrl: "https://bfm.example.com/prefix")

            let invalidResponses = [
                (wrongTarget, noStore),
                (wrongInstance, noStore),
                (wrongGeneration, noStore),
                (expired, noStore),
                (unsafeOrigin, noStore),
                (pathOrigin, noStore),
                (validData, cacheable),
                (validData, redirect),
            ]

            for (data, response) in invalidResponses {
                let result = await SimulatorPairingURL.claim(handoff, now: now) { _ in
                    (data, response)
                }
                #expect(result == nil)
            }
        }

        @Test("claim transport errors do not surface response content")
        func rejectsClaimTransportErrors() async throws {
            let handoff = try #require(handoff())
            let result = await SimulatorPairingURL.claim(handoff, now: now) { _ in
                throw NSError(
                    domain: "synthetic", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "SYNTHETIC-PAIR-CODE"])
            }

            #expect(result == nil)
        }

        private func triggerURL(
            broker: String = "http://127.0.0.1:3011",
            deviceID: String? = nil,
            instanceID: String? = nil,
            generation: Int? = nil
        ) -> URL? {
            var components = URLComponents()
            components.scheme = "pops"
            components.host = "e2e-pairing"
            components.queryItems = [
                URLQueryItem(name: "broker", value: broker),
                URLQueryItem(name: "deviceId", value: deviceID ?? self.deviceID),
                URLQueryItem(name: "instanceId", value: instanceID ?? self.instanceID),
                URLQueryItem(name: "generation", value: String(generation ?? self.generation)),
            ]
            return components.url
        }

        private func handoff() -> SimulatorPairingURL.Handoff? {
            guard let url = triggerURL() else { return nil }
            var handoff: SimulatorPairingURL.Handoff?
            _ = SimulatorPairingURL.handle(url) { value in
                handoff = value
                return true
            }
            return handoff
        }

        private func claimData(
            deviceId: String? = nil,
            instanceId: String? = nil,
            generation: Int? = nil,
            pairingBaseUrl: String = "http://127.0.0.1:3014",
            code: String = "7QK4-9M2X-P3ND",
            expiresAt: String = "2030-01-01T00:00:00.000Z"
        ) throws -> Data {
            try JSONSerialization.data(withJSONObject: [
                "deviceId": deviceId ?? self.deviceID,
                "instanceId": instanceId ?? self.instanceID,
                "generation": generation ?? self.generation,
                "pairingBaseUrl": pairingBaseUrl,
                "code": code,
                "expiresAt": expiresAt,
            ])
        }

        private func httpResponse(
            status: Int,
            headers: [String: String],
            path: String = "/__e2e/pair/claim"
        ) throws -> HTTPURLResponse {
            let url = try #require(URL(string: "http://127.0.0.1:3011\(path)"))
            return try #require(
                HTTPURLResponse(
                    url: url,
                    statusCode: status,
                    httpVersion: "HTTP/1.1",
                    headerFields: ["Content-Type": "application/json"].merging(headers) { _, new in
                        new
                    }
                )
            )
        }
    }
#endif
