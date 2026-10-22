import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Adding and editing documents on the item page")
internal struct InventoryItemDocumentEditingTests {
    private typealias Fixture = DocumentFixture

    private static func model(_ service: InMemoryInventoryDocumentsService)
        -> InventoryItemDocumentsModel
    {
        Fixture.model(service)
    }

    private static func service(
        _ documents: InventoryItemDocuments = Fixture.documents()
    ) -> InMemoryInventoryDocumentsService {
        Fixture.service(documents)
    }

    private static func file(named name: String, bytes: Int) throws -> InventoryPickedDocument {
        let url = try #require(InventoryDocumentStaging.destination(named: name))
        try Data(count: bytes).write(to: url)
        return try InventoryPickedDocument.describe(url)
    }

    @Test("a file over the reported cap is refused before anything is sent")
    func oversize() async throws {
        let service = Self.service()
        let model = Self.model(service)
        await model.load()
        let picked = try Self.file(named: "big.pdf", bytes: 1001)

        #expect(!model.stage(picked))
        #expect(model.staged == nil)
        #expect(model.message?.hasPrefix("Larger than") == true)
        #expect(!FileManager.default.fileExists(atPath: picked.fileURL.path()))
        #expect(await service.writes.isEmpty)
    }

    @Test("a scanned PDF passes the type check")
    func scannedPDF() async throws {
        let model = Self.model(Self.service())
        await model.load()
        let scan = try Self.file(named: "Scan.pdf", bytes: 10)

        #expect(scan.mimeType == "application/pdf")
        #expect(model.stage(scan))
        #expect(model.message == nil)
        model.cancelStaged()
    }

    @Test("a file Paperless does not take is refused")
    func unsupported() async throws {
        let model = Self.model(Self.service())
        await model.load()
        #expect(!model.stage(try Self.file(named: "notes.zip", bytes: 10)))
        #expect(model.message == InventoryDocumentCopy.unsupportedType)
    }

    @Test("an upload shows its pending row at once and streams the staged file")
    func upload() async throws {
        let service = Self.service()
        let model = Self.model(service)
        await model.load()
        let picked = try Self.file(named: "Scan.pdf", bytes: 10)

        await model.attach(picked, kind: .receipt, title: "Till slip")

        #expect(model.state.rows.map(\.title).contains("Till slip"))
        #expect(model.state.hasPending)
        #expect(model.watchGeneration == 1)
        guard case .upload(let sent, let itemId) = await service.writes.first else {
            Issue.record("no upload sent")
            return
        }
        #expect(itemId == "drill")
        #expect(sent.fileURL == picked.fileURL)
        #expect(sent.mimeType == "application/pdf")
        #expect(!FileManager.default.fileExists(atPath: picked.fileURL.path()))
    }

    @Test("an upload started offline is refused with a message and not queued")
    func uploadOffline() async throws {
        let service = Self.service()
        let model = Self.model(service)
        await model.load()
        await service.setFailure(.offline)

        await model.attach(
            try Self.file(named: "Scan.pdf", bytes: 10), kind: .receipt, title: "")

        #expect(model.message == InventoryDocumentCopy.uploadOffline)
        #expect(await service.writes.isEmpty)
        #expect(!model.state.hasPending)
    }

    @Test("a rename sends only the title, a re-type only the kind")
    func editSendsChangedKeyOnly() async {
        let service = Self.service()
        let model = Self.model(service)
        await model.load()

        await model.edit(Fixture.warranty, kind: .warranty, title: "Card")
        await model.edit(Fixture.warranty, kind: .receipt, title: "Warranty card")
        await model.edit(Fixture.warranty, kind: .warranty, title: "Warranty card")

        #expect(
            await service.writes == [
                .update(3, InventoryDocumentEdit(kind: nil, title: "Card")),
                .update(3, InventoryDocumentEdit(kind: .receipt, title: nil)),
            ])
    }

    @Test("a cancelled unlink sends nothing; a confirmed one unlinks")
    func unlinkConfirmation() async {
        let service = Self.service()
        let model = Self.model(service)
        await model.load()

        model.requestUnlink(Fixture.warranty)
        #expect(model.unlinking == Fixture.warranty)
        model.cancelUnlink()
        await model.confirmUnlink()
        #expect(await service.writes.isEmpty)

        model.requestUnlink(Fixture.warranty)
        await model.confirmUnlink()
        #expect(await service.writes == [.unlink(3)])
        #expect(model.state.rows.isEmpty)
    }

    @Test("a refused upload can be dismissed")
    func dismiss() async {
        let service = Self.service(Fixture.documents(failed: [Fixture.failed]))
        let model = Self.model(service)
        await model.load()

        await model.dismiss(Fixture.failed)

        #expect(await service.writes == [.dismiss(9)])
        #expect(!model.state.rows.contains { $0.id == "ingestion-9" })
    }
}
