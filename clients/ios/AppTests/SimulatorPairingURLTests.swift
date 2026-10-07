#if DEBUG && targetEnvironment(simulator)
    import Foundation
    import Testing

    @testable import Pops

    @Suite("simulator pairing URL")
    internal struct SimulatorPairingURLTests {
        @Test("a wrapped BFM pairing link reaches the native pairing flow")
        func deliversValidPairingPayload() throws {
            let payload = "https://bfm.example.com/devices/pair?code=SYNTHETIC-PAIR-CODE"
            let url = try #require(simulatorPairingURL(payload))
            var consumedPayload: String?

            let handled = SimulatorPairingURL.handle(url) { value in
                consumedPayload = value
                return true
            }

            #expect(handled)
            #expect(consumedPayload == payload)
        }

        @Test(
            "malformed and non-pairing URLs never reach the native pairing flow",
            arguments: [
                "pops://inventory/item/one",
                "https://bfm.example.com/devices/pair?code=SYNTHETIC-PAIR-CODE",
                "pops://other-pairing?pairing=https%3A%2F%2Fbfm.example.com%2Fdevices%2Fpair%3Fcode%3DSYNTHETIC-PAIR-CODE",
                "pops://e2e-pairing?pairing=https%3A%2F%2Fbfm.example.com%2Fdevices%2Fpair%3Fcode%3DSYNTHETIC-PAIR-CODE&pairing=https%3A%2F%2Fbfm.example.com%2Fdevices%2Fpair%3Fcode%3DSYNTHETIC-PAIR-CODE",
                "pops://e2e-pairing?pairing=https%3A%2F%2Fbfm.example.com%2Fdevices%2Fother%3Fcode%3DSYNTHETIC-PAIR-CODE",
            ])
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

        private func simulatorPairingURL(_ payload: String) -> URL? {
            var components = URLComponents()
            components.scheme = "pops"
            components.host = "e2e-pairing"
            components.queryItems = [URLQueryItem(name: "pairing", value: payload)]
            return components.url
        }
    }
#endif
