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

    @Test("the first untyped photo starts one suggestion request")
    func firstPhotoStartsSuggestion() throws {
        let session = TypePickerSession()

        session.capturePhoto()
        let requestID = try #require(session.photoRequestID)
        session.capturePhoto()

        #expect(session.photoSuggestion == .analysing)
        #expect(session.photoRequestID == requestID)
        #expect(session.photoCount == 2)
    }

    @Test("a selected type prevents photo suggestion requests")
    func selectedTypePreventsSuggestion() {
        let session = TypePickerSession(typeID: "book")

        session.capturePhoto()

        #expect(session.photoSuggestion == .idle)
        #expect(session.photoRequestID == nil)
    }

    @Test("manual selection wins a race with suggestion completion")
    func manualSelectionWinsSuggestionRace() throws {
        let session = TypePickerSession()
        session.capturePhoto()
        let requestID = try #require(session.photoRequestID)

        session.typeID = "book"
        session.completePhotoSuggestion(requestID: requestID, available: true)
        session.typeID = nil

        #expect(session.photoSuggestion == .dismissed)
        #expect(session.photoRequestID == nil)
        #expect(session.typeID == nil)
    }

    @Test("an unavailable suggestion does not prevent saving")
    func unavailableSuggestionDoesNotPreventSaving() throws {
        let session = TypePickerSession(name: "Unknown object")
        session.capturePhoto()
        let requestID = try #require(session.photoRequestID)

        session.completePhotoSuggestion(requestID: requestID, available: false)

        #expect(session.photoSuggestion == .unavailable)
        #expect(session.save())
        #expect(session.saved.count == 1)
    }

    @Test("a stale completion cannot affect a new draft request")
    func staleCompletionAfterReset() throws {
        let session = TypePickerSession()
        session.capturePhoto()
        let staleRequestID = try #require(session.photoRequestID)
        session.resetDraft()
        session.capturePhoto()
        let currentRequestID = try #require(session.photoRequestID)

        session.completePhotoSuggestion(requestID: staleRequestID, available: true)

        #expect(currentRequestID != staleRequestID)
        #expect(session.photoSuggestion == .analysing)
        #expect(session.photoRequestID == currentRequestID)
    }

    @Test("dismissing a suggestion cancels its request")
    func dismissSuggestion() throws {
        let session = TypePickerSession()
        session.capturePhoto()
        let requestID = try #require(session.photoRequestID)

        session.dismissPhotoSuggestion()
        session.completePhotoSuggestion(requestID: requestID, available: true)

        #expect(session.photoSuggestion == .dismissed)
        #expect(session.photoRequestID == nil)
    }

    @Test("removing photos is safe and a new first photo starts a fresh request")
    func removePhotos() throws {
        let session = TypePickerSession()
        session.removeLastPhoto()
        session.capturePhoto()
        let firstRequestID = try #require(session.photoRequestID)
        session.capturePhoto()

        session.removeLastPhoto()
        #expect(session.photoCount == 1)
        #expect(session.photoRequestID == firstRequestID)
        session.removeLastPhoto()
        session.removeLastPhoto()

        #expect(session.photoCount == 0)
        #expect(session.photoSuggestion == .idle)
        #expect(session.photoRequestID == nil)

        session.capturePhoto()
        #expect(session.photoRequestID != firstRequestID)
        #expect(session.photoSuggestion == .analysing)
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
