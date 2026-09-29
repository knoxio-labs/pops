import Testing

@testable import DesignPlayground

@Suite("Type picker session")
@MainActor
internal struct TypePickerSessionTests {
    @Test("blank names do not save or mutate the draft")
    func validation() {
        let session = TypePickerSession(name: " \n ", typeID: "book", photoCount: 1)

        #expect(!session.save())
        #expect(session.saved.isEmpty)
        #expect(session.name == " \n ")
        #expect(session.typeID == "book")
        #expect(session.photoCount == 1)
    }

    @Test("saving clears the draft, keeps the location, and cannot save twice")
    func saveAndReset() throws {
        let session = TypePickerSession(
            name: "  Blue quilt  ", typeID: "quilt", photoCount: 2, location: "Bedroom")

        #expect(session.save())
        let saved = try #require(session.saved.first)
        #expect(saved.name == "Blue quilt")
        #expect(saved.typeID == "quilt")
        #expect(saved.photoCount == 2)
        #expect(saved.location == "Bedroom")
        #expect(session.name.isEmpty)
        #expect(session.typeID == nil)
        #expect(session.photoCount == 0)
        #expect(session.location == "Bedroom")
        #expect(!session.save())
        #expect(session.saved.count == 1)
    }

    @Test("photos belong only to the draft that captured them")
    func photoIsolation() throws {
        let session = TypePickerSession(name: "Cable")
        session.capturePhoto()
        session.capturePhoto()
        #expect(session.save())

        session.name = "Charger"
        session.capturePhoto()
        #expect(session.save())

        #expect(session.saved.map(\.photoCount) == [2, 1])
        #expect(session.photoCount == 0)
    }

    @Test("recent types are unique and newest first")
    func recency() {
        let session = TypePickerSession()

        for typeID in ["book", "cable", "book"] {
            session.name = typeID
            session.typeID = typeID
            #expect(session.save())
        }

        #expect(session.recentTypeIDs == ["book", "cable"])
    }

    @Test("clearing recent types removes the session state")
    func clearRecents() {
        let session = TypePickerSession(recentTypeIDs: ["book", "cable"])

        session.clearRecentTypes()

        #expect(session.recentTypeIDs.isEmpty)
    }

    @Test("starting a related item changes only its type")
    func relatedItem() {
        let session = TypePickerSession(
            name: "Keep me", typeID: "quilt-cover", photoCount: 3, location: "Linen cupboard")

        session.startRelated("cushion-cover")

        #expect(session.typeID == "cushion-cover")
        #expect(session.name == "Keep me")
        #expect(session.photoCount == 3)
        #expect(session.location == "Linen cupboard")
    }

    @Test("resetting a draft keeps saved items and location")
    func resetDraft() {
        let session = TypePickerSession(name: "Book", typeID: "book", photoCount: 1)
        #expect(session.save())
        session.name = "Discarded"
        session.typeID = "cable"
        session.capturePhoto()

        session.resetDraft()

        #expect(session.name.isEmpty)
        #expect(session.typeID == nil)
        #expect(session.photoCount == 0)
        #expect(session.saved.count == 1)
        #expect(session.location == "Living room")
    }
}
