import Foundation
import Testing

@testable import AppCore

@Suite("Capture source and operation wire contract")
internal struct TripCaptureContractTests {
    @Test("material validation does not trim the captured original or accept empty sources")
    internal func verbatimMaterial() {
        #expect(!TripCaptureInput(originalText: " \n").hasSourceMaterial)
        #expect(!TripCaptureInput(originalText: "", originalUrl: "  ").hasSourceMaterial)
        let input = TripCaptureInput(originalText: "  original\n")
        #expect(input.hasSourceMaterial)
        #expect(input.originalText == "  original\n")
        #expect(TripCaptureInput(attachments: [.task("accepted-task")]).hasSourceMaterial)
        #expect(TripCaptureInput(originalUrl: "https://example.test/source").hasSourceMaterial)
    }

    @Test(
        "persisting an exact submitted operation retains its UUID, original bytes and accepted identities"
    )
    internal func operationRoundTrip() throws {
        let input = TripCaptureInput(
            originalText: "  verbatim\n",
            attachments: [.task("task_1"), .document(id: 12, taskID: "task_2")])
        let operation = TripCaptureCreateOperation(operationID: UUID(), input: input)
        let bytes = try JSONEncoder().encode(operation)
        let restored = try JSONDecoder().decode(TripCaptureCreateOperation.self, from: bytes)
        #expect(restored == operation)
        #expect(restored.command.kind.rawValue == "capture.create")
        #expect(restored.command.input.attachments == input.attachments)
        #expect(restored.command.input.originalText == input.originalText)
    }

    @Test(
        "invented file attachment and unrelated mutation kinds cannot decode as a capture operation"
    )
    internal func rejectInventedIdentity() {
        let attachment = Data(#"{"kind":"file","fileName":"ticket.pdf"}"#.utf8)
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(TripCaptureAttachment.self, from: attachment)
        }
        let command = Data(
            #"""
            {"operationId":"3b5f6780-4111-4111-8111-111111111111",
            "command":{"kind":"capture.remove",
            "input":{"originalText":"text",
            "attachments":[],
            "notes":""}}}
            """#
            .utf8)
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(TripCaptureCreateOperation.self, from: command)
        }
    }
}
